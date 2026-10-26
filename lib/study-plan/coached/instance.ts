/**
 * Coached practice as its own instance — reachable ONLY through a study
 * plan's path, structured replay-first-then-fresh.
 *
 * See `.planning/phases/22-coached-mode/22-COACH-LAYER-DECISION.md` (which
 * supersedes the engine-session half of
 * `.planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md`):
 * the coach is the only presence, there is NO engine session and NO
 * InteractionReport. Coached mode is never a registered `ENGINE_TYPES` entry
 * (REQ-113). This module is the single, named carve-out
 * `scripts/verify-knowledge-check-surface.ts`'s `ENGINE_IMPORT_CARVE_OUTS`
 * grants from the "nothing under lib/study-plan/ imports the engine" rule.
 *
 * REPLAY / FRESH (Phase 22): both legs are REAL moments of the student's own
 * (REPLAY from `replaySourceReportId`/`replayTurnIndex`, FRESH from
 * `freshSourceReportId`/`freshTurnIndex`). FRESH is "both or neither": when the
 * student has only one qualifying moment the session is thin-evidence, one leg
 * (`legCount` 1). There is no generated scenario. The leg is DERIVED from
 * closure timestamps the coach's LEG_DONE move leads to, never from a report.
 *
 * ABSENCES ARE DELIBERATE, not oversights:
 * - There is no overload of `createCoachedSession`, no optional
 *   `pathStepId`, and no stand-alone (path-free) variant. The function signature IS the
 *   REQ-113 guard: `pathStepId` is required and non-nullable, and there is
 *   no code path into this module that does not go through an
 *   already-persisted `COACHED_SESSION` path step.
 * - This module does NOT read S3. The moment transcript text is runtime.ts's
 *   concern (it owns the S3 read); keeping I/O out of here is what lets this
 *   module's own verifier run credential-free.
 * - This module does NOT write a mastery ledger contribution
 *   (lib/mastery/ledger.ts). `contribution.ts` owns the coached-weight
 *   contribution; a write here AND there would double-count a coached
 *   session, inverting the locked "coached counts below unaided" ordering.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../../prisma";

/**
 * LOCKED by 21-CONTEXT.md: "replay first, then fresh. The coach sets up the
 * actual moment from the student's transcript to rework, then presents a new
 * situation exercising the same competency — learn it, then prove it
 * transfers." This ordering is a product decision, not a tuning knob — unlike
 * `lib/mastery/weights.ts`'s provisional numbers, do NOT reorder this without
 * a new decision recorded.
 */
export const COACHED_PHASES = ["REPLAY", "FRESH"] as const;

export type CoachedPhase = (typeof COACHED_PHASES)[number] | "COMPLETE";

/**
 * Thrown by `createCoachedSession` when the caller supplies a `pathStepId`
 * that does not resolve to a user-owned, `COACHED_SESSION`-kind step. The
 * name states the invariant this whole module exists to enforce: coached
 * mode is NOT reachable outside a path.
 */
export class NotReachableOutsideAPathError extends Error {
  constructor(pathStepId: string) {
    super(
      `Path step ${pathStepId} does not exist, is not owned by the caller, or is not a COACHED_SESSION step. ` +
        `Coached mode has no entry point outside a user-owned COACHED_SESSION path step.`,
    );
    this.name = "NotReachableOutsideAPathError";
  }
}

export class InvalidReplayTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReplayTargetError";
  }
}

export class InvalidFreshMomentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFreshMomentError";
  }
}

export class CoachedSessionAlreadyCompleteError extends Error {
  constructor(coachedSessionId: string) {
    super(`Coached session ${coachedSessionId} is already complete.`);
    this.name = "CoachedSessionAlreadyCompleteError";
  }
}

export type SelectionBasis = "PER_TURN_SCORE" | "GROWTH_AREA_FALLBACK";

export interface CoachedSessionView {
  id: string;
  userId: string;
  pathStepId: string;
  competencyKey: string;
  replaySourceReportId: string;
  replayTurnIndex: number;
  freshSourceReportId: string | null;
  freshTurnIndex: number | null;
  /** Null marks a pre-Phase-22 row (see retargetLegacyCoachedSession). */
  selectionBasis: SelectionBasis | null;
  replayMomentScore: number | null;
  freshMomentScore: number | null;
  replayLegCompletedAt: Date | null;
  /** 1 = thin evidence (no fresh moment), 2 = replay then fresh. */
  legCount: 1 | 2;
  freshScenarioPrompt: string | null; // pre-Phase-22 rows only
  reportId: string | null; // pre-Phase-22 column; never read for the phase
  startedAt: Date;
  completedAt: Date | null;
  /**
   * DERIVED from stored state, never stored as a column:
   * - "COMPLETE" when `completedAt` is set.
   * - "FRESH" when `replayLegCompletedAt` is set but not yet completed.
   * - "REPLAY" otherwise.
   * `reportId` no longer participates (pre-Phase-22 column).
   */
  phase: CoachedPhase;
}

interface SessionRow {
  id: string;
  userId: string;
  pathStepId: string;
  competencyKey: string;
  replaySourceReportId: string;
  replayTurnIndex: number;
  freshSourceReportId: string | null;
  freshTurnIndex: number | null;
  selectionBasis: string | null;
  replayMomentScore: number | null;
  freshMomentScore: number | null;
  replayLegCompletedAt: Date | null;
  freshScenarioPrompt: string | null;
  reportId: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

function deriveViewFromRow(row: SessionRow): CoachedSessionView {
  const phase: CoachedPhase = row.completedAt
    ? "COMPLETE"
    : row.replayLegCompletedAt
      ? "FRESH"
      : "REPLAY";
  return {
    ...row,
    selectionBasis: (row.selectionBasis as SelectionBasis | null) ?? null,
    legCount: row.freshSourceReportId !== null ? 2 : 1,
    phase,
  };
}

function validScore(n: number | null): boolean {
  return n === null || (Number.isInteger(n) && n >= 1 && n <= 5);
}

/**
 * Creates a coached session.
 *
 * THE ONLY ENTRY (enforced in order below):
 *   1. `pathStepId` is required and non-nullable in this signature — there
 *      is no overload, no optional variant, and no stand-alone (path-free) route. The
 *      step is loaded by id, joining path -> studyPlan -> userId, and the
 *      row must exist, `userId` must match, and `kind` must be
 *      "COACHED_SESSION". This is REQ-113's structural guarantee at the
 *      call-site: there is no way to call this function without already
 *      holding a persisted, user-owned coached path step.
 *   2. REPLAY IS MANDATORY — `replaySourceReportId` must name an
 *      `InteractionReport` owned by `userId`, and `replayTurnIndex` must be
 *      a non-negative integer within that report's `turnCount`.
 *   3. FRESH IS BOTH-OR-NEITHER — `freshSourceReportId` and `freshTurnIndex`
 *      are both set (a second real moment, user-owned, in range, and not the
 *      replay moment) or both null (thin evidence, one leg).
 *   4. ONE PER STEP — `CoachedSession.pathStepId` is `@unique` (21-03). A
 *      P2002 collision (a double-click, or a retried request) returns the
 *      EXISTING session rather than erroring, and writes the step's
 *      `coachedSessionId` back in the same transaction as the original
 *      create attempt's eventual settlement, so `path.ts`'s state-dependent
 *      kind/reference rule stays satisfied either way.
 *
 * NOTE ON TRANSACTIONS: this function takes no transaction client and
 * re-queries the step by id. It is called at STEP-ENTRY time, after the
 * step already exists as a committed row — it deliberately does NOT attempt
 * a same-transaction creation alongside the step itself, because it cannot
 * see a step created inside another, still-uncommitted `createPath`
 * transaction. This was settled during 21-08/21-12 review; see
 * `lib/study-plan/path.ts`'s comment on the state-dependent COACHED_SESSION
 * rule for the other half of this same reasoning.
 */
export async function createCoachedSession(args: {
  userId: string;
  pathStepId: string;
  replaySourceReportId: string;
  replayTurnIndex: number;
  freshSourceReportId: string | null;
  freshTurnIndex: number | null;
  selectionBasis: SelectionBasis;
  replayMomentScore: number | null;
  freshMomentScore: number | null;
}): Promise<CoachedSessionView> {
  const {
    userId,
    pathStepId,
    replaySourceReportId,
    replayTurnIndex,
    freshSourceReportId,
    freshTurnIndex,
    selectionBasis,
    replayMomentScore,
    freshMomentScore,
  } = args;

  // 1. THE ONLY ENTRY — load the step by id, joining path -> studyPlan -> userId.
  const step = await prisma.studyPlanPathStep.findFirst({
    where: { id: pathStepId, path: { userId } },
  });
  if (!step || step.kind !== "COACHED_SESSION") {
    throw new NotReachableOutsideAPathError(pathStepId);
  }

  // If this step already has a session (a resumed double-click before the
  // P2002 path below would ever fire), return it directly rather than
  // attempting a second create.
  if (step.coachedSessionId) {
    const existing = await prisma.coachedSession.findFirst({
      where: { id: step.coachedSessionId, userId },
    });
    if (existing) return deriveViewFromRow(existing);
  }

  // 2. REPLAY IS MANDATORY.
  const replayReport = await prisma.interactionReport.findFirst({
    where: { id: replaySourceReportId, userId },
    select: { id: true, turnCount: true },
  });
  if (!replayReport) {
    throw new InvalidReplayTargetError(
      `replaySourceReportId ${replaySourceReportId} does not exist or is not owned by user ${userId}.`,
    );
  }
  if (
    !Number.isInteger(replayTurnIndex) ||
    replayTurnIndex < 0 ||
    replayTurnIndex >= replayReport.turnCount
  ) {
    throw new InvalidReplayTargetError(
      `replayTurnIndex ${replayTurnIndex} is not a non-negative integer within report ` +
        `${replaySourceReportId}'s turnCount (${replayReport.turnCount}).`,
    );
  }

  // 3. FRESH IS BOTH-OR-NEITHER.
  if ((freshSourceReportId === null) !== (freshTurnIndex === null)) {
    throw new InvalidFreshMomentError(
      "freshSourceReportId and freshTurnIndex must both be set or both be null.",
    );
  }
  if (!validScore(replayMomentScore) || !validScore(freshMomentScore)) {
    throw new InvalidReplayTargetError("moment scores must be integers 1..5 or null.");
  }
  if (freshSourceReportId !== null && freshTurnIndex !== null) {
    const freshReport = await prisma.interactionReport.findFirst({
      where: { id: freshSourceReportId, userId },
      select: { id: true, turnCount: true },
    });
    if (!freshReport) {
      throw new InvalidFreshMomentError(
        `freshSourceReportId ${freshSourceReportId} does not exist or is not owned by user ${userId}.`,
      );
    }
    if (
      !Number.isInteger(freshTurnIndex) ||
      freshTurnIndex < 0 ||
      freshTurnIndex >= freshReport.turnCount
    ) {
      throw new InvalidFreshMomentError(
        `freshTurnIndex ${freshTurnIndex} is not a non-negative integer within report ` +
          `${freshSourceReportId}'s turnCount (${freshReport.turnCount}).`,
      );
    }
    if (freshSourceReportId === replaySourceReportId && freshTurnIndex === replayTurnIndex) {
      throw new InvalidFreshMomentError("The fresh moment must differ from the replay moment.");
    }
  }

  // 4. ONE PER STEP — create, catching P2002 as "someone else already did this".
  try {
    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.coachedSession.create({
        data: {
          userId,
          pathStepId,
          competencyKey: step.competencyKey,
          replaySourceReportId,
          replayTurnIndex,
          freshSourceReportId,
          freshTurnIndex,
          selectionBasis,
          replayMomentScore,
          freshMomentScore,
        },
      });
      // Write the step's coachedSessionId back in the SAME transaction so
      // path.ts's state-dependent kind/reference rule (a COACHED_SESSION
      // step may carry a null id only while PENDING) is satisfied the
      // moment the step is read again.
      await tx.studyPlanPathStep.update({
        where: { id: pathStepId },
        data: { coachedSessionId: session.id },
      });
      return session;
    });
    return deriveViewFromRow(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // A double-click (or a retried request) raced this one. Resume rather
      // than fail: return the EXISTING session for this step.
      const existing = await prisma.coachedSession.findUnique({ where: { pathStepId } });
      if (existing) return deriveViewFromRow(existing);
    }
    throw err;
  }
}

/**
 * Reads a coached session, scoped by `userId` in the WHERE clause (not
 * filtered after fetching).
 *
 * Does NOT read S3. The moment transcript text is fetched by the
 * CALLER (runtime.ts owns that S3 read) — keeping I/O out of this module is what lets its own
 * verifier run with no database and no credentials for the signature/registry
 * sections, the same discipline 21-04's and 21-09's batteries follow.
 */
export async function readCoachedSession(
  userId: string,
  coachedSessionId: string,
): Promise<CoachedSessionView | null> {
  const row = await prisma.coachedSession.findFirst({
    where: { id: coachedSessionId, userId },
  });
  if (!row) return null;
  return deriveViewFromRow(row);
}

/**
 * Marks the REPLAY leg closed (the coach delivered LEG_DONE and the student
 * moves on). Sets `replayLegCompletedAt` once; throws if already set or if the
 * session is complete.
 */
export async function markReplayLegComplete(
  userId: string,
  coachedSessionId: string,
): Promise<void> {
  const session = await prisma.coachedSession.findFirst({
    where: { id: coachedSessionId, userId },
  });
  if (!session) throw new NotReachableOutsideAPathError(coachedSessionId);
  if (session.completedAt) throw new CoachedSessionAlreadyCompleteError(coachedSessionId);
  if (session.replayLegCompletedAt) {
    throw new Error(`Coached session ${coachedSessionId}: the replay leg is already complete.`);
  }
  await prisma.coachedSession.update({
    where: { id: coachedSessionId },
    data: { replayLegCompletedAt: new Date() },
  });
}

/**
 * Finishes a coached session: verifies ownership, sets `completedAt`, then
 * marks the owning path step COMPLETE via `markStepComplete`. No report is
 * involved (Phase 22). Throws if the session is already complete.
 *
 * NOT wrapped in a single `prisma.$transaction` with `markStepComplete`:
 * that function takes no transaction client. `completedAt` is written FIRST so
 * that if `markStepComplete` throws, the session itself is still finished and
 * a retry of `markStepComplete` alone reconciles the step.
 *
 * Does NOT record a mastery contribution (`contribution.ts` owns that).
 */
export async function finishCoachedSession(
  userId: string,
  coachedSessionId: string,
): Promise<void> {
  const session = await prisma.coachedSession.findFirst({
    where: { id: coachedSessionId, userId },
  });
  if (!session) {
    throw new NotReachableOutsideAPathError(coachedSessionId);
  }
  if (session.completedAt) {
    throw new CoachedSessionAlreadyCompleteError(coachedSessionId);
  }

  await prisma.coachedSession.update({
    where: { id: coachedSessionId },
    data: { completedAt: new Date() },
  });

  const { markStepComplete } = await import("../path");
  await markStepComplete(userId, session.pathStepId);
}

/**
 * Re-targets a Phase 21 session that has not been worked. Phase 21 sessions
 * were created against turn 0 and a generated scenario and carry no coach
 * work; a completed one is history and is never touched. ONLY a row with
 * `selectionBasis === null && completedAt === null` qualifies; anything else
 * throws.
 */
export async function retargetLegacyCoachedSession(
  userId: string,
  coachedSessionId: string,
  targets: {
    replaySourceReportId: string;
    replayTurnIndex: number;
    freshSourceReportId: string | null;
    freshTurnIndex: number | null;
    selectionBasis: SelectionBasis;
    replayMomentScore: number | null;
    freshMomentScore: number | null;
  },
): Promise<CoachedSessionView> {
  const row = await prisma.coachedSession.findFirst({
    where: { id: coachedSessionId, userId },
  });
  if (!row) throw new NotReachableOutsideAPathError(coachedSessionId);
  if (row.selectionBasis !== null || row.completedAt !== null) {
    throw new Error(
      `Coached session ${coachedSessionId} is not a legacy incomplete session and cannot be re-targeted.`,
    );
  }
  if ((targets.freshSourceReportId === null) !== (targets.freshTurnIndex === null)) {
    throw new InvalidFreshMomentError(
      "freshSourceReportId and freshTurnIndex must both be set or both be null.",
    );
  }
  const updated = await prisma.coachedSession.update({
    where: { id: coachedSessionId },
    data: {
      ...targets,
      reportId: null,
      replayLegCompletedAt: null,
    },
  });
  return deriveViewFromRow(updated);
}
