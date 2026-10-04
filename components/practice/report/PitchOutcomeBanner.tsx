/**
 * Named early-end outcome banner for elevator pitch reports.
 *
 * CONTEXT.md — "No zeroing, no rendering the report as an error or crash."
 * This uses the report's notable-outcome callout language, never the
 * FAILED-evaluation error styling.
 */

import type { ReportDTO } from "@/lib/report/dto";
import { formatTimecode } from "@/lib/metrics/bands";

/**
 * Plain-language headlines for pitch-elevator avatarEndReasons.
 * Greppable map — keep reason codes as keys.
 */
export const PITCH_EARLY_END_OUTCOME_NAMES: Record<string, string> = {
  pitch_too_long:
    "The listener lost patience and ended the conversation",
  no_common_ground:
    "The listener never felt the pitch was for them, and ended the conversation",
  unclear_ask:
    "The listener could not tell what you wanted, and ended the conversation",
  lost_interest:
    "The listener disengaged and ended the conversation",
};

export const EARLY_END_LIMITED_EVIDENCE_LINE =
  "Because the conversation ended early, there was limited evidence for Listener discovery & tailoring.";

export const EARLY_END_REASONS_FALLBACK =
  "Your report's feedback below explains what led here";

export interface PitchOutcomeBannerProps {
  report: ReportDTO;
}

export default function PitchOutcomeBanner({ report }: PitchOutcomeBannerProps) {
  const reason = report.terminationReason;
  if (!reason) return null;
  if (!(reason in PITCH_EARLY_END_OUTCOME_NAMES)) return null;

  const headline = PITCH_EARLY_END_OUTCOME_NAMES[reason];
  const earlyEndReasons =
    typeof report.outcome?.earlyEndReasons === "string" &&
    report.outcome.earlyEndReasons.trim()
      ? report.outcome.earlyEndReasons.trim()
      : null;
  const timecodeSeconds =
    typeof report.terminationAtSeconds === "number"
      ? report.terminationAtSeconds
      : null;

  return (
    <aside
      className="mb-6 rounded-2xl border border-[#0a7391]/45 bg-[#f0f7fa] px-5 py-4 text-[#102331]"
      data-outcome={reason}
      data-testid="pitch-outcome-banner"
    >
      <p className="font-serif text-xl leading-snug">{headline}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#3a5563]">
        {earlyEndReasons ?? EARLY_END_REASONS_FALLBACK}
      </p>
      {typeof timecodeSeconds === "number" ? (
        <p className="mt-2 font-mono text-sm tabular-nums text-[#526c7b]">
          Interest dropped around {formatTimecode(timecodeSeconds)}.
        </p>
      ) : null}
      <p className="mt-3 text-sm text-[#3a5563]">
        {EARLY_END_LIMITED_EVIDENCE_LINE}
      </p>
    </aside>
  );
}
