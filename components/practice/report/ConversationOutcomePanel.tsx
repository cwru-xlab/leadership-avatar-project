/**
 * Factual, explicitly-unscored outcome record for a difficult conversation.
 *
 * Visually distinct from score cards: no 1–5 scale, no bar, no colour that
 * encodes good/bad. The caption is load-bearing — CONTEXT.md locks the
 * separation between approach scores and the factual result.
 */

import type { ReportDTO } from "@/lib/report/dto";

import {
  asConversationOutcome,
  type ConversationObjectiveStatus,
} from "@/lib/report/dto";

export const OUTCOME_NOT_A_SCORE_CAPTION =
  "What happened, for the record. This isn't part of your score — the scores above judge how you handled the conversation, not whether you got what you wanted.";

export const OBJECTIVE_APPROACH_PAIRING_LINE =
  "You didn't get it — and you still pursued it well. That's deliberate: this score is about your approach.";

const STATUS_LABELS: Record<ConversationObjectiveStatus, string> = {
  met: "Objective: met",
  partially_met: "Objective: partially met",
  not_met: "Objective: not met",
  avatar_ended: "Objective: the character ended the conversation",
};

export interface ConversationOutcomePanelProps {
  report: ReportDTO;
}

export function shouldShowPairingLine(
  objectiveStatus: ConversationObjectiveStatus | null | undefined,
  objectiveAchievedScore: number | null | undefined,
): boolean {
  if (objectiveStatus !== "not_met" && objectiveStatus !== "partially_met") {
    return false;
  }

  return objectiveAchievedScore === 4 || objectiveAchievedScore === 5;
}

export default function ConversationOutcomePanel({
  report,
}: ConversationOutcomePanelProps) {
  const outcome = asConversationOutcome(report.outcome);

  if (!outcome || outcome.objectiveStatus === null) return null;

  const statusLabel = STATUS_LABELS[outcome.objectiveStatus];
  const approachScore = report.scores?.objective_achieved ?? null;
  const showPairing = shouldShowPairingLine(
    outcome.objectiveStatus,
    approachScore,
  );

  return (
    <section
      className="mb-6 rounded-2xl border border-dashed border-[#9bb5ad] bg-transparent px-5 py-4"
      data-not-a-score="true"
      data-testid="conversation-outcome-panel"
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6a8391]">
        Outcome record
      </p>
      <p className="mt-2 font-serif text-xl text-[#102331]">{statusLabel}</p>
      {outcome.objectiveNote ? (
        <p className="mt-2 text-sm leading-relaxed text-[#3a5563]">
          {outcome.objectiveNote}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed text-[#526c7b]">
        {OUTCOME_NOT_A_SCORE_CAPTION}
      </p>
      {showPairing ? (
        <p
          className="mt-3 text-sm leading-relaxed text-[#102331]"
          data-testid="objective-approach-pairing"
        >
          {OBJECTIVE_APPROACH_PAIRING_LINE}
        </p>
      ) : null}
    </section>
  );
}
