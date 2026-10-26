/**
 * Slide-count → session-length proposal for investor pitch-deck sessions.
 *
 * 14-RESEARCH.md Pitfall 5: there is no prior art for deriving a number from
 * an uploaded artifact anywhere in this codebase. Phase 8's `targetMinutes`
 * are static per-preset values — this is NOT an extension of them.
 *
 * The 8-and-25 slide anchors are a Claude's-Discretion calibration
 * (CONTEXT.md) and may be tuned in 14-15. The output is a PROPOSAL the
 * student adjusts before start; the server clamps again via
 * `clampAdjustableBudget` (14-02 / 14-05).
 *
 * Pure — callable from the wizard step and from verification scripts.
 */

/** Soft 20–30 minute envelope, in seconds. */
export const DECK_ENVELOPE_SECONDS = [20 * 60, 30 * 60] as const;

const ANCHOR_LOW_SLIDES = 8;
const ANCHOR_HIGH_SLIDES = 25;

/**
 * Propose a session budget in seconds from slide count, inside a given
 * envelope (defaults to the investor `DECK_ENVELOPE_SECONDS` range so every
 * existing call site keeps working unchanged).
 *
 * - at or below the low slide anchor → envelope floor
 * - at or above the high slide anchor → envelope ceiling
 * - in between → linear interpolation, rounded to the nearest 60 seconds
 * - `slideCount <= 0` → floor (do not throw)
 *
 * Deliberately does NOT import `lib/pitch/deck-modes.ts` — the envelope is
 * passed in, which keeps this module free of mode knowledge and avoids an
 * import cycle (deck-modes.ts imports DECK_ENVELOPE_SECONDS from here).
 */
export function proposeDeckSeconds(
  slideCount: number,
  envelope: readonly [number, number] = DECK_ENVELOPE_SECONDS,
): number {
  const [floor, ceiling] = envelope;

  if (!Number.isFinite(slideCount) || slideCount <= ANCHOR_LOW_SLIDES) {
    return floor;
  }
  if (slideCount >= ANCHOR_HIGH_SLIDES) {
    return ceiling;
  }

  const t =
    (slideCount - ANCHOR_LOW_SLIDES) / (ANCHOR_HIGH_SLIDES - ANCHOR_LOW_SLIDES);
  const raw = floor + t * (ceiling - floor);
  const rounded = Math.round(raw / 60) * 60;

  return Math.min(ceiling, Math.max(floor, rounded));
}
