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
 *
 * Mode-aware (Phase 19): only the one negotiating deck mode has a band at
 * all. A non-negotiating mode (`pitch-funding` / `pitch-product` /
 * `pitch-talk` / `pitch-general`) has no terms worth a band, so this
 * resolver returns `null` for it — never a synthesized or empty band.
 */

import type { DeckFairValueBand } from "@/lib/pitch/deck-prompts";
import { deckModeNegotiates } from "@/lib/pitch/deck-modes";

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
 * Resolve the server-authoritative fair-value band for a deck session's
 * mode, identified by `typeSlug`. Returns `null` unless the mode
 * negotiates — a non-negotiating mode has no band at all.
 * Metadata may eventually key a small fixed set of bands; the ask must
 * never be an input.
 */
export function resolveDeckFairValueBand(
  typeSlug: string,
  _meta?: { slideCount?: number },
): DeckFairValueBand | null {
  void _meta;
  if (!deckModeNegotiates(typeSlug)) return null;
  return DEFAULT_DECK_FAIR_VALUE_BAND;
}
