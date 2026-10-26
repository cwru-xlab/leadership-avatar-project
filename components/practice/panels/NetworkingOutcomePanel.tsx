/**
 * Ask / outcome / common-ground panel for a networking report.
 *
 * Visually distinct from score cards: no 1–5 scale, no colour that encodes
 * good/bad. `never-asked` is first-class feedback — same weight as agreed /
 * deflected / declined. An avatar early end is feedback, never a failure.
 *
 * Follows Phase 15's ConversationOutcomePanel idiom (dashed border, "Outcome
 * record" eyebrow, not-a-score caption) so the two panels read as siblings.
 */

import type { ReportDTO } from "@/lib/report/dto";

import {
  NETWORKING_ASK_OUTCOMES,
  type NetworkingAskOutcome,
} from "@/lib/networking/prompts";

/** Plain-language names for networking's three avatarEndReasons (16-07). */
export const NETWORKING_AVATAR_END_PHRASES: Record<string, string> = {
  disengaged: "They stepped away from the conversation.",
  "not-worth-continuing": "They decided it was not worth continuing.",
  "out-of-time": "They ran out of time.",
};

export const NETWORKING_AVATAR_END_REASONS = Object.keys(
  NETWORKING_AVATAR_END_PHRASES,
);

/** Four distinct human renderings for askOutcome. */
export const ASK_OUTCOME_PHRASES: Record<NetworkingAskOutcome, string> = {
  agreed: "They agreed to what you asked for.",
  deflected:
    "They neither agreed nor refused — the ask was softened or sidestepped.",
  declined: "They said no.",
  "never-asked": "The ask was never made.",
};

export const COMMON_GROUND_NONE_LINE = "None identified.";

export const GOAL_PRIVACY_LINE = "The other person was never told this goal.";

export const OUTCOME_NOT_A_SCORE_CAPTION =
  "What happened, for the record. This isn't part of your score — the scores above judge how you built the connection, not whether you got what you wanted.";

export const EARLY_END_STILL_SCORED_LINE =
  "All seven dimensions are still scored from what happened.";

export type NetworkingOutcomeView = {
  askMade: boolean;
  askOutcome: NetworkingAskOutcome;
  commonGround: string | null;
};

/**
 * Defensively narrow an unknown outcome JSON into the networking panel view.
 * Malformed fields degrade to null — never throws.
 */
export function asNetworkingOutcome(
  value: unknown,
): NetworkingOutcomeView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  if (typeof v.askMade !== "boolean") return null;
  if (
    typeof v.askOutcome !== "string" ||
    !(NETWORKING_ASK_OUTCOMES as readonly string[]).includes(v.askOutcome)
  ) {
    return null;
  }
  const commonGround =
    typeof v.commonGround === "string" && v.commonGround.trim()
      ? v.commonGround.trim()
      : null;

  return {
    askMade: v.askMade,
    askOutcome: v.askOutcome as NetworkingAskOutcome,
    commonGround,
  };
}

/** Student-facing phrasing for one askOutcome literal. */
export function formatAskOutcome(outcome: NetworkingAskOutcome): string {
  return ASK_OUTCOME_PHRASES[outcome];
}

/** Student-facing phrasing for an avatar end reason; null if unknown. */
export function formatAvatarEndReason(reason: string): string | null {
  return NETWORKING_AVATAR_END_PHRASES[reason] ?? null;
}

/** Common-ground body text — never the strings "null" / "undefined". */
export function formatCommonGround(commonGround: string | null): string {
  return commonGround ?? COMMON_GROUND_NONE_LINE;
}

export interface NetworkingOutcomePanelProps {
  report: ReportDTO;
}

export default function NetworkingOutcomePanel({
  report,
}: NetworkingOutcomePanelProps) {
  const outcome = asNetworkingOutcome(report.outcome);

  if (!outcome) return null;

  const goal =
    report.input?.kind === "networking" && typeof report.input.goal === "string"
      ? report.input.goal
      : null;

  const askLanding = formatAskOutcome(outcome.askOutcome);
  const commonGroundText = formatCommonGround(outcome.commonGround);

  const terminationReason = report.terminationReason;
  const earlyEndPhrase =
    terminationReason && terminationReason in NETWORKING_AVATAR_END_PHRASES
      ? formatAvatarEndReason(terminationReason)
      : null;

  return (
    <section
      className="mb-6 rounded-2xl border border-t-2 border-t-[#b79b4c] [border-top-style:solid] shadow-[0_10px_24px_rgba(0,48,135,0.08)] motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 border-dashed border-[#8295ad] bg-transparent px-5 py-4"
      data-ask-outcome={outcome.askOutcome}
      data-not-a-score="true"
      data-testid="networking-outcome-panel"
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#003087]">
        Outcome record
      </h2>

      {goal ? (
        <div className="mt-3" data-testid="networking-goal">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#53677d]">
            Your goal
          </p>
          <p className="mt-1 font-serif text-lg text-[#102a4c]">{goal}</p>
          <p className="mt-1 text-sm text-[#52657a]">{GOAL_PRIVACY_LINE}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#53677d]">
            Did you make the ask?
          </p>
          <p className="mt-1 font-serif text-xl text-[#102a4c]">
            {outcome.askMade ? "Yes" : "No"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#53677d]">
            How it landed
          </p>
          <p
            className="mt-1 font-serif text-xl text-[#102a4c]"
            data-testid="networking-ask-landing"
          >
            {askLanding}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#53677d]">
          Common ground
        </p>
        <p
          className="mt-1 text-sm leading-relaxed text-[#334155]"
          data-testid="networking-common-ground"
        >
          {commonGroundText}
        </p>
      </div>

      {earlyEndPhrase ? (
        <aside
          className="mt-4 rounded-xl border border-[#b8c7d8] bg-[#f4f7fa] px-4 py-3 text-[#102a4c]"
          data-outcome={terminationReason}
          data-testid="networking-early-end"
        >
          <h3 className="font-serif text-lg leading-snug">
            The other person ended the conversation.
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[#334155]">
            {earlyEndPhrase}
          </p>
          <p className="mt-2 text-sm text-[#334155]">
            {EARLY_END_STILL_SCORED_LINE}
          </p>
        </aside>
      ) : null}

      <p className="mt-3 text-sm leading-relaxed text-[#52657a]">
        {OUTCOME_NOT_A_SCORE_CAPTION}
      </p>
    </section>
  );
}
