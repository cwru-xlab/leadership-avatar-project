/**
 * The ONE list of interaction types a study plan may be synthesized from.
 *
 * ## Why this module exists
 *
 * This list used to be maintained as two independent hand-written copies —
 * a `readonly string[]` in `app/api/study-plans/generate/route.ts` (the SQL
 * `typeSlug: { in: ... }` filter) and a `Set` in `lib/report/filters.ts` (the
 * picker's eligibility test). The route did not import the Set, so the two
 * could drift silently: a type added to one and not the other produces a
 * report the picker offers and the generator then rejects, or vice versa.
 * `scripts/verify-study-plan-source-types.ts` now asserts both consumers read
 * THIS array and nothing else.
 *
 * ## Dependency-free, deliberately
 *
 * Nothing here imports `lib/engine/` — `scripts/verify-knowledge-check-surface.ts`
 * section 2c forbids any top-level file in `lib/study-plan/` from doing so,
 * and this module is browser-bundled through `lib/report/filters.ts` ->
 * `components/study-plan/StudyPlanGenerator.tsx`. The guard that this list
 * only ever names REAL `ENGINE_TYPES` slugs therefore lives in the verifier
 * script, which may import both. This is the same split
 * `lib/problem-interview/problem-slugs.ts` already uses for the same reason.
 *
 * ## Adding a type
 *
 * Membership is a PRODUCT decision, not a mechanical one: a type belongs here
 * once a study plan built from it produces steps a student can actually act
 * on. Two things are known to be incomplete for the types NOT listed below,
 * and both should be checked before adding one:
 *
 *   - `prefillFromSnapshot` (`lib/study-plan/prove-it.ts`) returns
 *     `{ kind: "none" }` for deck modes, `technical-coding` and both
 *     questioned-persona types, so their prove-it step opens an unseeded
 *     wizard (brief only). That degrades; it does not break.
 *   - `buildDrillSessionContexts` only reads `kind === "interview"` snapshots,
 *     so role/industry tailoring collapses to the generic scenario template
 *     for every other snapshot kind.
 */

/**
 * Study-plan-eligible `InteractionReport.typeSlug` values.
 *
 * Every entry must be a live `ENGINE_TYPES` slug; that is asserted by
 * `scripts/verify-study-plan-source-types.ts`, not by this module.
 */
export const STUDY_PLAN_SOURCE_TYPE_SLUGS = [
  "general",
  "technical",
  "consulting",
  "early-career",
  "product-management",
  "data-analytics",
  "finance",
  "system-design",
  // OPENED 2026-11-07. All three are interview-shaped one-on-one sessions
  // scored on the shared four plus their own dimensions, so the competency
  // roll-up and the coached/drill machinery already handle them. Known
  // degradations, both named above and neither a break:
  //   - prefillFromSnapshot returns { kind: "none" } for these, so the
  //     prove-it step opens the wizard with a brief but no pre-seeded setup;
  //   - buildDrillSessionContexts only tailors `kind === "interview"`
  //     snapshots, so drill briefs use the generic scenario template.
  // The persona types' `empathy` dimension was split into `empathy_clinical`
  // and `empathy_mi` in the same change, so a plan built from them no longer
  // pools three different empathy constructs into one mastery number.
  "technical-coding",
  "clinical-communication",
  "motivational-interviewing",
] as const;

export type StudyPlanSourceTypeSlug = (typeof STUDY_PLAN_SOURCE_TYPE_SLUGS)[number];

/**
 * Set form, for the `O(1)` membership tests the report picker runs per row.
 * Derived from the array above — never a second literal.
 */
export const STUDY_PLAN_SOURCE_TYPE_SLUG_SET: ReadonlySet<string> = new Set(
  STUDY_PLAN_SOURCE_TYPE_SLUGS,
);

/** Is a report of this type allowed to be a study-plan source? */
export function isStudyPlanSourceType(typeSlug: string): boolean {
  return STUDY_PLAN_SOURCE_TYPE_SLUG_SET.has(typeSlug);
}
