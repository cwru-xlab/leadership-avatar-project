/**
 * The ONE data home for the deck-led pitch family.
 *
 * This table is the ONLY place a deck mode's identity lives. A sixth mode is
 * a row here plus one TYPE record under `lib/pitch/`. If you are about to
 * write `slug === "pitch-..."` anywhere else, call `getDeckMode()` instead.
 *
 * Pure data + pure lookups — no I/O, no React, no Prisma.
 *
 * Slugs are PERMANENT: they land in `InteractionReport.typeSlug` and keep
 * the existing `pitch-` prefix so the Phase 14 reports filter and the
 * surface-guard regexes keep matching.
 *
 * `pitch-deck`'s row reproduces what already ships today (envelope, title,
 * `negotiation-ask` step) so adding this table changes nothing about the
 * investor mode's behavior.
 */

import { DECK_ENVELOPE_SECONDS } from "@/lib/pitch/session-length";

export type DeckModeSlug =
  | "pitch-deck"
  | "pitch-funding"
  | "pitch-product"
  | "pitch-talk"
  | "pitch-general";

/**
 * Per-mode wizard inputs, discriminated on `mode`. These fields ride on the
 * shared `pitch-deck` instance and input snapshot (plan 19-02).
 *
 * `pitch-deck` has deliberately NO member — its ask/equity stay where Phase
 * 14 put them, on the instance itself. `pitch-general` has deliberately NO
 * member — 19-CONTEXT.md: zero setup, no audience field, do not invent one.
 */
export type DeckModeInputs =
  | { mode: "pitch-funding"; requestedAmountUsd: number; useOfFunds: string }
  | { mode: "pitch-product"; buyerProfile: string }
  | { mode: "pitch-talk"; talkAudience: string; talkTakeaway: string };

export interface DeckMode {
  slug: DeckModeSlug;
  cardTitle: string;
  cardBlurb: string;
  /** Who you're pitching to — the picker's primary differentiator. */
  listenerLine: string;
  /** The short "what gets scored" line. */
  scoredLine: string;
  /** This mode's own session-length range, in seconds. */
  envelopeSeconds: readonly [number, number];
  /** True for `pitch-deck` only. */
  negotiates: boolean;
  /** The explicit picker marker, e.g. "Ends in terms" / "No terms negotiated". */
  negotiationMarker: string;
  /** The one wizard step this mode adds, or null for `pitch-general`. */
  modeInputStepId: string | null;
  /** The one wizard step component this mode adds, or null for `pitch-general`. */
  modeInputStepComponent: string | null;
  /** Rubric keys beyond the shared four. */
  distinctiveDimensionKeys: readonly string[];
  /** The mode's outcome record keys (empty for `pitch-general`). */
  outcomeFieldKeys: readonly string[];
  /** False for `pitch-general` only. */
  hasOutcomePanel: boolean;
  /** The name shown as the live avatar's label. */
  listenerDisplayName: string;
  /** Copy the wizard reads instead of branching on a slug. */
  wizardHeadline: string;
  wizardStudioStat: string;
}

export const DECK_MODES: Record<DeckModeSlug, DeckMode> = {
  "pitch-deck": {
    slug: "pitch-deck",
    cardTitle: "Investor pitch deck",
    cardBlurb:
      "Walk an investor through your deck, defend your ask with evidence, and negotiate price and equity.",
    listenerLine: "An investor",
    scoredLine: "Negotiation",
    envelopeSeconds: DECK_ENVELOPE_SECONDS,
    negotiates: true,
    negotiationMarker: "Ends in terms",
    modeInputStepId: "negotiation-ask",
    modeInputStepComponent: "NegotiationAskStep",
    distinctiveDimensionKeys: ["negotiation"],
    outcomeFieldKeys: [
      "dealReached",
      "settledPriceUsd",
      "settledEquityPct",
      "negotiationNotes",
    ],
    hasOutcomePanel: true,
    listenerDisplayName: "Investor",
    wizardHeadline: "Pitch your deck to an investor",
    wizardStudioStat: "20-30 min negotiation",
  },
  "pitch-funding": {
    slug: "pitch-funding",
    cardTitle: "Funding request",
    cardBlurb:
      "Pitch a budget or grant reviewer on your requested amount and defend how you'll use it — no equity, no terms.",
    listenerLine: "A budget or grant reviewer",
    scoredLine: "Use of funds and whether the amount is feasible",
    envelopeSeconds: [15 * 60, 25 * 60],
    negotiates: false,
    negotiationMarker: "No terms negotiated",
    modeInputStepId: "funding-ask",
    modeInputStepComponent: "FundingAskStep",
    distinctiveDimensionKeys: [
      "use_of_funds_credibility",
      "ask_feasibility",
    ],
    outcomeFieldKeys: [
      "fundedAmountUsd",
      "fundingPosition",
      "fundingRationale",
    ],
    hasOutcomePanel: true,
    listenerDisplayName: "Reviewer",
    wizardHeadline: "Pitch your funding request",
    wizardStudioStat: "15-25 min review",
  },
  "pitch-product": {
    slug: "pitch-product",
    cardTitle: "Product pitch",
    cardBlurb:
      "Pitch a prospective customer on your product and handle their objections in character.",
    listenerLine: "A prospective customer",
    scoredLine: "Objection handling",
    envelopeSeconds: [10 * 60, 20 * 60],
    negotiates: false,
    negotiationMarker: "No terms negotiated",
    modeInputStepId: "buyer-profile",
    modeInputStepComponent: "BuyerProfileStep",
    distinctiveDimensionKeys: ["objection_handling"],
    outcomeFieldKeys: ["buyerPosition", "blockingObjection"],
    hasOutcomePanel: true,
    listenerDisplayName: "Buyer",
    wizardHeadline: "Pitch your product to a buyer",
    wizardStudioStat: "10-20 min pitch",
  },
  "pitch-talk": {
    slug: "pitch-talk",
    cardTitle: "Deck-led talk",
    cardBlurb:
      "Deliver a deck-led talk to a conference audience and see whether your intended takeaway landed.",
    listenerLine: "A conference audience",
    scoredLine: "Audience takeaway and holding the room",
    envelopeSeconds: [10 * 60, 20 * 60],
    negotiates: false,
    negotiationMarker: "No terms negotiated",
    modeInputStepId: "talk-audience",
    modeInputStepComponent: "TalkAudienceStep",
    distinctiveDimensionKeys: [
      "audience_takeaway_clarity",
      "holding_the_room",
    ],
    outcomeFieldKeys: ["takeawayHeard", "matchedDeclaredTakeaway"],
    hasOutcomePanel: true,
    listenerDisplayName: "Audience",
    wizardHeadline: "Deliver your deck-led talk",
    wizardStudioStat: "10-20 min talk",
  },
  "pitch-general": {
    slug: "pitch-general",
    cardTitle: "General deck pitch",
    cardBlurb:
      "A neutral practice run: upload your deck and pitch an attentive listener. No setup beyond the deck.",
    listenerLine: "An attentive listener",
    scoredLine: "Your deck and your delivery",
    envelopeSeconds: [10 * 60, 20 * 60],
    negotiates: false,
    negotiationMarker: "No terms negotiated",
    modeInputStepId: null,
    modeInputStepComponent: null,
    distinctiveDimensionKeys: [],
    outcomeFieldKeys: [],
    hasOutcomePanel: false,
    listenerDisplayName: "Listener",
    wizardHeadline: "Rehearse your deck pitch",
    wizardStudioStat: "10-20 min rehearsal",
  },
};

/** Picker order: deck, funding, product, talk, general. */
const DECK_MODE_ORDER: readonly DeckModeSlug[] = [
  "pitch-deck",
  "pitch-funding",
  "pitch-product",
  "pitch-talk",
  "pitch-general",
];

/**
 * Resolve a deck mode slug, mirroring `getEngineType`'s shape so a later
 * store swap touches one function. Trims + lowercases; null on unknown.
 */
export function getDeckMode(
  slug: string | undefined | null,
): DeckMode | null {
  if (!slug) return null;

  const normalized = slug.trim().toLowerCase();

  return isDeckModeSlug(normalized) ? DECK_MODES[normalized] : null;
}

export function isDeckModeSlug(slug: string): slug is DeckModeSlug {
  return DECK_MODE_ORDER.includes(slug as DeckModeSlug);
}

/** All five modes, in picker order (deck, funding, product, talk, general). */
export function listDeckModes(): DeckMode[] {
  return DECK_MODE_ORDER.map((slug) => DECK_MODES[slug]);
}

/** False for a non-mode slug. */
export function deckModeNegotiates(slug: string | undefined | null): boolean {
  return getDeckMode(slug)?.negotiates ?? false;
}
