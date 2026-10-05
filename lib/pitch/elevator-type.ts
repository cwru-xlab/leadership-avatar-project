/**
 * The pitch-elevator InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no report
 * page. Adding this type is the registry entry in lib/engine/registry.ts and
 * nowhere else (REQ-60).
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";
import { applyEarlyEndCap } from "@/lib/pitch/score-caps";
import {
  ELEVATOR_EVALUATOR_PROMPT,
  buildElevatorEvaluationContext,
  buildElevatorSystemPrompt,
} from "@/lib/pitch/elevator-prompts";

/** Tuned only through recorded Phase 18 calibration evidence. */
export const ELEVATOR_DISENGAGEMENT_THRESHOLD = 0.72;

export const PITCH_ELEVATOR_TYPE: InteractionTypeConfig = {
  slug: "pitch-elevator",
  name: "Elevator Pitch",
  description:
    "Practice a 30–60 second spoken pitch to a specific listener, discover what they care about, and earn follow-ups — or a polite early exit.",
  // Two extras only. Delivery is already covered by the shared `vocal`
  // dimension and structure by `content`; a third extra for either would
  // duplicate a shared dimension, which resolve.ts rejects.
  extraRubricDimensions: [
    {
      key: "discovery_tailoring",
      label: "Listener discovery & tailoring",
      description:
        "Did the student learn something specific about this listener before pitching, and did the pitch then speak to that person's interests and priorities. 1: pitched a generic pitch with no discovery. 5: found common ground and tailored the ask to what this listener actually cares about.",
    },
    {
      key: "concision",
      label: "Concision",
      description:
        "Did the pitch land the essential information inside roughly 30-60 seconds and leave room for follow-up. 1: consumed the whole encounter without a clear ask. 5: crisp, complete, and left space for dialogue.",
    },
  ],
  prompts: {
    liveSystemPrompt: buildElevatorSystemPrompt,
    evaluatorPrompt: ELEVATOR_EVALUATOR_PROMPT,
    buildEvaluationContext: buildElevatorEvaluationContext,
    // No buildEvaluationImages — there is no document in this sublayer.
  },
  // CONTEXT.md: follow-ups are open-ended with no fixed count and no fixed
  // duration. A number here would contradict that.
  limits: {
    targetMinutes: null,
    targetQuestionCount: null,
  },
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: true,
    avatarEndReasons: [
      "pitch_too_long",
      "no_common_ground",
      "unclear_ask",
      "lost_interest",
    ],
    // minAssistantTurns: 2 is the floor's concrete shape (Claude's Discretion)
    // — the avatar's reply to the pitch itself, plus one further exchange.
    // That guarantees every session has the pitch and at least one real
    // back-and-forth to grade (CONTEXT.md: "the pitch plus at least one
    // exchange").
    avatarEndFloor: { minAssistantTurns: 2 },
    disengagementThreshold: ELEVATOR_DISENGAGEMENT_THRESHOLD,
  },
  // Permissive default — there is no document to gate.
  visibleContext: { visibleChannels: "*" },
  // The ENGINE already records terminationReason and terminationAtSeconds as
  // columns; the outcome record carries only what the model alone can know —
  // the prose reasons behind the walk-out and whether common ground was
  // actually established. Do not duplicate the columns here.
  outcome: {
    fields: [
      {
        key: "earlyEndReasons",
        label: "Early-end reasons",
        kind: "string",
        required: false,
      },
      {
        key: "commonGroundFound",
        label: "Common ground found",
        kind: "boolean",
        required: true,
      },
    ],
  },
  // The SESSION has no budget (open-ended follow-ups); the 60-second figure
  // is the soft window on the student's opening turn, and it is soft by
  // construction — lib/engine/time-budget.ts has no hard-stop output.
  timeBudget: {
    totalSeconds: null,
    warnAtRemainingSeconds: null,
    firstTurnWindowSeconds: 60,
    adjustableRangeSeconds: null,
  },
  // Pitch subject and knowledge level are collected in the wizard, so the
  // instance does not exist before setup runs.
  instance: { required: true, authoredInWizard: true },
  // Decided in 14-05: a short session with no cursor to persist.
  checkpointing: "none",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  // CameraConsentStep is appended by SetupWizard for every type (13-09) and
  // must NOT appear here. Plan 14-10 builds PitchSubjectStep /
  // ListenerKnowledgeStep against these declarations.
  setupSteps: [
    {
      id: "pitch-subject",
      label: "What you're pitching",
      customComponent: "PitchSubjectStep",
    },
    {
      id: "listener-knowledge",
      label: "Listener knowledge",
      customComponent: "ListenerKnowledgeStep",
    },
  ],
  postProcessScores: applyEarlyEndCap,
};
