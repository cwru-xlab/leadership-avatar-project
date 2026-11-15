/**
 * Server-side timecodes for evaluator quotes.
 *
 * The evaluator reads `[m:ss]` stamps and converts them to seconds itself,
 * and it gets that wrong (e.g. `[1:25]` written as 125, not 85), or moves a
 * stamp. The quote is the reliable part, so after evaluation each quote is
 * located in the student's own timestamped turns and the time is taken from
 * the matching turn. The model's time stands only when nothing matches.
 *
 * Applied by `lib/engine/evaluation-runner.ts` to every outcome field that
 * carries `{ quote, timecodeSeconds }` rows as a JSON-encoded array:
 * the five-moves checklist, problem-interview process steps, and the
 * difficult-conversation reaction causes. (Questioned-persona checklists
 * already time their quotes from the matched utterance in `assembleAnalysis`,
 * with a stricter verbatim rule, so they do not go through here.)
 *
 * Pure: no I/O.
 */

export interface TimedTurn {
  role: string;
  content: string;
  timestamp: number;
}

export interface StudentTurnText {
  text: string;
  timecodeSeconds: number;
}

/** Same clock as `formatTranscriptForEvaluator`: seconds from session start. */
export function studentTurnTexts(turns: TimedTurn[], startedAt: number): StudentTurnText[] {
  return turns
    .filter((turn) => turn.role === "user" && turn.content.trim())
    .map((turn) => ({
      text: turn.content,
      timecodeSeconds: Math.max(0, Math.round((turn.timestamp - startedAt) / 1000)),
    }));
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    // Contractions expand, so "hasn't" and "has not" compare equal.
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/n't\b/g, " not")
    .replace(/'m\b/g, " am")
    .replace(/'re\b/g, " are")
    .replace(/'ve\b/g, " have")
    .replace(/'ll\b/g, " will")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Minimum quote length (in words) for a fuzzy match to count. */
const FUZZY_MIN_TOKENS = 4;
/** Share of the quote's words that must appear in the turn for a fuzzy match. */
const FUZZY_MIN_OVERLAP = 0.8;

/**
 * The turn a quote came from, or null. Tried in order:
 *  1. exact: the quote's words, in order, as a contiguous run in the turn
 *     (case, punctuation and quote style ignored). A quote trimmed with
 *     "…" / "..." matches on its longest fragment.
 *  2. near: at least 80% of the quote's words (min. 4 words) occur in the
 *     turn — tolerates a dropped filler word or a light paraphrase.
 * Among equally good matches, the one nearest the model's own time wins
 * (falling back to the earliest), so a repeated phrase lands on the right turn.
 */
export function locateQuoteTurn(
  quote: string,
  turns: StudentTurnText[],
  modelSeconds: number | null = null,
): StudentTurnText | null {
  const fragments = quote
    .split(/…|\.\.\./)
    .map(tokens)
    .filter((f) => f.length > 0)
    .sort((a, b) => b.length - a.length);
  const q = fragments[0];
  if (!q || q.length < 2) return null;

  const scored = turns.map((turn) => {
    const t = tokens(turn.text);
    const joined = ` ${t.join(" ")} `;
    if (joined.includes(` ${q.join(" ")} `)) return { turn, score: 2 };
    if (q.length < FUZZY_MIN_TOKENS) return { turn, score: 0 };
    const pool = new Map<string, number>();
    for (const w of t) pool.set(w, (pool.get(w) ?? 0) + 1);
    let found = 0;
    for (const w of q) {
      const n = pool.get(w) ?? 0;
      if (n > 0) {
        found += 1;
        pool.set(w, n - 1);
      }
    }
    const overlap = found / q.length;
    return { turn, score: overlap >= FUZZY_MIN_OVERLAP ? overlap : 0 };
  });

  const best = Math.max(0, ...scored.map((s) => s.score));
  if (best === 0) return null;
  const top = scored.filter((s) => s.score === best).map((s) => s.turn);
  if (modelSeconds === null || top.length === 1) return top[0];
  return top.reduce((a, b) =>
    Math.abs(b.timecodeSeconds - modelSeconds) < Math.abs(a.timecodeSeconds - modelSeconds) ? b : a,
  );
}

/**
 * Re-time every row of a JSON-encoded (or already decoded) array of
 * `{ [quoteKey]: string, timecodeSeconds }`. Representation-preserving: a
 * string comes back a string, an array an array; anything unparseable comes
 * back untouched for the field's own narrowing to deal with.
 */
export function retimeQuotedRows(
  value: unknown,
  quoteKey: string,
  turns: StudentTurnText[],
): unknown {
  if (turns.length === 0) return value;
  let rows: unknown = value;
  const wasString = typeof value === "string";
  if (wasString) {
    try {
      rows = JSON.parse(value as string);
    } catch {
      return value;
    }
  }
  if (!Array.isArray(rows)) return value;

  const retimed = rows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    const quote = row[quoteKey];
    if (typeof quote !== "string" || !quote.trim()) return row;
    const modelSeconds =
      typeof row.timecodeSeconds === "number" && Number.isFinite(row.timecodeSeconds)
        ? row.timecodeSeconds
        : null;
    const match = locateQuoteTurn(quote, turns, modelSeconds);
    return match ? { ...row, timecodeSeconds: match.timecodeSeconds } : row;
  });
  return wasString ? JSON.stringify(retimed) : retimed;
}

/** The outcome fields this applies to, and the key holding each row's quote. */
export const QUOTED_OUTCOME_FIELDS: ReadonlyArray<{ field: string; quoteKey: string }> = [
  { field: "conversationSteps", quoteKey: "evidenceQuote" },
  { field: "processSteps", quoteKey: "evidenceQuote" },
  { field: "reactionCauses", quoteKey: "quote" },
];

/** Re-time every quoted field present on a produced outcome. */
export function retimeOutcomeQuotes(
  outcome: Record<string, unknown> | null,
  turns: StudentTurnText[],
): Record<string, unknown> | null {
  if (!outcome || turns.length === 0) return outcome;
  const next = { ...outcome };
  for (const { field, quoteKey } of QUOTED_OUTCOME_FIELDS) {
    if (field in next) next[field] = retimeQuotedRows(next[field], quoteKey, turns);
  }
  return next;
}
