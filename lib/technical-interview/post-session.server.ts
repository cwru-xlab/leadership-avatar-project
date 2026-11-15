import "server-only";

/**
 * Material a student may see AFTER their coding report is READY: how a strong
 * candidate approaches the problem and a clean model solution. Server-only and
 * never sent during a live session (see types.ts on in-session integrity).
 *
 * CONTRACT (2026-11-15 coding-report loop): loop/coding-corpus implements
 * `getPostSessionMaterial` and authors the content; loop/coding-report-ui
 * calls it from an owner-only, READY-only report path and renders it, with the
 * model solution hidden behind an explicit reveal.
 */

export type CodingLanguage = "python" | "javascript";

export interface PostSessionMaterial {
  /** Plain-language walkthrough of the optimal approach (2–5 short paragraphs). */
  approach: string;
  /** Target complexity, e.g. "O(n) time, O(k) space". */
  complexity: string;
  /** Common mistakes to watch for, one sentence each. */
  pitfalls: string[];
  /** Clean, commented model solutions, keyed by language. */
  modelSolutions: Record<CodingLanguage, string>;
}

/**
 * Returns the post-session material for an assignment, or null when none is
 * authored. Implemented in loop/coding-corpus.
 */
export function getPostSessionMaterial(assignmentId: string): PostSessionMaterial | null {
  void assignmentId;
  return null;
}
