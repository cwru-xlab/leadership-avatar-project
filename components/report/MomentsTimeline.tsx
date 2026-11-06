"use client";

/**
 * The report's closing section: how each spoken answer went over the session,
 * on the flat Dark Blue stage.
 *
 * Built only from measurements the pipeline already stores — per-answer pace,
 * filler words, pauses and volume (`VocalMetrics.turns`) and camera episodes
 * (`VisualMetrics.episodes`). Nothing here needs a recording: there is no
 * video or audio to replay, only the numbers. Each answer's level word comes
 * from `answerDeliveryLevel()` in `lib/metrics/bands.ts`, which is a display
 * word and never a score.
 *
 * Turn times and episode times start from different zero points, and neither
 * is the transcript's. `lib/report/moments.ts` works out the shift for each, so
 * every time shown matches the growth-area timecodes and the transcript.
 * `visual` arrives here already reclocked (`reclockVisual`), its offset spent;
 * `buildTimelineAnswers` shifts turns.
 *
 * "What you said" is one deterministic line from the student's own stored
 * transcript, in the detail panel a point selects. Selecting works by click,
 * tap and keyboard, so the line is never hover-only. No transcript, no line.
 */
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import LevelChip, { levelDotClass } from "@/components/report/LevelChip";
import {
  answerDeliveryLevel,
  EPISODE_KIND_GROUP,
  episodeBand,
  formatTimecode,
  timelineRows,
  type AnswerLevel,
} from "@/lib/metrics/bands";
import type { VisualEpisode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import type { ReportMoments } from "@/lib/report/moments";
import type { ReportGrowthArea } from "@/lib/report/structured";

/** Answer levels onto the shared ramp: Strong reads as the top of the ramp. */
export const ANSWER_RAMP: Record<AnswerLevel, 1 | 2 | 3 | 5> = { 4: 5, 3: 3, 2: 2, 1: 1 };

const PLOT = { left: 96, right: 990, levelY: { 4: 40, 3: 110, 2: 180, 1: 250 } as const };
const LEVEL_ROWS: { y: number; label: string }[] = [
  { y: 40, label: "Strong" },
  { y: 110, label: "Steady" },
  { y: 180, label: "Uneven" },
  { y: 250, label: "Off" },
];
/** The chart's resting height in viewBox units; it is 1000 wide. */
const BASE_HEIGHT = 340;
/** Tallest the chart grows to beside a long detail panel (about 4:3). */
const MAX_HEIGHT = 760;

/**
 * Beside the detail panel the chart grows to the panel's height, so its column
 * leaves no blank block. It grows by adding viewBox height, never by
 * stretching: rows spread apart, strokes and text keep their size. Stacked
 * (narrow screens) it stays 1000 x 340.
 */
function useChartHeight(hasChart: boolean) {
  const columnRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(BASE_HEIGHT);

  useEffect(() => {
    const column = columnRef.current;
    const detail = detailRef.current;
    if (!column || !detail || typeof ResizeObserver === "undefined") return;
    let width = 0;
    const measure = () => {
      const box = column.firstElementChild as HTMLElement | null;
      const beside = Math.abs(detail.getBoundingClientRect().top - column.getBoundingClientRect().top) < 2;
      if (!box || !beside) return setHeight(BASE_HEIGHT);
      // The panel's own content, not its stretched box, or the two would feed
      // each other. Only grow while the width holds, so stepping to a shorter
      // answer never moves the points under the pointer.
      const panel = detail.firstElementChild as HTMLElement | null;
      const panelHeight = (panel?.offsetHeight ?? 0) + 40;
      const target = Math.round((1000 * panelHeight) / box.clientWidth);
      const next = Math.min(MAX_HEIGHT, Math.max(BASE_HEIGHT, target));
      setHeight((prev) => (box.clientWidth === width ? Math.max(prev, next) : next));
      width = box.clientWidth;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(detail.firstElementChild ?? detail);
    return () => observer.disconnect();
  }, [hasChart]);

  return { columnRef, detailRef, height };
}

export interface TimelineAnswer {
  index: number;
  start: number;
  end: number;
  level: AnswerLevel;
  word: string;
  notes: { label: string; value: string }[];
  camera: string[];
  citedBy: string | null;
  excerpt: string | null;
}

/** "1:42" or a range like "0:24-1:24" (any dash) as [start, end] seconds. */
function parseTimecode(code: string): [number, number] | null {
  const times = code.match(/\d+:\d{2}/g)?.map((t) => {
    const [m, sec] = t.split(":").map(Number);
    return m * 60 + sec;
  });
  if (!times?.length) return null;
  return [times[0], times[times.length - 1]];
}

/** Answers on the transcript clock, each with its level, camera notes, excerpt and the growth area that cites it. */
export function buildTimelineAnswers(
  vocal: VocalMetrics | null,
  visual: VisualMetrics | null,
  growthAreas: ReportGrowthArea[],
  moments: ReportMoments | null = null,
): TimelineAnswer[] {
  const turns = Array.isArray(vocal?.turns) ? vocal.turns : [];
  const offset = visual?.coverage?.capture_offset_s ?? 0;
  const vocalShift = moments?.clock.vocalShiftS ?? 0;
  const episodes = visual?.episodes ?? [];

  return turns.map((turn, i) => {
    const start = Math.max(0, turn.start_s + vocalShift);
    const end = start + turn.duration_s;
    const { level, word, notes } = answerDeliveryLevel(turn);
    const camera = episodes
      .filter((episode) => episode.start_s + offset < end && episode.end_s + offset > start)
      .map((episode) => {
        const row = episodeBand(episode, offset);
        return `${row.value} (${row.label})`;
      });
    const citedBy =
      growthAreas.find((area) =>
        area.timecodes.some((code) => {
          const range = parseTimecode(code);
          return range !== null && range[0] <= end && range[1] >= start;
        }),
      )?.title ?? null;
    const excerpt = moments?.excerpts[turn.turn_index] ?? null;
    return { index: i, start, end, level, word, notes, camera, citedBy, excerpt };
  });
}

export default function MomentsTimeline({
  answers,
  hasTranscript,
  visual,
  selected,
  onSelect,
}: {
  answers: TimelineAnswer[];
  hasTranscript: boolean;
  visual: VisualMetrics | null;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { columnRef, detailRef, height: chartHeight } = useChartHeight(answers.length > 0);
  const offset = visual?.coverage?.capture_offset_s ?? 0;
  const episodes = visual?.episodes ?? [];
  const allRows = visual ? timelineRows(visual) : [];

  if (answers.length === 0) {
    // No spoken answers (typed, or an older session) but the camera still
    // recorded moments: keep them, as the old Moments tab did.
    if (allRows.length === 0) return null;
    return (
      <Stage subtitle="What the camera noticed during your session. These times match your transcript.">
        <MomentList rows={allRows} />
      </Stage>
    );
  }

  const lastEnd = Math.max(
    ...answers.map((a) => a.end),
    ...episodes.map((e) => e.end_s + offset),
  );
  const span = Math.max(60, lastEnd * 1.02);
  const x = (t: number) => PLOT.left + (t / span) * (PLOT.right - PLOT.left);
  // Extra height spreads the level rows apart and moves everything below them down.
  const extra = chartHeight - BASE_HEIGHT;
  const y = (base: number) => 40 + ((base - 40) * (210 + extra)) / 210;
  const points = answers.map((a) => ({ x: x(a.start), y: y(PLOT.levelY[a.level]) }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const floor = 268 + extra;
  const area = `${line} L${points[points.length - 1].x.toFixed(1)} ${floor} L${points[0].x.toFixed(1)} ${floor} Z`;
  const weakest = answers.reduce((low, a) => (a.level < answers[low].level ? a.index : low), 0);
  const current = answers[Math.min(selected, answers.length - 1)];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * span);
  const count = answers.length;
  const lanes = cameraLanes(episodes).map((lane) => ({ ...lane, y: lane.y + extra }));

  return (
    <Stage
      legend
      subtitle={`How each of your ${count} answer${count === 1 ? "" : "s"} went. Select a point to see what happened.`}
    >
      <div className="flex flex-wrap items-stretch gap-5">
        <div ref={columnRef} className="min-w-0 flex-[2_1_560px] overflow-x-auto">
          <div className="relative w-full min-w-[620px]" style={{ aspectRatio: `1000 / ${chartHeight}` }}>
            <svg
              aria-label="Delivery level for each answer across the session, with camera and body language moments below"
              className="absolute inset-0 size-full"
              role="img"
              viewBox={`0 0 1000 ${chartHeight}`}
            >
              <defs>
                <linearGradient id="moments-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--la-true-blue)" stopOpacity="0.4" />
                  <stop offset="1" stopColor="var(--la-true-blue)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g className="fill-light-blue/90 font-sans text-[19px]">
                {LEVEL_ROWS.map((row) => (
                  <text key={row.label} x="0" y={y(row.y) + 5}>
                    {row.label}
                  </text>
                ))}
                {lanes.map((lane) => (
                  <text key={lane.label} x="0" y={lane.y + lane.height - 1}>
                    {lane.label}
                  </text>
                ))}
              </g>
              <g className="stroke-light-blue/15">
                {LEVEL_ROWS.map((row) => (
                  <line key={row.label} x1={PLOT.left} x2={PLOT.right} y1={y(row.y)} y2={y(row.y)} />
                ))}
              </g>
              {lanes.map((lane) => (
                <g key={lane.label}>
                  <rect
                    className="fill-light-blue/10"
                    height={lane.height}
                    rx="4"
                    width={PLOT.right - PLOT.left}
                    x={PLOT.left}
                    y={lane.y}
                  />
                  {lane.episodes.map((episode, i) => (
                    <rect
                      key={i}
                      className="fill-level-2/60"
                      data-moment-kind={episode.kind}
                      data-moment-start={Math.round(episode.start_s + offset)}
                      height={lane.height}
                      rx="4"
                      width={Math.max(4, x(episode.end_s + offset) - x(episode.start_s + offset))}
                      x={x(episode.start_s + offset)}
                      y={lane.y}
                    >
                      <title>{episodeBand(episode, offset).value}</title>
                    </rect>
                  ))}
                </g>
              ))}
              <g className="fill-white/60 font-mono text-[17px]">
                {ticks.map((t, i) => (
                  <text key={t} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} x={x(t)} y={330 + extra}>
                    {formatTimecode(t)}
                  </text>
                ))}
              </g>
              <path
                className="motion-safe:animate-[la-fade_1s_ease-out_0.9s_both]"
                d={area}
                fill="url(#moments-area)"
              />
              <path
                className="stroke-light-blue motion-safe:animate-[la-draw_1.4s_ease-in-out_both]"
                d={line}
                fill="none"
                pathLength={1}
                strokeDasharray="1"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              <line
                className="stroke-white/35"
                strokeDasharray="4 5"
                strokeWidth="1.5"
                x1={points[current.index].x}
                x2={points[current.index].x}
                y1="22"
                y2={310 + extra}
              />
            </svg>

            {answers.map((a, i) => {
              const on = i === current.index;
              const dot = levelDotClass(ANSWER_RAMP[a.level]);
              return (
                <button
                  key={a.index}
                  aria-label={`Answer ${i + 1} at ${formatTimecode(a.start)}, ${a.word}`}
                  aria-pressed={on}
                  className="group absolute -ml-5 -mt-5 grid size-10 place-items-center rounded-full focus-visible:outline-light-blue"
                  style={{ left: `${points[i].x / 10}%`, top: `${(points[i].y / chartHeight) * 100}%` }}
                  type="button"
                  onClick={() => onSelect(i)}
                >
                  {i === weakest && (
                    <span
                      aria-hidden
                      className={clsx(
                        "absolute size-4 rounded-full motion-safe:animate-[la-pulse_1.8s_ease-out_1.4s_infinite] motion-reduce:hidden",
                        dot,
                      )}
                    />
                  )}
                  <span
                    aria-hidden
                    className={clsx(
                      "relative rounded-full transition-transform duration-150 ease-out group-hover:scale-125",
                      dot,
                      on
                        ? "size-5 shadow-[0_0_0_4px_var(--la-stage),0_0_0_7px_white]"
                        : "size-3.5 shadow-[0_0_0_3px_var(--la-stage)]",
                    )}
                  />
                  {a.citedBy && (
                    <span
                      aria-hidden
                      className="absolute -top-2 size-[9px] rotate-45 bg-level-2 shadow-[0_0_0_2px_var(--la-stage)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside
          ref={detailRef}
          aria-live="polite"
          className="flex min-w-0 flex-[1_1_280px] flex-col rounded-xl bg-white/[0.07] p-5"
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px] tabular-nums text-light-blue">
                {formatTimecode(current.start)}–{formatTimecode(current.end)}
              </span>
              <div className="flex gap-1.5">
                <StepButton label="Previous answer" onClick={() => onSelect((current.index - 1 + count) % count)}>
                  <ChevronLeft aria-hidden size={16} />
                </StepButton>
                <StepButton label="Next answer" onClick={() => onSelect((current.index + 1) % count)}>
                  <ChevronRight aria-hidden size={16} />
                </StepButton>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-2xl font-medium leading-tight">Answer {current.index + 1}</h3>
              {/* White under the chip: its tint is translucent and would sink into the stage. */}
              <span className="rounded-full bg-white">
                <LevelChip label={current.word} level={ANSWER_RAMP[current.level]} />
              </span>
            </div>
            {current.excerpt ? (
              <figure className="flex flex-col gap-1">
                <figcaption className="text-[13px] font-semibold text-light-blue">What you said</figcaption>
                <blockquote className="font-display text-[17px] italic leading-[1.35] text-white">
                  {current.excerpt.startsWith("[") ? current.excerpt : `“${current.excerpt}”`}
                </blockquote>
              </figure>
            ) : hasTranscript ? (
              <p className="text-[13px] text-white/70">This answer isn&apos;t in your saved transcript.</p>
            ) : null}
            <ul className="flex list-disc flex-col gap-1 pl-[18px] text-[14.5px] text-white/90">
              {current.notes.map((note) => (
                <li key={note.label}>
                  {note.label}: {note.value.toLowerCase()}
                </li>
              ))}
              {current.camera.map((line) => (
                <li key={line}>Camera: {line}</li>
              ))}
            </ul>
            {current.citedBy && (
              <p className="flex items-center gap-2.5 rounded-lg bg-level-2/15 px-3 py-2.5 text-sm">
                <span aria-hidden className="size-[9px] shrink-0 rotate-45 bg-level-2" />
                <span>
                  Cited in growth area <span className="font-semibold">{current.citedBy}</span>
                </span>
              </p>
            )}
          </div>
        </aside>
      </div>

      {allRows.length > 0 && (
        <details className="group rounded-xl bg-white/[0.05] text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-semibold [&::-webkit-details-marker]:hidden">
            All camera moments ({allRows.length})
            <ChevronRight aria-hidden className="transition-transform duration-200 group-open:rotate-90" size={16} />
          </summary>
          <div className="px-4 pb-4">
            <MomentList answers={answers} rows={allRows} />
          </div>
        </details>
      )}
    </Stage>
  );
}

const GROUP_WORDS = { camera: "Camera", body: "Body language", observation: "Observation" } as const;

/** One strip per kind of moment, so body language isn't read as a camera problem. */
function cameraLanes(episodes: VisualEpisode[]) {
  const groups = [
    { label: "Camera", episodes: episodes.filter((e) => EPISODE_KIND_GROUP[e.kind] !== "body") },
    { label: "Body", episodes: episodes.filter((e) => EPISODE_KIND_GROUP[e.kind] === "body") },
  ];
  const shown = groups[1].episodes.length > 0 && groups[0].episodes.length === 0 ? [groups[1]] : groups.filter(
    (group, i) => i === 0 || group.episodes.length > 0,
  );
  return shown.map((group, i) =>
    shown.length === 1 ? { ...group, y: 282, height: 14 } : { ...group, y: 272 + i * 24, height: 12 },
  );
}

/** Which answer a moment fell in. Moments while the interviewer speaks have none. */
function whenInSession(label: string, answers: TimelineAnswer[]): string {
  const range = parseTimecode(label);
  const during = range && answers.find((a) => range[0] < a.end && range[1] > a.start);
  return during ? `Answer ${during.index + 1}` : "Between answers";
}

function MomentList({ rows, answers = [] }: { rows: ReturnType<typeof timelineRows>; answers?: TimelineAnswer[] }) {
  return (
    <ul className="flex flex-col divide-y divide-light-blue/15">
      {rows.map((row, i) => (
        <li key={`${row.group}-${row.label}-${i}`} className="flex items-baseline justify-between gap-4 py-2">
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-[13px] tabular-nums text-light-blue">{row.label}</span>
            <span className="text-xs text-white/70">
              {GROUP_WORDS[row.group]}
              {answers.length > 0 && ` · ${whenInSession(row.label, answers)}`}
            </span>
          </span>
          <span className="text-right text-sm">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg bg-white/[0.08] text-white transition-colors duration-150 ease-out hover:bg-white/[0.14] focus-visible:outline-light-blue"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Stage({
  subtitle,
  legend = false,
  children,
}: {
  subtitle: string;
  legend?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby="moments-heading"
      className="flex scroll-mt-6 flex-col gap-[18px] rounded-2xl bg-ink px-5 pb-6 pt-6 text-white md:px-7"
      id="moments"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[26px] font-medium leading-[1.15]" id="moments-heading">
            Moments
          </h2>
          <p className="text-[14.5px] text-white/80">{subtitle}</p>
        </div>
        {legend && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-[18px] rounded-sm bg-light-blue" />
              Delivery
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-[18px] rounded-sm bg-level-2/60" />
              Camera or body moment
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-[9px] rotate-45 bg-level-2" />
              Cited in a growth area
            </span>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
