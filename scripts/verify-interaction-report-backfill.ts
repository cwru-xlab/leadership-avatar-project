/**
 * Row-for-row proof that `scripts/backfill-interaction-reports.ts` produced
 * a byte-equal, null-preserving `InteractionReport` twin of every legacy
 * `InterviewReport`/`ScenarioReport` row — not a vibe check.
 *
 * Run (LOCAL DB ONLY):
 *   DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" npx tsx scripts/verify-interaction-report-backfill.ts
 *
 * Exits non-zero on any failed assertion.
 */
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

let failures = 0;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function jsonEqual(a: Prisma.JsonValue | null, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function run() {
  // --- 1. Count assertion ------------------------------------------------
  section("1. Count assertion");

  const interviewCount = await prisma.interviewReport.count();
  const scenarioCount = await prisma.scenarioReport.count();
  const interactionCount = await prisma.interactionReport.count();

  check(
    "interactionReport.count() >= interviewReport.count() + scenarioReport.count()",
    interactionCount >= interviewCount + scenarioCount,
    `interactionReport=${interactionCount}, interviewReport=${interviewCount}, scenarioReport=${scenarioCount}`
  );

  const interviewIds = new Set((await prisma.interviewReport.findMany({ select: { id: true } })).map((r) => r.id));
  const scenarioIds = new Set((await prisma.scenarioReport.findMany({ select: { id: true } })).map((r) => r.id));
  const interactionIds = new Set((await prisma.interactionReport.findMany({ select: { id: true } })).map((r) => r.id));

  const missingFromInterview = [...interviewIds].filter((id) => !interactionIds.has(id));
  const missingFromScenario = [...scenarioIds].filter((id) => !interactionIds.has(id));

  check(
    "every InterviewReport id has a matching InteractionReport id",
    missingFromInterview.length === 0,
    `missing: ${JSON.stringify(missingFromInterview)}`
  );
  check(
    "every ScenarioReport id has a matching InteractionReport id",
    missingFromScenario.length === 0,
    `missing: ${JSON.stringify(missingFromScenario)}`
  );

  // --- 2. Per-row field assertions ---------------------------------------
  section("2. Per-row field assertions (InterviewReport)");

  const interviewRows = await prisma.interviewReport.findMany();
  for (const row of interviewRows) {
    const twin = await prisma.interactionReport.findUnique({ where: { id: row.id } });
    if (!twin) {
      check(`twin exists for interview ${row.id}`, false);
      continue;
    }
    check(`[${row.id}] status`, twin.status === row.status);
    check(`[${row.id}] turnCount`, twin.turnCount === row.turnCount);
    check(`[${row.id}] cameraMode`, twin.cameraMode === row.cameraMode);
    check(`[${row.id}] visualMetrics`, jsonEqual(twin.visualMetrics, row.visualMetrics));
    check(`[${row.id}] vocalMetrics`, jsonEqual(twin.vocalMetrics, row.vocalMetrics));
    check(`[${row.id}] visualUnscoredReason`, twin.visualUnscoredReason === row.visualUnscoredReason);
    check(`[${row.id}] vocalUnscoredReason`, twin.vocalUnscoredReason === row.vocalUnscoredReason);
    check(`[${row.id}] reportStructured`, jsonEqual(twin.reportStructured, row.reportStructured));
    check(`[${row.id}] reportMarkdown`, twin.reportMarkdown === row.reportMarkdown);
    check(`[${row.id}] failureReason`, twin.failureReason === row.failureReason);
    check(`[${row.id}] evalModel`, twin.evalModel === row.evalModel);
    check(`[${row.id}] startedAt`, twin.startedAt.getTime() === row.startedAt.getTime());
    check(`[${row.id}] completedAt`, deepEqual(twin.completedAt, row.completedAt));
    check(`[${row.id}] createdAt`, twin.createdAt.getTime() === row.createdAt.getTime());
    check(`[${row.id}] updatedAt`, twin.updatedAt.getTime() === row.updatedAt.getTime());

    // Score-map assertion
    const scores = twin.scores as Record<string, number | null> | null;
    check(`[${row.id}] scores.visual`, scores?.visual === row.visualScore);
    check(`[${row.id}] scores.vocal`, scores?.vocal === row.vocalScore);
    check(`[${row.id}] scores.content`, scores?.content === row.contentScore);
    check(`[${row.id}] scores.behavioral`, scores?.behavioral === row.behavioralScore);
    if (row.visualScore === null) {
      check(`[${row.id}] null visualScore stayed null (not coerced to 0)`, scores?.visual === null);
    }

    // Snapshot assertion — ten typed columns round-trip through inputSnapshot.
    const snap = twin.inputSnapshot as Record<string, unknown> | null;
    if (snap && snap.kind === "interview") {
      check(`[${row.id}] snapshot.interviewerAvatarId`, snap.interviewerAvatarId === row.interviewerAvatarId);
      check(`[${row.id}] snapshot.interviewerName`, snap.interviewerName === row.interviewerName);
      check(`[${row.id}] snapshot.resumeId`, snap.resumeId === row.resumeId);
      check(`[${row.id}] snapshot.resumeText`, snap.resumeText === row.resumeText);
      check(`[${row.id}] snapshot.industry`, snap.industry === row.industry);
      check(`[${row.id}] snapshot.roleTitle`, snap.roleTitle === row.roleTitle);
      check(`[${row.id}] snapshot.difficulty`, snap.difficulty === row.difficulty);
      check(`[${row.id}] snapshot.targetMinutes`, snap.targetMinutes === row.targetMinutes);
      check(`[${row.id}] snapshot.targetQuestionCount`, snap.targetQuestionCount === row.targetQuestionCount);
      check(`[${row.id}] snapshot.interviewerPersona`, snap.interviewerPersona === row.interviewerPersona);
    } else {
      check(`[${row.id}] snapshot has kind "interview"`, false, `got ${JSON.stringify(snap)}`);
    }
  }

  section("2. Per-row field assertions (ScenarioReport)");

  const scenarioRows = await prisma.scenarioReport.findMany();
  for (const row of scenarioRows) {
    const twin = await prisma.interactionReport.findUnique({ where: { id: row.id } });
    if (!twin) {
      check(`twin exists for scenario ${row.id}`, false);
      continue;
    }
    check(`[${row.id}] status`, twin.status === row.status);
    check(`[${row.id}] turnCount`, twin.turnCount === row.turnCount);
    check(`[${row.id}] cameraMode`, twin.cameraMode === row.cameraMode);
    check(`[${row.id}] visualMetrics`, jsonEqual(twin.visualMetrics, row.visualMetrics));
    check(`[${row.id}] vocalMetrics`, jsonEqual(twin.vocalMetrics, row.vocalMetrics));
    check(`[${row.id}] visualUnscoredReason`, twin.visualUnscoredReason === row.visualUnscoredReason);
    check(`[${row.id}] vocalUnscoredReason`, twin.vocalUnscoredReason === row.vocalUnscoredReason);
    check(`[${row.id}] reportStructured`, jsonEqual(twin.reportStructured, row.reportStructured));
    check(`[${row.id}] reportMarkdown`, twin.reportMarkdown === row.reportMarkdown);
    check(`[${row.id}] failureReason`, twin.failureReason === row.failureReason);
    check(`[${row.id}] evalModel`, twin.evalModel === row.evalModel);
    check(`[${row.id}] startedAt`, twin.startedAt.getTime() === row.startedAt.getTime());
    check(`[${row.id}] completedAt`, deepEqual(twin.completedAt, row.completedAt));
    check(`[${row.id}] createdAt`, twin.createdAt.getTime() === row.createdAt.getTime());
    check(`[${row.id}] updatedAt`, twin.updatedAt.getTime() === row.updatedAt.getTime());
    check(`[${row.id}] typeSlug === "case-study"`, twin.typeSlug === "case-study");
    check(`[${row.id}] interactionLogId`, twin.interactionLogId === row.interactionLogId);
    check(`[${row.id}] studentEmail`, twin.studentEmail === row.studentEmail);

    const scores = twin.scores as Record<string, number | null> | null;
    check(`[${row.id}] scores.visual`, scores?.visual === row.visualScore);
    check(`[${row.id}] scores.vocal`, scores?.vocal === row.vocalScore);
    check(`[${row.id}] scores.content`, scores?.content === row.contentScore);
    check(`[${row.id}] scores.behavioral`, scores?.behavioral === row.behavioralScore);
    if (row.visualScore === null) {
      check(`[${row.id}] null visualScore stayed null (not coerced to 0)`, scores?.visual === null);
    }

    const snap = twin.inputSnapshot as Record<string, unknown> | null;
    if (snap && snap.kind === "scenario") {
      check(`[${row.id}] snapshot.caseId`, snap.caseId === row.caseId && typeof snap.caseId === "string");
      check(`[${row.id}] snapshot.caseName`, snap.caseName === row.caseName);
      check(`[${row.id}] snapshot.background`, snap.background === row.backgroundSnapshot);
      check(`[${row.id}] snapshot.avatars`, jsonEqual(row.avatarsSnapshot, snap.avatars));
      check(`[${row.id}] snapshot.criteria`, snap.criteria === row.criteriaSnapshot);
    } else {
      check(`[${row.id}] snapshot has kind "scenario"`, false, `got ${JSON.stringify(snap)}`);
    }
  }

  // --- 3. NULL-PRESERVATION assertion -------------------------------------
  section("3. NULL-PRESERVATION assertion (pre-Phase-10 rows)");

  const legacyInterviewRows = interviewRows.filter((r) => r.cameraMode === null);
  const legacyScenarioRows = scenarioRows.filter((r) => r.cameraMode === null);

  check(
    "at least one legacy (cameraMode === null) interview row exists to test",
    legacyInterviewRows.length > 0,
    `found ${legacyInterviewRows.length}`
  );
  check(
    "at least one legacy (cameraMode === null) scenario row exists to test",
    legacyScenarioRows.length > 0,
    `found ${legacyScenarioRows.length}`
  );

  for (const row of [...legacyInterviewRows, ...legacyScenarioRows]) {
    const twin = await prisma.interactionReport.findUnique({ where: { id: row.id } });
    check(`[${row.id}] cameraMode stayed null`, twin?.cameraMode === null);
    check(`[${row.id}] visualUnscoredReason stayed null`, twin?.visualUnscoredReason === null);
    check(`[${row.id}] vocalUnscoredReason stayed null`, twin?.vocalUnscoredReason === null);
  }

  // --- 4. Idempotency assertion --------------------------------------------
  section("4. Idempotency assertion (second backfill run)");

  const sampleId = interviewRows[0]?.id;
  const before = sampleId ? await prisma.interactionReport.findUnique({ where: { id: sampleId } }) : null;
  const countBefore = await prisma.interactionReport.count();

  const { execSync } = await import("child_process");
  execSync("npx tsx scripts/backfill-interaction-reports.ts", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });

  const countAfter = await prisma.interactionReport.count();
  const after = sampleId ? await prisma.interactionReport.findUnique({ where: { id: sampleId } }) : null;

  check("row count unchanged after second backfill run", countBefore === countAfter, `${countBefore} -> ${countAfter}`);
  if (before && after) {
    const { updatedAt: _u1, ...beforeRest } = before;
    const { updatedAt: _u2, ...afterRest } = after;
    check("sampled row content unchanged (updatedAt excluded)", deepEqual(beforeRest, afterRest));
  }

  // --- Summary --------------------------------------------------------------
  section("Summary");
  if (failures === 0) {
    console.log("ALL CHECKS PASSED");
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
  }

  return failures;
}

run()
  .then((failures) => {
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("Verifier crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
