/**
 * Per-competency levels, derived deterministically from a mastery percentage
 * and its evidence tier. This is the "progression" half of REQ-119 — levels
 * and daily/weekly goals (`lib/study-plan/goals.ts`) are the two Duolingo
 * mechanics 21-CONTEXT.md selected. Streaks and unlocking are the two it
 * explicitly rejected ("Not selected. Do not add them.") and their absence
 * is proven by `scripts/verify-levels-goals.ts`'s negative guard, not merely
 * asserted here.
 *
 * WHAT DELIBERATELY DOES NOT EXIST IN THIS MODULE:
 *   - No level is a prerequisite for anything.
 *   - No level grants access to anything (no step, check, or competency is
 *     gated behind reaching a level).
 *   - No function in this module takes a "current level" as input to decide
 *     what is available next.
 * Naming the absence here is what makes a future addition of any of the
 * above visibly a CHANGE IN POLICY — a deliberate reversal of this phase's
 * decision — rather than a feature nobody noticed was missing.
 */
import type { EvidenceTier } from "./thinness";

/** The five levels every competency can sit at, ordered weakest to strongest. */
export const LEVELS = [1, 2, 3, 4, 5] as const;

export type Level = (typeof LEVELS)[number];

const LEVEL_NAMES: Record<Level, string> = {
  1: "Starting out",
  2: "Building",
  3: "Competent",
  4: "Strong",
  5: "Mastered",
};

/**
 * LEVEL_THRESHOLDS — PROVISIONAL UNTIL CALIBRATED.
 *
 * Nothing below has been validated against real student distributions. The
 * derivation, so a future calibration pass knows what to check before
 * changing these numbers (same convention as `lib/mastery/weights.ts`'s
 * `CONTRIBUTION_WEIGHTS` and `lib/mastery/thinness.ts`'s
 * `THINNESS_THRESHOLDS`):
 *
 * The underlying rubric this percentage is built from is a 1-5 integer
 * scale, normalized by `normalizeRubricScore` in `lib/mastery/weights.ts`
 * (which owns that arithmetic outright — it is deliberately NOT restated
 * here, and both `verify-mastery-weights.ts` and
 * `verify-live-session-ingestion.ts` scan for a restatement anywhere else).
 * Under it a straight-3s performance lands at 50%, and a straight-4s
 * performance at 75%. The four boundaries below are placed so that:
 *   - a consistent 3 (50%) lands at level 2 "Building" — an honest read for
 *     a student performing at the middle of the rubric, not a punishing one;
 *   - a consistent 4 (75%) lands at level 4 "Strong";
 *   - level 5 "Mastered" requires performing BETTER than a straight 4 (85%),
 *     so the top label is not handed out for merely-good, repeatable work.
 *
 * minPercent values: 0, 40, 55, 70, 85 for levels 1..5 respectively.
 */
export const LEVEL_THRESHOLDS: ReadonlyArray<{
  level: Level;
  minPercent: number;
  name: string;
}> = [
  { level: 1, minPercent: 0, name: LEVEL_NAMES[1] },
  { level: 2, minPercent: 40, name: LEVEL_NAMES[2] },
  { level: 3, minPercent: 55, name: LEVEL_NAMES[3] },
  { level: 4, minPercent: 70, name: LEVEL_NAMES[4] },
  { level: 5, minPercent: 85, name: LEVEL_NAMES[5] },
];

export interface LevelResult {
  level: Level | null;
  name: string;
  /** True when the underlying figure is THIN evidence tier — the level is
   * computed normally but flagged as a weaker claim, same resolution 21-13
   * chose for a thin percentage. */
  provisional: boolean;
  /** The minPercent of the next threshold up, or null at level 5. This is
   * what makes a level PROGRESSION rather than a static badge: there is
   * always a visible next target, until there genuinely is none. */
  nextLevelAtPercent: number | null;
  /** The figure the level was resolved from, so the badge can show how far
   * the student is toward the next level; null when unmeasured. */
  percent: number | null;
  /** The minPercent of the CURRENT level (the bar's start); null when unmeasured. */
  levelFloorPercent: number | null;
}

/**
 * Resolves a competency's level from its percentage and evidence tier.
 *
 * Thresholds are INCLUSIVE lower bounds: a percent exactly equal to a
 * threshold's `minPercent` belongs to that (higher) level, not the one below
 * it. `scripts/verify-levels-goals.ts` asserts both sides of every boundary.
 *
 * `percent === null` returns a null level with the label "Not yet measured"
 * — NOT level 1. Level 1 "Starting out" means measured and at the bottom;
 * conflating "never attempted" with "attempted and starting out" tells a
 * student who has never practised a competency that they are already
 * failing at it, which is false and would be its own harm.
 *
 * `tier === "THIN"` computes the level normally but flags `provisional:
 * true`. A level is a STRONGER claim than a bare percentage — asserting
 * level 4 "Strong" off two sessions would be exactly the "presented as if
 * well-evidenced" failure REQ-105 forbids for percentages, and silently
 * withholding the level instead would be the "withheld" failure the same
 * requirement forbids. Flagging it keeps both halves satisfied.
 *
 * Throws on a percent outside [0, 100] rather than clamping — a caller
 * passing an out-of-range figure has a bug upstream, and clamping would mask
 * it instead of surfacing it.
 */
export function levelFor(args: {
  percent: number | null;
  tier: EvidenceTier;
}): LevelResult {
  const { percent, tier } = args;

  if (percent === null) {
    return {
      level: null,
      name: "Not yet measured",
      provisional: false,
      nextLevelAtPercent: null,
      percent: null,
      levelFloorPercent: null,
    };
  }

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`levelFor: percent must be in [0, 100], got ${percent}`);
  }

  // Inclusive lower bounds: find the highest threshold whose minPercent is
  // <= percent. LEVEL_THRESHOLDS is declared in ascending minPercent order,
  // so the last match wins.
  let resolved = LEVEL_THRESHOLDS[0];
  for (const threshold of LEVEL_THRESHOLDS) {
    if (percent >= threshold.minPercent) {
      resolved = threshold;
    }
  }

  const resolvedIndex = LEVEL_THRESHOLDS.indexOf(resolved);
  const nextThreshold = LEVEL_THRESHOLDS[resolvedIndex + 1];

  return {
    level: resolved.level,
    name: resolved.name,
    provisional: tier === "THIN",
    nextLevelAtPercent: nextThreshold ? nextThreshold.minPercent : null,
    percent,
    levelFloorPercent: resolved.minPercent,
  };
}
