/**
 * Interview transcript — the durable, purpose-built shape for a single-
 * interviewer practice interview.
 *
 * This module deliberately does NOT reuse the case-study interaction-log type
 * declared under `types/`: that type is built around case-study
 * `roleInteractions`, a `caseId`, and role-scoped event types that assume a
 * multi-role case simulation. None of that has meaning for a one-on-one
 * interview between a candidate and a single interviewer avatar. Reusing it
 * would either force fake `caseId`/role fields onto an individual-ownership
 * product (the standing architectural constraint for this phase) or require
 * a parallel set of "unused" fields carried on every row. A small, dedicated
 * type is cheaper to reason about and evolve than bending a case-shaped type
 * to fit an interview.
 *
 * `InterviewTranscript` is the canonical object written to S3 (see
 * `S3AvatarStorage.saveInterviewTranscript` / `getInterviewTranscript` in
 * `lib/s3-client.ts`). The `InterviewReport` Postgres row only caches a
 * server-derived S3 key plus scores; the transcript body itself always lives
 * in S3.
 */

import type { InterviewProgress } from "./types";

/** `version: 1` is stamped on every transcript so a later phase can migrate
 * stored objects without guessing the shape from field presence. */
export interface InterviewTranscriptTurn {
  role: "user" | "assistant";
  content: string;
  /** epoch ms */
  timestamp: number;
}

export interface InterviewTranscript {
  /** Schema version so later phases can migrate stored objects. */
  version: 1;
  reportId: string;
  userId: string;
  typeSlug: string;
  interviewer: { avatarId: string | null; name: string | null };
  startedAt: number;
  updatedAt: number;
  turns: InterviewTranscriptTurn[];
  progress: InterviewProgress;
}

/** Cap on how many turns are retained. The opening exchanges matter most for
 * grading (they set up the resume-grounded and behavioral stages), so the
 * cap keeps the FIRST `MAX_TRANSCRIPT_TURNS`, not the most recent ones. */
const MAX_TRANSCRIPT_TURNS = 400;

/** Cap on a single turn's content length. Defends against a runaway or
 * malicious client payload bloating the stored transcript / evaluator input. */
const MAX_TURN_CONTENT_LENGTH = 20000;

/**
 * Stamp `version` and `updatedAt` on a transcript being built or checkpointed.
 * Callers supply everything else — this only owns the two derived fields.
 */
export function buildInterviewTranscript(
  input: Omit<InterviewTranscript, "version" | "updatedAt">
): InterviewTranscript {
  return {
    ...input,
    version: 1,
    updatedAt: Date.now(),
  };
}

/**
 * Defensive parse for turns arriving over HTTP from the browser. The client
 * is not trusted: this drops malformed entries rather than persisting or
 * evaluating garbage.
 *
 * - Drops anything whose `role` is not `"user"` or `"assistant"`.
 * - Drops anything whose `content` is not a non-empty string after trim.
 * - Coerces a missing or non-finite `timestamp` to `Date.now()`.
 * - Truncates any single `content` to `MAX_TURN_CONTENT_LENGTH` chars.
 * - Caps the array at `MAX_TRANSCRIPT_TURNS`, keeping the FIRST N turns.
 */
export function normalizeTurns(raw: unknown): InterviewTranscriptTurn[] {
  if (!Array.isArray(raw)) return [];

  const normalized: InterviewTranscriptTurn[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;

    const candidate = entry as Record<string, unknown>;
    const role = candidate.role;
    if (role !== "user" && role !== "assistant") continue;

    const rawContent = candidate.content;
    if (typeof rawContent !== "string") continue;
    const trimmed = rawContent.trim();
    if (!trimmed) continue;

    const content =
      trimmed.length > MAX_TURN_CONTENT_LENGTH
        ? trimmed.slice(0, MAX_TURN_CONTENT_LENGTH)
        : trimmed;

    const rawTimestamp = candidate.timestamp;
    const timestamp =
      typeof rawTimestamp === "number" && Number.isFinite(rawTimestamp)
        ? rawTimestamp
        : Date.now();

    normalized.push({ role, content, timestamp });

    if (normalized.length >= MAX_TRANSCRIPT_TURNS) break;
  }

  return normalized;
}

/**
 * Speaker-labeled plain text rendering of a transcript. This is exactly what
 * the evaluator's `full_transcript` input receives — see
 * `INTERVIEW_EVALUATOR_PROMPT` in `./prompts`.
 */
export function formatTranscriptForEvaluator(
  transcript: InterviewTranscript
): string {
  return transcript.turns
    .map((turn) => {
      const speaker = turn.role === "assistant" ? "Interviewer" : "Candidate";
      return `${speaker}: ${turn.content}`;
    })
    .join("\n\n");
}
