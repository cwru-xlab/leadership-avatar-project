/**
 * Plan 21-23: prove coached mode has exactly ONE HTTP entry point, that its
 * REPLAY-then-FRESH ordering cannot be skipped, that the tip gate actually
 * sits inside `tipsForLeg`, that `finishCoachedSession` runs before
 * `recordCoachedContribution`, and — against a live database — that
 * `enterCoachedStep` is idempotent/deterministic, the replay text is
 * byte-identical to the stored transcript, and a coached report does not
 * ALSO produce a `LIVE_SESSION` mastery contribution (21-21's guard).
 *
 * Style mirrors scripts/verify-coached-mode-isolation.ts and
 * scripts/verify-path-model.ts. Sections 1-3 run with NO env vars. Section 4
 * needs a live database and prints an explicit SKIP when DATABASE_URL is
 * unset.
 *
 * Run:         npx tsx scripts/verify-coached-entry.ts
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *                npx tsx scripts/verify-coached-entry.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { COACHED_PHASES } from "../lib/study-plan/coached/instance";
import {
  nextLeg,
  type CoachedPhase,
  type CoachedAction,
  type LegTransitionResult,
} from "../lib/study-plan/coached/runtime";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string) {
  console.log(`  FAIL ${msg}`);
  failures += 1;
}

function ok(msg: string) {
  console.log(`  ok   ${msg}`);
}

function skip(msg: string) {
  console.log(`  SKIP ${msg}`);
}

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    ok(name);
  } else {
    fail(`${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function abs(...parts: string[]) {
  return join(ROOT, ...parts);
}

function rel(p: string) {
  return relative(ROOT, p).replace(/\\/g, "/");
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".git" ||
      name === ".tmp" ||
      name === "coverage" ||
      name === ".planning"
    ) {
      continue;
    }
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function read(relPath: string): string {
  return readFileSync(abs(...relPath.split("/")), "utf8");
}

// ---------------------------------------------------------------------------
console.log("\n1. ENTRY SURFACE — exactly one app/api/ route reaches coached mode, by a non-vacuous walk");
{
  const apiRoot = abs("app", "api");
  const routeFiles = walkFiles(apiRoot)
    .filter((f) => f.endsWith("route.ts") || f.endsWith("route.tsx"))
    .map((f) => rel(f));

  console.log(`  walked ${routeFiles.length} route.ts file(s) under app/api/`);
  check(
    "walked route count is greater than 10 (the walk is provably non-vacuous)",
    routeFiles.length > 10,
    `walked=${routeFiles.length}`,
  );

  const entryRe = /\b(enterCoachedStep|completeCoachedSession)\b/;
  const matching = routeFiles.filter((f) => entryRe.test(readFileSync(abs(...f.split("/")), "utf8")));

  console.log(`  matching route(s): ${matching.join(", ") || "(none)"}`);
  check(
    "exactly one app/api/ route mentions enterCoachedStep or completeCoachedSession",
    matching.length === 1,
    `matching=[${matching.join(", ")}]`,
  );
  check(
    'that one route is app/api/study-plans/path-steps/[stepId]/coached/route.ts',
    matching[0] === "app/api/study-plans/path-steps/[stepId]/coached/route.ts",
    `actual: ${matching[0]}`,
  );

  // Re-run 21-12's negative guard here too: the walk ran BEFORE this plan's
  // runtime/route existed, and the guard must be repeated once something
  // exists that could leak coached-mode identifiers into normal practice.
  const practiceRoots = ["components/practice", "app/practice"];
  const walkedPractice = practiceRoots
    .flatMap((root) => walkFiles(abs(...root.split("/"))))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => rel(f));

  check(
    "practice-tree walk is non-vacuous (greater than 5 files)",
    walkedPractice.length > 5,
    `walked=${walkedPractice.length}`,
  );

  const forbiddenImportRe =
    /from\s+["'](?:@\/lib\/study-plan\/coached(?:\/[^"']*)?|(?:\.\.\/)+study-plan\/coached(?:\/[^"']*)?)["']/;
  const forbiddenIdentRe = /\b(CoachedSession|coachTip|techniqueReminder|COACHED_PHASES)\b/;

  for (const f of walkedPractice) {
    const src = readFileSync(abs(...f.split("/")), "utf8");
    check(`no coached-mode import leaked into: ${f}`, !forbiddenImportRe.test(src));
    check(`no coached-mode identifier leaked into: ${f}`, !forbiddenIdentRe.test(src));
  }
}

// ---------------------------------------------------------------------------
console.log("\n2. LEG ORDERING — no database, with an inverted (permissive-variant) assertion");
{
  const LEG_TRANSITION_TABLE: Array<{
    current: CoachedPhase;
    action: CoachedAction;
    expected: LegTransitionResult;
  }> = [
    { current: "REPLAY", action: "advance", expected: "FRESH" },
    { current: "REPLAY", action: "complete", expected: "REJECTED" },
    { current: "FRESH", action: "advance", expected: "REJECTED" },
    { current: "FRESH", action: "complete", expected: "COMPLETE" },
    { current: "COMPLETE", action: "advance", expected: "REJECTED" },
    { current: "COMPLETE", action: "complete", expected: "REJECTED" },
  ];

  function tableHolds(fn: (c: CoachedPhase, a: CoachedAction) => LegTransitionResult): boolean {
    return LEG_TRANSITION_TABLE.every((row) => fn(row.current, row.action) === row.expected);
  }

  for (const row of LEG_TRANSITION_TABLE) {
    check(
      `nextLeg(${row.current}, ${row.action}) === ${row.expected}`,
      nextLeg(row.current, row.action) === row.expected,
      `actual: ${nextLeg(row.current, row.action)}`,
    );
  }

  check(
    "the full leg-transition table holds against the real nextLeg",
    tableHolds(nextLeg),
  );

  // INVERTED ASSERTION: a deliberately-permissive variant that allows
  // REPLAY + complete to reach COMPLETE (skipping FRESH entirely) must be
  // CAUGHT by this same table comparison — a silently-permissive transition
  // would void REQ-114 while every other verifier passed.
  function permissiveNextLeg(current: CoachedPhase, action: CoachedAction): LegTransitionResult {
    if (current === "REPLAY" && action === "advance") return "FRESH";
    if (current === "REPLAY" && action === "complete") return "COMPLETE"; // THE BUG
    if (current === "FRESH" && action === "complete") return "COMPLETE";
    return "REJECTED";
  }

  check(
    "the permissive variant is CAUGHT (table does NOT hold against it) — the checker reports the violation",
    !tableHolds(permissiveNextLeg),
  );

  check(
    'COACHED_PHASES[0] === "REPLAY" (the LOCKED first leg)',
    COACHED_PHASES[0] === "REPLAY",
    `COACHED_PHASES=${JSON.stringify(COACHED_PHASES)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. TIP GATE AND FINISH SEQUENCE — source assertions on runtime.ts");
{
  const src = read("lib/study-plan/coached/runtime.ts");

  // Locate tipsForLeg's body: from its `export async function tipsForLeg`
  // declaration to the next top-level `export` after it.
  const tipsForLegStart = src.indexOf("export async function tipsForLeg");
  check("tipsForLeg is declared", tipsForLegStart !== -1);

  const nextExportAfterTipsForLeg = src.indexOf("\nexport ", tipsForLegStart + "export async function tipsForLeg".length);
  const tipsForLegBody = src.slice(
    tipsForLegStart,
    nextExportAfterTipsForLeg === -1 ? src.length : nextExportAfterTipsForLeg,
  );

  check(
    "assertTipSafe appears inside tipsForLeg's body",
    /assertTipSafe/.test(tipsForLegBody),
  );
  check(
    "techniquesForCompetency appears inside tipsForLeg's body (tips are drawn from the library, not hand-written here)",
    /techniquesForCompetency/.test(tipsForLegBody),
  );

  // FINISH SEQUENCE: finishCoachedSession's CALL (not its import) must occur
  // strictly before recordCoachedContribution's CALL, and each must appear
  // exactly once as a call. Matched with a trailing "(" so the named-import
  // line (no parenthesis) never counts as a call-site occurrence.
  const finishCallRe = /finishCoachedSession\s*\(/g;
  const contributionCallRe = /recordCoachedContribution\s*\(/g;

  const finishCalls = [...src.matchAll(finishCallRe)];
  const contributionCalls = [...src.matchAll(contributionCallRe)];

  check(
    "finishCoachedSession is called exactly once",
    finishCalls.length === 1,
    `count=${finishCalls.length}`,
  );
  check(
    "recordCoachedContribution is called exactly once",
    contributionCalls.length === 1,
    `count=${contributionCalls.length}`,
  );
  check(
    "finishCoachedSession's call index is LESS than recordCoachedContribution's — " +
      "recordCoachedContribution requires completedAt/reportId and throws otherwise, so calling it " +
      "first always fails; this is a correctness property, not a style preference",
    finishCalls.length === 1 &&
      contributionCalls.length === 1 &&
      finishCalls[0].index! < contributionCalls[0].index!,
    `finishIndex=${finishCalls[0]?.index} contributionIndex=${contributionCalls[0]?.index}`,
  );

  check(
    "runtime.ts does NOT call prisma.interactionReport.create (the report comes from the engine's own session machinery)",
    !/prisma\.interactionReport\.create/.test(src),
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. END TO END — requires a database");
async function runDatabaseSection() {
  if (!process.env.DATABASE_URL) {
    skip("4. END TO END (no DATABASE_URL set)");
    return;
  }

  const { prisma } = await import("../lib/prisma");
  const { createPath, markStepComplete } = await import("../lib/study-plan/path");
  const { s3Storage } = await import("../lib/s3-client");
  const { initialProgress } = await import("../lib/interview/types");
  const { CONTRIBUTION_WEIGHTS } = await import("../lib/mastery/weights");
  const { recordLiveSessionContributions } = await import("../lib/mastery/from-report");
  const {
    enterCoachedStep,
    advanceToFresh,
    completeCoachedSession,
    CoachedLegOrderError,
  } = await import("../lib/study-plan/coached/runtime");
  const { NotReachableOutsideAPathError } = await import("../lib/study-plan/coached/instance");

  const COMPETENCY_KEY = "delivery_presence" as const;

  const testId = randomUUID();
  const email = `coached-entry-verify-${testId}@example.com`;
  const otherEmail = `coached-entry-verify-other-${testId}@example.com`;

  let userId = "";
  let otherUserId = "";
  const studyPlanIds: string[] = [];
  const reportIds: string[] = [];

  function makeTurn(role: "user" | "assistant", content: string, timestamp: number) {
    return { role, content, timestamp };
  }

  function makeSteps(competencyKey: typeof COMPETENCY_KEY) {
    return [
      {
        position: 1,
        kind: "KNOWLEDGE_CHECK" as const,
        competencyKey,
        selectionReason: "verify-coached-entry: knowledge check step",
        knowledgeCheckId: "kc-stub-id",
        coachedSessionId: null,
      },
      {
        position: 2,
        kind: "COACHED_SESSION" as const,
        competencyKey,
        selectionReason: "verify-coached-entry: coached session step (entered)",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 3,
        kind: "COACHED_SESSION" as const,
        competencyKey,
        selectionReason: "verify-coached-entry: coached session step (never entered)",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 4,
        kind: "UNAIDED_SESSION" as const,
        competencyKey,
        selectionReason: "verify-coached-entry: unaided step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 5,
        kind: "UNAIDED_SESSION" as const,
        competencyKey,
        selectionReason: "verify-coached-entry: unaided step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
    ];
  }

  async function makeReportWithTranscript(
    owner: string,
    visualScore: number,
    knownTurnContent: string,
  ) {
    const report = await prisma.interactionReport.create({
      data: {
        userId: owner,
        typeSlug: "general",
        turnCount: 3,
        transcriptKey: "pending",
        scores: { visual: visualScore } as unknown as object,
      },
    });
    reportIds.push(report.id);

    const startedAt = Date.now() - 60_000;
    const transcript = {
      version: 1 as const,
      reportId: report.id,
      userId: owner,
      typeSlug: "general",
      interviewer: { avatarId: null, name: null },
      startedAt,
      updatedAt: Date.now(),
      turns: [
        makeTurn("assistant", "Tell me about a time you led under pressure.", startedAt + 1000),
        makeTurn("user", knownTurnContent, startedAt + 2000),
        makeTurn("assistant", "Thank you.", startedAt + 3000),
      ],
      progress: initialProgress(),
    };
    const key = await s3Storage.saveInterviewTranscript(owner, report.id, transcript);
    await prisma.interactionReport.update({ where: { id: report.id }, data: { transcriptKey: key } });

    return { report, transcript };
  }

  try {
    const user = await prisma.user.create({
      data: { email, name: "Coached Entry Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Coached Entry Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    // A WEAK report (visual=2 -> normalized 0.25) and a STRONGER report
    // (visual=4 -> normalized 0.75) — the weak one must be the one selected.
    const WEAK_LINE =
      "I think maybe we could possibly try to think about doing something like that eventually.";
    const STRONG_LINE =
      "I will own the rollout plan and report back by Friday with concrete numbers.";

    const { report: weakReport } = await makeReportWithTranscript(userId, 2, WEAK_LINE);
    await makeReportWithTranscript(userId, 4, STRONG_LINE);

    const plan = await prisma.studyPlan.create({
      data: {
        userId,
        title: "Coached Entry Verify Plan",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: reportIds as unknown as object,
        sourceReportCount: reportIds.length,
        generationModel: "verify-coached-entry-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(plan.id);

    const path = await createPath({
      userId,
      studyPlanId: plan.id,
      steps: makeSteps(COMPETENCY_KEY),
      selectionSnapshot: { note: "verify-coached-entry" },
    });

    const knowledgeCheckStep = path.steps.find((s) => s.kind === "KNOWLEDGE_CHECK")!;
    const coachedStep = path.steps.find(
      (s) => s.kind === "COACHED_SESSION" && s.position === 2,
    )!;
    const neverEnteredCoachedStep = path.steps.find(
      (s) => s.kind === "COACHED_SESSION" && s.position === 3,
    )!;

    // enterCoachedStep on a KNOWLEDGE_CHECK step throws.
    let threwOnWrongKind = false;
    try {
      await enterCoachedStep({ userId, stepId: knowledgeCheckStep.id });
    } catch (err) {
      threwOnWrongKind = err instanceof NotReachableOutsideAPathError;
    }
    check("enterCoachedStep on a KNOWLEDGE_CHECK step throws", threwOnWrongKind);

    // enterCoachedStep on another user's step throws.
    let threwOnForeignStep = false;
    try {
      await enterCoachedStep({ userId: otherUserId, stepId: coachedStep.id });
    } catch (err) {
      threwOnForeignStep = err instanceof NotReachableOutsideAPathError;
    }
    check("enterCoachedStep on another user's step throws", threwOnForeignStep);

    // markStepComplete on the step BEFORE entry throws (21-08's reject half,
    // exercised through the real flow — the never-entered sibling step).
    let threwOnPrematureComplete = false;
    try {
      await markStepComplete(userId, neverEnteredCoachedStep.id);
    } catch {
      threwOnPrematureComplete = true;
    }
    check("markStepComplete on the step BEFORE entry throws", threwOnPrematureComplete);

    // enterCoachedStep CREATES the session, selects the WEAK report
    // deterministically, writes coachedSessionId back, returns REPLAY, and
    // the replay text is BYTE-IDENTICAL (===) to the stored transcript turn.
    const firstLeg = await enterCoachedStep({ userId, stepId: coachedStep.id });
    check("enterCoachedStep returns leg REPLAY on first entry", firstLeg.leg === "REPLAY");
    check(
      "enterCoachedStep selected the WEAK-scoring report deterministically",
      firstLeg.replayMoment?.sourceReportId === weakReport.id,
      `actual sourceReportId=${firstLeg.replayMoment?.sourceReportId}`,
    );
    check(
      "replayMoment.text is BYTE-IDENTICAL (===) to the stored transcript turn",
      firstLeg.replayMoment?.text === WEAK_LINE,
      `actual="${firstLeg.replayMoment?.text}"`,
    );
    check(
      "every returned tip passed the tip gate (non-empty reminder text)",
      firstLeg.tips.every((t) => typeof t.reminder === "string" && t.reminder.length > 0),
    );

    const stepAfterEntry = await prisma.studyPlanPathStep.findUnique({
      where: { id: coachedStep.id },
    });
    check(
      "coachedSessionId was written back onto the step",
      stepAfterEntry?.coachedSessionId === firstLeg.coachedSessionId,
    );

    // A second enterCoachedStep is idempotent and deterministic.
    const secondLeg = await enterCoachedStep({ userId, stepId: coachedStep.id });
    check(
      "a second enterCoachedStep returns the SAME coachedSessionId",
      secondLeg.coachedSessionId === firstLeg.coachedSessionId,
    );
    check(
      "a second enterCoachedStep returns the SAME replay moment",
      secondLeg.replayMoment?.text === firstLeg.replayMoment?.text &&
        secondLeg.replayMoment?.turnIndex === firstLeg.replayMoment?.turnIndex,
    );
    check(
      "a second enterCoachedStep returns the SAME tips",
      JSON.stringify(secondLeg.tips) === JSON.stringify(firstLeg.tips),
    );

    const contributionCountBefore = await prisma.masteryContribution.count({ where: { userId } });

    // completeCoachedSession while in REPLAY throws and writes no contribution.
    let threwOnCompleteFromReplay = false;
    try {
      await completeCoachedSession({
        userId,
        coachedSessionId: firstLeg.coachedSessionId,
        reportId: weakReport.id,
      });
    } catch (err) {
      threwOnCompleteFromReplay = err instanceof CoachedLegOrderError;
    }
    check(
      "completeCoachedSession while in REPLAY throws CoachedLegOrderError",
      threwOnCompleteFromReplay,
    );
    const contributionCountAfterRejectedComplete = await prisma.masteryContribution.count({
      where: { userId },
    });
    check(
      "the rejected completeCoachedSession call wrote NO contribution",
      contributionCountAfterRejectedComplete === contributionCountBefore,
    );

    // advanceToFresh then completeCoachedSession: the REPLAY leg's own live
    // conversation produces its own report (simulated here as a second,
    // already-READY report — the engine's own session machinery is what
    // actually produces this in production).
    const { report: replayLegReport } = await makeReportWithTranscript(
      userId,
      3,
      "A third report, standing in for the REPLAY leg's own live conversation.",
    );
    const freshLeg = await advanceToFresh({
      userId,
      coachedSessionId: firstLeg.coachedSessionId,
      replayReportId: replayLegReport.id,
    });
    check("advanceToFresh returns leg FRESH", freshLeg.leg === "FRESH");

    const { report: freshLegReport } = await makeReportWithTranscript(
      userId,
      5,
      "A fourth report, standing in for the FRESH leg's own live conversation.",
    );
    // FRESH leg's own report must itself score the competency for
    // recordCoachedContribution to write a row.
    await prisma.interactionReport.update({
      where: { id: freshLegReport.id },
      data: { scores: { visual: 4 } as unknown as object },
    });

    const { contributionsWritten } = await completeCoachedSession({
      userId,
      coachedSessionId: firstLeg.coachedSessionId,
      reportId: freshLegReport.id,
    });
    check("completeCoachedSession writes at least one contribution", contributionsWritten >= 1);

    const stepAfterComplete = await prisma.studyPlanPathStep.findUnique({
      where: { id: coachedStep.id },
    });
    check(
      "the step becomes COMPLETE",
      stepAfterComplete?.status === "COMPLETE",
      `status=${stepAfterComplete?.status}`,
    );

    const coachedRows = await prisma.masteryContribution.findMany({
      where: { userId, source: "COACHED_SESSION", sourceReportId: freshLegReport.id },
    });
    check(
      "readContributions shows exactly one COACHED_SESSION row for the FRESH report",
      coachedRows.length === 1,
      `count=${coachedRows.length}`,
    );
    check(
      `the COACHED_SESSION row's weight === CONTRIBUTION_WEIGHTS.COACHED_SESSION (${CONTRIBUTION_WEIGHTS.COACHED_SESSION})`,
      coachedRows[0]?.weight === CONTRIBUTION_WEIGHTS.COACHED_SESSION,
      `actual weight=${coachedRows[0]?.weight}`,
    );
    check(
      "CONTRIBUTION_WEIGHTS.COACHED_SESSION is strictly less than CONTRIBUTION_WEIGHTS.LIVE_SESSION",
      CONTRIBUTION_WEIGHTS.COACHED_SESSION < CONTRIBUTION_WEIGHTS.LIVE_SESSION,
    );

    // A second completeCoachedSession adds no further rows — the session is
    // now COMPLETE, so the order guard rejects before any mapping work runs.
    let threwOnSecondComplete = false;
    try {
      await completeCoachedSession({
        userId,
        coachedSessionId: firstLeg.coachedSessionId,
        reportId: freshLegReport.id,
      });
    } catch {
      threwOnSecondComplete = true;
    }
    check("a second completeCoachedSession throws (session is already COMPLETE)", threwOnSecondComplete);
    const coachedRowsAfterRetry = await prisma.masteryContribution.findMany({
      where: { userId, source: "COACHED_SESSION", sourceReportId: freshLegReport.id },
    });
    check(
      "a second completeCoachedSession adds NO further rows",
      coachedRowsAfterRetry.length === coachedRows.length,
      `before=${coachedRows.length} after=${coachedRowsAfterRetry.length}`,
    );

    // END-TO-END CONFIRMATION of 21-21's unconditional coached-session skip
    // guard, reached through the real coached flow and the FRESH report's
    // real id. If this ever returns anything other than
    // skipped: "coached-session" with written: 0, that is a REAL FINDING —
    // the guard was dropped, moved after the mapping call, or made
    // conditional in lib/mastery/from-report.ts. That file is NOT in this
    // plan's files_modified; escalate rather than "fixing" it here.
    const liveIngestionResult = await recordLiveSessionContributions({ reportId: freshLegReport.id });
    const guardHeld = liveIngestionResult.skipped === "coached-session" && liveIngestionResult.written === 0;
    if (!guardHeld) {
      console.log(
        "  ESCALATE: 21-21's recordLiveSessionContributions coached-session guard did NOT hold " +
          `for a real coached report (result=${JSON.stringify(liveIngestionResult)}). This is a real ` +
          "finding in lib/mastery/from-report.ts, not a bug in this verifier — do not patch it from " +
          "this plan's files_modified.",
      );
    }
    check(
      "recordLiveSessionContributions skips the coached report (skipped: \"coached-session\", written: 0)",
      guardHeld,
      `actual=${JSON.stringify(liveIngestionResult)}`,
    );

    const liveRowsForCoachedReport = await prisma.masteryContribution.count({
      where: { sourceReportId: freshLegReport.id, source: "LIVE_SESSION" },
    });
    check(
      "ZERO LIVE_SESSION rows exist for the coached session's report",
      liveRowsForCoachedReport === 0,
      `count=${liveRowsForCoachedReport}`,
    );
  } finally {
    if (reportIds.length > 0) {
      await prisma.coachedSession.deleteMany({ where: { replaySourceReportId: { in: reportIds } } });
      await prisma.masteryContribution.deleteMany({ where: { sourceReportId: { in: reportIds } } });
      await prisma.interactionReport.deleteMany({ where: { id: { in: reportIds } } });
    }
    if (studyPlanIds.length > 0) {
      await prisma.studyPlanPath.deleteMany({ where: { studyPlanId: { in: studyPlanIds } } });
      await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
    await prisma.$disconnect();
  }
}

runDatabaseSection()
  .then(() => {
    if (failures === 0) {
      console.log("\nverify-coached-entry: ALL SECTIONS PASSED\n");
      process.exit(0);
    } else {
      console.log(`\nverify-coached-entry: FAILED (${failures} failure(s))\n`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
