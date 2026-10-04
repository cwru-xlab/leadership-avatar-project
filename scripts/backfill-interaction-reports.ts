/**
 * Backfill `InteractionReport` from legacy `InterviewReport` + `ScenarioReport`.
 *
 * PRE-DROP TOOLING — retained for the shared-DB Part 1 run (REQ-67). Plan 13-15
 * removed the Prisma models; this script reads the legacy tables via `$queryRaw`
 * so it still compiles and still works against a database that still has those
 * tables (shared Lightsail before Part 2 DROP). After local DROP it will fail
 * locally with "relation does not exist" — that is expected.
 *
 * Idempotent, `upsert`-on-id. Never writes to or deletes from the legacy tables.
 *
 * Run (HUMAN ONLY against shared DB after reading 13-MIGRATION-HANDOFF.md):
 *   DATABASE_URL="<shared>" npx tsx scripts/backfill-interaction-reports.ts [--dry-run]
 *
 * Agents must NEVER point this at the shared Lightsail database.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import type { InputSnapshot, ScoreMap } from "../lib/report/snapshot";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

type InterviewLegacyRow = {
  id: string;
  userId: string;
  typeSlug: string;
  interviewerAvatarId: string | null;
  interviewerName: string | null;
  resumeId: string | null;
  resumeText: string | null;
  transcriptKey: string | null;
  turnCount: number;
  status: "IN_PROGRESS" | "PENDING" | "READY" | "FAILED";
  visualScore: number | null;
  vocalScore: number | null;
  contentScore: number | null;
  behavioralScore: number | null;
  cameraMode: string | null;
  visualMetrics: Prisma.JsonValue | null;
  vocalMetrics: Prisma.JsonValue | null;
  visualUnscoredReason: string | null;
  vocalUnscoredReason: string | null;
  metricsConsentAt: Date | null;
  reportStructured: Prisma.JsonValue | null;
  reportMarkdown: string | null;
  failureReason: string | null;
  evalModel: string | null;
  industry: string | null;
  roleTitle: string | null;
  difficulty: string | null;
  targetMinutes: number | null;
  targetQuestionCount: number | null;
  interviewerPersona: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ScenarioLegacyRow = {
  id: string;
  userId: string;
  caseId: string;
  interactionLogId: string | null;
  studentEmail: string | null;
  status: "IN_PROGRESS" | "PENDING" | "READY" | "FAILED";
  turnCount: number;
  visualScore: number | null;
  vocalScore: number | null;
  contentScore: number | null;
  behavioralScore: number | null;
  cameraMode: string | null;
  visualMetrics: Prisma.JsonValue | null;
  vocalMetrics: Prisma.JsonValue | null;
  visualUnscoredReason: string | null;
  vocalUnscoredReason: string | null;
  metricsConsentAt: Date | null;
  reportStructured: Prisma.JsonValue | null;
  reportMarkdown: string | null;
  failureReason: string | null;
  evalModel: string | null;
  caseName: string;
  backgroundSnapshot: string;
  avatarsSnapshot: Prisma.JsonValue;
  criteriaSnapshot: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function buildScoreMap(row: {
  visualScore: number | null;
  vocalScore: number | null;
  contentScore: number | null;
  behavioralScore: number | null;
}): ScoreMap {
  return {
    visual: row.visualScore,
    vocal: row.vocalScore,
    content: row.contentScore,
    behavioral: row.behavioralScore,
  };
}

function interviewInputSnapshot(row: InterviewLegacyRow): InputSnapshot {
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

function scenarioInputSnapshot(row: ScenarioLegacyRow): InputSnapshot {
  return {
    kind: "scenario",
    caseId: row.caseId,
    caseName: row.caseName,
    background: row.backgroundSnapshot,
    avatars: (row.avatarsSnapshot as unknown[]) ?? [],
    criteria: row.criteriaSnapshot,
  };
}

async function loadInterviewRows(): Promise<InterviewLegacyRow[]> {
  // Raw SQL: Prisma models for these tables were removed in 13-15.
  return prisma.$queryRaw<InterviewLegacyRow[]>`SELECT * FROM "InterviewReport"`;
}

async function loadScenarioRows(): Promise<ScenarioLegacyRow[]> {
  return prisma.$queryRaw<ScenarioLegacyRow[]>`SELECT * FROM "ScenarioReport"`;
}

async function backfillInterviews() {
  const rows = await loadInterviewRows();
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
      interactionLogId: null as string | null,
      studentEmail: null as string | null,
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
      terminationReason: null as string | null,
      outcome: undefined as Prisma.InputJsonValue | undefined,
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
  const rows = await loadScenarioRows();
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
      transcriptKey: null as string | null,
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
      terminationReason: null as string | null,
      outcome: undefined as Prisma.InputJsonValue | undefined,
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
  console.log(
    `Backfill InteractionReport from InterviewReport + ScenarioReport${DRY_RUN ? " (DRY RUN — no writes)" : ""}`
  );
  console.log(
    "PRE-DROP TOOLING: reads legacy tables via $queryRaw. Never writes to or deletes from them.\n"
  );

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
