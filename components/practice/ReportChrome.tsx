/**
 * Per-type report chrome descriptors for `/practice/[type]/report/[reportId]`.
 *
 * THESE ARE PRESERVED PRE-PHASE-13 DIVERGENCES, NOT A DESIGN.
 *
 * Interview and scenario report pages already differed in poll cadence,
 * give-up window, stalled affordance, 401 handling, and 404 re-poll
 * guards before Phase 13. REQ-69 forbids converging them in this phase —
 * each type keeps the exact behavior its legacy page had.
 *
 * Anyone tempted to "tidy" these numbers into one shared constant should
 * read that requirement first and leave this file alone.
 *
 * Extras exist so a new type contributes report panels without the one
 * report page learning its name. If you are about to write `typeSlug ===`
 * in the report page, add an extras entry here instead.
 */

import type { ReactNode } from "react";
import type { ReportDTO } from "@/lib/report/dto";

import { deckModeNegotiates, isDeckModeSlug, type DeckModeSlug } from "@/lib/pitch/deck-modes";

import NetworkingOutcomePanel from "@/components/practice/panels/NetworkingOutcomePanel";
import ConversationEndBanner from "@/components/practice/report/ConversationEndBanner";
import ConversationOutcomePanel from "@/components/practice/report/ConversationOutcomePanel";
import DeckTimelinePanel from "@/components/practice/report/DeckTimelinePanel";
import DeckVerdictPanel from "@/components/practice/report/DeckVerdictPanel";
import { DisengagementDeclinePanel } from "@/components/practice/report/DisengagementDeclinePanel";
import InRoleReactionPanel from "@/components/practice/report/InRoleReactionPanel";
import NegotiationTriplePanel from "@/components/practice/report/NegotiationTriplePanel";
import PitchOutcomeBanner from "@/components/practice/report/PitchOutcomeBanner";

export type StalledAffordance = "retry" | "check-again";

/** Slot position relative to the shared score cards. */
export type ReportExtrasSlot = "above" | "below";

export type ReportExtrasRenderer = (report: ReportDTO) => ReactNode;

export interface ReportChrome {
  pollIntervalMs: number;
  giveUpAfterMs: number;
  stalledAffordance: StalledAffordance;
  distinguishes401: boolean;
  guardsRepollAfter404: boolean;
  showsCustomizationStrip: boolean;
  /**
   * Per-type report panels. Types that declare none leave both slots
   * undefined — interview presets and case-study stay visually unchanged.
   */
  extras?: Partial<Record<ReportExtrasSlot, ReportExtrasRenderer>>;
}

/** Interview presets — sourced from `app/interview/[type]/report/[reportId]/page.tsx`. */
const INTERVIEW_CHROME: ReportChrome = {
  pollIntervalMs: 2000,
  giveUpAfterMs: 120_000,
  stalledAffordance: "retry",
  distinguishes401: true,
  guardsRepollAfter404: false,
  showsCustomizationStrip: true,
};

/** Case-study — sourced from `app/case-play/[caseId]/report/[reportId]/page.tsx`. */
const CASE_STUDY_CHROME: ReportChrome = {
  pollIntervalMs: 3000,
  giveUpAfterMs: 180_000,
  stalledAffordance: "check-again",
  distinguishes401: false,
  guardsRepollAfter404: true,
  showsCustomizationStrip: false,
};

/**
 * Difficult conversation — same poll discipline as interview; panels arrive
 * through extras only (Against 13-12 / 14-14 shape). Banner above scores;
 * factual outcome + in-role reaction below.
 */
const DIFFICULT_CONVERSATION_CHROME: ReportChrome = {
  pollIntervalMs: 2000,
  giveUpAfterMs: 120_000,
  stalledAffordance: "retry",
  distinguishes401: true,
  guardsRepollAfter404: false,
  showsCustomizationStrip: false,
  extras: {
    above: (report) => <ConversationEndBanner report={report} />,
    below: (report) => (
      <>
        <ConversationOutcomePanel report={report} />
        <InRoleReactionPanel report={report} />
      </>
    ),
  },
};

/**
 * Networking — same poll discipline as interview; outcome panel below scores
 * through extras only. Seven dimensions arrive from the type declaration.
 *
 * Per 14-15's surface guard: this map plus `app/practice/[type]/page.tsx`
 * are the only places a type slug is permitted to appear in a `.tsx` file
 * outside the type's own components.
 */
const NETWORKING_CHROME: ReportChrome = {
  pollIntervalMs: 2000,
  giveUpAfterMs: 120_000,
  stalledAffordance: "retry",
  distinguishes401: true,
  guardsRepollAfter404: false,
  showsCustomizationStrip: false,
  extras: {
    below: (report) => <NetworkingOutcomePanel report={report} />,
  },
};

/**
 * Pitch types — same poll discipline as interview. Early-end banner / ask-vs-
 * fair extras land in 14-14; chrome must exist now so a READY elevator report
 * does not render as "Report not found" (getReportChrome returned null).
 *
 * Coverage contract: every slug in ENGINE_TYPES must resolve here. Enforced by
 * `scripts/verify-report-chrome-coverage.ts` (includes difficult-conversation
 * and networking explicitly).
 *
 * This map plus `app/practice/[type]/page.tsx` are the only places a type
 * slug may appear in a `.tsx` file outside a type's own components. All
 * five deck modes (19-01's `DECK_MODES` table) arrive here through
 * `isDeckModeSlug` rather than one line per mode — a sixth deck mode needs
 * no edit to this file.
 */
const PITCH_ELEVATOR_CHROME: ReportChrome = {
  pollIntervalMs: 2000,
  giveUpAfterMs: 120_000,
  stalledAffordance: "retry",
  distinguishes401: true,
  guardsRepollAfter404: false,
  showsCustomizationStrip: false,
  extras: {
    above: (report) => <><PitchOutcomeBanner report={report} /><DisengagementDeclinePanel report={report} /></>,
  },
};

/**
 * Deck-mode chrome — one factory for all five deck modes (investor, funding,
 * product, talk, general), resolved through `DECK_MODES` rather than one
 * `if (slug === "pitch-...")` per mode. Same interview poll discipline the
 * pitch chromes already use. Memoized per slug so `getReportChrome` returns
 * referentially-stable chrome across renders, matching the named-constant
 * shape every other chrome above uses.
 *
 * `extras.above`: `PitchOutcomeBanner` + `DisengagementDeclinePanel` for all
 * five modes — both already return null when their data is absent, and
 * with walk-out off (19-03) the four new modes simply have none. Kept
 * uniform rather than removed, so the slot shape never depends on the mode.
 *
 * `extras.below`: `DeckTimelinePanel` for all five (slide coverage/overrun
 * is shared deck capability), `NegotiationTriplePanel` ONLY when the mode
 * negotiates (`pitch-deck` today), and `DeckVerdictPanel` always — it
 * self-nulls for `pitch-deck` (owned by `NegotiationTriplePanel`) and
 * `pitch-general` (no outcome panel at all).
 */
const DECK_CHROME_CACHE = new Map<DeckModeSlug, ReportChrome>();

function deckChromeFor(slug: DeckModeSlug): ReportChrome {
  const cached = DECK_CHROME_CACHE.get(slug);
  if (cached) return cached;

  const chrome: ReportChrome = {
    pollIntervalMs: 2000,
    giveUpAfterMs: 120_000,
    stalledAffordance: "retry",
    distinguishes401: true,
    guardsRepollAfter404: false,
    showsCustomizationStrip: false,
    extras: {
      above: (report) => <><PitchOutcomeBanner report={report} /><DisengagementDeclinePanel report={report} /></>,
      below: (report) => (
        <>
          <DeckTimelinePanel report={report} />
          {deckModeNegotiates(slug) ? <NegotiationTriplePanel report={report} /> : null}
          <DeckVerdictPanel report={report} />
        </>
      ),
    },
  };

  DECK_CHROME_CACHE.set(slug, chrome);
  return chrome;
}

const INTERVIEW_PRESET_SLUGS = new Set([
  "general",
  "technical",
  "consulting",
  "early-career",
]);

/**
 * Render a chrome extras slot for the one report page. Generic — never
 * branches on a type slug. Returns null when the type declared no panel
 * for that slot or the report is not yet ready to show extras.
 */
export function renderReportExtras(
  chrome: ReportChrome | null | undefined,
  slot: ReportExtrasSlot,
  report: ReportDTO | null | undefined,
): ReactNode {
  if (!chrome?.extras || !report || report.status !== "READY") return null;
  const render = chrome.extras[slot];

  if (!render) return null;

  return render(report);
}

/**
 * Resolve report chrome for a practice type slug. Returns null for an
 * unknown slug so the report page can render not-found rather than
 * inventing a default cadence.
 */
export function getReportChrome(
  typeSlug: string | undefined | null,
): ReportChrome | null {
  if (!typeSlug) return null;
  const slug = typeSlug.trim().toLowerCase();

  if (slug === "case-study") return CASE_STUDY_CHROME;
  if (slug === "difficult-conversation") return DIFFICULT_CONVERSATION_CHROME;
  if (slug === "networking") return NETWORKING_CHROME;
  if (slug === "pitch-elevator") return PITCH_ELEVATOR_CHROME;
  if (isDeckModeSlug(slug)) return deckChromeFor(slug);
  if (INTERVIEW_PRESET_SLUGS.has(slug)) return INTERVIEW_CHROME;

  return null;
}
