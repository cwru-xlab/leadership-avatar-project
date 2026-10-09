/**
 * The pitch-funding InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page; the registry entry in `lib/engine/registry.ts` is the only other
 * change (REQ-60, REQ-93).
 *
 * PEER of `lib/pitch/deck-type.ts`, differing only where the mode differs:
 * a fixed budget/grant reviewer listener, two distinctive rubric dimensions
 * (use-of-funds credibility, ask feasibility), a three-field factual outcome
 * record, and NO negotiation dimension, NO ask price and NO private
 * fair-value band anywhere (19-CONTEXT.md: a grant or budget request gives
 * up no ownership stake). This mode cannot walk out — same posture 19-03
 * left on the investor deck.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

import { getDeckMode } from "@/lib/pitch/deck-modes";
import {
  FUNDING_EVALUATOR_PROMPT,
  buildDeckEvaluationImages,
  buildFundingEvaluationContext,
  buildFundingSystemPrompt,
} from "@/lib/pitch/funding-prompts";
import { SHARED_DECK_DIMENSIONS } from "@/lib/pitch/deck-rubric";
import { DECK_VISIBLE_CONTEXT } from "@/lib/pitch/slides-channel";

// The two distinctive dimensions for this mode, named explicitly per the
// plan. No `negotiation` dimension anywhere — this mode never mentions an
// ask price, an ownership stake or a private fair-value band.
const USE_OF_FUNDS_CREDIBILITY_DIMENSION: InteractionTypeConfig["extraRubricDimensions"][number] =
  {
    key: "use_of_funds_credibility",
    label: "Use of funds credibility",
    description:
      "Is the spend plan specific, costed and tied to concrete outcomes. 1: vague, unaccountable spend. 5: specific, costed, outcome-tied plan.",
  };

const ASK_FEASIBILITY_DIMENSION: InteractionTypeConfig["extraRubricDimensions"][number] =
  {
    key: "ask_feasibility",
    label: "Ask feasibility",
    description:
      "Is the amount asked proportionate to the plan and the stage described. 1: the amount is disconnected from the plan. 5: the amount is clearly proportionate and defensible.",
  };

// The picker, the wizard and this record must not be able to disagree about
// the funding envelope — same fail-loud posture `deck-type.ts` uses for the
// investor envelope.
const FUNDING_DECK_MODE = getDeckMode("pitch-funding");

if (!FUNDING_DECK_MODE) {
  throw new Error(
    'lib/pitch/funding-type.ts: getDeckMode("pitch-funding") returned null — DECK_MODES is missing its funding row',
  );
}

const FUNDING_ENVELOPE_SECONDS = FUNDING_DECK_MODE.envelopeSeconds;

export const PITCH_FUNDING_TYPE: InteractionTypeConfig = {
  slug: "pitch-funding",
  name: FUNDING_DECK_MODE.cardTitle,
  description: FUNDING_DECK_MODE.cardBlurb,
  // Four shared deck dimensions plus this mode's two distinctive ones. No
  // `negotiation` — that stays investor-only (19-CONTEXT.md).
  extraRubricDimensions: [
    ...SHARED_DECK_DIMENSIONS,
    USE_OF_FUNDS_CREDIBILITY_DIMENSION,
    ASK_FEASIBILITY_DIMENSION,
  ],
  prompts: {
    liveSystemPrompt: buildFundingSystemPrompt,
    evaluatorPrompt: FUNDING_EVALUATOR_PROMPT,
    buildEvaluationContext: buildFundingEvaluationContext,
    buildEvaluationImages: buildDeckEvaluationImages,
  },
  // Session length lives in timeBudget (adjustable). A second number here
  // would be a competing source of truth.
  limits: {
    targetMinutes: null,
    targetQuestionCount: null,
  },
  // This mode cannot walk out — no `disengagementThreshold` key. Same shape
  // 19-03 leaves on the investor deck.
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: false,
    avatarEndReasons: [],
    avatarEndFloor: { minAssistantTurns: 4 },
  },
  visibleContext: DECK_VISIBLE_CONTEXT,
  // Factual, descriptive, UNSCORED outcome record — no postProcessScores.
  outcome: {
    fields: [
      {
        key: "fundedAmountUsd",
        label: "Funded amount (USD)",
        kind: "number",
        required: false,
      },
      {
        key: "fundingPosition",
        label: "Funding position",
        kind: "string",
        required: true,
      },
      {
        key: "fundingRationale",
        label: "Funding rationale",
        kind: "string",
        required: false,
      },
    ],
  },
  timeBudget: {
    totalSeconds: FUNDING_ENVELOPE_SECONDS[0],
    warnAtRemainingSeconds: 180,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: [
      FUNDING_ENVELOPE_SECONDS[0],
      FUNDING_ENVELOPE_SECONDS[1],
    ],
  },
  // Deck is uploaded during setup, exactly as the investor deck is.
  instance: { required: true, authoredInWizard: true },
  checkpointing: "client-driven",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  // No postProcessScores — the early-end cap is an elevator concern.
  setupSteps: [
    {
      id: "deck-upload",
      label: "Upload your deck",
      customComponent: "DeckUploadStep",
    },
    {
      id: "funding-ask",
      label: "Your request",
      customComponent: "FundingAskStep",
    },
    {
      id: "session-length",
      label: "Session length",
      customComponent: "SessionLengthStep",
    },
    {
      // Reuse Phase 13's InterviewerStep declaration id — the student picks
      // the avatar's face and voice, never the listener's role
      // (19-CONTEXT.md decision 4).
      id: "interviewer",
      label: "Avatar & voice",
      customComponent: "InterviewerStep",
    },
    // CameraConsentStep is appended by SetupWizard for every type (13-09)
    // and must NOT appear here.
  ],
};
