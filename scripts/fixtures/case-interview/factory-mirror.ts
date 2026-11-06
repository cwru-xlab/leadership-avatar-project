/**
 * FALLBACK ONLY. A local mirror of `makeProblemInterviewTypeConfig` and the
 * evaluator brief from branch loop/problem-engine (commit c3365be), used by
 * scripts/verify-case-interview-grading.ts when the engine modules are not on
 * the branch. When `lib/problem-interview/type-config.ts` exists the script
 * uses the REAL factory, registry and runEvaluation instead, and this file is
 * unused. Delete it once both branches are merged.
 *
 * Mirrors: extraRubricDimensions = [process_rigor, ...extras]; outcome fields
 * questionId / frameworkKey / processSteps; evaluatorPrompt = interview
 * prompt + shared problem rules (abridged here) + the type addendum; the
 * user message's `problem_interview` block; the process_rigor ceiling.
 */

import { CASE_EVALUATOR_ADDENDUM, CASE_RUBRIC_EXTRAS } from "../../../lib/case-interview/evaluator";
import {
  PROCESS_RIGOR_SCORING_GUIDE,
  type ProblemQuestion,
  type ProcessFramework,
} from "../../../lib/problem-interview/types";
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
      evaluatorPrompt: [INTERVIEW_EVALUATOR_PROMPT.trim(), MIRROR_SHARED_RULES, CASE_EVALUATOR_ADDENDUM].join("\n\n"),
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

/** Abridged copy of the engine's `buildProblemEvaluatorRules`. */
const MIRROR_SHARED_RULES = `
PROBLEM INTERVIEW — ADDITIONAL RULES
This was a problem-solving interview: a short fit question, then ONE problem the
candidate worked through out loud. The user message carries a problem_interview
block: the question, the interviewer's facts, the exhibits and what a strong
candidate reads from each, reference notes on a strong answer, the framework
being graded, and interviewer_events recorded by the server.

GRADING THE PROCESS
- Grade every step of the named framework as one of: hit, prompted, missed, not_applicable.
  - hit: the candidate did it unprompted. Quote their words.
  - prompted: they did it only after the interviewer's nudge for that step.
  - missed: they never did it, nudged or not.
  - not_applicable: the session ended before the step could be reached through no
    fault of the candidate's process. Never use it to excuse a skipped step.
- interviewer_events is GROUND TRUTH. A step the server recorded as nudged can
  never be "hit".
- The reference notes are a reference, not an answer key.
- Timecodes: the [m:ss] stamp of the evidence line, in seconds; null when none.

SCORES
- "process_rigor_score": 1-5
${PROCESS_RIGOR_SCORING_GUIDE}
- Also return "quantitative_score": 1-5, "synthesis_score": 1-5.
- content_score covers the quality of the analysis and the final answer; do not
  double-count process gaps there.

OUTCOME
Also return an "outcome" object with exactly these keys:
- "questionId", "frameworkKey": copied exactly from the problem_interview block.
- "processSteps": a JSON-encoded STRING holding one object per framework step, in
  order: {"key","status","evidenceQuote","timecodeSeconds","note"}.
`.trim();

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Abridged copy of the engine's `buildProblemEvaluatorBrief`. */
export function mirrorEvaluatorBrief(
  question: ProblemQuestion,
  framework: ProcessFramework,
  nudges: { stepKey: string; atSeconds: number }[],
): string {
  const events = nudges.length
    ? nudges.map((n) => `- [${clock(n.atSeconds)}] the interviewer nudged step "${n.stepKey}" — that step cannot be "hit".`)
    : ["- (none recorded)"];
  return [
    "problem_interview:",
    `question_id: ${question.id}`,
    `framework_key: ${framework.key}`,
    `title: ${question.title}`,
    `family: ${question.family}; difficulty: ${question.difficulty}`,
    `prompt: ${question.prompt}`,
    `interviewer_facts (given only when asked):\n${question.interviewerFacts.map((f) => `- ${f}`).join("\n")}`,
    (question.exhibits ?? []).length
      ? `exhibits:\n${(question.exhibits ?? []).map((e) => `- ${e.id} "${e.title}". Key insight: ${e.keyInsight}`).join("\n")}`
      : "",
    `reference_notes (a reference, not an answer key): ${question.strongAnswerNotes}`,
    `graded_framework:\n${[
      `Framework key="${framework.key}" — ${framework.label}`,
      ...framework.steps.map((st) => `  - step="${st.key}" — ${st.label}. Counts as hit when: ${st.evidenceCriteria}`),
    ].join("\n")}`,
    `interviewer_events (server-recorded ground truth; times are approximate):\n${events.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
