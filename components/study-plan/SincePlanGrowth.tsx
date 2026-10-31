"use client";

/**
 * Per-plan "growth since this plan was generated" card, rendered in
 * PathPanel's growthSlot (the path rail). Figures come from GET /api/mastery/since-plan —
 * this component only displays them (baseline, now, delta and tier are all
 * computed server-side by growthSincePlan / toSincePlanDTO).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { competencyIcon } from "@/components/study-plan/competency-icons";

import type { SincePlanDTO } from "@/lib/mastery/mastery-dto";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; data: SincePlanDTO };

function formatPercent(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

export default function SincePlanGrowth({ planId }: { planId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/mastery/since-plan?planId=${encodeURIComponent(planId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { sincePlan?: SincePlanDTO };
        if (!body.sincePlan) throw new Error("missing sincePlan");
        if (!cancelled) setState({ status: "loaded", data: body.sincePlan });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (state.status === "loading") {
    return <div className="h-24 animate-pulse rounded-2xl border border-line bg-white" />;
  }
  if (state.status === "error" || state.data.competencies.length === 0) return null;

  const { data } = state;
  const anyMovement = data.competencies.some((c) => c.delta !== null);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4" aria-label="Growth since this plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-medium text-cwru-blue">Growth since this plan</h3>
        <span className="text-xs text-muted">
          since {new Date(data.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
      {!anyMovement ? (
        <p className="text-sm text-muted">
          No new evidence yet. Each step you finish will show its effect on these skills here.
        </p>
      ) : (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-true-blue">How to read these</summary>
          <p className="mt-1 leading-5">
            All-time figures blend every session you have done, so they move slowly. &quot;Path work&quot; is
            how you scored on this path&apos;s own steps; &quot;Live practice since&quot; is your unaided sessions
            since the plan was generated.
          </p>
        </details>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {data.competencies.map((c) => {
          const Icon =
            c.direction === "up" ? ArrowUpRight : c.direction === "down" ? ArrowDownRight : ArrowRight;
          const SkillIcon = competencyIcon(c.competencyKey);
          const tone =
            c.direction === "up"
              ? "bg-level-4/16 text-level-4"
              : c.direction === "down"
                ? "bg-copper/12 text-copper"
                : "bg-canvas text-muted";
          return (
            <li key={c.competencyKey} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-light-blue/32 text-cwru-blue">
                <SkillIcon aria-hidden size={16} strokeWidth={1.75} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{c.label}</span>
                  {c.delta !== null ? (
                    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
                      <Icon size={13} aria-hidden />
                      {c.delta > 0 ? "+" : ""}
                      {c.delta} pts
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  All time {formatPercent(c.baseline.percent)} → {formatPercent(c.now.percent)}
                  {c.now.disclosure ? ` · ${c.now.tierLabel}` : ""}
                </p>
                {c.sinceBySource.path.percent !== null ? (
                  <p className="text-xs font-semibold text-level-4">
                    Path work: {c.sinceBySource.path.percent}% across {c.sinceBySource.path.count}{" "}
                    {c.sinceBySource.path.count === 1 ? "step result" : "step results"}
                  </p>
                ) : null}
                {c.sinceBySource.live.percent !== null ? (
                  <p className="text-xs text-ink">
                    Live practice since: {c.sinceBySource.live.percent}% across {c.sinceBySource.live.count}{" "}
                    {c.sinceBySource.live.count === 1 ? "scored moment" : "scored moments"}
                  </p>
                ) : null}
                {c.drivers.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {c.drivers.map((driver, index) => (
                      <li key={`${driver.occurredAt}-${index}`} className="text-xs text-muted">
                        {driver.href ? (
                          <Link href={driver.href} className="text-true-blue underline-offset-2 hover:underline">
                            {driver.activityLabel}
                          </Link>
                        ) : (
                          driver.activityLabel
                        )}{" "}
                        · {driver.percent}%
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
