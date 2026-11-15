import { resolveTechnicalAssignment } from "./assignments.server";
import { ALGORITHM_MATERIAL } from "./post-session/algorithms.server";
import { ARRAY_MATERIAL } from "./post-session/arrays.server";
import { STRING_MATERIAL } from "./post-session/strings.server";

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
 * Every authored entry, keyed by assignment id. The content files are split
 * by topic only to keep them readable; an id must appear in exactly one, which
 * `scripts/verify-technical-post-session.ts` enforces along with running both
 * model solutions against every public and hidden test.
 */
const MATERIAL: Readonly<Record<string, PostSessionMaterial>> = {
  ...ARRAY_MATERIAL,
  ...STRING_MATERIAL,
  ...ALGORITHM_MATERIAL,
};

/** Assignment ids that have authored material (for the verify script). */
export function listPostSessionMaterialIds(): string[] {
  return Object.keys(MATERIAL);
}

/**
 * Returns the post-session material for an assignment, or null when none is
 * authored.
 *
 * Keyed by id alone on purpose: every revision a report can reference (the
 * current v2 tuple and each historical v1 tuple accepted by
 * `resolveTechnicalAssignment`) shares the same id, starter signature and
 * catalog tests, so one entry serves them all. The only historical wording
 * change is word-break-reachable's v1 "one or more words", which differs from
 * the current text only for an empty input. Returns a fresh copy so a caller
 * cannot mutate the shared catalog.
 */
export function getPostSessionMaterial(assignmentId: string): PostSessionMaterial | null {
  const material = Object.prototype.hasOwnProperty.call(MATERIAL, assignmentId)
    ? MATERIAL[assignmentId]
    : undefined;
  if (!material) return null;
  return {
    approach: material.approach,
    complexity: material.complexity,
    pitfalls: [...material.pitfalls],
    modelSolutions: { ...material.modelSolutions },
  };
}

/**
 * Convenience for report code holding a persisted snapshot identity: returns
 * material only when the full (id, version, hash) tuple still resolves to a
 * known revision, so a forged or unknown identity gets nothing.
 */
export function getPostSessionMaterialForRevision(
  assignmentId: string,
  assignmentVersion: string,
  assignmentHash: string,
): PostSessionMaterial | null {
  const resolved = resolveTechnicalAssignment(assignmentId, assignmentVersion, assignmentHash);
  return resolved ? getPostSessionMaterial(resolved.assignment.id) : null;
}
