"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { ChevronRight, Search } from "lucide-react";
import LevelChip from "@/components/report/LevelChip";

import type { ReportDTO } from "@/lib/report/dto";
import {
  displayReportTitle,
  formatReportWhen,
  typeLabelForReport,
} from "@/lib/report/title";
import type { StudyPlanSummaryDTO } from "@/lib/study-plan/plan-dto";
import { isDeckModeSlug } from "@/lib/pitch/deck-modes";
import StudyPlanGenerator, {
  INTERVIEW_TYPE_SLUGS,
  scoreOf,
} from "@/components/study-plan/StudyPlanGenerator";

type TypeFilter =
  | "all"
  | "interview"
  | "pitch"
  | "difficult-conversation"
  | "networking"
  | "case-study";

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "interview", label: "Interviews" },
  { id: "pitch", label: "Pitches" },
  { id: "difficult-conversation", label: "Courageous conversations" },
  { id: "networking", label: "Networking" },
  { id: "case-study", label: "Case studies" },
];

function matchesTypeFilter(typeSlug: string, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "interview") return INTERVIEW_TYPE_SLUGS.has(typeSlug);
  // All five deck modes (19-01's DECK_MODES table) land under the existing
  // Pitches tab alongside the elevator pitch — no new filter tab is added.
  if (filter === "pitch")
    return typeSlug === "pitch-elevator" || isDeckModeSlug(typeSlug);
  return typeSlug === filter;
}

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

export default function MyReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [plans, setPlans] = useState<StudyPlanSummaryDTO[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);

  const filteredReports = useMemo(() => {
    if (!reports) return [];
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((report) => {
      if (!matchesTypeFilter(report.typeSlug, typeFilter)) return false;
      if (!q) return true;
      const when = report.completedAt ?? report.startedAt;
      const title = displayReportTitle({
        title: report.title,
        typeSlug: report.typeSlug,
        input: report.input,
        when,
      }).toLowerCase();
      const type = typeLabelForReport(report.typeSlug).toLowerCase();
      const withName = interviewerName(report)?.toLowerCase() ?? "";
      return title.includes(q) || type.includes(q) || withName.includes(q);
    });
  }, [reports, typeFilter, searchQuery]);

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
          error?: string;
        };
        if (!response.ok || !data.reports) {
          if (!cancelled)
            setError(data.error || "We couldn't load your reports.");
          return;
        }
        if (!cancelled) {
          setReports(data.reports);
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

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(TYPE_FILTERS.map((f) => [f.id, 0])) as Record<TypeFilter, number>;
    for (const report of reports ?? []) {
      for (const filter of TYPE_FILTERS) {
        if (matchesTypeFilter(report.typeSlug, filter.id)) counts[filter.id] += 1;
      }
    }
    return counts;
  }, [reports]);

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
        <p className="text-[15px] text-muted">Every finished session, newest first.</p>
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
                className="text-sm font-semibold text-true-blue hover:underline"
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
                {TYPE_FILTERS.filter((f) => f.id === "all" || typeCounts[f.id] > 0).map((tab) => {
                  const on = typeFilter === tab.id;
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
                      onClick={() => {
                        setTypeFilter(tab.id);
                        setVisibleCount(PAGE_SIZE);
                      }}
                    >
                      {tab.label} <span className={on ? "text-white/80" : "text-muted"}>{typeCounts[tab.id]}</span>
                    </button>
                  );
                })}
              </div>
              <Input
                aria-label="Search reports"
                className="lg:max-w-[280px]"
                classNames={{ inputWrapper: "h-10 rounded-sm border border-line bg-white shadow-none" }}
                placeholder="Search reports"
                startContent={<Search aria-hidden className="text-muted" size={16} />}
                value={searchQuery}
                onValueChange={(value) => {
                  setSearchQuery(value);
                  setVisibleCount(PAGE_SIZE);
                }}
              />
            </div>

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
                "No reports match this filter.",
                null,
                <Button
                  variant="bordered"
                  onPress={() => {
                    setTypeFilter("all");
                    setSearchQuery("");
                  }}
                >
                  Clear filters
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
                      const date = report.completedAt ?? report.startedAt;
                      const title = displayReportTitle({
                        title: report.title,
                        typeSlug: report.typeSlug,
                        input: report.input,
                        when: date,
                      });
                      const withWhom = interviewerName(report);
                      return (
                        <li key={report.id}>
                          <NextLink
                            className="flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 ease-out hover:bg-canvas md:flex-row md:items-center md:gap-4"
                            href={`/practice/${report.typeSlug}/report/${report.id}`}
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-[15px] font-semibold text-ink">{title}</span>
                              <span className="text-[13px] text-muted">
                                {/* Generated titles already lead with the type. */}
                                {title.startsWith(typeLabelForReport(report.typeSlug))
                                  ? ""
                                  : `${typeLabelForReport(report.typeSlug)} · `}
                                {formatReportWhen(date)}
                                {withWhom ? ` · With ${withWhom}` : ""}
                                {status ? ` · ${status}` : ""}
                              </span>
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
                      onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
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
