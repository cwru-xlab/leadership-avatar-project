/**
 * Proves the competency catalog's TOTALITY over the real `ENGINE_TYPES`
 * registry: every rubric dimension the engine can score today maps to
 * exactly one competency, every claimed dimension still exists, no
 * competency is evidence-free, display order is well-formed, the grouping
 * genuinely spans more than one interaction type for several competencies,
 * and — critically — the totality guard itself is proven to bite via a
 * deliberately-unmapped synthetic dimension, so this verifier cannot pass
 * vacuously.
 *
 * Run: npx tsx scripts/verify-competency-catalog.ts
 */
import { ENGINE_TYPES } from "../lib/engine/registry";
import { SHARED_RUBRIC_DIMENSION_KEYS } from "../lib/engine/types";
import {
  COMPETENCIES,
  DIMENSION_TO_COMPETENCY,
  allRubricDimensionKeys,
  competencyForDimension,
} from "../lib/mastery/competencies";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

/**
 * Shared totality logic, factored so both the REAL dimension list and a
 * synthetic phantom-dimension list run through the identical code path
 * (section 7's negative case depends on this not being duplicated).
 */
function findUnmapped(keys: string[]): string[] {
  return keys.filter((key) => competencyForDimension(key) === null);
}

const realKeys = allRubricDimensionKeys();

console.log("\n1. Totality: every real rubric dimension maps to a competency");
{
  const unmapped = findUnmapped(realKeys);
  check(
    `all ${realKeys.length} derived dimension keys resolve to a competency`,
    unmapped.length === 0,
    unmapped.length > 0 ? `unmapped keys: ${unmapped.join(", ")}` : undefined,
  );
}

console.log(
  "\n2. No orphans: every dimension a competency claims still exists in the live registry",
);
{
  const realKeySet = new Set(realKeys);
  const orphans: string[] = [];

  for (const competency of COMPETENCIES) {
    for (const dimensionKey of competency.dimensionKeys) {
      if (!realKeySet.has(dimensionKey)) {
        orphans.push(`${competency.key} -> ${dimensionKey}`);
      }
    }
  }

  check(
    "no competency claims a dimension absent from the live registry",
    orphans.length === 0,
    orphans.length > 0 ? `stale claims: ${orphans.join(", ")}` : undefined,
  );
}

console.log("\n3. No double-claim: DIMENSION_TO_COMPETENCY.size equals total claimed keys");
{
  const totalClaimed = COMPETENCIES.reduce(
    (sum, c) => sum + c.dimensionKeys.length,
    0,
  );
  check(
    `DIMENSION_TO_COMPETENCY.size (${DIMENSION_TO_COMPETENCY.size}) equals total dimensionKeys (${totalClaimed})`,
    DIMENSION_TO_COMPETENCY.size === totalClaimed,
    `if a key were claimed twice the map would be smaller than the sum`,
  );
}

console.log("\n4. Every competency has at least one dimension");
for (const competency of COMPETENCIES) {
  check(
    `"${competency.key}" has >=1 dimensionKeys`,
    competency.dimensionKeys.length > 0,
  );
}

console.log("\n5. order values are unique and contiguous from 1");
{
  const orders = COMPETENCIES.map((c) => c.order).sort((a, b) => a - b);
  const expected = COMPETENCIES.map((_, i) => i + 1);
  check(
    `order values are exactly [${expected.join(",")}]`,
    JSON.stringify(orders) === JSON.stringify(expected),
    `actual sorted orders: ${JSON.stringify(orders)}`,
  );
}

console.log(
  "\n6. Cross-type spot-check: at least three competencies draw from more than one interaction type",
);
{
  // Which engine types declare a given dimension key. A shared dimension
  // (visual/vocal/content/behavioral) is declared by EVERY built-in type by
  // construction (REQ-72); an extra is declared only by the type(s) whose
  // `extraRubricDimensions` lists it.
  const dimensionToTypes = new Map<string, Set<string>>();
  const allSlugs = ENGINE_TYPES.map((t) => t.slug);

  for (const sharedKey of SHARED_RUBRIC_DIMENSION_KEYS) {
    dimensionToTypes.set(sharedKey, new Set(allSlugs));
  }
  for (const type of ENGINE_TYPES) {
    for (const dim of type.extraRubricDimensions) {
      if (!dimensionToTypes.has(dim.key)) {
        dimensionToTypes.set(dim.key, new Set());
      }
      dimensionToTypes.get(dim.key)!.add(type.slug);
    }
  }

  const crossTypeCompetencies = COMPETENCIES.filter((competency) => {
    const types = new Set<string>();
    for (const key of competency.dimensionKeys) {
      for (const slug of dimensionToTypes.get(key) ?? []) {
        types.add(slug);
      }
    }
    return types.size > 1;
  });

  check(
    `at least 3 competencies span more than one interaction type (found ${crossTypeCompetencies.length}: ${crossTypeCompetencies.map((c) => c.key).join(", ")})`,
    crossTypeCompetencies.length >= 3,
  );
}

console.log(
  "\n7. NEGATIVE CASE: the totality guard is proven to bite on a synthetic phantom dimension",
);
{
  const syntheticKeys = [...realKeys, "__phantom_dimension__"];
  const unmappedSynthetic = findUnmapped(syntheticKeys);

  check(
    "findUnmapped(real keys) reports zero unmapped (sanity re-check via the shared helper)",
    findUnmapped(realKeys).length === 0,
  );
  check(
    "findUnmapped([...real, '__phantom_dimension__']) correctly detects exactly the phantom key as unmapped",
    unmappedSynthetic.length === 1 && unmappedSynthetic[0] === "__phantom_dimension__",
    `actual unmapped: ${JSON.stringify(unmappedSynthetic)}`,
  );
  console.log(
    "         (expected failure correctly detected: the totality check over a real+phantom key list is NOT vacuously true)",
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
