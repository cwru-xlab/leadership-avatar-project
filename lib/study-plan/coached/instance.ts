/**
 * Coached practice as its own instance — reachable ONLY through a study
 * plan's path, structured replay-first-then-fresh.
 *
 * See `.planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md`
 * for the full reasoning this module implements: coached mode reuses the
 * engine's live session machinery but is never a registered `ENGINE_TYPES`
 * entry (REQ-113). This module is the single, named carve-out
 * `scripts/verify-knowledge-check-surface.ts`'s `ENGINE_IMPORT_CARVE_OUTS`
 * grants from the "nothing under lib/study-plan/ imports the engine" rule —
 * and is the reason that carve-out exists at all.
 *
 * ABSENCES ARE DELIBERATE, not oversights:
 * - There is no overload of `createCoachedSession`, no optional
 *   `pathStepId`, and no "standalone" variant. The function signature IS the
 *   REQ-113 guard: `pathStepId` is required and non-nullable, and there is
 *   no code path into this module that does not go through an
 *   already-persisted `COACHED_SESSION` path step.
 * - This module does NOT read S3. The replay moment's transcript text is
 *   21-23's concern (it owns the S3 read); keeping I/O out of here is what
 *   lets this module's own verifier run credential-free, the same discipline
 *   21-04's and 21-09's batteries already follow.
 * - This module does NOT write a mastery ledger contribution
 *   (lib/mastery/ledger.ts). 21-16 owns the coached-weight mastery
 *   contribution, because the coached weight and the tip-compliance check
 *   belong together in one place. A contribution written here AND in 21-16
 *   would double-count a coached session, inverting the locked "coached
 *   counts below unaided" ordering.
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

export class InvalidFreshScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFreshScenarioError";
  }
}

export class CoachedSessionAlreadyCompleteError extends Error {
  constructor(coachedSessionId: string) {
    super(`Coached session ${coachedSessionId} is already complete.`);
    this.name = "CoachedSessionAlreadyCompleteError";
  }
}

/** Declared length limit for the fresh-scenario prompt (Task 2, step 3). */
export const MAX_FRESH_SCENARIO_PROMPT_LENGTH = 4000;

export interface CoachedSessionView {
  id: string;
  userId: string;
  pathStepId: string;
  competencyKey: string;
  replaySourceReportId: string;
  replayTurnIndex: number;
  freshScenarioPrompt: string;
  reportId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  /**
   * DERIVED from stored state, never stored as a fourth column:
   * - "COMPLETE" when `completedAt` is set.
   * - "FRESH" when `reportId` is set (the fresh leg is the one that
   *   produces the gradeable session) but not yet completed.
   * - "REPLAY" otherwise.
   * Deriving it means the phase can never disagree with the data; a stored
   * phase column would eventually drift from reportId/completedAt.
   */
  phase: CoachedPhase;
}

function deriveViewFromRow(row: {
  id: string;
  userId: string;
  pathStepId: string;
  competencyKey: string;
  replaySourceReportId: string;
  replayTurnIndex: number;
  freshScenarioPrompt: string;
  reportId: string | null;
  startedAt: Date;
  completedAt: Date | null;
}): CoachedSessionView {
  const phase: CoachedPhase = row.completedAt
    ? "COMPLETE"
    : row.reportId
      ? "FRESH"
      : "REPLAY";
  return { ...row, phase };
}

/**
 * Creates a coached session.
 *
 * THE ONLY ENTRY (enforced in order below):
 *   1. `pathStepId` is required and non-nullable in this signature — there
 *      is no overload, no optional variant, and no "standalone" path. The
 *      step is loaded by id, joining path -> studyPlan -> userId, and the
 *      row must exist, `userId` must match, and `kind` must be
 *      "COACHED_SESSION". This is REQ-113's structural guarantee at the
 *      call-site: there is no way to call this function without already
 *      holding a persisted, user-owned coached path step.
 *   2. REPLAY IS MANDATORY — `replaySourceReportId` must name an
 *      `InteractionReport` owned by `userId`, and `replayTurnIndex` must be
 *      a non-negative integer within that report's `turnCount`.
 *   3. FRESH IS MANDATORY — `freshScenarioPrompt` must be non-empty and
 *      within `MAX_FRESH_SCENARIO_PROMPT_LENGTH`. Both legs must exist at
 *      creation; a session can never be created with only one.
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
  freshScenarioPrompt: string;
}): Promise<CoachedSessionView> {
  const { userId, pathStepId, replaySourceReportId, replayTurnIndex, freshScenarioPrompt } = args;

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

  // 3. FRESH IS MANDATORY.
  const trimmedFreshPrompt = freshScenarioPrompt.trim();
  if (trimmedFreshPrompt.length === 0) {
    throw new InvalidFreshScenarioError("freshScenarioPrompt must be non-empty.");
  }
  if (trimmedFreshPrompt.length > MAX_FRESH_SCENARIO_PROMPT_LENGTH) {
    throw new InvalidFreshScenarioError(
      `freshScenarioPrompt exceeds MAX_FRESH_SCENARIO_PROMPT_LENGTH ` +
        `(${MAX_FRESH_SCENARIO_PROMPT_LENGTH}); got ${trimmedFreshPrompt.length}.`,
    );
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
          freshScenarioPrompt: trimmedFreshPrompt,
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
 * Does NOT read S3. The replay moment's transcript text is fetched by the
 * CALLER (21-23 owns that S3 read) and passed in or exposed through a
 * separate accessor — keeping I/O out of this module is what lets its own
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
 * Finishes a coached session: verifies ownership, sets `reportId` and
 * `completedAt`, then marks the owning path step COMPLETE via
 * `markStepComplete` (21-08). Throws if the session is already complete.
 *
 * NOT wrapped in a single `prisma.$transaction` with `markStepComplete`:
 * `lib/study-plan/path.ts`'s `markStepComplete` takes no transaction client
 * parameter (it is not in this plan's `files_modified`, so it is not
 * extended here), so there is no way to make its reads/writes participate in
 * the same transaction as the `coachedSession` update above without faking
 * atomicity the two calls do not actually have. The two writes run
 * sequentially instead, in the order that keeps the data model's own
 * invariant intact at every intermediate step: `reportId`/`completedAt` are
 * written FIRST, so that if `markStepComplete` throws (e.g. the step was
 * already completed through some other path), the coached session itself is
 * still correctly finished, and a retry of `markStepComplete` alone is
 * sufficient to reconcile the step.
 *
 * Does NOT record a mastery contribution. 21-16 owns that (see the module
 * header note above) — recording one here too would make coached practice
 * count MORE than unaided practice, inverting the locked ordering
 * ("coached sessions DO move mastery, weighted below unaided practice").
 */
export async function finishCoachedSession(
  userId: string,
  coachedSessionId: string,
  reportId: string,
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
    data: { reportId, completedAt: new Date() },
  });

  // markStepComplete re-asserts path.ts's state-dependent coached rule at
  // the moment the step actually leaves PENDING — by now coachedSessionId
  // is non-null (written at creation), so the rule's accept half applies.
  const { markStepComplete } = await import("../path");
  await markStepComplete(userId, session.pathStepId);
}
