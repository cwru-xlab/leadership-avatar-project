/**
 * The pitch-talk InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page; the registry entry in `lib/engine/registry.ts` is the only other
 * change (REQ-60, REQ-93).
 *
 * PEER of `lib/pitch/deck-type.ts`, differing only where the mode differs:
 * a fixed conference-audience listener, two distinctive rubric dimensions
 * (audience takeaway clarity, holding the room), a two-field descriptive
 * outcome record comparing the audience's actual takeaway to the speaker's
 * declared one, and NO negotiation dimension, NO ask price and NO private
 * fair-value band anywhere. This mode cannot walk out — same posture 19-03
 * left on the investor deck.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

import { getDeckMode } from "@/lib/pitch/deck-modes";
import {
  TALK_EVALUATOR_PROMPT,
  buildDeckEvaluationImages,
  buildTalkEvaluationContext,
  buildTalkSystemPrompt,
} from "@/lib/pitch/talk-prompts";
import { SHARED_DECK_DIMENSIONS } from "@/lib/pitch/deck-rubric";
import { DECK_VISIBLE_CONTEXT } from "@/lib/pitch/slides-channel";

// The two distinctive dimensions for this mode, named explicitly per the
// plan. No `negotiation` dimension anywhere — this mode never mentions an
// ask price, an ownership stake or a private fair-value band.
const AUDIENCE_TAKEAWAY_CLARITY_DIMENSION: InteractionTypeConfig["extraRubricDimensions"][number] =
  {
    key: "audience_takeaway_clarity",
    label: "Audience takeaway clarity",
    description:
      "Did one clear point land for THIS audience. 1: no single point landed, or the wrong one for this audience. 5: one clear, well-supported point landed cleanly for this audience.",
  };

const HOLDING_THE_ROOM_DIMENSION: InteractionTypeConfig["extraRubricDimensions"][number] =
  {
    key: "holding_the_room",
    label: "Holding the room",
    description:
      "Pacing and engagement across the whole talk, explicitly beyond the shared Vocal delivery score. 1: lost the room early or often. 5: held attention throughout, with pacing that built rather than flagged.",
  };

// The picker, the wizard and this record must not be able to disagree about
// the talk envelope — same fail-loud posture `deck-type.ts` uses for the
// investor envelope.
const TALK_DECK_MODE = getDeckMode("pitch-talk");

if (!TALK_DECK_MODE) {
  throw new Error(
    'lib/pitch/talk-type.ts: getDeckMode("pitch-talk") returned null — DECK_MODES is missing its talk row',
  );
}

const TALK_ENVELOPE_SECONDS = TALK_DECK_MODE.envelopeSeconds;

export const PITCH_TALK_TYPE: InteractionTypeConfig = {
  slug: "pitch-talk",
  name: TALK_DECK_MODE.cardTitle,
  description: TALK_DECK_MODE.cardBlurb,
  // Four shared deck dimensions plus this mode's two distinctive ones. No
  // `negotiation` — that stays investor-only (19-CONTEXT.md).
  extraRubricDimensions: [
    ...SHARED_DECK_DIMENSIONS,
    AUDIENCE_TAKEAWAY_CLARITY_DIMENSION,
    HOLDING_THE_ROOM_DIMENSION,
  ],
  prompts: {
    liveSystemPrompt: buildTalkSystemPrompt,
    evaluatorPrompt: TALK_EVALUATOR_PROMPT,
    buildEvaluationContext: buildTalkEvaluationContext,
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
  // Descriptive, UNSCORED outcome record — no postProcessScores. The
  // audience's declared takeaway is withheld from the live listener and
  // supplied only to the evaluator (see talk-prompts.ts).
  outcome: {
    fields: [
      {
        key: "takeawayHeard",
        label: "Takeaway heard",
        kind: "string",
        required: true,
      },
      {
        key: "matchedDeclaredTakeaway",
        label: "Matched declared takeaway",
        kind: "boolean",
        required: false,
      },
    ],
  },
  timeBudget: {
    totalSeconds: TALK_ENVELOPE_SECONDS[0],
    warnAtRemainingSeconds: 180,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: [
      TALK_ENVELOPE_SECONDS[0],
      TALK_ENVELOPE_SECONDS[1],
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
      id: "talk-audience",
      label: "Your audience",
      customComponent: "TalkAudienceStep",
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
