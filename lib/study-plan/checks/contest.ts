/**
 * Grading contests. REQ-112: "a way to flag a wrong mark, which also surfaces
 * bad generated questions instead of letting them quietly damage mastery."
 *
 * THE SETTLED SEMANTICS ARE "THE MARK STANDS; THE CONTEST IS A FLAG" —
 * 21-CONTEXT.md. Raising a contest does NOT rewrite the attempt's `correct`/
 * `score` columns and does NOT auto-grant anything. What it does, in one
 * transaction:
 *   1. Reverses every unreversed `MasteryContribution` sourced from the
 *      contested attempt via 21-05's `reverseContribution` — the disputed
 *      mark STOPS COUNTING immediately, before any human reviews it. These
 *      questions are model-generated from the student's own transcript, so a
 *      wrong mark is a plausible failure, not a rare one; leaving it in the
 *      figure until review would mean the number is knowingly wrong for the
 *      whole review window.
 *   2. Flags the `KnowledgeCheck` behind the attempt — not only the attempt —
 *      so a bad generated question is discoverable (`listFlaggedChecks`)
 *      rather than only its one grading.
 *
 * Reversal is RECORDED, not destructive: 21-05's ledger keeps the reversed row
 * forever (`reversedAt`/`reversedReason`, never deleted), which is exactly
 * what lets `resolveContest` restore a REJECTED contest's mark later without
 * erasing the fact that it was disputed.
 *
 * `resolveContest` IS NOT EXPOSED THROUGH A ROUTE IN THIS PLAN. There is no
 * admin review UI in this phase, deliberately — that decision has not been
 * made yet. It is reachable only from a script (this module's own verifier,
 * or a future one-off). A reader should not assume the route is missing by
 * accident.
 *
 * THE CALLING AFFORDANCE IS NOT IN THIS PLAN EITHER. 21-22 owns the
 * check-taking component and folds a "Contest this grading" control into the
 * post-submission result view, which POSTs to the route this plan ships.
 * REQ-112's text requires a contest reachable "from the surface that showed
 * them the mark" — that half lands in 21-22, not here. See 21-15-SUMMARY.md.
 */
import { prisma } from "@/lib/prisma";
import { reverseContribution } from "@/lib/mastery/ledger";

export const CONTEST_STATUSES = ["OPEN", "UPHELD", "REJECTED"] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 2000;

/**
 * Thrown whether the attempt does not exist OR belongs to another user — the
 * SAME message and status in both cases, deliberately. Distinguishing them
 * would turn this function (and the route built on it) into an id oracle an
 * attacker could use to enumerate other students' attempt ids.
 */
export class NotFoundError extends Error {
  constructor(public readonly attemptId: string) {
    super("Knowledge check attempt not found");
    this.name = "NotFoundError";
  }
}

export class NotGradedError extends Error {
  constructor(public readonly attemptId: string) {
    super(`Attempt ${attemptId} has not been graded yet; nothing to contest`);
    this.name = "NotGradedError";
  }
}

export class InvalidReasonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReasonError";
  }
}

/**
 * Thrown on a second contest for the same attempt (`GradingContest.attemptId`
 * is `@unique`, 21-03). Carries the EXISTING contest id so a caller (the
 * route, eventually 21-22's UI) can show the existing contest instead of a
 * raw database constraint error.
 */
export class AlreadyContestedError extends Error {
  constructor(
    public readonly attemptId: string,
    public readonly existingContestId: string
  ) {
    super(`Attempt ${attemptId} already has a contest (${existingContestId})`);
    this.name = "AlreadyContestedError";
  }
}

export class ContestNotOpenError extends Error {
  constructor(public readonly contestId: string, public readonly status: string) {
    super(`Contest ${contestId} is not OPEN (status: ${status})`);
    this.name = "ContestNotOpenError";
  }
}

export class ContestNotFoundError extends Error {
  constructor(public readonly contestId: string) {
    super(`Contest ${contestId} does not exist`);
    this.name = "ContestNotFoundError";
  }
}

function validateReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN_LENGTH || trimmed.length > REASON_MAX_LENGTH) {
    throw new InvalidReasonError(
      `reason must be ${REASON_MIN_LENGTH}..${REASON_MAX_LENGTH} characters after trimming, got ${trimmed.length}`
    );
  }
  return trimmed;
}

export interface RaiseContestResult {
  contestId: string;
  contributionsReversed: number;
  checkFlagged: boolean;
}

/**
 * Raises a contest against a GRADED attempt owned by `userId`.
 *
 * DISCLOSED DEVIATION FROM THE PLAN'S "everything in ONE prisma.$transaction"
 * INSTRUCTION, matching 21-11-SUMMARY.md's precedent: 21-05's
 * `reverseContribution` hardcodes the module-level `prisma` singleton with no
 * injectable transaction-client parameter, so it cannot literally join the
 * same low-level transaction as the ownership check and `GradingContest`
 * creation. This plan's instruction is explicit that `reverseContribution`
 * must be reused rather than its invariants reimplemented inline (unlike
 * 21-11's choice for `recordContributions`), so the ownership/idempotence
 * check and contest creation happen in one `prisma.$transaction` (the part
 * where a race between two concurrent calls must not create two contests —
 * `GradingContest.attemptId`'s `@unique` constraint, 21-03, enforces that at
 * the database level even under a race), and the reversal + flag steps that
 * follow are the real shared functions called immediately after it commits.
 * See 21-15-SUMMARY.md for the full disclosure.
 */
export async function raiseContest(args: {
  userId: string;
  attemptId: string;
  reason: string;
}): Promise<RaiseContestResult> {
  const reason = validateReason(args.reason);

  let contestId: string;
  let knowledgeCheckId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Scoped by userId in the WHERE clause (not post-filtered) — a student
      // may contest only their own attempt, and the error below does not
      // distinguish "does not exist" from "belongs to someone else".
      const attempt = await tx.knowledgeCheckAttempt.findFirst({
        where: { id: args.attemptId, userId: args.userId },
      });
      if (!attempt) {
        throw new NotFoundError(args.attemptId);
      }
      if (!attempt.gradedAt) {
        throw new NotGradedError(args.attemptId);
      }

      // A P2002 here (the second contest for this attempt) aborts the
      // Postgres transaction immediately — any FURTHER query issued against
      // `tx` after that point fails too ("current transaction is aborted"),
      // so the P2002 is deliberately NOT caught in here. It is caught
      // OUTSIDE the transaction below, once it has rolled back and the base
      // `prisma` client is usable again to look up the existing contest.
      const contest = await tx.gradingContest.create({
        data: {
          attemptId: attempt.id,
          userId: args.userId,
          reason,
          status: "OPEN",
        },
      });
      return { contestId: contest.id, knowledgeCheckId: attempt.knowledgeCheckId };
    });
    contestId = created.contestId;
    knowledgeCheckId = created.knowledgeCheckId;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.gradingContest.findUnique({
        where: { attemptId: args.attemptId },
      });
      throw new AlreadyContestedError(args.attemptId, existing?.id ?? "unknown");
    }
    throw err;
  }

  // REVERSE every unreversed contribution sourced from this attempt, via
  // 21-05's own `reverseContribution` — not a parallel mechanism. 21-11
  // writes exactly one, but this queries and reverses ALL of them rather
  // than assuming the count — if a future refactor ever writes two,
  // reversing only one would leave half a disputed mark in the figure,
  // worse than either extreme.
  const unreversed = await prisma.masteryContribution.findMany({
    where: { sourceAttemptId: args.attemptId, reversedAt: null },
  });
  for (const contribution of unreversed) {
    await reverseContribution(contribution.id, `contested:${contestId}`);
  }

  // FLAG THE QUESTION, not only the attempt. A single `updateMany` guarded on
  // `flaggedAt: null` is used instead of read-then-write, so this cannot
  // overwrite an existing flag even under a race — the FIRST contest is the
  // one that discovered the problem, and its reference should survive later
  // contests against the same question.
  const flagResult = await prisma.knowledgeCheck.updateMany({
    where: { id: knowledgeCheckId, flaggedAt: null },
    data: {
      flaggedAt: new Date(),
      flagReason: `contested:${contestId}`,
    },
  });

  return {
    contestId,
    contributionsReversed: unreversed.length,
    checkFlagged: flagResult.count > 0,
  };
}

export interface ResolveContestArgs {
  contestId: string;
  status: "UPHELD" | "REJECTED";
  resolutionNote: string;
}

/**
 * Resolves an OPEN contest. NOT exposed through a route in this plan — see
 * the module doc comment.
 *
 * UPHELD: the contribution(s) stay reversed, permanently. The confirmed
 * problem is also recorded on the `KnowledgeCheck.flagReason` (appended, not
 * overwritten) so `listFlaggedChecks` can distinguish a CONFIRMED-bad
 * question from a merely disputed one.
 *
 * REJECTED: the mark stood. This writes a NEW `MasteryContribution`
 * restoring the original score, rather than clearing the original row's
 * `reversedAt`. UN-REVERSING IS THE OBVIOUS IMPLEMENTATION AND THE WRONG ONE:
 * 21-05's ledger is append-only apart from the two reversal columns, and
 * clearing `reversedAt` on the original row would erase the fact that a
 * dispute ever happened — the exact audit trail REQ-112 depends on ("the
 * history of what a student was told, and when that was corrected, both
 * survive", per ledger.ts's own doc comment). The restored row carries the
 * ORIGINAL `occurredAt` (not the resolution time) so it lands back in the
 * mastery window it actually belongs to.
 */
export async function resolveContest(args: ResolveContestArgs): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const contest = await tx.gradingContest.findUnique({
      where: { id: args.contestId },
    });
    if (!contest) {
      throw new ContestNotFoundError(args.contestId);
    }
    if (contest.status !== "OPEN") {
      throw new ContestNotOpenError(args.contestId, contest.status);
    }

    await tx.gradingContest.update({
      where: { id: args.contestId },
      data: {
        status: args.status,
        resolvedAt: new Date(),
        resolutionNote: args.resolutionNote,
      },
    });

    if (args.status === "UPHELD") {
      // The contribution(s) stay reversed — nothing further to do to them.
      // Append the confirmation to the question's flag reason so a reader of
      // listFlaggedChecks can tell "upheld" apart from "merely disputed".
      const attempt = await tx.knowledgeCheckAttempt.findUnique({
        where: { id: contest.attemptId },
        include: { knowledgeCheck: true },
      });
      if (attempt) {
        const priorReason = attempt.knowledgeCheck.flagReason ?? "";
        await tx.knowledgeCheck.update({
          where: { id: attempt.knowledgeCheckId },
          data: {
            flagReason: `${priorReason} | upheld:${contest.id}`.replace(/^ \| /, ""),
          },
        });
      }
      return;
    }

    // REJECTED. Find the (still-reversed) contribution(s) this contest's
    // raiseContest reversed, and restore each by APPENDING a new row — never
    // by clearing the original's reversedAt. See doc comment above.
    const reversedReasonMarker = `contested:${contest.id}`;
    const reversedRows = await tx.masteryContribution.findMany({
      where: {
        sourceAttemptId: contest.attemptId,
        reversedReason: reversedReasonMarker,
      },
    });
    for (const row of reversedRows) {
      await tx.masteryContribution.create({
        data: {
          userId: row.userId,
          competencyKey: row.competencyKey,
          source: row.source,
          rawScore: row.rawScore,
          weight: row.weight,
          // Carries the ORIGINAL occurredAt deliberately — see doc comment.
          occurredAt: row.occurredAt,
          sourceAttemptId: row.sourceAttemptId,
          sourceReportId: row.sourceReportId,
        },
      });
      // REVIEW ITEM (per plan's <done>): this REJECTED path must never touch
      // `reversedAt` on the original row — it is restored via a NEW row
      // above, and the original row's reversedAt is left exactly as
      // raiseContest set it. It is not written here at all; there is no
      // `tx.masteryContribution.update(...)` call anywhere in this branch.
    }
  });
}

export interface FlaggedCheckSummary {
  checkId: string;
  format: string;
  competencyKey: string;
  flagReason: string | null;
  contestCount: number;
  generationModel: string;
}

/**
 * Every KnowledgeCheck with a non-null flaggedAt, with its contest count —
 * the "surfaces bad generated questions" half of REQ-112. Ordered by contest
 * count descending: a question several students contested is a
 * generation-prompt problem, not a one-off.
 */
export async function listFlaggedChecks(opts?: {
  minContests?: number;
}): Promise<FlaggedCheckSummary[]> {
  const minContests = opts?.minContests ?? 0;

  const checks = await prisma.knowledgeCheck.findMany({
    where: { flaggedAt: { not: null } },
    include: {
      attempts: {
        select: { contest: { select: { id: true } } },
      },
    },
  });

  const summaries: FlaggedCheckSummary[] = checks
    .map((check) => {
      const contestCount = check.attempts.filter((a) => a.contest !== null).length;
      return {
        checkId: check.id,
        format: check.format,
        competencyKey: check.competencyKey,
        flagReason: check.flagReason,
        contestCount,
        generationModel: check.generationModel,
      };
    })
    .filter((summary) => summary.contestCount >= minContests);

  summaries.sort((a, b) => b.contestCount - a.contestCount);
  return summaries;
}
