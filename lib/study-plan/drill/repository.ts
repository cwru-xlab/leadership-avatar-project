/**
 * THE ONLY FILE that touches the Phase 23 schema additions through Prisma:
 * `VoiceDrill`, `VoiceDrillAttempt`, `StudyPlanPathStep.linkedReportId` and
 * `MasteryContribution.sourceVoiceDrillAttemptId`
 * (prisma/migrations/20261124000000_add_voice_drills_and_prove_it).
 *
 * WHY ONE FILE: the migration is hand-authored and not yet applied, and the
 * shared Prisma client is not regenerated (regenerating it would break the
 * running dev server). Until both happen, `tsc` reports the new accessors as
 * unknown — and only here. Everything else (service, routes, path DTO) calls
 * these functions, so the error surface is this one file and it disappears
 * on `prisma generate` with no code change.
 *
 * TOLERANT READS: the path GET must keep rendering every existing path even
 * on a database where the migration has not been applied yet. The two reads
 * the path DTO makes (`readLinkedReportIds`, `readDrillSummaries`) catch and
 * log a failure and return empty maps, so an unmigrated database degrades to
 * "no drill/prove-it info" rather than a 500. Writes are never swallowed.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../../prisma";
import type { VoiceDrillBrief } from "./types";

export interface VoiceDrillRow {
  id: string;
  userId: string;
  pathStepId: string;
  competencyKey: string;
  scenarioPrompt: string;
  tipText: string;
  techniqueId: string | null;
  promptBasis: string;
  sourceReportId: string | null;
  quotedTurnIndex: number | null;
  quotedText: string | null;
  generationModel: string;
  createdAt: Date;
}

export interface VoiceDrillAttemptRow {
  id: string;
  voiceDrillId: string;
  userId: string;
  cameraMode: string | null;
  transcript: string | null;
  spokenDurationMs: number | null;
  visualMetrics: unknown;
  vocalMetrics: unknown;
  score: number | null;
  feedback: string | null;
  graderRationale: string | null;
  graderModel: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

function briefData(brief: VoiceDrillBrief) {
  return {
    competencyKey: brief.competencyKey,
    scenarioPrompt: brief.scenarioPrompt,
    tipText: brief.tipText,
    techniqueId: brief.techniqueId,
    promptBasis: brief.promptBasis,
    sourceReportId: brief.sourceReportId,
    quotedTurnIndex: brief.quotedTurnIndex,
    quotedText: brief.quotedText,
    generationModel: brief.generationModel,
  };
}

/** Scoped by userId in the WHERE clause. */
export async function readVoiceDrillForStep(
  userId: string,
  pathStepId: string,
): Promise<VoiceDrillRow | null> {
  return prisma.voiceDrill.findFirst({ where: { pathStepId, userId } });
}

/**
 * Creates the drill for a step; a concurrent create for the same step
 * (`pathStepId @unique`) returns the row that won instead of failing.
 */
export async function createVoiceDrill(
  userId: string,
  pathStepId: string,
  brief: VoiceDrillBrief,
): Promise<VoiceDrillRow> {
  try {
    return await prisma.voiceDrill.create({ data: { userId, pathStepId, ...briefData(brief) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.voiceDrill.findFirst({ where: { pathStepId, userId } });
      if (existing) return existing;
    }
    throw error;
  }
}

/** Path generation: one drill per VOICE_DRILL step, written after createPath. */
export async function createVoiceDrillsForSteps(
  userId: string,
  items: Array<{ pathStepId: string; brief: VoiceDrillBrief }>,
): Promise<number> {
  if (items.length === 0) return 0;
  const result = await prisma.voiceDrill.createMany({
    data: items.map((item) => ({ userId, pathStepId: item.pathStepId, ...briefData(item.brief) })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function listAttempts(userId: string, voiceDrillId: string): Promise<VoiceDrillAttemptRow[]> {
  return prisma.voiceDrillAttempt.findMany({
    where: { voiceDrillId, userId },
    orderBy: { startedAt: "asc" },
  });
}

export async function createAttempt(
  userId: string,
  voiceDrillId: string,
  cameraMode: string | null,
): Promise<VoiceDrillAttemptRow> {
  return prisma.voiceDrillAttempt.create({ data: { userId, voiceDrillId, cameraMode } });
}

export async function readAttempt(
  userId: string,
  voiceDrillId: string,
  attemptId: string,
): Promise<VoiceDrillAttemptRow | null> {
  return prisma.voiceDrillAttempt.findFirst({ where: { id: attemptId, voiceDrillId, userId } });
}

/**
 * Completes an OPEN attempt. The `completedAt: null` guard in the WHERE
 * makes a double completion a no-op (count 0) rather than a second grade.
 */
export async function completeAttempt(
  userId: string,
  attemptId: string,
  data: {
    transcript: string;
    spokenDurationMs: number;
    visualMetrics: unknown;
    vocalMetrics: unknown;
    score: number;
    feedback: string;
    graderRationale: string;
    graderModel: string;
    completedAt: Date;
  },
): Promise<boolean> {
  const toJson = (value: unknown) =>
    value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  const result = await prisma.voiceDrillAttempt.updateMany({
    where: { id: attemptId, userId, completedAt: null },
    data: {
      transcript: data.transcript,
      spokenDurationMs: data.spokenDurationMs,
      visualMetrics: toJson(data.visualMetrics),
      vocalMetrics: toJson(data.vocalMetrics),
      score: data.score,
      feedback: data.feedback,
      graderRationale: data.graderRationale,
      graderModel: data.graderModel,
      completedAt: data.completedAt,
    },
  });
  return result.count === 1;
}

/** Idempotence guard for the ledger write (the ledger has no unique key). */
export async function hasDrillContribution(attemptId: string): Promise<boolean> {
  const row = await prisma.masteryContribution.findFirst({
    where: { source: "VOICE_DRILL", sourceVoiceDrillAttemptId: attemptId },
    select: { id: true },
  });
  return row !== null;
}

/** TOLERANT read for the path DTO: stepId -> linkedReportId. */
export async function readLinkedReportIds(pathId: string): Promise<Map<string, string>> {
  try {
    const rows = await prisma.studyPlanPathStep.findMany({
      where: { pathId, linkedReportId: { not: null } },
      select: { id: true, linkedReportId: true },
    });
    return new Map(
      rows.filter((r) => r.linkedReportId).map((r) => [r.id, r.linkedReportId as string]),
    );
  } catch (error) {
    console.warn(
      "readLinkedReportIds: Phase 23 columns unavailable (migration not applied?):",
      error instanceof Error ? error.name : "UnknownError",
    );
    return new Map();
  }
}

/** Scoped write: only a user-owned UNAIDED_SESSION step that is not COMPLETE. */
export async function setLinkedReport(
  userId: string,
  stepId: string,
  reportId: string,
): Promise<boolean> {
  const result = await prisma.studyPlanPathStep.updateMany({
    where: { id: stepId, kind: "UNAIDED_SESSION", status: { not: "COMPLETE" }, path: { userId } },
    data: { linkedReportId: reportId, status: "IN_PROGRESS" },
  });
  return result.count === 1;
}

export interface DrillSummary {
  hasBrief: boolean;
  attemptCount: number;
  completedAttemptCount: number;
}

/** TOLERANT read for the path DTO: stepId -> drill summary. No scores. */
export async function readDrillSummaries(
  userId: string,
  stepIds: string[],
): Promise<Map<string, DrillSummary>> {
  if (stepIds.length === 0) return new Map();
  try {
    const drills = await prisma.voiceDrill.findMany({
      where: { pathStepId: { in: stepIds }, userId },
      select: {
        pathStepId: true,
        attempts: { select: { completedAt: true } },
      },
    });
    return new Map(
      drills.map((d: { pathStepId: string; attempts: Array<{ completedAt: Date | null }> }) => [
        d.pathStepId,
        {
          hasBrief: true,
          attemptCount: d.attempts.length,
          completedAttemptCount: d.attempts.filter((a: { completedAt: Date | null }) => a.completedAt !== null).length,
        },
      ]),
    );
  } catch (error) {
    console.warn(
      "readDrillSummaries: Phase 23 tables unavailable (migration not applied?):",
      error instanceof Error ? error.name : "UnknownError",
    );
    return new Map();
  }
}
