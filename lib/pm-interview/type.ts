/**
 * The `product-management` engine type record.
 *
 * `PM_TYPE_INPUT` is exactly the argument the problem-interview engine's
 * factory takes. Until that factory exists on this branch, the record is
 * built by the local interim mirror.
 *
 * TODO(problem-engine): replace the interim call with
 *   export const PRODUCT_MANAGEMENT_TYPE = makeProblemInterviewTypeConfig(PM_TYPE_INPUT);
 * and delete ./interim-config.ts.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";
import { getInterviewType } from "@/lib/interview/types";

import { PM_FRAMEWORKS } from "./frameworks";
import { makeInterimProblemInterviewTypeConfig, type ProblemInterviewTypeInput } from "./interim-config";
import { PM_EVALUATOR_ADDENDUM, PM_INTERVIEW_SLUG, PM_RUBRIC_EXTRAS } from "./prompts";
import { PM_QUESTION_BANK } from "./questions";

export const PM_TYPE_INPUT: ProblemInterviewTypeInput = {
  base: getInterviewType(PM_INTERVIEW_SLUG)!,
  bank: PM_QUESTION_BANK,
  frameworks: PM_FRAMEWORKS,
  evaluatorAddendum: PM_EVALUATOR_ADDENDUM,
  rubricExtras: PM_RUBRIC_EXTRAS,
};

export const PRODUCT_MANAGEMENT_TYPE: InteractionTypeConfig =
  makeInterimProblemInterviewTypeConfig(PM_TYPE_INPUT, "pm-design-alarm-clock-deaf");
