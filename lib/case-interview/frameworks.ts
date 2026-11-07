/**
 * Process frameworks for the consulting case interview.
 *
 * Each framework is the sequence a real case interviewer watches for, written
 * so the evaluator can mark every step hit / prompted / missed
 * (`lib/problem-interview/types.ts`). The steps are a synthesis of:
 *
 * - CWRU Career Center's nine candidate steps: listen and take notes, ask
 *   clarifying questions (company, market share, competition, short- and
 *   long-term goals), break the problem down and prioritize, think before
 *   speaking, chart your answer, support assumptions with calculations, watch
 *   the clock, summarize, take feedback.
 * - Bain: clarify the objective, use a clear framework, think aloud, highlight
 *   key numbers. BCG: structure the approach, ask thoughtful questions, analyze
 *   data with quick math, identify the most important factors.
 * - Oliver Wyman: restate the problem in your own words, break it down, pick an
 *   approach and state assumptions, use numbers and double-check them, make a
 *   recommendation tied to the key issues.
 * - Cosentino (Case in Point): summarize the question, verify the objective,
 *   ask clarifying questions, lay out a structure. Cheng (CaseInterview.com):
 *   hypothesis-driven issue tree, conclusion-first synthesis.
 *
 * The nudges are what a real interviewer says when a candidate skips a step:
 * a neutral question that opens the door without naming the step, the method,
 * or the answer. They must stay realistic, not coaching — an interviewer at
 * McKinsey asks "What would you tell the CEO?"; nobody says "remember to
 * synthesize".
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

import { CASE_SOURCES } from "./sources";

/**
 * Business-scenario cases (Vault's eight types). Six steps: the CWRU/Bain/OW
 * opening (restate, clarify), the structure and prioritization every firm
 * names, the analysis where exhibits and math live, and the synthesis.
 */
export const CASE_BUSINESS_FRAMEWORK: ProcessFramework = {
  key: "case-business",
  label: "Business case flow",
  source: [CASE_SOURCES.cwru, CASE_SOURCES.bain, CASE_SOURCES.bcg, CASE_SOURCES.oliverWyman, CASE_SOURCES.caseQuestions].join("; "),
  steps: [
    {
      key: "restate_prompt",
      label: "Play back the problem",
      description:
        "Restate the situation and the question in your own words so you and the interviewer agree on what is being solved.",
      evidenceCriteria:
        "Before any analysis, the candidate summarizes the client situation and the question asked in their own words " +
        "(not a verbatim echo of a single phrase) and checks it with the interviewer, e.g. 'So the client is X and they want to know Y — is that right?'. " +
        "A bare 'okay' or immediately starting a framework is NOT a hit.",
      nudge: "Before you dive in, what's your read of what we're being asked here?",
    },
    {
      key: "clarify_objective",
      label: "Clarify the objective",
      description:
        "Ask the questions that pin down the client, its market and competition, and what success looks like before solving.",
      evidenceCriteria:
        "The candidate asks at least one question about the client's GOAL or success measure (e.g. profit target, timeframe, decision being made) " +
        "AND at least one about the client, its market share, its customers, or competitors, before laying out a structure. " +
        "Questions asked only much later, mid-analysis, do not make this step a hit.",
      nudge: "Is there anything you'd want to know about the client before you get going?",
    },
    {
      key: "structure",
      label: "Lay out a structure",
      description:
        "Break the problem into distinct, non-overlapping buckets (an issue tree) tailored to this client, before analysing any one of them.",
      evidenceCriteria:
        "The candidate explicitly lays out 2–5 named buckets or branches that together cover the question (mutually exclusive, collectively exhaustive in spirit) " +
        "and are tailored to this case (not a generic recitation like '4 Ps' with no link to the client), BEFORE drilling into numbers. " +
        "Naming one area and diving straight into it is NOT a structure.",
      nudge: "How are you thinking about tackling this?",
    },
    {
      key: "hypothesis_prioritize",
      label: "Prioritize with a hypothesis",
      description:
        "Say where you would look first and why — a working hypothesis that focuses the analysis on what matters most.",
      evidenceCriteria:
        "The candidate states which branch they will examine first and gives a reason, or states a testable hypothesis " +
        "(e.g. 'my hunch is costs, not revenue, because revenue was flat — let's start there'). " +
        "Working through branches in listed order with no reason given is NOT a hit.",
      nudge: "Where would you start, and why there?",
    },
    {
      key: "analyze_data",
      label: "Analyze the data",
      description:
        "Ask for the data you need, read the exhibits correctly, do the math out loud, and say what each number means for the client.",
      evidenceCriteria:
        "The candidate requests or uses the relevant data, reads the exhibit's key point correctly, performs the needed calculation aloud with " +
        "correct or near-correct arithmetic (small rounding is fine), and states the 'so what' of the result for the question. " +
        "Recompute the candidate's key calculations: getting one materially wrong (more than ~10% off, or an order of magnitude) without correcting it, " +
        "or reading numbers aloud without drawing any implication, is NOT a hit.",
      nudge: "What does that tell you?",
    },
    {
      key: "synthesize",
      label: "Recommend and synthesize",
      description:
        "Close with a clear, answer-first recommendation backed by the key facts, plus the main risks and next steps.",
      evidenceCriteria:
        "Unprompted, the candidate gives a top-down recommendation (the answer FIRST, e.g. 'I'd recommend not launching the route as planned'), " +
        "supports it with 2–3 facts from the case, and names at least one risk and at least one next step. " +
        "A recap of what was discussed with no decision, or a decision only after the interviewer asks for one, is not a hit.",
      nudge: "If the CEO walked in right now, what would you tell her?",
    },
  ],
};

/**
 * Market-sizing / guesstimate cases (CWRU's "how many / how much"). The CWRU
 * page: break the problem into smaller parts; rough, realistic calculations
 * are acceptable. Firms add: state assumptions, calculate aloud, sanity-check.
 */
export const CASE_GUESSTIMATE_FRAMEWORK: ProcessFramework = {
  key: "case-guesstimate",
  label: "Estimation flow",
  source: [CASE_SOURCES.cwru, CASE_SOURCES.bcg, CASE_SOURCES.oliverWyman, CASE_SOURCES.caseInterviewCom].join("; "),
  steps: [
    {
      key: "clarify_scope",
      label: "Pin down the scope",
      description:
        "Agree what exactly is being estimated — geography, time period, units, what counts — before estimating.",
      evidenceCriteria:
        "Before estimating, the candidate asks about or explicitly states the scope: what counts (e.g. retail spend vs. units), the geography, " +
        "and/or the time period. One clear scoping question or statement confirmed with the interviewer is enough.",
      nudge: "Anything you want to pin down before you start estimating?",
    },
    {
      key: "segment_structure",
      label: "Break the estimate down",
      description:
        "Lay out the equation or segments (top-down or bottom-up) that build up to the number before plugging values in.",
      evidenceCriteria:
        "The candidate states the overall approach as a formula or segmentation (e.g. 'users × units per year × price', or splitting the population " +
        "by age/gender/usage) BEFORE calculating. Throwing out a single guessed number is NOT a structure.",
      nudge: "How would you break that number down?",
    },
    {
      key: "state_assumptions",
      label: "State assumptions",
      description:
        "Put explicit, realistic numbers on each piece and give a quick reason for each.",
      evidenceCriteria:
        "Each driver in the structure gets an explicit numeric assumption, and at least the key ones carry a short rationale " +
        "(e.g. 'about a quarter of men use some styling product — that's my sense from people I know'). Assumptions must be roughly realistic.",
      nudge: "What numbers are you working with there?",
    },
    {
      key: "calculate_aloud",
      label: "Calculate out loud",
      description:
        "Do the arithmetic step by step out loud, rounding sensibly, so the interviewer can follow it.",
      evidenceCriteria:
        "The candidate narrates the arithmetic step by step AND every multiplication/division is correct given their own assumptions. " +
        "Recompute each one: if any result is off by more than ~10% (e.g. 1.2 million × 6 stated as 72 million) and the candidate does not fix it, " +
        "this step is missed, however clearly it was narrated.",
      nudge: "Can you walk me through how you got there?",
    },
    {
      key: "sanity_check",
      label: "Sanity-check the result",
      description:
        "Test the answer against a benchmark or a second method before committing to it.",
      evidenceCriteria:
        "Unprompted, the candidate checks the result against something independent (a known figure, a per-person cross-check, a second approach) " +
        "and says whether it holds up.",
      nudge: "Does that number feel right to you?",
    },
    {
      key: "state_answer",
      label: "Commit to an answer",
      description: "Land a clear final number with units, and say which assumption moves it most.",
      evidenceCriteria:
        "The candidate states a single final figure (or tight range) with units as their answer, ideally naming the most sensitive assumption.",
      nudge: "So where do you land?",
    },
  ],
};

/**
 * Brainteasers (CWRU: riddles or puzzles that test logical thinking; stay calm,
 * think creatively). Shorter: there is no data to request or market to size.
 */
export const CASE_BRAINTEASER_FRAMEWORK: ProcessFramework = {
  key: "case-brainteaser",
  label: "Puzzle reasoning",
  source: [CASE_SOURCES.cwru, CASE_SOURCES.vault].join("; "),
  steps: [
    {
      key: "clarify_puzzle",
      label: "Check the setup",
      description: "Restate the puzzle and confirm its rules or constraints before answering.",
      evidenceCriteria:
        "The candidate restates the puzzle or asks/states at least one constraint or assumption about it before reasoning toward an answer.",
      nudge: "What are you assuming about the setup?",
    },
    {
      key: "reason_aloud",
      label: "Reason out loud",
      description: "Lay out the possibilities or a method and work through them aloud rather than guessing.",
      evidenceCriteria:
        "The candidate narrates a method (enumerating cases, working an example, considering more than one explanation) rather than only stating an answer.",
      nudge: "What are you weighing as you think about it?",
    },
    {
      key: "conclude_and_check",
      label: "Conclude and check",
      description: "State the answer clearly and test it — verify the logic or check an edge case.",
      evidenceCriteria:
        "The candidate commits to an answer AND checks it (verifies the steps, tests an edge case, or explains why alternatives fail).",
      nudge: "So where do you land, and how sure are you?",
    },
  ],
};

export const CASE_FRAMEWORKS: ProcessFramework[] = [
  CASE_BUSINESS_FRAMEWORK,
  CASE_GUESSTIMATE_FRAMEWORK,
  CASE_BRAINTEASER_FRAMEWORK,
];

export function getCaseFramework(key: string): ProcessFramework | null {
  return CASE_FRAMEWORKS.find((f) => f.key === key) ?? null;
}
