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

/**
 * PROVISIONAL UNTIL CALIBRATED. Evidence: fixture arithmetic in
 * scripts/verify-disengagement.ts and scripts/verify-hostility-detector.ts
 * only — no live session and no human-labelled transcript. 18-VALIDATION.md's
 * calibration policy governs: do not retune this, the weights below, or the
 * cue acceleration without explicit human calibration approval.
 */
export const CONVERSATION_DISENGAGEMENT_THRESHOLD = 0.6;

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
      // Appended, never reordered — the distinct severe-category reason
      // (REQ-101) so a slur-terminated session is queryably different from
      // an escalation-terminated one. The avatar still ends IN CHARACTER
      // (20-CONTEXT.md's locked decision); this label is reporting-layer
      // only, read by avatarEndReasonByCause below and by 20-04's
      // resolveTermination floor-override carve-out, never surfaced as a
      // break-frame branch in the session shell.
      "offensive_content",
    ],
    // minAssistantTurns: 4 is this plan's Claude's-Discretion floor — a
    // difficult conversation needs more than the opening and one reply before
    // a walk-out leaves gradeable material on clarity, empathy AND holding
    // the line. Reuses 14-02's field; no second floor mechanism. NOT lowered
    // for this phase (20-03): the only exception is severe content's
    // floor-override carve-out, named and tested in `resolveTermination`
    // (20-04's file), not here.
    avatarEndFloor: { minAssistantTurns: 4 },
    // One type-level threshold (REQ-95 / P20-SC1): every seeded conversation
    // and every authored scenario inherits this single number through
    // resolveSessionConfig. No per-scenario field exists anywhere in
    // DifficultConversationRecord (lib/difficult-conversation/types.ts) and
    // scripts/verify-dc-surface-count.ts Section 11 guards mechanically
    // against one ever being added.
    disengagementThreshold: CONVERSATION_DISENGAGEMENT_THRESHOLD,
    /**
     * PROVISIONAL UNTIL CALIBRATED — evidence named at each entry below.
     * `timeBudget.totalSeconds` is null for this type (see below), so
     * `budgetPressure` contributes NOTHING; its share of
     * DEFAULT_DISENGAGEMENT_WEIGHTS (0.25) is therefore redistributed
     * deliberately here, not silently inherited.
     *
     * Arithmetic (excluding `maxCueAcceleration`, which stays at the
     * inherited 0.2 and is NOT overridden):
     *   0 + 0 + 0 + 0.05 + 0.05 + 0.35 + 0.25 + 0 + 0.3 = 1.0
     *   (budgetPressure + turnCountPressure + repeatedResponse +
     *    shortResponseStreak + noCommonGround + hostility +
     *    positionUnacknowledged + severeContent + stonewalling)
     *
     * `hostility` (0.35) is the single largest weight — this phase is about
     * how the student behaved, not merely that the conversation stalled.
     * `stonewalling` (0.3) is deliberately substantial, NOT the plan's
     * originally-sketched near-zero afterthought: the 2026-10-08 amendment
     * to 20-CONTEXT.md requires that sustained pure stonewalling be able to
     * cross this threshold ALONE, and `noCommonGround` / `positionUnacknowledged`
     * / `shortResponseStreak` were rebalanced (not simply left at their
     * pre-amendment values) so that both the stonewalling fixture and the
     * hostility fixture in scripts/verify-disengagement.ts Sections 14-15
     * clear 0.6 by a 0.05 margin — not a floating-point hair (see
     * 20-EPSILON-MARGIN.md) — with hostility crossing at or before the turn
     * stonewalling needs. This REPLACES the plan's originally-sketched
     * 8-weight profile (hostility 0.5 / no stonewalling override), which
     * would have left the amendment's production behavior unimplemented —
     * see this plan's SUMMARY for the full deviation record.
     */
    disengagementWeights: {
      budgetPressure: 0, // timeBudget.totalSeconds is null here
      turnCountPressure: 0,
      repeatedResponse: 0,
      shortResponseStreak: 0.05,
      noCommonGround: 0.05,
      hostility: 0.35, // the single largest term: how the student behaved
      positionUnacknowledged: 0.25,
      // Deliberate 0, not a weight: severe content is a FLOOR CARVE-OUT, not
      // a graded contribution (REQ-100). The override lives in
      // `resolveTermination` (20-04's file). A non-zero weight here would
      // double-count it alongside that floor.
      severeContent: 0,
      // The 2026-10-08 amendment's signal: see the block comment above.
      stonewalling: 0.3,
    },
    // Maps the engine's observable causes onto the closed avatarEndReasons
    // vocabulary above, so no magic string crosses the layering. `walked_out`
    // and `shut_down` stay in the vocabulary for the in-character variants
    // the model may still cite itself; this map only covers the causes the
    // engine itself can observe deterministically.
    avatarEndReasonByCause: {
      severe_content: "offensive_content",
      hostility: "escalated",
      repeated_response: "nothing_left_to_discuss",
      short_response_streak: "nothing_left_to_discuss",
      no_common_ground: "nothing_left_to_discuss",
      position_unacknowledged: "nothing_left_to_discuss",
      turn_count_pressure: "nothing_left_to_discuss",
      stonewalling: "nothing_left_to_discuss",
    },
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
