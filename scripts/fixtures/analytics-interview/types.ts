/**
 * Golden transcripts for the data-analytics grading validity study
 * (scripts/verify-analytics-interview-grading.ts).
 *
 * Variants:
 * - strong:          every step unprompted, numbers inside the strong band.
 * - skips-steps:     jumps to a cause / answer; skips data checks and the breakdown.
 * - stats-wrong:     good structure, wrong statistics (sample size far outside
 *                    the band, peeking as the plan).
 * - needs-nudges:    covers two steps only after the interviewer's neutral
 *                    nudge; the nudges are in `nudgesIssued`, as the session
 *                    markers would record them.
 * - readout-misread: an experiment readout that ignores the sample-ratio
 *                    mismatch on screen and ships on the lift; the trust nudge
 *                    gets a dismissive reply (so it must be MISSED, not prompted).
 * - readout-strong:  the same readout done right (control for the misread).
 *
 * Interviewer markers are stripped before transcripts are stored, so the turns
 * carry none; exhibit reveals are given in `exhibitsRevealed`.
 */

import type { ProcessStepStatus } from "../../../lib/problem-interview/types";

export type GoldenVariant =
  | "strong"
  | "skips-steps"
  | "stats-wrong"
  | "needs-nudges"
  | "readout-misread"
  | "readout-strong";

export interface GoldenTurn {
  role: "assistant" | "user";
  /** Seconds from session start. */
  t: number;
  content: string;
}

export interface GoldenExpectation {
  /** Bounds on the DERIVED process_rigor (what the report stores). */
  processRigorMin?: number;
  processRigorMax?: number;
  statisticalMin?: number;
  statisticalMax?: number;
  businessMin?: number;
  businessMax?: number;
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
