"use client";

/**
 * My Reports. Search, type chips and sort are always in view; dates, category
 * score bands and the study-plan filter sit behind "Filters", and whatever is
 * active shows as a removable chip beside the result count.
 *
 * The URL is the filter state (`lib/report/filters.ts`), so Back and shared
 * links work, and the native History API updates it without a server trip. The
 * API returns the student's whole list unpaged, so every filter covers every
 * report; "Show more" only limits how many matching rows are drawn.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import LevelChip from "@/components/report/LevelChip";

import type { ReportDTO } from "@/lib/report/dto";
import { routes } from "@/lib/routes";
import {
  disambiguateTitles,
  displayReportTitle,
  formatReportWhen,
  formatTitleDate,
  typeLabelForReport,
} from "@/lib/report/title";
import {
  activeFilterChips,
  filterReports,
  matchesTypeFilter,
  NO_FILTERS,
  parseReportFilters,
  PLAN_FILTERS,
  rememberReportsQuery,
  reportWhen,
  SCORE_BANDS,
  SCORE_CATEGORIES,
  serializeReportFilters,
  sortReports,
  SORTS,
  TYPE_FILTERS,
  type PlanFilter,
  type ReportFilters,
  type ReportSort,
  type ScoreBand,
  type ScoreCategory,
  type TypeFilter,
} from "@/lib/report/filters";
import type { StudyPlanSummaryDTO } from "@/lib/study-plan/plan-dto";
import StudyPlanGenerator, { scoreOf } from "@/components/study-plan/StudyPlanGenerator";

function interviewerName(report: ReportDTO): string | null {
  return report.input?.kind === "interview"
    ? report.input.interviewerName
    : null;
}

// READY needs no word; every other status is said once in the row's meta line.
const STATUS_WORD: Record<ReportDTO["status"], string | null> = {
  READY: null,
  PENDING: "Scoring",
  FAILED: "Couldn't score",
  IN_PROGRESS: "Not finished",
};

const PAGE_SIZE = 10;

const SCORE_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Strong",
  3: "Solid",
  2: "Developing",
  1: "Needs work",
};

/** A category score as its level chip; the column header carries the label on desktop. */
function ScoreBadge({ label, score }: { label: string; score: number | null }) {
  return (
    <span className="flex items-center gap-1.5 md:w-[136px]">
      <span className="text-[12.5px] text-muted md:sr-only">{label}</span>
      {score === null ? (
        <span className="text-[12.5px] text-muted">Not yet measured</span>
      ) : (
        <LevelChip
          label={SCORE_LABELS[score] ?? `${score} / 5`}
          level={Math.min(5, Math.max(1, score)) as 1 | 2 | 3 | 4 | 5}
        />
      )}
    </span>
  );
}

const FIELD_CLASS =
  "h-11 w-full rounded-sm border border-line bg-white pl-3 text-sm text-ink md:h-10";

function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={clsx("flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-ink", className)}>
      {label}
      {children}
    </label>
  );
}

/** A native select, for its phone and keyboard behavior, with the app's own chevron. */
function SelectField({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative flex min-w-0 flex-1">
      <select {...props} className={clsx("w-full appearance-none truncate pr-8", className)} />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
    </span>
  );
}

function localDay(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function MyReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<ReportDTO[] | null>(null);
  const [plannedIds, setPlannedIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [plans, setPlans] = useState<StudyPlanSummaryDTO[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);

  const urlFilters = useMemo(() => parseReportFilters(searchParams), [searchParams]);

  // Typing filters instantly but reaches the URL after a pause, as one history
  // entry. A change from anywhere else (Back, a link, clear all) wins.
  const [searchDraft, setSearchDraft] = useState(urlFilters.q);
  const lastWrittenQ = useRef(urlFilters.q);
  useEffect(() => {
    if (urlFilters.q !== lastWrittenQ.current) {
      lastWrittenQ.current = urlFilters.q;
      setSearchDraft(urlFilters.q);
    }
  }, [urlFilters.q]);

  const filters = useMemo<ReportFilters>(
    () => ({ ...urlFilters, q: searchDraft }),
    [urlFilters, searchDraft],
  );
  const query = serializeReportFilters(filters);

  function writeUrl(next: ReportFilters, mode: "push" | "replace") {
    const qs = serializeReportFilters(next);
    lastWrittenQ.current = next.q.trim();
    const url = qs ? `/reports?${qs}` : "/reports";
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  function updateFilters(patch: Partial<ReportFilters>) {
    const next = { ...filters, ...patch };
    if (patch.q !== undefined) setSearchDraft(patch.q);
    writeUrl(next, "push");
  }

  useEffect(() => {
    if (searchDraft.trim() === urlFilters.q.trim()) return;
    const timer = window.setTimeout(
      () => writeUrl({ ...urlFilters, q: searchDraft }, "replace"),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [searchDraft, urlFilters]);

  useEffect(() => {
    rememberReportsQuery(query);
  }, [query]);

  // Titles are made unique against the whole list, so a row reads the same
  // whichever filters happen to be on.
  const titles = useMemo(
    () =>
      disambiguateTitles(
        (reports ?? []).map((report) => ({
          id: report.id,
          title: displayReportTitle({
            title: report.title,
            typeSlug: report.typeSlug,
            input: report.input,
          }),
          when: reportWhen(report),
        })),
      ),
    [reports],
  );

  const filteredReports = useMemo(
    () =>
      sortReports(filterReports(reports ?? [], filters, plannedIds), filters.sort, titles),
    [reports, filters, plannedIds, titles],
  );

  // Drawing limit, reset whenever the filters change.
  const [drawn, setDrawn] = useState({ forQuery: query, count: PAGE_SIZE });
  const visibleCount = drawn.forQuery === query ? drawn.count : PAGE_SIZE;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // No ?types= filter — return every finished interaction (pitches, DC, networking, …).
        const response = await fetch(`/api/practice/reports`, {
          cache: "no-store",
          credentials: "include",
        });
        if (response.status === 401) {
          if (!cancelled) setNeedsLogin(true);
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          reports?: ReportDTO[];
          plannedReportIds?: string[];
          error?: string;
        };
        if (!response.ok || !data.reports) {
          if (!cancelled)
            setError(data.error || "We couldn't load your reports.");
          return;
        }
        if (!cancelled) {
          setReports(data.reports);
          setPlannedIds(new Set(data.plannedReportIds ?? []));
          setError(null);
        }
      } catch {
        if (!cancelled) setError("We couldn't load your reports.");
      }
    }

    async function loadPlans() {
      try {
        const response = await fetch("/api/study-plans", {
          cache: "no-store",
          credentials: "include",
        });
        if (response.status === 401) return;
        const data = (await response.json().catch(() => ({}))) as {
          plans?: StudyPlanSummaryDTO[];
          error?: string;
        };
        if (!response.ok || !data.plans) {
          if (!cancelled)
            setPlansError(data.error || "We couldn't load your saved plans.");
          return;
        }
        if (!cancelled) setPlans(data.plans);
      } catch {
        if (!cancelled) setPlansError("We couldn't load your saved plans.");
      }
    }

    void load();
    void loadPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  // Each chip counts what it would show given the other filters.
  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(TYPE_FILTERS.map((f) => [f.id, 0])) as Record<TypeFilter, number>;
    for (const report of filterReports(reports ?? [], { ...filters, type: "all" }, plannedIds)) {
      for (const filter of TYPE_FILTERS) {
        if (matchesTypeFilter(report.typeSlug, filter.id)) counts[filter.id] += 1;
      }
    }
    return counts;
  }, [reports, filters, plannedIds]);

  const chips = activeFilterChips(filters);
  const hasActiveFilters = chips.length > 0 || filters.type !== "all" || filters.q.trim().length > 0;

  const visibleReports = filteredReports.slice(0, visibleCount);

  const emptyState = (title: string, body: string | null, action: React.ReactNode) => (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white px-6 py-10 text-center">
      <p className="font-display text-[22px] font-medium text-cwru-blue">{title}</p>
      {body && <p className="max-w-[48ch] text-sm text-muted">{body}</p>}
      {action}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
          My reports
        </h1>
        <p className="text-[15px] text-muted">Every finished session.</p>
      </header>

      {needsLogin ? (
        emptyState(
          "Please sign in to view your reports.",
          null,
          <Button color="primary" onPress={() => router.push("/login")}>
            Go to sign in
          </Button>,
        )
      ) : error ? (
        emptyState(error, null, null)
      ) : reports === null ? (
        <div aria-busy="true" className="flex flex-col gap-3" aria-label="Loading reports">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      ) : (
        <>
          {/* Study plans are built from many reports, so the generator lives
              here; the saved plans themselves live on Study plans. */}
          <StudyPlanGenerator
            aside={
              <NextLink
                className="text-sm font-semibold text-link hover:underline"
                href="/study-plans"
              >
                {plansError || plans === null
                  ? "View study plans"
                  : `View study plans (${plans.length})`}
              </NextLink>
            }
            reports={reports}
            onSaved={(summary) =>
              setPlans((current) => [
                summary,
                ...(current ?? []).filter((plan) => plan.id !== summary.id),
              ])
            }
          />

          <section aria-label="Practice reports" className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                aria-label="Search reports"
                className="md:flex-1"
                classNames={{ inputWrapper: "h-11 rounded-sm border border-line bg-white shadow-none md:h-10" }}
                isClearable
                placeholder="Search title, person, role or scenario"
                startContent={<Search aria-hidden className="text-muted" size={16} />}
                value={searchDraft}
                onClear={() => setSearchDraft("")}
                onValueChange={setSearchDraft}
              />
              <div className="flex gap-2">
                <button
                  aria-controls="report-filters"
                  aria-expanded={panelOpen}
                  className={clsx(
                    "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border bg-white px-3.5 text-[13px] font-semibold text-ink transition-colors duration-150 ease-out hover:border-true-blue/50 md:h-10 md:flex-none",
                    chips.length > 0 ? "border-true-blue" : "border-line",
                  )}
                  type="button"
                  onClick={() => setPanelOpen((open) => !open)}
                >
                  <SlidersHorizontal aria-hidden size={16} strokeWidth={1.5} />
                  Filters
                  {chips.length > 0 && <span className="text-muted">{chips.length}</span>}
                  <ChevronDown
                    aria-hidden
                    className={clsx("transition-transform duration-200", panelOpen && "rotate-180")}
                    size={16}
                  />
                </button>
                <SelectField
                  aria-label="Sort reports"
                  className="h-11 rounded-lg border border-line bg-white pl-2.5 text-[13px] font-semibold text-ink md:h-10"
                  value={filters.sort}
                  onChange={(event) => updateFilters({ sort: event.target.value as ReportSort })}
                >
                  {SORTS.map((sort) => (
                    <option key={sort.id} value={sort.id}>
                      {sort.label}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
              {TYPE_FILTERS.filter(
                (f) => f.id === "all" || f.id === filters.type || typeCounts[f.id] > 0,
              ).map((tab) => {
                const on = filters.type === tab.id;
                return (
                  <button
                    key={tab.id}
                    aria-pressed={on}
                    className={clsx(
                      "h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-out",
                      on
                        ? "border-cwru-blue bg-cwru-blue text-white"
                        : "border-line bg-white text-ink hover:border-true-blue/50",
                    )}
                    type="button"
                    onClick={() => updateFilters({ type: tab.id })}
                  >
                    {tab.label} <span className={on ? "text-white/80" : "text-muted"}>{typeCounts[tab.id]}</span>
                  </button>
                );
              })}
            </div>

            {panelOpen && (
              <div
                aria-label="More filters"
                className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-white p-4 lg:grid-cols-4"
                id="report-filters"
                role="group"
              >
                <FilterField label="From">
                  <input
                    className={clsx(FIELD_CLASS, "pr-3")}
                    max={filters.to ?? undefined}
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(event) => updateFilters({ from: event.target.value || null })}
                  />
                </FilterField>
                <FilterField label="To">
                  <input
                    className={clsx(FIELD_CLASS, "pr-3")}
                    min={filters.from ?? undefined}
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(event) => updateFilters({ to: event.target.value || null })}
                  />
                </FilterField>
                <div className="col-span-2 flex flex-col gap-1.5 text-[13px] font-semibold text-ink lg:col-span-1">
                  Quick dates
                  <div className="flex gap-2">
                    {[7, 30].map((days) => (
                      <button
                        key={days}
                        className="h-11 flex-1 rounded-lg border border-line bg-white px-2.5 font-semibold text-ink transition-colors duration-150 ease-out hover:border-true-blue/50 md:h-10"
                        type="button"
                        onClick={() => updateFilters({ from: localDay(days), to: null })}
                      >
                        Last {days} days
                      </button>
                    ))}
                  </div>
                </div>
                <FilterField className="col-span-2 lg:col-span-1" label="Study plan">
                  <SelectField
                    className={FIELD_CLASS}
                    value={filters.plan ?? ""}
                    onChange={(event) =>
                      updateFilters({ plan: (event.target.value || null) as PlanFilter | null })
                    }
                  >
                    <option value="">Any</option>
                    {PLAN_FILTERS.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.label}
                      </option>
                    ))}
                  </SelectField>
                </FilterField>
                {SCORE_CATEGORIES.map((category) => (
                  <FilterField key={category.key} label={`${category.label} score`}>
                    <SelectField
                      className={FIELD_CLASS}
                      value={filters.bands[category.key] ?? ""}
                      onChange={(event) => {
                        const { [category.key as ScoreCategory]: _removed, ...rest } = filters.bands;
                        const band = event.target.value as ScoreBand | "";
                        updateFilters({ bands: band ? { ...rest, [category.key]: band } : rest });
                      }}
                    >
                      <option value="">Any</option>
                      {SCORE_BANDS.map((band) => (
                        <option key={band.id} value={band.id}>
                          {band.label}
                        </option>
                      ))}
                    </SelectField>
                  </FilterField>
                ))}
              </div>
            )}

            {reports.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                <span aria-live="polite" className="font-semibold text-ink" data-testid="report-count">
                  {hasActiveFilters
                    ? `${filteredReports.length} of ${reports.length} reports`
                    : `${reports.length} ${reports.length === 1 ? "report" : "reports"}`}
                </span>
                {chips.map((chip) => (
                  <button
                    key={chip.id}
                    aria-label={`Remove filter: ${chip.label}`}
                    className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-light-blue/32 py-1 pl-2.5 pr-2 font-semibold text-ink transition-colors duration-150 ease-out hover:bg-light-blue/60"
                    type="button"
                    onClick={() => updateFilters(chip.clear)}
                  >
                    {chip.label}
                    <X aria-hidden size={14} />
                  </button>
                ))}
                {hasActiveFilters && (
                  <button
                    className="font-semibold text-link hover:underline"
                    type="button"
                    onClick={() => updateFilters({ ...NO_FILTERS, sort: filters.sort })}
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {reports.length === 0 ? (
              emptyState(
                "You haven't finished a practice session yet.",
                "Start a practice interaction and your report will show up here.",
                <Button color="primary" onPress={() => router.push("/")}>
                  Start practicing
                </Button>,
              )
            ) : filteredReports.length === 0 ? (
              emptyState(
                filters.q.trim() ? `Nothing matches “${filters.q.trim()}”.` : "No reports match these filters.",
                "Try removing a filter or widening the dates.",
                <Button
                  variant="bordered"
                  onPress={() => updateFilters({ ...NO_FILTERS, sort: filters.sort })}
                >
                  Clear all filters
                </Button>,
              )
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-line bg-white">
                  <div className="hidden items-center gap-4 border-b border-line px-5 py-2.5 text-[13px] font-semibold text-muted md:flex">
                    <span className="flex-1">Session</span>
                    <span className="w-[136px]">Content</span>
                    <span className="w-[136px]">Behavioral</span>
                    <span className="w-[18px]" />
                  </div>
                  <ul className="divide-y divide-line">
                    {visibleReports.map((report) => {
                      const status = STATUS_WORD[report.status];
                      const date = reportWhen(report);
                      const title = titles.get(report.id) ?? "";
                      const withWhom = interviewerName(report);
                      const typeLabel = typeLabelForReport(report.typeSlug);
                      // Say each fact once: a title that gained a time still needs its
                      // date here, and one that gained a date needs nothing more.
                      const titleWasExtended =
                        title !==
                        displayReportTitle({
                          title: report.title,
                          typeSlug: report.typeSlug,
                          input: report.input,
                        });
                      const whenLabel = !titleWasExtended
                        ? formatReportWhen(date)
                        : title.includes(formatTitleDate(new Date(date)))
                          ? null
                          : formatTitleDate(new Date(date));
                      const meta = [
                        title.startsWith(typeLabel) ? null : typeLabel,
                        whenLabel,
                        withWhom && !title.includes(withWhom) ? `With ${withWhom}` : null,
                        status,
                        plannedIds.has(report.id) ? "In a study plan" : null,
                      ].filter(Boolean);
                      return (
                        <li key={report.id}>
                          <NextLink
                            className="flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 ease-out hover:bg-canvas focus-visible:-outline-offset-3 md:flex-row md:items-center md:gap-4"
                            href={routes.report(report.id)}
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="line-clamp-2 text-[15px] font-semibold text-ink">{title}</span>
                              <span className="text-[13px] text-muted">{meta.join(" · ")}</span>
                            </span>
                            <span className="flex flex-wrap gap-x-4 gap-y-1.5 md:contents">
                              <ScoreBadge label="Content" score={scoreOf(report, "content")} />
                              <ScoreBadge label="Behavioral" score={scoreOf(report, "behavioral")} />
                            </span>
                            <ChevronRight aria-hidden className="hidden shrink-0 text-muted md:block" size={18} strokeWidth={1.5} />
                          </NextLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="flex items-center justify-between gap-4 text-[13px] text-muted">
                  <span>
                    Showing {visibleReports.length} of {filteredReports.length}
                  </span>
                  {visibleReports.length < filteredReports.length && (
                    <Button
                      className="h-10 rounded-lg border-cwru-blue font-semibold text-cwru-blue"
                      variant="bordered"
                      onPress={() => setDrawn({ forQuery: query, count: visibleCount + PAGE_SIZE })}
                    >
                      Show {Math.min(PAGE_SIZE, filteredReports.length - visibleReports.length)} more
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function MyReportsRoute() {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="flex flex-col gap-3" aria-label="Loading reports">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      }
    >
      <MyReportsPage />
    </Suspense>
  );
}
