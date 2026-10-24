/**
 * Proves plan 21-16's two mechanisms and the coached-weight mastery write.
 *
 * Style mirrors scripts/verify-mastery-weights.ts and
 * scripts/verify-coached-mode-isolation.ts. Sections 1-3 are pure and run
 * with no DATABASE_URL. Section 4 needs a live database and prints an
 * explicit SKIP when DATABASE_URL is unset.
 *
 * Run:         npx tsx scripts/verify-coach-tips.ts
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *                npx tsx scripts/verify-coach-tips.ts
 */
import { randomUUID } from "node:crypto";

import { COMPETENCIES } from "../lib/mastery/competencies";
import { CONTRIBUTION_WEIGHTS } from "../lib/mastery/weights";
import {
  TECHNIQUE_LIBRARY,
  SCRIPT_CUE_PHRASES,
  MAX_TIP_LENGTH,
  validateTip,
  assertTipSafe,
  techniquesForCompetency,
  validateDemonstration,
  validateCoachSpeech,
  isParrotOf,
  MAX_DEMONSTRATIONS_PER_LEG,
  DEMONSTRATION_REJECT_REASONS,
  COACH_SPEECH_REJECT_REASONS,
} from "../lib/study-plan/coached/tips";

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

console.log("1. LIBRARY COVERAGE AND SAFETY");
{
  for (const competency of COMPETENCIES) {
    const techniques = techniquesForCompetency(competency.key);
    check(
      `${competency.key} has at least 3 techniques`,
      techniques.length >= 3,
      `got ${techniques.length}`,
    );
  }

  for (const technique of TECHNIQUE_LIBRARY) {
    const result = validateTip(technique.reminder, {
      studentLine: "an unrelated student line about something else entirely",
    });
    check(
      `library entry "${technique.id}" passes its own rejector`,
      result.ok,
      JSON.stringify(result),
    );
    check(
      `library entry "${technique.id}" contains no double quote character`,
      !technique.reminder.includes('"'),
    );
    check(
      `library entry "${technique.id}" is under MAX_TIP_LENGTH`,
      technique.reminder.length <= MAX_TIP_LENGTH,
      `length ${technique.reminder.length}`,
    );
  }
}

console.log("\n2. REJECTION CASES, with near-misses that must PASS");
{
  // CONTAINS_QUOTED_SPEECH
  {
    const reject = validateTip(
      'Try this: "I understand your concern but the deadline is fixed"',
      { studentLine: "x" },
    );
    check(
      "CONTAINS_QUOTED_SPEECH: a 4+ word quoted span is rejected",
      !reject.ok && reject.reason === "CONTAINS_QUOTED_SPEECH",
      JSON.stringify(reject),
    );

    const pass = validateTip('Use the "call it out" move.', { studentLine: "x" });
    check(
      "near-miss PASSES: a 3-word quoted term of art, under the 4-word threshold",
      pass.ok,
      JSON.stringify(pass),
    );
  }

  // CONTAINS_SCRIPT_CUE — every phrase in the list must actually fire.
  {
    for (const phrase of SCRIPT_CUE_PHRASES) {
      const tip = `Before you respond, ${phrase} this to the student.`;
      const result = validateTip(tip, { studentLine: "an unrelated student line" });
      check(
        `CONTAINS_SCRIPT_CUE fires for phrase "${phrase}"`,
        !result.ok && result.reason === "CONTAINS_SCRIPT_CUE",
        JSON.stringify(result),
      );
    }
  }

  // CONTAINS_FIRST_PERSON_LINE
  {
    const reject = validateTip("I hear you, and the decision still stands.", {
      studentLine: "x",
    });
    check(
      "CONTAINS_FIRST_PERSON_LINE: a 6+ word first-person declarative is rejected",
      !reject.ok && reject.reason === "CONTAINS_FIRST_PERSON_LINE",
      JSON.stringify(reject),
    );

    const pass = validateTip("I'd focus on pacing.", { studentLine: "x" });
    check(
      "near-miss PASSES: a 4-word first-person sentence, under the 6-word threshold, clearly coach-voice",
      pass.ok,
      JSON.stringify(pass),
    );
  }

  // TOO_LONG
  {
    const longTip = "Focus on your delivery and keep your pacing even. ".repeat(6).slice(0, 300);
    check("fixture: the TOO_LONG tip is actually 300 characters", longTip.length === 300);
    const reject = validateTip(longTip, { studentLine: "x" });
    check(
      "TOO_LONG: a 300-character tip is rejected",
      !reject.ok && reject.reason === "TOO_LONG",
      JSON.stringify(reject),
    );
  }

  // ECHOES_STUDENT_LINE
  {
    const studentLine = "I think we should probably push the deadline back a bit";
    const reject = validateTip(
      "Remember to say we should probably push the deadline next time.",
      { studentLine },
    );
    check(
      "ECHOES_STUDENT_LINE: a 6+ word span shared with the student's line is rejected",
      !reject.ok && reject.reason === "ECHOES_STUDENT_LINE",
      JSON.stringify(reject),
    );

    const pass = validateTip("Try to push the deadline gently next time.", { studentLine });
    check(
      "near-miss PASSES: a 3-word shared span ('push the deadline'), under the 6-word threshold",
      pass.ok,
      JSON.stringify(pass),
    );
  }

  // assertTipSafe throws on every rejection case and does not throw on every
  // passing case.
  {
    const rejectionCases: Array<{ tip: string; studentLine: string }> = [
      {
        tip: 'Try this: "I understand your concern but the deadline is fixed"',
        studentLine: "x",
      },
      {
        tip: "Before you respond, try saying this to the student.",
        studentLine: "an unrelated student line",
      },
      { tip: "I hear you, and the decision still stands.", studentLine: "x" },
      {
        tip: "Focus on your delivery and keep your pacing even. ".repeat(6).slice(0, 300),
        studentLine: "x",
      },
      {
        tip: "Remember to say we should probably push the deadline next time.",
        studentLine: "I think we should probably push the deadline back a bit",
      },
    ];
    for (const { tip, studentLine } of rejectionCases) {
      let threw = false;
      try {
        assertTipSafe(tip, { studentLine });
      } catch {
        threw = true;
      }
      check(`assertTipSafe THROWS on rejection case: "${tip.slice(0, 40)}..."`, threw);
    }

    const passingCases: Array<{ tip: string; studentLine: string }> = [
      { tip: 'Use the "call it out" move.', studentLine: "x" },
      { tip: "I'd focus on pacing.", studentLine: "x" },
      {
        tip: "Try to push the deadline gently next time.",
        studentLine: "I think we should probably push the deadline back a bit",
      },
    ];
    for (const { tip, studentLine } of passingCases) {
      let threw = false;
      try {
        assertTipSafe(tip, { studentLine });
      } catch {
        threw = true;
      }
      check(`assertTipSafe does NOT throw on passing case: "${tip}"`, !threw);
    }
  }
}

console.log(
  "\n3. WEIGHT ORDERING — asserted here as well as in 21-05 (this is the file\n" +
    "   a contributor would touch if they decided coached sessions should count fully)",
);
{
  check(
    "CONTRIBUTION_WEIGHTS.LIVE_SESSION > CONTRIBUTION_WEIGHTS.COACHED_SESSION",
    CONTRIBUTION_WEIGHTS.LIVE_SESSION > CONTRIBUTION_WEIGHTS.COACHED_SESSION,
    `LIVE_SESSION=${CONTRIBUTION_WEIGHTS.LIVE_SESSION}, COACHED_SESSION=${CONTRIBUTION_WEIGHTS.COACHED_SESSION}`,
  );
}

console.log("\n5. DEMONSTRATION CARVE-OUT");
{
  const studentLine =
    "I think we should probably push the deadline back a bit because the team is behind";
  const gate = (attemptsInLeg: number, demonstrationsInLeg: number) =>
    ({ kind: "DEMONSTRATION", attemptsInLeg, demonstrationsInLeg }) as const;
  const reasonOf = (fn: () => void): string | null => {
    try {
      fn();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const demo = "Try saying: we will ship Friday.";

  check(
    "MAX_DEMONSTRATIONS_PER_LEG is 1",
    MAX_DEMONSTRATIONS_PER_LEG === 1,
  );
  check(
    "DEMONSTRATION_REJECT_REASONS lists the four reasons",
    DEMONSTRATION_REJECT_REASONS.length === 4,
  );

  const m1 = reasonOf(() => assertTipSafe(demo, { studentLine, gate: gate(0, 0) }));
  check(
    "1. attemptsInLeg 0 -> DEMONSTRATION_BEFORE_ATTEMPT",
    m1 !== null && m1.includes("DEMONSTRATION_BEFORE_ATTEMPT"),
    String(m1),
  );
  check(
    "2. attemptsInLeg 1, demonstrationsInLeg 0 -> does not throw",
    reasonOf(() => assertTipSafe(demo, { studentLine, gate: gate(1, 0) })) === null,
  );
  const m3 = reasonOf(() => assertTipSafe(demo, { studentLine, gate: gate(2, 1) }));
  check(
    "3. second demonstration -> DEMONSTRATION_LIMIT",
    m3 !== null && m3.includes("DEMONSTRATION_LIMIT"),
    String(m3),
  );
  const long450 = "We are behind on the launch plan and I need more time. ".repeat(9).slice(0, 450);
  const m4 = reasonOf(() => assertTipSafe(long450, { studentLine: "x", gate: gate(1, 0) }));
  check(
    "4. 450-char demonstration after an attempt -> TOO_LONG",
    m4 !== null && m4.includes("TOO_LONG"),
    String(m4),
  );
  const echo = validateDemonstration(
    "Honestly I think we should probably push the deadline back a bit because the team is behind, agreed.",
    { studentLine, attemptsInLeg: 1, demonstrationsInLeg: 0 },
  );
  check(
    "ECHOES_STUDENT_LINE fires at a 10+ word shared span",
    !echo.ok && echo.reason === "ECHOES_STUDENT_LINE",
    JSON.stringify(echo),
  );
  const nearEcho = validateDemonstration(
    "We should probably push the deadline back a bit, and here is the plan.",
    { studentLine, attemptsInLeg: 1, demonstrationsInLeg: 0 },
  );
  check(
    "near-miss PASSES: a 7-word span shared (under the demonstration's 10)",
    nearEcho.ok,
    JSON.stringify(nearEcho),
  );

  // 5. Ungated: every pre-existing rejection case still rejects with its reason.
  const ungated: Array<{ tip: string; studentLine: string; reason: string }> = [
    { tip: 'Try this: "I understand your concern but the deadline is fixed"', studentLine: "x", reason: "CONTAINS_QUOTED_SPEECH" },
    { tip: "Before you respond, try saying this to the student.", studentLine: "an unrelated student line", reason: "CONTAINS_SCRIPT_CUE" },
    { tip: "I hear you, and the decision still stands.", studentLine: "x", reason: "CONTAINS_FIRST_PERSON_LINE" },
    { tip: "Focus on your delivery and keep your pacing even. ".repeat(6).slice(0, 300), studentLine: "x", reason: "TOO_LONG" },
    { tip: "Remember to say we should probably push the deadline next time.", studentLine: "I think we should probably push the deadline back a bit", reason: "ECHOES_STUDENT_LINE" },
  ];
  for (const c of ungated) {
    const m = reasonOf(() => assertTipSafe(c.tip, { studentLine: c.studentLine }));
    check(
      `5. ungated assertTipSafe still rejects with ${c.reason}`,
      m !== null && m.includes(c.reason),
      String(m),
    );
  }

  // Bite-proof (a): the waiver exists only behind the gate.
  const stripped = validateTip(demo, { studentLine });
  check(
    "BITE (a): the same text, gate dropped, is REJECTED by validateTip",
    !stripped.ok && stripped.reason === "CONTAINS_SCRIPT_CUE",
    JSON.stringify(stripped),
  );
  // Bite-proof (b): attempt count is checked before content.
  const lengthFirst = validateDemonstration(long450, { studentLine: "x", attemptsInLeg: 1, demonstrationsInLeg: 0 });
  const real = validateDemonstration(long450, { studentLine: "x", attemptsInLeg: 0, demonstrationsInLeg: 0 });
  check(
    "BITE (b): a length-first ordering would report TOO_LONG; the real gate reports DEMONSTRATION_BEFORE_ATTEMPT",
    !lengthFirst.ok && lengthFirst.reason === "TOO_LONG" && !real.ok && real.reason === "DEMONSTRATION_BEFORE_ATTEMPT",
    JSON.stringify({ lengthFirst, real }),
  );
}

console.log("\n6. COACH SPEECH GATE");
{
  const studentLine = "I think we should probably push the deadline back a bit";
  const counterpartLine = "Can you walk me through why the budget slipped again this quarter";
  const ctx = { studentLine, counterpartLine, studentAttempts: ["We need two more weeks to finish."] as readonly string[] };

  check("COACH_SPEECH_REJECT_REASONS lists four reasons", COACH_SPEECH_REJECT_REASONS.length === 4);

  const r6 = validateCoachSpeech("You could say 'we are behind on the launch plan'", ctx);
  check("6. script cue -> CONTAINS_SCRIPT_CUE", !r6.ok && r6.reason === "CONTAINS_SCRIPT_CUE", JSON.stringify(r6));

  const r7 = validateCoachSpeech(
    `You said "I think we should probably push the deadline back a bit". What were you trying to land?`,
    ctx,
  );
  check("7. quoting the student's own line back is ok", r7.ok, JSON.stringify(r7));

  const r7b = validateCoachSpeech('Earlier you said "We need two more weeks to finish." Does that hold?', ctx);
  check("7b. quoting a prior student attempt is ok", r7b.ok, JSON.stringify(r7b));

  const r8 = validateCoachSpeech('A stronger close is "we will deliver the pilot by the end of March".', ctx);
  check("8. quoting a NEW line -> CONTAINS_SCRIPTED_QUOTE", !r8.ok && r8.reason === "CONTAINS_SCRIPTED_QUOTE", JSON.stringify(r8));

  const r8b = validateCoachSpeech('Lean on the "call it out" move.', ctx);
  check("8b. near-miss PASSES: a 3-word quoted term of art, under the 4-word threshold", r8b.ok, JSON.stringify(r8b));

  const r9 = validateCoachSpeech(
    "They said: can you walk me through why the budget slipped again this quarter. How did that land?",
    ctx,
  );
  check("9. voicing the counterpart verbatim -> VOICES_COUNTERPART", !r9.ok && r9.reason === "VOICES_COUNTERPART", JSON.stringify(r9));
  const r9b = validateCoachSpeech("Look at the moment when they asked about the budget. How did that land?", ctx);
  check("9b. paraphrasing the counterpart is ok", r9b.ok, JSON.stringify(r9b));

  const r10 = validateCoachSpeech("I noticed you hedged twice. What were you trying to land there?", ctx);
  check("10. first person is allowed in coach speech", r10.ok, JSON.stringify(r10));

  const rLong = validateCoachSpeech("Let us look at the pacing of that answer together. ".repeat(20), ctx);
  check("TOO_LONG fires over 700 chars", !rLong.ok && rLong.reason === "TOO_LONG", JSON.stringify(rLong));

  const rNull = validateCoachSpeech("What were you trying to land there?", { ...ctx, counterpartLine: null });
  check("a null counterpartLine is handled", rNull.ok, JSON.stringify(rNull));

  for (const phrase of SCRIPT_CUE_PHRASES) {
    const r = validateCoachSpeech(`Next, ${phrase} something about it.`, ctx);
    check(`script cue "${phrase}" fires in coach speech`, !r.ok && r.reason === "CONTAINS_SCRIPT_CUE", JSON.stringify(r));
  }
}

console.log("\n7. PARROTING");
{
  const demonstration =
    "We are behind on the launch plan, so I need two more weeks to finish the integration work properly.";
  check("11. verbatim read-back is a parrot", isParrotOf(demonstration, demonstration));
  check(
    "11. two words changed is still a parrot",
    isParrotOf(
      "We are behind on the launch plan, so I need three more days to finish the integration work properly.",
      demonstration,
    ),
  );
  check(
    "11. a genuinely re-worded version sharing key nouns is NOT a parrot",
    !isParrotOf(
      "The launch plan needs more integration time, so I would propose a smaller scope and a later date.",
      demonstration,
    ),
  );
  check("an empty attempt is not a parrot", !isParrotOf("", demonstration));
}

async function runDatabaseSection() {
  if (!process.env.DATABASE_URL) {
    skip("4. CONTRIBUTION (no DATABASE_URL set)");
    return;
  }

  console.log("\n4. CONTRIBUTION — requires a database");

  const { prisma } = await import("../lib/prisma");
  const { createPath } = await import("../lib/study-plan/path");
  const { createCoachedSession, finishCoachedSession } = await import(
    "../lib/study-plan/coached/instance"
  );
  const { recordCoachedContribution } = await import(
    "../lib/study-plan/coached/contribution"
  );
  const { recordContributions, readContributions } = await import(
    "../lib/mastery/ledger"
  );
  const { computeMastery } = await import("../lib/mastery/compute");

  const COMPETENCY_KEY = "delivery_presence" as const;
  // "content" maps to structure_and_clarity (not delivery_presence), which
  // is used deliberately as the ALL-NULL competency below — a dimension
  // belonging to a DIFFERENT competency than the coached step's own, so the
  // all-null-yields-no-row assertion is not accidentally conflated with the
  // step's own competency.

  const testId = randomUUID();
  const email = `coach-tips-verify-${testId}@example.com`;
  const otherEmail = `coach-tips-verify-other-${testId}@example.com`;

  let userId = "";
  let otherUserId = "";
  const studyPlanIds: string[] = [];
  const reportIds: string[] = [];
  const contributionIds: string[] = [];

  async function makeStudyPlan(owner: string, title: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId: owner,
        title,
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-coach-tips-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  async function makeReport(
    owner: string,
    opts: { turnCount?: number; scores?: Record<string, number | null> },
  ) {
    const row = await prisma.interactionReport.create({
      data: {
        userId: owner,
        typeSlug: "general",
        turnCount: opts.turnCount ?? 10,
        scores: opts.scores ?? undefined,
      },
    });
    reportIds.push(row.id);
    return row;
  }

  try {
    const user = await prisma.user.create({
      data: { email, name: "Coach Tips Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Coach Tips Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    // A BASELINE contribution for delivery_presence, at a score deliberately
    // far from the coached session's eventual rawScore (0.625, see below).
    // Without a baseline, a weighted mean over contributions that ALL carry
    // the identical rawScore is unweightable by construction (the weighted
    // mean of n copies of the same value is that value, regardless of
    // weight) — this baseline is what makes "the live weight pulls harder
    // toward its own value than the coached weight does" a provable,
    // non-degenerate claim rather than a vacuous one.
    const baselineSourceReportId = `verify-coach-tips-baseline-${testId}`;
    await recordContributions([
      {
        userId,
        competencyKey: "delivery_presence",
        source: "LIVE_SESSION",
        rawScore: 0.1,
        occurredAt: new Date("2026-09-01T00:00:00Z"),
        sourceReportId: baselineSourceReportId,
        sourceAttemptId: null,
      },
    ]);
    const baselineRow = await prisma.masteryContribution.findFirst({
      where: { sourceReportId: baselineSourceReportId },
    });
    if (baselineRow) contributionIds.push(baselineRow.id);

    function makeFillerSteps(positions: number[]) {
      return positions.map((position) => ({
        position,
        kind: "UNAIDED_SESSION" as const,
        competencyKey: COMPETENCY_KEY,
        selectionReason: "verify-coach-tips: unaided filler step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      }));
    }

    const plan = await makeStudyPlan(userId, "Coach Tips Verify Plan");
    const path = await createPath({
      userId,
      studyPlanId: plan.id,
      steps: [
        {
          position: 1,
          kind: "COACHED_SESSION",
          competencyKey: COMPETENCY_KEY,
          selectionReason: "verify-coach-tips: coached session step",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
        ...makeFillerSteps([2, 3, 4, 5]),
      ],
      selectionSnapshot: { note: "verify-coach-tips" },
    });
    const coachedStep = path.steps.find((s) => s.kind === "COACHED_SESSION")!;

    const replayReport = await makeReport(userId, { turnCount: 5 });

    const coachedSession = await createCoachedSession({
      userId,
      pathStepId: coachedStep.id,
      replaySourceReportId: replayReport.id,
      replayTurnIndex: 0,
      freshScenarioPrompt: "A fresh scenario exercising the same competency.",
    });

    // Scores covering several dimensions including one null, and one
    // dimension (content -> structure_and_clarity, a DIFFERENT competency)
    // left entirely null so that competency gets no row.
    const finishReport = await makeReport(userId, {
      scores: { visual: 4, vocal: null, holding_the_room: 3, content: null },
    });

    await finishCoachedSession(userId, coachedSession.id, finishReport.id);

    // Mastery figure BEFORE the coached contribution.
    const beforeRows = await readContributions(userId);
    const beforeResult = computeMastery(beforeRows, new Date());
    const beforeDelivery = beforeResult.competencies.find(
      (c) => c.competencyKey === "delivery_presence",
    );

    const firstResult = await recordCoachedContribution({
      userId,
      coachedSessionId: coachedSession.id,
    });
    check(
      "recordCoachedContribution writes at least one row",
      firstResult.written > 0,
      JSON.stringify(firstResult),
    );

    const writtenRows = await prisma.masteryContribution.findMany({
      where: { sourceReportId: finishReport.id },
    });
    writtenRows.forEach((r) => contributionIds.push(r.id));

    check(
      "one row per competency with at least one non-null dimension (delivery_presence only, here)",
      writtenRows.length === 1 && writtenRows[0].competencyKey === "delivery_presence",
      JSON.stringify(writtenRows.map((r) => r.competencyKey)),
    );
    check(
      "the all-null competency (structure_and_clarity, from the null `content` dimension) gets NO row",
      !writtenRows.some((r) => r.competencyKey === "structure_and_clarity"),
    );
    check(
      "every written row has source COACHED_SESSION",
      writtenRows.every((r) => r.source === "COACHED_SESSION"),
      JSON.stringify(writtenRows.map((r) => r.source)),
    );
    check(
      "every written row's weight equals CONTRIBUTION_WEIGHTS.COACHED_SESSION",
      writtenRows.every((r) => r.weight === CONTRIBUTION_WEIGHTS.COACHED_SESSION),
      JSON.stringify(writtenRows.map((r) => r.weight)),
    );

    // Second call: idempotent.
    const secondResult = await recordCoachedContribution({
      userId,
      coachedSessionId: coachedSession.id,
    });
    check(
      "a second call returns written:0",
      secondResult.written === 0,
      JSON.stringify(secondResult),
    );
    const rowsAfterSecondCall = await prisma.masteryContribution.findMany({
      where: { sourceReportId: finishReport.id },
    });
    check(
      "row count is unchanged after the second call",
      rowsAfterSecondCall.length === writtenRows.length,
      `before=${writtenRows.length}, after=${rowsAfterSecondCall.length}`,
    );

    // Mastery figure AFTER the coached contribution: proven to have moved.
    const afterRows = await readContributions(userId);
    const afterResult = computeMastery(afterRows, new Date());
    const afterDelivery = afterResult.competencies.find(
      (c) => c.competencyKey === "delivery_presence",
    );
    check(
      "the delivery_presence figure moved after the coached contribution was recorded",
      (beforeDelivery?.lifetimePercent ?? null) !== (afterDelivery?.lifetimePercent ?? null),
      `before(baseline only)=${beforeDelivery?.lifetimePercent}, after(baseline+coached)=${afterDelivery?.lifetimePercent}`,
    );

    // A session with completedAt: null throws and writes nothing.
    const uncompletedReplayReport = await makeReport(userId, { turnCount: 5 });
    const uncompletedPath = await createPath({
      userId,
      studyPlanId: (await makeStudyPlan(userId, "Coach Tips Verify Plan 2")).id,
      steps: [
        {
          position: 1,
          kind: "COACHED_SESSION",
          competencyKey: COMPETENCY_KEY,
          selectionReason: "verify-coach-tips: uncompleted coached session step",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
        ...makeFillerSteps([2, 3, 4, 5]),
      ],
      selectionSnapshot: { note: "verify-coach-tips-uncompleted" },
    });
    const uncompletedStep = uncompletedPath.steps.find((s) => s.kind === "COACHED_SESSION")!;
    const uncompletedSession = await createCoachedSession({
      userId,
      pathStepId: uncompletedStep.id,
      replaySourceReportId: uncompletedReplayReport.id,
      replayTurnIndex: 0,
      freshScenarioPrompt: "A fresh scenario, never finished.",
    });

    let threwOnUncompleted = false;
    try {
      await recordCoachedContribution({ userId, coachedSessionId: uncompletedSession.id });
    } catch {
      threwOnUncompleted = true;
    }
    check(
      "calling on a session with completedAt: null throws",
      threwOnUncompleted,
    );
    const rowsForUncompletedCall = await prisma.masteryContribution.findMany({
      where: { sourceReportId: { in: [uncompletedReplayReport.id] } },
    });
    check(
      "the throwing call wrote nothing",
      rowsForUncompletedCall.length === 0,
    );

    // Calling with a different userId throws.
    let threwOnForeignUser = false;
    try {
      await recordCoachedContribution({
        userId: otherUserId,
        coachedSessionId: coachedSession.id,
      });
    } catch {
      threwOnForeignUser = true;
    }
    check("calling with a different userId throws", threwOnForeignUser);

    // Write an equivalent LIVE_SESSION contribution with the SAME rawScore
    // as the coached row, for the same competency, ON TOP of the baseline +
    // coached state already measured as `afterDelivery` above. Because the
    // baseline (0.1) differs from this shared rawScore (0.625), BOTH figures
    // (baseline+coached, and baseline+coached+live) are pulled toward 0.625
    // from the 0.1 baseline — but the live row's higher weight (1.00 vs the
    // coached row's 0.40) must pull HARDER, landing the three-row figure
    // measurably closer to the raw score than the two-row figure was. This
    // is the concrete proof that the coached weighting counts for less in
    // the arithmetic itself, not only in the weight table.
    const coachedRow = writtenRows[0];
    const liveSourceReportId = `verify-coach-tips-live-equivalent-${testId}`;
    await recordContributions([
      {
        userId,
        competencyKey: "delivery_presence",
        source: "LIVE_SESSION",
        rawScore: coachedRow.rawScore,
        occurredAt: new Date(),
        sourceReportId: liveSourceReportId,
        sourceAttemptId: null,
      },
    ]);
    const liveRow = await prisma.masteryContribution.findFirst({
      where: { sourceReportId: liveSourceReportId },
    });
    if (liveRow) contributionIds.push(liveRow.id);

    const finalRows = await readContributions(userId);
    const finalResult = computeMastery(finalRows, new Date());
    const finalDelivery = finalResult.competencies.find(
      (c) => c.competencyKey === "delivery_presence",
    );

    const rawScorePercent = coachedRow.rawScore * 100;
    const distanceBeforeLive = Math.abs(
      (afterDelivery?.lifetimePercent ?? 0) - rawScorePercent,
    );
    const distanceAfterLive = Math.abs(
      (finalDelivery?.lifetimePercent ?? 0) - rawScorePercent,
    );
    check(
      "adding an equal-rawScore LIVE_SESSION contribution pulls the figure measurably CLOSER to that raw score than the coached-only figure was",
      distanceAfterLive < distanceBeforeLive,
      `baseline+coached=${afterDelivery?.lifetimePercent} (distance ${distanceBeforeLive}), ` +
        `baseline+coached+live=${finalDelivery?.lifetimePercent} (distance ${distanceAfterLive}), rawScorePercent=${rawScorePercent}`,
    );
  } finally {
    for (const id of contributionIds) {
      await prisma.masteryContribution.delete({ where: { id } }).catch(() => {});
    }
    for (const id of reportIds) {
      await prisma.interactionReport.delete({ where: { id } }).catch(() => {});
    }
    for (const id of studyPlanIds) {
      await prisma.studyPlan.delete({ where: { id } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    if (otherUserId) {
      await prisma.user.delete({ where: { id: otherUserId } }).catch(() => {});
    }
  }
}

runDatabaseSection()
  .catch((err) => {
    failures += 1;
    console.log(`  FAIL section 4 threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
