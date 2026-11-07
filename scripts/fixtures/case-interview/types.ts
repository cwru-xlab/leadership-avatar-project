/**
 * Golden transcripts for the consulting case grading study
 * (scripts/verify-case-interview-grading.ts).
 *
 * Variants, per the study design:
 * - strong:  hits every step unprompted, modeled on the firms' published
 *            "good answer" walk-throughs (restate, clarify, structure,
 *            prioritize, analyze aloud, answer-first recommendation).
 * - jump:    jumps to an answer with no clarifying questions or structure.
 * - botch:   structures well but botches the math and never lands an answer.
 * - nudged:  needs the interviewer's neutral nudges; the nudge turns are in
 *            the transcript and in `nudgesIssued` (as the session markers
 *            would record them).
 *
 * Interviewer markers are stripped before transcripts are stored, so the
 * turns here carry none.
 */

import type { ProcessStepStatus } from "../../../lib/problem-interview/types";

export type GoldenVariant = "strong" | "jump" | "botch" | "nudged";

export interface GoldenTurn {
  role: "assistant" | "user";
  /** Seconds from session start. */
  t: number;
  content: string;
}

export interface GoldenExpectation {
  processRigorMin?: number;
  processRigorMax?: number;
  quantitativeMin?: number;
  quantitativeMax?: number;
  synthesisMin?: number;
  synthesisMax?: number;
  /** Every step must be `hit`. */
  allHit?: boolean;
  /** Step → acceptable statuses. */
  steps?: Record<string, ProcessStepStatus[]>;
}

export interface GoldenTranscript {
  id: string;
  caseId: string;
  variant: GoldenVariant;
  nudgesIssued: { stepKey: string; atSeconds: number }[];
  turns: GoldenTurn[];
  expect: GoldenExpectation;
}
