/**
 * Proves the mastery weight table's ORDERING constraints are mechanically
 * enforced — not merely documented — and that the totality guard itself
 * would catch a reversed table (the inverted assertion). Also pins
 * `normalizeRubricScore`'s endpoints and single-source discipline, and
 * round-trips `validateContributionInputs` with no database involved.
 *
 * Run: npx tsx scripts/verify-mastery-weights.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  CONTRIBUTION_SOURCES,
  CONTRIBUTION_WEIGHTS,
  WEIGHT_ORDERING_CONSTRAINTS,
  WEIGHT_CLASS_BINDINGS,
  weightForSource,
  normalizeRubricScore,
  type ContributionSource,
} from "../lib/mastery/weights";
import { validateContributionInputs } from "../lib/mastery/ledger";

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
 * Shared ordering-violation logic, factored so both the REAL weight table
 * and a synthetic reversed table run through identical code (section 5's
 * negative case depends on this not being duplicated).
 */
function violations(
  weights: Record<ContributionSource, number>
): Array<{ greater: ContributionSource; lesser: ContributionSource }> {
  return WEIGHT_ORDERING_CONSTRAINTS.filter(
    (c) => !(weights[c.greater] > weights[c.lesser])
  ).map((c) => ({ greater: c.greater, lesser: c.lesser }));
}

console.log("1. Every locked ordering holds, strictly greater");
{
  const bad = violations(CONTRIBUTION_WEIGHTS);
  check(
    `all ${WEIGHT_ORDERING_CONSTRAINTS.length} ordering constraints hold strictly`,
    bad.length === 0,
    `violations: ${JSON.stringify(bad)}`
  );
}

console.log("\n2. Sources and weights are the same set, both directions");
{
  const sourcesWithWeight = CONTRIBUTION_SOURCES.every(
    (s) => s in CONTRIBUTION_WEIGHTS
  );
  check(
    "every member of CONTRIBUTION_SOURCES has a declared weight",
    sourcesWithWeight
  );

  const weightKeys = Object.keys(CONTRIBUTION_WEIGHTS);
  const weightsAreSources = weightKeys.every((k) =>
    (CONTRIBUTION_SOURCES as readonly string[]).includes(k)
  );
  check(
    "every key of CONTRIBUTION_WEIGHTS is a member of CONTRIBUTION_SOURCES (no dead config)",
    weightsAreSources,
    `weight keys: ${JSON.stringify(weightKeys)}`
  );
}

console.log("\n3. Every weight is in (0, 1]");
{
  const allInRange = Object.values(CONTRIBUTION_WEIGHTS).every(
    (w) => w > 0 && w <= 1
  );
  check(
    "no weight is zero or above 1",
    allInRange,
    `weights: ${JSON.stringify(CONTRIBUTION_WEIGHTS)}`
  );
}

console.log("\n4. LIVE_SESSION is the maximum weight");
{
  const maxWeight = Math.max(...Object.values(CONTRIBUTION_WEIGHTS));
  check(
    "CONTRIBUTION_WEIGHTS.LIVE_SESSION equals the maximum of all weights",
    CONTRIBUTION_WEIGHTS.LIVE_SESSION === maxWeight,
    `LIVE_SESSION=${CONTRIBUTION_WEIGHTS.LIVE_SESSION}, max=${maxWeight}`
  );
}

console.log(
  "\n5. INVERTED ASSERTION: the ordering guard is proven to bite on a reversed table"
);
{
  const sane = violations(CONTRIBUTION_WEIGHTS);
  check(
    "violations(real weights) reports zero (sanity re-check via the shared helper)",
    sane.length === 0
  );

  const reversed: Record<ContributionSource, number> = {
    ...CONTRIBUTION_WEIGHTS,
    CHECK_MODEL_GRADED: 0.9,
    CHECK_DETERMINISTIC: 0.2,
  };
  const reversedViolations = violations(reversed);
  const expected = reversedViolations.some(
    (v) => v.greater === "CHECK_DETERMINISTIC" && v.lesser === "CHECK_MODEL_GRADED"
  );
  check(
    "violations(reversed table) is non-empty and reports the expected CHECK_DETERMINISTIC/CHECK_MODEL_GRADED violation",
    reversedViolations.length > 0 && expected,
    `actual violations: ${JSON.stringify(reversedViolations)}`
  );
  console.log(
    "         (expected failure correctly detected: the ordering guard is NOT vacuously true)"
  );
}

console.log("\n6. validateContributionInputs round-trips with no database");
{
  let threwForScore = false;
  let scoreMessageNamesIndex = false;
  try {
    validateContributionInputs([
      {
        userId: "u1",
        competencyKey: "delivery_presence" as any,
        source: "LIVE_SESSION",
        rawScore: 1.4,
        occurredAt: new Date(),
      },
    ]);
  } catch (e) {
    threwForScore = true;
    scoreMessageNamesIndex = String((e as Error).message).includes("[0]");
  }
  check(
    "a rawScore of 1.4 (out of [0,1]) throws",
    threwForScore && scoreMessageNamesIndex,
    `message naming index expected, threw=${threwForScore}`
  );

  let threwForCompetency = false;
  let competencyMessageNamesIndex = false;
  try {
    validateContributionInputs([
      {
        userId: "u1",
        competencyKey: "not_a_real_competency" as any,
        source: "LIVE_SESSION",
        rawScore: 0.5,
        occurredAt: new Date(),
      },
    ]);
  } catch (e) {
    threwForCompetency = true;
    competencyMessageNamesIndex = String((e as Error).message).includes("[0]");
  }
  check(
    "an unknown competencyKey throws",
    threwForCompetency && competencyMessageNamesIndex,
    `message naming index expected, threw=${threwForCompetency}`
  );
}

console.log("\n7. normalizeRubricScore endpoints, and single-source discipline");
{
  check("normalizeRubricScore(1) === 0", normalizeRubricScore(1) === 0);
  check("normalizeRubricScore(5) === 1", normalizeRubricScore(5) === 1);
  check("normalizeRubricScore(3) === 0.5", normalizeRubricScore(3) === 0.5);

  for (const bad of [0, 6, NaN, Infinity]) {
    let threw = false;
    try {
      normalizeRubricScore(bad);
    } catch {
      threw = true;
    }
    check(`normalizeRubricScore(${bad}) throws`, threw);
  }

  // Scan lib/ as text for anyone restating the formula outside weights.ts.
  const libRoot = path.join(__dirname, "..", "lib");
  const offenders: string[] = [];
  const weightsFile = path.resolve(__dirname, "../lib/mastery/weights.ts");
  const pattern = /\(\s*score\s*-\s*1\s*\)\s*\/\s*4/;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        if (path.resolve(full) === weightsFile) continue;
        const text = fs.readFileSync(full, "utf8");
        if (pattern.test(text)) {
          offenders.push(full);
        }
      }
    }
  }
  walk(libRoot);

  check(
    "no file other than lib/mastery/weights.ts restates `(score - 1) / 4`",
    offenders.length === 0,
    offenders.length > 0 ? `offenders: ${offenders.join(", ")}` : undefined
  );
}

console.log("\n8. Provisional-number discipline recorded");
{
  const weightsSource = fs.readFileSync(
    path.resolve(__dirname, "../lib/mastery/weights.ts"),
    "utf8"
  );
  check(
    'weights.ts contains "PROVISIONAL UNTIL CALIBRATED"',
    weightsSource.includes("PROVISIONAL UNTIL CALIBRATED")
  );
}

console.log("\n9. Weight-class bindings hold (===), with a bite-proof");
{
  const bindingViolations = (weights: Record<ContributionSource, number>) =>
    WEIGHT_CLASS_BINDINGS.filter(
      (b) => weights[b.source] !== weights[b.sameClassAs]
    ).map((b) => ({ source: b.source, sameClassAs: b.sameClassAs }));

  check(
    `all ${WEIGHT_CLASS_BINDINGS.length} bindings hold with === on the real table`,
    bindingViolations(CONTRIBUTION_WEIGHTS).length === 0,
    JSON.stringify(bindingViolations(CONTRIBUTION_WEIGHTS))
  );
  check(
    "COACHED_SESSION is bound to CHECK_MODEL_GRADED",
    WEIGHT_CLASS_BINDINGS.some(
      (b) => b.source === "COACHED_SESSION" && b.sameClassAs === "CHECK_MODEL_GRADED"
    ) && CONTRIBUTION_WEIGHTS.COACHED_SESSION === CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED
  );

  const deterministicNumber: Record<ContributionSource, number> = {
    ...CONTRIBUTION_WEIGHTS,
    COACHED_SESSION: 0.45,
  };
  check(
    "bite-proof: COACHED_SESSION=0.45 violates the binding",
    bindingViolations(deterministicNumber).length > 0
  );
  check(
    "bite-proof: COACHED_SESSION=0.45 violates the CHECK_DETERMINISTIC > COACHED_SESSION ordering",
    violations(deterministicNumber).some(
      (v) => v.greater === "CHECK_DETERMINISTIC" && v.lesser === "COACHED_SESSION"
    )
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
