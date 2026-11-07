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

/**
 * The server-owned hint ceiling: three tiers, one per stage of implementation.
 *
 * It lives in this learner-safe module rather than next to the hint builder,
 * because the browser renders "Hint n/MAX" from it and `chat-policy.ts` pulls
 * in `node:crypto`. The chat route gates allocation on it and the report route
 * clamps its reported count to it, so the number has exactly one definition.
 *
 * `tier` is a plain `Int` column with a `@@unique([reportId, tier])`
 * constraint, so changing this ceiling needs no migration.
 */
export const MAX_TECHNICAL_HINTS = 3;

export type TechnicalHintTier = 1 | 2 | 3;

/** Human-readable name for prompts and UI chrome. */
export const TECHNICAL_CODING_LANGUAGE_LABEL = "Python" as const;

/** Problem families a candidate can ask for by name. */
export const TECHNICAL_TOPICS = [
  "arrays",
  "strings",
  "hashing",
  "two-pointer",
  "binary-search",
  "stack-queue",
  "trees",
  "graphs",
  "dynamic-programming",
  "greedy",
  "math",
  "sorting",
] as const;

export type TechnicalTopic = (typeof TECHNICAL_TOPICS)[number];

export const TECHNICAL_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type TechnicalDifficulty = (typeof TECHNICAL_DIFFICULTIES)[number];

export function isTechnicalTopic(value: unknown): value is TechnicalTopic {
  return typeof value === "string" && (TECHNICAL_TOPICS as readonly string[]).includes(value);
}

export function isTechnicalDifficulty(value: unknown): value is TechnicalDifficulty {
  return (
    typeof value === "string" && (TECHNICAL_DIFFICULTIES as readonly string[]).includes(value)
  );
}

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
  /** Learner-visible: the candidate chose these, and the panel displays them. */
  topics: readonly TechnicalTopic[];
  difficulty: TechnicalDifficulty;
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
  /**
   * What the candidate asked for, which may be wider than what was served:
   * selection falls back to a broader pool rather than failing, so the request
   * is kept separately from `assignment.topics` / `assignment.difficulty`.
   */
  requested?: {
    topics: readonly TechnicalTopic[];
    difficulty: TechnicalDifficulty | null;
  };
  /**
   * The setup-wizard inputs, all OPTIONAL and deliberately NOT added to
   * `TECHNICAL_CODING_INPUT_KEYS` in `lib/report/snapshot.ts`. That array
   * feeds `hasAllKeys`, which requires every listed key to be present on the
   * raw JSON — adding these would make every coding report written before the
   * wizard existed fail to narrow, silently breaking its report page and
   * evaluation. Do not "tidy" them into that list.
   *
   * `jobDescriptionText` is interviewer context only: the live prompt reads
   * it, the evaluator must not.
   */
  interviewerAvatarId?: string | null;
  interviewerName?: string | null;
  resumeId?: string | null;
  resumeText?: string | null;
  jobDescriptionId?: string | null;
  jobDescriptionText?: string | null;
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
