/**
 * Character's private after-the-fact reaction for a difficult conversation.
 *
 * Report-side only — never touches the live session. The passage is the
 * character's first-person voice about how the conversation landed for
 * them, not evaluator coaching and not a restatement of the score cards.
 *
 * Empty when the evaluator produced no reaction: render nothing at all.
 * Never a placeholder and never "the character had no reaction".
 *
 * Timecode treatment: reuse `formatTimecode` from `lib/metrics/bands` —
 * the same product clock formatting Moments uses. MomentsPanel itself
 * takes VisualMetrics episodes (`{ label, value, group }`) and is not
 * reusable for `{ timecodeSeconds, quote, effect }` without contortion;
 * a plain list with the shared formatter is the honest fit.
 */

import type { ReportDTO } from "@/lib/report/dto";

import {
  asConversationOutcome,
  type ConversationReactionCause,
} from "@/lib/report/dto";
import { formatTimecode } from "@/lib/metrics/bands";

export interface InRoleReactionPanelProps {
  report: ReportDTO;
}

function avatarRoleLabel(report: ReportDTO): string {
  if (report.input?.kind === "difficult-conversation" && report.input.role) {
    return report.input.role;
  }

  return "The character";
}

function ReactionCauseRow({
  cause,
  index,
}: {
  cause: ConversationReactionCause;
  index: number;
}) {
  return (
    <li
      key={`${cause.timecodeSeconds}-${index}`}
      className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0"
    >
      <span className="font-mono text-sm tabular-nums text-muted">
        {formatTimecode(cause.timecodeSeconds)}
      </span>
      <span className="text-sm text-ink">
        &ldquo;{cause.quote}&rdquo;
      </span>
      <span className="text-sm text-ink">{cause.effect}</span>
    </li>
  );
}

export default function InRoleReactionPanel({
  report,
}: InRoleReactionPanelProps) {
  const outcome = asConversationOutcome(report.outcome);

  // No reaction → render nothing. Never invent a placeholder.
  if (!outcome?.inRoleReaction) return null;

  const role = avatarRoleLabel(report);
  const causes = outcome.reactionCauses;

  return (
    <section
      className="rounded-xl border border-line bg-white px-5 py-5"
      data-testid="in-role-reaction-panel"
    >
      {/* Heading names whose voice this is so the student never mistakes
          it for the evaluator or for coaching. */}
      <h2 className="font-display font-medium text-xl text-cwru-blue">{role}, afterwards</h2>
      <blockquote className="mt-4 font-display font-medium text-base italic leading-relaxed text-ink">
        {outcome.inRoleReaction}
      </blockquote>
      {causes && causes.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-3" data-testid="reaction-causes">
          {causes.map((cause, index) => (
            <ReactionCauseRow
              key={`${cause.timecodeSeconds}-${index}`}
              cause={cause}
              index={index}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
