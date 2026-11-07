/**
 * The upgraded `consulting` preset's input to the problem-interview type
 * factory, in the signature of `makeProblemInterviewTypeConfig` on branch
 * loop/problem-engine (commit c3365be):
 *   { base, frameworks, evaluatorAddendum?, rubricExtras?, briefing? }
 *
 * TODO(integrator): the factory is not on this branch. After merging
 * loop/problem-engine:
 *   1. lib/engine/registry.ts — replace
 *        const CONSULTING = makeInterviewTypeConfig(getInterviewType("consulting")!);
 *      with
 *        const CONSULTING = makeProblemInterviewTypeConfig(CONSULTING_PROBLEM_INTERVIEW_INPUT);
 *      (slug stays "consulting"; old reports keep resolving).
 *   2. lib/problem-interview/banks.server.ts — add
 *        consulting: CASE_BANK   (import from "@/lib/case-interview/cases")
 *      to PROBLEM_BANKS. The bank is SERVER-ONLY: never import
 *      lib/case-interview/cases.ts from this file or anything the registry
 *      imports, or interviewer facts and benchmark answers reach the browser.
 *
 * This module is safe for the registry to import: frameworks, the addendum,
 * the extras and the briefing are all meant to be public.
 */

import { getInterviewType, type InterviewType } from "@/lib/interview/types";

import { CASE_EVALUATOR_ADDENDUM, CASE_RUBRIC_EXTRAS } from "./evaluator";
import { CASE_FRAMEWORKS } from "./frameworks";
import { CASE_BRIEFING } from "./live";

export const CONSULTING_PROBLEM_INTERVIEW_INPUT = {
  base: getInterviewType("consulting") as InterviewType,
  frameworks: CASE_FRAMEWORKS,
  evaluatorAddendum: CASE_EVALUATOR_ADDENDUM,
  rubricExtras: CASE_RUBRIC_EXTRAS.map((dim) => ({ ...dim })),
  briefing: CASE_BRIEFING,
};
