/**
 * Coding evidence is private report data. Browser requests may submit only
 * candidate source checkpoints/final source; transcript, hints and execution
 * evidence are authored exclusively by the server.
 */

import { MAX_TECHNICAL_SOURCE_BYTES } from "./execution";

export const TECHNICAL_EVIDENCE_VERSION = 1 as const;
export const MAX_TECHNICAL_CHECKPOINTS = 24;
export const MAX_TECHNICAL_EVIDENCE_BYTES = 200_000;
export const MAX_TECHNICAL_VISIBLE_TURNS = 48;
export const MAX_TECHNICAL_VISIBLE_TURN_BYTES = 4_000;

export interface TechnicalSourceCheckpoint {
  source: string;
}

export interface TechnicalSourceCheckpointPayload {
  version: typeof TECHNICAL_EVIDENCE_VERSION;
  checkpoints: TechnicalSourceCheckpoint[];
}

export interface TechnicalVisibleTurn {
  role: "user" | "assistant";
  content: string;
}

/** Server-only envelope. `finalExecution` is null until an approved sandbox exists. */
export interface TechnicalEvidence extends TechnicalSourceCheckpointPayload {
  visibleTurns: TechnicalVisibleTurn[];
  finalSource?: string;
  finalExecution: null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function sourceIsValid(source: unknown): source is string {
  return typeof source === "string" && byteLength(source) <= MAX_TECHNICAL_SOURCE_BYTES;
}

function evidenceIsBounded(evidence: TechnicalEvidence): boolean {
  let total = 0;
  for (const checkpoint of evidence.checkpoints) total += byteLength(checkpoint.source);
  for (const turn of evidence.visibleTurns) total += byteLength(turn.content);
  if (evidence.finalSource) total += byteLength(evidence.finalSource);
  return total <= MAX_TECHNICAL_EVIDENCE_BYTES;
}

/** Narrow browser contract. Extra properties are rejected rather than retained. */
export function validateTechnicalCheckpoints(
  value: unknown,
): { ok: true; value: TechnicalSourceCheckpointPayload } | { ok: false; error: string } {
  if (!isPlainObject(value) || value.version !== TECHNICAL_EVIDENCE_VERSION) {
    return { ok: false, error: "Invalid technical source checkpoints" };
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "version" && key !== "checkpoints")) {
    return { ok: false, error: "Technical checkpoint payload contains unsupported fields" };
  }
  if (!Array.isArray(value.checkpoints) || value.checkpoints.length > MAX_TECHNICAL_CHECKPOINTS) {
    return { ok: false, error: "Invalid technical source checkpoints" };
  }
  const checkpoints: TechnicalSourceCheckpoint[] = [];
  let total = 0;
  for (const checkpoint of value.checkpoints) {
    if (!isPlainObject(checkpoint) || Object.keys(checkpoint).some((key) => key !== "source") || !sourceIsValid(checkpoint.source)) {
      return { ok: false, error: "Invalid technical source checkpoint" };
    }
    total += byteLength(checkpoint.source);
    if (total > MAX_TECHNICAL_EVIDENCE_BYTES) return { ok: false, error: "Technical evidence exceeds the allowed size" };
    checkpoints.push({ source: checkpoint.source });
  }
  return { ok: true, value: { version: TECHNICAL_EVIDENCE_VERSION, checkpoints } };
}

/** Defensive parser for records written through server-only helpers. */
export function parseStoredTechnicalEvidence(value: unknown): TechnicalEvidence | null {
  if (!isPlainObject(value)) return null;
  const checkpoints = validateTechnicalCheckpoints({ version: value.version, checkpoints: value.checkpoints });
  if (!checkpoints.ok || !Array.isArray(value.visibleTurns)) return null;
  if (value.visibleTurns.length > MAX_TECHNICAL_VISIBLE_TURNS) return null;
  const visibleTurns: TechnicalVisibleTurn[] = [];
  for (const turn of value.visibleTurns) {
    if (!isPlainObject(turn) || (turn.role !== "user" && turn.role !== "assistant") || typeof turn.content !== "string" || !turn.content.trim() || byteLength(turn.content) > MAX_TECHNICAL_VISIBLE_TURN_BYTES) return null;
    visibleTurns.push({ role: turn.role, content: turn.content });
  }
  const finalSource = value.finalSource;
  if (finalSource !== undefined && (!sourceIsValid(finalSource) || !finalSource.trim())) return null;
  // Historical records have no field; normalize them to the fail-closed state.
  if (value.finalExecution !== undefined && value.finalExecution !== null) return null;
  const evidence: TechnicalEvidence = { ...checkpoints.value, visibleTurns, ...(typeof finalSource === "string" ? { finalSource } : {}), finalExecution: null };
  return evidenceIsBounded(evidence) ? evidence : null;
}

export function emptyTechnicalEvidence(): TechnicalEvidence {
  return { version: TECHNICAL_EVIDENCE_VERSION, checkpoints: [], visibleTurns: [], finalExecution: null };
}

export function replaceCandidateCheckpoints(
  persisted: unknown,
  checkpoints: TechnicalSourceCheckpointPayload,
): TechnicalEvidence {
  const prior = parseStoredTechnicalEvidence(persisted) ?? emptyTechnicalEvidence();
  const next = { ...prior, checkpoints: checkpoints.checkpoints };
  return evidenceIsBounded(next) ? next : prior;
}

export function appendServerVisibleTurns(
  persisted: unknown,
  turns: readonly TechnicalVisibleTurn[],
): TechnicalEvidence {
  const prior = parseStoredTechnicalEvidence(persisted) ?? emptyTechnicalEvidence();
  const valid = turns.filter((turn) => turn.content.trim() && byteLength(turn.content) <= MAX_TECHNICAL_VISIBLE_TURN_BYTES);
  const next = { ...prior, visibleTurns: [...prior.visibleTurns, ...valid].slice(-MAX_TECHNICAL_VISIBLE_TURNS) };
  return evidenceIsBounded(next) ? next : prior;
}

export function setFinalSource(persisted: unknown, finalSource: string): TechnicalEvidence {
  const prior = parseStoredTechnicalEvidence(persisted) ?? emptyTechnicalEvidence();
  const next = { ...prior, finalSource, finalExecution: null };
  return evidenceIsBounded(next) ? next : prior;
}

export function validateTechnicalFinalSource(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (!sourceIsValid(value) || !value.trim()) return { ok: false, error: "Final Python source is required" };
  return { ok: true, value };
}

/** Compatibility name for evaluator callers. */
export function asTechnicalEvidence(value: unknown): TechnicalEvidence | null {
  const evidence = parseStoredTechnicalEvidence(value);
  return evidence?.finalSource ? evidence : null;
}
