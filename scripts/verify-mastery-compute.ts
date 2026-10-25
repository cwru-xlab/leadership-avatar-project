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
import {
  computeMastery,
  growthSincePlan,
  EVIDENCE_ORIGINS,
  MAX_WINDOW_DRIVERS,
  TREND_BUCKETS,
  type CompetencyMastery,
} from "../lib/mastery/compute";
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


// === Phase 23: growth visibility fields ===================================
const DAY_MS = 24 * 60 * 60 * 1000;

/** The breakdown-sums predicate, factored out so its bite can be proven. */
function originSumIssues(c: CompetencyMastery): string[] {
  const issues: string[] = [];
  if (c.byOrigin.length !== EVIDENCE_ORIGINS.length) issues.push("byOrigin length");
  const lifetime = c.byOrigin.reduce((n, o) => n + o.lifetimeCount, 0);
  const current = c.byOrigin.reduce((n, o) => n + o.currentCount, 0);
  if (lifetime !== c.lifetimeEvidenceCount) issues.push(`lifetime ${lifetime} != ${c.lifetimeEvidenceCount}`);
  if (current !== c.currentEvidenceCount) issues.push(`current ${current} != ${c.currentEvidenceCount}`);
  return issues;
}

console.log("\n10. byOrigin: live vs path (check / coached) split from the source column");
{
  const rows = [
    mkRow({ competencyKey: KEY_A, source: "LIVE_SESSION", weight: 1.0, rawScore: 0.75, sourceReportId: "r1", occurredAt: new Date(NOW.getTime() - 2 * DAY_MS) }),
    mkRow({ competencyKey: KEY_A, source: "LIVE_SESSION", weight: 1.0, rawScore: 0.25, sourceReportId: "r0", occurredAt: new Date(WINDOW_START.getTime() - DAY_MS) }),
    mkRow({ competencyKey: KEY_A, source: "CHECK_DETERMINISTIC", weight: 0.45, rawScore: 1, sourceAttemptId: "a1", occurredAt: new Date(NOW.getTime() - DAY_MS) }),
    mkRow({ competencyKey: KEY_A, source: "CHECK_MODEL_GRADED", weight: 0.2, rawScore: 0, sourceAttemptId: "a2", occurredAt: new Date(NOW.getTime() - DAY_MS) }),
    // A pre-Phase-22 coached row with its snapshotted 0.40 weight: the figure
    // must use 0.40, not today's table value.
    mkRow({ competencyKey: KEY_A, source: "COACHED_SESSION", weight: 0.4, rawScore: 0.5, sourceCoachedSessionId: "c1", occurredAt: new Date(NOW.getTime() - DAY_MS) }),
  ];
  const a = computeMastery(rows, NOW).competencies.find((c) => c.competencyKey === KEY_A)!;
  const by = Object.fromEntries(a.byOrigin.map((o) => [o.origin, o]));
  check("byOrigin is in EVIDENCE_ORIGINS order", a.byOrigin.map((o) => o.origin).join() === EVIDENCE_ORIGINS.join());
  check("live: 2 lifetime rows, 1 current", by.live.lifetimeCount === 2 && by.live.currentCount === 1);
  check("live lifetime percent = mean(0.75, 0.25) = 50", by.live.lifetimePercent === 50, `got ${by.live.lifetimePercent}`);
  check("check: both check sources grouped (2 rows)", by.check.lifetimeCount === 2);
  // (1*0.45 + 0*0.2) / 0.65 = 69.2307... -> 69.2
  check("check percent uses each row's snapshotted weight (69.2)", by.check.lifetimePercent === 69.2, `got ${by.check.lifetimePercent}`);
  check("coached: 1 row, weight 0.40 snapshotted", by.coached.lifetimeCount === 1 && by.coached.lifetimeWeightSum === 0.4);
  check("origin counts sum to the competency's evidence counts", originSumIssues(a).length === 0, JSON.stringify(originSumIssues(a)));
  const tampered: CompetencyMastery = { ...a, byOrigin: a.byOrigin.filter((o) => o.origin !== "check") };
  check(
    "bite: the sum predicate FAILS when an origin bucket is dropped",
    originSumIssues(tampered).length > 0
  );
}

console.log("\n11. trend: TREND_BUCKETS rolling weekly points of the lifetime figure");
{
  const rows = [
    mkRow({ competencyKey: KEY_B, rawScore: 0.25, occurredAt: new Date(NOW.getTime() - 20 * DAY_MS) }),
    mkRow({ competencyKey: KEY_B, rawScore: 0.75, occurredAt: new Date(NOW.getTime() - 3 * DAY_MS) }),
  ];
  const b = computeMastery(rows, NOW).competencies.find((c) => c.competencyKey === KEY_B)!;
  check(`trend has ${TREND_BUCKETS} points`, b.trend.length === TREND_BUCKETS);
  check("last point ends exactly at now", b.trend[b.trend.length - 1].endsAt.getTime() === NOW.getTime());
  check("points are oldest first, 7 days apart", b.trend.every((p, i) => i === 0 || p.endsAt.getTime() - b.trend[i - 1].endsAt.getTime() === 7 * DAY_MS));
  check("last point equals lifetimePercent", b.trend[b.trend.length - 1].cumulativePercent === b.lifetimePercent);
  check("points before any evidence are null, not 0", b.trend[0].cumulativePercent === null);
  // Bucket ending now-14d holds the -20d row only -> 25; final -> 50.
  const at14 = b.trend[TREND_BUCKETS - 3];
  check("the figure as it stood 14 days ago is 25 (only the older row)", at14.cumulativePercent === 25, `got ${at14.cumulativePercent}`);
  check("bucket counts sum to rows inside the trend span", b.trend.reduce((n, p) => n + p.bucketCount, 0) === 2);
  const shifted = computeMastery(rows, new Date(NOW.getTime() + 7 * DAY_MS)).competencies.find((c) => c.competencyKey === KEY_B)!;
  check(
    "bite: a different `now` yields a different series (now is honoured, not the clock)",
    JSON.stringify(shifted.trend) !== JSON.stringify(b.trend)
  );
}

console.log("\n12. windowDelta, drivers and recentGrowth");
{
  const before = new Date(WINDOW_START.getTime() - DAY_MS);
  const inWin = new Date(NOW.getTime() - DAY_MS);
  const rows = [
    // KEY_A: baseline 25 -> in-window 75 x2 -> lifetime (0.25+0.75+0.75)/3 = 58.3; delta 33.3
    mkRow({ competencyKey: KEY_A, rawScore: 0.25, occurredAt: before, sourceReportId: "old" }),
    mkRow({ competencyKey: KEY_A, rawScore: 0.75, occurredAt: inWin, sourceReportId: "rA" }),
    mkRow({ competencyKey: KEY_A, rawScore: 0.75, occurredAt: inWin, sourceReportId: "rB" }),
    // KEY_B: baseline 50 -> in-window 62.5 -> lifetime 56.3; delta 6.3 (smaller)
    mkRow({ competencyKey: KEY_B, rawScore: 0.5, occurredAt: before, sourceReportId: "old" }),
    mkRow({ competencyKey: KEY_B, rawScore: 0.625, occurredAt: inWin, sourceReportId: "rA" }),
    // KEY_C: only in-window -> "new"
    mkRow({ competencyKey: KEY_C, source: "CHECK_DETERMINISTIC", weight: 0.45, rawScore: 1, occurredAt: inWin, sourceAttemptId: "att" }),
    // KEY_D: only before the window -> no delta, not in recentGrowth
    mkRow({ competencyKey: KEY_D, rawScore: 0.5, occurredAt: before }),
    // Two rows from one report on one competency -> ONE driver
    mkRow({ competencyKey: KEY_A, rawScore: 0.75, occurredAt: inWin, sourceReportId: "rA" }),
  ];
  const result = computeMastery(rows, NOW);
  const get = (k: CompetencyKey) => result.competencies.find((c) => c.competencyKey === k)!;
  const a = get(KEY_A);
  check("A windowStartLifetimePercent = 25", a.windowStartLifetimePercent === 25, `got ${a.windowStartLifetimePercent}`);
  check("A windowDelta = lifetime - start", a.windowDelta === Math.round((a.lifetimePercent! - 25) * 10) / 10, `got ${a.windowDelta}`);
  check("C (first measured in window) has null delta", get(KEY_C).windowDelta === null && get(KEY_C).windowStartLifetimePercent === null);
  check("D (no in-window evidence) has null delta", get(KEY_D).windowDelta === null);
  check("A drivers: rows from one report are grouped (2 drivers, not 3)", a.windowDrivers.length === 2, JSON.stringify(a.windowDrivers.map((d) => d.sourceReportId)));
  check("A drivers carry their report id and origin", a.windowDrivers.every((d) => d.origin === "live" && (d.sourceReportId === "rA" || d.sourceReportId === "rB")));
  check("rA (two rows, weight 2) pulls harder than rB", a.windowDrivers[0].sourceReportId === "rA");
  check(`drivers never exceed MAX_WINDOW_DRIVERS (${MAX_WINDOW_DRIVERS})`, result.competencies.every((c) => c.windowDrivers.length <= MAX_WINDOW_DRIVERS));
  check("C driver is a check attempt", get(KEY_C).windowDrivers[0]?.origin === "check" && get(KEY_C).windowDrivers[0]?.sourceAttemptId === "att");
  const growth = result.recentGrowth.map((g) => `${g.kind}:${g.competencyKey}`);
  check(
    "recentGrowth = moved by |delta| desc, then new",
    growth.join() === [`moved:${KEY_A}`, `moved:${KEY_B}`, `new:${KEY_C}`].join(),
    growth.join()
  );
  check("recentGrowth never names a competency with no in-window evidence", !growth.some((g) => g.endsWith(`:${KEY_D}`)));
  // Bite: with the window moved so nothing is "in window", there is no growth.
  const later = computeMastery(rows, new Date(NOW.getTime() + 60 * DAY_MS));
  check("bite: no in-window evidence -> recentGrowth empty", later.recentGrowth.length === 0, JSON.stringify(later.recentGrowth));
}

console.log("\n13. growthSincePlan: per-study-plan baseline");
{
  const since = new Date(NOW.getTime() - 10 * DAY_MS);
  const rows = [
    // A: baseline 25 (before since), then 75 + 75 after -> now 58.3, delta 33.3
    mkRow({ competencyKey: KEY_A, rawScore: 0.25, occurredAt: new Date(since.getTime() - DAY_MS), sourceReportId: "pre" }),
    mkRow({ competencyKey: KEY_A, rawScore: 0.75, occurredAt: new Date(since.getTime() + DAY_MS), sourceReportId: "p1" }),
    mkRow({ competencyKey: KEY_A, source: "CHECK_DETERMINISTIC", weight: 0.45, rawScore: 0.75, occurredAt: since, sourceAttemptId: "chk" }),
    // B: drop — baseline 100, after 0
    mkRow({ competencyKey: KEY_B, rawScore: 1, occurredAt: new Date(since.getTime() - DAY_MS) }),
    mkRow({ competencyKey: KEY_B, rawScore: 0, occurredAt: new Date(since.getTime() + DAY_MS), sourceReportId: "p2" }),
    // C: nothing since -> delta null
    mkRow({ competencyKey: KEY_C, rawScore: 0.5, occurredAt: new Date(since.getTime() - DAY_MS) }),
    // A row after `now` must be ignored
    mkRow({ competencyKey: KEY_A, rawScore: 0, occurredAt: new Date(NOW.getTime() + DAY_MS), sourceReportId: "future" }),
  ];
  const snapshot = [{ competencyKey: KEY_A, lifetimePercent: null, currentPercent: null }, { competencyKey: KEY_B, lifetimePercent: 90, currentPercent: 90 }];
  const out = growthSincePlan(rows, [KEY_A, KEY_B, KEY_C, KEY_A, "not_a_competency"], since, NOW, snapshot);
  const get = (k: string) => out.find((r) => r.competencyKey === k)!;
  check("one entry per distinct known key, in first-seen order", out.map((r) => r.competencyKey).join() === [KEY_A, KEY_B, KEY_C].join());
  const a = get(KEY_A);
  // now = (0.25*1 + 0.75*1 + 0.75*0.45) / 2.45 = 54.6
  check("A baseline 25 from rows strictly before since", a.baseline.percent === 25 && a.baseline.evidenceCount === 1);
  check("A now includes the row exactly at since and ignores the future row (54.6)", a.now.percent === 54.6 && a.now.evidenceCount === 3, `got ${a.now.percent}/${a.now.evidenceCount}`);
  check("A delta = now - baseline", a.delta === 29.6, `got ${a.delta}`);
  check("A sinceEvidenceCount 2, drivers name the report and the check", a.sinceEvidenceCount === 2 && a.drivers.length === 2 && a.drivers.some((d) => d.sourceAttemptId === "chk") && a.drivers.every((d) => d.sourceReportId !== "future"));
  check("A sincePercent is the weighted mean of only the since rows (75)", a.sincePercent === 75, `got ${a.sincePercent}`);
  check("C with nothing since has sincePercent null", get(KEY_C).sincePercent === null);
  check("B shows a drop (negative delta)", get(KEY_B).delta === -50, `got ${get(KEY_B).delta}`);
  check("C with nothing since has delta null", get(KEY_C).delta === null && get(KEY_C).sinceEvidenceCount === 0);
  check("snapshot figure echoed, never substituted (A snapshot null, baseline 25)", a.snapshotLifetimePercent === null && get(KEY_B).snapshotLifetimePercent === 90 && get(KEY_B).baseline.percent === 100);
  let threw = false;
  try { growthSincePlan([mkRow({ reversedAt: NOW })], [KEY_A], since, NOW); } catch { threw = true; }
  check("a reversed row THROWS", threw);
  // Bite: moving `since` after every row makes everything baseline -> no deltas.
  const late = growthSincePlan(rows, [KEY_A, KEY_B], NOW, NOW);
  check("bite: since = now leaves no in-plan evidence, so every delta is null", late.every((r) => r.delta === null), JSON.stringify(late.map((r) => r.delta)));
  const shuffled = growthSincePlan([...rows].reverse(), [KEY_A, KEY_B, KEY_C], since, NOW, snapshot);
  check("deterministic under row order", JSON.stringify(shuffled) === JSON.stringify(out.slice(0, 3)));
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
