"use client";

/**
 * A saved study plan's own URL route (quick-006). Previously a saved plan
 * rendered inline on `/reports` by setting `viewedPlan` state after a
 * client-side fetch; that inline block (title, saved date, source-report
 * count, summary, `PlanContent`, and the path + generate-path action) lives
 * here. The page leads with a hero (path progress ring and the one Continue)
 * and a strip of the path's steps that opens the full PathPanel map on
 * `/paths`. `/reports`'s "View plan" button now navigates here instead of
 * fetching into local state.
 *
 * Follows the same auth/loading/error conventions as its path-step
 * children, `app/study-plans/[planId]/checks/[checkId]/page.tsx` and
 * `app/study-plans/[planId]/coached/[stepId]/page.tsx`: a client fetch, a
 * 401 renders a "go sign in" prompt, a 404 renders a "not available"
 * message with a way back — no automatic redirect.
 *
 * Path fetch/generation keeps its own isolated loading/error state, exactly
 * as it did on `/reports` — a path fetch failure sets `pathError` only and
 * never blocks the plan content rendered above it.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, Check, Footprints, Play, Trophy } from "lucide-react";

import type { StudyPlanDTO } from "@/lib/study-plan/plan-dto";
import PlanContent from "@/components/study-plan/PlanContent";
// The full PathPanel map lives on /paths; this page links each step into it
// through PathPanel's own link contract.
import {
  continueTargetFor,
  DegradedStepsNote,
  hrefForStep,
  isStepDone,
  KIND_ICON,
  KIND_LABEL,
  type PathViewDTO,
} from "@/components/study-plan/PathPanel";
import GeneratePathCard from "@/components/study-plan/GeneratePathCard";
import RebuildPathNotice from "@/components/study-plan/RebuildPathNotice";
import { ProgressRing } from "@/components/study-plan/PathVisuals";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function StudyPlanPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const planId = params.planId;

  const [needsLogin, setNeedsLogin] = useState(false);
  const [notFound, setNotFoundState] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<StudyPlanDTO | null>(null);

  // Path panel state — isolated from the plan-fetch state above, same as
  // the inline block this replaces: a path fetch failure sets `pathError`
  // only and never touches `loadError`.
  const [path, setPath] = useState<PathViewDTO | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [degradedStepCount, setDegradedStepCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/study-plans/${planId}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (response.status === 401) {
          if (!cancelled) setNeedsLogin(true);
          return;
        }
        if (response.status === 404) {
          if (!cancelled) setNotFoundState(true);
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          plan?: StudyPlanDTO;
          error?: string;
        };
        if (!response.ok || !data.plan) {
          if (!cancelled) setLoadError(data.error || "We couldn't load this study plan.");
          return;
        }
        if (!cancelled) setPlan(data.plan);
      } catch {
        if (!cancelled) setLoadError("We couldn't load this study plan.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // Fetches the path once the plan has loaded successfully.
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    void (async () => {
      setPathLoading(true);
      setPathError(null);
      try {
        const response = await fetch(`/api/study-plans/${planId}/path`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as {
          path?: PathViewDTO | null;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setPathError(data.error || "We couldn't load this plan's path.");
          return;
        }
        setPath(data.path ?? null);
      } catch {
        if (!cancelled) setPathError("We couldn't load this plan's path.");
      } finally {
        if (!cancelled) setPathLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `plan` (not plan.id) is intentional here — this effect should run once
    // the plan object itself resolves, mirroring the original effect's
    // dependency on `viewedPlan`.
  }, [plan, planId]);

  if (needsLogin) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-ink">Sign in to view this study plan.</p>
        <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-ink">This study plan is not available.</p>
        <Button as={Link} href="/study-plans" className="mt-5" color="primary">
          Back to study plans
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p role="alert" className="text-copper">{loadError}</p>
        <Button as={Link} href="/study-plans" className="mt-5" variant="light">
          Back to study plans
        </Button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  const total = path ? path.steps.length : 0;
  const done = path ? path.steps.filter(isStepDone).length : 0;
  const finished = Boolean(path) && total > 0 && done >= total;
  const target = path ? continueTargetFor(path) : null;
  const targetHref = target ? hrefForStep(plan.id, target.step) : null;
  const orderedSteps = path ? path.steps.slice().sort((a, b) => a.position - b.position) : [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-true-blue hover:text-cwru-blue"
        href="/study-plans"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Study plans
      </Link>

      <header
        className={`relative flex flex-wrap items-center gap-x-6 gap-y-4 overflow-hidden rounded-2xl px-6 py-6 text-white md:px-7 ${
          finished ? "bg-level-4" : "bg-cwru-blue"
        }`}
      >
        <span aria-hidden className="la-dots absolute inset-0 opacity-50" />
        <span className="relative">
          {path ? (
            <ProgressRing done={done} size={108} stroke={11} tone="dark" total={total}>
              {finished ? (
                <Trophy aria-hidden size={36} strokeWidth={1.75} />
              ) : (
                <span className="flex flex-col items-center leading-none">
                  <span className="font-display text-[28px] font-medium">
                    {done}/{total}
                  </span>
                  <span className="mt-1 text-[11px] font-normal text-light-blue">steps done</span>
                </span>
              )}
            </ProgressRing>
          ) : (
            <span className="grid size-[108px] place-items-center rounded-full border-2 border-dashed border-white/50">
              <Footprints aria-hidden size={36} strokeWidth={1.75} />
            </span>
          )}
        </span>
        <div className="relative flex min-w-[240px] flex-1 flex-col gap-2">
          <h1 className="max-w-[28ch] font-display text-[26px] font-medium leading-[1.12] md:text-[30px]">{plan.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-light-blue">
            Built from {plan.sourceReportCount} {plan.sourceReportCount === 1 ? "report" : "reports"} · Saved{" "}
            {formatDate(plan.savedAt)}
            <span className="rounded-sm bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">AI plan</span>
          </p>
        </div>
        {target && targetHref && !finished ? (
          <Link
            className="relative inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-bold text-cwru-blue shadow-[0_4px_0_rgb(166_210_230/0.8)] transition-transform active:translate-y-0.5"
            href={targetHref}
          >
            <Play aria-hidden size={16} strokeWidth={2.5} />
            Continue step {target.step.position}
          </Link>
        ) : finished ? (
          <Link
            className="relative inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-bold text-level-4"
            href="/mastery"
          >
            See your mastery
          </Link>
        ) : null}
      </header>

      {/* The path lives inside the study plan that owns it (REQ-120/REQ-122),
          fetched in its own effect above with its own loading/error state.
          The full map is on /paths; here it is a strip of its steps. A fetch
          failure never blocks the plan content below. */}
      {pathLoading ? (
        <div className="h-12 animate-pulse rounded-full bg-white" />
      ) : pathError ? (
        <p role="alert" className="text-sm text-copper">{pathError}</p>
      ) : path ? (
        <div className="flex flex-col gap-2">
          {path.rebuildable ? (
            <RebuildPathNotice
              planId={plan.id}
              onRebuilt={(rebuilt, degraded) => {
                setPath(rebuilt);
                setDegradedStepCount(degraded);
              }}
            />
          ) : null}
          <Link
            aria-label={`Open this plan's path: ${done} of ${total} steps complete`}
            className="group flex items-center rounded-full px-1 py-2 hover:bg-white"
            href={`/paths?plan=${plan.id}`}
          >
            {orderedSteps.map((step, index) => {
              const Icon = step.proveIt ? Trophy : KIND_ICON[step.kind];
              const isDone = isStepDone(step);
              const isNext = target?.step.id === step.id;
              const last = index === orderedSteps.length - 1;
              return (
                <span key={step.id} className={`flex items-center ${last ? "" : "flex-1"}`}>
                  <span
                    className={`grid shrink-0 place-items-center rounded-full ${step.proveIt ? "size-8 sm:size-11" : "size-[26px] sm:size-9"} ${
                      isDone
                        ? "bg-level-4 text-white"
                        : isNext
                          ? "bg-cwru-blue text-white shadow-[0_0_0_3px_rgb(166_210_230/0.55)] sm:shadow-[0_0_0_5px_rgb(166_210_230/0.55)]"
                          : "border-2 border-light-blue bg-white text-cwru-blue"
                    }`}
                    title={`Step ${step.position}: ${KIND_LABEL[step.kind]}, ${step.competencyLabel}`}
                  >
                    {isDone ? (
                      <Check aria-hidden className="size-3.5 sm:size-4" strokeWidth={3} />
                    ) : (
                      <Icon aria-hidden className={step.proveIt ? "size-4 sm:size-5" : "size-3.5 sm:size-4"} strokeWidth={2} />
                    )}
                  </span>
                  {!last && <span className={`h-[3px] min-w-1 flex-1 ${isDone ? "bg-level-4" : "bg-light-blue/70"}`} />}
                </span>
              );
            })}
          </Link>
          <DegradedStepsNote count={degradedStepCount} />
        </div>
      ) : (
        <GeneratePathCard
          planId={plan.id}
          onGenerated={(generated, degraded) => {
            setPath(generated);
            setDegradedStepCount(degraded);
          }}
        />
      )}

      <PlanSummary text={plan.content.summary} />

      <PlanContent content={plan.content} />
    </div>
  );
}

/** First two sentences up front; the rest one click away. */
function PlanSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  const lead = sentences.slice(0, 2).join("").trim();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="max-w-[64ch] text-[17px] leading-[1.55] text-ink">{expanded ? text : lead}</p>
      {sentences.length > 2 && (
        <button
          className="w-fit text-sm font-semibold text-true-blue hover:underline"
          type="button"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Read the full summary"}
        </button>
      )}
    </div>
  );
}
