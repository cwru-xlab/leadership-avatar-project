/**
 * Bounded, server-validated coding evidence retained only with a technical
 * report. This contains candidate-authored source snapshots, never execution
 * provider output, hidden tests, or reference implementations.
 */

import { MAX_TECHNICAL_SOURCE_BYTES } from "./execution";
import type { TechnicalHintRecord } from "./chat-policy";

export const TECHNICAL_EVIDENCE_VERSION = 1 as const;
export const MAX_TECHNICAL_CHECKPOINTS = 24;
export const MAX_TECHNICAL_EVIDENCE_BYTES = 200_000;
export const MAX_TECHNICAL_VISIBLE_TURNS = 48;
export const MAX_TECHNICAL_VISIBLE_TURN_BYTES = 4_000;
export const MAX_TECHNICAL_HINTS = 2;

export interface TechnicalSourceCheckpoint {
  source: string;
}

export interface TechnicalVisibleTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TechnicalEvidenceDraft {
  version: typeof TECHNICAL_EVIDENCE_VERSION;
  checkpoints: TechnicalSourceCheckpoint[];
  /** Server-recorded visible interview turns; never provider internals. */
  visibleTurns?: TechnicalVisibleTurn[];
  /** Server-issued, learner-visible hints. */
  issuedHints?: TechnicalHintRecord[];
}

/** Complete private evidence envelope required before a report can queue. */
export interface TechnicalEvidence extends TechnicalEvidenceDraft {
  finalSource: string;
}

export type TechnicalEvidenceValidation =
  | { ok: true; value: TechnicalEvidenceDraft }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sourceIsValid(source: unknown): source is string {
  return (
    typeof source === "string" &&
    Buffer.byteLength(source, "utf8") <= MAX_TECHNICAL_SOURCE_BYTES
  );
}

/**
 * Validate a client-supplied source checkpoint envelope before it reaches the
 * private report column. Empty source is a valid draft checkpoint; a final
 * submission is validated separately and must be non-empty.
 */
export function validateTechnicalEvidence(
  value: unknown,
): TechnicalEvidenceValidation {
  if (!isPlainObject(value) || value.version !== TECHNICAL_EVIDENCE_VERSION) {
    return { ok: false, error: "Invalid technical evidence" };
  }
  if (!Array.isArray(value.checkpoints) || value.checkpoints.length > MAX_TECHNICAL_CHECKPOINTS) {
    return { ok: false, error: "Invalid technical evidence checkpoints" };
  }

  const checkpoints: TechnicalSourceCheckpoint[] = [];
  let totalBytes = 0;
  for (const checkpoint of value.checkpoints) {
    if (!isPlainObject(checkpoint) || !sourceIsValid(checkpoint.source)) {
      return { ok: false, error: "Invalid technical source checkpoint" };
    }
    totalBytes += Buffer.byteLength(checkpoint.source, "utf8");
    if (totalBytes > MAX_TECHNICAL_EVIDENCE_BYTES) {
      return { ok: false, error: "Technical evidence exceeds the allowed size" };
    }
    checkpoints.push({ source: checkpoint.source });
  }

  const visibleTurns: TechnicalVisibleTurn[] = [];
  if (value.visibleTurns !== undefined) {
    if (!Array.isArray(value.visibleTurns) || value.visibleTurns.length > MAX_TECHNICAL_VISIBLE_TURNS) {
      return { ok: false, error: "Invalid technical visible turns" };
    }
    for (const turn of value.visibleTurns) {
      if (!isPlainObject(turn) || (turn.role !== "user" && turn.role !== "assistant") || !sourceIsValid(turn.content) || Buffer.byteLength(turn.content, "utf8") > MAX_TECHNICAL_VISIBLE_TURN_BYTES) {
        return { ok: false, error: "Invalid technical visible turn" };
      }
      totalBytes += Buffer.byteLength(turn.content, "utf8");
      if (totalBytes > MAX_TECHNICAL_EVIDENCE_BYTES) return { ok: false, error: "Technical evidence exceeds the allowed size" };
      visibleTurns.push({ role: turn.role, content: turn.content });
    }
  }

  const issuedHints: TechnicalHintRecord[] = [];
  if (value.issuedHints !== undefined) {
    if (!Array.isArray(value.issuedHints) || value.issuedHints.length > MAX_TECHNICAL_HINTS) return { ok: false, error: "Invalid technical hints" };
    for (const hint of value.issuedHints) {
      if (!isPlainObject(hint) || (hint.tier !== 1 && hint.tier !== 2) || typeof hint.requestKey !== "string" || typeof hint.text !== "string" || typeof hint.issuedAt !== "string") return { ok: false, error: "Invalid technical hint" };
      issuedHints.push({ requestKey: hint.requestKey, tier: hint.tier, text: hint.text, issuedAt: hint.issuedAt });
    }
  }

  return {
    ok: true,
    value: { version: TECHNICAL_EVIDENCE_VERSION, checkpoints, ...(visibleTurns.length ? { visibleTurns } : {}), ...(issuedHints.length ? { issuedHints } : {}) },
  };
}

/** Validate the final candidate source persisted before a coding report queues. */
export function validateTechnicalFinalSource(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!sourceIsValid(value) || !value.trim()) {
    return { ok: false, error: "Final Python source is required" };
  }
  return { ok: true, value };
}

/** Retain server-authored chat evidence when a client refreshes source checkpoints. */
export function mergeTechnicalEvidence(
  client: TechnicalEvidenceDraft,
  persisted: unknown,
): TechnicalEvidenceDraft {
  const prior = validateTechnicalEvidence(persisted);
  if (!prior.ok) return client;
  return {
    ...client,
    ...(prior.value.visibleTurns ? { visibleTurns: prior.value.visibleTurns } : {}),
    ...(prior.value.issuedHints ? { issuedHints: prior.value.issuedHints } : {}),
  };
}

/** Complete a validated draft only after the separately submitted final source passes. */
export function finalizeTechnicalEvidence(
  draft: TechnicalEvidenceDraft,
  finalSource: string,
): TechnicalEvidence {
  return { ...draft, finalSource };
}

/** Defensive read validator for private evidence consumed by the evaluator. */
export function asTechnicalEvidence(value: unknown): TechnicalEvidence | null {
  if (!isPlainObject(value) || !sourceIsValid(value.finalSource) || !value.finalSource.trim()) {
    return null;
  }
  const draft = validateTechnicalEvidence(value);
  return draft.ok ? finalizeTechnicalEvidence(draft.value, value.finalSource) : null;
}
