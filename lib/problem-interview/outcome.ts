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
  type ProcessFramework,
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
 * Deterministic repairs for the ways a model mangles a JSON-encoded array,
 * tried in order: a markdown code fence or prose around it, trailing commas,
 * smart quotes used as JSON quotes, and finally an array cut off mid-object
 * (keep the complete objects). Never a re-ask — the result must be
 * reproducible from the stored text alone.
 */
function repairStepsJson(text: string): unknown {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1]!.trim();
  const start = body.indexOf("[");
  if (start !== -1) body = body.slice(start);
  const end = body.lastIndexOf("]");
  const closed = end !== -1 ? body.slice(0, end + 1) : body;
  const noTrailing = (t: string) => t.replace(/,\s*([\]}])/g, "$1");
  const straight = (t: string) => t.replace(/[\u201C\u201D]/g, '"');
  const lastObject = body.lastIndexOf("}");
  const attempts = [
    closed,
    noTrailing(closed),
    noTrailing(straight(closed)),
    ...(lastObject !== -1 ? [noTrailing(`${body.slice(0, lastObject + 1)}]`)] : []),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // next repair
    }
  }
  // Last resort for unescaped quotes inside a quote/note: read each row's
  // fields by name. Only rows with a readable key AND status survive.
  const rows = body
    .split(/(?=\{\s*"key"\s*:)/)
    .flatMap((chunk) => {
      const key = chunk.match(/^\{\s*"key"\s*:\s*"([a-z0-9_]+)"/i)?.[1];
      const status = chunk.match(/"status"\s*:\s*"(hit|prompted|missed|not_applicable)"/)?.[1];
      if (!key || !status) return [];
      const timecode = chunk.match(/"timecodeSeconds"\s*:\s*(\d+(?:\.\d+)?)/)?.[1];
      const field = (name: string) =>
        chunk.match(new RegExp(`"${name}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"[a-zA-Z]+"\\s*:|\\})`))?.[1] ?? "";
      return [
        {
          key,
          status,
          evidenceQuote: field("evidenceQuote"),
          timecodeSeconds: timecode === undefined ? null : Number(timecode),
          note: field("note"),
        },
      ];
    });
  if (rows.length > 0) return rows;
  throw new Error("processSteps: no deterministic repair parsed");
}

export interface ParsedProcessSteps {
  value: unknown;
  /** True when the strict parse failed and a repair was needed. */
  repaired: boolean;
}

/** Strict JSON first, then the deterministic repairs. Null when neither parses. */
export function parseProcessStepsValue(value: unknown): ParsedProcessSteps | null {
  if (typeof value !== "string") return { value, repaired: false };
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return { value: JSON.parse(trimmed), repaired: false };
  } catch {
    try {
      return { value: repairStepsJson(trimmed), repaired: true };
    } catch {
      return null;
    }
  }
}

/**
 * Narrow `outcome.processSteps` — a JSON-encoded `ProcessStepResult[]`, or (if
 * a future writer stores it decoded) an array. Tolerates a fenced / prose-
 * wrapped / trailing-comma string and an array wrapped in a one-key object
 * (see `repairStepsJson`). Rows that are not results are dropped; an empty or
 * unparseable value is null.
 */
export function asProcessStepResults(value: unknown): ProcessStepResult[] | null {
  const parsed = parseProcessStepsValue(value);
  if (!parsed) return null;
  let raw: unknown = parsed.value;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const arrays = Object.values(raw as Record<string, unknown>).filter(Array.isArray);
    if (arrays.length === 1) raw = arrays[0];
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
 * Words that, in a quote, show the candidate actually narrowed or chose —
 * "everyone except…", "I'd focus on commuters". A generic-answer term next to
 * one of these is part of a real answer, not a non-answer.
 */
const CHOICE_SIGNAL =
  /\b(focus|segment|segments|prioriti[sz]e|target|start with|pick|choose|narrow|specifically|except|rather than|instead of)\b/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `quote` rests on one of the step's generic-answer terms
 * ("everyone", "all users") without any sign of a choice. Deterministic and
 * deliberately narrow: only steps that declare `genericAnswerTerms` use it.
 */
export function isGenericNonAnswer(quote: string, terms: readonly string[] | undefined): boolean {
  if (!terms?.length || !quote.trim()) return false;
  if (CHOICE_SIGNAL.test(quote)) return false;
  return terms.some((term) =>
    new RegExp(`(?<!\\bnot\\s)\\b${escapeRegExp(term)}\\b`, "i").test(quote),
  );
}

/**
 * The earliest time each step was nudged, from the server's event trail.
 * A step listed in `state.nudgedSteps` with no event (an older snapshot) maps
 * to 0, i.e. "nudged before anything" — the conservative reading.
 */
function nudgeTimes(snapshot: ProblemSessionSnapshot): Map<string, number> {
  const at = new Map<string, number>();
  for (const event of snapshot.events) {
    if (event.kind !== "nudge") continue;
    const prior = at.get(event.step);
    if (prior === undefined || event.atSeconds < prior) at.set(event.step, event.atSeconds);
  }
  for (const step of snapshot.state.nudgedSteps) {
    if (!at.has(step)) at.set(step, 0);
  }
  return at;
}

/**
 * Reconcile the evaluator's produced outcome with what the server knows:
 *  - `questionId` / `frameworkKey` always come from the snapshot (the model is
 *    asked to copy them, but the snapshot is the authority);
 *  - `processSteps` keeps only the framework's own steps, in its order;
 *  - nudge ordering: a step the server recorded as nudged can only be `hit`
 *    when its evidence came BEFORE the nudge. Evidence at or after the nudge
 *    (or with no timecode) is at best `prompted`; a `prompted` whose evidence
 *    demonstrably predates the nudge is restored to `hit`. Nudge `atSeconds`
 *    is taken when the nudging reply finished, so an answer TO the nudge
 *    always lands at or after it — a tie counts as "after";
 *  - generic non-answers: when `frameworkDef` declares `genericAnswerTerms`
 *    for a step, a hit/prompted resting on one ("I'd build it for everyone")
 *    is `missed`.
 *
 * Returns a new produced-outcome object, still shaped as the type's declared
 * scalar fields so `validateOutcome` accepts it.
 */
export function finalizeProblemOutcome(
  produced: Record<string, unknown> | null,
  snapshot: ProblemSessionSnapshot,
  frameworkDef?: ProcessFramework | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(produced ?? {}) };
  next[PROBLEM_OUTCOME_FIELD_KEYS.questionId] = snapshot.questionId;
  next[PROBLEM_OUTCOME_FIELD_KEYS.frameworkKey] = snapshot.frameworkKey;

  const rawSteps = next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps];
  const results = asProcessStepResults(rawSteps);
  if (!results) {
    if (rawSteps !== undefined && rawSteps !== null && rawSteps !== "") {
      console.warn("Problem interview: processSteps unparseable; dropped", {
        questionId: snapshot.questionId,
        sample: String(typeof rawSteps === "string" ? rawSteps : JSON.stringify(rawSteps)).slice(0, 200),
      });
    }
    // Leave a malformed value out entirely rather than persisting garbage.
    delete next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps];
    return next;
  }

  if (parseProcessStepsValue(rawSteps)?.repaired) {
    console.warn("Problem interview: processSteps needed a tolerant parse", {
      questionId: snapshot.questionId,
    });
  }

  const nudgedAt = nudgeTimes(snapshot);
  const defsByKey = new Map(
    (frameworkDef?.key === snapshot.frameworkKey ? frameworkDef.steps : []).map((step) => [
      step.key,
      step,
    ]),
  );
  const byKey = new Map(results.map((result) => [result.key, result]));
  const ordered = snapshot.framework.steps.length
    ? snapshot.framework.steps.flatMap((step) => {
        const result = byKey.get(step.key);
        return result ? [result] : [];
      })
    : results;

  const reconciled = ordered.map((result): ProcessStepResult => {
    if (result.status !== "hit" && result.status !== "prompted") return result;
    if (isGenericNonAnswer(result.evidenceQuote, defsByKey.get(result.key)?.genericAnswerTerms)) {
      return { ...result, status: "missed" };
    }
    const nudge = nudgedAt.get(result.key);
    if (nudge === undefined) return result;
    const before = result.timecodeSeconds !== null && result.timecodeSeconds < nudge;
    if (result.status === "hit" && !before) return { ...result, status: "prompted" };
    if (result.status === "prompted" && before) return { ...result, status: "hit" };
    return result;
  });

  if (reconciled.length > 0) {
    next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps] = JSON.stringify(reconciled);
  } else {
    delete next[PROBLEM_OUTCOME_FIELD_KEYS.processSteps];
  }
  return next;
}

/** One framework step as the report renders it. */
export interface ProcessStepView {
  key: string;
  label: string;
  description: string;
  /**
   * Null when the evaluator returned no result for this step. `note` is
   * display-ready: the grading prefix is already stripped (see
   * `stripStepNoteGradingPrefix`), so it may be empty even when the step was
   * graded.
   */
  result: ProcessStepResult | null;
}

/**
 * `Meets all criteria: yes.` / `Meets all criteria: no.` is a GRADING
 * MECHANISM, not student-facing coaching. The shared problem-interview rules
 * make every step note open with it so the status cannot drift from the note
 * (docs/interviews/system-design-validity.md); the student has no use for it —
 * the status chip beside the step already says Hit / Prompted / Missed, and
 * "Meets all criteria: no." reads as a verdict restated in grader's voice.
 *
 * Strips the prefix for display only. The stored outcome keeps the raw note,
 * which is what the grading studies and any later audit read.
 */
export function stripStepNoteGradingPrefix(note: string): string {
  return note
    .replace(/^\s*meets all criteria\s*[:—–-]?\s*(yes|no)\b\s*[.!,;:—–-]?\s*/i, "")
    .trim();
}

/**
 * Join the snapshot's framework with the outcome's results for the report.
 * Steps keep framework order; a result for a key the framework does not
 * declare is dropped.
 *
 * This is the ONE place a render path gets its step notes from, so the
 * grading-prefix strip lives here rather than in a panel — a second render
 * surface cannot forget it.
 */
export function buildProcessStepViews(
  framework: PublicProcessFramework,
  outcomeProcessSteps: unknown,
): ProcessStepView[] {
  const results = asProcessStepResults(outcomeProcessSteps) ?? [];
  const byKey = new Map(results.map((result) => [result.key, result]));
  return framework.steps.map((step) => {
    const result = byKey.get(step.key) ?? null;
    return {
      key: step.key,
      label: step.label,
      description: step.description,
      result: result
        ? { ...result, note: stripStepNoteGradingPrefix(result.note) }
        : null,
    };
  });
}
