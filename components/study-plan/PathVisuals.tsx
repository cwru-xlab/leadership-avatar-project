"use client";

/**
 * Presentational atoms for the study-plan, path and mastery surfaces: a
 * progress ring, a per-competency level badge and skill shield, and the
 * daily/weekly goal rings.
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
import clsx from "clsx";
import { CalendarCheck, Check, Goal } from "lucide-react";

import { levelDotClass } from "@/components/report/LevelChip";
import { competencyIcon } from "@/components/study-plan/competency-icons";
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

/** A circular progress indicator: `done` of `total`, label in the middle unless children replace it. */
export function ProgressRing({
  done,
  total,
  size = 64,
  stroke = 7,
  label,
  tone = "light",
  children,
}: {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
  label?: string;
  /** "dark" draws white on a CWRU Blue band. */
  tone?: "light" | "dark";
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const finished = total > 0 && done >= total;
  const inner = size - stroke * 2;
  const defaultLabel = `${done}/${total}`;
  // Tabular digits run ~0.6em wide; leave 3px of air either side.
  const defaultLabelSize = Math.min(14, Math.floor((inner - 6) / (defaultLabel.length * 0.6)));
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${done} of ${total} steps complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          className={tone === "dark" ? "stroke-white/20" : "stroke-light-blue/45"}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={clsx(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            tone === "dark" ? "stroke-white" : finished ? "stroke-level-4" : "stroke-true-blue",
          )}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          strokeLinecap="round"
          strokeWidth={stroke}
        />
      </svg>
      <span
        className={clsx(
          "absolute inset-0 flex items-center justify-center font-bold tabular-nums",
          tone === "dark" ? "text-white" : "text-ink",
        )}
        // The default label sizes itself to the ring's inner diameter, so
        // "10/10" in a 44px ring stays inside the stroke instead of over it.
        style={children ? undefined : { fontSize: defaultLabelSize }}
      >
        {children ??
          (finished ? (
            <Check aria-hidden className={tone === "dark" ? "text-white" : "text-level-4"} size={Math.round(inner * 0.5)} strokeWidth={3} />
          ) : (
            defaultLabel
          ))}
      </span>
    </div>
  );
}

function levelNumber(level: LevelResult): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, level.level ?? 1)) as 1 | 2 | 3 | 4 | 5;
}

/**
 * How far the recent-form figure sits between this level's floor and the next
 * level, so a small gain from one path step is visible even when the level
 * itself does not change.
 */
function LevelProgress({ level, wide = false }: { level: LevelResult; wide?: boolean }) {
  const { percent, levelFloorPercent, nextLevelAtPercent } = level;
  if (percent === null || levelFloorPercent === null || nextLevelAtPercent === null) return null;
  const span = nextLevelAtPercent - levelFloorPercent;
  const fill = span > 0 ? Math.min(1, Math.max(0, (percent - levelFloorPercent) / span)) : 0;
  const toGo = Math.max(0, Math.ceil((nextLevelAtPercent - percent) * 10) / 10);
  return (
    <span className={clsx("inline-flex items-center gap-2 font-normal text-muted", wide && "w-full flex-col items-stretch gap-1.5")}>
      <span
        className={clsx("block overflow-hidden rounded-full bg-light-blue/40", wide ? "h-2 w-full" : "h-1.5 w-10")}
        role="progressbar"
        aria-label={`Progress to level ${(level.level ?? 0) + 1}`}
        aria-valuemin={levelFloorPercent}
        aria-valuemax={nextLevelAtPercent}
        aria-valuenow={percent}
      >
        <span className="block h-full rounded-full bg-true-blue" style={{ width: `${Math.round(fill * 100)}%` }} />
      </span>
      <span className="text-xs">
        {toGo} pts to Lv {(level.level ?? 0) + 1}
      </span>
    </span>
  );
}

/** Full-width progress toward the next level, for cards that already show the level. */
export function LevelProgressBar({ level }: { level: LevelResult | undefined }) {
  if (!level || level.level === null) return null;
  return <LevelProgress level={level} wide />;
}

/** "Lv 3 · Competent" pill with progress to the next level, from a pre-computed LevelResult. */
export function LevelBadge({ level }: { level: LevelResult | undefined }) {
  if (!level) return null;
  if (level.level === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold text-muted">
        {level.name}
      </span>
    );
  }
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold text-ink"
      title={
        level.nextLevelAtPercent !== null
          ? `Next level at ${level.nextLevelAtPercent}% recent form`
          : "Top level"
      }
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas py-0.5 pl-1 pr-2">
        <span
          className={clsx(
            "grid size-[18px] place-items-center rounded-full text-[11px] font-bold",
            levelDotClass(levelNumber(level)),
            level.level === 2 || level.level === 3 ? "text-ink" : "text-white",
          )}
        >
          {level.level}
        </span>
        {level.name}
        {level.provisional ? <span className="font-normal text-muted">· provisional</span> : null}
      </span>
      <LevelProgress level={level} />
    </span>
  );
}

// Written out so Tailwind generates each class.
const LEVEL_STROKE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "stroke-copper",
  2: "stroke-level-2",
  3: "stroke-light-blue",
  4: "stroke-level-4",
  5: "stroke-level-5",
};

/**
 * A competency's shield: its icon on CWRU Blue, rimmed and pipped in its
 * level color. Unmeasured skills get an outlined shield and no pip.
 */
export function SkillShield({
  competencyKey,
  level,
  size = 56,
}: {
  competencyKey: string;
  level: LevelResult | undefined;
  size?: number;
}) {
  const Icon = competencyIcon(competencyKey);
  const measured = Boolean(level && level.level !== null);
  const n = level ? levelNumber(level) : 1;
  const rim = measured ? LEVEL_STROKE[n] : "stroke-light-blue";
  return (
    <span
      aria-hidden
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size * 1.1 }}
    >
      <svg className="absolute inset-0" height={size * 1.1} viewBox="0 0 64 70" width={size}>
        <path
          className={measured ? "fill-cwru-blue" : "fill-white stroke-light-blue"}
          d="M32 2 60 12v22c0 18-12 28-28 34C16 62 4 52 4 34V12z"
          strokeWidth={measured ? 0 : 2}
        />
        {measured && (
          <path className={rim} d="M32 7 55 15.5V34c0 15-10 23.5-23 28.5C19 57.5 9 49 9 34V15.5z" fill="none" strokeWidth="3" />
        )}
      </svg>
      <Icon
        className={clsx("relative -mt-1", measured ? "text-white" : "text-cwru-blue")}
        size={Math.round(size * 0.38)}
        strokeWidth={1.75}
      />
      {measured && (
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-1 grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-xs font-bold shadow-[0_0_0_3px_white]",
            levelDotClass(n),
            n === 2 || n === 3 ? "text-ink" : "text-white",
          )}
        >
          {n}
        </span>
      )}
    </span>
  );
}

/** One skill as a shield, its name, and its progress to the next level. */
export function SkillLevelRow({
  competencyKey,
  label,
  level,
}: {
  competencyKey: string;
  label: string;
  level: LevelResult | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <SkillShield competencyKey={competencyKey} level={level} size={40} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13.5px] font-bold text-ink">{label}</span>
        {level && level.level !== null ? (
          <>
            <LevelProgress level={level} wide />
            <span className="text-xs text-muted">{level.name}</span>
          </>
        ) : (
          <span className="text-xs text-muted">Not yet measured</span>
        )}
      </div>
    </div>
  );
}

function GoalRing({
  icon,
  label,
  completed,
  target,
  met,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  completed: number;
  target: number;
  met: boolean;
  tone: "light" | "dark";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <ProgressRing
        done={Math.min(completed, target)}
        label={`${label}: ${completed} of ${target}${met ? ", goal met" : ""}`}
        size={52}
        stroke={6}
        tone={tone}
        total={target}
      >
        {icon}
      </ProgressRing>
      <span className="flex flex-col leading-tight">
        <span className={clsx("text-[13px]", tone === "dark" ? "text-light-blue" : "text-muted")}>{label}</span>
        <span className={clsx("text-[15px] font-bold", tone === "dark" ? "text-white" : "text-ink")}>
          {met ? `Goal met · ${completed}` : `${completed} of ${target}`}
        </span>
      </span>
    </div>
  );
}

/** Daily + weekly activity goals, exactly as `/api/mastery` reports them. */
export function GoalsStrip({
  goals,
  timeZone,
  tone = "light",
}: {
  goals: GoalProgress;
  timeZone?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-3"
      title={`Every activity that feeds your mastery counts toward these goals.${timeZone ? ` Times shown for ${timeZone}.` : ""}`}
    >
      <GoalRing
        completed={goals.daily.completed}
        icon={<CalendarCheck aria-hidden size={20} strokeWidth={1.75} />}
        label="Today"
        met={goals.daily.met}
        target={goals.daily.target}
        tone={tone}
      />
      <GoalRing
        completed={goals.weekly.completed}
        icon={<Goal aria-hidden size={20} strokeWidth={1.75} />}
        label="This week"
        met={goals.weekly.met}
        target={goals.weekly.target}
        tone={tone}
      />
    </div>
  );
}
