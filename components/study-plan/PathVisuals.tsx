"use client";

/**
 * Small presentational atoms for the path hub (Phase 23): a progress ring,
 * a per-competency level badge and the daily/weekly goal strip.
 *
 * PRESENTATION ONLY. Levels and goals arrive pre-computed from
 * `/api/mastery` (lib/mastery/levels.ts, lib/study-plan/goals.ts); nothing
 * here derives a level from a percentage or counts activities itself.
 *
 * Deliberately limited to the two progression mechanics 21-CONTEXT.md
 * selected — levels per skill and daily/weekly goals. There is no day-chain
 * counter and no gating of any kind (21-CONTEXT.md: "streaks and unlocking.
 * Not selected. Do not add them.").
 */
import { useEffect, useState } from "react";
import { CalendarCheck, Circle, CircleCheck, Target } from "lucide-react";

import type { LevelResult } from "@/lib/mastery/levels";
import type { GoalProgress } from "@/lib/study-plan/goals";

export type LevelsByCompetency = Record<string, { current: LevelResult; lifetime: LevelResult }>;

export interface PathMasteryData {
  levels: LevelsByCompetency;
  /** competencyKey -> display label, from the mastery DTO. */
  labels: Record<string, string>;
  goals: GoalProgress;
  timeZone: string;
}

/**
 * Reads levels and goals from the existing `/api/mastery` route (same
 * browser time-zone header the Mastery page sends). Best-effort: a failure
 * returns null and the path still renders, just without badges/goals.
 */
export function usePathMastery(): PathMasteryData | null {
  const [data, setData] = useState<PathMasteryData | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const browserTimeZone =
          typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
        const response = await fetch("/api/mastery", {
          cache: "no-store",
          credentials: "include",
          headers: browserTimeZone ? { "x-timezone": browserTimeZone } : undefined,
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as
          | (Partial<PathMasteryData> & {
              mastery?: { competencies?: Array<{ competencyKey: string; label: string }> };
            })
          | null;
        if (!cancelled && body?.levels && body.goals) {
          const labels: Record<string, string> = {};
          for (const c of body.mastery?.competencies ?? []) labels[c.competencyKey] = c.label;
          setData({ levels: body.levels, labels, goals: body.goals, timeZone: body.timeZone ?? "" });
        }
      } catch {
        // Best-effort only — see doc comment.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

/** A circular progress indicator: `done` of `total`, label in the middle. */
export function ProgressRing({
  done,
  total,
  size = 64,
  stroke = 7,
  label,
}: {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const finished = total > 0 && done >= total;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${done} of ${total} steps complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e3ecf0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={finished ? "#1f8a5b" : "#0a7391"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#102331]">
        {done}/{total}
      </span>
    </div>
  );
}

/** "Lv 3 · Competent" pill, from a pre-computed LevelResult. */
export function LevelBadge({ level }: { level: LevelResult | undefined }) {
  if (!level) return null;
  if (level.level === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-[#dce8ed] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#8298a3]">
        {level.name}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#e6f4f8] px-2 py-0.5 text-[11px] font-semibold text-[#0a7391]"
      title={
        level.nextLevelAtPercent !== null
          ? `Next level at ${level.nextLevelAtPercent}% recent form`
          : "Top level"
      }
    >
      <span className="rounded-full bg-[#0a7391] px-1.5 text-[10px] font-bold text-white">
        Lv {level.level}
      </span>
      {level.name}
      {level.provisional ? <span className="font-normal text-[#58727f]">· provisional</span> : null}
    </span>
  );
}

function GoalMeter({
  icon,
  label,
  completed,
  target,
  met,
}: {
  icon: React.ReactNode;
  label: string;
  completed: number;
  target: number;
  met: boolean;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-[#102331]">
          {icon}
          {label}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-[#58727f]">
          {met ? (
            <CircleCheck size={14} className="text-[#1f8a5b]" aria-hidden="true" />
          ) : (
            <Circle size={14} className="text-[#b7c7cd]" aria-hidden="true" />
          )}
          {completed} of {target}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e3ecf0]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${met ? "bg-[#1f8a5b]" : "bg-[#0a7391]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Daily + weekly activity goals, exactly as `/api/mastery` reports them. */
export function GoalsStrip({ goals, timeZone }: { goals: GoalProgress; timeZone?: string }) {
  return (
    <div className="rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
        <GoalMeter
          icon={<Target size={16} className="text-[#0a7391]" aria-hidden="true" />}
          label="Today's goal"
          completed={goals.daily.completed}
          target={goals.daily.target}
          met={goals.daily.met}
        />
        <GoalMeter
          icon={<CalendarCheck size={16} className="text-[#0a7391]" aria-hidden="true" />}
          label="This week's goal"
          completed={goals.weekly.completed}
          target={goals.weekly.target}
          met={goals.weekly.met}
        />
      </div>
      <p className="mt-3 text-xs text-[#8298a3]">
        Every activity that feeds your mastery counts toward these goals.
        {timeZone ? ` Times shown for ${timeZone}.` : ""}
      </p>
    </div>
  );
}
