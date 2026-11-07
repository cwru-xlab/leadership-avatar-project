/**
 * Guards the ONE study-plan source-type list and the UNAIDED_SESSION
 * destination derivation.
 *
 * Two defects motivated this script, both found by auditing mastery /
 * study plans / paths against the live `ENGINE_TYPES` registry:
 *
 *   1. The eligibility allowlist existed as TWO hand-written copies
 *      (`app/api/study-plans/generate/route.ts` and `lib/report/filters.ts`)
 *      that the route did not share. Section 1 asserts both now read
 *      `lib/study-plan/plan-source-types.ts` and that no second literal list
 *      has reappeared.
 *   2. `practiceSlugForCompetency` scanned `ENGINE_TYPES` in ARRAY ORDER,
 *      so four of seven competencies resolved to a type the plan cannot be
 *      sourced from (pitch-talk / pitch-elevator / pitch-deck / networking).
 *      Section 3 asserts the plan's own source types win, and Section 4 is
 *      the inverted proof that the old registry-order behavior would FAIL
 *      this assertion — a guard never seen to fail is not a guard.
 *
 * Run: npx tsx scripts/verify-study-plan-source-types.ts
 * No database and no network required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ENGINE_TYPES, getEngineType } from "../lib/engine/registry";
import { SHARED_RUBRIC_DIMENSION_KEYS } from "../lib/engine/types";
import { COMPETENCIES, type CompetencyKey } from "../lib/mastery/competencies";
import {
  STUDY_PLAN_SOURCE_TYPE_SLUGS,
  STUDY_PLAN_SOURCE_TYPE_SLUG_SET,
  isStudyPlanSourceType,
} from "../lib/study-plan/plan-source-types";
import { INTERVIEW_TYPE_SLUGS } from "../lib/report/filters";

const ROOT = process.cwd();
let checks = 0;
let failures = 0;

function check(name: string, pass: boolean, detail?: unknown): void {
  checks += 1;
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

const GENERATE_ROUTE = "app/api/study-plans/generate/route.ts";
const FILTERS = "lib/report/filters.ts";
const PATH_ROUTE = "app/api/study-plans/[planId]/path/route.ts";
const SOURCE_TYPES = "lib/study-plan/plan-source-types.ts";

// ---------------------------------------------------------------------------
console.log("\n1. ONE list — both consumers import it, neither re-declares it");
// ---------------------------------------------------------------------------
{
  const generateSrc = read(GENERATE_ROUTE);
  const filtersSrc = read(FILTERS);

  check(
    `${GENERATE_ROUTE} imports the shared list`,
    /import\s*\{[^}]*STUDY_PLAN_SOURCE_TYPE_SLUGS[^}]*\}\s*from\s*["']@\/lib\/study-plan\/plan-source-types["']/.test(
      generateSrc,
    ),
  );
  check(
    `${FILTERS} imports the shared list`,
    /import\s*\{[^}]*STUDY_PLAN_SOURCE_TYPE_SLUG_SET[^}]*\}\s*from\s*["']@\/lib\/study-plan\/plan-source-types["']/.test(
      filtersSrc,
    ),
  );

  // The defect was a second LITERAL list. A literal is what to look for:
  // both files legitimately mention the identifier.
  const literalListPattern = /(?:new Set\(\s*\[|=\s*\[)\s*\n?\s*["']general["']/;
  check(
    `${GENERATE_ROUTE} declares no literal slug list of its own`,
    !literalListPattern.test(generateSrc),
  );
  check(
    `${FILTERS} declares no literal slug list of its own`,
    !literalListPattern.test(filtersSrc),
  );

  // Inverted: prove that pattern actually fires on the shape it is meant to
  // catch, so the two passes above are not vacuous.
  check(
    "bite-proof: the literal-list pattern DOES match a re-declared copy",
    literalListPattern.test('export const X = new Set([\n  "general",\n  "technical",\n]);'),
  );

  // The two exported shapes must agree, member for member.
  check(
    "lib/report/filters.ts's INTERVIEW_TYPE_SLUGS IS the shared set (same object)",
    INTERVIEW_TYPE_SLUGS === STUDY_PLAN_SOURCE_TYPE_SLUG_SET,
  );
  check(
    "the array and the set have identical membership",
    STUDY_PLAN_SOURCE_TYPE_SLUGS.length === STUDY_PLAN_SOURCE_TYPE_SLUG_SET.size &&
      STUDY_PLAN_SOURCE_TYPE_SLUGS.every((s) => STUDY_PLAN_SOURCE_TYPE_SLUG_SET.has(s)),
  );
  check(
    "no duplicate entries in the array",
    new Set(STUDY_PLAN_SOURCE_TYPE_SLUGS).size === STUDY_PLAN_SOURCE_TYPE_SLUGS.length,
  );
  check("isStudyPlanSourceType agrees with the set", STUDY_PLAN_SOURCE_TYPE_SLUGS.every(isStudyPlanSourceType));
  check("isStudyPlanSourceType rejects a non-member", !isStudyPlanSourceType("pitch-deck"));
}

// ---------------------------------------------------------------------------
console.log("\n2. Every listed slug is a REAL ENGINE_TYPES slug");
// ---------------------------------------------------------------------------
{
  // This is the assertion `lib/study-plan/plan-source-types.ts` cannot make
  // itself: it must not import lib/engine (verify-knowledge-check-surface.ts
  // section 2c), and it is browser-bundled. A script may import both.
  const registrySlugs = new Set(ENGINE_TYPES.map((t) => t.slug));
  const phantom = STUDY_PLAN_SOURCE_TYPE_SLUGS.filter((s) => !registrySlugs.has(s));
  check("no study-plan source slug is missing from ENGINE_TYPES", phantom.length === 0, phantom);

  check(
    "the shared module does NOT import lib/engine (it is browser-bundled)",
    !/from\s+["'](?:\.\.\/engine|@\/lib\/engine)/.test(read(SOURCE_TYPES)),
  );

  // Inverted: a phantom slug must be detectable, or section 2 proves nothing.
  check(
    "bite-proof: a phantom slug WOULD be reported",
    ["general", "not-a-real-engine-type"].filter((s) => !registrySlugs.has(s)).length === 1,
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. UNAIDED_SESSION destinations resolve to the plan's own source types");
// ---------------------------------------------------------------------------

/**
 * Mirrors `practiceSlugForCompetency` in the path route. Kept in step with it
 * by section 5's text assertions rather than by import, because the route is
 * a Next.js module whose import pulls in `next/server` and prisma.
 */
function resolve(competencyKey: CompetencyKey, sourceTypeSlugs: readonly string[] = []): string | null {
  const competency = COMPETENCIES.find((c) => c.key === competencyKey);
  if (!competency) return null;
  const sharedKeys: readonly string[] = SHARED_RUBRIC_DIMENSION_KEYS;
  const nonSharedKeys = competency.dimensionKeys.filter((k) => !sharedKeys.includes(k));
  if (nonSharedKeys.length === 0) return sourceTypeSlugs[0] ?? null;
  for (const dimensionKey of nonSharedKeys) {
    for (const slug of sourceTypeSlugs) {
      const type = getEngineType(slug);
      if (type?.extraRubricDimensions.some((dim) => dim.key === dimensionKey)) return slug;
    }
  }
  if (sourceTypeSlugs.length > 0) return sourceTypeSlugs[0];
  for (const type of ENGINE_TYPES) {
    if (type.extraRubricDimensions.some((dim) => nonSharedKeys.includes(dim.key))) return type.slug;
  }
  return null;
}

/** The old, registry-order-only behavior. Section 4 proves it would fail. */
function resolveRegistryOrderOnly(competencyKey: CompetencyKey): string | null {
  const competency = COMPETENCIES.find((c) => c.key === competencyKey);
  if (!competency) return null;
  const sharedKeys: readonly string[] = SHARED_RUBRIC_DIMENSION_KEYS;
  const nonSharedKeys = competency.dimensionKeys.filter((k) => !sharedKeys.includes(k));
  if (nonSharedKeys.length === 0) return null;
  for (const type of ENGINE_TYPES) {
    if (type.extraRubricDimensions.some((dim) => nonSharedKeys.includes(dim.key))) return type.slug;
  }
  return null;
}

{
  // A realistic finance-only plan, and a realistic generic-interview plan.
  const financePlan = ["finance"];
  const generalPlan = ["general"];

  for (const competency of COMPETENCIES) {
    const slug = resolve(competency.key, financePlan);
    check(
      `finance-only plan: ${competency.key} -> a study-plan-sourceable type (got ${slug})`,
      slug !== null && isStudyPlanSourceType(slug),
      slug,
    );
  }

  // The headline: NO competency may route an interview plan to a type the
  // plan could not have been built from.
  const leaks = COMPETENCIES.map((c) => ({ key: c.key, slug: resolve(c.key, generalPlan) })).filter(
    (r) => r.slug !== null && !isStudyPlanSourceType(r.slug),
  );
  check("general-only plan: no competency routes outside the eligible set", leaks.length === 0, leaks);

  // Never null for a plan that has any source type — a null practiceSlug
  // renders NO action link in PathPanel.hrefForStep, i.e. a dead step.
  const nulls = COMPETENCIES.filter((c) => resolve(c.key, generalPlan) === null).map((c) => c.key);
  check("general-only plan: every competency resolves to some slug (no dead step)", nulls.length === 0, nulls);

  // Prefers the type that actually scores the competency, not merely the
  // first source type: credibility_of_the_case is scored by finance's
  // technical_accuracy, so a mixed plan must pick finance over general.
  check(
    "mixed plan prefers the source type that SCORES the competency",
    resolve("credibility_of_the_case", ["general", "finance"]) === "finance",
    resolve("credibility_of_the_case", ["general", "finance"]),
  );

  // Determinism for a fixed (sorted, de-duped) input.
  check(
    "resolution is deterministic across repeated calls",
    resolve("structure_and_clarity", ["consulting", "finance"]) ===
      resolve("structure_and_clarity", ["consulting", "finance"]),
  );

  // The legacy path: no source types at all still resolves, via the registry.
  check(
    "no source types falls back to registry order (legacy plans keep working)",
    resolve("concision_and_focus", []) === resolveRegistryOrderOnly("concision_and_focus"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. INVERTED — the old registry-order behavior WOULD fail section 3");
// ---------------------------------------------------------------------------
{
  // This is the defect, restated as a passing assertion: the pre-fix function
  // sent an interview-only plan to types it cannot be sourced from. If this
  // ever stops being true, section 3's guard has lost its teeth.
  const offenders = COMPETENCIES.map((c) => ({
    key: c.key,
    slug: resolveRegistryOrderOnly(c.key),
  })).filter((r) => r.slug !== null && !isStudyPlanSourceType(r.slug));

  check(
    "registry-order-only resolution DOES leak outside the eligible set (>=1 competency)",
    offenders.length > 0,
    offenders,
  );
  console.log(
    `       the defect, for the record: ${offenders
      .map((o) => `${o.key} -> ${o.slug}`)
      .join("; ")}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. The path route's resolver takes source types and prefers them");
// ---------------------------------------------------------------------------
{
  const src = read(PATH_ROUTE);

  check(
    "practiceSlugForCompetency accepts a sourceTypeSlugs parameter",
    /function practiceSlugForCompetency\(\s*competencyKey: CompetencyKey,\s*sourceTypeSlugs: readonly string\[\]/.test(
      src,
    ),
  );
  check(
    "its only call site passes sourceTypeSlugs",
    (src.match(/practiceSlugForCompetency\(competencyKey, sourceTypeSlugs\)/g) ?? []).length === 1,
  );
  check(
    "no call site invokes it with the competency alone",
    !/practiceSlugForCompetency\(\s*competencyKey\s*\)/.test(src),
  );
  check(
    "buildPathDTO derives sourceTypeSlugs from the plan's sourceReportIds",
    /sourceTypeSlugs\s*=\s*await/.test(src) && /sourceReportIds: true/.test(src),
  );
  check(
    "the derived list is de-duplicated and sorted (stable destination)",
    /\[\.\.\.new Set\(rows\.map\(\(r\) => r\.typeSlug\)\)\]\.sort\(\)/.test(src),
  );
}

console.log(`\n${checks} checks run, ${failures} failed.`);
if (failures > 0) {
  console.log("\nFAILURES PRESENT");
  process.exit(1);
}
console.log("\nALL PASS");
