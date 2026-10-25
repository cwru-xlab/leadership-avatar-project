/**
 * Named outcome banner for a difficult-conversation report when the
 * session ended for a declared reason.
 *
 * An avatar end is an outcome, not an error (CONTEXT.md). If this ever
 * renders as a failure state, the decision has been reversed.
 */

import type { ReportDTO } from "@/lib/report/dto";

import { asConversationOutcome } from "@/lib/report/dto";
import { formatTimecode } from "@/lib/metrics/bands";

/** Plain-language names for the type's four avatarEndReasons. */
export const AVATAR_END_OUTCOME_NAMES: Record<string, string> = {
  walked_out: "They walked out.",
  shut_down: "They stopped engaging.",
  escalated: "It escalated.",
  nothing_left_to_discuss: "They ended it — there was nothing left to say.",
};

export const AVATAR_END_REASONS = Object.keys(AVATAR_END_OUTCOME_NAMES);

export const STILL_SCORED_LINE =
  "Everything below is still scored on what did happen.";

export const STUDENT_CLOSED_LINE = "You closed it.";
export const STUDENT_LEFT_LINE = "Session ended early.";

export interface ConversationEndBannerProps {
  report: ReportDTO;
}

export default function ConversationEndBanner({
  report,
}: ConversationEndBannerProps) {
  const reason = report.terminationReason;

  if (!reason) return null;

  const outcome = asConversationOutcome(report.outcome);
  const isAvatarEnd = reason in AVATAR_END_OUTCOME_NAMES;

  if (isAvatarEnd) {
    const headline = AVATAR_END_OUTCOME_NAMES[reason];
    const specificReasons = outcome?.endTurnReasons ?? null;
    const turnTimecode = outcome?.endTurnTimecodeSeconds;
    const sessionTimecode =
      typeof report.terminationAtSeconds === "number"
        ? report.terminationAtSeconds
        : null;
    const timecodeSeconds =
      typeof turnTimecode === "number" ? turnTimecode : sessionTimecode;

    return (
      <aside
        className="mb-6 rounded-2xl border border-t-2 border-t-[#b79b4c] shadow-[0_10px_24px_rgba(0,48,135,0.08)] motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 border-[#b8c7d8] bg-[#f4f7fa] px-5 py-4 text-[#102a4c]"
        data-outcome={reason}
        data-testid="conversation-end-banner"
      >
        <h2 className="font-serif text-xl leading-snug text-[#003087]">{headline}</h2>
        {specificReasons ? (
          <p className="mt-2 text-sm leading-relaxed text-[#334155]">
            {specificReasons}
          </p>
        ) : null}
        {typeof timecodeSeconds === "number" ? (
          <p className="mt-2 font-mono text-sm tabular-nums text-[#52657a]">
            It turned around {formatTimecode(timecodeSeconds)}.
          </p>
        ) : null}
        <p className="mt-3 text-sm text-[#334155]">{STILL_SCORED_LINE}</p>
      </aside>
    );
  }

  if (reason === "student_closed_in_character") {
    return (
      <aside
        className="mb-6 rounded-2xl border border-[#c7d2df] bg-[#f6f8fb] px-5 py-3 text-[#334155]"
        data-outcome={reason}
        data-testid="conversation-end-banner"
      >
        <p className="text-sm">{STUDENT_CLOSED_LINE}</p>
      </aside>
    );
  }

  if (reason === "student_left_session") {
    return (
      <aside
        className="mb-6 rounded-2xl border border-[#c7d2df] bg-[#f6f8fb] px-5 py-3 text-[#334155]"
        data-outcome={reason}
        data-testid="conversation-end-banner"
      >
        <p className="text-sm">{STUDENT_LEFT_LINE}</p>
      </aside>
    );
  }

  return null;
}
