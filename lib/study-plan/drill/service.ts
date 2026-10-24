/**
 * VOICE_DRILL lifecycle: read the brief, start an attempt, complete it
 * (grade -> contribution -> step completion). All access is keyed by a
 * user-owned VOICE_DRILL path step — the same "reachable only through a
 * path" rule coached mode follows (REQ-113 by analogy); no route accepts a
 * drill id or attempt id that is not resolved through that step.
 *
 * Redo: a student may start any number of attempts. Each COMPLETED attempt
 * writes its own VOICE_DRILL contribution; the step completes on the FIRST
 * completed attempt and later attempts never un-complete it.
 */
import { prisma } from "../../prisma";
import { COMPETENCIES, type CompetencyKey } from "../../mastery/competencies";
import { recordContributions } from "../../mastery/ledger";
import { asVisualMetrics, asVocalMetrics, parseMetricsPayload } from "../../metrics/ingest";
import { markStepComplete } from "../path";
import { priorityThemesFromContent, themeMatchesFromPlan } from "../plan-targets";
import { templateBrief } from "./brief";
import {
  contributionInputFromDrillAttempt,
  deliverySummary,
  gradeDrillAttempt,
} from "./grade";
import * as repo from "./repository";
import {
  DRILL_DURATION,
  MIN_GRADABLE_TRANSCRIPT_WORDS,
  type CompleteDrillAttemptBody,
  type VoiceDrillAttemptDTO,
  type VoiceDrillDTO,
} from "./types";

export class DrillStepNotFoundError extends Error {
  constructor() {
    super("Voice drill step not found");
    this.name = "DrillStepNotFoundError";
  }
}
export class DrillAttemptNotFoundError extends Error {
  constructor() {
    super("Voice drill attempt not found");
    this.name = "DrillAttemptNotFoundError";
  }
}
export class DrillAttemptAlreadyCompleteError extends Error {
  constructor() {
    super("This attempt is already complete");
    this.name = "DrillAttemptAlreadyCompleteError";
  }
}
export class DrillTooShortError extends Error {
  constructor(words: number) {
    super(`Too little speech to grade (${words} words; at least ${MIN_GRADABLE_TRANSCRIPT_WORDS} needed)`);
    this.name = "DrillTooShortError";
  }
}

function labelFor(key: CompetencyKey): string {
  return COMPETENCIES.find((c) => c.key === key)?.label ?? key;
}

/** Ownership through path.userId, kind VOICE_DRILL — a wrong kind is a 404. */
async function loadDrillStep(userId: string, stepId: string) {
  const step = await prisma.studyPlanPathStep.findFirst({
    where: { id: stepId, kind: "VOICE_DRILL", path: { userId } },
    select: {
      id: true,
      pathId: true,
      position: true,
      status: true,
      competencyKey: true,
      path: { select: { studyPlanId: true, studyPlan: { select: { content: true } } } },
    },
  });
  if (!step) throw new DrillStepNotFoundError();
  return step;
}

/**
 * Lazily rebuilds a missing brief from the deterministic template (e.g. the
 * post-createPath drill write failed). No model call, no S3 read: the
 * template needs only the plan's themes.
 */
async function ensureDrill(userId: string, step: Awaited<ReturnType<typeof loadDrillStep>>) {
  const existing = await repo.readVoiceDrillForStep(userId, step.id);
  if (existing) return existing;
  const competencyKey = step.competencyKey as CompetencyKey;
  const earlierSameCompetency = await prisma.studyPlanPathStep.count({
    where: { pathId: step.pathId, kind: "VOICE_DRILL", competencyKey, position: { lt: step.position } },
  });
  const theme =
    themeMatchesFromPlan(priorityThemesFromContent(step.path.studyPlan.content)).get(competencyKey)?.theme ?? null;
  const brief = templateBrief(
    { position: step.position, competencyKey, variant: earlierSameCompetency, theme },
    [],
  );
  return repo.createVoiceDrill(userId, step.id, brief);
}

export function attemptDTO(row: repo.VoiceDrillAttemptRow): VoiceDrillAttemptDTO {
  const done = row.completedAt !== null;
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    completedAt: done ? row.completedAt!.toISOString() : null,
    // Never a number for an open attempt: nothing numeric mid-drill.
    score: done ? row.score : null,
    feedback: done ? row.feedback : null,
    delivery: done
      ? deliverySummary(asVisualMetrics(row.visualMetrics), asVocalMetrics(row.vocalMetrics), row.spokenDurationMs)
      : null,
  };
}

export async function getDrill(userId: string, stepId: string): Promise<VoiceDrillDTO> {
  const step = await loadDrillStep(userId, stepId);
  const drill = await ensureDrill(userId, step);
  const attempts = await repo.listAttempts(userId, drill.id);
  const competencyKey = step.competencyKey as CompetencyKey;
  return {
    stepId: step.id,
    planId: step.path.studyPlanId,
    competencyKey,
    competencyLabel: labelFor(competencyKey),
    scenarioPrompt: drill.scenarioPrompt,
    tipText: drill.tipText,
    quotedText: drill.quotedText,
    durationSeconds: DRILL_DURATION,
    stepStatus: step.status,
    attempts: attempts.map(attemptDTO),
  };
}

export async function startAttempt(
  userId: string,
  stepId: string,
  cameraMode: "ON" | "OFF" | null,
): Promise<VoiceDrillAttemptDTO> {
  const step = await loadDrillStep(userId, stepId);
  const drill = await ensureDrill(userId, step);
  const attempt = await repo.createAttempt(userId, drill.id, cameraMode);
  if (step.status === "PENDING") {
    // Started work is resumed first by nextStepFor. No gating: any step may
    // be started at any time.
    await prisma.studyPlanPathStep.updateMany({
      where: { id: step.id, status: "PENDING" },
      data: { status: "IN_PROGRESS" },
    });
  }
  return attemptDTO(attempt);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Validates the client body shape; returns null on anything malformed. */
export function parseCompleteBody(raw: unknown): CompleteDrillAttemptBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.transcript !== "string" || b.transcript.length > 20_000) return null;
  if (typeof b.spokenDurationMs !== "number" || !Number.isFinite(b.spokenDurationMs) || b.spokenDurationMs < 0) {
    return null;
  }
  if (b.cameraMode !== "ON" && b.cameraMode !== "OFF") return null;
  const metrics = parseMetricsPayload(b.metrics);
  return {
    transcript: b.transcript,
    spokenDurationMs: Math.round(b.spokenDurationMs),
    cameraMode: b.cameraMode,
    metrics,
  };
}

export async function completeAttempt(
  userId: string,
  stepId: string,
  attemptId: string,
  body: CompleteDrillAttemptBody,
): Promise<VoiceDrillAttemptDTO> {
  const step = await loadDrillStep(userId, stepId);
  const drill = await ensureDrill(userId, step);
  const attempt = await repo.readAttempt(userId, drill.id, attemptId);
  if (!attempt) throw new DrillAttemptNotFoundError();
  if (attempt.completedAt) throw new DrillAttemptAlreadyCompleteError();

  const words = wordCount(body.transcript);
  if (words < MIN_GRADABLE_TRANSCRIPT_WORDS) throw new DrillTooShortError(words);

  const visual = body.cameraMode === "ON" ? body.metrics?.visual ?? null : null;
  const vocal = body.metrics?.vocal ?? null;
  const competencyKey = step.competencyKey as CompetencyKey;

  // GRADE FIRST: a grading failure leaves the attempt open and retryable,
  // with nothing written.
  const grade = await gradeDrillAttempt({
    competencyKey,
    scenarioPrompt: drill.scenarioPrompt,
    tipText: drill.tipText,
    transcript: body.transcript,
    delivery: deliverySummary(visual, vocal, body.spokenDurationMs),
  });

  const completedAt = new Date();
  const won = await repo.completeAttempt(userId, attempt.id, {
    transcript: body.transcript,
    spokenDurationMs: body.spokenDurationMs,
    visualMetrics: visual,
    vocalMetrics: vocal,
    score: grade.score,
    feedback: grade.feedback,
    graderRationale: grade.rationale,
    graderModel: grade.model,
    completedAt,
  });
  if (!won) throw new DrillAttemptAlreadyCompleteError();

  if (!(await repo.hasDrillContribution(attempt.id))) {
    await recordContributions([
      contributionInputFromDrillAttempt({
        userId,
        attemptId: attempt.id,
        competencyKey,
        score: grade.score,
        completedAt,
      }),
    ]);
  }

  // First completed attempt completes the step; a redo never re-completes.
  const fresh = await prisma.studyPlanPathStep.findFirst({
    where: { id: step.id, path: { userId } },
    select: { status: true },
  });
  if (fresh && fresh.status !== "COMPLETE") {
    await markStepComplete(userId, step.id);
  }

  const row = await repo.readAttempt(userId, drill.id, attempt.id);
  return attemptDTO(row!);
}
