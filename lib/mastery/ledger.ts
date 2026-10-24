/**
 * The single append-only mastery contribution ledger.
 *
 * 21-CONTEXT.md locks that every mastery event — a live session, a coached
 * session, or a knowledge check (deterministic or model-graded) — moves
 * mastery, and that there is ONE ledger for all of it rather than per-source
 * tables. This module is that ledger's only write/read surface.
 *
 * Append-only: `recordContributions` writes rows, `reverseContribution` marks
 * a row reversed, and NOTHING ever deletes a row. A reversed contribution
 * stays in the ledger with its reversal reason — this is what lets REQ-112's
 * grading contest be audited later: the history of what a student was told,
 * and when that was corrected, both survive.
 */

import { prisma } from "@/lib/prisma";
import {
  COMPETENCIES,
  type CompetencyKey,
} from "@/lib/mastery/competencies";
import {
  CONTRIBUTION_SOURCES,
  type ContributionSource,
  weightForSource,
} from "@/lib/mastery/weights";

const VALID_COMPETENCY_KEYS = new Set<string>(
  COMPETENCIES.map((c) => c.key)
);

export interface ContributionInput {
  userId: string;
  competencyKey: CompetencyKey;
  source: ContributionSource;
  /**
   * Normalized 0..1. Caller converts a 1-5 rubric score via
   * `normalizeRubricScore` before calling in; this module rejects
   * out-of-range values rather than normalizing itself, so a rawScore bug
   * upstream is caught here instead of silently re-normalized.
   */
  rawScore: number;
  occurredAt: Date;
  sourceReportId?: string | null;
  sourceAttemptId?: string | null;
  sourceCoachedSessionId?: string | null;
}

export interface MasteryContributionRow {
  id: string;
  userId: string;
  competencyKey: string;
  source: string;
  rawScore: number;
  weight: number;
  sourceReportId: string | null;
  sourceAttemptId: string | null;
  sourceCoachedSessionId: string | null;
  reversedAt: Date | null;
  reversedReason: string | null;
  occurredAt: Date;
  createdAt: Date;
}

/**
 * Validates a whole batch of contribution inputs BEFORE any write happens.
 * Exported on its own so a verifier (and any future caller) can prove the
 * validation rules without a database — the rules below are pure checks
 * over plain objects, reachable with no `DATABASE_URL` set.
 *
 * Throws on the first violation found, naming the offending index so a
 * caller can trace a bad input back to its position in the batch.
 */
export function validateContributionInputs(
  inputs: ContributionInput[]
): void {
  const now = Date.now();
  inputs.forEach((input, index) => {
    if (
      typeof input.rawScore !== "number" ||
      !Number.isFinite(input.rawScore) ||
      input.rawScore < 0 ||
      input.rawScore > 1
    ) {
      throw new Error(
        `validateContributionInputs: inputs[${index}].rawScore must be a finite number in [0, 1], got ${input.rawScore}`
      );
    }
    if (!VALID_COMPETENCY_KEYS.has(input.competencyKey)) {
      throw new Error(
        `validateContributionInputs: inputs[${index}].competencyKey "${input.competencyKey}" is not a known competency`
      );
    }
    if (!(CONTRIBUTION_SOURCES as readonly string[]).includes(input.source)) {
      throw new Error(
        `validateContributionInputs: inputs[${index}].source "${input.source}" is not a known contribution source`
      );
    }
    if (
      !(input.occurredAt instanceof Date) ||
      Number.isNaN(input.occurredAt.getTime())
    ) {
      throw new Error(
        `validateContributionInputs: inputs[${index}].occurredAt must be a valid Date`
      );
    }
    if (input.occurredAt.getTime() > now) {
      throw new Error(
        `validateContributionInputs: inputs[${index}].occurredAt is in the future (${input.occurredAt.toISOString()})`
      );
    }
  });
}

/**
 * Records a batch of mastery contributions. Validates the ENTIRE batch
 * before any write so a partial write cannot happen — a half-recorded
 * session would produce a mastery figure nobody could explain.
 *
 * Snapshots `weight: weightForSource(input.source)` into each row at write
 * time rather than storing a source-only reference and looking the weight
 * up later. REQ-107 and the schema's own comment on `MasteryContribution`
 * require this: retuning a weight later must never retroactively rewrite a
 * figure the student already saw.
 *
 * Returns the count of rows written.
 */
export async function recordContributions(
  inputs: ContributionInput[]
): Promise<number> {
  validateContributionInputs(inputs);

  if (inputs.length === 0) return 0;

  const rows = inputs.map((input) => ({
    userId: input.userId,
    competencyKey: input.competencyKey,
    source: input.source,
    rawScore: input.rawScore,
    weight: weightForSource(input.source),
    occurredAt: input.occurredAt,
    sourceReportId: input.sourceReportId ?? null,
    sourceAttemptId: input.sourceAttemptId ?? null,
    sourceCoachedSessionId: input.sourceCoachedSessionId ?? null,
  }));

  const result = await prisma.masteryContribution.createMany({ data: rows });
  return result.count;
}

/**
 * Marks a contribution as reversed. NEVER deletes the row — the ledger is
 * append-only apart from these two columns (`reversedAt`, `reversedReason`),
 * which is exactly what lets REQ-112's grading contest be audited: a student
 * can see both what they were originally told and the correction.
 *
 * Throws if the row is already reversed — a double reversal would be a
 * second, silent correction layered on the first, with no record of why.
 */
export async function reverseContribution(
  contributionId: string,
  reason: string
): Promise<void> {
  const existing = await prisma.masteryContribution.findUnique({
    where: { id: contributionId },
  });
  if (!existing) {
    throw new Error(
      `reverseContribution: no contribution found with id "${contributionId}"`
    );
  }
  if (existing.reversedAt) {
    throw new Error(
      `reverseContribution: contribution "${contributionId}" is already reversed (reversedAt=${existing.reversedAt.toISOString()}); a double reversal is not permitted`
    );
  }

  await prisma.masteryContribution.update({
    where: { id: contributionId },
    data: {
      reversedAt: new Date(),
      reversedReason: reason,
    },
  });
}

/**
 * Reads contributions for a user, optionally scoped to one competency and/or
 * a time window.
 *
 * Defaults to `includeReversed: false` — every arithmetic caller wants live
 * contributions only, and making that the default means a caller cannot
 * accidentally fold reversed rows into a mastery figure by forgetting a
 * flag.
 *
 * Orders by `occurredAt` ascending, and the `since` filter is applied to
 * `occurredAt`, NEVER `createdAt` — a session recorded late must still land
 * in the window it actually happened in, not the window it was written in.
 *
 * Returns a narrow row interface rather than the raw Prisma model, so
 * 21-09's pure mastery computation can be tested against plain object
 * literals with no database involved.
 */
export async function readContributions(
  userId: string,
  opts?: {
    competencyKey?: CompetencyKey;
    since?: Date;
    includeReversed?: boolean;
  }
): Promise<MasteryContributionRow[]> {
  const includeReversed = opts?.includeReversed ?? false;

  const where: Record<string, unknown> = { userId };
  if (opts?.competencyKey) {
    where.competencyKey = opts.competencyKey;
  }
  if (opts?.since) {
    where.occurredAt = { gte: opts.since };
  }
  if (!includeReversed) {
    where.reversedAt = null;
  }

  const rows = await prisma.masteryContribution.findMany({
    where,
    orderBy: { occurredAt: "asc" },
  });

  return rows;
}
