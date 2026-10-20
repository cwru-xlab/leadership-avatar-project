/**
 * Exact-match-or-reject verbatim quote validation.
 *
 * WHY THIS EXISTS: a model asked to quote a transcript will paraphrase, tidy
 * grammar, merge two turns, or invent. A prompt instruction not to do that is
 * not a guarantee. This function IS the guarantee — it rejects any quote that
 * is not byte-present in a stored `role: "user"` turn. Rejection, not repair,
 * because a repaired quote is the model's text wearing the student's name.
 *
 * This is the mechanical half of 21-CONTEXT.md's first named guardrail:
 * "never misquote the student." REQ-110.
 *
 * NORMALIZATION POLICY — the only permitted normalization is Unicode NFC
 * applied symmetrically to both the quote and every turn's content, because a
 * transcript turn and a model's echo of it can differ in composed-vs-
 * decomposed accents without differing in what was said. Nothing else is
 * applied. Specifically, none of the following are permitted, because each one
 * is a tempting "bug fix" that would quietly turn the guarantee off:
 *   - No case folding. Matching is case-SENSITIVE.
 *   - No trimming of interior or edge whitespace beyond what NFC performs.
 *   - No whitespace collapsing (double spaces are part of what was said).
 *   - No smart-quote folding.
 *   - No stripping or normalizing of punctuation.
 * A near-miss — one character removed, one letter re-cased, a period added,
 * a contraction expanded — is NOT_FOUND_IN_ANY_TURN. It is never "close
 * enough".
 *
 * This module performs NO model call, NO network access, and NO S3 read — the
 * caller supplies the already-fetched transcript. Keeping I/O out of this
 * function is what makes the adversarial battery runnable with zero
 * credentials.
 */
import type {
  InterviewTranscript,
  InterviewTranscriptTurn,
} from "../interview/transcript";

/**
 * A quote shorter than this matches by accident and proves nothing about what
 * the student meant — a three-word fragment could appear in nearly any
 * transcript. Exported BY NAME because this threshold is shared with
 * `extractSessionMoments` (which must only ever emit text this validator can
 * accept) and is recorded by name in later calibration work — it must never
 * be restated as a bare literal anywhere else.
 */
export const MIN_QUOTABLE_LENGTH = 12;

/**
 * The closed vocabulary of reasons a quote can be rejected under. Declared as
 * a `const` array (not a bare union) so the reason set is both a runtime value
 * and a type, matching the pattern this codebase already uses for closed
 * vocabularies (see `FEEDBACK_SOURCES` in `lib/report/structured.ts`).
 */
export const VERBATIM_REJECT_REASONS = [
  "EMPTY_QUOTE",
  "NOT_FOUND_IN_ANY_TURN",
  "FOUND_ONLY_IN_ASSISTANT_TURN",
  "SPANS_MULTIPLE_TURNS",
  "AMBIGUOUS_MULTIPLE_MATCHES",
  "TURN_INDEX_MISMATCH",
  "TOO_SHORT",
] as const;

export type VerbatimRejectReason = (typeof VERBATIM_REJECT_REASONS)[number];

export type VerbatimQuoteResult =
  | {
      ok: true;
      reportId: string;
      turnIndex: number;
      turnRole: "user";
      charStart: number;
      charEnd: number;
    }
  | {
      ok: false;
      reason: VerbatimRejectReason;
      detail: string;
    };

interface TurnMatch {
  turnIndex: number;
  role: InterviewTranscriptTurn["role"];
  start: number;
  end: number;
}

function reject(reason: VerbatimRejectReason, detail: string): VerbatimQuoteResult {
  return { ok: false, reason, detail };
}

/**
 * Collect EVERY occurrence of `needle` across every turn before deciding
 * anything. Deciding on the first hit would short-circuit the ambiguity and
 * role checks below — an early match in an assistant turn would hide a later,
 * correct match in a user turn, and a single match would hide a second one
 * that makes the quote ambiguous.
 */
function findAllMatches(
  needle: string,
  turns: InterviewTranscriptTurn[],
): TurnMatch[] {
  const matches: TurnMatch[] = [];
  turns.forEach((turn, turnIndex) => {
    const haystack = turn.content.normalize("NFC");
    let fromIndex = 0;
    for (;;) {
      const idx = haystack.indexOf(needle, fromIndex);
      if (idx === -1) break;
      matches.push({
        turnIndex,
        role: turn.role,
        start: idx,
        end: idx + needle.length,
      });
      fromIndex = idx + 1;
    }
  });
  return matches;
}

/**
 * Detects the case where a quote is the concatenation of the tail of one
 * `role: "user"` turn and the head of a LATER `role: "user"` turn — a model
 * merging two separate moments into one invented quote. Checked only when no
 * single turn contains the whole quote.
 */
function findSpanningSplit(
  needle: string,
  turns: InterviewTranscriptTurn[],
): { earlyTurnIndex: number; laterTurnIndex: number } | null {
  const userTurns = turns
    .map((turn, turnIndex) => ({ turn, turnIndex }))
    .filter((t) => t.turn.role === "user");

  for (let splitAt = 1; splitAt < needle.length; splitAt += 1) {
    const prefix = needle.slice(0, splitAt);
    const suffix = needle.slice(splitAt);

    const earlyMatch = userTurns.find((t) =>
      t.turn.content.normalize("NFC").endsWith(prefix),
    );
    if (!earlyMatch) continue;

    const laterMatch = userTurns.find(
      (t) =>
        t.turnIndex > earlyMatch.turnIndex &&
        t.turn.content.normalize("NFC").startsWith(suffix),
    );
    if (laterMatch) {
      return {
        earlyTurnIndex: earlyMatch.turnIndex,
        laterTurnIndex: laterMatch.turnIndex,
      };
    }
  }

  return null;
}

export function validateVerbatimQuote(
  quote: string,
  transcript: InterviewTranscript,
  opts?: { expectedTurnIndex?: number },
): VerbatimQuoteResult {
  // Whitespace-only emptiness check. Deliberately NOT implemented with the
  // string-trimming method — see the NORMALIZATION POLICY above: this is an
  // emptiness test, not a comparison-weakening normalization, so it is
  // written as a regex test that never touches the strings being matched.
  if (/^\s*$/.test(quote)) {
    return reject("EMPTY_QUOTE", "Quote is empty or whitespace-only.");
  }

  const normalizedQuote = quote.normalize("NFC");

  if (normalizedQuote.length < MIN_QUOTABLE_LENGTH) {
    return reject(
      "TOO_SHORT",
      `Quote is ${normalizedQuote.length} characters; must be at least ${MIN_QUOTABLE_LENGTH} to be quotable.`,
    );
  }

  const allMatches = findAllMatches(normalizedQuote, transcript.turns);

  if (allMatches.length === 0) {
    const spanning = findSpanningSplit(normalizedQuote, transcript.turns);
    if (spanning) {
      return reject(
        "SPANS_MULTIPLE_TURNS",
        `Quote spans turn ${spanning.earlyTurnIndex} and turn ${spanning.laterTurnIndex} — no single turn contains it.`,
      );
    }
    return reject(
      "NOT_FOUND_IN_ANY_TURN",
      `Quote was not found, byte-for-byte, in any of ${transcript.turns.length} stored turns.`,
    );
  }

  const userMatches = allMatches.filter((m) => m.role === "user");
  const assistantMatches = allMatches.filter((m) => m.role === "assistant");

  if (userMatches.length === 0 && assistantMatches.length > 0) {
    return reject(
      "FOUND_ONLY_IN_ASSISTANT_TURN",
      `Quote matches only turn ${assistantMatches[0].turnIndex}, an assistant turn. The avatar's words are never attributed to the student.`,
    );
  }

  const distinctUserTurnIndexes = new Set(userMatches.map((m) => m.turnIndex));
  if (distinctUserTurnIndexes.size > 1) {
    return reject(
      "AMBIGUOUS_MULTIPLE_MATCHES",
      `Quote matches ${distinctUserTurnIndexes.size} different user turns (${Array.from(distinctUserTurnIndexes).join(", ")}) — no unique originating moment.`,
    );
  }

  const match = userMatches[0];

  if (
    opts?.expectedTurnIndex !== undefined &&
    match.turnIndex !== opts.expectedTurnIndex
  ) {
    return reject(
      "TURN_INDEX_MISMATCH",
      `Quote matches turn ${match.turnIndex}, not the expected turn ${opts.expectedTurnIndex}.`,
    );
  }

  return {
    ok: true,
    reportId: transcript.reportId,
    turnIndex: match.turnIndex,
    turnRole: "user",
    charStart: match.start,
    charEnd: match.end,
  };
}
