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
import { INTERVIEW_TYPE_SLUGS, matchesTypeFilter, TYPE_FILTERS } from "../lib/report/filters";
import { STUDY_PLAN_SYSTEM_PROMPT, buildSystemPrompt } from "../lib/study-plan/generate";

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

  // The defect was a second copy of the ELIGIBILITY list. Look for a literal
  // list bound to an eligibility-sounding name, not for any literal list at
  // all: lib/report/filters.ts legitimately declares INTERVIEW_TAB_SLUGS,
  // which answers the different "which tab?" question (section 6).
  const literalListPattern =
    /(?:INTERVIEW_TYPE_SLUGS|STUDY_PLAN_SOURCE_TYPE_SLUGS?)[^=\n]*=\s*(?:new Set\(\s*)?\[/;
  check(
    `${GENERATE_ROUTE} declares no literal eligibility list of its own`,
    !literalListPattern.test(generateSrc),
  );
  check(
    `${FILTERS} declares no literal eligibility list of its own`,
    !literalListPattern.test(filtersSrc),
  );

  // Inverted: prove that pattern actually fires on the shape it is meant to
  // catch, so the two passes above are not vacuous.
  check(
    "bite-proof: the literal-list pattern DOES match a re-declared copy",
    literalListPattern.test('export const INTERVIEW_TYPE_SLUGS = new Set([\n  "general",\n]);') &&
      literalListPattern.test('const STUDY_PLAN_SOURCE_TYPE_SLUGS = [\n  "general",\n];'),
  );
  check(
    "bite-proof: the pattern does NOT fire on the legitimate tab list",
    !literalListPattern.test('const INTERVIEW_TAB_SLUGS: ReadonlySet<string> = new Set([\n  "general",\n]);'),
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

// ---------------------------------------------------------------------------
console.log("\n6. Tab membership and plan eligibility are SEPARATE questions");
// ---------------------------------------------------------------------------
{
  // These were briefly the same set plus a special case. Once the persona
  // types became plan sources, reusing the eligibility set for the Interviews
  // TAB would have shown them under Interviews AND under their own tab.
  for (const slug of ["clinical-communication", "motivational-interviewing"]) {
    check(`${slug} is a study-plan source`, isStudyPlanSourceType(slug));
    check(
      `${slug} does NOT answer to the Interviews tab (it has its own)`,
      !matchesTypeFilter(slug, "interview"),
    );
    const ownTab = TYPE_FILTERS.some((f) => f.id === slug);
    check(`${slug} has its own tab`, ownTab);
    if (ownTab) {
      check(
        `${slug} matches its own tab`,
        matchesTypeFilter(slug, slug as Parameters<typeof matchesTypeFilter>[1]),
      );
    }
  }

  // technical-coding files under Interviews AND is now a plan source.
  check("technical-coding is a study-plan source", isStudyPlanSourceType("technical-coding"));
  check("technical-coding files under the Interviews tab", matchesTypeFilter("technical-coding", "interview"));

  // No row may answer to two tabs — that was the hazard being guarded.
  const realTabs = TYPE_FILTERS.filter((f) => f.id !== "all").map((f) => f.id);
  const doubleCounted = ENGINE_TYPES.map((t) => t.slug)
    .map((slug) => ({ slug, tabs: realTabs.filter((f) => matchesTypeFilter(slug, f)) }))
    .filter((r) => r.tabs.length > 1);
  check("no engine type answers to more than one tab", doubleCounted.length === 0, doubleCounted);

  // Inverted: the old rule WOULD have double-counted, proving the check bites.
  const oldInterviewRule = (slug: string) => isStudyPlanSourceType(slug) || slug === "technical-coding";
  const wouldDouble = ["clinical-communication", "motivational-interviewing"].filter(
    (slug) => oldInterviewRule(slug) && realTabs.some((f) => f !== "interview" && matchesTypeFilter(slug, f)),
  );
  check(
    "bite-proof: the OLD interview rule would have double-counted the persona types",
    wouldDouble.length === 2,
    wouldDouble,
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. The plan prompt is not hard-framed as interview prep");
// ---------------------------------------------------------------------------
{
  check(
    "base prompt does not claim to create interview-practice plans",
    !STUDY_PLAN_SYSTEM_PROMPT.includes("interview-practice study plans"),
  );
  // "interview" must survive in the title FILLER ban, which is the opposite
  // of framing the plan as interview-only. Guard the distinction explicitly.
  check(
    'the title filler ban still names "interview skills"',
    STUDY_PLAN_SYSTEM_PROMPT.includes('"interview skills"'),
  );

  check("no source labels appends nothing", buildSystemPrompt([]) === STUDY_PLAN_SYSTEM_PROMPT);
  check("blank/whitespace labels append nothing", buildSystemPrompt(["", "  "]) === STUDY_PLAN_SYSTEM_PROMPT);

  const one = buildSystemPrompt(["Finance interview"]);
  check("one label is named", one.includes("your Finance interview practice".replace("your ", "")));
  check("one label adds no stray conjunction", !one.includes("and Finance interview"));

  const two = buildSystemPrompt(["Clinical communication", "Finance interview"]);
  check(
    "two labels are joined with 'and'",
    two.includes("Clinical communication and Finance interview"),
  );

  const three = buildSystemPrompt(["A", "B", "C"]);
  check("three labels use commas then 'and'", three.includes("A, B and C"));

  check(
    "duplicate labels are collapsed",
    buildSystemPrompt(["Finance interview", "Finance interview"]) === buildSystemPrompt(["Finance interview"]),
  );

  // The voice contract must survive the reframe — these are the exact strings
  // verify-study-plan-first-person.ts and verify-study-plan-prompt.ts pin.
  for (const required of [
    "Address the learner as “you.”",
    "“I would recommend focusing on…”",
    "You might try...",
    "self-paced",
  ]) {
    check(`reframed prompt keeps the voice contract: ${required}`, STUDY_PLAN_SYSTEM_PROMPT.includes(required));
  }
}

// ---------------------------------------------------------------------------
console.log("\n8. Competency reachability — recorded, not aspirational");
// ---------------------------------------------------------------------------
{
  /**
   * Which competencies a study plan can target FROM ITS OWN EVIDENCE, given
   * the current allowlist. This is the measurement behind the Phase-audit
   * finding, kept executable so it cannot rot into a stale comment.
   *
   * Three competencies are deliberately NOT reachable: every dimension that
   * evidences them is owned exclusively by the pitch, networking or
   * difficult-conversation families —
   *   concision_and_focus              <- concision (pitch-elevator),
   *                                       deck_text_density (deck modes)
   *   holding_position_under_pressure  <- holding_the_line (difficult-conv.),
   *                                       objection_handling, negotiation
   *   outcome_achievement              <- objective_achieved (difficult-conv.),
   *                                       goal-progress (networking)
   * Opening the allowlist to interview-shaped types could not change that, and
   * opening it to those families is a separate product decision (it would mean
   * telling an interview student to go do a pitch). They remain targetable
   * from GLOBAL mastery, which is ungated — this is only about a plan's own
   * source evidence.
   */
  const UNREACHABLE = [
    "concision_and_focus",
    "holding_position_under_pressure",
    "outcome_achievement",
  ] as const;

  const sharedKeys: readonly string[] = SHARED_RUBRIC_DIMENSION_KEYS;
  const reachable = (competencyKey: CompetencyKey) => {
    const competency = COMPETENCIES.find((c) => c.key === competencyKey)!;
    return STUDY_PLAN_SOURCE_TYPE_SLUGS.some((slug) => {
      const type = getEngineType(slug);
      if (!type) return false;
      const keys = [...sharedKeys, ...type.extraRubricDimensions.map((d) => d.key)];
      return competency.dimensionKeys.some((k) => keys.includes(k));
    });
  };

  for (const competency of COMPETENCIES) {
    const expected = !UNREACHABLE.includes(competency.key as (typeof UNREACHABLE)[number]);
    check(
      `${competency.key}: reachable from an eligible source = ${expected}`,
      reachable(competency.key) === expected,
    );
  }

  // Every dimension of an unreachable competency must be owned ONLY by
  // non-eligible types. If that stops being true the list above is stale.
  for (const key of UNREACHABLE) {
    const competency = COMPETENCIES.find((c) => c.key === key)!;
    const eligibleOwners = competency.dimensionKeys.flatMap((dim) =>
      ENGINE_TYPES.filter(
        (t) => t.extraRubricDimensions.some((d) => d.key === dim) && isStudyPlanSourceType(t.slug),
      ).map((t) => t.slug),
    );
    check(`${key}: no eligible type owns any of its dimensions`, eligibleOwners.length === 0, eligibleOwners);
  }
}

console.log(`\n${checks} checks run, ${failures} failed.`);
if (failures > 0) {
  console.log("\nFAILURES PRESENT");
  process.exit(1);
}
console.log("\nALL PASS");
