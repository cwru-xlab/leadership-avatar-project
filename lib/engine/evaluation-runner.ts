/**
 * One evaluation runner for every engine-backed interaction type (REQ-59).
 *
 * `runAndPersistEvaluation` turns a stored transcript into a READY or FAILED
 * `InteractionReport` row. Never throws, never leaves the row PENDING, never
 * invents `terminationReason` / `outcome` (the finish route owns those).
 *
 * Transcript derivation keeps BOTH of today's code paths (research Section A,
 * divergence 4):
 *   - `transcriptKey` present → S3 interview transcript via
 *     `getInterviewTranscript(userId, reportId)`
 *   - `interactionLogId` + `studentEmail` present → S3 InteractionLog, then
 *     roleInteractions (preferred) or events (fallback)
 *
 * Visual/Vocal four-state resolution runs UNCONDITIONALLY for every type
 * (REQ-72). The `cameraMode === null` legacy guard (REQ-48) leaves both
 * unscored-reason columns null.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { formatTranscriptForEvaluator } from "@/lib/interview/transcript";
import { asVisualMetrics, asVocalMetrics } from "@/lib/metrics/ingest";
import {
  resolveVisualOutcome,
  resolveVocalOutcome,
} from "@/lib/metrics/coverage";
import type { CameraMode } from "@/lib/metrics/types";
import { resolveDifficultConversationInstance } from "@/lib/difficult-conversation/resolve-instance";
import {
  asInputSnapshot,
  type DifficultConversationInputSnapshot,
  type InputSnapshot,
  type PitchInputSnapshot,
  type ScenarioInputSnapshot,
} from "@/lib/report/snapshot";
import type { InteractionLog, InteractionEvent } from "@/types";

import { runEvaluation } from "./evaluation";
import { validateOutcome } from "./outcome";
import { getEngineType } from "./registry";
import { resolveSessionConfig } from "./resolve";
import type {
  EvaluatorImage,
  InstanceConfig,
  ResolvedSessionConfig,
} from "./types";

const MAX_ERROR_MESSAGE_LENGTH = 500;

function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
}

// ---------------------------------------------------------------------------
// Scenario transcript helpers — moved from lib/scenario/evaluation-runner.ts
// verbatim in behavior. Do not "improve".
// ---------------------------------------------------------------------------

function elapsedStamp(timestamp: number, startedAt: number): string {
  const elapsed = Math.max(0, Math.round((timestamp - startedAt) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function buildTranscriptFromRoleInteractions(log: InteractionLog): string {
  const lines: string[] = [];

  const roles = Object.values(log.roleInteractions ?? {}).sort(
    (a, b) => a.enteredAt - b.enteredAt,
  );

  for (const role of roles) {
    const messages = role.messages ?? [];
    if (messages.length === 0) continue;

    const roleName = role.roleName || role.roleId || "Unknown";
    lines.push(`\n--- Conversation with: ${roleName} ---`);

    for (const message of [...messages].sort(
      (a, b) => a.timestamp - b.timestamp,
    )) {
      const time = elapsedStamp(message.timestamp, log.startedAt);
      const speaker =
        message.role === "user"
          ? `Student → ${roleName}`
          : `${roleName} → Student`;
      lines.push(`[${time}] ${speaker}: ${message.content}`);
    }
  }

  return lines.join("\n");
}

function buildTranscriptFromEvents(log: InteractionLog): string {
  const events = [...log.events].sort(
    (a: InteractionEvent, b: InteractionEvent) => a.timestamp - b.timestamp,
  );

  const lines: string[] = [];
  let currentRole: string | null = null;

  for (const event of events) {
    const time = elapsedStamp(event.timestamp, log.startedAt);

    switch (event.type) {
      case "start_session":
        lines.push(`[${time}] Session started`);
        break;
      case "enter_role":
        currentRole = event.roleName || event.roleId || "Unknown";
        lines.push(
          `\n[${time}] Student entered conversation with: ${currentRole}`,
        );
        break;
      case "exit_role":
        lines.push(
          `[${time}] Student left conversation with: ${event.roleName || currentRole}`,
        );
        currentRole = null;
        break;
      case "send_message":
        lines.push(
          `[${time}] Student → ${currentRole || "Unknown"}: ${event.messageContent}`,
        );
        break;
      case "receive_message":
        lines.push(
          `[${time}] ${currentRole || "Unknown"} → Student: ${event.messageContent}`,
        );
        break;
      case "end_session":
        lines.push(`\n[${time}] Session ended`);
        break;
    }
  }

  return lines.join("\n");
}

/** Prefers roleInteractions; falls back to events only when no role has messages. */
function buildScenarioTranscript(log: InteractionLog): string {
  const fromRoles = buildTranscriptFromRoleInteractions(log);
  if (fromRoles.trim()) return fromRoles;
  return buildTranscriptFromEvents(log);
}

// ---------------------------------------------------------------------------
// Config resolution from a stored InteractionReport row
// ---------------------------------------------------------------------------

function instanceFromScenarioSnapshot(
  snapshot: ScenarioInputSnapshot,
): InstanceConfig {
  const avatars: Array<{ name: string; role: string; additionalInfo?: string }> =
    [];
  for (const entry of snapshot.avatars) {
    if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      avatars.push({
        name: typeof rec.name === "string" ? rec.name : "",
        role: typeof rec.role === "string" ? rec.role : "",
        ...(typeof rec.additionalInfo === "string"
          ? { additionalInfo: rec.additionalInfo }
          : {}),
      });
    }
  }
  return {
    kind: "case-study",
    caseId: snapshot.caseId,
    caseName: snapshot.caseName,
    background: snapshot.background,
    avatars,
    criteria: snapshot.criteria,
  };
}

/**
 * Pitch-elevator instances are fully reconstructible from the input snapshot
 * (no secrets omitted). Pitch-deck needs slideTexts from deck storage and is
 * handled separately when that path lands.
 */
function instanceFromPitchSnapshot(
  snapshot: PitchInputSnapshot,
): InstanceConfig | null {
  if (snapshot.pitchKind !== "elevator") return null;
  if (
    typeof snapshot.pitchSubject !== "string" ||
    !snapshot.listenerKnowledge
  ) {
    return null;
  }
  return {
    kind: "pitch-elevator",
    pitchSubject: snapshot.pitchSubject,
    listenerKnowledge: snapshot.listenerKnowledge,
  };
}

/**
 * Difficult-conversation input snapshots deliberately omit `hiddenPosition`
 * (privacy boundary). Re-resolve the live record/seed so the evaluator still
 * gets the authored block; overlay the session's chosen difficulty/avatar.
 */
async function instanceFromDifficultConversationSnapshot(
  snapshot: DifficultConversationInputSnapshot,
): Promise<InstanceConfig | null> {
  const resolved = await resolveDifficultConversationInstance(
    snapshot.conversationId,
  );
  if (!resolved) return null;
  return {
    ...resolved,
    difficulty: snapshot.difficulty,
    avatarId: snapshot.avatarId || resolved.avatarId,
  };
}

async function resolveConfigForReport(
  typeSlug: string,
  snapshot: InputSnapshot | null,
): Promise<
  | { ok: true; config: ResolvedSessionConfig }
  | { ok: false; reason: string }
> {
  if (snapshot?.kind === "scenario") {
    return resolveSessionConfig(typeSlug, {
      instance: instanceFromScenarioSnapshot(snapshot),
    });
  }

  if (snapshot?.kind === "difficult-conversation") {
    const instance = await instanceFromDifficultConversationSnapshot(snapshot);
    if (!instance) {
      return {
        ok: false,
        reason: `difficult-conversation instance "${snapshot.conversationId}" could not be resolved for evaluation`,
      };
    }
    return resolveSessionConfig(typeSlug, { instance });
  }

  if (snapshot?.kind === "pitch") {
    const instance = instanceFromPitchSnapshot(snapshot);
    if (instance) {
      return resolveSessionConfig(typeSlug, { instance });
    }
    // pitch-deck (or incomplete elevator snapshot): fall through — may fail
    // resolve when the type requires an instance.
  }

  // Interview presets / networking defaults (and rows with no snapshot yet)
  // resolve off the type alone. Grading inputs are overlaid from the snapshot
  // into evaluationContext below — resolveSessionConfig's customization input
  // speaks picker slugs, not the already-resolved display values the snapshot
  // stores.
  return resolveSessionConfig(typeSlug, {});
}

function buildEvaluationContextForReport(
  config: ResolvedSessionConfig,
  snapshot: InputSnapshot | null,
  termination?: {
    reason: string | null;
    atSeconds: number | null;
  },
): Record<string, unknown> {
  const type = getEngineType(config.typeSlug);
  if (!type) {
    return { kind: "unknown" };
  }

  const base = type.prompts.buildEvaluationContext(config);

  if (snapshot?.kind === "interview") {
    const presetCustomization = config.customization;
    return {
      kind: "interview",
      resumeText: snapshot.resumeText ?? "",
      customization: {
        industry:
          snapshot.industry ?? presetCustomization?.industry ?? "",
        roleTitle:
          snapshot.roleTitle ?? presetCustomization?.roleTitle ?? "",
        difficulty:
          snapshot.difficulty ?? presetCustomization?.difficulty ?? "",
        targetMinutes:
          snapshot.targetMinutes ??
          presetCustomization?.targetMinutes ??
          0,
        targetQuestionCount:
          snapshot.targetQuestionCount ??
          presetCustomization?.targetQuestionCount ??
          0,
        interviewerPersona:
          snapshot.interviewerPersona ??
          presetCustomization?.interviewerPersona ??
          "",
      },
    };
  }

  // DC builder leaves termination null; fill from report columns (finish owns them).
  if (
    base.kind === "difficult-conversation" &&
    termination &&
    typeof base === "object"
  ) {
    return {
      ...base,
      terminationReason: termination.reason,
      terminationAtSeconds: termination.atSeconds,
    };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistFailure(
  reportId: string,
  reason: string,
  model?: string,
): Promise<void> {
  await prisma.interactionReport.update({
    where: { id: reportId },
    data: {
      status: "FAILED",
      failureReason: reason,
      evalModel: model,
      completedAt: new Date(),
    },
  });
}

/**
 * Load the stored transcript, run the evaluator, and persist the outcome.
 *
 * Signature is `{ reportId }` — ownership checks belong on the route that
 * schedules this (plan 13-07/13-08). Never throws.
 */
export async function runAndPersistEvaluation({
  reportId,
}: {
  reportId: string;
}): Promise<void> {
  console.info("Engine evaluation starting", { reportId });

  try {
    const report = await prisma.interactionReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      console.warn("Engine evaluation: report not found, skipping", {
        reportId,
      });
      return;
    }

    // Reentrancy-safe: flip PENDING before any LLM call (scenario runner
    // pattern; interview RETRY route already does this too).
    await prisma.interactionReport.update({
      where: { id: reportId },
      data: { status: "PENDING" },
    });

    const snapshot = asInputSnapshot(report.inputSnapshot);
    const resolved = await resolveConfigForReport(report.typeSlug, snapshot);
    if (!resolved.ok) {
      await persistFailure(reportId, resolved.reason);
      console.error("Engine evaluation failed: config resolution", {
        reportId,
        status: "FAILED",
        reason: resolved.reason,
      });
      return;
    }

    // ----- Transcript derivation (both legacy paths) -----
    let transcript = "";
    let turnCountUpdate: number | undefined;

    if (report.transcriptKey) {
      const interviewTranscript = await s3Storage.getInterviewTranscript(
        report.userId,
        reportId,
      );
      if (!interviewTranscript) {
        await persistFailure(
          reportId,
          "Transcript could not be read from storage.",
        );
        console.error("Engine evaluation failed: missing interview transcript", {
          reportId,
          status: "FAILED",
        });
        return;
      }
      transcript = formatTranscriptForEvaluator(interviewTranscript);
    } else if (report.interactionLogId && report.studentEmail) {
      const caseId =
        snapshot?.kind === "scenario" ? snapshot.caseId : null;
      if (!caseId) {
        await persistFailure(
          reportId,
          "No transcript was recorded for this run.",
        );
        console.error(
          "Engine evaluation failed: missing caseId for interaction log",
          { reportId, status: "FAILED" },
        );
        return;
      }

      const log = await s3Storage.getInteractionLog(
        report.studentEmail,
        caseId,
        report.interactionLogId,
      );
      if (!log) {
        await persistFailure(
          reportId,
          "No transcript was recorded for this run.",
        );
        console.error("Engine evaluation failed: missing interaction log", {
          reportId,
          status: "FAILED",
        });
        return;
      }

      transcript = buildScenarioTranscript(log);
      if (!transcript.trim()) {
        await persistFailure(
          reportId,
          "No transcript was recorded for this run.",
        );
        console.error("Engine evaluation failed: empty transcript", {
          reportId,
          status: "FAILED",
        });
        return;
      }
      turnCountUpdate = log.totalMessages;
    } else {
      await persistFailure(
        reportId,
        "No transcript was recorded for this run.",
      );
      console.error("Engine evaluation failed: missing transcript pointer", {
        reportId,
        status: "FAILED",
      });
      return;
    }

    if (turnCountUpdate !== undefined) {
      await prisma.interactionReport.update({
        where: { id: reportId },
        data: { turnCount: turnCountUpdate },
      });
    }

    // ----- Metrics: unconditional four-state resolution (REQ-72) -----
    const visual = asVisualMetrics(report.visualMetrics);
    const vocal = asVocalMetrics(report.vocalMetrics);
    const cameraMode = (report.cameraMode as CameraMode | null) ?? "OFF";
    const visualOutcome = resolveVisualOutcome(cameraMode, visual);
    const vocalOutcome = resolveVocalOutcome(vocal);

    const evaluationContext = buildEvaluationContextForReport(
      resolved.config,
      snapshot,
      {
        reason: report.terminationReason,
        atSeconds: report.terminationAtSeconds,
      },
    );

    // Type-declared images (looked up via the type record — ResolvedSessionConfig
    // does not carry prompts; same adaptation as 13-05). Image-fetch failure
    // degrades to text-only evaluation; never fails the whole report.
    const typeRecord = getEngineType(resolved.config.typeSlug);
    let images: EvaluatorImage[] | undefined;
    if (typeRecord?.prompts.buildEvaluationImages) {
      try {
        images = await typeRecord.prompts.buildEvaluationImages({
          config: resolved.config,
        });
      } catch (imageError) {
        const imageMessage =
          imageError instanceof Error
            ? imageError.message
            : String(imageError);
        console.warn(
          "Engine evaluation: buildEvaluationImages failed; degrading to text-only",
          { reportId, error: imageMessage },
        );
        images = undefined;
      }
    }

    const outcome = await runEvaluation({
      config: resolved.config,
      transcript,
      evaluationContext,
      metricsOutcome: {
        visualMetrics: visualOutcome.scored ? visual : null,
        vocalMetrics: vocalOutcome.scored ? vocal : null,
      },
      images,
    });

    if (outcome.ok) {
      // REQ-48: legacy row (cameraMode === null) keeps both reason columns null.
      const visualUnscoredReason =
        report.cameraMode === null ? null : visualOutcome.reason;
      const vocalUnscoredReason =
        report.cameraMode === null ? null : vocalOutcome.reason;

      // Validate the evaluator-produced outcome through the ONE validator.
      // Invalid → persist null (13-07: never half-written). Do not overwrite a
      // non-null outcome the finish route already set unless the evaluator
      // produced one.
      const produced = outcome.producedOutcome;
      let outcomeToPersist: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
      let validatedOutcome: Record<string, unknown> | null = null;

      if (produced !== null) {
        const validated = validateOutcome(resolved.config.outcome, produced);
        if (validated.ok) {
          validatedOutcome = validated.outcome;
          outcomeToPersist = validated.outcome as unknown as Prisma.InputJsonValue;
        } else {
          console.warn(
            "Engine evaluation: produced outcome failed validateOutcome; persisting null",
            { reportId, errors: validated.errors },
          );
          outcomeToPersist = Prisma.JsonNull;
        }
      } else if (report.outcome == null) {
        // Evaluator produced nothing and finish left nothing — leave as-is
        // (undefined skips the column update).
        outcomeToPersist = undefined;
      }

      // Type-declared score cap (e.g. early-end discovery_tailoring ceiling).
      // Looked up on the type record — never via typeSlug branching.
      const scoresForPost = outcome.result.scores;
      const finalScores = typeRecord?.postProcessScores
        ? typeRecord.postProcessScores(scoresForPost, {
            terminationReason: report.terminationReason,
            outcome: validatedOutcome,
          })
        : scoresForPost;

      await prisma.interactionReport.update({
        where: { id: reportId },
        data: {
          status: "READY",
          scores: finalScores as unknown as Prisma.InputJsonValue,
          reportMarkdown: outcome.result.reportMarkdown,
          reportStructured: outcome.result
            .reportStructured as unknown as Prisma.InputJsonValue,
          failureReason: null,
          evalModel: outcome.model,
          completedAt: new Date(),
          visualUnscoredReason,
          vocalUnscoredReason,
          ...(outcomeToPersist !== undefined
            ? { outcome: outcomeToPersist }
            : {}),
        },
      });
      console.info("Engine evaluation completed", {
        reportId,
        status: "READY",
        typeSlug: report.typeSlug,
        cameraMode: report.cameraMode,
        visualUnscoredReason,
        vocalUnscoredReason,
        outcomePersisted:
          outcomeToPersist === undefined
            ? "unchanged"
            : outcomeToPersist === Prisma.JsonNull
              ? "null"
              : "validated",
      });
      return;
    }

    await persistFailure(reportId, outcome.reason, outcome.model);
    console.error("Engine evaluation failed", {
      reportId,
      status: "FAILED",
      typeSlug: report.typeSlug,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await persistFailure(reportId, truncateErrorMessage(message));
    } catch (secondaryError) {
      console.error(
        "Engine evaluation: secondary failure writing FAILED status",
        {
          reportId,
          error:
            secondaryError instanceof Error
              ? secondaryError.message
              : String(secondaryError),
        },
      );
    }
    console.error("Engine evaluation threw unexpectedly", {
      reportId,
      status: "FAILED",
      error: message,
    });
  }
}
