/**
 * The pitch-deck InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page. Adding this type is the registry entry in lib/engine/registry.ts and
 * nowhere else (REQ-60).
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";

import {
  DECK_EVALUATOR_PROMPT,
  buildDeckEvaluationContext,
  buildDeckEvaluationImages,
  buildDeckSystemPrompt,
} from "@/lib/pitch/deck-prompts";
import { DECK_ENVELOPE_SECONDS } from "@/lib/pitch/session-length";
import { DECK_VISIBLE_CONTEXT } from "@/lib/pitch/slides-channel";

export const PITCH_DECK_TYPE: InteractionTypeConfig = {
  slug: "pitch-deck",
  name: "Investor Pitch Deck",
  description:
    "Walk an investor through your deck, defend your ask with evidence, and negotiate price and equity in a timed practice meeting.",
  // Five extras as FIRST-CLASS dimensions. 13-CONTEXT.md explicitly rejected
  // folding deck quality into `content` as a sub-point.
  extraRubricDimensions: [
    {
      key: "deck_structure",
      label: "Deck structure",
      description:
        "Narrative arc and ordering — whether the essential investor questions are answered and in a sensible order. 1: slides feel random or skip the ask. 5: clear arc that builds to a defensible ask.",
    },
    {
      key: "deck_text_density",
      label: "Slide text density",
      description:
        "Wordiness per slide — walls of text, bullet overload, judged from extracted text. 1: dense slides the audience cannot scan. 5: spare, readable slides that support speech.",
    },
    {
      key: "deck_visual_quality",
      label: "Slide visual appearance",
      description:
        "Hierarchy, legibility, alignment, consistency — judged from the rendered slide images, not from word counts. 1: careless or illegible. 5: look made with care and read at a glance.",
    },
    {
      key: "slide_speech_correlation",
      label: "Slide / speech correlation",
      description:
        "Did the talk track track the slide on screen (and slides shown so far), unless a question pulled the conversation elsewhere. 1: speech ignored the deck. 5: speech and slides stayed aligned.",
    },
    {
      key: "negotiation",
      label: "Negotiation",
      description:
        "Did the founder manage the negotiation, defend the ask with evidence, and land somewhere defensible. 1: folded or never engaged. 5: evidence-backed path to a defensible settlement.",
    },
  ],
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
  // CONTEXT.md: no hard finish, no in-character meeting close that ends the
  // session. avatarMayEnd: false makes that STRUCTURAL — even if a model
  // emits a termination marker, resolveTermination rejects it. Deliberately
  // the opposite of pitch-elevator.
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: false,
    avatarEndReasons: [],
    avatarEndFloor: null,
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
  ],
  // No postProcessScores — the early-end cap is an elevator concern; this
  // type cannot end early.
};
