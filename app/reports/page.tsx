"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import {
  BookOpenCheck,
  ChevronRight,
  FileText,
  History,
  Search,
} from "lucide-react";

import type { ReportDTO } from "@/lib/report/dto";
import {
  displayReportTitle,
  formatReportWhen,
  typeLabelForReport,
} from "@/lib/report/title";
import type {
  StudyPlanDTO,
  StudyPlanSummaryDTO,
} from "@/lib/study-plan/plan-dto";
import type { StudyPlanContent } from "@/lib/study-plan/types";
import { isDeckModeSlug } from "@/lib/pitch/deck-modes";

/** Study-plan generation still uses interview feedback only. */
const INTERVIEW_TYPE_SLUGS = new Set([
  "general",
  "technical",
  "consulting",
  "early-career",
]);

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

function scoreOf(report: ReportDTO, key: string): number | null {
  const value = report.scores?.[key];
  return typeof value === "number" ? value : null;
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

interface GeneratedPreview {
  content: StudyPlanContent;
  draftToken: string;
  sourceReportCount: number;
}

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

function PlanContent({ content }: { content: StudyPlanContent }) {
  return (
    <div className="space-y-7 text-sm text-[#33465d]">
      <section>
        <h3 className="font-serif text-xl text-[#10243f]">
          Strengths to leverage
        </h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {content.strengthsToLeverage.map((strength) => (
            <div
              key={strength.theme}
              className="rounded-xl border border-[#d7dfe8] bg-[#f7f9fb] p-4"
            >
              <p className="font-semibold text-[#10243f]">{strength.theme}</p>
              <p className="mt-1 leading-6">{strength.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-serif text-xl text-[#10243f]">
          Practice priorities
        </h3>
        <div className="mt-3 space-y-4">
          {content.priorityThemes.map((theme) => (
            <article
              key={theme.priority}
              className="rounded-xl border border-[#d7dfe8] p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003087] text-xs font-bold text-white">
                  {theme.priority}
                </span>
                <div>
                  <h4 className="font-semibold text-[#10243f]">
                    {theme.theme}
                  </h4>
                  <p className="mt-1 leading-6">{theme.whyItMatters}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#003087]">
                    Targeted exercises
                  </p>
                  <ul className="mt-2 space-y-3">
                    {theme.practiceExercises.map((exercise) => (
                      <li key={exercise.title}>
                        <p className="font-medium text-[#10243f]">
                          {exercise.title}{" "}
                          <span className="font-normal text-[#43546a]">
                            · {exercise.estimatedMinutes} min
                          </span>
                        </p>
                        <p className="mt-1 leading-6">
                          {exercise.instructions}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#43546a]">
                          Ready when: {exercise.successCriteria}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#003087]">
                    Readiness checks
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-5 leading-6">
                    {theme.readinessChecks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-serif text-xl text-[#10243f]">Useful resources</h3>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {content.resources.map((resource) => (
            <li
              key={resource.title}
              className="rounded-xl border border-[#d7dfe8] p-4"
            >
              {resource.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#003087] underline underline-offset-2"
                >
                  {resource.title}
                </a>
              ) : (
                <p className="font-semibold text-[#10243f]">{resource.title}</p>
              )}
              <p className="mt-1 leading-6">{resource.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#b7c9de] bg-[#edf2f8] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#003087]">
          Next practice focus
        </p>
        <p className="mt-2 font-medium leading-6 text-[#1d3655]">
          {content.nextPracticeFocus}
        </p>
      </section>
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
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [viewedPlan, setViewedPlan] = useState<StudyPlanDTO | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const eligibleReportCount = useMemo(
    () =>
      reports?.filter(
        (report) =>
          INTERVIEW_TYPE_SLUGS.has(report.typeSlug) &&
          report.status === "READY" &&
          Boolean(report.reportMarkdown?.trim()),
      ).length ?? 0,
    [reports],
  );

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

  async function generatePlan() {
    if (generating || eligibleReportCount < 1) return;
    setGenerating(true);
    setActionError(null);
    setSavedNotice(null);
    try {
      const response = await fetch("/api/study-plans/generate", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response
        .json()
        .catch(() => ({}))) as Partial<GeneratedPreview> & {
        error?: string;
        code?: string;
      };
      if (
        !response.ok ||
        !data.content ||
        !data.draftToken ||
        !data.sourceReportCount
      ) {
        setActionError(
          data.code === "NO_COMPLETED_REPORTS"
            ? "Finish at least one interview with feedback before generating a study plan."
            : data.error ||
                "We couldn't generate your study plan. Please try again.",
        );
        return;
      }
      setPreview({
        content: data.content,
        draftToken: data.draftToken,
        sourceReportCount: data.sourceReportCount,
      });
    } catch {
      setActionError("We couldn't generate your study plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function savePlan() {
    if (!preview || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch("/api/study-plans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftToken: preview.draftToken }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        plan?: StudyPlanDTO;
        error?: string;
      };
      if (!response.ok || !data.plan) {
        setActionError(
          data.error || "We couldn't save this study plan. Please try again.",
        );
        return;
      }
      const summary: StudyPlanSummaryDTO = {
        id: data.plan.id,
        title: data.plan.title,
        sourceReportCount: data.plan.sourceReportCount,
        savedAt: data.plan.savedAt,
        priorityThemes: data.plan.priorityThemes,
      };
      setPlans((current) => [
        summary,
        ...(current ?? []).filter((plan) => plan.id !== summary.id),
      ]);
      setPreview(null);
      setViewedPlan(data.plan);
      setSavedNotice("Study plan saved to your history.");
    } catch {
      setActionError("We couldn't save this study plan. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function viewPlan(planId: string) {
    setActionError(null);
    try {
      const response = await fetch(`/api/study-plans/${planId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as {
        plan?: StudyPlanDTO;
        error?: string;
      };
      if (!response.ok || !data.plan) {
        setActionError(data.error || "We couldn't load this study plan.");
        return;
      }
      setViewedPlan(data.plan);
    } catch {
      setActionError("We couldn't load this study plan.");
    }
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
              <Card className="overflow-hidden border border-[#aabbd1] border-l-4 border-l-[#c99600] bg-white shadow-[0_8px_22px_rgba(16,36,63,0.08)]">
                <CardBody className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#003087] text-white shadow-sm">
                      <BookOpenCheck aria-hidden="true" size={22} />
                    </div>
                    <div>
                      <h2 className="font-serif text-2xl text-[#10243f]">
                        Build a self-paced study plan
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#43546a]">
                        We&apos;ll identify recurring feedback themes from your
                        completed interview reports and turn them into focused
                        practice.
                      </p>
                      {eligibleReportCount < 1 && (
                        <p className="mt-2 text-sm font-medium text-[#43546a]">
                          Finish an interview with feedback to unlock your study
                          plan.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    color="primary"
                    size="lg"
                    isDisabled={eligibleReportCount < 1 || generating}
                    onPress={generatePlan}
                  >
                    {generating ? (
                      <>
                        <Spinner color="current" size="sm" /> Creating plan
                      </>
                    ) : (
                      "Generate study plan"
                    )}
                  </Button>
                </CardBody>
              </Card>

              {actionError && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700"
                >
                  {actionError}
                </p>
              )}
              {savedNotice && (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700"
                >
                  {savedNotice}
                </p>
              )}

              {preview && (
                <section className="mt-6 rounded-2xl border-2 border-[#003087] bg-white p-5 shadow-[0_16px_36px_rgba(0,48,135,0.14)] sm:p-7">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#003087]">
                        Preview — not saved yet
                      </p>
                      <h2 className="mt-2 font-serif text-3xl text-[#10243f]">
                        {preview.content.title}
                      </h2>
                      <p className="mt-2 max-w-3xl leading-7 text-[#33465d]">
                        {preview.content.summary}
                      </p>
                      <p className="mt-2 text-xs text-[#43546a]">
                        Based on {preview.sourceReportCount} completed{" "}
                        {preview.sourceReportCount === 1 ? "report" : "reports"}
                        .
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="flat" onPress={() => setPreview(null)}>
                        Discard
                      </Button>
                      <Button
                        color="primary"
                        isDisabled={saving}
                        onPress={savePlan}
                      >
                        {saving ? "Saving…" : "Save plan"}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-7">
                    <PlanContent content={preview.content} />
                  </div>
                </section>
              )}

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

              {viewedPlan && (
                <section className="mt-6 rounded-2xl border border-[#c7d2df] bg-white p-5 shadow-[0_8px_22px_rgba(16,36,63,0.08)] sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#003087]">
                        Saved study plan
                      </p>
                      <h2 className="mt-2 font-serif text-3xl text-[#10243f]">
                        {viewedPlan.title}
                      </h2>
                      <p className="mt-1 text-sm text-[#43546a]">
                        Saved {formatDate(viewedPlan.savedAt)} ·{" "}
                        {viewedPlan.sourceReportCount} reports analyzed
                      </p>
                    </div>
                    <Button variant="light" onPress={() => setViewedPlan(null)}>
                      Close
                    </Button>
                  </div>
                  <p className="mt-4 max-w-3xl leading-7 text-[#33465d]">
                    {viewedPlan.content.summary}
                  </p>
                  <div className="mt-7">
                    <PlanContent content={viewedPlan.content} />
                  </div>
                </section>
              )}

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
