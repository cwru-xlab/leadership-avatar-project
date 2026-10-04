/**
 * The difficult-conversation InteractionTypeConfig record.
 *
 * One config record plus prompts — no route, no evaluator module, no session
 * shell, no report page. Adding this type is the registry entry in
 * lib/engine/registry.ts and nowhere else (REQ-60).
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";
import {
  CONVERSATION_EVALUATOR_PROMPT,
  buildConversationEvaluationContext,
  buildConversationSystemPrompt,
  buildInCharacterReminder,
} from "@/lib/difficult-conversation/conversation-prompts";

export const DIFFICULT_CONVERSATION_TYPE: InteractionTypeConfig = {
  slug: "difficult-conversation",
  name: "Difficult Conversations",
  description:
    "Practise a hard interpersonal conversation in character — clarity, empathy, and holding the line under real pushback.",
  // Four extras → eight dimensions total. Research Section G: no
  // dimension-count cap (pitch-deck already ships nine). Eight cards is a
  // report-layout legibility concern for plan 15-09, not a technical one.
  extraRubricDimensions: [
    {
      key: "clarity",
      label: "Clarity",
      description:
        "Was the problem, the expectation or the ask stated unambiguously, or was it buried in hedging, preamble and implication? 1: the other person could leave unsure what was asked. 5: the ask was unmistakable.",
    },
    {
      key: "empathy",
      label: "Empathy",
      description:
        "Did the student acknowledge and respond to the other person's position — what they said, not what the student came in expecting — or steamroll / read from a script? Acknowledging is not agreeing. 1: ignored their side. 5: responded to what they actually said.",
    },
    {
      key: "holding_the_line",
      label: "Holding the line",
      description:
        "Did the student maintain their position under pushback without becoming hostile? 1: caved or escalated into attack. 5: restated calmly, conceded what is true, held what matters.",
    },
    {
      key: "objective_achieved",
      label: "Objective achieved",
      description:
        "Scores the APPROACH, not the result — how effectively the student pursued their stated objective. A skilful pursuit against an immovable character can still score high; getting the outcome because the character folded easily does not.",
    },
  ],
  prompts: {
    liveSystemPrompt: (config) => buildConversationSystemPrompt(config),
    evaluatorPrompt: CONVERSATION_EVALUATOR_PROMPT,
    buildEvaluationContext: buildConversationEvaluationContext,
    buildTailFragment: buildInCharacterReminder,
    // No buildEvaluationImages — there is no document here.
  },
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: true,
    avatarEndReasons: [
      "walked_out",
      "shut_down",
      "escalated",
      "nothing_left_to_discuss",
    ],
    // minAssistantTurns: 4 is this plan's Claude's-Discretion floor — a
    // difficult conversation needs more than the opening and one reply before
    // a walk-out leaves gradeable material on clarity, empathy AND holding
    // the line. Reuses 14-02's field; no second floor mechanism.
    avatarEndFloor: { minAssistantTurns: 4 },
  },
  // terminationReason and the session's own timing are already engine
  // columns — do not duplicate them here (14-08's precedent).
  outcome: {
    fields: [
      {
        key: "objectiveStatus",
        label: "Objective status",
        kind: "string",
        required: true,
      },
      {
        key: "objectiveNote",
        label: "Objective note",
        kind: "string",
        required: true,
      },
      {
        key: "inRoleReaction",
        label: "In-role reaction",
        kind: "string",
        required: true,
      },
      {
        // Nested { timecodeSeconds, quote, effect }[] is prompt-instructed;
        // OutcomeFieldKind has no array member, so the schema carries a string
        // (JSON array text) the same way networking carries closed string enums.
        key: "reactionCauses",
        label: "Reaction causes",
        kind: "string",
        required: true,
      },
      {
        key: "endTurnReasons",
        label: "End-turn reasons",
        kind: "string",
        required: false,
      },
      {
        key: "endTurnTimecodeSeconds",
        label: "End-turn timecode (seconds)",
        kind: "number",
        required: false,
      },
    ],
  },
  // CONTEXT.md explicitly rejects letting the outcome cap or lift dimensions,
  // so Phase 14's early-end cap pattern is deliberately not reused. A reviewer
  // seeing no postProcessScores hook should see this comment.
  // postProcessScores: absent on purpose.
  timeBudget: {
    // CONTEXT.md locks no visible timer and no time envelope.
    totalSeconds: null,
    warnAtRemainingSeconds: null,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: null,
  },
  limits: { targetMinutes: null, targetQuestionCount: null },
  // Instance is a pre-existing seeded or authored record from a catalog —
  // consumes 13-11's /practice/[type]/[instanceId] page as-is.
  // authoredInWizard absent/false.
  instance: { required: true },
  // Matching case-study; there is no server-side cursor to persist.
  checkpointing: "none",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  // Responsive resistance needs only the model's own visible conversation —
  // research Section G confirms no new primitive is required.
  visibleContext: { visibleChannels: "*" },
  // Declarations only — plan 15-08 builds the components. CameraConsentStep
  // is appended by SetupWizard for every type (13-09) and must NOT appear here.
  setupSteps: [
    {
      id: "conversation-briefing",
      label: "Briefing",
      customComponent: "ConversationBriefingStep",
    },
    {
      id: "conversation-difficulty",
      label: "Difficulty",
      customComponent: "ConversationDifficultyStep",
    },
  ],
};
