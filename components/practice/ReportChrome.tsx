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

import NetworkingOutcomePanel from "@/components/practice/panels/NetworkingOutcomePanel";
import ConversationEndBanner from "@/components/practice/report/ConversationEndBanner";
import ConversationOutcomePanel from "@/components/practice/report/ConversationOutcomePanel";
import DeckTimelinePanel from "@/components/practice/report/DeckTimelinePanel";
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
 */
const PITCH_ELEVATOR_CHROME: ReportChrome = {
  pollIntervalMs: 2000,
  giveUpAfterMs: 120_000,
  stalledAffordance: "retry",
  distinguishes401: true,
  guardsRepollAfter404: false,
  showsCustomizationStrip: false,
  extras: {
    above: (report) => <PitchOutcomeBanner report={report} />,
  },
};

const PITCH_DECK_CHROME: ReportChrome = {
  pollIntervalMs: 2000,
  giveUpAfterMs: 120_000,
  stalledAffordance: "retry",
  distinguishes401: true,
  guardsRepollAfter404: false,
  showsCustomizationStrip: false,
  extras: {
    below: (report) => (
      <>
        <NegotiationTriplePanel report={report} />
        <DeckTimelinePanel report={report} />
      </>
    ),
  },
};

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
  if (slug === "pitch-deck") return PITCH_DECK_CHROME;
  if (INTERVIEW_PRESET_SLUGS.has(slug)) return INTERVIEW_CHROME;

  return null;
}
