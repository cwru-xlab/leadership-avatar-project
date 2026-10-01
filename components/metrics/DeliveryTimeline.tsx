"use client";

/**
 * Timestamped detail panels: when visual excursions happened, and how delivery
 * varied turn to turn.
 *
 * These were one combined two-card block under the score cards. The tabbed
 * report places them in different tabs — moments under "Moments", per-answer
 * delivery under "Delivery" — so they are exported separately and the combined
 * view is gone.
 *
 * WHY THIS EXISTS: session averages are unactionable. A student who held
 * steady through four answers and fell apart on the fifth reads identically to
 * one who was mediocre throughout — "Eye contact: Solid" either way. This
 * component is where the pipeline's timestamps become feedback a student can
 * do something with.
 *
 * Unlike `ReportScoreCards`, this component DOES show raw figures. That split
 * is deliberate, not an inconsistency: the cards are the at-a-glance summary
 * and stay qualitative, while the detail below earns credibility by being
 * specific. See the note at the top of `ReportScoreCards.tsx`.
 *
 * Every wording decision still comes from `lib/metrics/bands.ts` — this file
 * renders what that module returns and never invents vocabulary for a
 * measurement.
 */

import { episodeBand, formatTimecode } from "@/lib/metrics/bands";
import type { VisualMetrics, VocalMetrics } from "@/lib/metrics/types";

/** Rounds to whole percent for display. The underlying value is already a
 * 0-100 figure; this only guards a stored fractional value from rendering as
 * "64.28571428571429%". */
function pct(value: number): string {
  return `${Math.round(value)}%`;
}

/** The episode list on its own — the "Moments" tab's entire content. */
export function MomentsPanel({ visual }: { visual: VisualMetrics | null }) {
  const episodes = Array.isArray(visual?.episodes) ? visual.episodes : [];
  if (episodes.length === 0) return null;
  const offsetS = visual?.coverage?.capture_offset_s ?? 0;

  return (
    <div className="flex flex-col gap-2">
      {episodes.map((episode, i) => {
        const row = episodeBand(episode, offsetS);
        return (
          <div
            key={`${episode.kind}-${episode.start_s}-${i}`}
            className="flex items-baseline justify-between gap-3 border-b border-default-100 pb-2 last:border-0 last:pb-0"
          >
            <span className="font-mono text-small tabular-nums text-default-500">{row.label}</span>
            <span className="text-small text-right">{row.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Per-answer delivery rows on their own — lives under the "Delivery" tab. */
export function DeliveryByAnswerPanel({ vocal }: { vocal: VocalMetrics | null }) {
  const turns = Array.isArray(vocal?.turns) ? vocal.turns : [];
  if (turns.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {turns.map((turn) => (
        <div
          key={turn.turn_index}
          className="flex items-baseline justify-between gap-3 border-b border-default-100 pb-2 last:border-0 last:pb-0"
        >
          <span className="font-mono text-small tabular-nums text-default-500">
            {formatTimecode(turn.start_s)}
          </span>
          <span className="text-small text-right text-default-600">
            {Math.round(turn.words_per_minute)} wpm
            {" · "}
            {turn.filler_count} filler{turn.filler_count === 1 ? "" : "s"}
            {" · "}
            volume {pct(turn.volume_consistency * 100)}
          </span>
        </div>
      ))}
    </div>
  );
}
