/**
 * The pitch-deck InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page. Adding this type is the registry entry in lib/engine/registry.ts and
 * nowhere else (REQ-60).
 *
 * AMENDED 2026-10-08 (19-CONTEXT.md, Phase 19 plan 19-03): this type no
 * longer opts into Phase 18's disengagement walk-out. The mechanism itself
 * (lib/engine/disengagement.ts, lib/engine/termination.ts) is untouched and
 * still lives for `pitch-elevator` and for Phase 20's difficult
 * conversations — a pitch rehearsal is simply not where an avatar should
 * abandon a student. `avatarMayEnd: false` and no `disengagementThreshold`
 * key restore the intent Phase 14 originally wrote here, which Phase 18
 * contradicted.
 *
 * AMENDED 2026-10-08 (19-CONTEXT.md amendment, user decision): the investor
 * deck now also declares the shared Phase 13 `interviewer` setup step so all
 * five deck modes pick an avatar the same way. "Investor deck unchanged"
 * governs its ask/equity inputs and its rubric, not its avatar selection.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

import { getDeckMode } from "@/lib/pitch/deck-modes";
import {
  DECK_EVALUATOR_PROMPT,
  buildDeckEvaluationContext,
  buildDeckEvaluationImages,
  buildDeckSystemPrompt,
} from "@/lib/pitch/deck-prompts";
import { SHARED_DECK_DIMENSIONS } from "@/lib/pitch/deck-rubric";
import { DECK_VISIBLE_CONTEXT } from "@/lib/pitch/slides-channel";

// `negotiation` is investor-only per 19-CONTEXT.md and must not migrate into
// the shared SHARED_DECK_DIMENSIONS module — declared here, inline, verbatim.
const NEGOTIATION_DIMENSION: InteractionTypeConfig["extraRubricDimensions"][number] =
  {
    key: "negotiation",
    label: "Negotiation",
    description:
      "Did the founder manage the negotiation, defend the ask with evidence, and land somewhere defensible. 1: folded or never engaged. 5: evidence-backed path to a defensible settlement.",
  };

// The picker, the wizard and this record must not be able to disagree about
// the investor envelope — same fail-loud posture as a missing registry
// preset (lib/engine/registry.ts).
const INVESTOR_DECK_MODE = getDeckMode("pitch-deck");

if (!INVESTOR_DECK_MODE) {
  throw new Error(
    'lib/pitch/deck-type.ts: getDeckMode("pitch-deck") returned null — DECK_MODES is missing its investor row',
  );
}

const DECK_ENVELOPE_SECONDS = INVESTOR_DECK_MODE.envelopeSeconds;

export const PITCH_DECK_TYPE: InteractionTypeConfig = {
  slug: "pitch-deck",
  name: "Investor Pitch Deck",
  description:
    "Walk an investor through your deck, defend your ask with evidence, and negotiate price and equity in a timed practice meeting.",
  // Five extras as FIRST-CLASS dimensions. 13-CONTEXT.md explicitly rejected
  // folding deck quality into `content` as a sub-point. The four shared deck
  // dimensions now come from deck-rubric.ts (19-01) so every deck mode
  // reuses the exact same text; `negotiation` stays investor-only, declared
  // above in this file.
  extraRubricDimensions: [...SHARED_DECK_DIMENSIONS, NEGOTIATION_DIMENSION],
  prompts: {
    liveSystemPrompt: buildDeckSystemPrompt,
    evaluatorPrompt: DECK_EVALUATOR_PROMPT,
    buildEvaluationContext: buildDeckEvaluationContext,
    buildEvaluationImages: buildDeckEvaluationImages,
  },
  // Session length lives in timeBudget (adjustable). A second number here
  // would be a competing source of truth.
  limits: {
    targetMinutes: null,
    targetQuestionCount: null,
  },
  // 19-CONTEXT.md: the deck does not opt into Phase 18's disengagement
  // walk-out. The avatar cannot end this session itself — the founder ends
  // it. No `disengagementThreshold` key: gate 4 of resolveTermination is
  // simply skipped for a type that declares no threshold, which is why
  // `avatarMayEnd: false` + an empty `avatarEndReasons` is also required —
  // dropping the threshold alone would not be enough.
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: false,
    avatarEndReasons: [],
    // Redundant-by-design while avatarMayEnd is false: kept so any future
    // re-opt-in starts from a safe floor instead of firing on turn one.
    avatarEndFloor: { minAssistantTurns: 4 },
  },
  visibleContext: DECK_VISIBLE_CONTEXT,
  // Ask and fair band are deliberately ABSENT — they are instance config,
  // already in inputSnapshot, and were never model-produced. The report
  // composes ask vs settled vs fair from the snapshot plus this record
  // (plan 14-14).
  outcome: {
    fields: [
      {
        key: "dealReached",
        label: "Deal reached",
        kind: "boolean",
        required: true,
      },
      {
        key: "settledPriceUsd",
        label: "Settled price (USD)",
        kind: "number",
        required: false,
      },
      {
        key: "settledEquityPct",
        label: "Settled equity (%)",
        kind: "number",
        required: false,
      },
      {
        key: "negotiationNotes",
        label: "Negotiation notes",
        kind: "string",
        required: false,
      },
    ],
  },
  // totalSeconds is only the pre-proposal default; the real value is the
  // proposal the student adjusts, clamped by clampAdjustableBudget and
  // persisted as timeBudgetSeconds at start (14-05). Do not read totalSeconds
  // as authoritative mid-session.
  timeBudget: {
    totalSeconds: DECK_ENVELOPE_SECONDS[0],
    warnAtRemainingSeconds: 300,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: [
      DECK_ENVELOPE_SECONDS[0],
      DECK_ENVELOPE_SECONDS[1],
    ],
  },
  // Deck is uploaded during setup.
  instance: { required: true, authoredInWizard: true },
  // Decided in 14-05: the server-authoritative reveal mark column and the
  // reveal trail need durable writes across a 20-30 minute session.
  // case-study remains "none".
  checkpointing: "client-driven",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  // CameraConsentStep is appended by SetupWizard for every type (13-09) and
  // must NOT appear here. Plan 14-12 builds the custom components against
  // these declarations.
  setupSteps: [
    {
      id: "deck-upload",
      label: "Upload your deck",
      customComponent: "DeckUploadStep",
    },
    {
      id: "negotiation-ask",
      label: "Your ask",
      customComponent: "NegotiationAskStep",
    },
    {
      id: "session-length",
      label: "Session length",
      customComponent: "SessionLengthStep",
    },
    {
      id: "interviewer",
      label: "Avatar & voice",
      customComponent: "InterviewerStep",
    },
  ],
  // No postProcessScores — the early-end cap is an elevator concern; this
  // type cannot end early.
};
