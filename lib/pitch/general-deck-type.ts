/**
 * The pitch-general InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page; the registry entry in `lib/engine/registry.ts` is the only other
 * change (REQ-60, REQ-93).
 *
 * This is the deliberate ZERO-SETUP "upload and go" mode (19-CONTEXT.md): a
 * generic attentive listener, no audience input of any kind, no distinctive
 * rubric dimension beyond the shared four deck dimensions, and no outcome
 * panel at all. Do NOT give it a free-text audience field — a "bring your
 * own context" flexible mode was considered and explicitly REJECTED by
 * 19-CONTEXT.md.
 *
 * PEER of `lib/pitch/deck-type.ts`, differing only where the mode differs.
 * No negotiation dimension, no ask price and no private fair-value band
 * anywhere. This mode cannot walk out — same posture 19-03 left on the
 * investor deck.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

import { getDeckMode } from "@/lib/pitch/deck-modes";
import {
  GENERAL_DECK_EVALUATOR_PROMPT,
  buildDeckEvaluationImages,
  buildGeneralDeckEvaluationContext,
  buildGeneralDeckSystemPrompt,
} from "@/lib/pitch/general-deck-prompts";
import { SHARED_DECK_DIMENSIONS } from "@/lib/pitch/deck-rubric";
import { DECK_VISIBLE_CONTEXT } from "@/lib/pitch/slides-channel";

// The picker, the wizard and this record must not be able to disagree about
// the general envelope — same fail-loud posture `deck-type.ts` uses for the
// investor envelope.
const GENERAL_DECK_MODE = getDeckMode("pitch-general");

if (!GENERAL_DECK_MODE) {
  throw new Error(
    'lib/pitch/general-deck-type.ts: getDeckMode("pitch-general") returned null — DECK_MODES is missing its general row',
  );
}

const GENERAL_ENVELOPE_SECONDS = GENERAL_DECK_MODE.envelopeSeconds;

export const PITCH_GENERAL_TYPE: InteractionTypeConfig = {
  slug: "pitch-general",
  name: GENERAL_DECK_MODE.cardTitle,
  description: GENERAL_DECK_MODE.cardBlurb,
  // Exactly the four shared deck dimensions — nothing appended. No
  // distinctive dimension for this mode (19-CONTEXT.md).
  extraRubricDimensions: [...SHARED_DECK_DIMENSIONS],
  prompts: {
    liveSystemPrompt: buildGeneralDeckSystemPrompt,
    evaluatorPrompt: GENERAL_DECK_EVALUATOR_PROMPT,
    buildEvaluationContext: buildGeneralDeckEvaluationContext,
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
  // No outcome record at all — matches the interview presets' shape. This
  // mode has no distinctive judgement to report descriptively.
  outcome: { fields: [] },
  timeBudget: {
    totalSeconds: GENERAL_ENVELOPE_SECONDS[0],
    warnAtRemainingSeconds: 180,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: [
      GENERAL_ENVELOPE_SECONDS[0],
      GENERAL_ENVELOPE_SECONDS[1],
    ],
  },
  // Deck is uploaded during setup, exactly as the investor deck is.
  instance: { required: true, authoredInWizard: true },
  checkpointing: "client-driven",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  // No postProcessScores — the early-end cap is an elevator concern.
  // No mode-input step — this mode declares none (19-CONTEXT.md).
  setupSteps: [
    {
      id: "deck-upload",
      label: "Upload your deck",
      customComponent: "DeckUploadStep",
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
