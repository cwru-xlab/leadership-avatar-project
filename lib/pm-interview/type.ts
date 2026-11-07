/**
 * The `product-management` engine type record.
 *
 * `PM_TYPE_INPUT` is exactly the argument `makeProblemInterviewTypeConfig`
 * takes. It deliberately carries NO bank: the registry is bundled for the
 * browser, and the bank holds interviewer facts and strong-answer notes. The
 * bank is registered server-side in `lib/problem-interview/banks.server.ts`.
 */

import type { InteractionTypeConfig } from "@/lib/engine/types";
import { getInterviewType } from "@/lib/interview/types";
import {
  makeProblemInterviewTypeConfig,
  type MakeProblemInterviewTypeConfigInput,
} from "@/lib/problem-interview/type-config";

import { PM_FRAMEWORKS } from "./frameworks";
import {
  PM_BRIEFING,
  PM_EVALUATOR_ADDENDUM,
  PM_INTERVIEW_SLUG,
  PM_RUBRIC_EXTRAS,
} from "./prompts";

export const PM_TYPE_INPUT: MakeProblemInterviewTypeConfigInput = {
  base: getInterviewType(PM_INTERVIEW_SLUG)!,
  frameworks: Object.values(PM_FRAMEWORKS),
  evaluatorAddendum: PM_EVALUATOR_ADDENDUM,
  rubricExtras: PM_RUBRIC_EXTRAS,
  briefing: {
    headline: PM_BRIEFING.headline,
    points: [...PM_BRIEFING.bullets],
    more: PM_BRIEFING.more,
  },
  families: [
    { key: "product-design", label: "Product design", hint: "Design something new." },
    { key: "product-improvement", label: "Improvement", hint: "Make a product better." },
    { key: "metrics-execution", label: "Metrics", hint: "Define or diagnose a metric." },
    { key: "estimation", label: "Estimation", hint: "Size it out loud." },
    { key: "strategy", label: "Strategy", hint: "Where to play, how to win." },
  ],
};

export const PRODUCT_MANAGEMENT_TYPE: InteractionTypeConfig =
  makeProblemInterviewTypeConfig(PM_TYPE_INPUT);
