/**
 * INTERIM problem-interview type builder for the PM preset.
 *
 * TODO(problem-engine): delete this file once the engine worker's
 * `makeProblemInterviewTypeConfig({ base, bank, frameworks, evaluatorAddendum,
 * rubricExtras })` lands, and build `PRODUCT_MANAGEMENT_TYPE` in ./type.ts
 * from `PM_TYPE_INPUT` with it instead. Everything here is a local MIRROR of
 * what that factory is specified to produce, kept just complete enough that
 *   (1) `lib/engine/registry.ts`'s module-scope check passes for the new slug,
 *   (2) scripts/verify-pm-interview-grading.ts can run the PM evaluator
 *       through the app's real `runEvaluation` path with real OpenAI.
 *
 * Known interim limitations (all owned by the engine factory):
 *   - Question selection per session is not wired: the live prompt and
 *     evaluator use `defaultQuestionId` unless a question is passed.
 *   - No exhibit/nudge marker handling in the session or report.
 */

import type {
  InteractionTypeConfig,
  RubricDimension,
} from "@/lib/engine/types";
import type { InterviewType } from "@/lib/interview/types";
import { INTERVIEW_EVALUATOR_PROMPT } from "@/lib/interview/prompts";
import {
  PROBLEM_OUTCOME_FIELD_KEYS,
  PROCESS_RIGOR_DIMENSION,
  PROCESS_RIGOR_SCORING_GUIDE,
  PROCESS_STEP_STATUSES,
  type ProblemQuestion,
  type ProcessFramework,
} from "@/lib/problem-interview/types";

export interface ProblemInterviewTypeInput {
  base: InterviewType;
  bank: ProblemQuestion[];
  frameworks: Record<string, ProcessFramework>;
  evaluatorAddendum: string;
  rubricExtras: RubricDimension[];
}

/** The per-question block the evaluator needs. Generic over PM and case. */
export function buildProcessEvaluatorBlock(
  question: ProblemQuestion,
  framework: ProcessFramework,
): string {
  const steps = framework.steps
    .map(
      (s, i) =>
        `${i + 1}. key="${s.key}" — ${s.label}: ${s.description}\n   HIT when: ${s.evidenceCriteria}\n   Interviewer's neutral nudge for this step: "${s.nudge}"`,
    )
    .join("\n");
  const exhibits = (question.exhibits ?? [])
    .map(
      (e) =>
        `- Exhibit ${e.id} "${e.title}" (${e.caption ?? ""}): columns ${JSON.stringify(e.columns)}, rows ${JSON.stringify(e.rows)}. Key insight: ${e.keyInsight}`,
    )
    .join("\n");

  return `
THE PROBLEM THIS SESSION
question_id: ${question.id}
family: ${question.family}
prompt the interviewer posed: "${question.prompt}"
facts the interviewer could give when asked:
${question.interviewerFacts.map((f) => `- ${f}`).join("\n")}
${exhibits ? `exhibits the interviewer could reveal when asked:\n${exhibits}\n` : ""}strong answer reference (NOT an answer key): ${question.strongAnswerNotes}

THE METHOD TO CHECK: ${framework.label} (${framework.source})
${steps}

STEP STATUSES — exactly one of ${PROCESS_STEP_STATUSES.map((s) => `"${s}"`).join(", ")}:
- hit: the candidate did it unprompted and it meets the HIT criteria.
- prompted: the candidate only did it after the interviewer asked about it (the
  nudge above, or any similar open question), OR did it partially and only
  completed it after such a question.
- missed: never done to the HIT criteria, nudged or not. A token or generic
  attempt that does not meet the criteria is missed, not hit.
- not_applicable: only when the step cannot apply to this question (e.g. no
  metric change to diagnose) or the session ended before it through no fault of
  the candidate. Never use it to excuse a skipped step.

${PROCESS_RIGOR_DIMENSION.key}_score — ${PROCESS_RIGOR_DIMENSION.description}
${PROCESS_RIGOR_SCORING_GUIDE}

OUTCOME — fill the "outcome" object:
- ${PROBLEM_OUTCOME_FIELD_KEYS.questionId}: "${question.id}"
- ${PROBLEM_OUTCOME_FIELD_KEYS.frameworkKey}: "${framework.key}"
- ${PROBLEM_OUTCOME_FIELD_KEYS.processSteps}: a JSON-ENCODED STRING (not an object) of an array with
  one entry per step above, in order:
  [{"key": "<step key>", "status": "hit|prompted|missed|not_applicable",
    "evidenceQuote": "<verbatim candidate words, or \\"\\" when missed>",
    "timecodeSeconds": <seconds from the [m:ss] stamp of the evidence, or null>,
    "note": "<one sentence of coaching for this step>"}]
`.trim();
}

/** Full evaluator system prompt for one question (base + process + addendum). */
export function buildProblemEvaluatorPrompt(
  input: ProblemInterviewTypeInput,
  question: ProblemQuestion,
): string {
  const framework = input.frameworks[question.frameworkKey];
  if (!framework) {
    throw new Error(
      `question "${question.id}" names unknown framework "${question.frameworkKey}"`,
    );
  }
  return [
    INTERVIEW_EVALUATOR_PROMPT,
    `THIS IS A PROBLEM-SOLVING INTERVIEW. Besides the four categories above, score every additional *_score property in the schema. Treat the short fit question at the start as context only; grade the problem.`,
    buildProcessEvaluatorBlock(question, framework),
    input.evaluatorAddendum,
  ].join("\n\n");
}

/** Interim live prompt: session-constant, one question. */
export function buildProblemLivePrompt(
  input: ProblemInterviewTypeInput,
  question: ProblemQuestion,
): string {
  const framework = input.frameworks[question.frameworkKey];
  const nudges = framework
    ? framework.steps
        .map((s) => `- step "${s.key}": "${s.nudge}"`)
        .join("\n")
    : "";
  const exhibits = (question.exhibits ?? [])
    .map(
      (e) =>
        `- ${e.id} "${e.title}" — reveal ${e.revealWhen}. Emit <interview-turn kind="exhibit" exhibit="${e.id}" /> when you hand it over and describe it in one sentence; do not interpret it.`,
    )
    .join("\n");
  return `You are playing ${input.base.interviewerPersona}.
You are interviewing a candidate for ${input.base.defaultRoleTitle}. Target length: ${input.base.targetMinutes} minutes.

STAGES
1. Fit (~4 min): greet briefly, then ask ONE question about why they want to be a product manager or a product they admire, with at most one follow-up.
2. Problem (~22 min): pose exactly this, word for word, and nothing more: "${question.prompt}"
   Let the candidate drive. Answer clarifying questions using ONLY these facts, and only the ones asked about:
${question.interviewerFacts.map((f) => `   - ${f}`).join("\n")}
   If asked something not covered, say it's their call and to state an assumption.
${exhibits ? `   Exhibits:\n${exhibits
    .split("\n")
    .map((l) => `   ${l}`)
    .join("\n")}\n` : ""}3. Close (~4 min): ask if they have questions for you, answer briefly in character, and close.

NEUTRAL NUDGES — if the candidate clearly skips one of these and moves on, ask its question ONCE, in your own words, and emit <interview-turn kind="nudge" step="<step key>" />. Never name a step, a framework, or what a good answer contains:
${nudges}

NEVER coach, praise structure, suggest a framework, or evaluate answers aloud. One question per reply; keep replies short and conversational.`;
}

/** Interim mirror of the engine factory's output. */
export function makeInterimProblemInterviewTypeConfig(
  input: ProblemInterviewTypeInput,
  defaultQuestionId: string,
): InteractionTypeConfig {
  const question =
    input.bank.find((q) => q.id === defaultQuestionId) ?? input.bank[0]!;
  return {
    slug: input.base.slug,
    name: input.base.label,
    description: input.base.description,
    extraRubricDimensions: [
      { ...PROCESS_RIGOR_DIMENSION },
      ...input.rubricExtras,
    ],
    prompts: {
      liveSystemPrompt: () => buildProblemLivePrompt(input, question),
      evaluatorPrompt: buildProblemEvaluatorPrompt(input, question),
      buildEvaluationContext: (config) => ({
        kind: "interview",
        customization: config.customization,
      }),
    },
    limits: {
      targetMinutes: input.base.targetMinutes,
      targetQuestionCount: input.base.targetQuestionCount,
    },
    terminationPolicy: {
      studentMayEnd: true,
      avatarMayEnd: false,
      avatarEndReasons: [],
    },
    visibleContext: { visibleChannels: "*" },
    outcome: {
      fields: [
        { key: PROBLEM_OUTCOME_FIELD_KEYS.questionId, label: "Question", kind: "string" },
        { key: PROBLEM_OUTCOME_FIELD_KEYS.frameworkKey, label: "Method", kind: "string" },
        { key: PROBLEM_OUTCOME_FIELD_KEYS.processSteps, label: "Process steps", kind: "string" },
      ],
    },
    timeBudget: {
      totalSeconds: input.base.targetMinutes * 60,
      warnAtRemainingSeconds: 120,
    },
    instance: { required: false },
    checkpointing: "client-driven",
    finishPendingFlip: "request-path",
    supportsRetry: true,
    setupSteps: [
      { id: "interviewer", label: "Interviewer", customComponent: "InterviewerStep" },
      { id: "resume", label: "Resume", customComponent: "ResumeStep", optional: true },
      {
        id: "background-reminder",
        label: "Briefing",
        customComponent: "InterviewBackgroundReminderStep",
      },
    ],
  };
}
