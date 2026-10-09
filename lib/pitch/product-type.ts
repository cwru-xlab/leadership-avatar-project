/**
 * The pitch-product InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page; the registry entry in `lib/engine/registry.ts` is the only other
 * change (REQ-60, REQ-93).
 *
 * PEER of `lib/pitch/deck-type.ts`, differing only where the mode differs:
 * a fixed prospective-customer listener, one distinctive rubric dimension
 * (objection handling), a two-field factual outcome record, and NO
 * negotiation dimension, NO ask price and NO private fair-value band
 * anywhere. This mode cannot walk out — same posture 19-03 left on the
 * investor deck.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

import { getDeckMode } from "@/lib/pitch/deck-modes";
import {
  PRODUCT_EVALUATOR_PROMPT,
  buildDeckEvaluationImages,
  buildProductEvaluationContext,
  buildProductSystemPrompt,
} from "@/lib/pitch/product-prompts";
import { SHARED_DECK_DIMENSIONS } from "@/lib/pitch/deck-rubric";
import { DECK_VISIBLE_CONTEXT } from "@/lib/pitch/slides-channel";

// The one distinctive dimension for this mode, named explicitly per the
// plan. No `negotiation` dimension anywhere — this mode never mentions an
// ask price, an ownership stake or a private fair-value band.
const OBJECTION_HANDLING_DIMENSION: InteractionTypeConfig["extraRubricDimensions"][number] =
  {
    key: "objection_handling",
    label: "Objection handling",
    description:
      "Did the founder surface, understand and answer the buyer's real objection, with evidence, without caving or stonewalling. 1: ignored or caved to the objection. 5: surfaced it, understood it, and answered it with evidence.",
  };

// The picker, the wizard and this record must not be able to disagree about
// the product envelope — same fail-loud posture `deck-type.ts` uses for the
// investor envelope.
const PRODUCT_DECK_MODE = getDeckMode("pitch-product");

if (!PRODUCT_DECK_MODE) {
  throw new Error(
    'lib/pitch/product-type.ts: getDeckMode("pitch-product") returned null — DECK_MODES is missing its product row',
  );
}

const PRODUCT_ENVELOPE_SECONDS = PRODUCT_DECK_MODE.envelopeSeconds;

export const PITCH_PRODUCT_TYPE: InteractionTypeConfig = {
  slug: "pitch-product",
  name: PRODUCT_DECK_MODE.cardTitle,
  description: PRODUCT_DECK_MODE.cardBlurb,
  // Four shared deck dimensions plus this mode's one distinctive dimension.
  // No `negotiation` — that stays investor-only (19-CONTEXT.md).
  extraRubricDimensions: [
    ...SHARED_DECK_DIMENSIONS,
    OBJECTION_HANDLING_DIMENSION,
  ],
  prompts: {
    liveSystemPrompt: buildProductSystemPrompt,
    evaluatorPrompt: PRODUCT_EVALUATOR_PROMPT,
    buildEvaluationContext: buildProductEvaluationContext,
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
        key: "buyerPosition",
        label: "Buyer position",
        kind: "string",
        required: true,
      },
      {
        key: "blockingObjection",
        label: "Blocking objection",
        kind: "string",
        required: false,
      },
    ],
  },
  timeBudget: {
    totalSeconds: PRODUCT_ENVELOPE_SECONDS[0],
    warnAtRemainingSeconds: 180,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: [
      PRODUCT_ENVELOPE_SECONDS[0],
      PRODUCT_ENVELOPE_SECONDS[1],
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
      id: "buyer-profile",
      label: "Your buyer",
      customComponent: "BuyerProfileStep",
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
