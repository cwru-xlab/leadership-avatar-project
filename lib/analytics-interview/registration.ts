/**
 * The `data-analytics` preset's input to `makeProblemInterviewTypeConfig`
 * (lib/problem-interview/type-config.ts). Used by lib/engine/registry.ts.
 *
 * Safe for the registry (and so the browser bundle) to import: frameworks,
 * the evaluator addendum, the rubric extras and the briefing are public. The
 * question bank is NOT passed here — it is registered server-side in
 * lib/problem-interview/banks.server.ts (`./questions.ts` must never be
 * imported from this file or anything the registry imports).
 */

import { getInterviewType, type InterviewType } from "@/lib/interview/types";

import { ANALYTICS_EVALUATOR_ADDENDUM, ANALYTICS_RUBRIC_EXTRAS } from "./evaluator";
import { ANALYTICS_FRAMEWORKS } from "./frameworks";
import { ANALYTICS_BRIEFING, ANALYTICS_INTERVIEW_SLUG } from "./live";

export const ANALYTICS_PROBLEM_INTERVIEW_INPUT = {
  base: getInterviewType(ANALYTICS_INTERVIEW_SLUG) as InterviewType,
  frameworks: ANALYTICS_FRAMEWORKS,
  evaluatorAddendum: ANALYTICS_EVALUATOR_ADDENDUM,
  rubricExtras: ANALYTICS_RUBRIC_EXTRAS.map((dim) => ({ ...dim })),
  briefing: ANALYTICS_BRIEFING,
};
