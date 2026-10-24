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
  isRecycledFrom,
  isTechniqueParrot,
  techniqueLine,
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
  check(
    "CONTRIBUTION_WEIGHTS.COACHED_SESSION === CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED (22-09 binding: never the deterministic weight)",
    CONTRIBUTION_WEIGHTS.COACHED_SESSION === CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED,
    `COACHED_SESSION=${CONTRIBUTION_WEIGHTS.COACHED_SESSION}, CHECK_MODEL_GRADED=${CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED}`,
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

console.log("\n8. SPOKEN TECHNIQUE LINES, TECHNIQUE PARROTING, RECYCLING (Phase 23 L1/L2/L6)");
{
  const unsafe = TECHNIQUE_LIBRARY.filter((t) => {
    try {
      assertTipSafe(techniqueLine(t), { studentLine: "" });
      return false;
    } catch {
      return true;
    }
  });
  check(`every library entry's spoken technique line passes assertTipSafe (${TECHNIQUE_LIBRARY.length})`, unsafe.length === 0, unsafe.map((t) => t.id).join(", "));
  const headline = TECHNIQUE_LIBRARY.find((t) => t.id === "structure-headline-first")!;
  check(
    "techniqueLine names the technique then its reminder",
    techniqueLine(headline) === "Try headline first: lead with your conclusion, then give at most two supports.",
    techniqueLine(headline),
  );
  check(
    "bite: a scripted line dressed as a technique fails the same gate",
    (() => {
      try {
        assertTipSafe(techniqueLine({ name: "Open strong", reminder: 'Say "we cut handoff time by thirty percent" first.' }), { studentLine: "" });
        return false;
      } catch {
        return true;
      }
    })(),
  );
  const structure = techniquesForCompetency("structure_and_clarity");
  check("repeating a reminder back is a technique parrot", isTechniqueParrot("Lead with your conclusion, then give at most two supports.", structure));
  check("repeating the spoken line back is a technique parrot", isTechniqueParrot(techniqueLine(headline), structure));
  check(
    "a full answer that applies the technique is NOT a technique parrot",
    !isTechniqueParrot(
      "We should fund the pilot. It cut handoff time by thirty percent, and one team can trial it for two weeks at no cost.",
      structure,
    ),
  );
  const leg1 =
    "Sure. The biggest pushback came from the SVP of operations, who worried the rollout would slow her team. I answered with the data first.";
  check(
    "an attempt that reuses another leg's answer verbatim is recycled (reordered sentences too)",
    isRecycledFrom("I answered with the data first. Sure, the biggest pushback came from the SVP of operations, who worried the rollout would slow her team.", [leg1]),
  );
  check(
    "a different answer sharing a few nouns is NOT recycled",
    !isRecycledFrom("At Leidos I built PIRS so partner data reached operations in a day; the SVP of operations sponsored the rollout.", [leg1]),
  );
  check("bite: with no earlier legs nothing is recycled", !isRecycledFrom(leg1, []));
}

async function runDatabaseSection() {
  console.log("\n4. CONTRIBUTION — pure leg-to-input mapping (no database)");
  {
    const { contributionInputsFromCoachedLegs } = await import(
      "../lib/study-plan/coached/contribution"
    );
    const base = {
      userId: "u1",
      coachedSessionId: "s1",
      competencyKey: "delivery_presence" as const,
      occurredAt: new Date("2026-10-01T00:00:00Z"),
    };
    const attempts = [
      { leg: "REPLAY", score: 2, acceptable: false, parroted: false },
      { leg: "REPLAY", score: 4, acceptable: true, parroted: false },
      { leg: "REPLAY", score: 5, acceptable: true, parroted: true },
      { leg: "FRESH", score: 3, acceptable: false, parroted: false },
      { leg: "FRESH", score: 2, acceptable: false, parroted: false },
    ];
    const inputs = contributionInputsFromCoachedLegs({
      ...base,
      attempts,
      legClosures: [
        { leg: "REPLAY", closedAtSoftCap: false },
        { leg: "FRESH", closedAtSoftCap: true },
      ],
    });
    check("two closed legs yield two inputs", inputs.length === 2, JSON.stringify(inputs));
    check(
      "REPLAY takes the best acceptable non-parroted attempt (4 -> 0.75), ignoring the parroted 5",
      inputs[0]?.rawScore === 0.75,
      String(inputs[0]?.rawScore),
    );
    check(
      "FRESH (soft cap) takes the best non-parroted attempt (3 -> 0.5)",
      inputs[1]?.rawScore === 0.5,
      String(inputs[1]?.rawScore),
    );
    check(
      "every input is COACHED_SESSION, carries sourceCoachedSessionId and no report id",
      inputs.every(
        (i) =>
          i.source === "COACHED_SESSION" &&
          i.sourceCoachedSessionId === "s1" &&
          i.sourceReportId === null,
      ),
    );
    const noClosure = contributionInputsFromCoachedLegs({
      ...base,
      attempts,
      legClosures: [],
    });
    check("no LEG_DONE rows -> no inputs", noClosure.length === 0);
    const allParroted = contributionInputsFromCoachedLegs({
      ...base,
      attempts: [{ leg: "REPLAY", score: 5, acceptable: true, parroted: true }],
      legClosures: [{ leg: "REPLAY", closedAtSoftCap: false }],
    });
    check("a leg whose only attempt is parroted emits nothing", allParroted.length === 0);
  }

  if (!process.env.DATABASE_URL) {
    skip("4. CONTRIBUTION database section (no DATABASE_URL set)");
    return;
  }

  console.log("\n4. CONTRIBUTION — requires a database");

  const { prisma } = await import("../lib/prisma");
  const { createPath } = await import("../lib/study-plan/path");
  const { recordCoachedContribution } = await import(
    "../lib/study-plan/coached/contribution"
  );
  const { recordContributions, readContributions } = await import(
    "../lib/mastery/ledger"
  );
  const { computeMastery } = await import("../lib/mastery/compute");

  const COMPETENCY_KEY = "delivery_presence" as const;

  const testId = randomUUID();
  const email = `coach-tips-verify-${testId}@example.com`;
  const otherEmail = `coach-tips-verify-other-${testId}@example.com`;

  let userId = "";
  let otherUserId = "";
  const studyPlanIds: string[] = [];
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

  async function makePathStep(owner: string, title: string) {
    const plan = await makeStudyPlan(owner, title);
    const path = await createPath({
      userId: owner,
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
    return path.steps.find((s) => s.kind === "COACHED_SESSION")!;
  }

  async function makeSession(owner: string, title: string, completed: boolean) {
    const step = await makePathStep(owner, title);
    return prisma.coachedSession.create({
      data: {
        userId: owner,
        pathStepId: step.id,
        competencyKey: COMPETENCY_KEY,
        replaySourceReportId: `verify-coach-tips-report-${testId}`,
        replayTurnIndex: 0,
        selectionBasis: "PER_TURN_SCORE",
        completedAt: completed ? new Date("2026-10-10T00:00:00Z") : null,
      },
    });
  }

  let seq = 0;
  async function addTurn(
    sessionId: string,
    t: {
      leg: "REPLAY" | "FRESH";
      speaker: "COACH" | "STUDENT";
      move: string;
      score?: number;
      acceptable?: boolean;
      parroted?: boolean;
      closedAtSoftCap?: boolean;
    },
  ) {
    seq += 1;
    await prisma.coachedTurn.create({
      data: {
        coachedSessionId: sessionId,
        leg: t.leg,
        seq,
        speaker: t.speaker,
        move: t.move,
        text: "verify-coach-tips fixture",
        score: t.score ?? null,
        acceptable: t.acceptable ?? null,
        parroted: t.parroted ?? null,
        closedAtSoftCap: t.closedAtSoftCap ?? null,
      },
    });
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

    // A BASELINE contribution far from the coached rawScore, so "the live
    // weight pulls harder than the coached weight" is non-degenerate.
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

    const session = await makeSession(userId, "Coach Tips Verify Plan", true);

    // REPLAY: acceptable 4 (best acceptable), a parroted 5 that must be ignored.
    await addTurn(session.id, { leg: "REPLAY", speaker: "STUDENT", move: "ATTEMPT", score: 2, acceptable: false, parroted: false });
    await addTurn(session.id, { leg: "REPLAY", speaker: "STUDENT", move: "ATTEMPT", score: 4, acceptable: true, parroted: false });
    await addTurn(session.id, { leg: "REPLAY", speaker: "STUDENT", move: "ATTEMPT", score: 5, acceptable: true, parroted: true });
    await addTurn(session.id, { leg: "REPLAY", speaker: "COACH", move: "LEG_DONE", closedAtSoftCap: false });
    // FRESH: acceptable 3.
    await addTurn(session.id, { leg: "FRESH", speaker: "STUDENT", move: "ATTEMPT", score: 3, acceptable: true, parroted: false });
    await addTurn(session.id, { leg: "FRESH", speaker: "COACH", move: "LEG_DONE", closedAtSoftCap: false });

    const beforeRows = await readContributions(userId);
    const beforeDelivery = computeMastery(beforeRows, new Date()).competencies.find(
      (c) => c.competencyKey === "delivery_presence",
    );

    const firstResult = await recordCoachedContribution({
      userId,
      coachedSessionId: session.id,
    });
    check("recordCoachedContribution writes two rows (one per closed leg)", firstResult.written === 2, JSON.stringify(firstResult));

    const writtenRows = await prisma.masteryContribution.findMany({
      where: { sourceCoachedSessionId: session.id },
      orderBy: { rawScore: "desc" },
    });
    writtenRows.forEach((r) => contributionIds.push(r.id));

    check("two rows are linked to the session by sourceCoachedSessionId", writtenRows.length === 2, String(writtenRows.length));
    check(
      "every written row has source COACHED_SESSION and no report link",
      writtenRows.every((r) => r.source === "COACHED_SESSION" && r.sourceReportId === null),
      JSON.stringify(writtenRows.map((r) => [r.source, r.sourceReportId])),
    );
    check(
      "every row's weight === COACHED_SESSION === CHECK_MODEL_GRADED",
      writtenRows.every(
        (r) =>
          r.weight === CONTRIBUTION_WEIGHTS.COACHED_SESSION &&
          r.weight === CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED,
      ),
      JSON.stringify(writtenRows.map((r) => r.weight)),
    );
    check(
      "weight is not the deterministic weight",
      writtenRows.every((r) => r.weight !== CONTRIBUTION_WEIGHTS.CHECK_DETERMINISTIC),
    );
    check(
      "rawScores are the normalized best acceptable attempt per leg (0.75 and 0.5); the parroted 5 is ignored",
      writtenRows.length === 2 && writtenRows[0].rawScore === 0.75 && writtenRows[1].rawScore === 0.5,
      JSON.stringify(writtenRows.map((r) => r.rawScore)),
    );

    const secondResult = await recordCoachedContribution({
      userId,
      coachedSessionId: session.id,
    });
    check("a second call returns written:0", secondResult.written === 0, JSON.stringify(secondResult));
    const rowsAfterSecondCall = await prisma.masteryContribution.findMany({
      where: { sourceCoachedSessionId: session.id },
    });
    check(
      "row count is unchanged after the second call",
      rowsAfterSecondCall.length === writtenRows.length,
      `before=${writtenRows.length}, after=${rowsAfterSecondCall.length}`,
    );

    const afterRows = await readContributions(userId);
    const afterDelivery = computeMastery(afterRows, new Date()).competencies.find(
      (c) => c.competencyKey === "delivery_presence",
    );
    check(
      "the delivery_presence figure moved after the coached contribution was recorded",
      (beforeDelivery?.lifetimePercent ?? null) !== (afterDelivery?.lifetimePercent ?? null),
      `before=${beforeDelivery?.lifetimePercent}, after=${afterDelivery?.lifetimePercent}`,
    );

    // A session with completedAt: null throws and writes nothing.
    const uncompleted = await makeSession(userId, "Coach Tips Verify Plan 2", false);
    let threwOnUncompleted = false;
    try {
      await recordCoachedContribution({ userId, coachedSessionId: uncompleted.id });
    } catch {
      threwOnUncompleted = true;
    }
    check("calling on a session with completedAt: null throws", threwOnUncompleted);
    check(
      "the throwing call wrote nothing",
      (await prisma.masteryContribution.count({ where: { sourceCoachedSessionId: uncompleted.id } })) === 0,
    );

    // A completed session with no LEG_DONE rows writes nothing.
    const noLegs = await makeSession(userId, "Coach Tips Verify Plan 3", true);
    await addTurn(noLegs.id, { leg: "REPLAY", speaker: "STUDENT", move: "ATTEMPT", score: 4, acceptable: true, parroted: false });
    const noLegsResult = await recordCoachedContribution({ userId, coachedSessionId: noLegs.id });
    check("a session with no LEG_DONE rows writes 0", noLegsResult.written === 0, JSON.stringify(noLegsResult));

    // Calling with a different userId throws.
    let threwOnForeignUser = false;
    try {
      await recordCoachedContribution({ userId: otherUserId, coachedSessionId: session.id });
    } catch {
      threwOnForeignUser = true;
    }
    check("calling with a different userId throws", threwOnForeignUser);

    // LIVE_SESSION > COACHED_SESSION, in the arithmetic itself: an equal-
    // rawScore live row pulls the figure closer to that score than the
    // coached rows did.
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

    const finalDelivery = computeMastery(await readContributions(userId), new Date()).competencies.find(
      (c) => c.competencyKey === "delivery_presence",
    );
    const rawScorePercent = coachedRow.rawScore * 100;
    const distanceBeforeLive = Math.abs((afterDelivery?.lifetimePercent ?? 0) - rawScorePercent);
    const distanceAfterLive = Math.abs((finalDelivery?.lifetimePercent ?? 0) - rawScorePercent);
    check(
      "adding an equal-rawScore LIVE_SESSION contribution pulls the figure measurably CLOSER to that raw score than the coached-only figure was",
      distanceAfterLive < distanceBeforeLive,
      `baseline+coached=${afterDelivery?.lifetimePercent} (distance ${distanceBeforeLive}), ` +
        `+live=${finalDelivery?.lifetimePercent} (distance ${distanceAfterLive}), rawScorePercent=${rawScorePercent}`,
    );
  } finally {
    for (const id of contributionIds) {
      await prisma.masteryContribution.delete({ where: { id } }).catch(() => {});
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
