/**
 * Proves plan 21-21's mapping, hook-site, and no-second-copy invariants.
 *
 * Sections 1-3 run with NO env vars at all (no DATABASE_URL, no API keys) —
 * the coached-skip ordering guard deliberately lives here rather than at
 * 21-20's human UAT, because the ONLY way to prove the locked
 * "LIVE_SESSION > COACHED_SESSION" ordering can never be violated is to
 * prove it mechanically, in this plan's own wave.
 *
 * Section 4 needs a live database and prints an explicit SKIP when
 * DATABASE_URL is unset.
 *
 * Run: npx tsx scripts/verify-live-session-ingestion.ts
 * Run with DB: DATABASE_URL="postgresql://..." npx tsx scripts/verify-live-session-ingestion.ts
 */
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";

import { contributionInputsFromScoreMap } from "../lib/mastery/from-report";
import { normalizeRubricScore, CONTRIBUTION_WEIGHTS } from "../lib/mastery/weights";
import { competencyForDimension } from "../lib/mastery/competencies";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function skip(name: string) {
  console.log(`  SKIP ${name}`);
}

const REPO_ROOT = path.resolve(__dirname, "..");
const FROM_REPORT_PATH = path.join(REPO_ROOT, "lib/mastery/from-report.ts");
const RUNNER_PATH = path.join(REPO_ROOT, "lib/engine/evaluation-runner.ts");

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

/** Recursively lists every .ts file under a directory, skipping node_modules. */
function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

const LIB_DIR = path.join(REPO_ROOT, "lib");
const ALL_LIB_FILES = walkTsFiles(LIB_DIR);

console.log("1. ONE NORMALIZER, NO COPIES");
{
  const fromReportSrc = readRepoFile("lib/mastery/from-report.ts");
  check(
    "from-report.ts imports normalizeRubricScore from weights.ts",
    /import\s*\{[^}]*normalizeRubricScore[^}]*\}\s*from\s*["']@\/lib\/mastery\/weights["']/.test(
      fromReportSrc
    )
  );
  check(
    "from-report.ts does not restate `score - 1` arithmetic",
    !/score\s*-\s*1/.test(fromReportSrc)
  );

  const offenders = ALL_LIB_FILES.filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    return src.includes("- 1) / 4");
  }).map((f) => path.relative(REPO_ROOT, f));

  check(
    "`- 1) / 4` appears in exactly one file: lib/mastery/weights.ts",
    offenders.length === 1 && offenders[0] === "lib/mastery/weights.ts",
    `offenders: ${JSON.stringify(offenders)}`
  );

  check("normalizeRubricScore(1) is 0", normalizeRubricScore(1) === 0);
  check("normalizeRubricScore(5) is 1", normalizeRubricScore(5) === 1);
}

console.log("\n2. MAPPING, no database");
{
  const NOW = new Date("2026-10-20T12:00:00Z");
  const USER_ID = "test-user";
  const REPORT_ID = "test-report";

  // Pick two dimension keys that genuinely share a competency, per
  // lib/mastery/competencies.ts's real grouping (visual + vocal both map to
  // delivery_presence).
  const KEY_A = "visual"; // -> delivery_presence
  const KEY_B = "vocal"; // -> delivery_presence
  const competencyAB = competencyForDimension(KEY_A);
  check(
    "fixture assumption: visual and vocal share a competency",
    competencyAB !== null && competencyAB === competencyForDimension(KEY_B)
  );

  // 2a. Every shared dimension scored 3 -> one input per competency, rawScore 0.5.
  {
    const result = contributionInputsFromScoreMap({
      scores: { visual: 3, vocal: 3, content: 3, behavioral: 3 },
      userId: USER_ID,
      source: "LIVE_SESSION",
      occurredAt: NOW,
      sourceReportId: REPORT_ID,
    });
    check(
      "a scored-3 map yields one input per represented competency, each rawScore 0.5",
      result.inputs.every((i) => i.rawScore === 0.5),
      JSON.stringify(result.inputs)
    );
    check("no null dimensions reported", result.nullDimensions.length === 0);
    check("no unmapped dimensions reported", result.unmappedDimensions.length === 0);
  }

  // 2b. A null dimension is skipped and reported; a competency whose every
  // mapped dimension is null yields NO input at all for that competency.
  {
    const result = contributionInputsFromScoreMap({
      scores: { visual: null, vocal: null, content: 4 },
      userId: USER_ID,
      source: "LIVE_SESSION",
      occurredAt: NOW,
      sourceReportId: REPORT_ID,
    });
    check(
      "null dimensions (visual, vocal) are both reported",
      result.nullDimensions.includes("visual") && result.nullDimensions.includes("vocal"),
      JSON.stringify(result.nullDimensions)
    );
    const deliveryPresenceInput = result.inputs.find(
      (i) => i.competencyKey === "delivery_presence"
    );
    check(
      "the competency whose only mapped dimensions were null has NO input at all",
      deliveryPresenceInput === undefined,
      JSON.stringify(result.inputs)
    );
  }

  // 2c. An unmapped dimension key is reported and produces no input, never
  // attached to a default competency.
  {
    const result = contributionInputsFromScoreMap({
      scores: { visual: 4, __phantom_dimension__: 5 },
      userId: USER_ID,
      source: "LIVE_SESSION",
      occurredAt: NOW,
      sourceReportId: REPORT_ID,
    });
    check(
      "the phantom dimension key is reported as unmapped",
      result.unmappedDimensions.includes("__phantom_dimension__"),
      JSON.stringify(result.unmappedDimensions)
    );
    check(
      "no input carries the phantom key as a competencyKey",
      result.inputs.every((i) => (i.competencyKey as string) !== "__phantom_dimension__")
    );
  }

  // 2d. Mean is over NORMALIZED values: scores 2 and 4 -> normalized 0.25
  // and 0.75 -> mean 0.5 (not normalized-after-meaning, which would differ
  // off the midpoint on a non-linear scale — pinned here even though this
  // particular scale is linear, so a future non-linear normalizer change is
  // caught).
  {
    const result = contributionInputsFromScoreMap({
      scores: { visual: 2, vocal: 4 },
      userId: USER_ID,
      source: "LIVE_SESSION",
      occurredAt: NOW,
      sourceReportId: REPORT_ID,
    });
    const input = result.inputs.find((i) => i.competencyKey === "delivery_presence");
    check(
      "mean of normalized(2)=0.25 and normalized(4)=0.75 is 0.5",
      input !== undefined && Math.abs(input.rawScore - 0.5) < 1e-9,
      JSON.stringify(input)
    );
  }

  // 2e. INVERTED ASSERTION: every dimension null -> empty input array, not
  // zeros. Then prove a deliberately-wrong variant (nulls coerced to 1)
  // WOULD produce inputs, so this assertion discriminates rather than
  // passing vacuously.
  {
    const scores = { visual: null, vocal: null, content: null, behavioral: null };
    const result = contributionInputsFromScoreMap({
      scores,
      userId: USER_ID,
      source: "LIVE_SESSION",
      occurredAt: NOW,
      sourceReportId: REPORT_ID,
    });
    check(
      "all-null score map yields an EMPTY input array",
      result.inputs.length === 0,
      JSON.stringify(result.inputs)
    );

    // Deliberately-wrong variant: coerce nulls to 1 before mapping, proving
    // the real code path's null-skip is load-bearing and not just a quirk
    // of an all-zero result looking the same as empty.
    const coercedScores: Record<string, number> = {};
    for (const [k, v] of Object.entries(scores)) {
      coercedScores[k] = v === null ? 1 : v;
    }
    const coercedResult = contributionInputsFromScoreMap({
      scores: coercedScores,
      userId: USER_ID,
      source: "LIVE_SESSION",
      occurredAt: NOW,
      sourceReportId: REPORT_ID,
    });
    check(
      "the null-coerced-to-1 variant WOULD produce inputs (proves the real path's emptiness is not vacuous)",
      coercedResult.inputs.length > 0,
      JSON.stringify(coercedResult.inputs)
    );
  }
}

console.log("\n3. HOOK SITE AND NO SECOND COPY");
{
  const runnerSrc = readRepoFile("lib/engine/evaluation-runner.ts");

  const readyIdx = runnerSrc.indexOf('status: "READY"');
  const hookIdx = runnerSrc.indexOf("recordLiveSessionContributions(");
  check("evaluation-runner.ts contains recordLiveSessionContributions", hookIdx !== -1);
  check(
    "the hook call appears AFTER the first status: \"READY\" occurrence",
    readyIdx !== -1 && hookIdx > readyIdx,
    `readyIdx=${readyIdx}, hookIdx=${hookIdx}`
  );

  // Find the CALL site specifically (not the import line), i.e. the second
  // occurrence of the identifier.
  const firstOccurrence = runnerSrc.indexOf("recordLiveSessionContributions(");
  const importIdx = runnerSrc.indexOf("import { recordLiveSessionContributions }");
  const callIdx =
    importIdx !== -1 && firstOccurrence === runnerSrc.indexOf("recordLiveSessionContributions(", 0)
      ? runnerSrc.indexOf(
          "recordLiveSessionContributions(",
          importIdx + "import { recordLiveSessionContributions }".length
        )
      : firstOccurrence;

  const preceding = runnerSrc.slice(Math.max(0, callIdx - 400), callIdx);
  const following = runnerSrc.slice(callIdx, callIdx + 600);
  check(
    "a `try {` occurs within the preceding 400 characters of the call",
    preceding.includes("try {"),
    preceding
  );
  check(
    "a `catch` occurs within the following 600 characters of the call",
    following.includes("catch"),
    following
  );

  // NO SECOND COPY (REQ-124): competencyForDimension imported in at most TWO
  // non-test files.
  const competencyImporters = ALL_LIB_FILES.filter((f) => {
    if (f.includes(".test.") || f.includes("__tests__")) return false;
    const src = fs.readFileSync(f, "utf8");
    return /competencyForDimension/.test(src) && !f.endsWith("lib/mastery/competencies.ts");
  }).map((f) => path.relative(REPO_ROOT, f));

  check(
    "competencyForDimension is imported in at most TWO non-test files (excluding its own definition)",
    competencyImporters.length <= 2,
    `importers: ${JSON.stringify(competencyImporters)}`
  );

  const coachedContributionPath = path.join(REPO_ROOT, "lib/study-plan/coached/contribution.ts");
  if (fs.existsSync(coachedContributionPath)) {
    const coachedSrc = fs.readFileSync(coachedContributionPath, "utf8");
    // Phase 22 (22-09): the coach grades against one competency directly, so
    // there is no dimension mapping to delegate and no report to read.
    check(
      "lib/study-plan/coached/contribution.ts does NOT import contributionsFromReport (Phase 22: no InteractionReport)",
      !/from\s+["']@\/lib\/mastery\/from-report["']/.test(coachedSrc)
    );
    check(
      "lib/study-plan/coached/contribution.ts does NOT import competencyForDimension directly",
      !/competencyForDimension/.test(coachedSrc)
    );
  } else {
    skip(
      "lib/study-plan/coached/contribution.ts delegation check (21-16 has not run yet — file does not exist)"
    );
  }

  // COACHED SKIP PRECEDES MAPPING — text-level, no database required. This
  // is the point: the guard protecting the locked ordering must be provable
  // without credentials, in THIS plan's own wave.
  function isolateFunctionBody(src: string, signatureNeedle: string): string | null {
    const declIdx = src.indexOf(signatureNeedle);
    if (declIdx === -1) return null;
    const after = src.slice(declIdx);
    const nextExportIdx = after.indexOf("export ", signatureNeedle.length);
    return nextExportIdx === -1 ? after : after.slice(0, nextExportIdx);
  }

  const SIGNATURE = "export async function recordLiveSessionContributions";
  const fromReportSrc = readRepoFile("lib/mastery/from-report.ts");
  const slice = isolateFunctionBody(fromReportSrc, SIGNATURE);
  check("recordLiveSessionContributions function body is isolatable", slice !== null);

  if (slice !== null) {
    const idxCoached = slice.indexOf("coachedSession");
    const idxAlreadyIngested = slice.indexOf("already-ingested");
    const idxMappingCall = slice.indexOf("contributionsFromReport(");

    check(
      "slice contains `coachedSession`",
      idxCoached !== -1
    );
    check(
      "slice contains the \"coached-session\" return value",
      slice.includes('"coached-session"')
    );
    check(
      "coachedSession check precedes the mapping call (contributionsFromReport()",
      idxCoached !== -1 && idxMappingCall !== -1 && idxCoached < idxMappingCall,
      `idxCoached=${idxCoached}, idxMappingCall=${idxMappingCall}`
    );
    check(
      "coachedSession check precedes the idempotence (\"already-ingested\") check",
      idxCoached !== -1 && idxAlreadyIngested !== -1 && idxCoached < idxAlreadyIngested,
      `idxCoached=${idxCoached}, idxAlreadyIngested=${idxAlreadyIngested}`
    );

    // INVERTED ASSERTION: construct the same slice with the coached block
    // deleted, and assert the three checks above FAIL on it — so the
    // assertions above are proven non-vacuous (they do not merely pass
    // because the file happens to mention "coachedSession" in a comment).
    const coachedBlockPattern =
      /const coached = await prisma\.coachedSession\.findFirst\([\s\S]*?return \{ written: 0, skipped: "coached-session" \};\s*\}\n\n/;
    const guardDeletedSlice = slice.replace(coachedBlockPattern, "");
    check(
      "the guard-deleted variant actually differs from the original slice",
      guardDeletedSlice !== slice,
      `lengths: original=${slice.length}, deleted=${guardDeletedSlice.length}`
    );

    const delIdxCoached = guardDeletedSlice.indexOf("coachedSession");
    const delIdxMapping = guardDeletedSlice.indexOf("contributionsFromReport(");
    const delIdxAlready = guardDeletedSlice.indexOf("already-ingested");

    check(
      "guard-deleted variant: `coachedSession` is absent entirely (the strongest possible failure of the 'precedes' checks)",
      delIdxCoached === -1,
      `delIdxCoached=${delIdxCoached}`
    );
    check(
      "guard-deleted variant: the 'precedes mapping' assertion correctly FAILS (coachedSession absent)",
      !(delIdxCoached !== -1 && delIdxMapping !== -1 && delIdxCoached < delIdxMapping)
    );
    check(
      "guard-deleted variant: the 'precedes idempotence' assertion correctly FAILS (coachedSession absent)",
      !(delIdxCoached !== -1 && delIdxAlready !== -1 && delIdxCoached < delIdxAlready)
    );
  }
}

async function runDatabaseSection() {
  // Phase 23: the hook must fire for EVERY interaction type (interview, case
  // study, networking, pitch, difficult conversation). It lives in the one
  // type-agnostic evaluator; prove no typeSlug branch gates it.
  {
    console.log("\n3b. HOOK IS TYPE-AGNOSTIC");
    const runner = fs.readFileSync(RUNNER_PATH, "utf8");
    const gateIssues = (src: string): string[] => {
      const fnStart = src.indexOf("export async function runAndPersistEvaluation");
      const hook = src.indexOf("recordLiveSessionContributions({", fnStart);
      if (fnStart === -1 || hook === -1) return ["hook or function not found"];
      const body = src.slice(fnStart, hook);
      return /typeSlug\s*[!=]==|switch\s*\(\s*[\w.]*typeSlug/.test(body) ? ["typeSlug branch before hook"] : [];
    };
    check("no typeSlug branch precedes the ingestion hook in runAndPersistEvaluation", gateIssues(runner).length === 0, JSON.stringify(gateIssues(runner)));
    const mutated = runner.replace(
      "        const ingested = await recordLiveSessionContributions({",
      "        if (report.typeSlug === \"general\") {}\n        const ingested = await recordLiveSessionContributions({"
    );
    check("bite: a typeSlug gate inserted before the hook is caught", mutated !== runner && gateIssues(mutated).length > 0);
  }

  if (!process.env.DATABASE_URL) {
    skip("4. END TO END (no DATABASE_URL set)");
    return;
  }

  console.log("\n4. END TO END — requires a database");

  const { prisma } = await import("../lib/prisma");
  const { recordLiveSessionContributions } = await import("../lib/mastery/from-report");
  const { readContributions } = await import("../lib/mastery/ledger");

  const reportIds: string[] = [];
  const userIds: string[] = [];
  const pathStepIds: string[] = [];
  const studyPlanIds: string[] = [];
  const coachedSessionIds: string[] = [];

  try {
    const email = `live-session-ingestion-verify-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Live Ingestion Verify", role: "STUDENT" },
    });
    userIds.push(user.id);

    const startedAt = new Date("2026-09-01T10:00:00Z");

    const report = await prisma.interactionReport.create({
      data: {
        userId: user.id,
        typeSlug: "general",
        status: "PENDING",
        scores: { visual: 3, vocal: null, content: 4, behavioral: 5 },
        startedAt,
      },
    });
    reportIds.push(report.id);

    // Dry run (Phase 23 backfill): same guards and mapping, no write.
    const dryResult = await recordLiveSessionContributions({ reportId: report.id, dryRun: true });
    const rowsAfterDry = await prisma.masteryContribution.count({ where: { sourceReportId: report.id } });
    check(
      "dryRun maps rows but writes none (written 0, mappedInputCount > 0, 0 rows in DB)",
      dryResult.written === 0 && (dryResult.mappedInputCount ?? 0) > 0 && rowsAfterDry === 0,
      JSON.stringify({ dryResult, rowsAfterDry })
    );
    check(
      "dryRun reports the null dimension (vocal) rather than dropping it silently",
      (dryResult.nullDimensions ?? []).includes("vocal") && (dryResult.unmappedDimensions ?? []).length === 0,
      JSON.stringify(dryResult)
    );

    // First call: writes rows.
    const firstResult = await recordLiveSessionContributions({ reportId: report.id });
    check(
      "first call writes at least one LIVE_SESSION row and skips nothing",
      firstResult.written > 0 && firstResult.skipped === null,
      JSON.stringify(firstResult)
    );

    const rows = await prisma.masteryContribution.findMany({
      where: { sourceReportId: report.id },
    });
    check(
      "every written row has source LIVE_SESSION",
      rows.every((r) => r.source === "LIVE_SESSION"),
      JSON.stringify(rows.map((r) => r.source))
    );
    check(
      "every written row's weight equals CONTRIBUTION_WEIGHTS.LIVE_SESSION (1.00)",
      rows.every((r) => r.weight === CONTRIBUTION_WEIGHTS.LIVE_SESSION),
      JSON.stringify(rows.map((r) => r.weight))
    );
    check(
      "every written row's occurredAt equals the report's startedAt, not the current time",
      rows.every((r) => r.occurredAt.getTime() === startedAt.getTime()),
      JSON.stringify(rows.map((r) => r.occurredAt))
    );

    // Second call: idempotent.
    const secondResult = await recordLiveSessionContributions({ reportId: report.id });
    check(
      "second call returns written:0, skipped:'already-ingested'",
      secondResult.written === 0 && secondResult.skipped === "already-ingested",
      JSON.stringify(secondResult)
    );
    const rowsAfterSecond = await prisma.masteryContribution.findMany({
      where: { sourceReportId: report.id },
    });
    check(
      "row count unchanged after the second call",
      rowsAfterSecond.length === rows.length,
      `before=${rows.length}, after=${rowsAfterSecond.length}`
    );

    // THE assertion that would have caught the gap: readContributions sees
    // the rows this hook wrote, so the figure 21-09 computes is non-zero.
    const readRows = await readContributions(user.id);
    check(
      "readContributions(userId) returns the rows this hook wrote (21-09's figure is non-zero)",
      readRows.length >= rows.length,
      `readContributions returned ${readRows.length}, expected >= ${rows.length}`
    );

    // COACHED REPORT WRITES NOTHING LIVE.
    const coachedReportStartedAt = new Date("2026-09-02T10:00:00Z");
    const coachedReport = await prisma.interactionReport.create({
      data: {
        userId: user.id,
        typeSlug: "general",
        status: "PENDING",
        scores: { visual: 3, vocal: 4, content: 4, behavioral: 5 },
        startedAt: coachedReportStartedAt,
      },
    });
    reportIds.push(coachedReport.id);

    const studyPlan = await prisma.studyPlan.create({
      data: {
        userId: user.id,
        title: "Verify coached skip",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-live-session-ingestion-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(studyPlan.id);

    const studyPlanPath = await prisma.studyPlanPath.create({
      data: {
        studyPlanId: studyPlan.id,
        userId: user.id,
        selectionSnapshot: {} as unknown as object,
      },
    });

    const pathStep = await prisma.studyPlanPathStep.create({
      data: {
        pathId: studyPlanPath.id,
        position: 1,
        kind: "COACHED_SESSION",
        competencyKey: "delivery_presence",
        selectionReason: "verify-live-session-ingestion fixture",
        status: "PENDING",
      },
    });
    pathStepIds.push(pathStep.id);

    const coachedSession = await prisma.coachedSession.create({
      data: {
        userId: user.id,
        pathStepId: pathStep.id,
        competencyKey: "delivery_presence",
        replaySourceReportId: report.id,
        replayTurnIndex: 0,
        freshScenarioPrompt: "verify-live-session-ingestion fixture prompt",
        reportId: coachedReport.id,
      },
    });
    coachedSessionIds.push(coachedSession.id);

    const coachedCallResult = await recordLiveSessionContributions({
      reportId: coachedReport.id,
    });
    check(
      "a coached report's call returns written:0, skipped:'coached-session'",
      coachedCallResult.written === 0 && coachedCallResult.skipped === "coached-session",
      JSON.stringify(coachedCallResult)
    );

    const liveRowsForCoachedReport = await prisma.masteryContribution.findMany({
      where: { sourceReportId: coachedReport.id, source: "LIVE_SESSION" },
    });
    check(
      "ZERO LIVE_SESSION rows exist for the coached report's sourceReportId",
      liveRowsForCoachedReport.length === 0,
      JSON.stringify(liveRowsForCoachedReport)
    );

    // Discrimination proof: the same call, same shape, differing only in
    // whether a CoachedSession exists — the non-coached report DID write
    // rows (asserted above), the coached one did not (asserted just now).
    // Without this guard, the coached report would contribute 1.00 here
    // plus 21-16's 0.40 = 1.40, against an unaided session's 1.00 — inverting
    // the locked LIVE_SESSION > COACHED_SESSION ordering.
    check(
      "discrimination holds: non-coached wrote rows, coached wrote none, same call shape",
      rows.length > 0 && liveRowsForCoachedReport.length === 0
    );

    // Cross-user derivation: a report belonging to a DIFFERENT user still
    // ingests under its OWN owner's userId, never the caller's ambient state
    // (the function takes only a report id).
    const otherEmail = `live-session-ingestion-verify-other-${randomUUID()}@example.com`;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Live Ingestion Verify Other", role: "STUDENT" },
    });
    userIds.push(otherUser.id);

    const otherStartedAt = new Date("2026-09-03T10:00:00Z");
    const otherReport = await prisma.interactionReport.create({
      data: {
        userId: otherUser.id,
        typeSlug: "general",
        status: "PENDING",
        scores: { visual: 4, vocal: 4, content: 4, behavioral: 4 },
        startedAt: otherStartedAt,
      },
    });
    reportIds.push(otherReport.id);

    await recordLiveSessionContributions({ reportId: otherReport.id });
    const otherRows = await prisma.masteryContribution.findMany({
      where: { sourceReportId: otherReport.id },
    });
    check(
      "a report belonging to a different user ingests rows under ITS OWN owner's userId",
      otherRows.length > 0 && otherRows.every((r) => r.userId === otherUser.id),
      JSON.stringify(otherRows.map((r) => r.userId))
    );
  } finally {
    if (coachedSessionIds.length > 0) {
      await prisma.coachedSession.deleteMany({ where: { id: { in: coachedSessionIds } } });
    }
    if (pathStepIds.length > 0) {
      await prisma.studyPlanPathStep.deleteMany({ where: { id: { in: pathStepIds } } });
    }
    if (studyPlanIds.length > 0) {
      await prisma.studyPlanPath.deleteMany({ where: { studyPlanId: { in: studyPlanIds } } });
      await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    }
    if (reportIds.length > 0) {
      await prisma.masteryContribution.deleteMany({
        where: { sourceReportId: { in: reportIds } },
      });
      await prisma.interactionReport.deleteMany({ where: { id: { in: reportIds } } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    const { prisma: p } = await import("../lib/prisma");
    await p.$disconnect();
  }
}

runDatabaseSection()
  .then(() => {
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("verify-live-session-ingestion crashed:", err);
    process.exit(1);
  });
