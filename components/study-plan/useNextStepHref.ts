"use client";

import { useEffect, useState } from "react";

import { hrefForStep, type PathViewDTO } from "@/components/study-plan/PathPanel";

/**
 * The next path step's href, through PathPanel's own link contract
 * (`hrefForStep`), read from the plan's path DTO (`nextStep`, the server's
 * single source of truth for "what's next") after a step finishes. Null while
 * loading, when the path is finished, or when the next step has no
 * destination yet — the caller then falls back to the plan page.
 *
 * Shared by the coached summary and the voice drill result. `refreshKey`
 * re-reads the path (a drill can finish several times on one mount).
 */
export function useNextStepHref(planId: string, refreshKey: unknown = null): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/study-plans/${planId}/path`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => ({}))) as { path?: PathViewDTO | null };
        const path = data.path;
        if (!path?.nextStep) {
          if (!cancelled) setHref(null);
          return;
        }
        const row = path.steps.find((step) => step.id === path.nextStep!.stepId);
        const next = row ? hrefForStep(planId, row) : null;
        if (!cancelled) setHref(next);
      } catch {
        // The plan-page fallback is always rendered; nothing to report.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, refreshKey]);
  return href;
}
