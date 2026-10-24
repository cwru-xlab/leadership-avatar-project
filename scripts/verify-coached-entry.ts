/**
 * Plan 21-23: prove coached mode has exactly ONE HTTP entry point, that its
 * REPLAY-then-FRESH ordering cannot be skipped, that the tip gate actually
 * sits inside `tipsForLeg`, that `finishCoachedSession` runs before
 * `recordCoachedContribution`, and — against a live database — that
 * `enterCoachedStep` selects two real moments (stubbed scorer), is
 * idempotent/deterministic, the moment text is byte-identical to the stored
 * transcript, the coach (not an engine session) closes each leg, no
 * InteractionReport is produced, and a Phase 21 session is re-targeted.
 * (Updated in 22-12 from the Phase 21 report-based flow.)
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

  // 22-12: a thin-evidence session (no fresh moment) completes after its one leg.
  check(
    "thin evidence: nextLeg(REPLAY, complete, {hasFreshMoment:false}) === COMPLETE",
    nextLeg("REPLAY", "complete", { hasFreshMoment: false }) === "COMPLETE",
  );
  check(
    "thin evidence: nextLeg(REPLAY, advance, {hasFreshMoment:false}) === REJECTED",
    nextLeg("REPLAY", "advance", { hasFreshMoment: false }) === "REJECTED",
  );

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
    "runtime.ts does NOT call prisma.interactionReport.create (Phase 22: a coached session produces no report)",
    !/prisma\.interactionReport\.create/.test(src),
  );
  check(
    "runtime.ts references no engine session transport or generated scenario",
    !/interaction\/chat|practice\/session|liveSystemPrompt|freshScenario/.test(src),
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
  const {
    enterCoachedStep,
    advanceToFresh,
    completeCoachedSession,
    CoachedLegOrderError,
    CoachedLegNotDoneError,
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
        selectionReason: "verify-coached-entry: coached session step (legacy)",
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

  // Two substantive student turns per report, so selection has real candidates.
  async function makeReportWithTranscript(owner: string, lines: [string, string]) {
    const report = await prisma.interactionReport.create({
      data: {
        userId: owner,
        typeSlug: "general",
        status: "READY",
        turnCount: 5,
        transcriptKey: "pending",
        scores: { visual: 2 } as unknown as object,
        // Moments are built from growth-area timecodes (turn i at 0:i0).
        reportStructured: {
          overall_summary: "verify",
          strengths: [],
          growth_areas: [
            { title: "Verify growth", detail: "d", suggestion: "s", timecodes: ["0:10", "0:30"], source: null, dimension: null },
          ],
          category_notes: { visual: null, vocal: null, content: null, behavioral: null },
          rubric_notes: [],
          practice_next: "verify",
        } as unknown as object,
      },
    });
    reportIds.push(report.id);

    const startedAt = 1_700_000_000_000;
    const t = (role: "user" | "assistant", content: string, i: number) => ({
      role,
      content,
      timestamp: startedAt + i * 10_000,
    });
    const transcript = {
      version: 1 as const,
      reportId: report.id,
      userId: owner,
      typeSlug: "general",
      interviewer: { avatarId: null, name: null },
      startedAt,
      updatedAt: Date.now(),
      turns: [
        t("assistant", "Tell me about a time you led under pressure.", 0),
        t("user", lines[0], 1),
        t("assistant", "What happened next with the team?", 2),
        t("user", lines[1], 3),
        t("assistant", "Thank you.", 4),
      ],
      progress: initialProgress(),
    };
    const key = await s3Storage.saveInterviewTranscript(owner, report.id, transcript);
    await prisma.interactionReport.update({ where: { id: report.id }, data: { transcriptKey: key } });
    return report;
  }

  // Stub scorer: a distinct, deterministic score per line. No model call.
  const WEAK_LINE =
    "I think maybe we could possibly try to think about doing something like that eventually.";
  const MID_LINE =
    "I told the team that the release would slip because we had not tested the payment flow properly.";
  const STRONG_LINE =
    "I will own the rollout plan and report back by Friday with concrete numbers for everyone.";
  const OTHER_LINE =
    "Then I asked each owner to commit to a date and I wrote those dates in the shared channel.";
  const scorer = async ({ turns }: { turns: Array<{ turnIndex: number; studentText: string }> }) =>
    turns.map((tr) => {
      const score = tr.studentText === WEAK_LINE ? 1 : tr.studentText === MID_LINE ? 2 : tr.studentText === OTHER_LINE ? 3 : 4;
      return { turnIndex: tr.turnIndex, evidencesCompetency: true, score, rationale: "stub" };
    });

  try {
    const user = await prisma.user.create({
      data: { email, name: "Coached Entry Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Coached Entry Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    const weakReport = await makeReportWithTranscript(userId, [WEAK_LINE, STRONG_LINE]);
    const midReport = await makeReportWithTranscript(userId, [MID_LINE, OTHER_LINE]);

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
    const coachedStep = path.steps.find((s) => s.kind === "COACHED_SESSION" && s.position === 2)!;
    const legacyStep = path.steps.find((s) => s.kind === "COACHED_SESSION" && s.position === 3)!;

    let threwOnWrongKind = false;
    try {
      await enterCoachedStep({ userId, stepId: knowledgeCheckStep.id }, { scorer });
    } catch (err) {
      threwOnWrongKind = err instanceof NotReachableOutsideAPathError;
    }
    check("enterCoachedStep on a KNOWLEDGE_CHECK step throws", threwOnWrongKind);

    let threwOnForeignStep = false;
    try {
      await enterCoachedStep({ userId: otherUserId, stepId: coachedStep.id }, { scorer });
    } catch (err) {
      threwOnForeignStep = err instanceof NotReachableOutsideAPathError;
    }
    check("enterCoachedStep on another user's step throws", threwOnForeignStep);

    let threwOnPrematureComplete = false;
    try {
      await markStepComplete(userId, coachedStep.id);
    } catch {
      threwOnPrematureComplete = true;
    }
    check("markStepComplete on the step BEFORE entry throws", threwOnPrematureComplete);

    const reportCountBefore = await prisma.interactionReport.count({ where: { userId } });

    // First entry: two real moments, REPLAY first, never turn 0, verbatim.
    const firstLeg = await enterCoachedStep({ userId, stepId: coachedStep.id }, { scorer });
    check("enterCoachedStep returns leg REPLAY on first entry", firstLeg.leg === "REPLAY");
    check("a two-moment session has legCount 2 and is not thin", firstLeg.legCount === 2 && !firstLeg.thinEvidence);
    check(
      "the REPLAY moment is the lowest-scored one, from the WEAK report, text byte-identical (===)",
      firstLeg.moment?.sourceReportId === weakReport.id && firstLeg.moment?.studentLine === WEAK_LINE,
      `actual=${JSON.stringify(firstLeg.moment)}`,
    );
    check("the REPLAY moment is not turn 0", (firstLeg.moment?.turnIndex ?? 0) > 0);
    check(
      "the counterpart line is the nearest preceding avatar turn, verbatim",
      firstLeg.moment?.counterpartLine === "Tell me about a time you led under pressure.",
    );
    check(
      "every returned tip passed the tip gate (non-empty reminder text)",
      firstLeg.tips.every((t) => typeof t.reminder === "string" && t.reminder.length > 0),
    );

    const stored = await prisma.coachedSession.findUnique({ where: { id: firstLeg.coachedSessionId } });
    check(
      "the stored session has a distinct fresh moment and a selectionBasis",
      !!stored?.freshSourceReportId &&
        !(stored.freshSourceReportId === stored.replaySourceReportId && stored.freshTurnIndex === stored.replayTurnIndex) &&
        stored.selectionBasis === "PER_TURN_SCORE" &&
        stored.freshScenarioPrompt === null,
    );

    const stepAfterEntry = await prisma.studyPlanPathStep.findUnique({ where: { id: coachedStep.id } });
    check(
      "coachedSessionId was written back onto the step",
      stepAfterEntry?.coachedSessionId === firstLeg.coachedSessionId,
    );

    const secondLeg = await enterCoachedStep({ userId, stepId: coachedStep.id }, { scorer });
    check(
      "a second enterCoachedStep returns the SAME session, moment and tips",
      secondLeg.coachedSessionId === firstLeg.coachedSessionId &&
        secondLeg.moment?.studentLine === firstLeg.moment?.studentLine &&
        JSON.stringify(secondLeg.tips) === JSON.stringify(firstLeg.tips),
    );

    const contributionCountBefore = await prisma.masteryContribution.count({ where: { userId } });

    // The coach closes legs. Seed coach rows directly (no model): the coach
    // battery (verify-coach-turn) proves how these rows are produced.
    async function seedClosedLeg(leg: "REPLAY" | "FRESH", seqStart: number, score: number) {
      await prisma.coachedTurn.createMany({
        data: [
          { coachedSessionId: firstLeg.coachedSessionId, leg, seq: seqStart, speaker: "COACH", move: "OPEN", awaiting: "REPLY", text: "What were you aiming for?" },
          { coachedSessionId: firstLeg.coachedSessionId, leg, seq: seqStart + 1, speaker: "STUDENT", move: "ATTEMPT", text: "I will own it and report Friday.", score, acceptable: true, parroted: false, spokenDurationMs: 4000 },
          { coachedSessionId: firstLeg.coachedSessionId, leg, seq: seqStart + 2, speaker: "COACH", move: "LEG_DONE", awaiting: "NONE", text: "That is the move.", closedAtSoftCap: false },
        ],
      });
    }

    // Nothing may advance or complete before the coach closes the leg.
    let threwNotDone = false;
    try {
      await advanceToFresh({ userId, coachedSessionId: firstLeg.coachedSessionId });
    } catch (err) {
      threwNotDone = err instanceof CoachedLegNotDoneError;
    }
    check("advanceToFresh before the coach closes REPLAY throws CoachedLegNotDoneError", threwNotDone);

    let threwOnCompleteFromReplay = false;
    try {
      await completeCoachedSession({ userId, coachedSessionId: firstLeg.coachedSessionId });
    } catch (err) {
      threwOnCompleteFromReplay = err instanceof CoachedLegOrderError;
    }
    check("completeCoachedSession while in REPLAY (two legs) throws CoachedLegOrderError", threwOnCompleteFromReplay);
    check(
      "the rejected calls wrote NO contribution",
      (await prisma.masteryContribution.count({ where: { userId } })) === contributionCountBefore,
    );

    await seedClosedLeg("REPLAY", 1, 4);
    const freshLeg = await advanceToFresh({ userId, coachedSessionId: firstLeg.coachedSessionId });
    check("advanceToFresh returns leg FRESH after the coach closed REPLAY", freshLeg.leg === "FRESH");
    check(
      "the FRESH leg shows the second real moment, not the replay one",
      !!freshLeg.moment && freshLeg.moment.studentLine !== WEAK_LINE && freshLeg.conversation.length === 0,
    );

    let threwCompleteBeforeFreshDone = false;
    try {
      await completeCoachedSession({ userId, coachedSessionId: firstLeg.coachedSessionId });
    } catch (err) {
      threwCompleteBeforeFreshDone = err instanceof CoachedLegNotDoneError;
    }
    check("completeCoachedSession before the coach closes FRESH throws CoachedLegNotDoneError", threwCompleteBeforeFreshDone);

    await seedClosedLeg("FRESH", 4, 5);
    const { contributionsWritten } = await completeCoachedSession({
      userId,
      coachedSessionId: firstLeg.coachedSessionId,
    });
    check("completeCoachedSession writes at least one contribution", contributionsWritten >= 1);

    const stepAfterComplete = await prisma.studyPlanPathStep.findUnique({ where: { id: coachedStep.id } });
    check("the step becomes COMPLETE", stepAfterComplete?.status === "COMPLETE", `status=${stepAfterComplete?.status}`);

    const coachedRows = await prisma.masteryContribution.findMany({
      where: { userId, source: "COACHED_SESSION", sourceCoachedSessionId: firstLeg.coachedSessionId },
    });
    check("COACHED_SESSION rows exist for the session", coachedRows.length >= 1, `count=${coachedRows.length}`);
    check(
      `every COACHED_SESSION row's weight === CONTRIBUTION_WEIGHTS.COACHED_SESSION (${CONTRIBUTION_WEIGHTS.COACHED_SESSION})`,
      coachedRows.every((r) => r.weight === CONTRIBUTION_WEIGHTS.COACHED_SESSION),
    );
    check(
      "CONTRIBUTION_WEIGHTS.COACHED_SESSION is strictly less than CONTRIBUTION_WEIGHTS.LIVE_SESSION",
      CONTRIBUTION_WEIGHTS.COACHED_SESSION < CONTRIBUTION_WEIGHTS.LIVE_SESSION,
    );

    let threwOnSecondComplete = false;
    try {
      await completeCoachedSession({ userId, coachedSessionId: firstLeg.coachedSessionId });
    } catch {
      threwOnSecondComplete = true;
    }
    check("a second completeCoachedSession throws (session is already COMPLETE)", threwOnSecondComplete);
    check(
      "a second completeCoachedSession adds NO further rows",
      (await prisma.masteryContribution.count({
        where: { userId, source: "COACHED_SESSION", sourceCoachedSessionId: firstLeg.coachedSessionId },
      })) === coachedRows.length,
    );

    check(
      "the whole coached flow produced NO InteractionReport and no LIVE_SESSION row",
      (await prisma.interactionReport.count({ where: { userId } })) === reportCountBefore &&
        (await prisma.masteryContribution.count({ where: { userId, source: "LIVE_SESSION" } })) === 0,
    );

    // Phase 21 legacy session: a GET leaves it untouched, a POST re-targets it.
    const legacy = await prisma.coachedSession.create({
      data: {
        userId,
        pathStepId: legacyStep.id,
        competencyKey: COMPETENCY_KEY,
        replaySourceReportId: midReport.id,
        replayTurnIndex: 1,
        freshScenarioPrompt: "A generated Phase 21 scenario.",
      },
    });
    await prisma.studyPlanPathStep.update({ where: { id: legacyStep.id }, data: { coachedSessionId: legacy.id } });

    await enterCoachedStep({ userId, stepId: legacyStep.id }, { createIfMissing: false, scorer });
    const legacyAfterGet = await prisma.coachedSession.findUnique({ where: { id: legacy.id } });
    check("a GET does not re-target a legacy session", legacyAfterGet?.selectionBasis === null);

    await enterCoachedStep({ userId, stepId: legacyStep.id }, { scorer });
    const legacyAfterPost = await prisma.coachedSession.findUnique({ where: { id: legacy.id } });
    check(
      "a POST re-targets a legacy unworked session to real moments",
      legacyAfterPost?.selectionBasis === "PER_TURN_SCORE" && !!legacyAfterPost.freshSourceReportId,
    );
  } finally {
    if (reportIds.length > 0) {
      await prisma.coachedSession.deleteMany({ where: { replaySourceReportId: { in: reportIds } } });
      await prisma.masteryContribution.deleteMany({ where: { userId } });
      await prisma.momentCompetencyScore.deleteMany({ where: { reportId: { in: reportIds } } });
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
