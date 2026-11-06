import type { DisengagementCause } from "@/lib/engine/disengagement";

import { ChevronDown } from "lucide-react";

import { formatTimecode } from "@/lib/metrics/bands";
import { asDisengagementDeclineRecord, type ReportDTO } from "@/lib/report/dto";

const CAUSE_LABELS: Record<DisengagementCause, string> = {
  budget_pressure: "the session was running long",
  turn_count_pressure: "the exchange had extended across many turns",
  repeated_response: "a response repeated earlier points",
  short_response_streak: "several responses were very short",
  no_common_ground: "no shared relevance had been established",
  hostility: "the exchange turned personal",
  severe_content:
    "a remark crossed a line the character would not continue past",
  position_unacknowledged: "the other person's position was never acknowledged",
  stonewalling: "the other person stopped engaging with what was said",
};

export interface DisengagementDeclinePanelProps {
  report: ReportDTO;
}

/**
 * Proof-backed, session-clock evidence for a pitch walk-out. This renders only
 * the engine's closed observable causes; it never interprets avatar intent or
 * relies on evaluator prose.
 */
export function DisengagementDeclinePanel({
  report,
}: DisengagementDeclinePanelProps) {
  const decline = asDisengagementDeclineRecord(
    report.outcome?.disengagementDecline,
  );

  if (!decline) return null;

  // The engine can record the same moment twice; say each one once. A
  // zero-length range reads as one time, not "0:26–0:26".
  const rows = [
    ...new Map(
      decline.episodes.map((episode) => {
        const start = formatTimecode(episode.start_s);
        const end = formatTimecode(episode.end_s);
        const when = start === end ? start : `${start}–${end}`;
        const what = episode.causes.map((cause) => CAUSE_LABELS[cause]).join("; ");
        return [`${when}|${what}`, { when, what }] as const;
      }),
    ).values(),
  ];

  // Collapsed by default: the outcome banner above already says the
  // conversation ended early, and the scores are what a student looks for
  // first. The evidence stays one click away, with its size on the summary.
  return (
    <details
      className="group rounded-xl border border-line bg-white text-ink"
      data-testid="disengagement-decline-panel"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue [&::-webkit-details-marker]:hidden">
        <span className="font-display text-xl font-medium leading-snug">
          Observable signals before the conversation ended
          <span className="ml-2 font-sans text-sm font-normal text-muted">
            {rows.length} {rows.length === 1 ? "moment" : "moments"}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className="shrink-0 text-link transition-transform duration-200 group-open:rotate-180"
          size={16}
        />
      </summary>
      <div className="px-5 pb-4">
        <p className="text-sm leading-relaxed text-ink">
          These session-clock moments show the interaction signals that led to the
          early end. They describe what happened in the exchange, not the
          listener&apos;s private state.
        </p>
        <ol className="mt-4 space-y-3">
          {rows.map((row) => (
            <li
              key={`${row.when}-${row.what}`}
              className="font-display text-base italic leading-relaxed text-ink"
            >
              <span className="font-mono not-italic tabular-nums text-ink">{row.when}</span> —{" "}
              {row.what}.
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export { CAUSE_LABELS as DISENGAGEMENT_CAUSE_LABELS };
