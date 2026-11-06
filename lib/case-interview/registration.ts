/**
 * Everything the problem-interview type factory needs to register the
 * upgraded `consulting` preset.
 *
 * TODO(integrator, loop/problem-engine): `makeProblemInterviewTypeConfig`
 * does not exist on this branch yet. When it lands, replace the `CONSULTING`
 * record in lib/engine/registry.ts with:
 *
 *   import { CONSULTING_PROBLEM_INTERVIEW_INPUT } from "../case-interview/registration";
 *   const CONSULTING = makeProblemInterviewTypeConfig(CONSULTING_PROBLEM_INTERVIEW_INPUT);
 *
 * keeping the slug "consulting" (old reports persist it). The factory is
 * expected to add the shared `process_rigor` dimension and the
 * `questionId` / `frameworkKey` / `processSteps` outcome fields itself;
 * `rubricExtras` here are ONLY consulting's own extras.
 *
 * Until then the registry keeps building `consulting` with
 * `makeInterviewTypeConfig`, which now reads the upgraded persona and copy
 * from lib/interview/types.ts.
 */

import { getInterviewType, type InterviewType } from "@/lib/interview/types";

import { CASE_BANK } from "./cases";
import { CASE_EVALUATOR_ADDENDUM, CASE_RUBRIC_EXTRAS } from "./evaluator";
import { CASE_FRAMEWORKS } from "./frameworks";

export const CONSULTING_PROBLEM_INTERVIEW_INPUT = {
  base: getInterviewType("consulting") as InterviewType,
  bank: CASE_BANK,
  frameworks: CASE_FRAMEWORKS,
  evaluatorAddendum: CASE_EVALUATOR_ADDENDUM,
  rubricExtras: [...CASE_RUBRIC_EXTRAS],
};
