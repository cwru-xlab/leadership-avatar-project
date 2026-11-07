/**
 * Pure filtering and sorting for My Reports, shared with the URL.
 *
 * `/api/practice/reports` returns every finished report the student owns, with
 * no paging, so filtering this complete list in the browser covers all of them.
 * "Show more" on the page only limits how many matching rows are drawn. If that
 * route ever starts paging, these filters must move server-side with it.
 *
 * There is deliberately no combined-score filter or sort: a report has four
 * category scores, never a blended one.
 */
import { resolveElevatorListener } from "@/lib/pitch/elevator-personas";
import type { ReportDTO } from "@/lib/report/dto";
import { isDeckModeSlug } from "@/lib/pitch/deck-modes";
import { displayReportTitle, typeLabelForReport } from "@/lib/report/title";

/** Study-plan generation still uses interview feedback only. */
export const INTERVIEW_TYPE_SLUGS = new Set([
  "general",
  "technical",
  "consulting",
  "early-career",
  "product-management",
]);

export const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "interview", label: "Interviews" },
  { id: "pitch", label: "Pitches" },
  { id: "difficult-conversation", label: "Courageous conversations" },
  { id: "networking", label: "Networking" },
  { id: "case-study", label: "Case studies" },
] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number]["id"];

export const SCORE_CATEGORIES = [
  { key: "content", label: "Content" },
  { key: "behavioral", label: "Behavioral" },
  { key: "visual", label: "Visual" },
  { key: "vocal", label: "Vocal" },
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number]["key"];

// Words match the report's SCORE_LABELS, so a band reads like the chip it finds.
export const SCORE_BANDS = [
  { id: "low", label: "Developing or below" },
  { id: "solid", label: "Solid" },
  { id: "high", label: "Strong or above" },
  { id: "none", label: "Not yet measured" },
] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number]["id"];

export const PLAN_FILTERS = [
  { id: "with", label: "Used in a study plan" },
  { id: "without", label: "Not in a study plan" },
] as const;
export type PlanFilter = (typeof PLAN_FILTERS)[number]["id"];

export const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "content-high", label: "Content: high to low" },
  { id: "content-low", label: "Content: low to high" },
  { id: "behavioral-high", label: "Behavioral: high to low" },
  { id: "behavioral-low", label: "Behavioral: low to high" },
  { id: "title", label: "Title: A to Z" },
] as const;
export type ReportSort = (typeof SORTS)[number]["id"];

export interface ReportFilters {
  q: string;
  type: TypeFilter;
  /** Local calendar days, `YYYY-MM-DD`, inclusive. */
  from: string | null;
  to: string | null;
  bands: Partial<Record<ScoreCategory, ScoreBand>>;
  plan: PlanFilter | null;
  sort: ReportSort;
}

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(
  value: string | null,
  options: ReadonlyArray<{ id: T }>,
): T | null {
  return options.find((option) => option.id === value)?.id ?? null;
}

function dateParam(value: string | null): string | null {
  return value && DATE_PARAM.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Reads a query string. Anything unrecognized is ignored, so an old link still opens. */
export function parseReportFilters(params: { get(name: string): string | null }): ReportFilters {
  const bands: ReportFilters["bands"] = {};
  for (const { key } of SCORE_CATEGORIES) {
    const band = oneOf(params.get(key), SCORE_BANDS);
    if (band) bands[key] = band;
  }
  return {
    q: params.get("q") ?? "",
    type: oneOf(params.get("type"), TYPE_FILTERS) ?? "all",
    from: dateParam(params.get("from")),
    to: dateParam(params.get("to")),
    bands,
    plan: oneOf(params.get("plan"), PLAN_FILTERS),
    sort: oneOf(params.get("sort"), SORTS) ?? "newest",
  };
}

/** The canonical query string, without a leading "?". Defaults are left out. */
export function serializeReportFilters(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  for (const { key } of SCORE_CATEGORIES) {
    const band = filters.bands[key];
    if (band) params.set(key, band);
  }
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

export const NO_FILTERS: ReportFilters = {
  q: "",
  type: "all",
  from: null,
  to: null,
  bands: {},
  plan: null,
  sort: "newest",
};

export function matchesTypeFilter(typeSlug: string, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  // The coding interview files under Interviews too; it stays out of
  // INTERVIEW_TYPE_SLUGS because study plans don't read it yet.
  if (filter === "interview") return INTERVIEW_TYPE_SLUGS.has(typeSlug) || typeSlug === "technical-coding";
  // All five deck modes (19-01's DECK_MODES table) land under the existing
  // Pitches tab alongside the elevator pitch — no new filter tab is added.
  if (filter === "pitch")
    return typeSlug === "pitch-elevator" || isDeckModeSlug(typeSlug);
  return typeSlug === filter;
}

export function reportWhen(report: ReportDTO): string {
  return report.completedAt ?? report.startedAt;
}

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (typeof score !== "number") return "none";
  if (score < 3) return "low";
  return score < 4 ? "solid" : "high";
}

/**
 * Everything a search can match. The interviewer persona is searched but, per
 * ReportCustomizationStrip's rule, never shown: a search can find the session
 * without the text ever reaching the page. The job posting is here because
 * reports have no company field and that is where the company name lives.
 */
function searchText(report: ReportDTO): string {
  const input = report.input;
  const parts: Array<string | null | undefined> = [
    displayReportTitle({ title: report.title, typeSlug: report.typeSlug, input }),
    report.title,
    typeLabelForReport(report.typeSlug),
  ];
  switch (input?.kind) {
    case "interview":
      parts.push(input.interviewerName, input.interviewerPersona, input.roleTitle, input.industry, input.jobDescriptionText);
      break;
    case "scenario":
      parts.push(input.caseName, input.background);
      break;
    case "pitch":
      parts.push(input.pitchSubject);
      // The snapshot holds the listener's id; search the person the student met.
      if (input.pitchKind === "elevator") {
        const listener = resolveElevatorListener(input.listenerPersona);
        parts.push(listener.name, listener.role);
      }
      break;
    case "difficult-conversation":
      parts.push(input.conversationTitle, input.role, input.studentRole, input.situation, input.studentObjective);
      break;
    case "networking":
      parts.push(input.displayName, input.goal);
      break;
    case "technical-coding":
      parts.push(input.assignment?.title);
      break;
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function localDayStart(day: string): number {
  return new Date(`${day}T00:00:00`).getTime();
}

function localDayEnd(day: string): number {
  return new Date(`${day}T23:59:59.999`).getTime();
}

/** Every search word must appear, in any order, across any of the report's fields. */
export function filterReports(
  reports: readonly ReportDTO[],
  filters: ReportFilters,
  plannedReportIds: ReadonlySet<string>,
): ReportDTO[] {
  const terms = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const from = filters.from ? localDayStart(filters.from) : null;
  const to = filters.to ? localDayEnd(filters.to) : null;
  const bandEntries = Object.entries(filters.bands) as Array<[ScoreCategory, ScoreBand]>;

  return reports.filter((report) => {
    if (!matchesTypeFilter(report.typeSlug, filters.type)) return false;
    const time = new Date(reportWhen(report)).getTime();
    if (from !== null && time < from) return false;
    if (to !== null && time > to) return false;
    if (bandEntries.some(([key, band]) => scoreBand(report.scores?.[key]) !== band)) return false;
    if (filters.plan && plannedReportIds.has(report.id) !== (filters.plan === "with")) return false;
    if (terms.length > 0) {
      const text = searchText(report);
      if (!terms.every((term) => text.includes(term))) return false;
    }
    return true;
  });
}

function byScore(key: ScoreCategory, direction: 1 | -1) {
  return (a: ReportDTO, b: ReportDTO) => {
    const left = a.scores?.[key];
    const right = b.scores?.[key];
    // A session with no score has no place on the ramp, so it always sorts last.
    if (typeof left !== "number") return typeof right !== "number" ? 0 : 1;
    if (typeof right !== "number") return -1;
    return (left - right) * direction;
  };
}

export function sortReports(
  reports: readonly ReportDTO[],
  sort: ReportSort,
  titles: ReadonlyMap<string, string>,
): ReportDTO[] {
  const newest = (a: ReportDTO, b: ReportDTO) =>
    new Date(reportWhen(b)).getTime() - new Date(reportWhen(a)).getTime();
  const comparators: Record<ReportSort, (a: ReportDTO, b: ReportDTO) => number> = {
    newest,
    oldest: (a, b) => newest(b, a),
    "content-high": byScore("content", -1),
    "content-low": byScore("content", 1),
    "behavioral-high": byScore("behavioral", -1),
    "behavioral-low": byScore("behavioral", 1),
    title: (a, b) => (titles.get(a.id) ?? "").localeCompare(titles.get(b.id) ?? ""),
  };
  const compare = comparators[sort];
  return [...reports].sort((a, b) => compare(a, b) || newest(a, b));
}

/** One removable chip per active filter. Type and sort show their own controls. */
export function activeFilterChips(
  filters: ReportFilters,
): Array<{ id: string; label: string; clear: Partial<ReportFilters> }> {
  const chips: Array<{ id: string; label: string; clear: Partial<ReportFilters> }> = [];
  const day = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (filters.from) chips.push({ id: "from", label: `From ${day(filters.from)}`, clear: { from: null } });
  if (filters.to) chips.push({ id: "to", label: `To ${day(filters.to)}`, clear: { to: null } });
  for (const { key, label } of SCORE_CATEGORIES) {
    const band = filters.bands[key];
    if (!band) continue;
    const { [key]: _removed, ...rest } = filters.bands;
    chips.push({
      id: key,
      label: `${label}: ${SCORE_BANDS.find((option) => option.id === band)!.label.toLowerCase()}`,
      clear: { bands: rest },
    });
  }
  if (filters.plan) {
    chips.push({
      id: "plan",
      label: PLAN_FILTERS.find((option) => option.id === filters.plan)!.label,
      clear: { plan: null },
    });
  }
  return chips;
}

// The report page's back link returns to the list as the student left it.
const LAST_QUERY_KEY = "reports:last-query";

export function rememberReportsQuery(query: string): void {
  try {
    window.sessionStorage.setItem(LAST_QUERY_KEY, query);
  } catch {
    // Private windows may block storage; the back link then opens the plain list.
  }
}

export function reportsListHref(): string {
  try {
    const query = window.sessionStorage.getItem(LAST_QUERY_KEY);
    return query ? `/reports?${query}` : "/reports";
  } catch {
    return "/reports";
  }
}
