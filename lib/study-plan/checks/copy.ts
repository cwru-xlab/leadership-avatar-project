/**
 * Question copy that matches the interaction (Phase 23, K3).
 *
 * A check's stored `prompt` is model text. Older rows asked the student to
 * "explain which answer is more attuned…" on a card with no explanation
 * input, or restated the options inline above the very same options. This
 * module holds the ONE predicate that decides whether a prompt fits the card
 * the student is looking at — generation uses it as a gate (a mismatching
 * candidate is discarded), and the card uses it to fall back to fixed,
 * per-format copy for older rows. One predicate in two places, so the two
 * can never disagree about what "matches" means.
 *
 * Pure and client-safe: no Prisma, no model, no Node built-ins.
 */
import { MIN_QUOTABLE_LENGTH } from "../verbatim";
import type { CheckFormat, CheckPayload } from "./types";

export const MAX_PROMPT_LENGTH = 400;

/**
 * Asks for a written explanation. A leading "Why…" question is allowed (a
 * multiple-choice stem such as "Why does leading with the conclusion help?"
 * is answered by picking an option); a trailing "…and why?" or a separate
 * "Why?" sentence is not, because nothing on the card takes that answer.
 */
const EXPLAIN_ASK =
  /\b(explain|explaining|justify|justifying|your reasoning|describe why|tell us why)\b|\band why\b|(^|[.!?]\s+)why\s*\?\s*$/i;

export function asksForExplanation(prompt: string): boolean {
  return EXPLAIN_ASK.test(prompt);
}

function optionTexts(payload: CheckPayload): string[] {
  switch (payload.format) {
    case "MULTIPLE_CHOICE":
      return payload.options;
    case "PICK_BETTER_RESPONSE":
      return payload.candidates;
    case "REWRITE_WEAK_LINE":
      return [payload.weakLine];
    case "FILL_IN_BLANK":
      return [];
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
}

/**
 * True when the prompt can be shown as the question above this payload's
 * interaction: non-empty, bounded, asks for no written explanation, and does
 * not restate an option / candidate / weak line the card already renders
 * (a restated quote is also a second, unguarded copy of the student's words).
 */
export function promptMatchesInteraction(prompt: string, payload: CheckPayload): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PROMPT_LENGTH) return false;
  if (asksForExplanation(trimmed)) return false;
  for (const text of optionTexts(payload)) {
    if (text.length >= MIN_QUOTABLE_LENGTH && trimmed.includes(text)) return false;
  }
  return true;
}

/** Fixed per-format copy used when a stored prompt does not match. */
export const FALLBACK_PROMPT: Record<CheckFormat, string> = {
  MULTIPLE_CHOICE: "Which option do I choose?",
  FILL_IN_BLANK: "I fill in the missing words.",
  PICK_BETTER_RESPONSE: "Which response handles this moment best?",
  REWRITE_WEAK_LINE: "I rewrite this line so it applies the technique below.",
};

export function displayPrompt(prompt: string, payload: CheckPayload): string {
  return promptMatchesInteraction(prompt, payload) ? prompt.trim() : FALLBACK_PROMPT[payload.format];
}
