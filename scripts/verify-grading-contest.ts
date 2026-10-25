/**
 * Proves REQ-112's second clause behaviorally, not merely at the column
 * level: contesting a grading must REDUCE THE COMPUTED MASTERY FIGURE, not
 * merely set a `reversedAt` timestamp that nothing reads. It also proves the
 * ledger row survives (nothing is deleted), the generated question is
 * flagged and ranked by contest count, a second contest is rejected without
 * a second reversal, cross-user and ungraded cases throw with NOTHING
 * written, and resolution either keeps the reversal (UPHELD) or appends a
 * restoration without un-reversing the original row (REJECTED).
 *
 * This battery needs a database for every assertion below — there is no pure
 * section. Without `DATABASE_URL` it prints an explicit SKIP banner naming
 * the assertions not run; it never reports a skip as a pass.
 *
 * Run: npx tsx scripts/verify-grading-contest.ts
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  raiseContest,
  resolveContest,
  listFlaggedChecks,
  NotFoundError,
  NotGradedError,
  InvalidReasonError,
  AlreadyContestedError,
  ContestNotOpenError,
} from "../lib/study-plan/checks/contest";
import { submitAndGrade } from "../lib/study-plan/checks/grade";
import { validateCheckPayload, validateAnswerKey } from "../lib/study-plan/checks/types";
import { readContributions } from "../lib/mastery/ledger";
import { computeMastery } from "../lib/mastery/compute";

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

async function expectThrowAsync(
  fn: () => Promise<unknown>
): Promise<{ threw: true; error: unknown } | { threw: false }> {
  try {
    await fn();
    return { threw: false };
  } catch (error) {
    return { threw: true, error };
  }
}

const COMPETENCY_KEY = "delivery_presence";
const SKIPPED_ASSERTIONS = [
  "1. baseline mastery figure",
  "2. reversal is immediate (contributionsReversed, reversedAt, excluded from readContributions, mastery figure changes)",
  "3. the reversed row survives with includeReversed: true",
  "4. the question is flagged and listFlaggedChecks reports it",
  "5. idempotence — a second raiseContest throws AlreadyContestedError, no second reversal",
  "6. ownership — a different user's raiseContest throws with no id in the message",
  "7. ungraded attempt — raiseContest throws and writes nothing",
  "8. reason validation — 3 chars throws, 2500 chars throws, 50 chars succeeds",
  "9. resolveContest UPHELD — reversal stays, mastery stays at post-contest figure, flag reason records upholding",
  "10. resolveContest REJECTED — new contribution, original row still reversed, occurredAt carried, mastery returns to baseline",
  "11. double resolve throws",
  "12. flag ranking — a second contested attempt on the same check reports contestCount: 2 and ranks above a single-contest check",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("\nSKIP: no DATABASE_URL set. The following assertions did NOT run:");
    for (const name of SKIPPED_ASSERTIONS) skip(name);
    console.log(
      "\nSet DATABASE_URL against a migrated local database to run this battery for real."
    );
    return;
  }

  const { prisma } = await import("../lib/prisma");

  const testEmail = `grading-contest-verify-${randomUUID()}@example.com`;
  const otherEmail = `grading-contest-verify-other-${randomUUID()}@example.com`;
  const studyPlanIds: string[] = [];
  const knowledgeCheckIds: string[] = [];
  let userId = "";
  let otherUserId = "";

  async function makeStudyPlan(owner: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId: owner,
        title: "Verify Grading Contest Plan",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-grading-contest-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  async function makeMultipleChoiceCheck(owner: string, studyPlanId: string) {
    const payload = validateCheckPayload("MULTIPLE_CHOICE", {
      options: ["Ask a clarifying question", "Stay silent", "Interrupt", "Change the subject"],
    });
    const answerKey = validateAnswerKey("MULTIPLE_CHOICE", { correctIndex: 2 });
    const row = await prisma.knowledgeCheck.create({
      data: {
        userId: owner,
        studyPlanId,
        competencyKey: COMPETENCY_KEY,
        format: "MULTIPLE_CHOICE",
        prompt: "Verify grading contest prompt",
        payload: payload as object,
        answerKey: answerKey as object,
        generationModel: "verify-grading-contest-stub",
      },
    });
    knowledgeCheckIds.push(row.id);
    return row;
  }

  try {
    const user = await prisma.user.create({
      data: { email: testEmail, name: "Grading Contest Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Grading Contest Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    const plan = await makeStudyPlan(userId);

    console.log("\n1-8. Core reversal/idempotence/ownership/validation battery");

    // --- Setup: a graded attempt, confirm one MasteryContribution exists ---
    const check1 = await makeMultipleChoiceCheck(userId, plan.id);
    const outcome1 = await submitAndGrade({
      userId,
      knowledgeCheckId: check1.id,
      response: { selectedIndex: 2 },
    });
    const attemptId = outcome1.attemptId;

    const setupContributions = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
    });
    check(
      "setup: exactly one MasteryContribution exists after grading",
      setupContributions.length === 1,
      JSON.stringify(setupContributions)
    );

    // --- 1. BASELINE ---
    const now = new Date();
    const baselineMastery = computeMastery(setupContributions, now);
    const baselineCompetency = baselineMastery.competencies.find(
      (c) => c.competencyKey === COMPETENCY_KEY
    );
    check(
      "1. baseline mastery figure is non-null",
      baselineCompetency?.lifetimePercent !== null &&
        baselineCompetency?.lifetimePercent !== undefined,
      JSON.stringify(baselineCompetency)
    );
    const baselinePercent = baselineCompetency?.lifetimePercent ?? null;

    // --- 2. REVERSAL IS IMMEDIATE ---
    const contestResult = await raiseContest({
      userId,
      attemptId,
      reason: "I believe option 2 is ambiguous and both answers are defensible.",
    });
    check(
      "2. raiseContest reports contributionsReversed === 1",
      contestResult.contributionsReversed === 1,
      JSON.stringify(contestResult)
    );

    const contributionRow = await prisma.masteryContribution.findFirst({
      where: { sourceAttemptId: attemptId },
    });
    check(
      "2. the contribution's reversedAt is non-null with reason containing the contest id",
      contributionRow?.reversedAt !== null &&
        contributionRow?.reversedAt !== undefined &&
        (contributionRow?.reversedReason ?? "").includes(contestResult.contestId),
      JSON.stringify(contributionRow)
    );

    const afterContestLive = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
    });
    check(
      "2. readContributions (default includeReversed: false) no longer returns the reversed row",
      afterContestLive.length === 0,
      JSON.stringify(afterContestLive)
    );

    const postContestMastery = computeMastery(afterContestLive, now);
    const postContestCompetency = postContestMastery.competencies.find(
      (c) => c.competencyKey === COMPETENCY_KEY
    );
    check(
      "2. the recomputed mastery figure CHANGED from the baseline (proves the mark stopped counting)",
      (postContestCompetency?.lifetimePercent ?? null) !== baselinePercent,
      `baseline=${baselinePercent} post-contest=${postContestCompetency?.lifetimePercent}`
    );

    // --- 3. THE ROW SURVIVES ---
    const afterContestAll = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
      includeReversed: true,
    });
    check(
      "3. readContributions(includeReversed: true) still returns the reversed row",
      afterContestAll.some((row) => row.id === contributionRow?.id),
      JSON.stringify(afterContestAll)
    );

    // --- 4. QUESTION FLAGGED ---
    const flaggedCheckRow = await prisma.knowledgeCheck.findUnique({ where: { id: check1.id } });
    check(
      "4. KnowledgeCheck.flaggedAt is non-null",
      flaggedCheckRow?.flaggedAt !== null && flaggedCheckRow?.flaggedAt !== undefined,
      JSON.stringify(flaggedCheckRow)
    );
    const flaggedList1 = await listFlaggedChecks();
    const flaggedSummary1 = flaggedList1.find((f) => f.checkId === check1.id);
    check(
      "4. listFlaggedChecks includes it with contestCount: 1",
      flaggedSummary1?.contestCount === 1,
      JSON.stringify(flaggedSummary1)
    );

    // --- 5. IDEMPOTENCE ---
    const secondContestAttempt = await expectThrowAsync(() =>
      raiseContest({ userId, attemptId, reason: "Trying to contest the same attempt twice." })
    );
    check(
      "5. a second raiseContest on the same attempt throws AlreadyContestedError",
      secondContestAttempt.threw &&
        secondContestAttempt.error instanceof AlreadyContestedError &&
        (secondContestAttempt.error as AlreadyContestedError).existingContestId ===
          contestResult.contestId
    );
    const reversedCountAfterRetry = await prisma.masteryContribution.count({
      where: { sourceAttemptId: attemptId, reversedAt: { not: null } },
    });
    check(
      "5. contributionsReversed did not increase on the duplicate attempt (re-queried, not trusted from the throw)",
      reversedCountAfterRetry === 1,
      `reversedCountAfterRetry=${reversedCountAfterRetry}`
    );

    // --- 6. OWNERSHIP ---
    const check2 = await makeMultipleChoiceCheck(userId, plan.id);
    const outcome2 = await submitAndGrade({
      userId,
      knowledgeCheckId: check2.id,
      response: { selectedIndex: 2 },
    });
    const crossUserAttempt = await expectThrowAsync(() =>
      raiseContest({
        userId: otherUserId,
        attemptId: outcome2.attemptId,
        reason: "A different user trying to contest someone else's attempt.",
      })
    );
    check(
      "6. raiseContest with a different userId throws",
      crossUserAttempt.threw && crossUserAttempt.error instanceof NotFoundError
    );
    const ownershipMessage =
      crossUserAttempt.threw && crossUserAttempt.error instanceof Error
        ? crossUserAttempt.error.message
        : "";
    check(
      "6. the error message contains neither the attempt id nor either user id",
      !ownershipMessage.includes(outcome2.attemptId) &&
        !ownershipMessage.includes(userId) &&
        !ownershipMessage.includes(otherUserId),
      ownershipMessage
    );

    // --- 7. UNGRADED ---
    const check3 = await makeMultipleChoiceCheck(userId, plan.id);
    const ungradedAttemptId = randomUUID();
    await prisma.knowledgeCheckAttempt.create({
      data: {
        id: ungradedAttemptId,
        knowledgeCheckId: check3.id,
        userId,
        response: { selectedIndex: 2 } as Prisma.InputJsonValue,
        correct: null,
        score: null,
        gradedBy: "MODEL",
        gradedAt: null,
      },
    });
    const ungradedContest = await expectThrowAsync(() =>
      raiseContest({ userId, attemptId: ungradedAttemptId, reason: "Contesting before grading." })
    );
    check(
      "7. raiseContest on an ungraded attempt throws NotGradedError",
      ungradedContest.threw && ungradedContest.error instanceof NotGradedError
    );
    const noContestWritten = await prisma.gradingContest.findUnique({
      where: { attemptId: ungradedAttemptId },
    });
    const noReversalWritten = await prisma.masteryContribution.findMany({
      where: { sourceAttemptId: ungradedAttemptId },
    });
    const noFlagWritten = await prisma.knowledgeCheck.findUnique({ where: { id: check3.id } });
    check(
      "7. no contest row, no reversal, no flag were written",
      noContestWritten === null &&
        noReversalWritten.length === 0 &&
        noFlagWritten?.flaggedAt === null,
      JSON.stringify({ noContestWritten, noReversalWritten, noFlagWritten })
    );

    // --- 8. REASON VALIDATION ---
    const check4 = await makeMultipleChoiceCheck(userId, plan.id);
    const outcome4 = await submitAndGrade({
      userId,
      knowledgeCheckId: check4.id,
      response: { selectedIndex: 2 },
    });
    const shortReason = await expectThrowAsync(() =>
      raiseContest({ userId, attemptId: outcome4.attemptId, reason: "abc" })
    );
    check(
      "8. a 3-character reason throws InvalidReasonError",
      shortReason.threw && shortReason.error instanceof InvalidReasonError
    );
    const longReason = await expectThrowAsync(() =>
      raiseContest({ userId, attemptId: outcome4.attemptId, reason: "x".repeat(2500) })
    );
    check(
      "8. a 2500-character reason throws InvalidReasonError",
      longReason.threw && longReason.error instanceof InvalidReasonError
    );
    const validReasonResult = await raiseContest({
      userId,
      attemptId: outcome4.attemptId,
      reason: "x".repeat(50),
    });
    check(
      "8. a 50-character reason succeeds",
      typeof validReasonResult.contestId === "string" && validReasonResult.contestId.length > 0
    );

    console.log("\n9. resolveContest UPHELD");

    const upheldContributionsBefore = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
    });
    const upheldMasteryBefore = computeMastery(upheldContributionsBefore, now).competencies.find(
      (c) => c.competencyKey === COMPETENCY_KEY
    )?.lifetimePercent;

    await resolveContest({
      contestId: contestResult.contestId,
      status: "UPHELD",
      resolutionNote: "Confirmed the question's options were ambiguous.",
    });

    const contributionAfterUphold = await prisma.masteryContribution.findUnique({
      where: { id: contributionRow!.id },
    });
    check(
      "9. the contribution stays reversed after UPHELD",
      contributionAfterUphold?.reversedAt !== null,
      JSON.stringify(contributionAfterUphold)
    );

    const upheldContributionsAfter = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
    });
    const upheldMasteryAfter = computeMastery(upheldContributionsAfter, now).competencies.find(
      (c) => c.competencyKey === COMPETENCY_KEY
    )?.lifetimePercent;
    check(
      "9. mastery stays at the post-contest figure (unchanged by UPHELD)",
      upheldMasteryAfter === upheldMasteryBefore,
      `before=${upheldMasteryBefore} after=${upheldMasteryAfter}`
    );

    const checkAfterUphold = await prisma.knowledgeCheck.findUnique({ where: { id: check1.id } });
    check(
      "9. the flag reason records the upholding",
      (checkAfterUphold?.flagReason ?? "").includes("upheld:"),
      JSON.stringify(checkAfterUphold?.flagReason)
    );

    console.log("\n10. resolveContest REJECTED");

    const check5 = await makeMultipleChoiceCheck(userId, plan.id);
    const outcome5 = await submitAndGrade({
      userId,
      knowledgeCheckId: check5.id,
      response: { selectedIndex: 2 },
    });
    const originalContribution5 = await prisma.masteryContribution.findFirst({
      where: { sourceAttemptId: outcome5.attemptId },
    });

    // Snapshot the LIVE mastery figure immediately before this contest — this
    // is the figure the resolved-REJECTED outcome must return to, since the
    // restored row carries the same rawScore/weight/occurredAt as the
    // original. Using a live (default includeReversed: false) read means
    // every OTHER already-reversed row in the ledger (check1's UPHELD
    // reversal, check4's still-OPEN reversal) is excluded from both sides of
    // this comparison exactly as it would be from the real figure a student
    // sees.
    const liveBeforeRejectContest = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
    });
    const masteryBeforeRejectContest = computeMastery(
      liveBeforeRejectContest,
      now
    ).competencies.find((c) => c.competencyKey === COMPETENCY_KEY)?.lifetimePercent;

    const rejectContest = await raiseContest({
      userId,
      attemptId: outcome5.attemptId,
      reason: "I believe my answer should also have been accepted as correct.",
    });

    await resolveContest({
      contestId: rejectContest.contestId,
      status: "REJECTED",
      resolutionNote: "On review, the original answer key stands.",
    });

    const rowsForAttempt5 = await prisma.masteryContribution.findMany({
      where: { sourceAttemptId: outcome5.attemptId },
    });
    check(
      "10. a NEW contribution exists (total row count for the attempt is now 2)",
      rowsForAttempt5.length === 2,
      JSON.stringify(rowsForAttempt5)
    );
    const originalRow5After = rowsForAttempt5.find((r) => r.id === originalContribution5?.id);
    check(
      "10. the ORIGINAL row's reversedAt is STILL non-null",
      originalRow5After?.reversedAt !== null && originalRow5After?.reversedAt !== undefined,
      JSON.stringify(originalRow5After)
    );
    const restoredRow5 = rowsForAttempt5.find((r) => r.id !== originalContribution5?.id);
    check(
      "10. the new row's occurredAt equals the original's",
      restoredRow5?.occurredAt.getTime() === originalContribution5?.occurredAt.getTime(),
      `restored=${restoredRow5?.occurredAt.toISOString()} original=${originalContribution5?.occurredAt.toISOString()}`
    );

    const liveContributionsAfterReject = await readContributions(userId, {
      competencyKey: COMPETENCY_KEY as never,
    });
    const masteryAfterReject = computeMastery(liveContributionsAfterReject, now).competencies.find(
      (c) => c.competencyKey === COMPETENCY_KEY
    )?.lifetimePercent;
    check(
      "10. the recomputed mastery figure returns to the figure from immediately before this contest",
      masteryAfterReject === masteryBeforeRejectContest,
      `afterReject=${masteryAfterReject} beforeContest=${masteryBeforeRejectContest}`
    );

    console.log("\n11. double resolve");

    const doubleResolve = await expectThrowAsync(() =>
      resolveContest({
        contestId: rejectContest.contestId,
        status: "UPHELD",
        resolutionNote: "Trying to resolve an already-resolved contest.",
      })
    );
    check(
      "11. resolving an already-resolved contest throws",
      doubleResolve.threw && doubleResolve.error instanceof ContestNotOpenError
    );

    console.log("\n12. flag ranking");

    // ONE KnowledgeCheck, a SECOND attempt against it by a second scratch
    // user. `submitAndGrade` scopes a check to its OWNING student (21-06:
    // each student's checks are generated from their OWN transcript), so a
    // second student's attempt against someone else's check row is inserted
    // directly here rather than through `submitAndGrade` — this battery is
    // proving `listFlaggedChecks`'s ranking, not `submitAndGrade`'s ownership
    // rule (already proven in section 6/scripts/verify-check-grading.ts).
    const check6 = await makeMultipleChoiceCheck(userId, plan.id);
    const outcome6 = await submitAndGrade({
      userId,
      knowledgeCheckId: check6.id,
      response: { selectedIndex: 2 },
    });
    await raiseContest({
      userId,
      attemptId: outcome6.attemptId,
      reason: "First contest against this shared question.",
    });

    const secondAttemptId = randomUUID();
    await prisma.knowledgeCheckAttempt.create({
      data: {
        id: secondAttemptId,
        knowledgeCheckId: check6.id,
        userId: otherUserId,
        response: { selectedIndex: 2 } as Prisma.InputJsonValue,
        correct: false,
        score: 0,
        gradedBy: "DETERMINISTIC",
        gradedAt: new Date(),
      },
    });
    await raiseContest({
      userId: otherUserId,
      attemptId: secondAttemptId,
      reason: "Second contest, different student, same generated question.",
    });

    const flaggedList2 = await listFlaggedChecks();
    const check6Summary = flaggedList2.find((f) => f.checkId === check6.id);
    check(
      "12. listFlaggedChecks reports contestCount: 2 for the twice-contested check",
      check6Summary?.contestCount === 2,
      JSON.stringify(check6Summary)
    );
    const rankIndexOf = (id: string) => flaggedList2.findIndex((f) => f.checkId === id);
    const singleContestCheck = check4; // contested exactly once, in section 8 above
    check(
      "12. the twice-contested check is ordered above a single-contest check",
      rankIndexOf(check6.id) < rankIndexOf(singleContestCheck.id),
      JSON.stringify(flaggedList2.map((f) => ({ checkId: f.checkId, contestCount: f.contestCount })))
    );
    check(
      "12. results are ordered by contestCount descending",
      flaggedList2.every(
        (entry, i) => i === 0 || flaggedList2[i - 1].contestCount >= entry.contestCount
      ),
      JSON.stringify(flaggedList2.map((f) => f.contestCount))
    );

    console.log("\n13. PHASE 23 — a 4-option check with a stored explanation stays contestable");
    {
      const why = "Leading with the decision frames the details that follow.";
      const pbr = await prisma.knowledgeCheck.create({
        data: {
          userId,
          studyPlanId: plan.id,
          competencyKey: "structure_and_clarity",
          format: "PICK_BETTER_RESPONSE",
          prompt: "Which response handles this moment best?",
          payload: validateCheckPayload("PICK_BETTER_RESPONSE", {
            candidates: ["Conclusion last.", "Your line.", "Conclusion first.", "Hedged, sort of."],
            rationalePrompt: null,
          }) as object,
          answerKey: validateAnswerKey("PICK_BETTER_RESPONSE", {
            betterIndex: 2,
            explanation: { techniqueId: "structure-headline-first", why, options: ["Buried.", "Missing.", null, "Hedged."] },
          }) as object,
          generationModel: "verify-grading-contest-stub",
        },
      });
      knowledgeCheckIds.push(pbr.id);
      const graded = await submitAndGrade({ userId, knowledgeCheckId: pbr.id, response: { betterIndex: 0 } });
      check("13. the wrong pick is graded deterministically with an explanation", graded.correct === false && graded.detail.includes(why), graded.detail);
      const contest = await raiseContest({ userId, attemptId: graded.attemptId, reason: "I think the first one was actually fine." });
      const after = await prisma.knowledgeCheckAttempt.findUnique({ where: { id: graded.attemptId } });
      check(
        "13. contesting it flags without re-grading: the stored explanation and mark stand",
        !!contest && after?.graderRationale === graded.detail && after?.correct === false,
        JSON.stringify(after)
      );
    }
  } finally {
    const userIds = [userId, otherUserId].filter(Boolean);
    await prisma.gradingContest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.masteryContribution.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.knowledgeCheckAttempt.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.knowledgeCheck.deleteMany({ where: { id: { in: knowledgeCheckIds } } });
    await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect().catch(() => {});
  });
