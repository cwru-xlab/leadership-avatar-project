"use client";

/**
 * The report's Statistics tab: the measured figures behind the Delivery band
 * words, in one divided panel. This is the narrative side of the split noted
 * atop `ReportScoreCards.tsx`, so raw figures are allowed here; every
 * description of a figure still comes from `lib/metrics/bands.ts`.
 *
 * Figures are shown only when they were actually measured: a typed session
 * has no voice figures and a camera-off session has no camera figures, and
 * fields an older report never stored are omitted rather than shown as zero.
 */
import clsx from "clsx";

import type { ReportScoreCardsProps } from "@/components/interview/ReportScoreCards";
import { formatTimecode, visualBands, vocalBands } from "@/lib/metrics/bands";

type Metrics = ReportScoreCardsProps["metrics"];

interface Stat {
  label: string;
  value: string;
  unit: string;
  note: string;
  /** 0-1 fill for figures with a natural scale; counts have no bar. */
  fill?: number;
  /** Target range on the same 0-1 scale, outlined over the fill so both stay visible. */
  band?: [number, number];
}

const PACE_SCALE = 220;

function measuredVocal(metrics: Metrics) {
  const vocal = metrics?.vocal;
  if (!vocal || metrics?.vocalUnscored === "TYPED_ONLY") return null;
  return (vocal.coverage?.spoken_seconds ?? 0) > 0 ? vocal : null;
}

function measuredVisual(metrics: Metrics) {
  const visual = metrics?.visual;
  if (!visual || metrics?.visualUnscored === "CAMERA_OFF_OPTOUT") return null;
  return visual;
}

function buildStats(metrics: Metrics, showInterviewPaceTarget: boolean): Stat[] {
  const stats: Stat[] = [];
  const vocal = measuredVocal(metrics);
  const visual = measuredVisual(metrics);

  if (vocal) {
    const words = Object.fromEntries(vocalBands(vocal).map((row) => [row.label, row.value]));
    const minutes = vocal.coverage.spoken_seconds / 60;
    const wpm = Math.round(vocal.words_per_minute);
    const perMinute = (count: number) => `${(count / Math.max(minutes, 1 / 60)).toFixed(1)} per minute`;
    stats.push({
      label: "Speech rate",
      value: String(wpm),
      unit: "wpm",
      fill: Math.min(1, wpm / PACE_SCALE),
      band: showInterviewPaceTarget ? [100 / PACE_SCALE, 159 / PACE_SCALE] : undefined,
      note: showInterviewPaceTarget
        ? wpm < 100
          ? "Below the interview target of 100–159 wpm"
          : wpm > 159
            ? "Above the interview target of 100–159 wpm"
            : "Inside the interview target of 100–159 wpm"
        : words.Pace,
    });
    stats.push({
      label: "Filler words",
      value: String(vocal.filler_word_count),
      unit: "total",
      note: `${perMinute(vocal.filler_word_count)}${
        vocal.filler_word_list.length ? `, mostly “${vocal.filler_word_list.slice(0, 2).join("”, “")}”` : ""
      }`,
    });
    stats.push({
      label: "Pauses",
      value: String(vocal.pause_count),
      unit: "total",
      note: perMinute(vocal.pause_count),
    });
    stats.push({
      label: "Volume consistency",
      value: String(Math.round(vocal.volume_consistency * 100)),
      unit: "%",
      fill: vocal.volume_consistency,
      note: words.Volume,
    });
  }

  if (visual) {
    const words = Object.fromEntries(visualBands(visual).map((row) => [row.label, row.value]));
    if (typeof visual.face_presence_pct === "number") {
      stats.push({
        label: "On camera",
        value: String(Math.round(visual.face_presence_pct)),
        unit: "%",
        fill: visual.face_presence_pct / 100,
        note: words["On camera"],
      });
    }
    stats.push({
      label: "Eye contact",
      value: String(Math.round(visual.eye_contact_pct)),
      unit: "%",
      fill: visual.eye_contact_pct / 100,
      note: words["Eye contact"],
    });
    stats.push({
      label: "Framing",
      value: String(Math.round(visual.camera_centered_pct)),
      unit: "%",
      fill: visual.camera_centered_pct / 100,
      note: words.Framing,
    });
  }

  if (vocal) {
    stats.push({
      label: "Speaking time",
      value: formatTimecode(vocal.coverage.spoken_seconds),
      unit: "spoken",
      note: `Across ${vocal.coverage.spoken_turns} answer${vocal.coverage.spoken_turns === 1 ? "" : "s"}`,
    });
  }

  return stats;
}

export function hasStatistics(metrics: Metrics): boolean {
  return Boolean(measuredVocal(metrics) || measuredVisual(metrics));
}

export default function ReportStatistics({
  metrics,
  showInterviewPaceTarget,
}: {
  metrics: Metrics;
  showInterviewPaceTarget: boolean;
}) {
  const stats = buildStats(metrics, showInterviewPaceTarget);
  if (stats.length === 0) return null;
  const hasVoice = Boolean(measuredVocal(metrics));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-2.5 px-[22px] py-5 shadow-[-1px_0_0_var(--la-line),0_-1px_0_var(--la-line)]"
          >
            <span className="text-[13px] font-semibold text-muted">{stat.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-medium leading-none text-cwru-blue tabular-nums [font-variant-numeric:lining-nums_tabular-nums]">
                {stat.value}
              </span>
              <span className="text-sm text-muted">{stat.unit}</span>
            </span>
            {stat.fill !== undefined && (
              <span aria-hidden className="relative h-1.5 rounded-full bg-light-blue/40">
                <span
                  className={clsx("absolute inset-y-0 left-0 rounded-full bg-true-blue")}
                  style={{ width: `${Math.max(0, Math.min(1, stat.fill)) * 100}%` }}
                />
                {stat.band && (
                  <span
                    className="absolute -inset-y-[3px] rounded-sm border-2 border-level-4"
                    style={{ left: `${stat.band[0] * 100}%`, width: `${(stat.band[1] - stat.band[0]) * 100}%` }}
                  />
                )}
              </span>
            )}
            <span className="text-[13.5px] text-muted">{stat.note}</span>
          </div>
        ))}
      </div>
      {hasVoice && <p className="text-[12.5px] text-muted">Rates are per spoken minute.</p>}
    </div>
  );
}
