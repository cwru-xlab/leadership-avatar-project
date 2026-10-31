"use client";

/**
 * "Generate path" call-to-action for a study plan that has no path yet.
 *
 * Calls the EXISTING `POST /api/study-plans/{planId}/path` route — no new
 * generation logic lives here. That route makes several model calls and
 * routinely takes 10-60 seconds, so while it runs this card shows an elapsed
 * timer and the stages the route actually goes through (in order, advanced
 * on a timer — they describe the work, they are not a real progress feed).
 *
 * A 409 means a path already exists (double click, second tab): the existing
 * path is fetched and handed back instead of showing an error, matching the
 * saved-plan page's original behaviour.
 */
import { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Footprints, LoaderCircle, RotateCcw } from "lucide-react";

import type { PathViewDTO } from "@/components/study-plan/PathPanel";

const STAGES: Array<{ afterSeconds: number; text: string }> = [
  { afterSeconds: 0, text: "Reading the sessions this plan was built from" },
  { afterSeconds: 5, text: "Ranking your competencies, weakest first" },
  { afterSeconds: 12, text: "Finding real moments from your transcripts" },
  { afterSeconds: 20, text: "Writing knowledge checks from those moments" },
  { afterSeconds: 35, text: "Placing coached practice where it will help most" },
  { afterSeconds: 50, text: "Almost there — saving your path" },
];

export default function GeneratePathCard({
  planId,
  planTitle,
  onGenerated,
}: {
  planId: string;
  planTitle?: string;
  onGenerated: (path: PathViewDTO, degradedStepCount: number) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  async function fetchExisting(): Promise<boolean> {
    const response = await fetch(`/api/study-plans/${planId}/path`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = (await response.json().catch(() => ({}))) as { path?: PathViewDTO | null };
    if (response.ok && data.path) {
      onGenerated(data.path, 0);
      return true;
    }
    return false;
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/study-plans/${planId}/path`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 409) {
        if (!(await fetchExisting())) setError("We couldn't load this plan's path.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        path?: PathViewDTO;
        degradedSteps?: Array<{ position: number; competencyKey: string }>;
        error?: string;
      };
      if (!response.ok || !data.path) {
        setError(data.error || "We couldn't generate a path for this plan.");
        return;
      }
      onGenerated(data.path, data.degradedSteps?.length ?? 0);
    } catch {
      setError("We couldn't generate a path for this plan. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  const stageIndex = STAGES.reduce((acc, stage, i) => (elapsed >= stage.afterSeconds ? i : acc), 0);

  return (
    <div className="la-map-dots rounded-2xl border-2 border-dashed border-light-blue bg-white p-5 sm:p-7">
      {generating ? (
        <div aria-live="polite">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-6 w-6 shrink-0 animate-spin text-link" aria-hidden="true" />
            <div>
              <p className="font-display font-medium text-xl text-ink">Building your path…</p>
              <p className="text-xs text-muted">
                This usually takes 10–60 seconds. {elapsed}s elapsed — you can keep this page open.
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full w-1/3 animate-[pathbar_1.6s_ease-in-out_infinite] rounded-full bg-true-blue" />
          </div>
          <ol className="mt-4 space-y-1.5">
            {STAGES.map((stage, i) => (
              <li
                key={stage.text}
                className={`flex items-center gap-2 text-sm ${
                  i < stageIndex
                    ? "text-level-4"
                    : i === stageIndex
                      ? "font-semibold text-ink"
                      : "text-muted"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    i < stageIndex ? "bg-level-4" : i === stageIndex ? "bg-true-blue" : "bg-line"
                  }`}
                />
                {stage.text}
              </li>
            ))}
          </ol>
          <style>{`@keyframes pathbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-true-blue text-white">
              <Footprints size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="font-display font-medium text-xl text-ink">
                {planTitle ? `No path yet for “${planTitle}”` : "This plan doesn't have a path yet"}
              </p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                We&apos;ll turn this plan into 5–10 focused steps — knowledge checks, coached practice
                and live sessions — aimed at your weakest competencies first.
              </p>
            </div>
          </div>
          <Button color="primary" size="lg" className="shrink-0" onPress={generate}>
            Generate path
          </Button>
        </div>
      )}
      {error && !generating ? (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-xl border border-copper/40 bg-copper/[0.06] p-4 text-sm text-copper-deep sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            startContent={<RotateCcw size={14} />}
            onPress={generate}
          >
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
