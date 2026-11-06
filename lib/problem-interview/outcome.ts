/**
 * Problem-interview outcome handling: the evaluator's `processSteps` string,
 * narrowed, reconciled with server ground truth, and turned into a ceiling
 * for `process_rigor`.
 *
 * Pure. Never throws: a malformed value degrades to absent, matching
 * `asConversationOutcome` in `lib/report/dto.ts`.
 */

import {
  PROBLEM_OUTCOME_FIELD_KEYS,
  PROCESS_STEP_STATUSES,
  type ProcessStepResult,
  type ProcessStepStatus,
} from "./types";
import type {
  ProblemSessionSnapshot,
  PublicProcessFramework,
} from "./session-state";

const MAX_QUOTE = 400;
const MAX_NOTE = 600;

function isStatus(value: unknown): value is ProcessStepStatus {
  return (
    typeof value === "string" &&
    (PROCESS_STEP_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Narrow `outcome.processSteps` — a JSON-encoded `ProcessStepResult[]`, or (if
 * a future writer stores it decoded) an array. Rows that are not results are
 * dropped; an empty or unparseable value is null.
 */
export function asProcessStepResults(value: unknown): ProcessStepResult[] | null {
  let raw: unknown = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;

  const seen = new Set<string>();
  const out: ProcessStepResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || !row.key || seen.has(row.key)) continue;
    if (!isStatus(row.status)) continue;
    seen.add(row.key);
    out.push({
      key: row.key,
      status: row.status,
      evidenceQuote:
        typeof row.evidenceQuote === "string"
          ? row.evidenceQuote.trim().slice(0, MAX_QUOTE)
          : "",
      timecodeSeconds:
        typeof row.timecodeSeconds === "number" &&
        Number.isFinite(row.timecodeSeconds) &&
        row.timecodeSeconds >= 0
          ? Math.round(row.timecodeSeconds)
          : null,
      note: typeof row.note === "string" ? row.note.trim().slice(0, MAX_NOTE) : "",
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * Reconcile the evaluator's produced outcome with what the server knows:
 *  - `questionId` / `frameworkKey` always come from the snapshot (the model is
 *    asked to copy them, but the snapshot is the authority);
 *  - `processSteps` keeps only the framework's own steps, in its order, and a
 *    step the server recorded as nudged can never stay `hit` — it becomes
 *    `prompted` (the contract's definition).
 *
 * Returns a new produced-outcome object, still shaped as the type's declared
 * scalar fields so `validateOutcome` accepts it.
 */
export function finalizeProblemOutcome(
  produced: Record<string, unknown> | null,
  snapshot: ProblemSessionSnapshot,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(produced ?? {}) };
  next[PROBLEM_OUTCOME_FIELD_KEYS.questionId] = snapshot.questionId;
  next[PROBLEM_OUTCOME_FIELD_KEYS.frameworkKey] = snapshot.frameworkKey;

  const results = asProcessStepResults(next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps]);
  if (!results) {
    // Leave a malformed value out entirely rather than persisting garbage.
    delete next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps];
    return next;
  }

  const nudged = new Set(snapshot.state.nudgedSteps);
  for (const event of snapshot.events) {
    if (event.kind === "nudge") nudged.add(event.step);
  }
  const byKey = new Map(results.map((result) => [result.key, result]));
  const ordered = snapshot.framework.steps.length
    ? snapshot.framework.steps.flatMap((step) => {
        const result = byKey.get(step.key);
        return result ? [result] : [];
      })
    : results;

  const reconciled = ordered.map((result) =>
    result.status === "hit" && nudged.has(result.key)
      ? { ...result, status: "prompted" as const }
      : result,
  );

  if (reconciled.length > 0) {
    next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps] = JSON.stringify(reconciled);
  } else {
    delete next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps];
  }
  return next;
}

/**
 * The highest `process_rigor` score the step results allow, per
 * `PROCESS_RIGOR_SCORING_GUIDE` (lower band wins). Counts applicable steps
 * only. Null when there are no results to judge.
 *
 * The guide's "jumped straight to an answer" clause is a judgment about the
 * transcript and stays with the evaluator; this only enforces the countable
 * part.
 */
export function processRigorCeiling(results: ProcessStepResult[] | null): number | null {
  if (!results || results.length === 0) return null;
  const applicable = results.filter((result) => result.status !== "not_applicable");
  if (applicable.length === 0) return null;
  const prompted = applicable.filter((result) => result.status === "prompted").length;
  const missed = applicable.filter((result) => result.status === "missed").length;

  let ceiling = 5;
  if (prompted === 1) ceiling = Math.min(ceiling, 4);
  if (prompted === 2 || missed === 1) ceiling = Math.min(ceiling, 3);
  if (missed === 2 || prompted >= 3) ceiling = Math.min(ceiling, 2);
  if (missed >= 3) ceiling = Math.min(ceiling, 1);
  return ceiling;
}

/** One framework step as the report renders it. */
export interface ProcessStepView {
  key: string;
  label: string;
  description: string;
  /** Null when the evaluator returned no result for this step. */
  result: ProcessStepResult | null;
}

/**
 * Join the snapshot's framework with the outcome's results for the report.
 * Steps keep framework order; a result for a key the framework does not
 * declare is dropped.
 */
export function buildProcessStepViews(
  framework: PublicProcessFramework,
  outcomeProcessSteps: unknown,
): ProcessStepView[] {
  const results = asProcessStepResults(outcomeProcessSteps) ?? [];
  const byKey = new Map(results.map((result) => [result.key, result]));
  return framework.steps.map((step) => ({
    key: step.key,
    label: step.label,
    description: step.description,
    result: byKey.get(step.key) ?? null,
  }));
}
