"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { BookOpenCheck, ChevronRight, Sparkles } from "lucide-react";

import type { InterviewReportDTO } from "@/lib/interview/report-dto";
import type { StudyPlanDTO, StudyPlanSummaryDTO } from "@/lib/study-plan/plan-dto";
import type { StudyPlanContent } from "@/lib/study-plan/types";

const TYPE_LABELS: Record<string, string> = {
  general: "General Interview",
};

function typeLabel(typeSlug: string): string {
  return (
    TYPE_LABELS[typeSlug] ??
    typeSlug
      .split(/[-_]/)
      .filter(Boolean)
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(" ")
  );
}

const STATUS_CHIP: Record<
  InterviewReportDTO["status"],
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
        <span className="text-[11px] uppercase tracking-wide text-[#8298a3]">{label}</span>
        <span className="text-sm font-medium text-[#8298a3]">Not yet measured</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-[#8298a3]">{label}</span>
      <span className="text-sm font-semibold text-[#102331]">
        {score}/5 <span className="font-normal text-[#526c7b]">{SCORE_LABELS[score] ?? ""}</span>
      </span>
    </div>
  );
}

function PlanContent({ content }: { content: StudyPlanContent }) {
  return (
    <div className="space-y-7 text-sm text-[#385463]">
      <section>
        <h3 className="font-serif text-xl text-[#102331]">Strengths to leverage</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {content.strengthsToLeverage.map((strength) => (
            <div key={strength.theme} className="rounded-xl border border-[#dce8ed] bg-[#f8fbfc] p-4">
              <p className="font-semibold text-[#102331]">{strength.theme}</p>
              <p className="mt-1 leading-6">{strength.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-serif text-xl text-[#102331]">Practice priorities</h3>
        <div className="mt-3 space-y-4">
          {content.priorityThemes.map((theme) => (
            <article key={theme.priority} className="rounded-xl border border-[#dce8ed] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a7391] text-xs font-bold text-white">
                  {theme.priority}
                </span>
                <div>
                  <h4 className="font-semibold text-[#102331]">{theme.theme}</h4>
                  <p className="mt-1 leading-6">{theme.whyItMatters}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">Targeted exercises</p>
                  <ul className="mt-2 space-y-3">
                    {theme.practiceExercises.map((exercise) => (
                      <li key={exercise.title}>
                        <p className="font-medium text-[#102331]">
                          {exercise.title} <span className="font-normal text-[#58727f]">· {exercise.estimatedMinutes} min</span>
                        </p>
                        <p className="mt-1 leading-6">{exercise.instructions}</p>
                        <p className="mt-1 text-xs leading-5 text-[#58727f]">Ready when: {exercise.successCriteria}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">Readiness checks</p>
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
        <h3 className="font-serif text-xl text-[#102331]">Useful resources</h3>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {content.resources.map((resource) => (
            <li key={resource.title} className="rounded-xl border border-[#dce8ed] p-4">
              {resource.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#006b87] underline underline-offset-2"
                >
                  {resource.title}
                </a>
              ) : (
                <p className="font-semibold text-[#102331]">{resource.title}</p>
              )}
              <p className="mt-1 leading-6">{resource.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#b9dbe5] bg-[#eaf7fa] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">Next practice focus</p>
        <p className="mt-2 font-medium leading-6 text-[#173847]">{content.nextPracticeFocus}</p>
      </section>
    </div>
  );
}

export default function MyReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<InterviewReportDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [plans, setPlans] = useState<StudyPlanSummaryDTO[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [viewedPlan, setViewedPlan] = useState<StudyPlanDTO | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const eligibleReportCount = useMemo(
    () => reports?.filter((report) => report.status === "READY" && Boolean(report.reportMarkdown?.trim())).length ?? 0,
    [reports]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/interview/reports", {
          cache: "no-store",
          credentials: "include",
        });
        if (response.status === 401) {
          if (!cancelled) setNeedsLogin(true);
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          reports?: InterviewReportDTO[];
          error?: string;
        };
        if (!response.ok || !data.reports) {
          if (!cancelled) setError(data.error || "We couldn't load your reports.");
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
          if (!cancelled) setPlansError(data.error || "We couldn't load your saved plans.");
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
      const data = (await response.json().catch(() => ({}))) as Partial<GeneratedPreview> & {
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.content || !data.draftToken || !data.sourceReportCount) {
        setActionError(
          data.code === "NO_COMPLETED_REPORTS"
            ? "Finish at least one interview with feedback before generating a study plan."
            : data.error || "We couldn't generate your study plan. Please try again."
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
      const data = (await response.json().catch(() => ({}))) as { plan?: StudyPlanDTO; error?: string };
      if (!response.ok || !data.plan) {
        setActionError(data.error || "We couldn't save this study plan. Please try again.");
        return;
      }
      const summary: StudyPlanSummaryDTO = {
        id: data.plan.id,
        title: data.plan.title,
        sourceReportCount: data.plan.sourceReportCount,
        savedAt: data.plan.savedAt,
        priorityThemes: data.plan.priorityThemes,
      };
      setPlans((current) => [summary, ...(current ?? []).filter((plan) => plan.id !== summary.id)]);
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
      const data = (await response.json().catch(() => ({}))) as { plan?: StudyPlanDTO; error?: string };
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
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">My Reports</h1>
        <p className="mt-2 text-sm text-[#58727f]">Every practice interview you&apos;ve finished, newest first.</p>

        <div className="mt-8">
          {needsLogin ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">Please sign in to view your reports.</p>
              <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>Go to sign in</Button>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">{error}</p>
            </div>
          ) : reports === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-[#e3ebee] bg-white" />)}
            </div>
          ) : (
            <>
              <Card className="border border-[#badbe5] bg-[linear-gradient(135deg,#ecf9fc,#ffffff)] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
                <CardBody className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0a7391] text-white"><BookOpenCheck size={22} /></div>
                    <div>
                      <h2 className="font-serif text-2xl text-[#102331]">Build a self-paced study plan</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#58727f]">
                        We&apos;ll identify recurring feedback themes from your completed interview reports and turn them into focused practice.
                      </p>
                      {eligibleReportCount < 1 && (
                        <p className="mt-2 text-sm font-medium text-[#58727f]">Finish an interview with feedback to unlock your study plan.</p>
                      )}
                    </div>
                  </div>
                  <Button color="primary" size="lg" isDisabled={eligibleReportCount < 1 || generating} onPress={generatePlan}>
                    {generating ? <><Spinner color="current" size="sm" /> Creating plan</> : "Generate study plan"}
                  </Button>
                </CardBody>
              </Card>

              {actionError && <p role="alert" className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{actionError}</p>}
              {savedNotice && <p role="status" className="mt-4 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700">{savedNotice}</p>}

              {preview && (
                <section className="mt-6 rounded-2xl border-2 border-[#0a7391] bg-white p-5 shadow-[0_16px_40px_rgba(20,58,75,0.12)] sm:p-7">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Preview — not saved yet</p>
                      <h2 className="mt-2 font-serif text-3xl text-[#102331]">{preview.content.title}</h2>
                      <p className="mt-2 max-w-3xl leading-7 text-[#385463]">{preview.content.summary}</p>
                      <p className="mt-2 text-xs text-[#58727f]">Based on {preview.sourceReportCount} completed {preview.sourceReportCount === 1 ? "report" : "reports"}.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="flat" onPress={() => setPreview(null)}>Discard</Button>
                      <Button color="primary" isDisabled={saving} onPress={savePlan}>{saving ? "Saving…" : "Save plan"}</Button>
                    </div>
                  </div>
                  <div className="mt-7"><PlanContent content={preview.content} /></div>
                </section>
              )}

              <section className="mt-10">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Saved history</p>
                    <h2 className="mt-1 font-serif text-2xl text-[#102331]">Your study plans</h2>
                  </div>
                </div>
                {plansError ? (
                  <p className="mt-3 text-sm text-danger-700">{plansError}</p>
                ) : plans === null ? (
                  <div className="mt-4 h-20 animate-pulse rounded-2xl border border-[#e3ebee] bg-white" />
                ) : plans.length === 0 ? (
                  <p className="mt-3 text-sm text-[#58727f]">Saved study plans will appear here after you review and save one.</p>
                ) : (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {plans.map((plan) => (
                      <Card key={plan.id} className="border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
                        <CardBody className="p-5">
                          <p className="font-serif text-xl text-[#102331]">{plan.title}</p>
                          <p className="mt-1 text-sm text-[#58727f]">Saved {formatDate(plan.savedAt)} · {plan.sourceReportCount} reports analyzed</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {plan.priorityThemes.map((theme) => <Chip key={theme.priority} size="sm" variant="flat">{theme.priority}. {theme.theme}</Chip>)}
                          </div>
                          <Button className="mt-4 self-start" variant="light" endContent={<ChevronRight size={16} />} onPress={() => viewPlan(plan.id)}>View plan</Button>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              {viewedPlan && (
                <section className="mt-6 rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(20,58,75,0.06)] sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Saved study plan</p>
                      <h2 className="mt-2 font-serif text-3xl text-[#102331]">{viewedPlan.title}</h2>
                      <p className="mt-1 text-sm text-[#58727f]">Saved {formatDate(viewedPlan.savedAt)} · {viewedPlan.sourceReportCount} reports analyzed</p>
                    </div>
                    <Button variant="light" onPress={() => setViewedPlan(null)}>Close</Button>
                  </div>
                  <p className="mt-4 max-w-3xl leading-7 text-[#385463]">{viewedPlan.content.summary}</p>
                  <div className="mt-7"><PlanContent content={viewedPlan.content} /></div>
                </section>
              )}

              <section className="mt-10">
                <h2 className="font-serif text-2xl text-[#102331]">Interview reports</h2>
                {reports.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
                    <p className="font-serif text-2xl text-[#102331]">You haven&apos;t finished a practice session yet.</p>
                    <p className="mt-2 text-sm text-[#58727f]">Start a practice interview and your report will show up here.</p>
                    <Button className="mt-5" color="primary" onPress={() => router.push("/")}>Go to dashboard</Button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {reports.map((report) => {
                      const chip = STATUS_CHIP[report.status];
                      const date = report.completedAt ?? report.startedAt;
                      return (
                        <Card key={report.id} isPressable className="w-full border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]" onPress={() => router.push(`/interview/${report.typeSlug}/report/${report.id}`)}>
                          <CardBody className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2"><span className="font-serif text-lg text-[#102331]">{typeLabel(report.typeSlug)}</span><Chip size="sm" color={chip.color} variant="flat">{chip.label}</Chip></div>
                              <p className="text-sm text-[#58727f]">{report.interviewerName ? `With ${report.interviewerName}` : "—"}{" · "}{formatDate(date)}</p>
                            </div>
                            <div className="flex gap-6"><ScoreBadge label="Content" score={report.scores.content} /><ScoreBadge label="Behavioral" score={report.scores.behavioral} /></div>
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
