/**
 * The one session lifecycle for every engine-backed interaction type (REQ-59).
 *
 * `startSession` / `checkpointSession` / `finishSession` are the ONLY
 * implementations. Per-type HTTP routes either are the practice endpoints or
 * thin delegations pending deletion in plan 13-13.
 *
 * Section-A divergences (REQ-69) are preserved as type-declared properties:
 *   - checkpointing: "client-driven" | "none"
 *   - finishPendingFlip: "request-path" | "runner"
 *   - start shape keyed off instance.required (interview: one Prisma write,
 *     zero S3; case-study: S3 read + Prisma + InteractionLog + compensating
 *     delete + second Prisma write)
 *
 * REQ-72: `finishSession` ALWAYS calls `parseMetricsPayload` — there is no
 * branch that can skip it.
 *
 * Handlers take an authenticated `userId` + parsed body and return plain
 * result objects; routes own auth and NextResponse wrapping.
 */

import { waitUntil } from "@vercel/functions";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { resolveAttemptLanguage } from "@/lib/languages";
import {
  resolveInterviewType,
  resolveCustomizationRecord,
  type InterviewCustomizationInput,
} from "@/lib/interview/customization";
import {
  buildInterviewTranscript,
  normalizeTurns,
} from "@/lib/interview/transcript";
import { initialProgress, type InterviewProgress } from "@/lib/interview/types";
import { parseMetricsPayload, toMetricsJsonInput } from "@/lib/metrics/ingest";
import type { CameraMode } from "@/lib/metrics/types";
import {
  asInputSnapshot,
  type DifficultConversationInputSnapshot,
  type InterviewInputSnapshot,
  type PitchInputSnapshot,
  type ScenarioInputSnapshot,
} from "@/lib/report/snapshot";
import {
  buildDefaultReportTitle,
  normalizeReportTitle,
} from "@/lib/report/title";
import { resolveDifficultConversationInstance } from "@/lib/difficult-conversation/resolve-instance";
import { findSeededConversation } from "@/lib/difficult-conversation/seeded";
import { ratchetHighWaterMark } from "@/lib/pitch/slide-reveal";
import { resolveDeckFairValueBand } from "@/lib/pitch/fair-value-band";
import {
  DIFFICULTY_BANDS,
  type DifficultyBand,
} from "@/lib/difficult-conversation/types";
import { buildNetworkingStartSnapshot } from "@/lib/networking/start-snapshot";
import type { InteractionLog } from "@/types";

import { runAndPersistEvaluation } from "./evaluation-runner";
import { validateOutcome } from "./outcome";
import { getEngineType } from "./registry";
import { resolveSessionConfig } from "./resolve";
import { resolveTermination } from "./termination";
import {
  computeDisengagementOverTranscript,
  type DisengagementComputeResult,
} from "./disengagement";
import { verifyWalkOutProof } from "./walk-out-proof";
import { clampAdjustableBudget } from "./time-budget";
import type {
  DifficultConversationInstance,
  InstanceConfig,
  TimeBudgetConfig,
} from "./types";

type SlideRevealEvent = {
  index: number;
  atTurnIndex: number;
  atElapsedSeconds: number;
};

/**
 * Persist the clamped budget, or null when the type declares no budget.
 * The student PROPOSES/adjusts; the server CLAMPS — a client cannot request
 * a 4-hour investor meeting.
 */
function resolvePersistedBudget(
  config: TimeBudgetConfig,
  timeBudgetOverrideSeconds: unknown,
): number | null {
  const hasBudget =
    config.totalSeconds != null || config.adjustableRangeSeconds != null;
  if (!hasBudget) return null;

  const override =
    typeof timeBudgetOverrideSeconds === "number" &&
    Number.isFinite(timeBudgetOverrideSeconds)
      ? timeBudgetOverrideSeconds
      : (config.totalSeconds ?? 0);

  return clampAdjustableBudget(config, override).seconds;
}

/** Build a PitchInputSnapshot from a pitch instance when one is supplied. */
function pitchSnapshotFromInstance(
  instance: InstanceConfig,
  budgetSeconds: number | null,
): PitchInputSnapshot | null {
  if (instance.kind === "pitch-elevator") {
    return {
      kind: "pitch",
      pitchKind: "elevator",
      pitchSubject: instance.pitchSubject,
      listenerKnowledge: instance.listenerKnowledge,
      deckId: null,
      slideCount: null,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: 60,
      budgetSeconds,
      listenerPersona: null,
    };
  }
  if (instance.kind === "pitch-deck") {
    return {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: instance.deckId,
      slideCount: instance.slideCount,
      askPriceUsd: instance.askPriceUsd ?? null,
      askEquityPct: instance.askEquityPct ?? null,
      fairValueBand: instance.fairValueBand ?? null,
      firstTurnWindowSeconds: null,
      budgetSeconds,
      listenerPersona: null,
      deckModeInputs: instance.modeInputs ?? null,
    };
  }
  return null;
}

function isPitchDeckSnapshot(
  snapshot: unknown,
): snapshot is PitchInputSnapshot & { pitchKind: "deck"; slideCount: number } {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as PitchInputSnapshot;
  return (
    s.kind === "pitch" &&
    s.pitchKind === "deck" &&
    typeof s.slideCount === "number" &&
    Number.isFinite(s.slideCount) &&
    s.slideCount > 0
  );
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_RESUME_TEXT_LENGTH = 60000;
const MAX_NAME_LENGTH = 200;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function isValidProgress(value: unknown): value is InterviewProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.stage === "string" &&
    typeof candidate.questionsAsked === "number" &&
    Array.isArray(candidate.categoriesCovered) &&
    Array.isArray(candidate.dodgedCategories) &&
    typeof candidate.followUpsUsed === "number"
  );
}

function deriveFinishDisengagement({
  turns,
  elapsedSeconds,
  budgetSeconds,
  threshold,
}: {
  turns: Array<{ role: string; content: string }>;
  /** Server-stamped walk-out clock, never request handling wall-clock. */
  elapsedSeconds: number;
  budgetSeconds: number | null;
  threshold: number | null | undefined;
}): DisengagementComputeResult {
  const assistantTurnCount = turns.filter(
    (turn) => turn.role === "assistant",
  ).length;

  // Replays the transcript so the recorded value matches the ratcheted value
  // the chat route streamed, rather than a from-scratch final-turn snapshot.
  return computeDisengagementOverTranscript({
    transcript: turns,
    elapsedSeconds: Math.max(0, Math.trunc(elapsedSeconds)),
    budgetSeconds,
    assistantTurnCount,
    threshold,
  });
}

function declaredOutcomeFields(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const { disengagementDecline: _engineOwned, ...declared } = value as Record<
    string,
    unknown
  >;
  return declared;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type SessionFailure = {
  ok: false;
  status: number;
  error: string;
  /** Present on double-submit so the client can still navigate to the report. */
  reportId?: string;
  /** Report row status when conflict (IN_PROGRESS / PENDING / READY / FAILED). */
  reportStatus?: string;
};

export type StartSessionSuccess = {
  ok: true;
  reportId: string;
  cameraMode: CameraMode;
  /** Present only for case-study — the S3 InteractionLog the client keeps writing. */
  log?: InteractionLog;
  /**
   * Server-clamped session budget in seconds (null when the type has none).
   * Pitch-deck timer displays this, not the wizard's requested value (14-13).
   */
  timeBudgetSeconds?: number | null;
};

export type CheckpointSessionSuccess = {
  ok: true;
  turnCount: number;
};

export type FinishSessionSuccess = {
  ok: true;
  accepted: true;
  reportId: string;
  /** Interview finish historically returned this; scenario did not. */
  pendingStatus?: "PENDING";
};

export type StartSessionResult = StartSessionSuccess | SessionFailure;
export type CheckpointSessionResult = CheckpointSessionSuccess | SessionFailure;
export type FinishSessionResult = FinishSessionSuccess | SessionFailure;

// ---------------------------------------------------------------------------
// Camera consent — one copy for every type (non-negotiable 6)
// ---------------------------------------------------------------------------

async function resolveCameraMode(
  userId: string,
  rawCameraMode: unknown,
): Promise<{ cameraMode: CameraMode; consentAt: Date | null }> {
  let cameraMode: CameraMode =
    rawCameraMode === "ON" || rawCameraMode === "OFF" ? rawCameraMode : "OFF";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { videoAnalysisConsentAt: true },
  });
  const consentAt = user?.videoAnalysisConsentAt ?? null;

  if (cameraMode === "ON" && !consentAt) {
    console.info("Engine session start: forcing camera OFF (no consent)", {
      userId,
    });
    cameraMode = "OFF";
  }

  return { cameraMode, consentAt };
}


function isDifficultyBand(value: unknown): value is DifficultyBand {
  return (
    typeof value === "string" &&
    (DIFFICULTY_BANDS as readonly string[]).includes(value)
  );
}

function difficultConversationSnapshotFromInstance(
  instance: DifficultConversationInstance,
  conversationTitle: string,
): DifficultConversationInputSnapshot {
  return {
    kind: "difficult-conversation",
    conversationId: instance.conversationId,
    conversationTitle,
    source: instance.source,
    role: instance.role,
    studentRole: instance.studentRole,
    situation: instance.situation,
    sharedBackstory: instance.sharedBackstory,
    studentObjective: instance.studentObjective,
    stakes: instance.stakes,
    difficulty: instance.difficulty,
    avatarId: instance.avatarId,
  };
}

// ---------------------------------------------------------------------------
// startSession
// ---------------------------------------------------------------------------

export async function startSession({
  userId,
  userEmail,
  userName,
  typeSlug,
  instanceId,
  instance: rawInstance,
  customization,
  cameraModeRequest,
  interviewerAvatarId: rawInterviewerAvatarId,
  interviewerName: rawInterviewerName,
  resumeId: rawResumeId,
  resumeText: rawResumeText,
  language,
  timeBudgetOverrideSeconds,
  difficulty: rawDifficulty,
}: {
  userId: string;
  userEmail: string;
  userName?: string | null;
  typeSlug: string;
  instanceId?: string | null;
  /** Wizard-authored instance (pitch-elevator / pitch-deck). */
  instance?: InstanceConfig | null;
  customization?: InterviewCustomizationInput | null;
  cameraModeRequest?: unknown;
  interviewerAvatarId?: unknown;
  interviewerName?: unknown;
  resumeId?: unknown;
  resumeText?: unknown;
  language?: unknown;
  /** Student-proposed session length in seconds; server clamps. */
  timeBudgetOverrideSeconds?: unknown;
  /** Difficult-conversation wizard band override (15-08). */
  difficulty?: unknown;
}): Promise<StartSessionResult> {
  const type = getEngineType(typeSlug);
  if (!type) {
    return { ok: false, status: 400, error: "Unknown interaction type" };
  }

  const { cameraMode, consentAt } = await resolveCameraMode(
    userId,
    cameraModeRequest,
  );

  // ---- Networking: ONE Prisma write, ZERO S3 writes; NetworkingInputSnapshot
  //      (evaluator-only private goal). Must run before the interview
  //      fallthrough — networking also declares instance.required: false.
  //      Snapshot assembly lives in lib/networking/ so lib/engine/ never
  //      names a goal field (16-09 grep backstop). ----
  if (type.slug === "networking") {
    const built = await buildNetworkingStartSnapshot({
      userId,
      instanceId,
      customization,
      interviewerAvatarId:
        typeof rawInterviewerAvatarId === "string"
          ? truncate(rawInterviewerAvatarId, MAX_NAME_LENGTH)
          : null,
    });
    if (!built.ok) {
      return { ok: false, status: built.status, error: built.error };
    }

    const resolved = resolveSessionConfig(typeSlug, {
      instance: built.resolveInstance,
    });
    if (!resolved.ok) {
      return { ok: false, status: 400, error: resolved.reason };
    }

    const timeBudgetSeconds = resolvePersistedBudget(
      resolved.config.timeBudget,
      timeBudgetOverrideSeconds,
    );
    const inputSnapshot = {
      ...built.snapshot,
      budgetSeconds: timeBudgetSeconds,
    };

    const report = await prisma.interactionReport.create({
      data: {
        userId,
        typeSlug: type.slug,
        status: "IN_PROGRESS",
        cameraMode,
        metricsConsentAt: consentAt,
        inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
        timeBudgetSeconds,
      },
      select: { id: true },
    });

    console.info("Engine networking report created", {
      userId,
      reportId: report.id,
      typeSlug: type.slug,
      cameraMode,
      personaSource: inputSnapshot.personaSource,
    });

    return { ok: true, reportId: report.id, cameraMode };
  }

  // ---- Interview presets: ONE Prisma write, ZERO S3 writes ----
  if (!type.instance.required) {
    const resolved = resolveSessionConfig(typeSlug, {
      customization: customization ?? undefined,
    });
    if (!resolved.ok) {
      return { ok: false, status: 400, error: resolved.reason };
    }

    const timeBudgetSeconds = resolvePersistedBudget(
      resolved.config.timeBudget,
      timeBudgetOverrideSeconds,
    );

    // Re-resolve through the legacy validator so the snapshot matches what
    // the live prompt used — even when the client sent garbage that fell
    // back to preset defaults.
    const interviewType = resolveInterviewType(
      typeSlug,
      customization ?? undefined,
    );
    if (!interviewType) {
      return { ok: false, status: 400, error: "Unknown interview type" };
    }
    const customizationRecord = resolveCustomizationRecord(interviewType);

    const interviewerAvatarId =
      typeof rawInterviewerAvatarId === "string"
        ? truncate(rawInterviewerAvatarId, MAX_NAME_LENGTH)
        : null;
    const interviewerName =
      typeof rawInterviewerName === "string"
        ? truncate(rawInterviewerName, MAX_NAME_LENGTH)
        : null;
    const resumeId =
      typeof rawResumeId === "string" && UUID_V4_REGEX.test(rawResumeId)
        ? rawResumeId
        : null;
    const resumeText =
      typeof rawResumeText === "string"
        ? truncate(rawResumeText, MAX_RESUME_TEXT_LENGTH)
        : null;

    const inputSnapshot: InterviewInputSnapshot = {
      kind: "interview",
      interviewerAvatarId,
      interviewerName,
      resumeId,
      resumeText,
      industry: customizationRecord.industry,
      roleTitle: customizationRecord.roleTitle,
      difficulty: customizationRecord.difficulty,
      targetMinutes: customizationRecord.targetMinutes,
      targetQuestionCount: customizationRecord.targetQuestionCount,
      interviewerPersona: customizationRecord.interviewerPersona,
    };

    const report = await prisma.interactionReport.create({
      data: {
        userId,
        typeSlug: type.slug,
        status: "IN_PROGRESS",
        cameraMode,
        metricsConsentAt: consentAt,
        inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
        // slideHighWaterMark stays null — null means nothing revealed yet
        // (same meaning for a no-deck type and a deck session not yet started).
        timeBudgetSeconds,
      },
      select: { id: true },
    });

    console.info("Engine interview report created", {
      userId,
      reportId: report.id,
      typeSlug: type.slug,
      cameraMode,
    });

    return { ok: true, reportId: report.id, cameraMode };
  }

  // ---- Wizard-authored types (pitch-elevator / pitch-deck): ONE Prisma
  //      write, ZERO S3 — same write shape as interview, distinct from
  //      case-study's S3 InteractionLog path. Needed so pitch types with
  //      instance.required + authoredInWizard do not fall into case-study. ----
  if (type.instance.authoredInWizard) {
    // pitch-deck: fairValueBand is server-only. Always overwrite (or inject)
    // so a client-supplied band cannot let a student negotiate against a
    // band they chose (14-12). Ask-independent constant — see
    // lib/pitch/fair-value-band.ts. All five deck modes share this `kind`
    // (Phase 19); only the negotiating mode gets a band — for every other
    // mode, strip any client-supplied band/ask/equity entirely (the server,
    // not the client, decides whether terms exist).
    let wizardInstance = rawInstance ?? undefined;
    if (wizardInstance?.kind === "pitch-deck") {
      const band = resolveDeckFairValueBand(typeSlug, {
        slideCount: wizardInstance.slideCount,
      });
      if (band) {
        wizardInstance = { ...wizardInstance, fairValueBand: band };
      } else {
        const {
          fairValueBand: _band,
          askPriceUsd: _ask,
          askEquityPct: _equity,
          ...rest
        } = wizardInstance;
        wizardInstance = rest;
      }
    }

    const resolved = resolveSessionConfig(typeSlug, {
      instance: wizardInstance,
    });
    if (!resolved.ok) {
      return { ok: false, status: 400, error: resolved.reason };
    }

    const timeBudgetSeconds = resolvePersistedBudget(
      resolved.config.timeBudget,
      timeBudgetOverrideSeconds,
    );

    const pitchSnapshot = pitchSnapshotFromInstance(
      resolved.config.instance,
      timeBudgetSeconds,
    );

    const report = await prisma.interactionReport.create({
      data: {
        userId,
        typeSlug: type.slug,
        status: "IN_PROGRESS",
        cameraMode,
        metricsConsentAt: consentAt,
        inputSnapshot: pitchSnapshot
          ? (pitchSnapshot as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        timeBudgetSeconds,
      },
      select: { id: true },
    });

    console.info("Engine wizard-authored report created", {
      userId,
      reportId: report.id,
      typeSlug: type.slug,
      cameraMode,
      timeBudgetSeconds,
    });

    return { ok: true, reportId: report.id, cameraMode, timeBudgetSeconds };
  }


  // ---- difficult-conversation: seeded-first resolve → Prisma snapshot
  //      (no InteractionLog). Must run before the case-study fallthrough. ----
  if (type.slug === "difficult-conversation") {
    const conversationId =
      typeof instanceId === "string" && instanceId.trim()
        ? instanceId.trim()
        : null;
    if (!conversationId) {
      return { ok: false, status: 404, error: "Conversation not found" };
    }

    let dcInstance = await resolveDifficultConversationInstance(conversationId);
    if (!dcInstance) {
      return { ok: false, status: 404, error: "Conversation not found" };
    }

    if (isDifficultyBand(rawDifficulty)) {
      dcInstance = { ...dcInstance, difficulty: rawDifficulty };
    }

    const seeded = findSeededConversation(conversationId);
    let conversationTitle = seeded?.title ?? "";
    if (!conversationTitle) {
      const situation = dcInstance.situation;
      conversationTitle =
        situation.length > 80
          ? situation.slice(0, 77).trimEnd() + "…"
          : situation;
    }

    const resolved = resolveSessionConfig(typeSlug, { instance: dcInstance });
    if (!resolved.ok) {
      return { ok: false, status: 400, error: resolved.reason };
    }

    const timeBudgetSeconds = resolvePersistedBudget(
      resolved.config.timeBudget,
      timeBudgetOverrideSeconds,
    );

    const inputSnapshot = difficultConversationSnapshotFromInstance(
      dcInstance,
      conversationTitle,
    );

    const report = await prisma.interactionReport.create({
      data: {
        userId,
        typeSlug: type.slug,
        status: "IN_PROGRESS",
        cameraMode,
        metricsConsentAt: consentAt,
        inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
        timeBudgetSeconds,
      },
      select: { id: true },
    });

    console.info("Engine difficult-conversation report created", {
      userId,
      reportId: report.id,
      typeSlug: type.slug,
      conversationId,
      cameraMode,
    });

    return { ok: true, reportId: report.id, cameraMode };
  }

  // ---- case-study: S3 read → playability → Prisma → InteractionLog →
  //      compensating delete on S3 failure → second Prisma write ----
  const caseId =
    typeof instanceId === "string" && instanceId ? instanceId : null;
  if (!caseId) {
    return { ok: false, status: 404, error: "Scenario not found" };
  }

  const scenario = await s3Storage.getCase(caseId);

  // Playable-scenario access, enforced server-side (identical to today's
  // scenario start): own OR published; admin-authored (no ownerId) never
  // playable here. Every miss returns the identical 404.
  const isPlayable =
    !!scenario &&
    !!scenario.ownerId &&
    (scenario.ownerId === userId || scenario.published === true);

  if (!scenario || !isPlayable) {
    return { ok: false, status: 404, error: "Scenario not found" };
  }

  const inputSnapshot: ScenarioInputSnapshot = {
    kind: "scenario",
    caseId,
    caseName: scenario.name,
    background: scenario.backgroundInfo,
    avatars: scenario.avatars as unknown[],
    criteria: scenario.evaluationPrompt ?? null,
  };

  const timeBudgetSeconds = resolvePersistedBudget(
    type.timeBudget,
    timeBudgetOverrideSeconds,
  );

  const report = await prisma.interactionReport.create({
    data: {
      userId,
      typeSlug: type.slug,
      status: "IN_PROGRESS",
      cameraMode,
      metricsConsentAt: consentAt,
      inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
      timeBudgetSeconds,
    },
    select: { id: true },
  });

  const now = Date.now();
  const logId = `${now}_${Math.random().toString(36).substring(2, 9)}`;

  const log: InteractionLog = {
    id: logId,
    studentEmail: userEmail.toLowerCase(),
    studentName: userName || userEmail.split("@")[0],
    caseId,
    caseName: scenario.name,
    cohortId: "",
    attemptNumber: await s3Storage.getNextAttemptNumber(
      userEmail.toLowerCase(),
      caseId,
    ),
    mode: "assessed",
    language: resolveAttemptLanguage(
      typeof language === "string" ? language : undefined,
    ).code,
    status: "in_progress",
    roleInteractions: {},
    events: [
      {
        type: "start_session",
        timestamp: now,
      },
    ],
    startedAt: now,
    lastSavedAt: now,
    totalMessages: 0,
    totalTimeSeconds: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  try {
    await s3Storage.saveInteractionLog(log);
  } catch (error) {
    // Phase 6 no-orphan-row discipline — preserve exactly.
    console.error("Engine scenario start: interaction log save failed", error);
    await prisma.interactionReport
      .delete({ where: { id: report.id } })
      .catch(() => {});
    return {
      ok: false,
      status: 500,
      error: "We could not start the scenario. Please try again.",
    };
  }

  await prisma.interactionReport.update({
    where: { id: report.id },
    data: {
      interactionLogId: log.id,
      studentEmail: userEmail.toLowerCase(),
    },
  });

  console.info("Engine scenario report created", {
    userId,
    reportId: report.id,
    caseId,
    cameraMode,
  });

  return { ok: true, reportId: report.id, cameraMode, log };
}

// ---------------------------------------------------------------------------
// checkpointSession
// ---------------------------------------------------------------------------

/**
 * Mid-session durable write. `revealedSlideIndex` is an INPUT to a server-
 * side ratchet, never a stored value (14-RESEARCH.md Pitfall 2 — a client-
 * trusted cursor is a context-leak vector). Persisted mark is always
 * `max(stored ?? -1, min(requested, slideCount - 1))`.
 */
export async function checkpointSession({
  userId,
  reportId,
  turns: rawTurns,
  progress: rawProgress,
  revealedSlideIndex,
}: {
  userId: string;
  reportId: string;
  turns: unknown;
  progress?: unknown;
  revealedSlideIndex?: unknown;
}): Promise<CheckpointSessionResult> {
  if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) {
    return { ok: false, status: 400, error: "Invalid reportId" };
  }

  const report = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
    select: {
      id: true,
      status: true,
      typeSlug: true,
      startedAt: true,
      inputSnapshot: true,
      slideHighWaterMark: true,
      slideReveals: true,
    },
  });

  if (!report) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const type = getEngineType(report.typeSlug);
  if (!type || type.checkpointing === "none") {
    return {
      ok: false,
      status: 400,
      error: `Interaction type "${report.typeSlug}" does not support checkpointing.`,
    };
  }

  if (report.status !== "IN_PROGRESS") {
    return {
      ok: false,
      status: 409,
      error: "This interview has already been submitted.",
      reportId: report.id,
      reportStatus: report.status,
    };
  }

  const turns = normalizeTurns(rawTurns);
  if (turns.length === 0) {
    return { ok: false, status: 400, error: "No turns provided" };
  }

  const progress = isValidProgress(rawProgress)
    ? rawProgress
    : initialProgress();

  const snapshot = report.inputSnapshot as InterviewInputSnapshot | null;
  const interviewerAvatarId =
    snapshot && snapshot.kind === "interview"
      ? snapshot.interviewerAvatarId
      : null;
  const interviewerName =
    snapshot && snapshot.kind === "interview" ? snapshot.interviewerName : null;

  const transcript = buildInterviewTranscript({
    reportId: report.id,
    userId,
    typeSlug: report.typeSlug,
    interviewer: {
      avatarId: interviewerAvatarId,
      name: interviewerName,
    },
    startedAt: report.startedAt.getTime(),
    turns,
    progress,
  });

  const key = await s3Storage.saveInterviewTranscript(
    userId,
    report.id,
    transcript,
  );

  // Ratchet: only for pitch-deck snapshots. Interview / elevator / other
  // clients sending revealedSlideIndex cannot create a cursor.
  const updateData: {
    turnCount: number;
    transcriptKey: string;
    slideHighWaterMark?: number;
    slideReveals?: Prisma.InputJsonValue;
  } = { turnCount: turns.length, transcriptKey: key };

  if (isPitchDeckSnapshot(report.inputSnapshot)) {
    const slideCount = report.inputSnapshot.slideCount;
    const stored = report.slideHighWaterMark;
    // Single ratchet in the repo — lib/pitch/slide-reveal.ts (14-11).
    const { mark, advanced } = ratchetHighWaterMark({
      stored,
      requested: revealedSlideIndex,
      slideCount,
    });

    if (mark !== null) {
      updateData.slideHighWaterMark = mark;

      if (advanced) {
        const prior: SlideRevealEvent[] = Array.isArray(report.slideReveals)
          ? (report.slideReveals as SlideRevealEvent[])
          : [];
        const event: SlideRevealEvent = {
          index: mark,
          atTurnIndex: turns.length,
          atElapsedSeconds: Math.round(
            (Date.now() - report.startedAt.getTime()) / 1000,
          ),
        };
        updateData.slideReveals = [
          ...prior,
          event,
        ] as unknown as Prisma.InputJsonValue;
      }
    }
  }

  await prisma.interactionReport.update({
    where: { id: report.id },
    data: updateData,
  });

  return { ok: true, turnCount: turns.length };
}

// ---------------------------------------------------------------------------
// finishSession
// ---------------------------------------------------------------------------

export async function finishSession({
  userId,
  userEmail,
  reportId,
  turns: rawTurns,
  progress: rawProgress,
  metricsPayload,
  log: rawLog,
  terminationReason,
  terminationSource,
  terminationAtSeconds: rawTerminationAtSeconds,
  outcome: rawOutcome,
  walkOutProof: rawWalkOutProof,
  title: rawTitle,
}: {
  userId: string;
  userEmail: string;
  reportId: string;
  turns?: unknown;
  progress?: unknown;
  metricsPayload?: unknown;
  log?: unknown;
  terminationReason?: string | null;
  terminationSource?: "student" | "avatar";
  /** Elapsed seconds when an avatar-initiated end was accepted. */
  terminationAtSeconds?: unknown;
  outcome?: unknown;
  /** Short-lived signed server proof of an accepted threshold crossing. */
  walkOutProof?: unknown;
  /** Optional student-chosen My Reports title. */
  title?: unknown;
}): Promise<FinishSessionResult> {
  if (typeof reportId !== "string" || !reportId) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  // Interview uses UUID validation; scenario accepts any non-empty string id.
  // InteractionReport ids are always UUIDs — validate when it looks like one
  // was intended (interview path) but do not 400 a valid uuid-shaped id.
  const report = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
  });

  if (!report) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (report.status !== "IN_PROGRESS") {
    return {
      ok: false,
      status: 409,
      error: "This session has already been submitted.",
      reportId: report.id,
      reportStatus: report.status,
    };
  }

  const type = getEngineType(report.typeSlug);
  if (!type) {
    return {
      ok: false,
      status: 500,
      error: "Unknown interaction type on report.",
    };
  }

  // ---- terminationReason + outcome (REQ-62 / REQ-64) ----
  // A signed proof authorizes a walk-out record, but never supplies the value
  // persisted or passed to termination policy. Re-derive that from the
  // submitted transcript at the server-stamped proof clock.
  const normalizedTurns = normalizeTurns(rawTurns);
  const assistantTurnCount = normalizedTurns.filter(
    (turn) => turn.role === "assistant",
  ).length;
  const serverElapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - report.startedAt.getTime()) / 1000),
  );
  const normalizedTerminationAtSeconds =
    typeof rawTerminationAtSeconds === "number" &&
    Number.isFinite(rawTerminationAtSeconds)
      ? Math.min(
          serverElapsedSeconds,
          Math.max(0, Math.trunc(rawTerminationAtSeconds)),
        )
      : null;
  const walkOutProof = await verifyWalkOutProof({
    token: rawWalkOutProof,
    userId,
    reportId: report.id,
  });
  const proofMatchesTranscript =
    walkOutProof !== null &&
    walkOutProof.assistantTurnCount <= assistantTurnCount;
  const derivedDisengagement = deriveFinishDisengagement({
    turns: normalizedTurns,
    elapsedSeconds:
      walkOutProof?.elapsedSeconds ??
      normalizedTerminationAtSeconds ??
      serverElapsedSeconds,
    budgetSeconds: report.timeBudgetSeconds,
    threshold: type.terminationPolicy.disengagementThreshold,
  });
  const source = terminationSource ?? "student";
  const needsWalkOutProof =
    source === "avatar" &&
    type.terminationPolicy.disengagementThreshold != null;
  const termination = resolveTermination({
    policy: type.terminationPolicy,
    source,
    reason: terminationReason ?? null,
    assistantTurnCount,
    disengagementValue:
      needsWalkOutProof && !proofMatchesTranscript
        ? undefined
        : derivedDisengagement.value,
  });
  // Rejected terminations write both reason and timecode as null (13-07).
  const recordedTerminationReason = termination.ok
    ? termination.recordedReason
    : null;
  const recordedTerminationAtSeconds =
    termination.ok
      ? walkOutProof?.elapsedSeconds ?? normalizedTerminationAtSeconds
      : null;

  let recordedOutcome: Record<string, unknown> | null = null;
  // `disengagementDecline` is engine-owned operational evidence, never a
  // type-declared learner outcome. Remove a forged copy but still retain valid
  // ordinary outcome fields such as a pitch's negotiated terms.
  const declaredOutcome = declaredOutcomeFields(rawOutcome);
  if (declaredOutcome) {
    const validated = validateOutcome(type.outcome, declaredOutcome);
    recordedOutcome = validated.ok ? validated.outcome : null;
  }

  if (
    source === "avatar" &&
    termination.ok &&
    type.terminationPolicy.disengagementThreshold != null &&
    proofMatchesTranscript
  ) {
    recordedOutcome = {
      ...(recordedOutcome ?? {}),
      disengagementDecline: {
        value: derivedDisengagement.value,
        episodes: derivedDisengagement.episodes,
      },
    };
  }

  const snapshot = asInputSnapshot(report.inputSnapshot);
  const resolvedTitle =
    normalizeReportTitle(rawTitle) ??
    buildDefaultReportTitle({
      typeSlug: report.typeSlug,
      input: snapshot,
      when: new Date(),
    });

  // ---- REQ-72: metrics parsing is UNCONDITIONAL — no type can skip it ----
  const { visual: visualMetrics, vocal: vocalMetrics } =
    parseMetricsPayload(metricsPayload);

  // ---- Interview finish shape (finishPendingFlip: "request-path") ----
  if (type.finishPendingFlip === "request-path") {
    const turns = normalizedTurns;
    if (turns.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "There is no interview transcript to evaluate.",
      };
    }

    const progress = isValidProgress(rawProgress)
      ? rawProgress
      : initialProgress();

    const snapshot = report.inputSnapshot as InterviewInputSnapshot | null;
    const interviewerAvatarId =
      snapshot && snapshot.kind === "interview"
        ? snapshot.interviewerAvatarId
        : null;
    const interviewerName =
      snapshot && snapshot.kind === "interview"
        ? snapshot.interviewerName
        : null;

    const transcript = buildInterviewTranscript({
      reportId: report.id,
      userId,
      typeSlug: report.typeSlug,
      interviewer: {
        avatarId: interviewerAvatarId,
        name: interviewerName,
      },
      startedAt: report.startedAt.getTime(),
      turns,
      progress,
    });

    let transcriptKey: string;
    try {
      transcriptKey = await s3Storage.saveInterviewTranscript(
        userId,
        report.id,
        transcript,
      );
    } catch (error) {
      console.error("Engine interview finish: transcript save failed", error);
      return {
        ok: false,
        status: 502,
        error: "We could not save your interview. Please try again.",
      };
    }

    await prisma.interactionReport.update({
      where: { id: report.id },
      data: {
        status: "PENDING",
        transcriptKey,
        turnCount: turns.length,
        failureReason: null,
        title: resolvedTitle,
        visualMetrics: toMetricsJsonInput(visualMetrics),
        vocalMetrics: toMetricsJsonInput(vocalMetrics),
        terminationReason: recordedTerminationReason,
        terminationAtSeconds: recordedTerminationAtSeconds,
        outcome:
          recordedOutcome === null
            ? Prisma.DbNull
            : (recordedOutcome as Prisma.InputJsonValue),
      },
    });

    waitUntil(runAndPersistEvaluation({ reportId: report.id }));

    return {
      ok: true,
      accepted: true,
      reportId: report.id,
      pendingStatus: "PENDING",
    };
  }

  // ---- Scenario finish shape (finishPendingFlip: "runner") ----
  // Does NOT flip status here. Awaits metrics write BEFORE waitUntil so the
  // runner's own row read always sees them.
  if (!rawLog || typeof rawLog !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Missing required interaction log data",
    };
  }

  const log = rawLog as InteractionLog;
  if (!log.id || !log.caseId) {
    return {
      ok: false,
      status: 400,
      error: "Missing required interaction log data",
    };
  }

  log.studentEmail = userEmail.toLowerCase();

  const now = Date.now();
  log.events.push({
    type: "end_session",
    timestamp: now,
  });
  log.status = "completed";
  log.completedAt = now;
  log.lastSavedAt = now;
  log.totalTimeSeconds = Math.round((now - log.startedAt) / 1000);
  log.updatedAt = new Date(now).toISOString();

  let totalMessages = 0;
  for (const roleInteraction of Object.values(log.roleInteractions)) {
    totalMessages += roleInteraction.messages.length;
  }
  log.totalMessages = totalMessages;

  try {
    await s3Storage.saveInteractionLog(log);
  } catch (error) {
    console.error("Engine scenario finish: interaction log save failed", error);
    return {
      ok: false,
      status: 502,
      error: "We could not save your run. Please try again.",
    };
  }

  await prisma.interactionReport.update({
    where: { id: report.id },
    data: {
      title: resolvedTitle,
      visualMetrics: toMetricsJsonInput(visualMetrics),
      vocalMetrics: toMetricsJsonInput(vocalMetrics),
      terminationReason: recordedTerminationReason,
      terminationAtSeconds: recordedTerminationAtSeconds,
      outcome:
        recordedOutcome === null
          ? Prisma.DbNull
          : (recordedOutcome as Prisma.InputJsonValue),
    },
  });

  waitUntil(runAndPersistEvaluation({ reportId: report.id }));

  return { ok: true, accepted: true, reportId: report.id };
}
