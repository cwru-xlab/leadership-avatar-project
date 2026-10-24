"use client";

/**
 * `/study-plans` — the student's saved study plans in one place (Phase 23).
 *
 * Lists every saved plan (GET /api/study-plans) with its date, source-session
 * count, summary and path progress, and links each to its own
 * `/study-plans/{planId}` page. New plans are created with the SAME
 * picker/preview/save flow `/reports` uses (`StudyPlanGenerator`), which
 * needs the student's finished reports, so those are fetched here too.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { ChevronRight, Footprints, Sparkles } from "lucide-react";

import type { ReportDTO } from "@/lib/report/dto";
import StudyPlanGenerator from "@/components/study-plan/StudyPlanGenerator";
import { ProgressRing } from "@/components/study-plan/PathVisuals";
import { isStepDone, KIND_LABEL, continueTargetFor } from "@/components/study-plan/PathPanel";
import { usePlansWithPaths, type PlanWithPath } from "@/components/study-plan/usePlansWithPaths";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function PathStatus({ item }: { item: PlanWithPath }) {
  if (item.path === undefined) {
    return <div className="h-14 w-40 animate-pulse rounded-xl bg-[#eef3f5]" />;
  }
  if (item.pathError) {
    return <p className="text-xs text-danger-700">{item.pathError}</p>;
  }
  if (item.path === null) {
    return (
      <Chip size="sm" variant="flat" className="bg-[#fff4e0] text-[#8a5a00]">
        No path yet
      </Chip>
    );
  }
  const total = item.path.steps.length;
  const done = item.path.steps.filter(isStepDone).length;
  const target = continueTargetFor(item.path);
  return (
    <div className="flex items-center gap-3">
      <ProgressRing done={done} total={total} size={52} stroke={6} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-[#102331]">
          {done >= total ? "Path complete" : `${done} of ${total} steps done`}
        </p>
        {target && done < total ? (
          <p className="text-xs text-[#58727f]">
            Next: {KIND_LABEL[target.step.kind]} — {target.step.competencyLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function StudyPlansPage() {
  const router = useRouter();
  const { state, addPlan } = usePlansWithPaths();
  const [reports, setReports] = useState<ReportDTO[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/practice/reports", { cache: "no-store", credentials: "include" });
        if (response.status === 401) return;
        const data = (await response.json().catch(() => ({}))) as { reports?: ReportDTO[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !data.reports) {
          setReportsError(data.error || "We couldn't load your reports.");
          return;
        }
        setReports(data.reports);
      } catch {
        if (!cancelled) setReportsError("We couldn't load your reports.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          Study Plans
        </h1>
        <p className="mt-2 text-sm text-[#58727f]">
          Plans built from your interview feedback. Each one can grow its own improvement path.
        </p>

        {state.status === "needs-login" ? (
          <div className="mt-8 rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
            <p className="font-serif text-2xl text-[#102331]">Please sign in to view your study plans.</p>
            <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-8">
              {reportsError ? (
                <p className="text-sm text-danger-700">{reportsError}</p>
              ) : reports === null ? (
                <div className="h-28 animate-pulse rounded-2xl border border-[#e3ebee] bg-white" />
              ) : (
                <StudyPlanGenerator reports={reports} onSaved={addPlan} />
              )}
            </div>

            <section className="mt-10" aria-label="Saved study plans">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Saved history</p>
              <h2 className="mt-1 font-serif text-2xl text-[#102331]">Your study plans</h2>

              {state.status === "loading" ? (
                <div className="mt-6 flex justify-center">
                  <Spinner color="current" />
                </div>
              ) : state.status === "error" ? (
                <p className="mt-3 text-sm text-danger-700">{state.message}</p>
              ) : state.items.length === 0 ? (
                <p className="mt-3 text-sm text-[#58727f]">
                  Saved study plans will appear here after you review and save one.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {state.items.map((item) => (
                    <li
                      key={item.plan.id}
                      className="rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(20,58,75,0.06)] sm:p-6"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/study-plans/${item.plan.id}`}
                            className="font-serif text-xl text-[#102331] hover:text-[#0a7391]"
                          >
                            {item.plan.title}
                          </Link>
                          <p className="mt-1 text-sm text-[#58727f]">
                            Saved {formatDate(item.plan.savedAt)} · {item.plan.sourceReportCount}{" "}
                            {item.plan.sourceReportCount === 1 ? "session" : "sessions"} analyzed
                          </p>
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#385463]">
                            {item.plan.summary}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.plan.priorityThemes.map((theme) => (
                              <Chip key={theme.priority} size="sm" variant="flat">
                                {theme.priority}. {theme.theme}
                              </Chip>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-3 md:w-60 md:items-end">
                          <PathStatus item={item} />
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            <Button
                              as={Link}
                              href={`/paths?plan=${item.plan.id}`}
                              size="sm"
                              color="primary"
                              variant={item.path === null ? "solid" : "flat"}
                              startContent={<Footprints size={14} />}
                            >
                              {item.path === null ? "Generate path" : "Open path"}
                            </Button>
                            <Button
                              as={Link}
                              href={`/study-plans/${item.plan.id}`}
                              size="sm"
                              variant="light"
                              endContent={<ChevronRight size={14} />}
                            >
                              View plan
                            </Button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
