/**
 * Golden transcripts for the finance grading study
 * (scripts/verify-finance-interview-grading.ts).
 *
 * Variants (orchestrator brief 2026-11-06):
 * - strong:   every step unprompted, math inside the strong band.
 * - skipped:  jumps to an answer; inputs, derivation and checks skipped.
 * - mathwrong: good process, key figures outside the tolerance band.
 * - sloppy:   final answer inside the band, reached sloppily (cancelling
 *             arithmetic slips, an IRR with no method).
 * - nudged:   needs the interviewer's neutral nudges; the nudge turns are in
 *             the transcript and in `nudgesIssued` (as session markers would
 *             record them).
 *
 * Interviewer markers are stripped before transcripts are stored, so the
 * turns here carry none.
 */

import type { ProcessStepStatus } from "../../../lib/problem-interview/types";

export type GoldenVariant = "strong" | "skipped" | "mathwrong" | "sloppy" | "nudged";

export interface GoldenTurn {
  role: "assistant" | "user";
  /** Seconds from session start. */
  t: number;
  content: string;
}

export interface GoldenExpectation {
  processRigorMin?: number;
  processRigorMax?: number;
  technicalMin?: number;
  technicalMax?: number;
  commercialMin?: number;
  commercialMax?: number;
  /** Every step must be `hit`. */
  allHit?: boolean;
  /** Step → acceptable statuses. */
  steps?: Record<string, ProcessStepStatus[]>;
}

export interface GoldenTranscript {
  id: string;
  questionId: string;
  variant: GoldenVariant;
  nudgesIssued: { stepKey: string; atSeconds: number }[];
  exhibitsRevealed: { exhibitId: string; atSeconds: number }[];
  turns: GoldenTurn[];
  expect: GoldenExpectation;
}
