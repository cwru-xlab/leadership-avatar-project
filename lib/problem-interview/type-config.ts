/**
 * The problem-interview type factory.
 *
 * Registering a problem interview (consulting case, product management) is a
 * small, data-only change:
 *
 *   1. `lib/interview/types.ts` — an `InterviewType` record for the slug in
 *      `INTERVIEW_TYPES` (persona, role, difficulty, targetMinutes). Every
 *      "is this an interview" check in the app keys off that registry.
 *   2. `lib/engine/registry.ts` — `makeProblemInterviewTypeConfig({ base,
 *      frameworks, evaluatorAddendum, rubricExtras, briefing })` in
 *      `ENGINE_TYPES` (replacing `makeInterviewTypeConfig` for that slug).
 *   3. The slug's `ProblemQuestion[]` — preferably in
 *      `lib/problem-interview/banks.server.ts`'s `PROBLEM_BANKS` (server-only:
 *      the bank carries interviewer facts and strong-answer notes, and the
 *      registry above is bundled for the browser). Passing `bank` to the
 *      factory also works and keeps the content branches' call shape, at the
 *      cost of shipping the bank in client JS.
 *
 * Everything else (question selection, live prompt, markers, exhibit card,
 * evaluator composition, report panels) is generic machinery keyed off the
 * `problemInterview` field this factory sets.
 */

import type {
  InteractionTypeConfig,
  ProblemInterviewBriefing,
  RubricDimension,
} from "@/lib/engine/types";
import type { InterviewType } from "@/lib/interview/types";

import { INTERVIEW_EVALUATOR_PROMPT } from "@/lib/interview/prompts";
import { resolveAttemptLanguage } from "@/lib/languages";

import {
  PROBLEM_OUTCOME_FIELD_KEYS,
  PROCESS_RIGOR_DIMENSION,
  type ProblemQuestion,
  type ProcessFramework,
} from "./types";
import { registerFactoryBank } from "./bank-registry";
import { markProblemInterviewSlug } from "./problem-slugs";
import {
  buildProblemEvaluatorRules,
  buildProblemInterviewSystemPrompt,
} from "./prompts";

export interface MakeProblemInterviewTypeConfigInput {
  /** The slug's `INTERVIEW_TYPES` record. Its slug becomes the engine slug. */
  base: InterviewType;
  /**
   * The question bank. Optional: prefer registering it in
   * `banks.server.ts` (server-only, takes precedence) — a bank passed here
   * is reachable from the browser bundle. See `./bank-registry.ts`.
   */
  bank?: readonly ProblemQuestion[];
  /** Every framework a question in this type's bank may name. */
  frameworks: ProcessFramework[];
  /** Type-specific evaluator guidance, appended after the shared rules. */
  evaluatorAddendum?: string;
  /** Dimensions beyond `process_rigor` (e.g. `quantitative`). */
  rubricExtras?: RubricDimension[];
  /** Briefing-step copy. Defaults to a generic problem-interview briefing. */
  briefing?: ProblemInterviewBriefing;
}

export const DEFAULT_PROBLEM_BRIEFING: ProblemInterviewBriefing = {
  headline: "One problem, worked out loud",
  points: [
    "After a short question about you, the interviewer poses one problem.",
    "Think out loud. Ask for any information you need — the interviewer answers what you ask, not more.",
    "Data may appear on your screen during the interview.",
    "Finish with a clear answer or recommendation.",
  ],
};

export function makeProblemInterviewTypeConfig({
  base,
  bank,
  frameworks,
  evaluatorAddendum = "",
  rubricExtras = [],
  briefing = DEFAULT_PROBLEM_BRIEFING,
}: MakeProblemInterviewTypeConfigInput): InteractionTypeConfig {
  if (frameworks.length === 0) {
    throw new Error(`problem interview "${base.slug}" declares no frameworks`);
  }
  if (bank) registerFactoryBank(base.slug, bank);
  markProblemInterviewSlug(base.slug);
  const extraRubricDimensions: RubricDimension[] = [
    { ...PROCESS_RIGOR_DIMENSION },
    ...rubricExtras.filter((dim) => dim.key !== PROCESS_RIGOR_DIMENSION.key),
  ];

  const evaluatorPrompt = [
    INTERVIEW_EVALUATOR_PROMPT.trim(),
    buildProblemEvaluatorRules(
      frameworks,
      extraRubricDimensions.map((dim) => dim.key),
    ),
    evaluatorAddendum.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    slug: base.slug,
    name: base.label,
    description: base.description,
    problemInterview: { frameworks, briefing },
    extraRubricDimensions,
    prompts: {
      liveSystemPrompt: (config, extra) => {
        if (!extra.problem) {
          // No silent default: a problem interview without its pinned
          // question would quietly become a generic interview.
          throw new Error(
            `problem interview "${base.slug}": no pinned question for the live prompt`,
          );
        }
        const resolvedBase: InterviewType = config.customization
          ? {
              ...base,
              defaultIndustry: config.customization.industry,
              defaultRoleTitle: config.customization.roleTitle,
              difficulty: config.customization.difficulty as InterviewType["difficulty"],
              targetMinutes: config.customization.targetMinutes,
              targetQuestionCount: config.customization.targetQuestionCount,
              interviewerPersona: config.customization.interviewerPersona,
            }
          : base;
        return buildProblemInterviewSystemPrompt(resolvedBase, {
          question: extra.problem.question,
          framework: extra.problem.framework,
          resumeText: extra.resumeText ?? "",
          jobDescriptionText: extra.jobDescriptionText ?? "",
          language: extra.language ?? resolveAttemptLanguage(undefined),
        });
      },
      evaluatorPrompt,
      // The runner rebuilds the interview context from the stored snapshot
      // and appends the problem brief (lib/engine/evaluation-runner.ts).
      buildEvaluationContext: (config) => ({
        kind: "interview",
        customization: config.customization,
      }),
    },
    limits: {
      targetMinutes: base.targetMinutes,
      // One problem. The live shell shows stages, not a question count.
      targetQuestionCount: 1,
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
        { key: PROBLEM_OUTCOME_FIELD_KEYS.frameworkKey, label: "Framework", kind: "string" },
        { key: PROBLEM_OUTCOME_FIELD_KEYS.processSteps, label: "Process steps", kind: "string" },
      ],
    },
    timeBudget: {
      totalSeconds: base.targetMinutes * 60,
      warnAtRemainingSeconds: null,
    },
    instance: { required: false },
    checkpointing: "client-driven",
    finishPendingFlip: "request-path",
    supportsRetry: true,
    // Same steps as every interview preset; the briefing step reads
    // `problemInterview.briefing` to say what kind of interview this is.
    setupSteps: [
      { id: "interviewer", label: "Interviewer", customComponent: "InterviewerStep" },
      { id: "resume", label: "Resume", customComponent: "ResumeStep", optional: true },
      {
        id: "job-description",
        label: "Job posting",
        customComponent: "JobDescriptionStep",
        optional: true,
      },
      {
        id: "background-reminder",
        label: "Briefing",
        customComponent: "InterviewBackgroundReminderStep",
      },
    ],
  };
}
