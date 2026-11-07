/**
 * The `finance` preset's input to the problem-interview type factory
 * (`makeProblemInterviewTypeConfig` in lib/problem-interview/type-config.ts).
 *
 * Safe for the engine registry to import: frameworks, the addendum, the
 * extras and the briefing are all meant to be public. The bank is NOT here —
 * it carries interviewer facts and benchmark answers, so it is registered
 * server-only in lib/problem-interview/banks.server.ts (`finance:
 * FINANCE_BANK`). Never import ./questions from this file or anything the
 * registry imports.
 */

import { getInterviewType, type InterviewType } from "@/lib/interview/types";
import type { MakeProblemInterviewTypeConfigInput } from "@/lib/problem-interview/type-config";

import { FINANCE_EVALUATOR_ADDENDUM, FINANCE_RUBRIC_EXTRAS } from "./evaluator";
import { FINANCE_FRAMEWORKS } from "./frameworks";
import { FINANCE_BRIEFING, FINANCE_INTERVIEW_SLUG } from "./live";

export const FINANCE_PROBLEM_INTERVIEW_INPUT: MakeProblemInterviewTypeConfigInput = {
  base: getInterviewType(FINANCE_INTERVIEW_SLUG) as InterviewType,
  frameworks: FINANCE_FRAMEWORKS,
  evaluatorAddendum: FINANCE_EVALUATOR_ADDENDUM,
  rubricExtras: FINANCE_RUBRIC_EXTRAS.map((dim) => ({ ...dim })),
  briefing: FINANCE_BRIEFING,
  families: [
    { key: "technical-walkthrough", label: "Technicals", hint: "Accounting and valuation." },
    { key: "paper-lbo", label: "Paper LBO", hint: "Returns math by hand." },
    { key: "stock-pitch", label: "Stock pitch", hint: "Pitch a long or short." },
    { key: "market-deal", label: "Market or deal", hint: "Discuss a market or deal." },
  ],
};
