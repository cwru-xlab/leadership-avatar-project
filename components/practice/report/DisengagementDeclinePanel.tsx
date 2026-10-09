import { formatTimecode } from "@/lib/metrics/bands";
import { asDisengagementDeclineRecord, type ReportDTO } from "@/lib/report/dto";
import type { DisengagementCause } from "@/lib/engine/disengagement";

const CAUSE_LABELS: Record<DisengagementCause, string> = {
  budget_pressure: "the session was running long",
  turn_count_pressure: "the exchange had extended across many turns",
  repeated_response: "a response repeated earlier points",
  short_response_streak: "several responses were very short",
  no_common_ground: "no shared relevance had been established",
  hostility: "the exchange turned personal",
  severe_content:
    "a remark crossed a line the character would not continue past",
  position_unacknowledged:
    "the other person's position was never acknowledged",
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

  return (
    <section
      className="mb-6 rounded-2xl border border-[#0a7391]/25 bg-[#f7fbfc] px-5 py-4 text-[#102331]"
      data-testid="disengagement-decline-panel"
    >
      <h2 className="font-serif text-xl leading-snug">
        Observable signals before the conversation ended
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#3a5563]">
        These session-clock moments show the interaction signals that led to the
        early end. They describe what happened in the exchange, not the
        listener&apos;s private state.
      </p>
      <ol className="mt-4 space-y-3">
        {decline.episodes.map((episode, index) => (
          <li
            className="border-l-2 border-[#0a7391]/35 pl-3 text-sm leading-relaxed text-[#3a5563]"
            key={`${episode.kind}-${episode.start_s}-${episode.end_s}-${index}`}
          >
            <span className="font-mono tabular-nums text-[#102331]">
              {formatTimecode(episode.start_s)}–{formatTimecode(episode.end_s)}
            </span>{" "}
            — {episode.causes.map((cause) => CAUSE_LABELS[cause]).join("; ")}.
          </li>
        ))}
      </ol>
    </section>
  );
}

export { CAUSE_LABELS as DISENGAGEMENT_CAUSE_LABELS };
