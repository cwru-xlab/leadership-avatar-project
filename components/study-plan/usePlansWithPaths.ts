"use client";

/**
 * Loads the signed-in student's saved study plans (GET /api/study-plans)
 * and each plan's path (GET /api/study-plans/{planId}/path) in parallel.
 *
 * Uses only the existing routes, so auth and ownership scoping are exactly
 * theirs. A plan whose path fetch fails keeps its own `pathError` and never
 * blocks the rest of the list.
 */
import { useCallback, useEffect, useState } from "react";

import type { StudyPlanSummaryDTO } from "@/lib/study-plan/plan-dto";
import type { PathViewDTO } from "@/components/study-plan/PathPanel";

export interface PlanWithPath {
  plan: StudyPlanSummaryDTO;
  /** undefined = still loading, null = plan has no path yet. */
  path: PathViewDTO | null | undefined;
  pathError: string | null;
}

export type PlansState =
  | { status: "loading" }
  | { status: "needs-login" }
  | { status: "error"; message: string }
  | { status: "loaded"; items: PlanWithPath[] };

async function fetchPath(planId: string): Promise<{ path: PathViewDTO | null; error: string | null }> {
  try {
    const response = await fetch(`/api/study-plans/${planId}/path`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = (await response.json().catch(() => ({}))) as {
      path?: PathViewDTO | null;
      error?: string;
    };
    if (!response.ok) return { path: null, error: data.error || "We couldn't load this plan's path." };
    return { path: data.path ?? null, error: null };
  } catch {
    return { path: null, error: "We couldn't load this plan's path." };
  }
}

export function usePlansWithPaths() {
  const [state, setState] = useState<PlansState>({ status: "loading" });

  const loadPathsFor = useCallback(async (plans: StudyPlanSummaryDTO[]) => {
    await Promise.all(
      plans.map(async (plan) => {
        const { path, error } = await fetchPath(plan.id);
        setState((current) =>
          current.status !== "loaded"
            ? current
            : {
                ...current,
                items: current.items.map((item) =>
                  item.plan.id === plan.id ? { ...item, path: error ? null : path, pathError: error } : item,
                ),
              },
        );
      }),
    );
  }, []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/study-plans", { cache: "no-store", credentials: "include" });
      if (response.status === 401) {
        setState({ status: "needs-login" });
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        plans?: StudyPlanSummaryDTO[];
        error?: string;
      };
      if (!response.ok || !data.plans) {
        setState({ status: "error", message: data.error || "We couldn't load your saved plans." });
        return;
      }
      const plans = data.plans;
      setState({
        status: "loaded",
        items: plans.map((plan) => ({ plan, path: undefined, pathError: null })),
      });
      void loadPathsFor(plans);
    } catch {
      setState({ status: "error", message: "We couldn't load your saved plans." });
    }
  }, [loadPathsFor]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Records a freshly generated path against its plan. */
  const setPathFor = useCallback((planId: string, path: PathViewDTO) => {
    setState((current) =>
      current.status !== "loaded"
        ? current
        : {
            ...current,
            items: current.items.map((item) =>
              item.plan.id === planId ? { ...item, path, pathError: null } : item,
            ),
          },
    );
  }, []);

  /** Prepends a newly saved plan (no path yet). */
  const addPlan = useCallback((plan: StudyPlanSummaryDTO) => {
    setState((current) =>
      current.status !== "loaded"
        ? current
        : {
            ...current,
            items: [
              { plan, path: null, pathError: null },
              ...current.items.filter((item) => item.plan.id !== plan.id),
            ],
          },
    );
  }, []);

  return { state, reload: load, setPathFor, addPlan };
}
