/**
 * Records a completed coached session's mastery contribution (REQ-116).
 *
 * Phase 22: a coached session has NO counterpart conversation and produces NO
 * `InteractionReport`, so nothing here reads one. The evidence is the coach's
 * grade (22-10) of the student's spoken rework attempts, stored on
 * `CoachedTurn` rows (`score`, `acceptable`, `parroted`). The contribution is
 * recorded at the model-graded weight class (`CONTRIBUTION_WEIGHTS.COACHED_SESSION`
 * is bound to `CHECK_MODEL_GRADED` in `lib/mastery/weights.ts`), never the
 * deterministic weight, and strictly below an unaided session. See
 * 22-CONTEXT.md "Scoring" and 22-COACH-LAYER-DECISION.md section 5.
 *
 * This is the SINGLE writer of `COACHED_SESSION`-sourced contributions.
 * `finishCoachedSession` deliberately does not write one, so the weight lives
 * in one place; a double write would let a coached session out-weigh its own
 * ordering constraint.
 *
 * REQ-124 note: this module maps NO rubric dimensions - the coach grades
 * against one competency directly - so REQ-124's single mapping module is not
 * duplicated here; `contributionsFromReport` is no longer imported.
 *
 * Legacy rows: pre-Phase-22 coached sessions carry a `reportId`, and
 * `recordLiveSessionContributions` in `lib/mastery/from-report.ts` keeps its
 * coached-skip guard for those rows, so a legacy coached report never also
 * picks up an unaided-session row. That guard is not duplicated here.
 *
 * Idempotence: the ledger has no unique constraint, and completion is
 * retryable, so `sourceCoachedSessionId` is checked before any write.
 */
import { prisma } from "@/lib/prisma";
import type { CompetencyKey } from "@/lib/mastery/competencies";
import {
  recordContributions,
  type ContributionInput,
} from "@/lib/mastery/ledger";
import { normalizeRubricScore } from "@/lib/mastery/weights";

/** The source this module's rows are always written under. */
const COACHED_SESSION_SOURCE = "COACHED_SESSION" as const;

export class CoachedSessionNotFoundError extends Error {
  constructor(userId: string, coachedSessionId: string) {
    super(
      `recordCoachedContribution: no CoachedSession "${coachedSessionId}" found for user "${userId}"`,
    );
    this.name = "CoachedSessionNotFoundError";
  }
}

export class CoachedSessionNotFinishedError extends Error {
  constructor(coachedSessionId: string) {
    super(
      `recordCoachedContribution: CoachedSession "${coachedSessionId}" has no completedAt - ` +
        `a session that has not been completed has no final grades, and writing a contribution from nothing would be fabricated evidence.`,
    );
    this.name = "CoachedSessionNotFinishedError";
  }
}

export interface CoachedAttemptGrade {
  leg: string;
  score: number | null;
  acceptable: boolean | null;
  parroted: boolean | null;
}

export interface CoachedLegClosure {
  leg: string;
  closedAtSoftCap: boolean | null;
}

/**
 * Pure: the graded score (1..5) a CLOSED leg contributes — the best
 * non-parroted attempt, preferring acceptable attempts unless the leg closed
 * at the soft cap. Null when the leg has no usable attempt (never a
 * fabricated score). The one rule both the mastery contribution and the
 * end-of-session summary read, so the number a student is shown is the
 * number that moved their mastery.
 */
export function gradedLegScore(
  attempts: readonly CoachedAttemptGrade[],
  closure: CoachedLegClosure,
): number | null {
  const usable = attempts.filter(
    (a): a is CoachedAttemptGrade & { score: number } =>
      a.leg === closure.leg && a.parroted !== true && typeof a.score === "number",
  );
  if (usable.length === 0) return null;

  const acceptable = usable.filter((a) => a.acceptable === true);
  const pool =
    closure.closedAtSoftCap === true || acceptable.length === 0
      ? usable
      : acceptable;
  return Math.max(...pool.map((a) => a.score));
}

/**
 * Pure: one contribution input per CLOSED leg (a leg with a LEG_DONE row).
 * The score is the best non-parroted attempt; acceptable attempts are
 * preferred, and a leg closed at the soft cap takes the best non-parroted
 * attempt outright. A leg with no usable attempt emits nothing - never a
 * fabricated score.
 */
export function contributionInputsFromCoachedLegs(args: {
  userId: string;
  coachedSessionId: string;
  competencyKey: CompetencyKey;
  occurredAt: Date;
  attempts: CoachedAttemptGrade[];
  legClosures: CoachedLegClosure[];
}): ContributionInput[] {
  const inputs: ContributionInput[] = [];
  const seenLegs = new Set<string>();

  for (const closure of args.legClosures) {
    if (seenLegs.has(closure.leg)) continue;
    seenLegs.add(closure.leg);

    const best = gradedLegScore(args.attempts, closure);
    if (best === null) continue;

    inputs.push({
      userId: args.userId,
      competencyKey: args.competencyKey,
      source: COACHED_SESSION_SOURCE,
      rawScore: normalizeRubricScore(best),
      occurredAt: args.occurredAt,
      sourceCoachedSessionId: args.coachedSessionId,
      sourceReportId: null,
      sourceAttemptId: null,
    });
  }

  return inputs;
}

/**
 * Records a completed coached session's mastery contributions, once.
 *
 * Steps: load the session scoped by `userId` and require `completedAt`;
 * return `{ written: 0 }` if rows for this `sourceCoachedSessionId` already
 * exist; build one input per closed leg from the graded attempts; write.
 * `occurredAt` is `session.completedAt`, not the clock, so a late write still
 * lands in the window the session happened in.
 */
export async function recordCoachedContribution(args: {
  userId: string;
  coachedSessionId: string;
}): Promise<{ written: number }> {
  const { userId, coachedSessionId } = args;

  const session = await prisma.coachedSession.findFirst({
    where: { id: coachedSessionId, userId },
  });
  if (!session) {
    throw new CoachedSessionNotFoundError(userId, coachedSessionId);
  }
  if (!session.completedAt) {
    throw new CoachedSessionNotFinishedError(coachedSessionId);
  }

  const existing = await prisma.masteryContribution.findFirst({
    where: {
      source: COACHED_SESSION_SOURCE,
      sourceCoachedSessionId: session.id,
    },
    select: { id: true },
  });
  if (existing) return { written: 0 };

  const [attemptRows, closureRows] = await Promise.all([
    prisma.coachedTurn.findMany({
      where: { coachedSessionId: session.id, speaker: "STUDENT", move: "ATTEMPT" },
      orderBy: { seq: "asc" },
      select: { leg: true, score: true, acceptable: true, parroted: true },
    }),
    prisma.coachedTurn.findMany({
      where: { coachedSessionId: session.id, speaker: "COACH", move: "LEG_DONE" },
      orderBy: { seq: "asc" },
      select: { leg: true, closedAtSoftCap: true },
    }),
  ]);

  const inputs = contributionInputsFromCoachedLegs({
    userId,
    coachedSessionId: session.id,
    competencyKey: session.competencyKey as CompetencyKey,
    occurredAt: session.completedAt,
    attempts: attemptRows,
    legClosures: closureRows,
  });

  const written = await recordContributions(inputs);
  return { written };
}
