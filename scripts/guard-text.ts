/**
 * Identifier-aware text matching for guard scripts.
 *
 * WHY THIS EXISTS
 *
 * Vocabulary guards (the "this product has no gating/streaks" checks in
 * verify-levels-goals.ts and verify-path-surface.ts) searched source with a
 * plain lowercase `includes(term)`. Substring matching does not respect
 * identifier boundaries, so the forbidden term `locked` matched the local
 * variable `blocked` in `lib/study-plan/drill/grade.ts`:
 *
 *   const blocked = ctx.ineligibleIds ?? new Set<string>();
 *
 * `blocked` there is a set of ineligible drill technique ids — the opposite of
 * feature gating. Two guards failed on it, and the existing remedy was a
 * hand-maintained denylist of "known unrelated collisions", which grows with
 * every innocent word that happens to contain a forbidden one.
 *
 * Matching on identifier tokens instead fixes the class: `blocked` is one
 * token and never matches `locked`, while `isLocked`, `locked_by` and
 * `walkOutLocked` still do, because camelCase and snake_case split into parts.
 */

/**
 * Normalises source into space-separated lowercase identifier tokens.
 *
 *   "const isLocked = walkOutLocked;" -> "const is locked walk out locked"
 *   "const blocked = x;"              -> "const blocked x"
 */
export function tokenizeIdentifiers(source: string): string {
  return source
    // camelCase / PascalCase boundaries: fooBar -> foo Bar
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // consecutive capitals followed by a word: HTTPServer -> HTTP Server
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // every non-alphanumeric run becomes a separator
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when `term` appears in `source` as a whole identifier token (or token
 * sequence), allowing a trailing suffix on the final token so that `unlock`
 * still catches `unlocked` and `unlocking`.
 *
 * The suffix allowance is deliberately one-directional: a term may match a
 * longer token that STARTS with it, never one that merely contains it. That is
 * what separates `unlock` -> `unlocked` (wanted) from `locked` -> `blocked`
 * (not wanted).
 */
export function containsIdentifierTerm(source: string, term: string): boolean {
  const haystack = tokenizeIdentifiers(source);
  const needle = tokenizeIdentifiers(term);

  if (!needle) return false;

  const pattern = needle
    .split(" ")
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");

  return new RegExp(`(?:^|\\s)${pattern}[a-z0-9]*(?:\\s|$)`).test(haystack);
}

/** Every term in `terms` that `containsIdentifierTerm` finds in `source`. */
export function forbiddenTermsIn(source: string, terms: readonly string[]): string[] {
  return terms.filter((term) => containsIdentifierTerm(source, term));
}
