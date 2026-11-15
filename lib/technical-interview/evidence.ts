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
/**
 * When a long session passes the turn cap, the FIRST turns are kept (opening,
 * clarification, approach — the part a coding interview is graded on first)
 * together with the most recent ones; the middle is dropped. A plain
 * `slice(-48)` used to throw the opening clarification away.
 */
export const KEEP_FIRST_TECHNICAL_VISIBLE_TURNS = 12;
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
  /**
   * Server clock (epoch ms) when the turn was recorded. Absent on records
   * written before 2026-11-15; finish falls back to its own clock for those.
   */
  timestamp?: number;
}

/** Server-only envelope. `finalExecution` is null until an approved sandbox exists. */
export interface TechnicalEvidence extends TechnicalSourceCheckpointPayload {
  visibleTurns: TechnicalVisibleTurn[];
  /** How many middle turns the cap dropped (absent = none). */
  omittedVisibleTurns?: number;
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
    // Timestamps are server-written; a malformed one is dropped, not fatal,
    // so a record stays readable (finish then falls back to its own clock).
    const timestamp = typeof turn.timestamp === "number" && Number.isFinite(turn.timestamp) && turn.timestamp > 0 ? turn.timestamp : undefined;
    visibleTurns.push({ role: turn.role, content: turn.content, ...(timestamp !== undefined ? { timestamp } : {}) });
  }
  const omitted = value.omittedVisibleTurns;
  const omittedVisibleTurns = typeof omitted === "number" && Number.isInteger(omitted) && omitted > 0 ? omitted : undefined;
  const finalSource = value.finalSource;
  if (finalSource !== undefined && (!sourceIsValid(finalSource) || !finalSource.trim())) return null;
  // Historical records have no field; normalize them to the fail-closed state.
  if (value.finalExecution !== undefined && value.finalExecution !== null) return null;
  const evidence: TechnicalEvidence = { ...checkpoints.value, visibleTurns, ...(omittedVisibleTurns ? { omittedVisibleTurns } : {}), ...(typeof finalSource === "string" ? { finalSource } : {}), finalExecution: null };
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

/**
 * First-N plus last-M cap. Idempotent on the first turns: once a session is
 * over the cap, every later append drops the oldest of the RECENT turns, so
 * the opening clarification survives however long the session runs.
 */
export function capVisibleTurns(
  turns: readonly TechnicalVisibleTurn[],
): { turns: TechnicalVisibleTurn[]; dropped: number } {
  if (turns.length <= MAX_TECHNICAL_VISIBLE_TURNS) return { turns: [...turns], dropped: 0 };
  const keepLast = MAX_TECHNICAL_VISIBLE_TURNS - KEEP_FIRST_TECHNICAL_VISIBLE_TURNS;
  return {
    turns: [...turns.slice(0, KEEP_FIRST_TECHNICAL_VISIBLE_TURNS), ...turns.slice(-keepLast)],
    dropped: turns.length - MAX_TECHNICAL_VISIBLE_TURNS,
  };
}

/**
 * Appends server-authored turns, stamping each with the server clock at the
 * moment it is recorded (the chat route calls this once per turn), so the
 * evaluator's [m:ss] stamps and quote timecodes point at real moments.
 */
export function appendServerVisibleTurns(
  persisted: unknown,
  turns: readonly TechnicalVisibleTurn[],
  now: number = Date.now(),
): TechnicalEvidence {
  const prior = parseStoredTechnicalEvidence(persisted) ?? emptyTechnicalEvidence();
  const valid = turns
    .filter((turn) => turn.content.trim() && byteLength(turn.content) <= MAX_TECHNICAL_VISIBLE_TURN_BYTES)
    // Only role and content are taken from the caller; a browser message
    // object can carry nothing else into the record.
    .map((turn) => ({ role: turn.role, content: turn.content, timestamp: now }));
  const capped = capVisibleTurns([...prior.visibleTurns, ...valid]);
  const omitted = (prior.omittedVisibleTurns ?? 0) + capped.dropped;
  const next: TechnicalEvidence = { ...prior, visibleTurns: capped.turns, ...(omitted > 0 ? { omittedVisibleTurns: omitted } : {}) };
  return evidenceIsBounded(next) ? next : prior;
}

export function setFinalSource(persisted: unknown, finalSource: string): TechnicalEvidence {
  const prior = parseStoredTechnicalEvidence(persisted) ?? emptyTechnicalEvidence();
  const next = { ...prior, finalSource, finalExecution: null };
  return evidenceIsBounded(next) ? next : prior;
}

export function validateTechnicalFinalSource(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (!sourceIsValid(value) || !value.trim()) return { ok: false, error: "Final source code is required" };
  return { ok: true, value };
}

/** Compatibility name for evaluator callers. */
export function asTechnicalEvidence(value: unknown): TechnicalEvidence | null {
  const evidence = parseStoredTechnicalEvidence(value);
  return evidence?.finalSource ? evidence : null;
}
