"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { ChevronRight, FileText, History, Search } from "lucide-react";

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

const STATUS_CHIP: Record<
  ReportDTO["status"],
  { label: string; color: "success" | "warning" | "danger" | "default" }
> = {
  READY: { label: "Ready", color: "success" },
  PENDING: { label: "Pending", color: "warning" },
  FAILED: { label: "Failed", color: "danger" },
  IN_PROGRESS: { label: "In progress", color: "default" },
};

const SCORE_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Strong",
  3: "Solid",
  2: "Developing",
  1: "Needs work",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScoreBadge({ label, score }: { label: string; score: number | null }) {
  if (score === null) {
    return (
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-[#5d6d7d]">
          {label}
        </span>
        <span className="text-sm font-medium text-[#5d6d7d]">
          Not yet measured
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-[#5d6d7d]">
        {label}
      </span>
      <span className="text-sm font-semibold text-[#10243f]">
        {score}/5{" "}
        <span className="font-normal text-[#52657a]">
          {SCORE_LABELS[score] ?? ""}
        </span>
      </span>
    </div>
  );
}

export default function MyReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
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

  /** quick-006: a saved plan now has its own URL route
   * (`/study-plans/{planId}`) — "View plan" navigates there instead of
   * fetching into local state and folding open inline on this page. */
  function viewPlan(planId: string) {
    router.push(`/study-plans/${planId}`);
  }

  return (
    <main className="min-h-[100dvh] bg-[#f3f5f7] text-[#10243f]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <header className="border-l-4 border-[#003087] pl-5 sm:pl-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#003087]">
            <History aria-hidden="true" size={15} />
            Leadership Avatar Practice
          </div>
          <h1 className="mt-3 font-serif text-4xl tracking-[-0.035em] text-[#10243f] sm:text-5xl">
            My Reports
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#43546a] sm:text-base">
            Every finished practice session — interviews, pitches,
            conversations, and networking — newest first.
          </p>
        </header>

        <div className="mt-8">
          {needsLogin ? (
            <div className="rounded-2xl border border-[#c7d2df] bg-white p-8 text-center shadow-[0_18px_42px_rgba(0,48,135,0.12)]">
              <p className="font-serif text-2xl text-[#10243f]">
                Please sign in to view your reports.
              </p>
              <Button
                className="mt-5"
                color="primary"
                onPress={() => router.push("/login")}
              >
                Go to sign in
              </Button>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#c7d2df] bg-white p-8 text-center shadow-[0_18px_42px_rgba(0,48,135,0.12)]">
              <p className="font-serif text-2xl text-[#10243f]">{error}</p>
            </div>
          ) : reports === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl border border-[#dce3eb] bg-white motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : (
            <>
              <StudyPlanGenerator
                reports={reports}
                onSaved={(summary) =>
                  setPlans((current) => [
                    summary,
                    ...(current ?? []).filter((plan) => plan.id !== summary.id),
                  ])
                }
              />

              <section className="mt-12 border-t border-[#c7d2df] pt-8">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#003087]">
                      Saved history
                    </p>
                    <h2 className="mt-1 font-serif text-3xl text-[#10243f]">
                      Your study plans
                    </h2>
                  </div>
                </div>
                {plansError ? (
                  <p className="mt-3 text-sm text-danger-700">{plansError}</p>
                ) : plans === null ? (
                  <div className="mt-4 h-20 animate-pulse rounded-2xl border border-[#dce3eb] bg-white motion-reduce:animate-none" />
                ) : plans.length === 0 ? (
                  <p className="mt-3 text-sm text-[#43546a]">
                    Saved study plans will appear here after you review and save
                    one.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {plans.map((plan) => (
                      <Card
                        key={plan.id}
                        className="border border-[#c7d2df] border-t-4 border-t-[#c99600] bg-white shadow-[0_8px_22px_rgba(16,36,63,0.08)] transition-[border-color,box-shadow] duration-200 hover:border-x-[#9aabc0] hover:border-b-[#9aabc0] hover:shadow-[0_12px_28px_rgba(16,36,63,0.12)] motion-reduce:transition-none"
                      >
                        <CardBody className="p-5 sm:p-6">
                          <p className="font-serif text-xl text-[#10243f]">
                            {plan.title}
                          </p>
                          <p className="mt-1 text-sm text-[#43546a]">
                            Saved {formatDate(plan.savedAt)} ·{" "}
                            {plan.sourceReportCount} reports analyzed
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {plan.priorityThemes.map((theme) => (
                              <Chip
                                key={theme.priority}
                                size="sm"
                                variant="flat"
                              >
                                {theme.priority}. {theme.theme}
                              </Chip>
                            ))}
                          </div>
                          <Button
                            className="mt-4 self-start"
                            variant="light"
                            endContent={<ChevronRight size={16} />}
                            onPress={() => viewPlan(plan.id)}
                          >
                            View plan
                          </Button>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              <section className="mt-12 border-t border-[#c7d2df] pt-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#003087]">
                      <FileText aria-hidden="true" size={14} /> Session archive
                    </div>
                    <h2 className="mt-2 font-serif text-3xl text-[#10243f]">
                      Practice reports
                    </h2>
                    <p className="mt-1 text-sm text-[#43546a]">
                      Filter by type or search by the name you saved at the end
                      of a session.
                    </p>
                  </div>
                  <Input
                    aria-label="Search reports"
                    placeholder="Search by name or type…"
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    startContent={
                      <Search size={16} className="text-[#5d6d7d]" />
                    }
                    className="max-w-sm"
                    classNames={{
                      inputWrapper:
                        "border border-[#aebccc] bg-white shadow-sm group-data-[focus=true]:border-[#003087] group-data-[focus=true]:ring-2 group-data-[focus=true]:ring-[#003087]/25",
                    }}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TYPE_FILTERS.map((tab) => (
                    <Button
                      key={tab.id}
                      size="sm"
                      variant={typeFilter === tab.id ? "solid" : "flat"}
                      color={typeFilter === tab.id ? "primary" : "default"}
                      onPress={() => setTypeFilter(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
                {reports.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-[#c7d2df] bg-white p-8 text-center shadow-[0_18px_42px_rgba(0,48,135,0.12)]">
                    <p className="font-serif text-2xl text-[#10243f]">
                      You haven&apos;t finished a practice session yet.
                    </p>
                    <p className="mt-2 text-sm text-[#43546a]">
                      Start a practice interaction and your report will show up
                      here.
                    </p>
                    <Button
                      className="mt-5"
                      color="primary"
                      onPress={() => router.push("/")}
                    >
                      Go to dashboard
                    </Button>
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-[#c7d2df] bg-white p-8 text-center shadow-[0_18px_42px_rgba(0,48,135,0.12)]">
                    <p className="font-serif text-xl text-[#10243f]">
                      No reports match this filter.
                    </p>
                    <Button
                      className="mt-4"
                      variant="flat"
                      onPress={() => {
                        setTypeFilter("all");
                        setSearchQuery("");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {filteredReports.map((report) => {
                      const chip = STATUS_CHIP[report.status];
                      const date = report.completedAt ?? report.startedAt;
                      const title = displayReportTitle({
                        title: report.title,
                        typeSlug: report.typeSlug,
                        input: report.input,
                        when: date,
                      });
                      const withWhom = interviewerName(report);
                      return (
                        <Card
                          key={report.id}
                          isPressable
                          className="w-full border border-[#c7d2df] border-l-4 border-l-[#003087] bg-white text-left shadow-[0_8px_22px_rgba(16,36,63,0.08)] transition-[border-color,box-shadow,translate] duration-200 hover:border-y-[#8ea4bf] hover:border-r-[#8ea4bf] hover:shadow-[0_12px_28px_rgba(16,36,63,0.12)] active:translate-y-px data-[focus-visible=true]:outline data-[focus-visible=true]:outline-3 data-[focus-visible=true]:outline-offset-2 data-[focus-visible=true]:outline-[#003087] motion-reduce:active:translate-y-0 motion-reduce:transition-none"
                          onPress={() =>
                            router.push(
                              `/practice/${report.typeSlug}/report/${report.id}`,
                            )
                          }
                        >
                          <CardBody className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-serif text-lg text-[#10243f]">
                                  {title}
                                </span>
                                <Chip
                                  size="sm"
                                  color={chip.color}
                                  variant="flat"
                                >
                                  {chip.label}
                                </Chip>
                                <Chip size="sm" variant="bordered">
                                  {typeLabelForReport(report.typeSlug)}
                                </Chip>
                              </div>
                              <p className="text-sm text-[#43546a]">
                                {formatReportWhen(date)}
                                {withWhom ? ` · With ${withWhom}` : ""}
                              </p>
                            </div>
                            <div className="flex gap-6">
                              <ScoreBadge
                                label="Content"
                                score={scoreOf(report, "content")}
                              />
                              <ScoreBadge
                                label="Behavioral"
                                score={scoreOf(report, "behavioral")}
                              />
                            </div>
                          </CardBody>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
