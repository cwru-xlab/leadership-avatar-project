/**
 * Slide coverage, reveal timeline, and scheduled-vs-actual time for deck reports.
 *
 * CONTEXT.md — the overrun is NOTED, and there is deliberately no overrun
 * score dimension.
 */

"use client";

import { useState } from "react";

import type { ReportDTO } from "@/lib/report/dto";
import type { PitchInputSnapshot } from "@/lib/report/snapshot";
import { formatTimecode } from "@/lib/metrics/bands";

export interface DeckTimelinePanelProps {
  report: ReportDTO;
}

const REVEAL_PREVIEW_CAP = 12;

function isDeckPitchInput(
  input: ReportDTO["input"],
): input is PitchInputSnapshot & { pitchKind: "deck" } {
  return (
    input != null &&
    input.kind === "pitch" &&
    input.pitchKind === "deck"
  );
}

function formatDuration(seconds: number): string {
  return formatTimecode(Math.max(0, Math.round(seconds)));
}

export default function DeckTimelinePanel({ report }: DeckTimelinePanelProps) {
  const [showAll, setShowAll] = useState(false);

  if (!isDeckPitchInput(report.input)) return null;

  const slideCount =
    typeof report.input.slideCount === "number" && report.input.slideCount > 0
      ? Math.trunc(report.input.slideCount)
      : null;
  // High-water is 0-based inclusive; shown count = mark + 1 when mark >= 0.
  const highWater =
    typeof report.slideHighWaterMark === "number" &&
    Number.isFinite(report.slideHighWaterMark) &&
    report.slideHighWaterMark >= 0
      ? Math.trunc(report.slideHighWaterMark)
      : null;
  const shownCount = highWater != null ? highWater + 1 : 0;

  const reveals = report.slideReveals;
  const visibleReveals =
    reveals == null
      ? null
      : showAll || reveals.length <= REVEAL_PREVIEW_CAP
        ? reveals
        : reveals.slice(0, REVEAL_PREVIEW_CAP);
  const hiddenRevealCount =
    reveals != null && !showAll && reveals.length > REVEAL_PREVIEW_CAP
      ? reveals.length - REVEAL_PREVIEW_CAP
      : 0;

  const budget = report.timeBudgetSeconds;
  const elapsed = report.elapsedSeconds;
  const overrun =
    typeof budget === "number" &&
    typeof elapsed === "number" &&
    elapsed > budget
      ? elapsed - budget
      : null;

  let unshownLine: string | null = null;
  if (slideCount != null && highWater != null && shownCount < slideCount) {
    const firstUnshown = shownCount + 1; // 1-based for display
    const lastUnshown = slideCount;
    unshownLine =
      firstUnshown === lastUnshown
        ? `Slide ${firstUnshown} was never shown`
        : `Slides ${firstUnshown}–${lastUnshown} were never shown`;
  } else if (slideCount != null && highWater == null) {
    unshownLine =
      slideCount === 1
        ? "Slide 1 was never shown"
        : `Slides 1–${slideCount} were never shown`;
  }

  return (
    <section
      className="mb-6 rounded-2xl border border-[#d4e2e9] bg-white px-5 py-5"
      data-testid="deck-timeline-panel"
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6a8391]">
        Deck session
      </p>

      <div className="mt-3 space-y-3 text-sm text-[#3a5563]">
        {slideCount != null ? (
          <p data-testid="slide-coverage">
            You showed{" "}
            <span className="font-medium text-[#102331]">
              {shownCount} of {slideCount}
            </span>{" "}
            slides
            {unshownLine ? (
              <>
                . <span>{unshownLine}</span>
              </>
            ) : (
              "."
            )}
          </p>
        ) : highWater != null ? (
          <p data-testid="slide-coverage">
            Furthest slide shown:{" "}
            <span className="font-medium text-[#102331]">
              slide {highWater + 1}
            </span>
            .
          </p>
        ) : (
          <p data-testid="slide-coverage">No slides were recorded as shown.</p>
        )}

        {visibleReveals && visibleReveals.length > 0 ? (
          <div data-testid="reveal-timeline">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
              Reveal timeline
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs tabular-nums text-[#526c7b]">
              {visibleReveals.map((r, i) => (
                <li key={`${r.index}-${r.atTurnIndex}-${i}`}>
                  Slide {r.index + 1} at {formatDuration(r.atElapsedSeconds)}
                </li>
              ))}
            </ul>
            {hiddenRevealCount > 0 ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-[#0a7391] underline-offset-2 hover:underline"
                onClick={() => setShowAll(true)}
              >
                Show all ({reveals!.length} reveals)
              </button>
            ) : null}
            {showAll && reveals && reveals.length > REVEAL_PREVIEW_CAP ? (
              <button
                type="button"
                className="mt-2 ml-3 text-xs font-medium text-[#6a8391] underline-offset-2 hover:underline"
                onClick={() => setShowAll(false)}
              >
                Show fewer
              </button>
            ) : null}
          </div>
        ) : null}

        {typeof budget === "number" && typeof elapsed === "number" ? (
          <p data-testid="session-time-line">
            Scheduled {formatDuration(budget)} · Ran {formatDuration(elapsed)}
            {overrun != null ? (
              <>
                ,{" "}
                <span className="font-medium text-[#102331]">
                  {formatDuration(overrun)} over
                </span>
              </>
            ) : null}
          </p>
        ) : typeof budget === "number" ? (
          <p data-testid="session-time-line">
            Scheduled {formatDuration(budget)}
          </p>
        ) : typeof elapsed === "number" ? (
          <p data-testid="session-time-line">
            Ran {formatDuration(elapsed)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
