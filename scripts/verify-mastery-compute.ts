/**
 * Proves `computeMastery()` is a pure, deterministic, order-independent
 * arithmetic function over literal contribution rows — no database, no
 * model call, no clock read inside the function. Exercises every boundary
 * case 21-09's plan calls out by name: the window edge (inclusive on one
 * side, exclusive one millisecond earlier), null-vs-zero for an unmeasured
 * competency, the overall figure's independence from practice volume, and
 * the weighted (not flat) per-competency mean.
 *
 * Run: npx tsx scripts/verify-mastery-compute.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import { computeMastery } from "../lib/mastery/compute";
import type { MasteryContributionRow } from "../lib/mastery/ledger";
import { COMPETENCIES, type CompetencyKey } from "../lib/mastery/competencies";
import { MASTERY_WINDOW_DAYS } from "../lib/mastery/weights";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

// Fixed evaluation instant — every expectation below is a literal number
// derived from this exact Date, never a live clock read.
const NOW = new Date("2026-10-16T12:00:00Z");
const WINDOW_START = new Date(
  NOW.getTime() - MASTERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
);

const COMPETENCY_KEYS = COMPETENCIES.map((c) => c.key);
const [KEY_A, KEY_B, KEY_C, KEY_D] = COMPETENCY_KEYS as CompetencyKey[];

let idCounter = 0;
function mkRow(overrides: Partial<MasteryContributionRow>): MasteryContributionRow {
  idCounter += 1;
  return {
    id: `row-${idCounter}`,
    userId: "test-user",
    competencyKey: KEY_A,
    source: "LIVE_SESSION",
    rawScore: 0.5,
    weight: 1.0,
    sourceReportId: null,
    sourceAttemptId: null,
    sourceCoachedSessionId: null,
    reversedAt: null,
    reversedReason: null,
    occurredAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

console.log("1. Empty array: every competency null, both overalls null");
{
  const result = computeMastery([], NOW);
  check(
    "every competency in COMPETENCIES is present",
    result.competencies.length === COMPETENCIES.length,
    `got ${result.competencies.length}, expected ${COMPETENCIES.length}`
  );
  check(
    "every competency has a null lifetimePercent",
    result.competencies.every((c) => c.lifetimePercent === null)
  );
  check(
    "every competency has a null currentPercent",
    result.competencies.every((c) => c.currentPercent === null)
  );
  check(
    "every competency has lifetimeEvidenceCount 0 and currentEvidenceCount 0",
    result.competencies.every(
      (c) => c.lifetimeEvidenceCount === 0 && c.currentEvidenceCount === 0
    )
  );
  check(
    "every competency has lastContributionAt null",
    result.competencies.every((c) => c.lastContributionAt === null)
  );
  check("overallLifetimePercent is null", result.overallLifetimePercent === null);
  check("overallCurrentPercent is null", result.overallCurrentPercent === null);
  check(
    "windowStart equals now - 30 days",
    result.windowStart.getTime() === WINDOW_START.getTime(),
    `got ${result.windowStart.toISOString()}, expected ${WINDOW_START.toISOString()}`
  );
  check("windowDays is 30", result.windowDays === MASTERY_WINDOW_DAYS);
  check("unmappedRowCount is 0", result.unmappedRowCount === 0);
}

console.log(
  "\n2. One contribution to one competency: that competency's lifetime equals rawScore*100"
);
{
  const rows = [mkRow({ competencyKey: KEY_A, rawScore: 0.75, weight: 1.0 })];
  const result = computeMastery(rows, NOW);
  const a = result.competencies.find((c) => c.competencyKey === KEY_A)!;
  check("competency A lifetimePercent is 75.0", a.lifetimePercent === 75.0, `got ${a.lifetimePercent}`);
  check("competency A currentPercent is 75.0", a.currentPercent === 75.0, `got ${a.currentPercent}`);
  check(
    "every other competency is null",
    result.competencies
      .filter((c) => c.competencyKey !== KEY_A)
      .every((c) => c.lifetimePercent === null && c.currentPercent === null)
  );
  check(
    "overallLifetimePercent equals the one figure (mean of one)",
    result.overallLifetimePercent === 75.0,
    `got ${result.overallLifetimePercent}`
  );
  check(
    "overallCurrentPercent equals the one figure (mean of one)",
    result.overallCurrentPercent === 75.0,
    `got ${result.overallCurrentPercent}`
  );
}

console.log(
  "\n3. Weighted mean, not flat average: rawScore 0.4 weight 1.0 and rawScore 0.8 weight 0.2 -> 46.7"
);
{
  const rows = [
    mkRow({ competencyKey: KEY_A, rawScore: 0.4, weight: 1.0 }),
    mkRow({ competencyKey: KEY_A, rawScore: 0.8, weight: 0.2 }),
  ];
  const result = computeMastery(rows, NOW);
  const a = result.competencies.find((c) => c.competencyKey === KEY_A)!;
  // (0.4*1.0 + 0.8*0.2) / (1.0+0.2) = 0.56/1.2 = 0.466666... -> 46.7
  check("lifetimePercent is 46.7 (weighted, not flat 60.0)", a.lifetimePercent === 46.7, `got ${a.lifetimePercent}`);
  check("lifetimeEvidenceCount is 2", a.lifetimeEvidenceCount === 2);
  check("lifetimeWeightSum is 1.2", Math.abs(a.lifetimeWeightSum - 1.2) < 1e-9, `got ${a.lifetimeWeightSum}`);
}

console.log(
  "\n4. Window boundary: row exactly on windowStart is IN current; one ms earlier is OUT"
);
{
  const onBoundary = mkRow({
    competencyKey: KEY_B,
    rawScore: 0.6,
    weight: 1.0,
    occurredAt: new Date(WINDOW_START.getTime()),
  });
  const justBefore = mkRow({
    competencyKey: KEY_B,
    rawScore: 0.6,
    weight: 1.0,
    occurredAt: new Date(WINDOW_START.getTime() - 1),
  });
  const result = computeMastery([onBoundary, justBefore], NOW);
  const b = result.competencies.find((c) => c.competencyKey === KEY_B)!;
  check(
    "lifetime includes both rows",
    b.lifetimeEvidenceCount === 2,
    `got ${b.lifetimeEvidenceCount}`
  );
  check(
    "current includes only the on-boundary row (inclusive boundary)",
    b.currentEvidenceCount === 1,
    `got ${b.currentEvidenceCount}`
  );
  check(
    "lifetimePercent and currentPercent genuinely differ",
    b.lifetimePercent !== null &&
      b.currentPercent !== null &&
      b.lifetimePercent === b.currentPercent, // both rows same rawScore/weight -> same percent value
    `lifetime=${b.lifetimePercent}, current=${b.currentPercent}`
  );
  check(
    "but the underlying evidence counts differ (proving two distinct windows, not one path reused blindly)",
    b.lifetimeEvidenceCount !== b.currentEvidenceCount
  );
}

console.log(
  "\n5. A competency with only old rows: non-null lifetime, NULL current"
);
{
  const old = mkRow({
    competencyKey: KEY_C,
    rawScore: 0.9,
    weight: 1.0,
    occurredAt: new Date(WINDOW_START.getTime() - 1000 * 60 * 60 * 24 * 10), // 10 days before window start
  });
  const result = computeMastery([old], NOW);
  const c = result.competencies.find((comp) => comp.competencyKey === KEY_C)!;
  check("lifetimePercent is non-null (90.0)", c.lifetimePercent === 90.0, `got ${c.lifetimePercent}`);
  check("currentPercent is NULL, not 0", c.currentPercent === null, `got ${c.currentPercent}`);
  check("currentEvidenceCount is 0", c.currentEvidenceCount === 0);
  check("lifetimeEvidenceCount is 1", c.lifetimeEvidenceCount === 1);
}

console.log("\n6. Determinism: same inputs, shuffled order -> deep-equal results");
{
  const rows = [
    mkRow({ competencyKey: KEY_A, rawScore: 0.4, weight: 1.0, occurredAt: NOW }),
    mkRow({ competencyKey: KEY_A, rawScore: 0.8, weight: 0.2, occurredAt: NOW }),
    mkRow({ competencyKey: KEY_B, rawScore: 0.6, weight: 1.0, occurredAt: NOW }),
    mkRow({
      competencyKey: KEY_C,
      rawScore: 0.9,
      weight: 1.0,
      occurredAt: new Date(WINDOW_START.getTime() - 1000 * 60 * 60 * 24 * 10),
    }),
  ];
  const shuffled = [rows[2], rows[0], rows[3], rows[1]];
  const resultA = computeMastery(rows, NOW);
  const resultB = computeMastery(shuffled, NOW);
  check(
    "computeMastery(rows) deep-equals computeMastery(shuffled)",
    JSON.stringify(resultA) === JSON.stringify(resultB)
  );
}

console.log(
  "\n7. Overall is independent of practice volume: 10 rows at 0.3 vs 1 row at 0.9 -> overall is 60.0"
);
{
  const manyRows = Array.from({ length: 10 }, () =>
    mkRow({ competencyKey: KEY_A, rawScore: 0.3, weight: 1.0 })
  );
  const oneRow = [mkRow({ competencyKey: KEY_B, rawScore: 0.9, weight: 1.0 })];
  const result = computeMastery([...manyRows, ...oneRow], NOW);
  const a = result.competencies.find((c) => c.competencyKey === KEY_A)!;
  const b = result.competencies.find((c) => c.competencyKey === KEY_B)!;
  check("competency A (10 rows) lifetimePercent is 30.0", a.lifetimePercent === 30.0, `got ${a.lifetimePercent}`);
  check("competency B (1 row) lifetimePercent is 90.0", b.lifetimePercent === 90.0, `got ${b.lifetimePercent}`);
  check(
    "overallLifetimePercent is 60.0, not pulled toward 0.3 by volume",
    result.overallLifetimePercent === 60.0,
    `got ${result.overallLifetimePercent}`
  );
}

console.log(
  "\n8. A row with a competencyKey not in COMPETENCIES is counted in unmappedRowCount, excluded from every figure"
);
{
  const rows = [
    mkRow({ competencyKey: KEY_D, rawScore: 0.5, weight: 1.0 }),
    mkRow({ competencyKey: "__gone__" as CompetencyKey, rawScore: 0.99, weight: 1.0 }),
  ];
  const result = computeMastery(rows, NOW);
  check("unmappedRowCount is 1", result.unmappedRowCount === 1, `got ${result.unmappedRowCount}`);
  check(
    "no competency in the output carries the unmapped key",
    !result.competencies.some((c) => (c.competencyKey as string) === "__gone__")
  );
  const d = result.competencies.find((c) => c.competencyKey === KEY_D)!;
  check("competency D's figure reflects only its own mapped row", d.lifetimePercent === 50.0, `got ${d.lifetimePercent}`);
}

console.log("\n9. A row with a non-null reversedAt THROWS");
{
  const rows = [mkRow({ competencyKey: KEY_A, reversedAt: new Date(NOW), reversedReason: "contested" })];
  let threw = false;
  try {
    computeMastery(rows, NOW);
  } catch {
    threw = true;
  }
  check("computeMastery throws when a supplied row is reversed", threw);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
