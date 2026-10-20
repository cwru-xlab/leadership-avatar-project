/**
 * The four knowledge-check payload formats, and the boundary validation that
 * keeps a malformed one from ever reaching the database.
 *
 * WHY THIS LIVES HERE, NOT IN THE ENGINE: 21-CONTEXT.md is explicit — all four
 * formats ship as steps inside the study-plan surface (`lib/study-plan/`,
 * `app/api/study-plans/`). They do NOT become a registered engine interaction
 * type. The engine already has type records, rubric dimensions, evaluators
 * and session plumbing, so routing a multiple-choice question through it
 * would drag the avatar session shell, the rubric schema and the termination
 * policy into something that needs none of them. REQ-108 is exactly this
 * boundary. This module therefore imports NOTHING from the engine module
 * tree, exports nothing that mentions the engine, and declares no
 * `typeSlug` — the sibling verifier
 * (`scripts/verify-knowledge-check-surface.ts`) proves that mechanically
 * rather than trusting this comment.
 *
 * VALIDATION CONVENTIONS mirror `lib/study-plan/types.ts`
 * (`validateStudyPlanContent`): a `LIMITS` const, small `isRecord` /
 * `readString` / `readStringArray` helpers, and throw-with-a-label-naming-
 * the-field on violation. Those helpers are REIMPLEMENTED locally rather than
 * imported from `lib/study-plan/types.ts` — that file does not currently
 * export them, and this plan's `files_modified` does not include
 * `lib/study-plan/types.ts`, so its existing exports are left untouched
 * (REQ-120). See 21-06-SUMMARY.md for the explicit note on which route was
 * taken.
 */
import { MIN_QUOTABLE_LENGTH } from "../verbatim";

export const CHECK_FORMATS = [
  "MULTIPLE_CHOICE",
  "FILL_IN_BLANK",
  "PICK_BETTER_RESPONSE",
  "REWRITE_WEAK_LINE",
] as const;

export type CheckFormat = (typeof CHECK_FORMATS)[number];

export interface MultipleChoicePayload {
  format: "MULTIPLE_CHOICE";
  options: string[];
}

export interface FillInBlankPayload {
  format: "FILL_IN_BLANK";
  segments: string[];
  blankCount: number;
}

export interface PickBetterResponsePayload {
  format: "PICK_BETTER_RESPONSE";
  // One candidate SHOULD be the student's own verbatim line and the other a
  // constructed alternative — but this module does not enforce which, since
  // 21-10 owns generation and the verbatim guarantee (lib/study-plan/verbatim.ts).
  // Cross-referencing that gate here would duplicate it in two places.
  candidates: [string, string];
  rationalePrompt: string | null;
}

export interface RewriteWeakLinePayload {
  format: "REWRITE_WEAK_LINE";
  weakLine: string;
  techniqueHint: string;
  rubricCriteria: string[];
}

export type CheckPayload =
  | MultipleChoicePayload
  | FillInBlankPayload
  | PickBetterResponsePayload
  | RewriteWeakLinePayload;

export interface MultipleChoiceAnswerKey {
  correctIndex: number;
}

export interface FillInBlankAnswerKey {
  accepted: string[][];
}

export interface PickBetterResponseAnswerKey {
  betterIndex: 0 | 1;
}

/**
 * REWRITE_WEAK_LINE has NO deterministic answer key — `validateAnswerKey`
 * returns `null` for it and throws if anything non-null is supplied. That
 * asymmetry is REQ-111's deterministic/model split made structural rather
 * than conventional: the type system (and the thrown error) enforce it, not
 * a convention a future caller could quietly ignore.
 */
export type AnswerKey =
  | MultipleChoiceAnswerKey
  | FillInBlankAnswerKey
  | PickBetterResponseAnswerKey;

const LIMITS = {
  mcOptionCount: 4,
  mcOptionLength: 240,
  fibBlankCountMin: 1,
  fibBlankCountMax: 3,
  fibSegmentLength: 500,
  fibAcceptedPerBlankMax: 20,
  fibAcceptedLength: 80,
  pbrCandidateLength: 600,
  pbrRationaleLength: 500,
  rwlWeakLineMax: 600,
  rwlTechniqueHintLength: 240,
  rwlRubricCriteriaMin: 1,
  rwlRubricCriteriaMax: 4,
  rwlRubricCriterionLength: 300,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(
  value: unknown,
  min: number,
  max: number,
  label: string
): string {
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const normalized = value.normalize("NFC");
  if (normalized.length < min) {
    throw new Error(`${label} must be at least ${min} character(s)`);
  }
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

function readStringOrNull(
  value: unknown,
  max: number,
  label: string
): string | null {
  if (value === null || value === undefined) return null;
  return readString(value, 1, max, label);
}

function readStringArray(
  value: unknown,
  minItems: number,
  maxItems: number,
  itemMin: number,
  itemMax: number,
  label: string
): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new Error(`${label} must contain between ${minItems} and ${maxItems} items`);
  }
  return value.map((item, i) => readString(item, itemMin, itemMax, `${label}[${i}]`));
}

function readInteger(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be a whole number between ${min} and ${max}`);
  }
  return value;
}

function assertDistinct(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.normalize("NFC");
    if (seen.has(key)) {
      throw new Error(`${label} must not contain duplicate entries`);
    }
    seen.add(key);
  }
}

// ---------------------------------------------------------------------------
// MULTIPLE_CHOICE
// ---------------------------------------------------------------------------

function validateMultipleChoicePayload(value: unknown): MultipleChoicePayload {
  if (!isRecord(value)) throw new Error("Multiple-choice payload must be an object");
  const options = readStringArray(
    value.options,
    LIMITS.mcOptionCount,
    LIMITS.mcOptionCount,
    1,
    LIMITS.mcOptionLength,
    "Multiple-choice options"
  );
  // A duplicate option makes two answers correct — reject it here, not downstream.
  assertDistinct(options, "Multiple-choice options");
  return { format: "MULTIPLE_CHOICE", options };
}

function validateMultipleChoiceAnswerKey(value: unknown): MultipleChoiceAnswerKey {
  if (!isRecord(value)) throw new Error("Multiple-choice answer key must be an object");
  return {
    correctIndex: readInteger(value.correctIndex, 0, 3, "Multiple-choice correctIndex"),
  };
}

// ---------------------------------------------------------------------------
// FILL_IN_BLANK
// ---------------------------------------------------------------------------

function validateFillInBlankPayload(value: unknown): FillInBlankPayload {
  if (!isRecord(value)) throw new Error("Fill-in-the-blank payload must be an object");
  const blankCount = readInteger(
    value.blankCount,
    LIMITS.fibBlankCountMin,
    LIMITS.fibBlankCountMax,
    "Fill-in-the-blank blankCount"
  );
  if (!Array.isArray(value.segments)) {
    throw new Error("Fill-in-the-blank segments must be an array");
  }
  // Segments interleave the rendered prompt around the blanks, so an edge
  // segment may legitimately be an empty string — only an UPPER bound applies.
  const segments = value.segments.map((segment, i) =>
    readString(segment, 0, LIMITS.fibSegmentLength, `Fill-in-the-blank segments[${i}]`)
  );
  if (segments.length !== blankCount + 1) {
    throw new Error(
      "Fill-in-the-blank segments must contain exactly blankCount + 1 entries"
    );
  }
  return { format: "FILL_IN_BLANK", segments, blankCount };
}

function validateFillInBlankAnswerKey(value: unknown): FillInBlankAnswerKey {
  if (!isRecord(value)) throw new Error("Fill-in-the-blank answer key must be an object");
  if (!Array.isArray(value.accepted)) {
    throw new Error("Fill-in-the-blank accepted must be an array");
  }
  const accepted = value.accepted.map((blankAccepted, i) =>
    readStringArray(
      blankAccepted,
      1,
      LIMITS.fibAcceptedPerBlankMax,
      1,
      LIMITS.fibAcceptedLength,
      `Fill-in-the-blank accepted[${i}]`
    )
  );
  return { accepted };
}

// ---------------------------------------------------------------------------
// PICK_BETTER_RESPONSE
// ---------------------------------------------------------------------------

function validatePickBetterResponsePayload(value: unknown): PickBetterResponsePayload {
  if (!isRecord(value)) {
    throw new Error("Pick-the-better-response payload must be an object");
  }
  if (!Array.isArray(value.candidates) || value.candidates.length !== 2) {
    throw new Error("Pick-the-better-response candidates must contain exactly 2 items");
  }
  const candidates = value.candidates.map((candidate, i) =>
    readString(
      candidate,
      1,
      LIMITS.pbrCandidateLength,
      `Pick-the-better-response candidates[${i}]`
    )
  ) as [string, string];
  assertDistinct(candidates, "Pick-the-better-response candidates");
  const rationalePrompt = readStringOrNull(
    value.rationalePrompt,
    LIMITS.pbrRationaleLength,
    "Pick-the-better-response rationalePrompt"
  );
  return { format: "PICK_BETTER_RESPONSE", candidates, rationalePrompt };
}

function validatePickBetterResponseAnswerKey(
  value: unknown
): PickBetterResponseAnswerKey {
  if (!isRecord(value)) {
    throw new Error("Pick-the-better-response answer key must be an object");
  }
  const betterIndex = readInteger(
    value.betterIndex,
    0,
    1,
    "Pick-the-better-response betterIndex"
  );
  return { betterIndex: betterIndex as 0 | 1 };
}

// ---------------------------------------------------------------------------
// REWRITE_WEAK_LINE — no deterministic answer key
// ---------------------------------------------------------------------------

function validateRewriteWeakLinePayload(value: unknown): RewriteWeakLinePayload {
  if (!isRecord(value)) {
    throw new Error("Rewrite-a-weak-line payload must be an object");
  }
  // The 12-character floor matches MIN_QUOTABLE_LENGTH, imported (never
  // restated) from lib/study-plan/verbatim.ts — 21-20's calibration table
  // references that constant by name.
  const weakLine = readString(
    value.weakLine,
    MIN_QUOTABLE_LENGTH,
    LIMITS.rwlWeakLineMax,
    "Rewrite-a-weak-line weakLine"
  );
  const techniqueHint = readString(
    value.techniqueHint,
    1,
    LIMITS.rwlTechniqueHintLength,
    "Rewrite-a-weak-line techniqueHint"
  );
  const rubricCriteria = readStringArray(
    value.rubricCriteria,
    LIMITS.rwlRubricCriteriaMin,
    LIMITS.rwlRubricCriteriaMax,
    1,
    LIMITS.rwlRubricCriterionLength,
    "Rewrite-a-weak-line rubricCriteria"
  );
  return { format: "REWRITE_WEAK_LINE", weakLine, techniqueHint, rubricCriteria };
}

// ---------------------------------------------------------------------------
// Public boundary API
// ---------------------------------------------------------------------------

export function validateCheckPayload(format: CheckFormat, value: unknown): CheckPayload {
  switch (format) {
    case "MULTIPLE_CHOICE":
      return validateMultipleChoicePayload(value);
    case "FILL_IN_BLANK":
      return validateFillInBlankPayload(value);
    case "PICK_BETTER_RESPONSE":
      return validatePickBetterResponsePayload(value);
    case "REWRITE_WEAK_LINE":
      return validateRewriteWeakLinePayload(value);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unknown check format: ${String(exhaustive)}`);
    }
  }
}

/**
 * MUST throw if a non-null key is supplied for REWRITE_WEAK_LINE (it has no
 * deterministic key), and MUST throw if null is supplied for any of the other
 * three (they have nothing else).
 */
export function validateAnswerKey(format: CheckFormat, value: unknown): AnswerKey | null {
  if (format === "REWRITE_WEAK_LINE") {
    if (value !== null) {
      throw new Error(
        "Rewrite-a-weak-line answer key must be null — this format has no deterministic key"
      );
    }
    return null;
  }

  if (value === null) {
    throw new Error(`${format} requires a non-null answer key`);
  }

  switch (format) {
    case "MULTIPLE_CHOICE":
      return validateMultipleChoiceAnswerKey(value);
    case "FILL_IN_BLANK":
      return validateFillInBlankAnswerKey(value);
    case "PICK_BETTER_RESPONSE":
      return validatePickBetterResponseAnswerKey(value);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unknown check format: ${String(exhaustive)}`);
    }
  }
}

/** True for the three deterministically-graded formats, false for the rewrite. */
export function isDeterministicFormat(format: CheckFormat): boolean {
  return format !== "REWRITE_WEAK_LINE";
}

/**
 * The single point where a format's mastery weight class is decided. Derived
 * FROM `isDeterministicFormat`, not from a second hand-maintained map — 21-11
 * and 21-15 both read this function, and a format's classification must never
 * be able to drift between the two.
 */
export function CONTRIBUTION_SOURCE_FOR_FORMAT(
  format: CheckFormat
): "CHECK_DETERMINISTIC" | "CHECK_MODEL_GRADED" {
  return isDeterministicFormat(format) ? "CHECK_DETERMINISTIC" : "CHECK_MODEL_GRADED";
}
