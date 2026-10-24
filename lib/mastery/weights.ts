/**
 * The declared weight table Phase 21's mastery ledger snapshots from, and the
 * ORDERING constraints 21-CONTEXT.md locks on top of it.
 *
 * 21-CONTEXT.md locks:
 *   - both live sessions and knowledge checks move mastery (no source is
 *     excluded);
 *   - "all formats move mastery, but model-graded rewrites count for less
 *     than the deterministically-graded formats";
 *   - "coached sessions DO move mastery, weighted below unaided practice".
 *
 * It explicitly leaves the NUMBERS to discretion ("relative weighting ... the
 * ordering is locked, the numbers are not"). A table of numbers someone can
 * edit later is not a locked ordering — `WEIGHT_ORDERING_CONSTRAINTS` below is
 * the mechanically-checked ordering; `scripts/verify-mastery-weights.ts`
 * enforces it and is proven to fail when the ordering is reversed.
 */

/**
 * The four sources a `MasteryContribution.source` column accepts. This module
 * is the vocabulary's home — the Prisma schema comment on
 * `MasteryContribution.source` already says the column is code-enforced, not
 * a Prisma enum, so nothing imports these strings from `@prisma/client`.
 */
export const CONTRIBUTION_SOURCES = [
  "LIVE_SESSION",
  "COACHED_SESSION",
  "CHECK_DETERMINISTIC",
  "CHECK_MODEL_GRADED",
] as const;

export type ContributionSource = (typeof CONTRIBUTION_SOURCES)[number];

/**
 * The model-graded evidence class weight. Both `CHECK_MODEL_GRADED` and
 * `COACHED_SESSION` are bound to THIS constant (22-CONTEXT.md "Scoring"), so
 * the two can never drift apart. PROVISIONAL UNTIL CALIBRATED.
 */
const MODEL_GRADED_WEIGHT = 0.2;

/**
 * CONTRIBUTION_WEIGHTS — PROVISIONAL UNTIL CALIBRATED.
 *
 * These four numbers are Claude's Discretion per 21-CONTEXT.md; the ORDERING
 * between them is not (see `WEIGHT_ORDERING_CONSTRAINTS`). A future
 * calibration pass should grep this file for "PROVISIONAL UNTIL CALIBRATED"
 * before touching any number here — the Phase 20 convention for provisional
 * figures.
 *
 * Per-number reasoning:
 *   - LIVE_SESSION (1.00): a full unaided live session is the only
 *     unassisted evidence this system collects, so it anchors the scale at
 *     the maximum.
 *   - CHECK_DETERMINISTIC (0.45): a deterministically-graded knowledge check
 *     (multiple choice, fill in the blank, pick the better response) is real
 *     evidence but narrow recall against one moment — under half of what a
 *     whole session is worth.
 *   - COACHED_SESSION (= MODEL_GRADED_WEIGHT, 0.20): Phase 22 - a coached
 *     session has no scored conversation; its evidence is a model's judgement
 *     of the student's reworked line against the competency. That is the same
 *     evidential class as a rewrite check, so it is bound to the same
 *     constant (22-CONTEXT.md "Scoring": "recorded at the lower model-graded
 *     weight - the same class as a rewrite knowledge check", never the
 *     deterministic weight). Pre-Phase-22 rows keep their snapshotted 0.40:
 *     weights are snapshotted at write time and history is not rewritten.
 *   - CHECK_MODEL_GRADED (MODEL_GRADED_WEIGHT, 0.20): a model-graded rewrite (REQ-111's "rewrite a
 *     weak line" format) is the weakest evidence here because its grade is
 *     itself a judgement call, not a deterministic check against a known
 *     answer — it earns the floor.
 */
export const CONTRIBUTION_WEIGHTS: Record<ContributionSource, number> = {
  LIVE_SESSION: 1.0,
  CHECK_DETERMINISTIC: 0.45,
  COACHED_SESSION: MODEL_GRADED_WEIGHT,
  CHECK_MODEL_GRADED: MODEL_GRADED_WEIGHT,
};

/**
 * The ordering 21-CONTEXT.md locks, expressed as DATA a verifier can check —
 * not prose someone could silently violate by editing a number. Each entry
 * carries the exact decision sentence that locks it, so a future reader can
 * trace the constraint back to its source without re-reading the whole
 * context doc.
 */
export const WEIGHT_ORDERING_CONSTRAINTS: ReadonlyArray<{
  greater: ContributionSource;
  lesser: ContributionSource;
  locked_by: string;
}> = [
  {
    greater: "CHECK_DETERMINISTIC",
    lesser: "CHECK_MODEL_GRADED",
    locked_by:
      "all formats move mastery, but model-graded rewrites count for less than the deterministically-graded formats",
  },
  {
    greater: "LIVE_SESSION",
    lesser: "COACHED_SESSION",
    locked_by:
      "coached sessions DO move mastery, weighted below unaided practice",
  },
  {
    greater: "CHECK_DETERMINISTIC",
    lesser: "COACHED_SESSION",
    locked_by: "never the deterministic weight",
  },
];

/**
 * Equality bindings (Phase 22): a source that must carry exactly the same
 * weight as another. Checked with `===` by scripts/verify-mastery-weights.ts.
 */
export const WEIGHT_CLASS_BINDINGS: ReadonlyArray<{
  source: ContributionSource;
  sameClassAs: ContributionSource;
  locked_by: string;
}> = [
  {
    source: "COACHED_SESSION",
    sameClassAs: "CHECK_MODEL_GRADED",
    locked_by:
      "recorded at the lower model-graded weight \u2014 the same class as a rewrite knowledge check, never the deterministic weight",
  },
];

/**
 * Returns the declared weight for a contribution source. Throws on an
 * unknown source rather than defaulting to 0 or 1 — a silent default would
 * let a new source either count for nothing or count as a full live
 * session, and both are wrong in a way nobody would notice until a
 * calibration review much later.
 */
export function weightForSource(source: ContributionSource): number {
  if (!(source in CONTRIBUTION_WEIGHTS)) {
    throw new Error(
      `weightForSource: unknown contribution source "${String(source)}" — ` +
        `every member of CONTRIBUTION_SOURCES must have a declared weight in CONTRIBUTION_WEIGHTS`
    );
  }
  return CONTRIBUTION_WEIGHTS[source];
}

/**
 * The rolling window (in days) 21-09's current-window mastery computation
 * uses. Lives here, alongside every other number this phase introduces, so a
 * calibration review has one file to read.
 */
export const MASTERY_WINDOW_DAYS = 30;

/** The display/arithmetic scale every mastery figure in this phase is on. */
export const MASTERY_SCALE = { min: 0, max: 1 } as const;

/**
 * The project's rubric scale is 1-5 with 1 as the FLOOR, not as 20% credit.
 * So a 1 contributes 0 and a 5 contributes 1. Throws outside 1..5 or on a
 * non-finite input rather than clamping — a clamp would turn a bug into a
 * plausible-looking score.
 *
 * SINGLE SOURCE. Importers: 21-09's computation, 21-11's model-graded rewrite
 * grader, 21-21's report-to-competency mapper (and through it 21-16's coached
 * contribution). Nobody may restate `(score - 1) / 4` anywhere else — a
 * session dimension scoring 1 and a rewrite scoring 1 must contribute the
 * same, and two copies of the formula will eventually disagree about the
 * floor. It lives HERE, in the file every weight and scale constant already
 * lives in, so that no consumer needs a dependency on another consumer.
 */
export function normalizeRubricScore(score: number): number {
  if (!Number.isFinite(score)) {
    throw new Error(
      `normalizeRubricScore: score must be a finite number, got ${score}`
    );
  }
  if (score < 1 || score > 5) {
    throw new Error(
      `normalizeRubricScore: score must be in [1, 5], got ${score}`
    );
  }
  return (score - 1) / 4;
}
