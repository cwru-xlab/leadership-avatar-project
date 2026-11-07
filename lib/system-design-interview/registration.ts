/**
 * The `system-design` preset's input to `makeProblemInterviewTypeConfig`
 * (lib/problem-interview/type-config.ts). The engine registry builds the type
 * from it; the bank is registered separately and server-only in
 * lib/problem-interview/banks.server.ts.
 *
 * Safe for the registry (and so the browser) to import: frameworks, the
 * addendum, extras and briefing are public. NEVER import ./questions here.
 */

import { getInterviewType, type InterviewType } from "@/lib/interview/types";

import { SD_EVALUATOR_ADDENDUM, SD_RUBRIC_EXTRAS } from "./evaluator";
import { SD_FRAMEWORKS } from "./frameworks";
import { SD_BRIEFING, SD_INTERVIEW_SLUG } from "./live";

export const SYSTEM_DESIGN_PROBLEM_INTERVIEW_INPUT = {
  base: getInterviewType(SD_INTERVIEW_SLUG) as InterviewType,
  frameworks: SD_FRAMEWORKS,
  evaluatorAddendum: SD_EVALUATOR_ADDENDUM,
  rubricExtras: SD_RUBRIC_EXTRAS.map((dim) => ({ ...dim })),
  briefing: SD_BRIEFING,
  families: [
    { key: "system-design", label: "Design a system", hint: "Build a service end to end." },
    { key: "feature-design", label: "Feature design", hint: "Add a feature to a system." },
    { key: "incident", label: "Incident", hint: "Debug a production problem." },
  ],
};
