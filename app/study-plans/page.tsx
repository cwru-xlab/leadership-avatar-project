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
import { Spinner } from "@heroui/spinner";
import { BadgeCheck, Footprints, Trophy } from "lucide-react";

import type { ReportDTO } from "@/lib/report/dto";
import StudyPlanGenerator from "@/components/study-plan/StudyPlanGenerator";
import { ProgressRing } from "@/components/study-plan/PathVisuals";
import {
  continueTargetFor,
  hrefForStep,
  isStepDone,
  KIND_ICON,
  KIND_LABEL,
} from "@/components/study-plan/PathPanel";
import { competencyIcon } from "@/components/study-plan/competency-icons";
import { usePlansWithPaths, type PlanWithPath } from "@/components/study-plan/usePlansWithPaths";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The skills a plan's path works on, in the order they first appear. */
function pathSkills(item: PlanWithPath): Array<{ key: string; label: string }> {
  const seen = new Map<string, string>();
  for (const step of item.path?.steps ?? []) {
    if (!seen.has(step.competencyKey)) seen.set(step.competencyKey, step.competencyLabel);
  }
  return [...seen].map(([key, label]) => ({ key, label }));
}

/** One plan as a card: a blue band with its progress ring, then its skills and the next step. */
function PlanCard({ item }: { item: PlanWithPath }) {
  const total = item.path ? item.path.steps.length : 0;
  const done = item.path ? item.path.steps.filter(isStepDone).length : 0;
  const finished = Boolean(item.path) && total > 0 && done >= total;
  const target = item.path ? continueTargetFor(item.path) : null;
  const targetHref = target ? hrefForStep(item.plan.id, target.step) : null;
  const NextIcon = target ? KIND_ICON[target.step.kind] : Footprints;
  const skills = pathSkills(item);

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <Link
        className={`relative flex items-center gap-4 px-5 py-[18px] text-white transition-colors duration-150 ease-out ${
          finished ? "bg-level-4 hover:bg-level-4/90" : "bg-cwru-blue hover:bg-ink"
        }`}
        href={`/study-plans/${item.plan.id}`}
      >
        <span aria-hidden className="la-dot-grid absolute inset-0 bg-transparent opacity-40" />
        {item.path === undefined ? (
          <span className="relative size-16 shrink-0 animate-pulse rounded-full bg-white/15" />
        ) : item.path ? (
          <span className="relative">
            <ProgressRing done={done} size={64} stroke={7} tone="dark" total={total}>
              {finished ? <Trophy aria-hidden size={24} strokeWidth={2} /> : undefined}
            </ProgressRing>
          </span>
        ) : (
          <span className="relative grid size-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-white/50">
            <Footprints aria-hidden size={24} />
          </span>
        )}
        <span className="relative flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 font-display text-xl font-medium leading-tight">{item.plan.title}</span>
          <span className="text-[13px] text-light-blue">
            Saved {formatDate(item.plan.savedAt)} · {item.plan.sourceReportCount}{" "}
            {item.plan.sourceReportCount === 1 ? "session" : "sessions"}
          </span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-3.5 px-5 py-4">
        {skills.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">Skills</span>
            {skills.map((skill) => {
              const Icon = competencyIcon(skill.key);
              return (
                <span
                  key={skill.key}
                  className="grid size-8 place-items-center rounded-full bg-light-blue/32 text-cwru-blue"
                  title={skill.label}
                >
                  <Icon aria-label={skill.label} size={16} strokeWidth={2} />
                </span>
              );
            })}
          </div>
        ) : (
          <p className="line-clamp-2 text-sm text-muted">
            {item.plan.priorityThemes.map((t) => t.theme).join(" · ")}
          </p>
        )}

        {item.pathError ? (
          <p className="text-xs text-copper">{item.pathError}</p>
        ) : item.path === null ? (
          <div className="mt-auto flex items-center justify-between gap-3">
            <span className="text-sm text-muted">No path yet</span>
            <Button
              as={Link}
              className="h-9 rounded-lg font-semibold"
              color="primary"
              href={`/paths?plan=${item.plan.id}`}
              startContent={<Footprints size={14} />}
            >
              Generate path
            </Button>
          </div>
        ) : finished ? (
          <Link className="mt-auto flex items-center gap-2 text-sm font-bold text-level-4" href="/mastery">
            <BadgeCheck aria-hidden size={20} strokeWidth={2} />
            Path complete · see how your mastery moved
          </Link>
        ) : target ? (
          <div className="mt-auto flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cwru-blue text-white">
              <NextIcon aria-hidden size={18} strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted">Up next · Step {target.step.position} of {total}</span>
              <span className="truncate text-sm font-bold text-ink">
                {KIND_LABEL[target.step.kind]} · {target.step.competencyLabel}
              </span>
            </span>
            <Button
              as={Link}
              className="h-9 shrink-0 rounded-lg font-semibold"
              color="primary"
              href={targetHref ?? `/paths?plan=${item.plan.id}`}
            >
              Continue
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function StudyPlansPage() {
  const router = useRouter();
  const { state, addPlan } = usePlansWithPaths();
  const [reports, setReports] = useState<ReportDTO[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [tab, setTab] = useState<"in-progress" | "completed">("in-progress");

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

  const items = state.status === "loaded" ? state.items : [];
  const isFinished = (i: PlanWithPath) =>
    Boolean(i.path) && i.path!.steps.length > 0 && i.path!.steps.every(isStepDone);
  const inProgress = items.filter((i) => !isFinished(i));
  const completed = items.filter(isFinished);
  const shown = tab === "completed" ? completed : inProgress;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
          Study plans
        </h1>
        <p className="text-[15px] text-muted">Each plan turns your feedback into a path of short steps.</p>
      </header>

      {state.status === "needs-login" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-8 text-center">
          <p className="font-display text-2xl font-medium text-cwru-blue">Please sign in to view your study plans.</p>
          <Button color="primary" onPress={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <>
          {reportsError ? (
            <p role="alert" className="text-sm text-copper">{reportsError}</p>
          ) : reports === null ? (
            <div className="h-24 animate-pulse rounded-xl border border-line bg-white" />
          ) : (
            <StudyPlanGenerator reports={reports} onSaved={addPlan} />
          )}

          <section aria-label="Saved study plans" className="flex flex-col gap-4">
            <div aria-label="Plan status" className="flex gap-7 border-b border-line" role="tablist">
              {(
                [
                  ["in-progress", "In progress", inProgress.length],
                  ["completed", "Completed", completed.length],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  aria-selected={tab === id}
                  className={`-mb-px h-11 border-b-2 text-[15px] ${
                    tab === id ? "border-true-blue font-semibold text-cwru-blue" : "border-transparent font-medium text-muted"
                  }`}
                  role="tab"
                  type="button"
                  onClick={() => setTab(id)}
                >
                  {label} <span className="font-normal text-muted">{count}</span>
                </button>
              ))}
            </div>

            {state.status === "loading" ? (
              <div className="flex justify-center py-8">
                <Spinner color="current" />
              </div>
            ) : state.status === "error" ? (
              <p role="alert" className="text-sm text-copper">{state.message}</p>
            ) : shown.length === 0 ? (
              <p className="la-hatch rounded-xl border border-line px-4 py-6 text-sm text-muted">
                {items.length === 0
                  ? "Saved study plans will appear here after you review and save one."
                  : tab === "completed"
                    ? "Finished paths will collect here."
                    : "Every plan's path is finished. Build a new plan to keep going."}
              </p>
            ) : (
              <ul className="grid gap-[18px] lg:grid-cols-2">
                {shown.map((item) => (
                  <PlanCard key={item.plan.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
