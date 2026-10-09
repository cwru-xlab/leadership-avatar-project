/**
 * The guarantee that a slur or comparably explicit remark is never recited
 * back to the student.
 *
 * This is CODE, not evaluator prompt guidance. `conversation-prompts.ts`
 * asks the evaluator to characterize rather than quote explicit content as
 * a courtesy — that instruction is not a guarantee, because a model can
 * disobey a prompt. This module is what makes the guarantee hold even when
 * the evaluator disobeys, and `scripts/verify-dc-walkout-report.ts` proves
 * it against a payload that deliberately does.
 *
 * Runs server-side, on the way OUT of the server: `lib/report/dto.ts`'s
 * `toReportDto` is the one place an `InteractionReport` row's `outcome`
 * JSON becomes a client-facing payload (`ReportDTO.outcome` is a generic
 * `Record<string, unknown> | null`, narrowed in the browser by
 * `asConversationOutcome`). Sanitizing at render time would still ship the
 * verbatim text in the page payload before any component ever ran, so this
 * module is applied inside `toReportDto` — never in a component, never
 * later.
 *
 * Deliberately placed in `lib/report/`, not `lib/difficult-conversation/`:
 * `lib/report/dto.ts` and its siblings never import a type-specific module
 * (they only reach into `lib/engine/` and `lib/metrics/`, which are shared
 * across every type) — importing `lib/difficult-conversation/` from
 * `lib/report/` would be the first type-specific dependency in that
 * direction. See 20-06-SUMMARY.md for the full note; the plan's own
 * fallback path authorizes this move.
 *
 * Pure. No I/O, no model call, no clock, no randomness: the same input
 * always produces the same output.
 */

import { detectHostility } from "@/lib/engine/hostility";

export interface SanitizedQuote {
  quote: string;
  /** True when the original was altered; report copy may acknowledge it. */
  sanitized: boolean;
}

/**
 * Hard cap on a single reaction-cause quote so an evaluator cannot smuggle
 * a paragraph into a quote field. Applies only to the discrete `quote`
 * field on a `reactionCauses` row — NOT to `inRoleReaction` /
 * `endTurnReasons`, which are legitimately longer first-person prose and
 * are sanitized via `sanitizeProse` below (whole-field characterization on
 * severe content, unchanged otherwise, no length cap).
 */
const MAX_QUOTE_LENGTH = 240;

/**
 * One characterization per severe rule-group name from
 * `lib/engine/hostility.ts`'s `HostilityVerdict.matched` — the SEVERE
 * lexicon is the single source of what counts as explicit (see that
 * module's `SEVERE_PLACEHOLDER_PATTERN` / `SEVERE_HARASSMENT_PHRASES`).
 * This module never maintains a second private list of explicit content;
 * it only maps the detector's own rule-group names to report-safe prose.
 */
const SEVERE_CHARACTERIZATIONS: Record<string, string> = {
  severe_identity_slur: "[a slur directed at the character — not repeated here]",
  severe_harassment: "[a sexually harassing remark — not repeated here]",
};

const DEFAULT_SEVERE_CHARACTERIZATION =
  "[explicit content directed at the character — not repeated here]";

function characterizeSevere(matched: readonly string[]): string {
  for (const name of matched) {
    const found = SEVERE_CHARACTERIZATIONS[name];
    if (found) return found;
  }
  return DEFAULT_SEVERE_CHARACTERIZATION;
}

function capLength(text: string): string {
  if (text.length <= MAX_QUOTE_LENGTH) return text;
  return `${text.slice(0, MAX_QUOTE_LENGTH - 1).trimEnd()}…`;
}

/**
 * Sanitizes one short, discrete quote (a `reactionCauses` row's `quote`
 * field).
 *
 * 1. Classify with `detectHostility` — the SEVERE lexicon is the single
 *    source of what counts as explicit. A divergence between the detector
 *    and this sanitizer is exactly the bug that would recite a slur back,
 *    so there is no second lexicon here.
 * 2. `tier === "severe"` → do NOT attempt partial redaction (a masked slur
 *    with the consonants intact is still a recitation). Replace the WHOLE
 *    quote with a characterization drawn from the verdict's matched
 *    rule-group names. `sanitized: true`.
 * 3. `tier === "hostile"` or `"none"` → keep the quote. Hostility is the
 *    student's own behaviour and seeing it is the point of the report;
 *    only EXPLICIT content is withheld. The current SEVERE lexicon has no
 *    distinct "profanity" sub-group (only `severe_identity_slur` /
 *    `severe_harassment`), so there is nothing to partially mask inside a
 *    hostile-but-not-severe quote — it passes through unchanged,
 *    `sanitized: false`. `detectHostility` deliberately never returns a
 *    matched span (only rule-group names), so there is no span available
 *    to redact even if a sub-group existed.
 * 4. Always trimmed and hard-capped at `MAX_QUOTE_LENGTH` so an evaluator
 *    cannot smuggle a paragraph into a quote field.
 * 5. Never returns the matched span, never includes the original text in
 *    the replacement.
 */
export function sanitizeQuote(raw: string): SanitizedQuote {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { quote: "", sanitized: false };

  const verdict = detectHostility(trimmed);

  if (verdict.tier === "severe") {
    return { quote: characterizeSevere(verdict.matched), sanitized: true };
  }

  return { quote: capLength(trimmed), sanitized: false };
}

/**
 * Sanitizes a free-prose outcome field (`inRoleReaction` / `endTurnReasons`)
 * the same guarantee as `sanitizeQuote`, but without the discrete-quote
 * length cap — these are legitimately multi-sentence first-person prose,
 * not a single quoted line. Severe content anywhere in the field replaces
 * the WHOLE field with a characterization (the same "no partial redaction"
 * reasoning as `sanitizeQuote`); anything else passes through byte-for-byte.
 */
function sanitizeProse(raw: string): SanitizedQuote {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { quote: trimmed, sanitized: false };

  const verdict = detectHostility(trimmed);

  if (verdict.tier === "severe") {
    return { quote: characterizeSevere(verdict.matched), sanitized: true };
  }

  return { quote: raw, sanitized: false };
}

/** Narrow, apply `sanitizeQuote`, and drop anything that doesn't look like a reaction-cause row — mirrors `asReactionCauses`'s tolerance, but only touches `quote`. */
function sanitizeReactionCausesArray(rows: unknown[]): unknown[] {
  return rows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    if (typeof row.quote !== "string") return item;
    return {
      ...row,
      quote: sanitizeQuote(row.quote).quote,
    };
  });
}

/**
 * Walks a conversation outcome record and sanitizes only its quote-bearing
 * fields: `reactionCauses` (which may arrive as a JSON string OR an array —
 * mirrors `asReactionCauses`'s tolerance in `lib/report/dto.ts`, and is
 * re-serialized in the SAME representation it arrived in so no existing
 * consumer breaks), `inRoleReaction`, and `endTurnReasons` (free prose the
 * evaluator writes, which could quote the student verbatim too).
 *
 * `timecodeSeconds` and `effect` are untouched — the sanitizer only ever
 * transforms quote TEXT. Every other key is left untouched. Returns the
 * record unchanged when there is nothing to sanitize, and `null` for
 * `null`.
 */
export function sanitizeOutcomeQuotes(
  outcome: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!outcome) return null;

  const next: Record<string, unknown> = { ...outcome };

  if (typeof next.inRoleReaction === "string") {
    next.inRoleReaction = sanitizeProse(next.inRoleReaction).quote;
  }

  if (typeof next.endTurnReasons === "string") {
    next.endTurnReasons = sanitizeProse(next.endTurnReasons).quote;
  }

  const reactionCauses = next.reactionCauses;
  if (typeof reactionCauses === "string") {
    const trimmed = reactionCauses.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          next.reactionCauses = JSON.stringify(
            sanitizeReactionCausesArray(parsed),
          );
        }
      } catch {
        // Malformed JSON is not this module's problem to fix — leave it
        // as-is; `asReactionCauses` already drops unparseable strings
        // downstream without throwing.
      }
    }
  } else if (Array.isArray(reactionCauses)) {
    next.reactionCauses = sanitizeReactionCausesArray(reactionCauses);
  }

  return next;
}
