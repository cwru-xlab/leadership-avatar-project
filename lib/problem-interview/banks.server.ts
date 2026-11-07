/**
 * Server-only registry of problem-interview question banks, keyed by type
 * slug. NEVER import this from a client component or from anything the
 * engine registry imports: banks carry interviewer facts, exhibit key
 * insights and strong-answer notes, none of which may reach the browser.
 *
 * Read by the three server paths that need a session's question:
 * `startSession` (selection), the chat route (live prompt), and the
 * evaluation runner (evaluator brief). Registering a bank is one entry in
 * `PROBLEM_BANKS`; see `./type-config.ts` for the full registration recipe.
 */

import { randomInt } from "node:crypto";

import type { ProblemQuestion, ProcessFramework } from "./types";
import { ANALYTICS_BANK } from "@/lib/analytics-interview/questions";
import { ANALYTICS_INTERVIEW_SLUG } from "@/lib/analytics-interview/live";
import { FINANCE_BANK } from "@/lib/finance-interview/questions";
import { FINANCE_INTERVIEW_SLUG } from "@/lib/finance-interview/live";

import { getFactoryBank } from "./bank-registry";
import { PROBLEM_FIXTURE_BANK } from "./fixtures/bank";
import { PROBLEM_FIXTURE_ENABLED, PROBLEM_FIXTURE_SLUG } from "./fixtures/type";
import { CASE_BANK } from "@/lib/case-interview/cases";
import { PM_QUESTION_BANK } from "@/lib/pm-interview/questions";
import { PM_INTERVIEW_SLUG } from "@/lib/pm-interview/prompts";

const PROBLEM_BANKS: Record<string, readonly ProblemQuestion[]> = {
  consulting: CASE_BANK,
  [PM_INTERVIEW_SLUG]: PM_QUESTION_BANK,
  [ANALYTICS_INTERVIEW_SLUG]: ANALYTICS_BANK,
  [FINANCE_INTERVIEW_SLUG]: FINANCE_BANK,
  ...(PROBLEM_FIXTURE_ENABLED ? { [PROBLEM_FIXTURE_SLUG]: PROBLEM_FIXTURE_BANK } : {}),
};

export function getProblemBank(slug: string): readonly ProblemQuestion[] {
  const key = slug.trim().toLowerCase();
  return PROBLEM_BANKS[key] ?? getFactoryBank(key) ?? [];
}

export function findProblemQuestion(
  slug: string,
  questionId: string,
): ProblemQuestion | null {
  return getProblemBank(slug).find((question) => question.id === questionId) ?? null;
}

export interface ProblemSelectionFilter {
  family?: string | null;
  difficulty?: ProblemQuestion["difficulty"] | null;
}

/**
 * Pick ONE question for a session: random among bank entries whose framework
 * the type declares, narrowed by the optional filter. A filter that matches
 * nothing is ignored rather than failing the session (the filter is a
 * preference, the bank is the authority). Null only when no entry is usable.
 */
export function selectProblemQuestion(
  bank: readonly ProblemQuestion[],
  frameworks: readonly ProcessFramework[],
  filter: ProblemSelectionFilter = {},
  pick: (count: number) => number = randomInt,
): { question: ProblemQuestion; framework: ProcessFramework } | null {
  const frameworkByKey = new Map(frameworks.map((framework) => [framework.key, framework]));
  const usable = bank.filter((question) => frameworkByKey.has(question.frameworkKey));
  const filtered = usable.filter(
    (question) =>
      (!filter.family || question.family === filter.family) &&
      (!filter.difficulty || question.difficulty === filter.difficulty),
  );
  const pool = filtered.length > 0 ? filtered : usable;
  if (pool.length === 0) return null;
  const question = pool[pick(pool.length)] ?? pool[0]!;
  return { question, framework: frameworkByKey.get(question.frameworkKey)! };
}

/** Test-only: register a bank for a slug. Returns an unregister fn. */
export function registerProblemBankForTests(
  slug: string,
  bank: readonly ProblemQuestion[],
): () => void {
  const key = slug.trim().toLowerCase();
  const previous = PROBLEM_BANKS[key];
  PROBLEM_BANKS[key] = bank;
  return () => {
    if (previous) PROBLEM_BANKS[key] = previous;
    else delete PROBLEM_BANKS[key];
  };
}
