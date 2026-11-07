/**
 * Banks passed to `makeProblemInterviewTypeConfig({ bank })`, keyed by slug.
 *
 * Exists so the factory keeps the `{ base, bank, frameworks, ... }` signature
 * the content branches were written against. CAUTION: a bank handed to the
 * factory travels with the engine registry, which is bundled for the browser
 * — interviewer facts and strong-answer notes then ship in client JS. The
 * private alternative is to omit `bank` and register it in
 * `./banks.server.ts`'s `PROBLEM_BANKS`, which takes precedence.
 */

import type { ProblemQuestion } from "./types";

const FACTORY_BANKS: Record<string, readonly ProblemQuestion[]> = {};

export function registerFactoryBank(slug: string, bank: readonly ProblemQuestion[]): void {
  FACTORY_BANKS[slug.trim().toLowerCase()] = bank;
}

export function getFactoryBank(slug: string): readonly ProblemQuestion[] | undefined {
  return FACTORY_BANKS[slug.trim().toLowerCase()];
}
