/**
 * Guards against the pitch-elevator regression: a READY InteractionReport
 * whose type slug has no ReportChrome / rubric dimensions renders as
 * "Report not found" on `/practice/[type]/report/[reportId]`.
 *
 * Every ENGINE_TYPES slug must resolve both getReportChrome and
 * listRubricDimensionsForSlug. Difficult-conversation and networking are
 * included explicitly so a future map edit cannot drop them silently.
 *
 * Run: npx tsx scripts/verify-report-chrome-coverage.ts
 */

import { readFileSync } from "node:fs";

import { ENGINE_TYPES } from "../lib/engine/registry";
import { listRubricDimensionsForSlug } from "../lib/engine/resolve";
import { getReportChrome } from "../components/practice/ReportChrome";
import type { ReportDTO } from "../lib/report/dto";

let failed = 0;

function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "ok" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}

console.log("Report chrome coverage — every engine type must be viewable\n");

const requiredNamed = [
  "difficult-conversation",
  "networking",
  "pitch-elevator",
  "clinical-communication",
  "motivational-interviewing",
] as const;

for (const slug of requiredNamed) {
  const inRegistry = ENGINE_TYPES.some((t) => t.slug === slug);
  check(`ENGINE_TYPES includes "${slug}"`, inRegistry);
}

for (const type of ENGINE_TYPES) {
  const chrome = getReportChrome(type.slug);
  const dims = listRubricDimensionsForSlug(type.slug);
  check(`getReportChrome("${type.slug}")`, chrome !== null);
  check(
    `listRubricDimensionsForSlug("${type.slug}") (${dims?.length ?? 0} dims)`,
    Array.isArray(dims) && dims.length > 0,
  );
}

// Plural dashboard slug must NOT be required — reports use the engine slug.
check(
  'dashboard plural "difficult-conversations" is not an engine slug',
  !ENGINE_TYPES.some((t) => t.slug === "difficult-conversations"),
);

/**
 * MODE TABS JOIN THE ONE STRIP, AND NEVER OPEN EMPTY.
 *
 * Heavy mode analysis (a problem interview's question + process steps, a
 * questioned-persona report's behavior counts + checklist) used to stack in
 * the `extras.above` / `extras.below` slots. The two heaviest landed at
 * opposite ends of the page — the problem panels pushed the four score cards
 * below the full case prompt, while MITI's counts sat past the Moments
 * timeline — so the same class of content had no consistent home and the
 * report did not open on its scores.
 *
 * Those panels now contribute a tab into the report's existing strip. Two
 * properties have to hold, and neither is visible from reading one file:
 *
 * 1. Every declared tab carries an `available` predicate. A panel self-nulls
 *    when its snapshot is missing, which is why the old slots were safe to
 *    declare unconditionally; a TAB cannot — the strip would still show its
 *    title and open a blank panel. `INTERVIEW_CHROME` is shared by all
 *    interview presets, so without the predicate every general and technical
 *    report would carry an empty "The problem" tab.
 *
 * 2. Banners stay OUT of tabs. A practice-only disclaimer or an outcome
 *    banner behind a tab can be missed entirely, and the house rule is never
 *    to hide consent or required notices.
 */
{
  const chromes = ENGINE_TYPES.map((t) => ({ slug: t.slug, chrome: getReportChrome(t.slug) }));
  const withTabs = chromes.filter((c) => (c.chrome?.extraTabs?.length ?? 0) > 0);

  check(
    "at least one type contributes a mode tab (non-vacuous)",
    withTabs.length > 0,
  );

  const missingPredicate = withTabs.flatMap(({ slug, chrome }) =>
    (chrome!.extraTabs ?? [])
      .filter((tab) => typeof tab.available !== "function")
      .map((tab) => `${slug}:${tab.key}`),
  );
  check(
    `every mode tab declares an available() predicate${
      missingPredicate.length ? ` — missing: ${missingPredicate.join(", ")}` : ""
    }`,
    missingPredicate.length === 0,
  );

  // A tab must be absent, not empty, when the report lacks its data. A bare
  // DTO stands in for "no mode snapshot": every predicate must reject it.
  const emptyReport = {
    status: "READY",
    scores: {},
    input: null,
    outcome: null,
  } as unknown as ReportDTO;
  const survivesEmpty = withTabs.flatMap(({ slug, chrome }) =>
    (chrome!.extraTabs ?? [])
      .filter((tab) => {
        try {
          return tab.available(emptyReport) === true;
        } catch {
          // A predicate that throws on a bare report is also a defect: the
          // report page would crash rather than drop the tab.
          return true;
        }
      })
      .map((tab) => `${slug}:${tab.key}`),
  );
  check(
    `no mode tab claims to be available on a report with no mode data${
      survivesEmpty.length ? ` — leaked: ${survivesEmpty.join(", ")}` : ""
    }`,
    survivesEmpty.length === 0,
  );

  // Keys must be unique per type: HeroUI identifies a tab by key, and a
  // duplicate would make the strip's selection ambiguous.
  const dupes = withTabs.flatMap(({ slug, chrome }) => {
    const keys = (chrome!.extraTabs ?? []).map((tab) => tab.key);
    return keys.length === new Set(keys).size ? [] : [slug];
  });
  check(`mode tab keys are unique per type${dupes.length ? ` — ${dupes.join(", ")}` : ""}`, dupes.length === 0);

  // Banners belong in flow. Named here rather than inferred, because the
  // mistake is moving one INTO a tab for tidiness.
  //
  // Checked against each tab's own `render` output rather than the file text:
  // slicing the source from the first `extraTabs:` to the end swept up
  // banners declared in LATER chromes' `extras` slots, which is where they
  // correctly live — the check failed on all three while nothing was wrong.
  // Rendering is not possible here, so compare function source instead,
  // which is exact about what each tab actually draws.
  const bannersInTabs = withTabs.flatMap(({ slug, chrome }) =>
    (chrome!.extraTabs ?? []).flatMap((tab) => {
      const body = tab.render.toString();
      return ["PersonaDisclaimerBanner", "ConversationEndBanner", "PitchOutcomeBanner"]
        .filter((name) => body.includes(name))
        .map((name) => `${slug}:${tab.key}:${name}`);
    }),
  );
  check(
    `no banner is rendered inside a mode tab${bannersInTabs.length ? ` — ${bannersInTabs.join(", ")}` : ""}`,
    bannersInTabs.length === 0,
  );
}

// The mode tab's POSITION in the strip, read from ReportBody's source.
//
// This is the whole point of contributing a tab: "The Problem" is the case the
// student was graded on, so it must be read early, not parked behind Content
// where the strip's overflow can hide it on a narrow window. The ordering is
// one JSX line in a file nobody edits for this reason, so a later refactor
// that re-groups the tabs would silently push it back to last — which is where
// it started. Asserted on source text because the order is JSX child order,
// which cannot be read off the chrome objects.
{
  const body = readFileSync(
    new URL("../components/report/ReportBody.tsx", import.meta.url),
    "utf8",
  );
  // The strip only: the pre-structured path above it renders the same tabs in
  // flow and would otherwise match first.
  const strip = body.slice(body.indexOf("<Tabs "));
  const at = (needle: string) => strip.indexOf(needle);

  const overview = at('<Tab key="overview"');
  const mode = at("{extraTabs.map(");
  const shared = ['<Tab key="statistics"', '<Tab key="delivery"', '<Tab key="content"']
    .map((needle) => ({ needle, index: at(needle) }));

  check("ReportBody's strip renders Overview, then the mode tabs", overview >= 0 && mode > overview);
  check(
    "every shared tab is still in the strip",
    shared.every(({ index }) => index >= 0),
  );
  const after = shared.filter(({ index }) => index >= 0 && index < mode).map(({ needle }) => needle);
  check(
    `the mode tab is not last — it precedes Statistics, Delivery and Content${
      after.length ? ` — now behind: ${after.join(", ")}` : ""
    }`,
    after.length === 0,
  );

  // The Takeaways tab re-rendered `structured.strengths` and
  // `structured.growth_areas` as one-line columns — the same two arrays the
  // Overview tab already lists in full, whose rows are collapsed by default
  // and so already ARE that one-line scan. Two tabs, one set of items. Its
  // third column ("Answers to revisit") was the only part not duplicated and
  // moved to the Moments section, which is what its rows select.
  check(
    "no Takeaways tab — Overview owns the strengths and growth areas",
    !strip.includes('key="takeaways"'),
  );
  const moments = readFileSync(
    new URL("../components/report/MomentsTimeline.tsx", import.meta.url),
    "utf8",
  );
  check(
    "the revisit list lives with the Moments timeline it drives",
    moments.includes("Answers to revisit") && moments.includes("function RevisitList("),
  );
  check(
    "the revisit list is not also rendered in the tab strip",
    !body.includes("Answers to revisit"),
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${ENGINE_TYPES.length} engine types have report chrome + dimensions.`);
process.exit(0);
