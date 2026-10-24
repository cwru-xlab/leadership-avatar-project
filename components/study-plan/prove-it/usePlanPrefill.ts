"use client";

/**
 * OPTIONAL prove-it prefill for the practice pages (Phase 23,
 * lib/study-plan/prove-it.ts).
 *
 * INERT unless the URL carries BOTH `fromPlan` and `step`: then it fetches
 * `/api/study-plans/path-steps/{step}/prove-it` once and exposes the server's
 * prefill + brief, and `linkReport` posts the launched session's reportId so
 * the path step can complete when that report is READY. With either param
 * absent it makes no request, holds no data, and `linkReport` is a no-op — the
 * practice page then behaves exactly as before.
 *
 * Reads `window.location.search` in an effect (not useSearchParams) so the
 * practice pages need no Suspense boundary change.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProveItInfo } from "@/lib/study-plan/prove-it";

export interface PlanPrefillState {
  /** True only when both params are present. */
  active: boolean;
  /** False until the params were read (and, when active, the fetch settled). */
  resolved: boolean;
  info: ProveItInfo | null;
  linkReport: (reportId: string) => void;
}

export function readPlanPrefillParams(search: string): { planId: string; stepId: string } | null {
  const params = new URLSearchParams(search);
  const planId = params.get("fromPlan");
  const stepId = params.get("step");
  return planId && stepId ? { planId, stepId } : null;
}

export function usePlanPrefill(): PlanPrefillState {
  const [active, setActive] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [info, setInfo] = useState<ProveItInfo | null>(null);
  const stepRef = useRef<string | null>(null);

  useEffect(() => {
    const parsed = readPlanPrefillParams(window.location.search);
    if (!parsed) {
      setResolved(true);
      return;
    }
    setActive(true);
    stepRef.current = parsed.stepId;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/study-plans/path-steps/${encodeURIComponent(parsed.stepId)}/prove-it`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as { proveIt?: ProveItInfo };
        if (!cancelled && res.ok && data.proveIt && data.proveIt.planId === parsed.planId) {
          setInfo(data.proveIt);
        }
      } catch {
        // A failed prefill degrades to the normal, empty wizard.
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const linkReport = useCallback(
    (reportId: string) => {
      const stepId = stepRef.current;
      if (!info || !stepId || !reportId) return;
      void fetch(`/api/study-plans/path-steps/${encodeURIComponent(stepId)}/prove-it`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      }).catch(() => {
        // The session itself is unaffected; the step simply stays open.
      });
    },
    [info],
  );

  return { active, resolved, info, linkReport };
}
