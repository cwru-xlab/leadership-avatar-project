/**
 * A test-only problem interview, so the machinery can be exercised end to end
 * without the content branches (`lib/case-interview/`, `lib/pm-interview/`).
 *
 * Registered under the hidden slug `problem-fixture`, and ONLY outside
 * production builds: `next dev` and the tsx verify scripts see it, `next
 * build` / Vercel do not. It never appears in a launcher list — it is
 * reachable only by URL (`/practice/problem-fixture`).
 *
 * The bank lives in `./bank` on purpose: this file is reachable from the
 * browser bundle (through the engine registry), the bank must not be. Content
 * modules follow the same split.
 */

import type { InterviewType } from "@/lib/interview/types";
import type { ProcessFramework } from "../types";

export const PROBLEM_FIXTURE_SLUG = "problem-fixture";

export const PROBLEM_FIXTURE_ENABLED = process.env.NODE_ENV !== "production";

export const PROBLEM_FIXTURE_BASE: InterviewType = {
  slug: PROBLEM_FIXTURE_SLUG,
  label: "Problem Interview (test fixture)",
  description: "Test-only problem interview used to verify the problem-interview engine.",
  interviewerPersona:
    "a composed, precise product leader who lets the candidate drive and answers only what is asked",
  defaultRoleTitle: "an associate product manager role",
  defaultIndustry: "consumer technology",
  difficulty: "Intermediate",
  targetMinutes: 15,
  targetQuestionCount: 1,
  questionAreas: ["Fit", "One problem", "Your questions"],
};

/** A CIRCLE-ish product-design method, trimmed to four steps. */
export const PROBLEM_FIXTURE_FRAMEWORK: ProcessFramework = {
  key: "fixture-circle",
  label: "CIRCLE-style product method (fixture)",
  source: "Adapted from Lewis Lin's CIRCLE method, for engine tests only.",
  steps: [
    {
      key: "clarify_goal",
      label: "Clarify the goal",
      description: "Pin down what success means before designing anything.",
      evidenceCriteria:
        "The candidate asks about or states the business goal or success metric before proposing solutions.",
      nudge: "Before we go further, what would success look like here?",
    },
    {
      key: "identify_customer",
      label: "Identify the customer",
      description: "Choose a specific user segment to design for.",
      evidenceCriteria: "The candidate names and justifies a specific user segment.",
      nudge: "Who do you see using this?",
    },
    {
      key: "use_data",
      label: "Use the data",
      description: "Ask for and interpret the numbers that bear on the decision.",
      evidenceCriteria:
        "The candidate asks for data and draws a quantitative conclusion from it.",
      nudge: "Is there anything you'd want to know about how people use it today?",
    },
    {
      key: "recommend",
      label: "Recommend",
      description: "Land a clear recommendation with a reason and a metric.",
      evidenceCriteria:
        "The candidate ends with a specific recommendation, why, and how they'd measure it.",
      nudge: "Where does that leave you?",
    },
  ],
};
