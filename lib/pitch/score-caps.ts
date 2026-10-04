/**
 * Type-declared score ceilings for Practice Pitches.
 *
 * CONTEXT.md: "It caps the discovery/tailoring dimension only; other
 * dimensions unaffected" and "every rubric dimension still scored on what
 * did happen. No zeroing."
 *
 * 2-of-5 was chosen because the walk-out is direct evidence on that
 * dimension but not proof of total failure; this is a Claude's-Discretion
 * calibration and may be tuned in plan 14-15.
 */

import type { ScoreMap } from "@/lib/report/snapshot";

export const EARLY_END_CAP = {
  dimension: "discovery_tailoring",
  maxScore: 2,
} as const;

export interface EarlyEndCapContext {
  terminationReason: string | null;
  outcome?: Record<string, unknown> | null;
}

/**
 * Caps `discovery_tailoring` at `EARLY_END_CAP.maxScore` when the session
 * ended early. Returns `scores` unchanged when `terminationReason` is null.
 * A null score stays null — the cap never invents a score.
 */
export function applyEarlyEndCap(
  scores: ScoreMap,
  ctx: EarlyEndCapContext,
): ScoreMap {
  if (ctx.terminationReason === null) return scores;

  const next: ScoreMap = { ...scores };
  const existing = next[EARLY_END_CAP.dimension];
  if (typeof existing === "number") {
    next[EARLY_END_CAP.dimension] = Math.min(existing, EARLY_END_CAP.maxScore);
  }
  return next;
}
