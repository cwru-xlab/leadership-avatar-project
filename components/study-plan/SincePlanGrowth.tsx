"use client";

/**
 * Per-plan "growth since this plan was generated" strip, rendered in
 * PathPanel's growthSlot. Figures come from GET /api/mastery/since-plan —
 * this component only displays them (baseline, now, delta and tier are all
 * computed server-side by growthSincePlan / toSincePlanDTO).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

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
    return <div className="h-20 animate-pulse rounded-xl border border-[#e3ebee] bg-[#f5f8fa]" />;
  }
  if (state.status === "error" || state.data.competencies.length === 0) return null;

  const { data } = state;
  const anyMovement = data.competencies.some((c) => c.delta !== null);

  return (
    <section className="rounded-xl border border-[#d4e2e9] bg-[#f5f8fa] p-4" aria-label="Growth since this plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#0a7391]">
          Growth since this plan
        </h3>
        <span className="text-xs text-[#58727f]">
          since {new Date(data.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
      {!anyMovement ? (
        <p className="mt-2 text-sm text-[#58727f]">
          No new evidence yet. Each step you finish below will show its effect on these skills here.
        </p>
      ) : null}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.competencies.map((c) => {
          const Icon =
            c.direction === "up" ? ArrowUpRight : c.direction === "down" ? ArrowDownRight : ArrowRight;
          const tone =
            c.direction === "up"
              ? "text-[#1a7f4b]"
              : c.direction === "down"
                ? "text-[#b4471f]"
                : "text-[#58727f]";
          const driver = c.drivers[0];
          return (
            <li key={c.competencyKey} className="rounded-lg border border-[#e3ebee] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#102331]">{c.label}</span>
                {c.delta !== null ? (
                  <span className={`flex items-center gap-1 text-sm font-bold ${tone}`}>
                    <Icon size={14} aria-hidden />
                    {c.delta > 0 ? "+" : ""}
                    {c.delta} pts
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[#58727f]">
                {formatPercent(c.baseline.percent)} → {formatPercent(c.now.percent)}
                {c.now.disclosure ? ` · ${c.now.tierLabel}` : ""}
              </p>
              {driver?.href ? (
                <Link href={driver.href} className="mt-1 block text-xs text-[#0a7391] underline-offset-2 hover:underline">
                  Moved by: {driver.activityLabel}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
