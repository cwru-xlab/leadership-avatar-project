"use client";

import NextLink from "next/link";
import { useEffect, useState } from "react";

interface UpNext {
  planId: string;
  position: number;
  total: number;
  label: string;
}

interface PlanSummary {
  id: string;
}

interface PathStep {
  id: string;
  position: number;
  competencyLabel: string;
}

interface PathResponse {
  path: { steps: PathStep[]; nextStep: { stepId: string } | null } | null;
}

/**
 * The sidebar's "Up next in your plan" card: the newest saved plan's next
 * open step. Renders nothing when there is no plan, no path, or the path is
 * finished, so the sidebar never shows an empty promise. `refreshKey`
 * (the pathname) re-reads after a student completes a step elsewhere.
 */
export function UpNextCard({
  refreshKey,
  onNavigate,
}: {
  refreshKey: string;
  onNavigate?: () => void;
}) {
  const [upNext, setUpNext] = useState<UpNext | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const plansRes = await fetch("/api/study-plans", { signal: controller.signal });
        if (!plansRes.ok) return setUpNext(null);
        const { plans } = (await plansRes.json()) as { plans: PlanSummary[] };
        const latest = plans?.[0];
        if (!latest) return setUpNext(null);

        const pathRes = await fetch(`/api/study-plans/${latest.id}/path`, {
          signal: controller.signal,
        });
        if (!pathRes.ok) return setUpNext(null);
        const { path } = (await pathRes.json()) as PathResponse;
        const step = path?.steps.find((s) => s.id === path.nextStep?.stepId);
        if (!path || !step) return setUpNext(null);

        setUpNext({
          planId: latest.id,
          position: path.steps.indexOf(step) + 1,
          total: path.steps.length,
          label: step.competencyLabel,
        });
      } catch {
        if (!controller.signal.aborted) setUpNext(null);
      }
    })();

    return () => controller.abort();
  }, [refreshKey]);

  if (!upNext) return null;

  const done = upNext.position - 1;

  return (
    <NextLink
      className="flex flex-col gap-2 rounded-xl bg-white/[0.08] p-3 text-white transition-colors duration-150 ease-out hover:bg-white/[0.12] focus-visible:outline-light-blue"
      href={`/study-plans/${upNext.planId}`}
      onClick={onNavigate}
    >
      <span className="flex items-baseline justify-between gap-2 text-xs text-light-blue">
        <span>Up next in your plan</span>
        <span className="tabular-nums">
          Step {upNext.position} of {upNext.total}
        </span>
      </span>
      <span className="text-[15px] font-semibold leading-snug">{upNext.label}</span>
      <span
        aria-hidden
        className="h-1 overflow-hidden rounded-full bg-white/[0.16]"
      >
        <span
          className="block h-full rounded-full bg-light-blue"
          style={{ width: `${(done / upNext.total) * 100}%` }}
        />
      </span>
      <span className="text-[13px] font-semibold">Continue →</span>
    </NextLink>
  );
}
