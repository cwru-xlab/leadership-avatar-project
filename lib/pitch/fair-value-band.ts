/**
 * Hidden investor fair-value band for pitch-deck sessions.
 *
 * Ask-independent by correctness constraint (14-12 / 14-CONTEXT.md /
 * 14-RESEARCH.md Pattern 4). Deriving this from askPriceUsd / askEquityPct
 * — including "a band centred near a discount to the ask" — is DISALLOWED:
 * a band that moves with whatever the student types makes ask-vs-fair
 * circular. The student never chooses or sees this band; startSession
 * injects it server-side and overwrites any client-supplied value.
 *
 * The numbers inside are a tuning knob 14-15 may calibrate. The rule that
 * the band is ask-independent is NOT tunable.
 */

import type { DeckFairValueBand } from "@/lib/pitch/deck-prompts";

/**
 * Per-type constant — seed-stage style band used for every pitch-deck
 * session until 14-15 introduces scenario-keyed variants.
 */
export const DEFAULT_DECK_FAIR_VALUE_BAND: DeckFairValueBand = {
  priceUsdMin: 800_000,
  priceUsdMax: 1_200_000,
  equityPctMin: 8,
  equityPctMax: 12,
};

/**
 * Resolve the server-authoritative fair-value band.
 * Metadata may eventually key a small fixed set of bands; the ask must
 * never be an input.
 */
export function resolveDeckFairValueBand(_meta?: {
  slideCount?: number;
}): DeckFairValueBand {
  void _meta;
  return DEFAULT_DECK_FAIR_VALUE_BAND;
}
