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

import { ENGINE_TYPES } from "../lib/engine/registry";
import { listRubricDimensionsForSlug } from "../lib/engine/resolve";
import { getReportChrome } from "../components/practice/ReportChrome";

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

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${ENGINE_TYPES.length} engine types have report chrome + dimensions.`);
process.exit(0);
