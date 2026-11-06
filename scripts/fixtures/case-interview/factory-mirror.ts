/**
 * A LOCAL mirror of what `makeProblemInterviewTypeConfig` (engine worker,
 * branch loop/problem-engine) is expected to produce for `consulting`, so the
 * grading study can run before the factory lands.
 *
 * What it assumes the factory does — the integrator must confirm each:
 * 1. extraRubricDimensions = [PROCESS_RIGOR_DIMENSION, ...rubricExtras].
 * 2. outcome.fields = questionId, frameworkKey, processSteps (all strings).
 * 3. evaluatorPrompt = INTERVIEW_EVALUATOR_PROMPT + "\n\n" + evaluatorAddendum.
 * 4. The evaluator user message = the interview envelope (transcript, resume,
 *    role_context, metrics) + a `problem_context` block equal to
 *    `buildCaseEvaluationBrief(question, framework, nudgesIssued)`.
 * If the factory differs, rerun scripts/verify-case-interview-grading.ts
 * against the real registry record.
 */

import { CASE_EVALUATOR_ADDENDUM, CASE_RUBRIC_EXTRAS } from "../../../lib/case-interview/evaluator";
import { INTERVIEW_EVALUATOR_PROMPT } from "../../../lib/interview/prompts";
import { getInterviewType } from "../../../lib/interview/types";
import { PROCESS_RIGOR_DIMENSION, PROBLEM_OUTCOME_FIELD_KEYS } from "../../../lib/problem-interview/types";
import type { InteractionTypeConfig } from "../../../lib/engine/types";

export function mirrorConsultingTypeConfig(): InteractionTypeConfig {
  const base = getInterviewType("consulting")!;
  return {
    slug: base.slug,
    name: base.label,
    description: base.description,
    extraRubricDimensions: [{ ...PROCESS_RIGOR_DIMENSION }, ...CASE_RUBRIC_EXTRAS.map((d) => ({ ...d }))],
    prompts: {
      liveSystemPrompt: () => "",
      evaluatorPrompt: `${INTERVIEW_EVALUATOR_PROMPT}\n\n${CASE_EVALUATOR_ADDENDUM}`,
      buildEvaluationContext: () => ({ kind: "interview" }),
    },
    limits: { targetMinutes: base.targetMinutes, targetQuestionCount: base.targetQuestionCount },
    terminationPolicy: { studentMayEnd: true, avatarMayEnd: false, avatarEndReasons: [] },
    visibleContext: { visibleChannels: "*" },
    outcome: {
      fields: [
        { key: PROBLEM_OUTCOME_FIELD_KEYS.questionId, label: "Question", kind: "string", required: true },
        { key: PROBLEM_OUTCOME_FIELD_KEYS.frameworkKey, label: "Method", kind: "string", required: true },
        { key: PROBLEM_OUTCOME_FIELD_KEYS.processSteps, label: "Process steps", kind: "string", required: true },
      ],
    },
    timeBudget: { totalSeconds: base.targetMinutes * 60, warnAtRemainingSeconds: 120 },
    instance: { required: false },
    checkpointing: "client-driven",
    finishPendingFlip: "request-path",
    supportsRetry: true,
    setupSteps: [],
  };
}

/**
 * Proposed `postProcessScores` for every problem interview: cap
 * `process_rigor` at the band PROCESS_RIGOR_SCORING_GUIDE gives for the
 * evaluator's own step results.
 *
 * Why: the strict json_schema puts the `*_score` properties BEFORE `outcome`,
 * so the model writes process_rigor_score before it has decided the steps.
 * Study run 1–2 showed it overshooting the guide on 3 of 9 transcripts even
 * with explicit "decide steps first" instructions. The cap only ever lowers
 * process_rigor and never invents a score (the hook's contract).
 */
export function processRigorCeiling(steps: { status: string }[]): number | null {
  const applicable = steps.filter((s) => s.status !== "not_applicable");
  if (applicable.length === 0) return null;
  const missed = applicable.filter((s) => s.status === "missed").length;
  const prompted = applicable.filter((s) => s.status === "prompted").length;
  if (missed >= 3) return 1;
  if (missed === 2 || prompted >= 3) return 2;
  if (missed === 1 || prompted === 2) return 3;
  if (prompted === 1) return 4;
  return 5;
}

export function capProcessRigor(
  scores: Record<string, number | null>,
  outcome: Record<string, unknown> | null,
): Record<string, number | null> {
  const current = scores.process_rigor;
  if (typeof current !== "number" || !outcome) return scores;
  let steps: { status: string }[];
  try {
    steps = JSON.parse(String(outcome.processSteps ?? "")) as { status: string }[];
  } catch {
    return scores;
  }
  if (!Array.isArray(steps)) return scores;
  const ceiling = processRigorCeiling(steps);
  return ceiling !== null && current > ceiling ? { ...scores, process_rigor: ceiling } : scores;
}
