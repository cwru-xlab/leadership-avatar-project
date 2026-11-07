/**
 * The `consulting` preset's input to `makeProblemInterviewTypeConfig`
 * ({ base, frameworks, evaluatorAddendum?, rubricExtras?, briefing? }),
 * registered in lib/engine/registry.ts.
 *
 * The bank (`CASE_BANK` in ./cases.ts) is SERVER-ONLY and registered in
 * lib/problem-interview/banks.server.ts. Never import ./cases.ts from this
 * file or anything the registry imports, or interviewer facts and benchmark
 * answers reach the browser.
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
