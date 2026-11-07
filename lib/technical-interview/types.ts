/**
 * Versioned contracts for the technical-coding practice catalog.
 *
 * This module intentionally contains learner-safe shapes only. Reference
 * implementations, hidden cases, and oracle details live in
 * `assignments.server.ts` and must never be imported by a client component.
 */

export const TECHNICAL_CODING_LANGUAGE = "python" as const;
export const TECHNICAL_RUNTIME_POLICY_VERSION =
  "python-3.12-stdlib-v1" as const;

export type TechnicalCodingLanguage = typeof TECHNICAL_CODING_LANGUAGE;

/** Human-readable name for prompts and UI chrome. */
export const TECHNICAL_CODING_LANGUAGE_LABEL = "Python" as const;

export interface TechnicalExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface PublicTechnicalTest {
  id: string;
  label: string;
  /** Visible fixture data: safe to show in the problem panel and terminal. */
  input: unknown;
  expected: unknown;
}

export interface TechnicalAssignmentPublic {
  id: string;
  version: string;
  contentHash: string;
  title: string;
  statement: string;
  constraints: string[];
  examples: TechnicalExample[];
  starterCode: string;
  publicTests: PublicTechnicalTest[];
  expectedComplexity: string;
}

/** Server-only test payload. It is never included in a browser response. */
export interface TechnicalTestCase {
  id: string;
  input: unknown;
  expected: unknown;
}

export interface TechnicalAssignmentPrivate extends TechnicalAssignmentPublic {
  referenceSolution: string;
  hiddenTests: TechnicalTestCase[];
  publicTestCases: TechnicalTestCase[];
  rubricAnchors: string[];
  executionLimits: {
    timeoutMs: number;
    memoryMb: number;
    maxOutputBytes: number;
  };
}

export interface TechnicalCodingInputSnapshot {
  kind: "technical-coding";
  assignmentId: string;
  assignmentVersion: string;
  assignmentHash: string;
  assignment: TechnicalAssignmentPublic;
  language: TechnicalCodingLanguage;
  runtimePolicyVersion: string;
  selectedAt: string;
}

export function toPublicTechnicalAssignment(
  assignment: TechnicalAssignmentPrivate,
): TechnicalAssignmentPublic {
  const {
    referenceSolution: _referenceSolution,
    hiddenTests: _hiddenTests,
    publicTestCases: _publicTestCases,
    rubricAnchors: _rubricAnchors,
    executionLimits: _executionLimits,
    ...publicAssignment
  } = assignment;

  return publicAssignment;
}
