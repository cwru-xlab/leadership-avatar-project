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
 */

export type StalledAffordance = "retry" | "check-again";

export interface ReportChrome {
  pollIntervalMs: number;
  giveUpAfterMs: number;
  stalledAffordance: StalledAffordance;
  distinguishes401: boolean;
  guardsRepollAfter404: boolean;
  showsCustomizationStrip: boolean;
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

const INTERVIEW_PRESET_SLUGS = new Set([
  "general",
  "technical",
  "consulting",
  "early-career",
]);

/**
 * Resolve report chrome for a practice type slug. Returns null for an
 * unknown slug so the report page can render not-found rather than
 * inventing a default cadence.
 */
export function getReportChrome(typeSlug: string | undefined | null): ReportChrome | null {
  if (!typeSlug) return null;
  const slug = typeSlug.trim().toLowerCase();
  if (slug === "case-study") return CASE_STUDY_CHROME;
  if (INTERVIEW_PRESET_SLUGS.has(slug)) return INTERVIEW_CHROME;
  return null;
}
