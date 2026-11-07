/**
 * The fixture question bank. Server-only by convention: imported from
 * `../banks.server.ts` and the verify script, never from a client module.
 */

import type { ProblemQuestion } from "../types";
import { PROBLEM_FIXTURE_FRAMEWORK } from "./type";

export const PROBLEM_FIXTURE_BANK: ProblemQuestion[] = [
  {
    id: "fixture-library-app",
    family: "product-design",
    frameworkKey: PROBLEM_FIXTURE_FRAMEWORK.key,
    title: "Public library app",
    prompt:
      "Our city's public library wants to grow digital borrowing. How would you improve its mobile app?",
    interviewerFacts: [
      "The goal is to double monthly e-book loans within a year.",
      "About 40% of cardholders have installed the app; most open it less than once a month.",
      "The library cannot buy more e-book licenses this year.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Monthly app sessions by cardholder age",
        kind: "table",
        caption: "Thousands of sessions, last 12 months average",
        columns: ["Age group", "Sessions (k)", "E-book loans (k)"],
        rows: [
          ["Under 18", 12, 1.1],
          ["18-34", 48, 9.6],
          ["35-54", 31, 7.2],
          ["55+", 9, 3.4],
        ],
        revealWhen:
          "after the candidate asks about who uses the app, usage data, or engagement numbers",
        keyInsight:
          "55+ users borrow at the highest rate per session (~0.38 loans/session) despite few sessions; 18-34 drive volume.",
      },
    ],
    strongAnswerNotes:
      "Clarifies the loan-growth goal and license constraint, picks a segment (e.g. 55+ high-intent readers or 18-34 volume), uses the table to compare loans per session, and recommends something like holds/notifications or discovery improvements measured by loans per active user.",
    difficulty: "Intermediate",
    source: "Original fixture written for engine tests.",
  },
];
