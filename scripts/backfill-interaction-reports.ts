/**
 * Backfill `InteractionReport` from `InterviewReport` + `ScenarioReport`.
 *
 * Idempotent, `upsert`-on-id TypeScript backfill — follows the
 * `scripts/sync-s3-to-db.ts` precedent (plain `tsx`, explicit logging) with
 * an added `--dry-run` flag.
 *
 * Run (LOCAL DB ONLY):
 *   DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" npx tsx scripts/backfill-interaction-reports.ts [--dry-run]
 *
 * REQ-67: this script must NEVER be pointed at the shared Lightsail
 * database by an agent. No DATABASE_URL fallback is read from `.env` —
 * the caller must pass it inline, matching every other Phase 13 script.
 * It never writes to or deletes from the legacy tables.
 */
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { InputSnapshot, ScoreMap } from "../lib/report/snapshot";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

function buildScoreMap(row: {
  visualScore: number | null;
  vocalScore: number | null;
  contentScore: number | null;
  behavioralScore: number | null;
}): ScoreMap {
  // Nulls preserved as JSON nulls deliberately — a null score must stay
  // distinguishable from a real 0 score.
  return {
    visual: row.visualScore,
    vocal: row.vocalScore,
    content: row.contentScore,
    behavioral: row.behavioralScore,
  };
}

function interviewInputSnapshot(row: {
  interviewerAvatarId: string | null;
  interviewerName: string | null;
  resumeId: string | null;
  resumeText: string | null;
  industry: string | null;
  roleTitle: string | null;
  difficulty: string | null;
  targetMinutes: number | null;
  targetQuestionCount: number | null;
  interviewerPersona: string | null;
}): InputSnapshot {
  return {
    kind: "interview",
    interviewerAvatarId: row.interviewerAvatarId,
    interviewerName: row.interviewerName,
    resumeId: row.resumeId,
    resumeText: row.resumeText,
    industry: row.industry,
    roleTitle: row.roleTitle,
    difficulty: row.difficulty,
    targetMinutes: row.targetMinutes,
    targetQuestionCount: row.targetQuestionCount,
    interviewerPersona: row.interviewerPersona,
  };
}

function scenarioInputSnapshot(row: {
  caseId: string;
  caseName: string;
  backgroundSnapshot: string;
  avatarsSnapshot: Prisma.JsonValue;
  criteriaSnapshot: string | null;
}): InputSnapshot {
  return {
    kind: "scenario",
    caseId: row.caseId,
    caseName: row.caseName,
    background: row.backgroundSnapshot,
    avatars: (row.avatarsSnapshot as unknown[]) ?? [],
    criteria: row.criteriaSnapshot,
  };
}

async function backfillInterviews() {
  const rows = await prisma.interviewReport.findMany();
  let created = 0;
  let updated = 0;
  let inProgress = 0;

  for (const row of rows) {
    if (row.status === "IN_PROGRESS") inProgress += 1;

    const data = {
      userId: row.userId,
      typeSlug: row.typeSlug,
      status: row.status,
      inputSnapshot: interviewInputSnapshot(row) as unknown as Prisma.InputJsonValue,
      scores: buildScoreMap(row) as unknown as Prisma.InputJsonValue,
      transcriptKey: row.transcriptKey,
      interactionLogId: null,
      studentEmail: null,
      turnCount: row.turnCount,
      cameraMode: row.cameraMode,
      visualMetrics: (row.visualMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
      vocalMetrics: (row.vocalMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
      visualUnscoredReason: row.visualUnscoredReason,
      vocalUnscoredReason: row.vocalUnscoredReason,
      metricsConsentAt: row.metricsConsentAt,
      reportStructured: (row.reportStructured ?? undefined) as Prisma.InputJsonValue | undefined,
      reportMarkdown: row.reportMarkdown,
      failureReason: row.failureReason,
      evalModel: row.evalModel,
      terminationReason: null,
      outcome: undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (DRY_RUN) {
      const existing = await prisma.interactionReport.findUnique({ where: { id: row.id } });
      if (existing) updated += 1;
      else created += 1;
      continue;
    }

    const existing = await prisma.interactionReport.findUnique({ where: { id: row.id } });
    await prisma.interactionReport.upsert({
      where: { id: row.id },
      create: { id: row.id, ...data },
      update: data,
    });
    if (existing) updated += 1;
    else created += 1;
  }

  return { total: rows.length, created, updated, inProgress };
}

async function backfillScenarios() {
  const rows = await prisma.scenarioReport.findMany();
  let created = 0;
  let updated = 0;
  let inProgress = 0;

  for (const row of rows) {
    if (row.status === "IN_PROGRESS") inProgress += 1;

    const data = {
      userId: row.userId,
      typeSlug: "case-study",
      status: row.status,
      inputSnapshot: scenarioInputSnapshot(row) as unknown as Prisma.InputJsonValue,
      scores: buildScoreMap(row) as unknown as Prisma.InputJsonValue,
      transcriptKey: null,
      interactionLogId: row.interactionLogId,
      studentEmail: row.studentEmail,
      turnCount: row.turnCount,
      cameraMode: row.cameraMode,
      visualMetrics: (row.visualMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
      vocalMetrics: (row.vocalMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
      visualUnscoredReason: row.visualUnscoredReason,
      vocalUnscoredReason: row.vocalUnscoredReason,
      metricsConsentAt: row.metricsConsentAt,
      reportStructured: (row.reportStructured ?? undefined) as Prisma.InputJsonValue | undefined,
      reportMarkdown: row.reportMarkdown,
      failureReason: row.failureReason,
      evalModel: row.evalModel,
      terminationReason: null,
      outcome: undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (DRY_RUN) {
      const existing = await prisma.interactionReport.findUnique({ where: { id: row.id } });
      if (existing) updated += 1;
      else created += 1;
      continue;
    }

    const existing = await prisma.interactionReport.findUnique({ where: { id: row.id } });
    await prisma.interactionReport.upsert({
      where: { id: row.id },
      create: { id: row.id, ...data },
      update: data,
    });
    if (existing) updated += 1;
    else created += 1;
  }

  return { total: rows.length, created, updated, inProgress };
}

async function main() {
  console.log(`Backfill InteractionReport from InterviewReport + ScenarioReport${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log("Never writes to or deletes from the legacy tables. Never touches the shared DB.\n");

  const verb = DRY_RUN ? "would " : "";
  const iv = await backfillInterviews();
  console.log(
    `InterviewReport: ${iv.total} rows seen (${iv.inProgress} IN_PROGRESS) -> ${verb}created ${iv.created}, ${verb}updated ${iv.updated}`
  );

  const sc = await backfillScenarios();
  console.log(
    `ScenarioReport:  ${sc.total} rows seen (${sc.inProgress} IN_PROGRESS) -> ${verb}created ${sc.created}, ${verb}updated ${sc.updated}`
  );

  if (DRY_RUN) {
    console.log("\nDRY RUN complete. No rows were written.");
  } else {
    console.log("\nBackfill complete.");
  }
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
