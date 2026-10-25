/**
 * Proves REQ-111's deterministic/model-graded split is behaviour, not
 * convention: the three closed formats (MULTIPLE_CHOICE, FILL_IN_BLANK,
 * PICK_BETTER_RESPONSE) are graded by `gradeDeterministic`, a pure function
 * with no model call — the same answer always gets the same mark — and only
 * REWRITE_WEAK_LINE reaches a model, at the lower CHECK_MODEL_GRADED weight.
 *
 * Sections 1-6 are pure and run with NO `DATABASE_URL` and NO
 * `OPENAI_API_KEY`. Section 7 is database-gated: it runs the real
 * `submitAndGrade` against a local DATABASE_URL when present, and prints an
 * explicit SKIP (not a silent pass) otherwise. The contribution-count and
 * single-transaction assertions live there and must not silently pass.
 *
 * Run: npx tsx scripts/verify-check-grading.ts
 */
import { randomUUID } from "node:crypto";

import {
  gradeDeterministic,
  gradeRewriteWithModel,
  submitAndGrade,
  REWRITE_GRADING_SCHEMA,
  AlreadyAnsweredError,
  CheckNotFoundError,
  RewriteGradingFailedError,
  type DeterministicGrade,
  type CallRewriteModel,
} from "../lib/study-plan/checks/grade";
import {
  validateCheckPayload,
  validateAnswerKey,
  isDeterministicFormat,
  CONTRIBUTION_SOURCE_FOR_FORMAT,
  type MultipleChoicePayload,
  type FillInBlankPayload,
  type PickBetterResponsePayload,
  type RewriteWeakLinePayload,
} from "../lib/study-plan/checks/types";
import { CONTRIBUTION_WEIGHTS, normalizeRubricScore } from "../lib/mastery/weights";
import { techniquesForCompetency } from "../lib/study-plan/coached/tips";
import { Prisma } from "@prisma/client";

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

function expectThrow(fn: () => unknown, label: string): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

async function expectThrowAsync(
  fn: () => Promise<unknown>,
  label: string
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

console.log("1. MULTIPLE_CHOICE");
{
  const payload = validateCheckPayload("MULTIPLE_CHOICE", {
    options: ["Ask a clarifying question", "Stay silent", "Interrupt", "Change the subject"],
  }) as MultipleChoicePayload;
  const answerKey = validateAnswerKey("MULTIPLE_CHOICE", { correctIndex: 2 });

  const correctGrade = gradeDeterministic("MULTIPLE_CHOICE", payload, answerKey, {
    selectedIndex: 2,
  });
  check("correct index -> correct, score 1", correctGrade.correct === true && correctGrade.score === 1);

  const wrongGrade = gradeDeterministic("MULTIPLE_CHOICE", payload, answerKey, {
    selectedIndex: 0,
  });
  check(
    "wrong index -> incorrect, score 0",
    wrongGrade.correct === false && wrongGrade.score === 0
  );
  check(
    "detail names the correct option TEXT, not just its index",
    wrongGrade.detail.includes("Interrupt"),
    wrongGrade.detail
  );

  check(
    "selectedIndex 4 (out of range) throws",
    expectThrow(
      () => gradeDeterministic("MULTIPLE_CHOICE", payload, answerKey, { selectedIndex: 4 }),
      "mc-oob-high"
    )
  );
  check(
    "selectedIndex -1 (negative) throws",
    expectThrow(
      () => gradeDeterministic("MULTIPLE_CHOICE", payload, answerKey, { selectedIndex: -1 }),
      "mc-negative"
    )
  );
  check(
    "selectedIndex 1.5 (non-integer) throws",
    expectThrow(
      () => gradeDeterministic("MULTIPLE_CHOICE", payload, answerKey, { selectedIndex: 1.5 }),
      "mc-non-integer"
    )
  );
  check(
    "missing selectedIndex throws",
    expectThrow(
      () => gradeDeterministic("MULTIPLE_CHOICE", payload, answerKey, {}),
      "mc-missing"
    )
  );
}

console.log("\n2. PICK_BETTER_RESPONSE");
{
  const payload = validateCheckPayload("PICK_BETTER_RESPONSE", {
    candidates: ["I think maybe we could possibly try something else?", "Let's pause here and regroup."],
    rationalePrompt: null,
  }) as PickBetterResponsePayload;
  const answerKey = validateAnswerKey("PICK_BETTER_RESPONSE", { betterIndex: 1 });

  const correctGrade = gradeDeterministic("PICK_BETTER_RESPONSE", payload, answerKey, {
    betterIndex: 1,
  });
  check("correct betterIndex -> correct, score 1", correctGrade.correct === true && correctGrade.score === 1);

  const wrongGrade = gradeDeterministic("PICK_BETTER_RESPONSE", payload, answerKey, {
    betterIndex: 0,
  });
  check("wrong betterIndex -> incorrect, score 0", wrongGrade.correct === false && wrongGrade.score === 0);
  check(
    "detail names the better candidate TEXT",
    wrongGrade.detail.includes("Let's pause here and regroup."),
    wrongGrade.detail
  );

  check(
    "betterIndex 2 (out of range, only 0/1 permitted) throws",
    expectThrow(
      () => gradeDeterministic("PICK_BETTER_RESPONSE", payload, answerKey, { betterIndex: 2 }),
      "pbr-oob"
    )
  );
  check(
    "missing betterIndex throws",
    expectThrow(
      () => gradeDeterministic("PICK_BETTER_RESPONSE", payload, answerKey, {}),
      "pbr-missing"
    )
  );
}

console.log("\n2b. PHASE 23 — 3-4 options and an explanation tied to a named technique (K1/K2)");
{
  // A LEGACY 2-option row with no stored explanation still renders and grades,
  // and (given the competency) explains with a template + named technique.
  const legacy = validateCheckPayload("PICK_BETTER_RESPONSE", {
    candidates: ["I think maybe we could possibly try something else?", "Let's pause here and regroup."],
    rationalePrompt: "Explain which is stronger and why.",
  }) as PickBetterResponsePayload;
  const legacyKey = validateAnswerKey("PICK_BETTER_RESPONSE", { betterIndex: 1 });
  const ctx = { competencyKey: "concision_and_focus", prompt: "Which response is stronger?" };
  const legacyWrong = gradeDeterministic("PICK_BETTER_RESPONSE", legacy, legacyKey, { betterIndex: 0 }, ctx);
  const legacyRight = gradeDeterministic("PICK_BETTER_RESPONSE", legacy, legacyKey, { betterIndex: 1 }, ctx);
  check("legacy 2-option row: correctness unchanged by the context", legacyWrong.correct === false && legacyRight.correct === true);
  check(
    "legacy row, nothing matches: still explains WHY, and the technique line is DROPPED (no default pick)",
    legacyWrong.detail.includes("Why it works: ") && !legacyWrong.detail.includes("Technique:") &&
      !techniquesForCompetency("concision_and_focus").some((t) => legacyWrong.detail.includes(t.name)),
    legacyWrong.detail
  );
  const matched = gradeDeterministic("PICK_BETTER_RESPONSE", legacy, legacyKey, { betterIndex: 0 }, { competencyKey: "concision_and_focus", prompt: "Which response trims the hedging qualifiers?" });
  check("legacy row with an overlap: the matching technique is named", matched.detail.includes("Technique: Trim your qualifiers"), matched.detail);
  const deliveryCtx = { competencyKey: "delivery_presence", prompt: "Which reply keeps your eyes up, shoulders back and a slower pace with a pause?" };
  const deliveryWrong = gradeDeterministic("PICK_BETTER_RESPONSE", legacy, legacyKey, { betterIndex: 0 }, deliveryCtx);
  check(
    "bite-proof: a delivery check NEVER names a body/voice technique, even when the prompt matches one",
    deliveryWrong.detail.includes("Why it works: ") && !deliveryWrong.detail.includes("Technique:") &&
      !techniquesForCompetency("delivery_presence").some((t) => deliveryWrong.detail.includes(t.name)),
    deliveryWrong.detail
  );
  const storedDeliveryKey = validateAnswerKey("PICK_BETTER_RESPONSE", {
    betterIndex: 1,
    explanation: { techniqueId: "delivery-own-the-room", why: "Addressing the whole room shows command.", options: ["x", null] },
  });
  const storedDelivery = gradeDeterministic("PICK_BETTER_RESPONSE", legacy, storedDeliveryKey, { betterIndex: 0 }, deliveryCtx);
  check(
    "bite-proof: a STORED delivery technique is not shown on a written check",
    !storedDelivery.detail.includes("Address the whole room") && !storedDelivery.detail.includes("Technique:"),
    storedDelivery.detail
  );
  check("a correct answer gets a positive confirmation", legacyRight.detail.startsWith("Nice work"), legacyRight.detail);
  check(
    "bite-proof: WITHOUT a competency the detail carries no explanation (the template is wired to the context, not hardcoded)",
    !gradeDeterministic("PICK_BETTER_RESPONSE", legacy, legacyKey, { betterIndex: 0 }).detail.includes("Why it works")
  );

  const four = validateCheckPayload("PICK_BETTER_RESPONSE", {
    candidates: ["Buried headline answer.", "Your original line here.", "Headline-first answer.", "Hedged answer, sort of."],
    rationalePrompt: null,
  }) as PickBetterResponsePayload;
  const fourKey = validateAnswerKey("PICK_BETTER_RESPONSE", {
    betterIndex: 2,
    explanation: {
      techniqueId: "structure-headline-first",
      why: "Stating the conclusion first gives the listener a frame for the details.",
      options: ["Strong content, but the conclusion arrives last.", "Your line never states a conclusion.", null, "The hedges blur the point."],
    },
  });
  const sctx = { competencyKey: "structure_and_clarity", prompt: "Which response is strongest?" };
  const pickBuried = gradeDeterministic("PICK_BETTER_RESPONSE", four, fourKey, { betterIndex: 0 }, sctx);
  check("4-option: index 0..3 accepted; the stored key decides", pickBuried.correct === false && gradeDeterministic("PICK_BETTER_RESPONSE", four, fourKey, { betterIndex: 2 }, sctx).correct === true);
  check(
    "4-option wrong pick: says what THAT option got wrong + why + the named technique",
    pickBuried.detail.includes("What your pick missed: Strong content, but the conclusion arrives last.") &&
      pickBuried.detail.includes("Why it works: Stating the conclusion first") &&
      pickBuried.detail.includes("Technique: Headline first"),
    pickBuried.detail
  );
  check(
    "bite-proof: picking a DIFFERENT distractor gives THAT distractor's miss",
    gradeDeterministic("PICK_BETTER_RESPONSE", four, fourKey, { betterIndex: 3 }, sctx).detail.includes("The hedges blur the point."),
  );
  check("4-option: betterIndex 4 throws", expectThrow(() => gradeDeterministic("PICK_BETTER_RESPONSE", four, fourKey, { betterIndex: 4 }), "pbr4-oob"));
  check(
    "a stored key past the stored candidates throws (corrupt row, not a wrong answer)",
    expectThrow(() => gradeDeterministic("PICK_BETTER_RESPONSE", legacy, validateAnswerKey("PICK_BETTER_RESPONSE", { betterIndex: 3 }), { betterIndex: 0 }), "pbr-corrupt")
  );
  check(
    "a stored technique id from ANOTHER competency is not trusted (template technique instead)",
    !gradeDeterministic("PICK_BETTER_RESPONSE", four, fourKey, { betterIndex: 0 }, { competencyKey: "delivery_presence" }).detail.includes("Headline first"),
  );
}

console.log("\n3. FILL_IN_BLANK");
{
  const payload = validateCheckPayload("FILL_IN_BLANK", {
    segments: ["I practiced ", " before the interview."],
    blankCount: 1,
  }) as FillInBlankPayload;
  const answerKey = validateAnswerKey("FILL_IN_BLANK", {
    accepted: [["active listening", "reflective listening"]],
  });

  const exact = gradeDeterministic("FILL_IN_BLANK", payload, answerKey, {
    blanks: ["active listening"],
  });
  check("exact match -> correct", exact.correct === true && exact.score === 1);

  const synonym = gradeDeterministic("FILL_IN_BLANK", payload, answerKey, {
    blanks: ["reflective listening"],
  });
  check(
    "match against the second accepted entry (synonym) -> correct",
    synonym.correct === true && synonym.score === 1
  );

  const messy = gradeDeterministic("FILL_IN_BLANK", payload, answerKey, {
    blanks: ["  Active   Listening "],
  });
  check(
    "trim + collapse + case-fold -> correct ('  Active   Listening ' matches 'active listening')",
    messy.correct === true && messy.score === 1,
    JSON.stringify(messy)
  );

  const twoBlankPayload = validateCheckPayload("FILL_IN_BLANK", {
    segments: ["I said ", " instead of ", "."],
    blankCount: 2,
  }) as FillInBlankPayload;
  const twoBlankKey = validateAnswerKey("FILL_IN_BLANK", {
    accepted: [["yes, and"], ["no, but"]],
  });
  const partial = gradeDeterministic("FILL_IN_BLANK", twoBlankPayload, twoBlankKey, {
    blanks: ["yes, and", "something wrong"],
  });
  check(
    "one of two blanks right -> score 0.5, correct: false",
    partial.score === 0.5 && partial.correct === false,
    JSON.stringify(partial)
  );

  check(
    "fewer entries than blankCount throws",
    expectThrow(
      () => gradeDeterministic("FILL_IN_BLANK", twoBlankPayload, twoBlankKey, { blanks: ["yes, and"] }),
      "fib-fewer"
    )
  );
  check(
    "more entries than blankCount throws",
    expectThrow(
      () =>
        gradeDeterministic("FILL_IN_BLANK", twoBlankPayload, twoBlankKey, {
          blanks: ["yes, and", "no, but", "extra"],
        }),
      "fib-more"
    )
  );

  check(
    "an accepted array containing an empty string throws at grade time",
    expectThrow(() => {
      // Bypass validateAnswerKey (which would already reject this at
      // generation time, 21-06) to prove grade.ts ALSO guards it independently.
      const unsafeKey = { accepted: [[""]] } as unknown as ReturnType<typeof validateAnswerKey>;
      gradeDeterministic("FILL_IN_BLANK", payload, unsafeKey, { blanks: [""] });
    }, "fib-empty-accepted")
  );

  // Prove substring/fuzzy matching is NOT silently accepted.
  const wrongButContains = gradeDeterministic("FILL_IN_BLANK", payload, answerKey, {
    blanks: ["I practiced active listening techniques"],
  });
  check(
    "a superstring of the accepted answer is NOT accepted as correct (no substring matching)",
    wrongButContains.correct === false,
    JSON.stringify(wrongButContains)
  );
}

console.log("\n4. gradeDeterministic throws for REWRITE_WEAK_LINE");
{
  const payload = validateCheckPayload("REWRITE_WEAK_LINE", {
    weakLine: "I guess we could maybe try to do better next time or something.",
    techniqueHint: "Name the specific behavior change.",
    rubricCriteria: ["Names a concrete behavior", "Avoids hedging language"],
  }) as RewriteWeakLinePayload;

  check(
    "gradeDeterministic('REWRITE_WEAK_LINE', ...) throws",
    expectThrow(
      () => gradeDeterministic("REWRITE_WEAK_LINE", payload as any, null, { rewrittenLine: "x" }),
      "rwl-throws"
    )
  );
}

console.log("\n5. Weight-class routing");
{
  check(
    "CONTRIBUTION_SOURCE_FOR_FORMAT(MULTIPLE_CHOICE) === CHECK_DETERMINISTIC",
    CONTRIBUTION_SOURCE_FOR_FORMAT("MULTIPLE_CHOICE") === "CHECK_DETERMINISTIC"
  );
  check(
    "CONTRIBUTION_SOURCE_FOR_FORMAT(FILL_IN_BLANK) === CHECK_DETERMINISTIC",
    CONTRIBUTION_SOURCE_FOR_FORMAT("FILL_IN_BLANK") === "CHECK_DETERMINISTIC"
  );
  check(
    "CONTRIBUTION_SOURCE_FOR_FORMAT(PICK_BETTER_RESPONSE) === CHECK_DETERMINISTIC",
    CONTRIBUTION_SOURCE_FOR_FORMAT("PICK_BETTER_RESPONSE") === "CHECK_DETERMINISTIC"
  );
  check(
    "CONTRIBUTION_SOURCE_FOR_FORMAT(REWRITE_WEAK_LINE) === CHECK_MODEL_GRADED",
    CONTRIBUTION_SOURCE_FOR_FORMAT("REWRITE_WEAK_LINE") === "CHECK_MODEL_GRADED"
  );
  // Duplicated from 21-05's own verifier DELIBERATELY — this is the file that
  // would be edited if someone decided rewrites should count the same; the
  // guard belongs where the change would happen.
  check(
    "CONTRIBUTION_WEIGHTS[CHECK_DETERMINISTIC] > CONTRIBUTION_WEIGHTS[CHECK_MODEL_GRADED]",
    CONTRIBUTION_WEIGHTS.CHECK_DETERMINISTIC > CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED
  );
  check(
    "isDeterministicFormat is false ONLY for REWRITE_WEAK_LINE",
    isDeterministicFormat("MULTIPLE_CHOICE") &&
      isDeterministicFormat("FILL_IN_BLANK") &&
      isDeterministicFormat("PICK_BETTER_RESPONSE") &&
      !isDeterministicFormat("REWRITE_WEAK_LINE")
  );
}

async function runPureRewriteSection() {
console.log("\n6. gradeRewriteWithModel — model-graded, injectable callModel, no API key needed");
{
  const payload = validateCheckPayload("REWRITE_WEAK_LINE", {
    weakLine: "I guess we could maybe try to do better next time or something.",
    techniqueHint: "Name the specific behavior change and remove hedging.",
    rubricCriteria: ["Names a concrete behavior", "Avoids hedging language"],
  }) as RewriteWeakLinePayload;

  const scoreFiveStub: CallRewriteModel = async () => ({
    score: 5,
    rationale: "Fully applies the technique.",
    criteriaMet: [true, true],
  });
  const fiveResult = await gradeRewriteWithModel({
    payload,
    response: { rewrittenLine: "Next time, I will name the specific deliverable and the date." },
    callModel: scoreFiveStub,
  });
  check(
    "score 5 normalizes to 1 (normalizeRubricScore(5) === 1)",
    "score" in fiveResult && fiveResult.score === 1,
    JSON.stringify(fiveResult)
  );

  const scoreOneStub: CallRewriteModel = async () => ({
    score: 1,
    rationale: "Did not apply the technique.",
    criteriaMet: [false, false],
  });
  const oneResult = await gradeRewriteWithModel({
    payload,
    response: { rewrittenLine: "I guess we could try." },
    callModel: scoreOneStub,
  });
  check(
    "score 1 (the rubric's FLOOR) normalizes to 0, not 20% credit",
    "score" in oneResult && oneResult.score === 0,
    JSON.stringify(oneResult)
  );
  check(
    "normalizeRubricScore(1) itself is 0, confirming the imported function's floor behaviour",
    normalizeRubricScore(1) === 0
  );

  const mismatchedCriteriaStub: CallRewriteModel = async () => ({
    score: 3,
    rationale: "Partially applies the technique.",
    criteriaMet: [true, true, true], // payload only has 2 criteria
  });
  const mismatchedResult = await gradeRewriteWithModel({
    payload,
    response: { rewrittenLine: "Better, but still vague." },
    callModel: mismatchedCriteriaStub,
  });
  check(
    "criteriaMet length mismatch is REJECTED, not truncated",
    "ok" in mismatchedResult && mismatchedResult.ok === false,
    JSON.stringify(mismatchedResult)
  );

  const outOfRangeStub: CallRewriteModel = async () => ({
    score: 7,
    rationale: "Invalid score.",
    criteriaMet: [true, true],
  });
  const outOfRangeResult = await gradeRewriteWithModel({
    payload,
    response: { rewrittenLine: "Something." },
    callModel: outOfRangeStub,
  });
  check(
    "an out-of-range score (7) is REJECTED, not clamped",
    "ok" in outOfRangeResult && outOfRangeResult.ok === false,
    JSON.stringify(outOfRangeResult)
  );

  check(
    "REWRITE_GRADING_SCHEMA is strict: true",
    REWRITE_GRADING_SCHEMA.strict === true
  );
}
}

async function runDatabaseSection() {
  if (!process.env.DATABASE_URL) {
    skip("7. submitAndGrade full round trip (no DATABASE_URL set)");
    skip("7b. THROWING callModel stub proves a closed format never reaches a model (no DATABASE_URL set)");
    skip("7c. AlreadyAnsweredError on a second submission (no DATABASE_URL set)");
    skip("7d. Exactly one MasteryContribution per attempt, at the format's weight class (no DATABASE_URL set)");
    return;
  }

  console.log("\n7. submitAndGrade — requires a database");

  const { prisma } = await import("../lib/prisma");

  const testEmail = `check-grading-verify-${randomUUID()}@example.com`;
  const otherEmail = `check-grading-verify-other-${randomUUID()}@example.com`;
  const studyPlanIds: string[] = [];
  const knowledgeCheckIds: string[] = [];
  let userId = "";
  let otherUserId = "";

  async function makeStudyPlan(owner: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId: owner,
        title: "Verify Check Grading Plan",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-check-grading-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  async function makeKnowledgeCheck(args: {
    owner: string;
    studyPlanId: string;
    format: "MULTIPLE_CHOICE" | "FILL_IN_BLANK" | "PICK_BETTER_RESPONSE" | "REWRITE_WEAK_LINE";
    payload: unknown;
    answerKey: unknown;
  }) {
    const row = await prisma.knowledgeCheck.create({
      data: {
        userId: args.owner,
        studyPlanId: args.studyPlanId,
        competencyKey: "delivery_presence",
        format: args.format,
        prompt: "Verify check grading prompt",
        payload: args.payload as object,
        answerKey: (args.answerKey ?? Prisma.JsonNull) as object,
        generationModel: "verify-check-grading-stub",
      },
    });
    knowledgeCheckIds.push(row.id);
    return row;
  }

  try {
    const user = await prisma.user.create({
      data: { email: testEmail, name: "Check Grading Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Check Grading Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    const plan = await makeStudyPlan(userId);

    // --- 7a: deterministic round trip, exactly one contribution at CHECK_DETERMINISTIC ---
    const mcPayload = validateCheckPayload("MULTIPLE_CHOICE", {
      options: ["Ask a clarifying question", "Stay silent", "Interrupt", "Change the subject"],
    });
    const mcAnswerKey = validateAnswerKey("MULTIPLE_CHOICE", { correctIndex: 2 });
    const mcCheck = await makeKnowledgeCheck({
      owner: userId,
      studyPlanId: plan.id,
      format: "MULTIPLE_CHOICE",
      payload: mcPayload,
      answerKey: mcAnswerKey,
    });

    const throwingCallModel: CallRewriteModel = async () => {
      throw new Error(
        "callModel must NEVER be invoked for a deterministic (closed) format — routing is wrong"
      );
    };

    const mcOutcome = await submitAndGrade({
      userId,
      knowledgeCheckId: mcCheck.id,
      response: { selectedIndex: 2 },
      callModel: throwingCallModel,
    });
    check(
      "7a. MULTIPLE_CHOICE round trip: correct, gradedBy DETERMINISTIC",
      mcOutcome.correct === true && mcOutcome.gradedBy === "DETERMINISTIC" && mcOutcome.score === 1,
      JSON.stringify(mcOutcome)
    );
    check(
      "7b. the throwing callModel stub did NOT fire for a MULTIPLE_CHOICE submission",
      true // if it had fired, submitAndGrade above would have thrown and this script would have crashed
    );

    const mcContributions = await prisma.masteryContribution.findMany({
      where: { sourceAttemptId: mcOutcome.attemptId },
    });
    check(
      "7d. exactly one MasteryContribution for the attempt",
      mcContributions.length === 1,
      JSON.stringify(mcContributions)
    );
    check(
      "7d. that contribution's source is CHECK_DETERMINISTIC, weight matches CONTRIBUTION_WEIGHTS",
      mcContributions[0]?.source === "CHECK_DETERMINISTIC" &&
        mcContributions[0]?.weight === CONTRIBUTION_WEIGHTS.CHECK_DETERMINISTIC,
      JSON.stringify(mcContributions[0])
    );

    const mcAttemptRow = await prisma.knowledgeCheckAttempt.findUnique({
      where: { id: mcOutcome.attemptId },
    });
    check(
      "the attempt row is distinguishable as DETERMINISTIC with no graderModel",
      mcAttemptRow?.gradedBy === "DETERMINISTIC" && mcAttemptRow?.graderModel === null,
      JSON.stringify(mcAttemptRow)
    );

    // --- 7c: a second submission for the SAME check throws AlreadyAnsweredError ---
    const secondSubmissionThrew = await expectThrowAsync(async () => {
      await submitAndGrade({
        userId,
        knowledgeCheckId: mcCheck.id,
        response: { selectedIndex: 2 },
      });
    }, "already-answered");
    check("7c. a second submission for the same check throws", secondSubmissionThrew);
    try {
      await submitAndGrade({ userId, knowledgeCheckId: mcCheck.id, response: { selectedIndex: 2 } });
    } catch (err) {
      check(
        "7c. the thrown error is specifically AlreadyAnsweredError, not a raw P2002",
        err instanceof AlreadyAnsweredError,
        String(err)
      );
    }

    const mcContributionsAfterRetry = await prisma.masteryContribution.findMany({
      where: { userId, competencyKey: "delivery_presence", source: "CHECK_DETERMINISTIC" },
    });
    check(
      "7c. the rejected second submission did NOT write a second contribution",
      mcContributionsAfterRetry.length === 1,
      JSON.stringify(mcContributionsAfterRetry)
    );

    // --- 7e: ownership — another user's userId cannot grade this check ---
    const crossUserThrew = await expectThrowAsync(async () => {
      await submitAndGrade({
        userId: otherUserId,
        knowledgeCheckId: mcCheck.id,
        response: { selectedIndex: 2 },
      });
    }, "cross-user");
    check(
      "7e. another user's userId cannot submit against this check (ownership enforced)",
      crossUserThrew
    );
    try {
      await submitAndGrade({ userId: otherUserId, knowledgeCheckId: mcCheck.id, response: {} });
    } catch (err) {
      check("7e. the thrown error is CheckNotFoundError", err instanceof CheckNotFoundError, String(err));
    }

    // --- 7f: FILL_IN_BLANK round trip, partial credit ---
    const fibPayload = validateCheckPayload("FILL_IN_BLANK", {
      segments: ["I practiced ", " before the interview."],
      blankCount: 1,
    });
    const fibAnswerKey = validateAnswerKey("FILL_IN_BLANK", {
      accepted: [["active listening", "reflective listening"]],
    });
    const fibCheck = await makeKnowledgeCheck({
      owner: userId,
      studyPlanId: plan.id,
      format: "FILL_IN_BLANK",
      payload: fibPayload,
      answerKey: fibAnswerKey,
    });
    const fibOutcome = await submitAndGrade({
      userId,
      knowledgeCheckId: fibCheck.id,
      response: { blanks: ["  Active   Listening "] },
      callModel: throwingCallModel,
    });
    check(
      "7f. FILL_IN_BLANK round trip: typing variation accepted, gradedBy DETERMINISTIC",
      fibOutcome.correct === true && fibOutcome.gradedBy === "DETERMINISTIC",
      JSON.stringify(fibOutcome)
    );

    // --- 7g: PICK_BETTER_RESPONSE round trip ---
    const pbrPayload = validateCheckPayload("PICK_BETTER_RESPONSE", {
      candidates: [
        "I think maybe we could possibly try something else?",
        "Let's pause here and regroup.",
      ],
      rationalePrompt: null,
    });
    const pbrAnswerKey = validateAnswerKey("PICK_BETTER_RESPONSE", { betterIndex: 1 });
    const pbrCheck = await makeKnowledgeCheck({
      owner: userId,
      studyPlanId: plan.id,
      format: "PICK_BETTER_RESPONSE",
      payload: pbrPayload,
      answerKey: pbrAnswerKey,
    });
    const pbrOutcome = await submitAndGrade({
      userId,
      knowledgeCheckId: pbrCheck.id,
      response: { betterIndex: 1 },
      callModel: throwingCallModel,
    });
    check(
      "7g. PICK_BETTER_RESPONSE round trip: correct, gradedBy DETERMINISTIC",
      pbrOutcome.correct === true && pbrOutcome.gradedBy === "DETERMINISTIC",
      JSON.stringify(pbrOutcome)
    );

    // --- 7h: REWRITE_WEAK_LINE round trip — reaches the model, recorded at CHECK_MODEL_GRADED ---
    const rwlPayload = validateCheckPayload("REWRITE_WEAK_LINE", {
      weakLine: "I guess we could maybe try to do better next time or something.",
      techniqueHint: "Name the specific behavior change and remove hedging.",
      rubricCriteria: ["Names a concrete behavior", "Avoids hedging language"],
    });
    const rwlCheck = await makeKnowledgeCheck({
      owner: userId,
      studyPlanId: plan.id,
      format: "REWRITE_WEAK_LINE",
      payload: rwlPayload,
      answerKey: null,
    });

    let modelWasCalled = false;
    let techniqueSent: { name: string } | null | undefined;
    const scoringStub: CallRewriteModel = async (callArgs) => {
      modelWasCalled = true;
      techniqueSent = callArgs.technique;
      return {
        score: 4,
        rationale: "Mostly applies the technique; some hedging remains.",
        criteriaMet: [true, false],
      };
    };
    const rwlOutcome = await submitAndGrade({
      userId,
      knowledgeCheckId: rwlCheck.id,
      response: { rewrittenLine: "Next time, I will name the specific deliverable and the date." },
      callModel: scoringStub,
    });
    check("7h. REWRITE_WEAK_LINE submission DID reach the model", modelWasCalled);
    const deliveryNames = techniquesForCompetency("delivery_presence").map((t) => t.name);
    check(
      "7h. Q2: a delivery_presence rewrite (written) is handed NO body/voice technique",
      techniqueSent === null && deliveryNames.length > 0,
      JSON.stringify(techniqueSent)
    );
    check(
      "7h. Q2: the rewrite result is the grader's rationale with no technique line",
      rwlOutcome.detail === "Mostly applies the technique; some hedging remains.",
      rwlOutcome.detail
    );
    check(
      "7h. REWRITE_WEAK_LINE round trip: gradedBy MODEL, correct is null (no binary correct for a rewrite)",
      rwlOutcome.gradedBy === "MODEL" && rwlOutcome.correct === null,
      JSON.stringify(rwlOutcome)
    );
    check(
      "7h. normalizeRubricScore(4) === 0.75, matches the recorded score",
      rwlOutcome.score === 0.75,
      JSON.stringify(rwlOutcome)
    );

    const rwlAttemptRow = await prisma.knowledgeCheckAttempt.findUnique({
      where: { id: rwlOutcome.attemptId },
    });
    check(
      "7h. the attempt row is distinguishable as MODEL-graded, with a graderModel name recorded",
      rwlAttemptRow?.gradedBy === "MODEL" && typeof rwlAttemptRow?.graderModel === "string",
      JSON.stringify(rwlAttemptRow)
    );

    const rwlContributions = await prisma.masteryContribution.findMany({
      where: { sourceAttemptId: rwlOutcome.attemptId },
    });
    check(
      "7h. exactly one MasteryContribution for the rewrite attempt",
      rwlContributions.length === 1,
      JSON.stringify(rwlContributions)
    );
    check(
      "7h. the rewrite's contribution is recorded at CHECK_MODEL_GRADED — NEVER CHECK_DETERMINISTIC",
      rwlContributions[0]?.source === "CHECK_MODEL_GRADED" &&
        rwlContributions[0]?.weight === CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED,
      JSON.stringify(rwlContributions[0])
    );
    check(
      "7h. the rewrite's recorded weight is STRICTLY LESS than the deterministic checks' weight",
      (rwlContributions[0]?.weight ?? 1) < CONTRIBUTION_WEIGHTS.CHECK_DETERMINISTIC
    );

    // --- 7i: a failed model grade (malformed criteriaMet) writes NOTHING ---
    const rwlCheck2 = await makeKnowledgeCheck({
      owner: userId,
      studyPlanId: plan.id,
      format: "REWRITE_WEAK_LINE",
      payload: rwlPayload,
      answerKey: null,
    });
    const brokenStub: CallRewriteModel = async () => ({
      score: 3,
      rationale: "x",
      criteriaMet: [true, true, true], // mismatched length -> grading failure
    });
    const failedGradeThrew = await expectThrowAsync(async () => {
      await submitAndGrade({
        userId,
        knowledgeCheckId: rwlCheck2.id,
        response: { rewrittenLine: "Something." },
        callModel: brokenStub,
      });
    }, "rewrite-grading-failed");
    check(
      "7i. a failed model grade (criteriaMet mismatch) throws RewriteGradingFailedError",
      failedGradeThrew
    );
    try {
      await submitAndGrade({
        userId,
        knowledgeCheckId: rwlCheck2.id,
        response: { rewrittenLine: "Something." },
        callModel: brokenStub,
      });
    } catch (err) {
      check("7i. the thrown error IS RewriteGradingFailedError", err instanceof RewriteGradingFailedError);
    }
    const noAttemptWritten = await prisma.knowledgeCheckAttempt.findFirst({
      where: { knowledgeCheckId: rwlCheck2.id },
    });
    check("7i. a failed model grade writes NO attempt row", noAttemptWritten === null);
    const noContributionWritten = await prisma.masteryContribution.findMany({
      where: { userId, source: "CHECK_MODEL_GRADED" },
    });
    check(
      "7i. a failed model grade writes NO contribution (still exactly 1 from 7h)",
      noContributionWritten.length === 1,
      JSON.stringify(noContributionWritten)
    );
  } finally {
    // Teardown: delete in dependency order. Cascades handle most of this,
    // but be explicit so a partial failure above does not leak test data.
    await prisma.masteryContribution.deleteMany({ where: { userId: { in: [userId, otherUserId].filter(Boolean) } } });
    await prisma.knowledgeCheckAttempt.deleteMany({
      where: { knowledgeCheckId: { in: knowledgeCheckIds } },
    });
    await prisma.knowledgeCheck.deleteMany({ where: { id: { in: knowledgeCheckIds } } });
    await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
  }
}

runPureRewriteSection()
  .then(() => runDatabaseSection())
  .catch((err) => {
    failures += 1;
    console.log(`  FAIL unexpected error\n         ${err}`);
  })
  .finally(async () => {
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect().catch(() => {});
    process.exit(failures === 0 ? 0 : 1);
  });
