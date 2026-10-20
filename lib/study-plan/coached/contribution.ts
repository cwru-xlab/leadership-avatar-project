/**
 * Records a completed coached session's mastery contribution at the
 * coached weight (REQ-116).
 *
 * This is the SINGLE writer of `COACHED_SESSION`-sourced contributions.
 * 21-12's `finishCoachedSession` (lib/study-plan/coached/instance.ts)
 * deliberately does NOT write one — it says so explicitly in its own
 * module comment — precisely so the coached weight and the tip-compliance
 * rules (lib/study-plan/coached/tips.ts) live together, in this module. A
 * double write (one from `finishCoachedSession`, one from here) would make
 * a coached session contribute more than an unaided one, INVERTING the
 * ordering `lib/mastery/weights.ts`'s `WEIGHT_ORDERING_CONSTRAINTS` locks
 * (the unaided-session weight of 1.00 is strictly greater than the coached
 * weight of 0.40).
 *
 * The report-to-competency MAPPING is NOT reimplemented here. It is
 * imported, whole, from `lib/mastery/from-report.ts`'s
 * `contributionsFromReport` (built by 21-21) — the single module the
 * unaided-session ingestion hook also uses (REQ-124). This module's remaining
 * responsibility is the three things that are genuinely coached-specific:
 * the `COACHED_SESSION` source constant, the `completedAt`/`reportId`
 * preconditions below, and the idempotence guard below.
 *
 * NOTE ON THE OTHER GUARD: `lib/mastery/from-report.ts`'s
 * `recordLiveSessionContributions` carries its OWN, separate,
 * unconditional guard — it returns `skipped: "coached-session"` for any
 * report joined to a `CoachedSession`, BEFORE any mapping, so that a
 * coached session's report (which does reach READY through the same
 * evaluation pipeline as an unaided one) does not ALSO pick up the
 * unaided-session row that hook would otherwise write. That guard keys on
 * the report having a joined `CoachedSession` row; it is not duplicated
 * here, and this module does not write (or need to write) any
 * unaided-session-suppressing logic of its own — the coached row written
 * by `recordCoachedContribution` is the session's ONLY contribution.
 */
import { prisma } from "@/lib/prisma";
import { contributionsFromReport } from "@/lib/mastery/from-report";
import { recordContributions } from "@/lib/mastery/ledger";

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
      `recordCoachedContribution: CoachedSession "${coachedSessionId}" has no completedAt or no reportId — ` +
        `a session with no report has no scores, and writing a contribution from nothing would be fabricated evidence.`,
    );
    this.name = "CoachedSessionNotFinishedError";
  }
}

/**
 * Records a completed coached session's mastery contribution.
 *
 * Steps:
 *   1. Load the `CoachedSession` scoped by `userId`. Require `completedAt`
 *      non-null and `reportId` non-null — a session with no report has no
 *      scores.
 *   2. Delegate the mapping to `contributionsFromReport`, passing
 *      `source: "COACHED_SESSION"` and `occurredAt: session.completedAt`
 *      (NOT the clock, NOT the row-write time — `occurredAt` must be the
 *      moment the session actually happened, per `from-report.ts`'s own
 *      contract, so a late write still lands in the window it happened in).
 *   3. Pass the returned inputs straight to `recordContributions` — one
 *      contribution per competency with at least one non-null dimension;
 *      a competency whose every mapped dimension is null yields NO row.
 *   4. IDEMPOTENCE: before writing, check whether a `COACHED_SESSION`
 *      contribution already exists for this `sourceReportId`. If so,
 *      return `{ written: 0 }` without writing again. The ledger has no
 *      unique constraint for this (21-03 deliberately did not add one — a
 *      legitimate re-grade is conceivable), and `finishCoachedSession` is
 *      reachable more than once on a retried request, so the guard lives
 *      here.
 *
 * AUDITABILITY: because `source` is stored on every row and `weight` is
 * snapshotted at write time (`lib/mastery/ledger.ts`'s `recordContributions`),
 * a reader can confirm after the fact that these rows carry 0.40 and an
 * unaided session's rows carry 1.00 — this is what makes REQ-116's
 * "weighted below unaided practice" checkable in production data, not only
 * in a verifier.
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

  if (!session.completedAt || !session.reportId) {
    throw new CoachedSessionNotFinishedError(coachedSessionId);
  }

  // 4. IDEMPOTENCE, checked before any mapping work.
  const existing = await prisma.masteryContribution.findFirst({
    where: {
      sourceReportId: session.reportId,
      source: COACHED_SESSION_SOURCE,
    },
    select: { id: true },
  });

  if (existing) {
    return { written: 0 };
  }

  // 2. Delegate the mapping — no reimplementation here (REQ-124).
  const mapped = await contributionsFromReport({
    userId,
    reportId: session.reportId,
    source: COACHED_SESSION_SOURCE,
    occurredAt: session.completedAt,
  });

  // 3. One contribution per competency the mapping returned.
  const written = await recordContributions(mapped.inputs);

  return { written };
}
