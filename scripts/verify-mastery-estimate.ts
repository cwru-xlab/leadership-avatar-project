/**
 * Proves a mastery figure is an estimate that one session cannot settle, and
 * prints the before/after numbers: "before" is the old arithmetic (a weighted
 * mean over ledger rows, tiered on the row weight sum, levelled on percent
 * alone), restated here on purpose so the comparison survives it being gone.
 *
 * Run: npx tsx scripts/verify-mastery-estimate.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import { computeMastery, growthSincePlan } from "../lib/mastery/compute";
import type { MasteryContributionRow } from "../lib/mastery/ledger";
import { COMPETENCIES, type CompetencyKey } from "../lib/mastery/competencies";
import { LEVEL_THRESHOLDS, levelFor } from "../lib/mastery/levels";
import { toMasteryDTO } from "../lib/mastery/mastery-dto";
import { CONTRIBUTION_WEIGHTS, normalizeRubricScore, type ContributionSource } from "../lib/mastery/weights";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-05T12:00:00Z");
const KEY = COMPETENCIES[0].key as CompetencyKey;

let n = 0;
function row(rubric: number, daysAgo: number, source: ContributionSource = "LIVE_SESSION", activity?: string): MasteryContributionRow {
  n += 1;
  const id = activity ?? `activity-${n}`;
  return {
    id: `row-${n}`,
    userId: "u",
    competencyKey: KEY,
    source,
    rawScore: normalizeRubricScore(rubric),
    weight: CONTRIBUTION_WEIGHTS[source],
    sourceReportId: source === "LIVE_SESSION" ? id : null,
    sourceAttemptId: source.startsWith("CHECK") ? id : null,
    sourceCoachedSessionId: source === "COACHED_SESSION" ? id : null,
    sourceVoiceDrillAttemptId: source === "VOICE_DRILL" ? id : null,
    reversedAt: null,
    reversedReason: null,
    occurredAt: new Date(NOW.getTime() - daysAgo * DAY),
    createdAt: NOW,
  };
}

function figures(rows: MasteryContributionRow[]) {
  const result = computeMastery(rows, NOW);
  const dto = toMasteryDTO(result).competencies.find((c) => c.competencyKey === KEY)!;
  const live = dto.sources.find((s) => s.origin === "live")!.lifetime.evidenceCount;
  const evidence = { sessions: dto.lifetime.effectiveSessions, liveSessions: live };
  const level = levelFor({ percent: dto.current.percent ?? dto.lifetime.percent, tier: dto.current.percent === null ? dto.lifetime.tier : dto.current.tier, evidence });
  return { result: result.competencies.find((c) => c.competencyKey === KEY)!, dto, level };
}

function before(rows: MasteryContributionRow[]) {
  const weight = rows.reduce((sum, r) => sum + r.weight, 0);
  const percent = Math.round((rows.reduce((sum, r) => sum + r.rawScore * r.weight, 0) / weight) * 1000) / 10;
  const threshold = [...LEVEL_THRESHOLDS].reverse().find((t) => percent >= t.minPercent)!;
  return { percent, level: `L${threshold.level} ${threshold.name}`, tier: weight < 2 ? "THIN" : weight >= 6 ? "ESTABLISHED" : "EMERGING" };
}

const scenarios: Array<{ name: string; rows: MasteryContributionRow[] }> = [
  { name: "1 perfect session", rows: [row(5, 1)] },
  { name: "1 poor session", rows: [row(1, 1)] },
  { name: "5 consistent (all 4s, weekly)", rows: [28, 21, 14, 7, 0].map((d) => row(4, d)) },
  { name: "5 consistent (all 5s, weekly)", rows: [28, 21, 14, 7, 0].map((d) => row(5, d)) },
  { name: "improving 2,3,3,4,5 (weekly)", rows: [2, 3, 3, 4, 5].map((s, i) => row(s, 28 - i * 7)) },
  { name: "declining 5,4,3,3,2 (weekly)", rows: [5, 4, 3, 3, 2].map((s, i) => row(s, 28 - i * 7)) },
  { name: "1 session, 4 perfect rows", rows: [1, 2, 3, 4].map(() => row(5, 1, "LIVE_SESSION", "one-report")) },
  { name: "1 coached session, 3 perfect legs", rows: [1, 2, 3].map(() => row(5, 1, "COACHED_SESSION", "one-coached")) },
  { name: "1 perfect voice drill", rows: [row(5, 1, "VOICE_DRILL")] },
  { name: "1 correct multiple choice", rows: [row(5, 1, "CHECK_DETERMINISTIC")] },
  { name: "1 full interview (perfect)", rows: [row(5, 1)] },
  { name: "12 perfect multiple choice", rows: Array.from({ length: 12 }, (_, i) => row(5, 12 - i, "CHECK_DETERMINISTIC")) },
  { name: "25 perfect voice drills", rows: Array.from({ length: 25 }, (_, i) => row(5, i, "VOICE_DRILL")) },
  { name: "6 consistent (all 5s, weekly)", rows: [35, 28, 21, 14, 7, 0].map((d) => row(5, d)) },
  { name: "8 sessions at all 4s", rows: Array.from({ length: 8 }, (_, i) => row(4, 56 - i * 7)) },
  { name: "30 old 2s, then 1 recent 5", rows: [...Array.from({ length: 30 }, (_, i) => row(2, 200 - i * 5)), row(5, 1)] },
];

console.log("BEFORE vs AFTER");
console.log(
  ["scenario".padEnd(36), "before".padEnd(36), "all time".padEnd(18), "recent".padEnd(18), "avg".padEnd(6), "range".padEnd(9), "tier".padEnd(13), "level (from recent)"].join(" ")
);
const seen = new Map<string, ReturnType<typeof figures>>();
for (const { name, rows } of scenarios) {
  const b = before(rows);
  const a = figures(rows);
  seen.set(name, a);
  const f = a.dto.lifetime;
  console.log(
    [
      name.padEnd(36),
      `${b.percent}% ${b.tier} ${b.level}`.padEnd(36),
      `${f.percent} ${f.display}`.padEnd(18),
      `${a.dto.current.percent} ${a.dto.current.display}`.padEnd(18),
      `${f.observedPercent}`.padEnd(6),
      `${f.range?.low}-${f.range?.high}`.padEnd(9),
      `${f.tierLabel}`.padEnd(13),
      `L${a.level.level} ${a.level.name}${a.level.toConfirm ? ` (+${a.level.toConfirm.sessions}${a.level.toConfirm.live ? " live" : ""} to L${a.level.toConfirm.level})` : ""}`,
    ].join(" ")
  );
}

const get = (name: string) => seen.get(name)!;

console.log("\n1. ONE SESSION NEVER READS AS MASTERED OR CONFIDENT");
{
  const perfect = get("1 perfect session");
  check("1 perfect session reads 66.7", perfect.dto.lifetime.percent === 66.7);
  check("observed 100 is still reported as what was scored", perfect.dto.lifetime.observedPercent === 100);
  check("it is an early read, at level 2", perfect.dto.lifetime.tier === "THIN" && perfect.level.level === 2);
  check("display is approximate and rounded to 5", perfect.dto.lifetime.display === "about 65%");
  check("the level says one more session confirms level 3", perfect.level.toConfirm?.level === 3 && perfect.level.toConfirm.sessions === 1);
  const poor = get("1 poor session");
  check("1 floor session reads 33.3, symmetric with a perfect one", poor.dto.lifetime.percent === 33.3);
  check("1 floor session is level 1 but an early read", poor.level.level === 1 && poor.dto.lifetime.tier === "THIN");
  for (const [name, source] of [["drill", "VOICE_DRILL"], ["check", "CHECK_DETERMINISTIC"], ["coached", "COACHED_SESSION"], ["live", "LIVE_SESSION"]] as const) {
    const single = figures([row(5, 1, source)]);
    check(`no single ${name} reaches level 3`, single.level.level !== null && single.level.level <= 2, `got ${single.level.level}`);
  }
}

console.log("\n2. ONE SESSION'S MANY DATA POINTS COUNT ONCE");
{
  const one = get("1 perfect session").dto.lifetime;
  const many = get("1 session, 4 perfect rows").dto.lifetime;
  check("4 rows of one report equal 1 row", many.percent === one.percent && many.evidenceCount === 1 && many.effectiveSessions === 1);
  const coached = get("1 coached session, 3 perfect legs").dto.lifetime;
  const drill = get("1 perfect voice drill").dto.lifetime;
  check("3 coached legs count as one activity at one weight", coached.evidenceCount === 1 && coached.effectiveSessions === 0.2);
  check("so 3 legs read the same as 1 row at the same weight", coached.percent === drill.percent);
  const across = computeMastery(COMPETENCIES.map((c) => ({ ...row(5, 1, "LIVE_SESSION", "shared"), competencyKey: c.key })), NOW);
  check("one session across all 7 skills is one session overall", across.overallLifetimeEvidence.count === 1 && across.overallLifetimeEvidence.weightSum === 1);
}

console.log("\n3. ACTIVITY-TYPE WEIGHTS");
{
  const drill = get("1 perfect voice drill").dto.lifetime.percent!;
  const check_ = get("1 correct multiple choice").dto.lifetime.percent!;
  const live = get("1 full interview (perfect)").dto.lifetime.percent!;
  check("a perfect drill < a perfect check < a perfect interview", drill < check_ && check_ < live, `${drill} ${check_} ${live}`);
  check("12 perfect quizzes cap below Strong (no live session)", (get("12 perfect multiple choice").level.level ?? 9) <= 3);
  check("25 perfect drills cap below Strong (no live session)", (get("25 perfect voice drills").level.level ?? 9) <= 3);
}

console.log("\n4. CONVERGENCE AND BOUNDS");
{
  for (const rubric of [1, 2, 3, 4, 5]) {
    const target = normalizeRubricScore(rubric) * 100;
    let last = 50;
    let inOrder = true;
    let everOverNotBounded = false;
    const rows: MasteryContributionRow[] = [];
    for (let i = 0; i < 200; i += 1) {
      rows.push(row(rubric, 200 - i));
      const p = figures(rows).result.lifetimePercent!;
      if (target >= 50 ? p < last - 1e-9 : p > last + 1e-9) inOrder = false;
      if (p < Math.min(target, 50) - 1e-9 || p > Math.max(target, 50) + 1e-9) everOverNotBounded = true;
      last = p;
    }
    check(`all ${rubric}s: moves monotonically toward ${target}, ends at ${last}`, inOrder && Math.abs(last - target) <= 1);
    check(`all ${rubric}s: stays between the prior and the observed value`, !everOverNotBounded);
  }
  const hundred = figures(Array.from({ length: 50 }, (_, i) => row(5, i))).result;
  check("50 perfect sessions still under 100", hundred.lifetimePercent! < 100, `got ${hundred.lifetimePercent}`);
  const zero = figures(Array.from({ length: 50 }, (_, i) => row(1, i))).result;
  check("50 floor sessions still over 0", zero.lifetimePercent! > 0, `got ${zero.lifetimePercent}`);
  const r = figures([row(5, 3), row(5, 2)]).result.lifetimeRange!;
  const wider = figures([row(5, 2)]).result.lifetimeRange!;
  check("the range narrows with evidence", r.high - r.low < wider.high - wider.low, JSON.stringify({ r, wider }));
}

console.log("\n5. MONOTONIC IN SCORE");
{
  const base = [3, 4, 2, 3];
  let ok = true;
  for (const position of base.keys()) {
    let last = -1;
    for (const rubric of [1, 2, 3, 4, 5]) {
      const scores = base.map((s, i) => (i === position ? rubric : s));
      const p = figures(scores.map((s, i) => row(s, 30 - i * 7))).result.lifetimePercent!;
      if (p < last) ok = false;
      last = p;
    }
  }
  check("raising any one session's score never lowers the figure", ok);
}

console.log("\n6. RECENCY");
{
  const up = get("improving 2,3,3,4,5 (weekly)").dto;
  const down = get("declining 5,4,3,3,2 (weekly)").dto;
  check("all time counts every session evenly: same scores, same figure", up.lifetime.percent === down.lifetime.percent);
  check("recent form reads improving above the all-time figure", up.current.percent! > up.lifetime.percent!, `${up.current.percent} vs ${up.lifetime.percent}`);
  check("recent form reads declining below the all-time figure", down.current.percent! < down.lifetime.percent!, `${down.current.percent} vs ${down.lifetime.percent}`);
  const away = [row(2, 40), row(4, 10)];
  const later = computeMastery(away, new Date(NOW.getTime() + 300 * DAY)).competencies.find((c) => c.competencyKey === KEY)!;
  check("the all-time figure does not drift while a student is away", figures(away).result.lifetimePercent === later.lifetimePercent);
  const inWindow = [row(2, 20), row(4, 10)];
  const nextDay = computeMastery(inWindow, new Date(NOW.getTime() + DAY)).competencies.find((c) => c.competencyKey === KEY)!;
  check("recent form does not drift day to day while the rows stay in the window", figures(inWindow).result.currentPercent === nextDay.currentPercent);
  check("an old figure leaves the recent window, it does not decay", later.currentPercent === null);
}

console.log("\n7. RECENT FORM");
{
  const longWeak = get("30 old 2s, then 1 recent 5");
  check("one great session after a long weak record does not reach Strong", (longWeak.level.level ?? 9) < 4, `${longWeak.dto.current.percent} L${longWeak.level.level}`);
  const fresh = get("1 perfect session");
  check("one session in a first-ever window equals the lifetime figure", fresh.result.currentPercent === fresh.result.lifetimePercent);
  const strongOld = figures([...Array.from({ length: 20 }, (_, i) => row(5, 100 + i)), row(5, 1)]);
  check("a recent session extends a strong record rather than resetting it", strongOld.dto.current.percent! > 85, `${strongOld.dto.current.percent}`);
  const fell = figures([...Array.from({ length: 20 }, (_, i) => row(5, 100 + i)), row(2, 3), row(2, 2), row(2, 1)]);
  check("three poor recent sessions pull recent form well below all-time", fell.dto.current.percent! < fell.dto.lifetime.percent! - 20, `${fell.dto.current.percent} vs ${fell.dto.lifetime.percent}`);
}

console.log("\n8. DETERMINISM AND EXISTING ROWS");
{
  const rows = [row(5, 3), row(2, 2), row(4, 1), row(3, 1, "VOICE_DRILL"), row(5, 2, "CHECK_MODEL_GRADED")];
  const forward = JSON.stringify(computeMastery(rows, NOW));
  const shuffled = JSON.stringify(computeMastery([...rows].reverse(), NOW));
  check("row order does not change a figure", forward === shuffled);
  const old = figures([{ ...row(5, 1, "COACHED_SESSION"), weight: 0.4 }]).dto.lifetime;
  check("a pre-Phase-22 coached row keeps its snapshotted 0.40", old.effectiveSessions === 0.4);
  const bare = { ...row(5, 1), sourceReportId: null };
  check("a row with no source id still counts, as its own activity", figures([bare]).dto.lifetime.evidenceCount === 1);
}

console.log("\n9. GROWTH SINCE A PLAN");
{
  const since = new Date(NOW.getTime() - 10 * DAY);
  const rows = [row(3, 30), row(3, 20), row(4, 15)];
  const [still] = growthSincePlan(rows, [KEY], since, NOW);
  check("nothing since the plan: no delta, so nothing can read 'x% -> x%'", still.delta === null && still.sinceEvidenceCount === 0);
  const [moved] = growthSincePlan([...rows, row(5, 2)], [KEY], since, NOW);
  check("a strong session since the plan moves it, in whole points", moved.delta !== null && moved.delta > 0 && Number.isInteger(moved.delta), `${moved.delta}`);
  check("what was scored since stays the plain figure", moved.sincePercent === 100);
}

console.log(failures === 0 ? "\nALL PASS\n" : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
