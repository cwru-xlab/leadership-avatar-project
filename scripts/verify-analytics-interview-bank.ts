/**
 * Static checks for the data-analytics question bank and frameworks (no network).
 *
 * 1. Frameworks: snake_case unique step keys; every nudge is a question that
 *    names neither its step, its label, the method, nor coaching words.
 * 2. Bank shape: ≥12 questions, unique ids, every framework used, mixed
 *    difficulty, facts, sources, well-formed exhibits, TOLERANCE stated.
 * 3. Math: recomputes every benchmark figure quoted in strongAnswerNotes and
 *    every derived exhibit column from the raw exhibit cells and facts, so an
 *    edit that breaks internal consistency fails here.
 * 4. Privacy: the registry-facing modules never import the bank.
 *
 * Run: npx tsx scripts/verify-analytics-interview-bank.ts
 */

import { readFileSync } from "node:fs";

import { ANALYTICS_FRAMEWORKS, getAnalyticsFramework } from "../lib/analytics-interview/frameworks";
import { ANALYTICS_BANK, getAnalyticsQuestion } from "../lib/analytics-interview/questions";
import type { Exhibit } from "../lib/problem-interview/types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
/** Relative closeness (default 1%) with a small absolute floor. */
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-9;
const between = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

/** "$8,400" / "48%" / "−2.25%" / 9.5 / "+4.0%" → number (percent stays in percent units). */
function num(v: string | number): number {
  if (typeof v === "number") return v;
  const m = v.replace(/[$,+]/g, "").replace(/−/g, "-").match(/-?\d+(\.\d+)?/);
  if (!m) throw new Error(`not numeric: ${v}`);
  return Number(m[0]);
}
function ex(questionId: string, exhibitId: string): Exhibit {
  const e = getAnalyticsQuestion(questionId)?.exhibits?.find((x) => x.id === exhibitId);
  if (!e) throw new Error(`${questionId}/${exhibitId} missing`);
  return e;
}
function row(e: Exhibit, label: string): (string | number)[] {
  const r = e.rows.find((x) => String(x[0]).startsWith(label));
  if (!r) throw new Error(`${e.id}: no row ${label}`);
  return r;
}
const cell = (e: Exhibit, label: string, col: number) => num(row(e, label)[col]!);
const notes = (id: string) => getAnalyticsQuestion(id)!.strongAnswerNotes;
const facts = (id: string) => getAnalyticsQuestion(id)!.interviewerFacts.join(" ");

// ---------------------------------------------------------------------------
console.log("\n1. Frameworks");
for (const fw of ANALYTICS_FRAMEWORKS) {
  const keys = fw.steps.map((s) => s.key);
  check(`${fw.key}: step keys unique snake_case`, new Set(keys).size === keys.length && keys.every((k) => /^[a-z][a-z0-9_]*$/.test(k)));
  check(`${fw.key}: 4–6 steps`, between(keys.length, 4, 6));
  for (const s of fw.steps) {
    const n = s.nudge.toLowerCase();
    const leaks = [
      s.key.replace(/_/g, " "),
      s.label.toLowerCase(),
      "framework",
      "step",
      "method",
      "remember",
      "you should",
      "hypothes",
      "guardrail",
      "segment",
      "sample size",
      "power",
      "srm",
      "novelty",
      "p-value",
    ].filter((w) => n.includes(w));
    check(`${fw.key}.${s.key}: nudge is a neutral question`, s.nudge.trim().endsWith("?") && leaks.length === 0, leaks.join(","));
    check(`${fw.key}.${s.key}: has evidence criteria`, s.evidenceCriteria.length > 60);
  }
}

// ---------------------------------------------------------------------------
console.log("\n2. Bank shape");
const ids = ANALYTICS_BANK.map((q) => q.id);
check(`≥12 questions (have ${ids.length})`, ids.length >= 12);
check("ids unique", new Set(ids).size === ids.length);
const byFamily = ANALYTICS_BANK.reduce<Record<string, number>>((acc, q) => ((acc[q.family] = (acc[q.family] ?? 0) + 1), acc), {});
console.log("   counts by family:", JSON.stringify(byFamily));
for (const fw of ANALYTICS_FRAMEWORKS) {
  check(`framework ${fw.key} has ≥3 questions`, ANALYTICS_BANK.filter((q) => q.frameworkKey === fw.key).length >= 3);
}
check("mixed difficulty", new Set(ANALYTICS_BANK.map((q) => q.difficulty)).size === 3);
for (const q of ANALYTICS_BANK) {
  check(`${q.id}: framework exists`, getAnalyticsFramework(q.frameworkKey) !== null);
  check(`${q.id}: family matches framework`, q.family === q.frameworkKey);
  check(`${q.id}: source cited`, q.source.length > 20);
  check(`${q.id}: ≥5 interviewer facts`, q.interviewerFacts.length >= 5);
  check(`${q.id}: states a TOLERANCE band`, /TOLERANCE:/.test(q.strongAnswerNotes));
  check(`${q.id}: prompt ends with an ask`, q.prompt.trim().endsWith("?") || /(walk|talk) me through/i.test(q.prompt));
  const exIds = (q.exhibits ?? []).map((e) => e.id);
  check(`${q.id}: exhibit ids unique`, new Set(exIds).size === exIds.length);
  if (q.family !== "experiment-design") check(`${q.id}: has 1–2 exhibits`, between(exIds.length, 1, 2));
  for (const e of q.exhibits ?? []) {
    check(`${q.id}/${e.id}: rows match columns`, e.rows.length > 0 && e.rows.every((r) => r.length === e.columns.length));
    check(`${q.id}/${e.id}: reveal condition and key insight`, e.revealWhen.length > 20 && e.keyInsight.length > 40);
    // The live prompt must never be able to read an exhibit's numbers from the
    // prompt the candidate hears.
    const firstNumber = String(e.rows[0]![1]);
    check(`${q.id}/${e.id}: prompt does not pre-reveal exhibit data`, !q.prompt.includes(firstNumber));
  }
}

// ---------------------------------------------------------------------------
console.log("\n3. Math");
const pct = (a: number, b: number) => (a / b) * 100;
const n16 = (p: number, d: number) => (16 * p * (1 - p)) / d ** 2;

{
  const id = "da-metric-podcast-success";
  const e1 = ex(id, "ex1");
  const e2 = ex(id, "ex2");
  const starters = cell(e1, "Started", 1);
  const listened = cell(e1, "Listened 30+ seconds at least", 1);
  const habitual = cell(e1, "Listened 30+ seconds on 3", 1);
  check(`${id}: funnel is monotone`, starters >= listened && listened >= cell(e1, "Completed", 1));
  check(`${id}: 30-s pass-through 65%`, near(pct(listened, starters), 65) && /65%/.test(notes(id)));
  check(`${id}: habitual = 3.9% of 40M MAU`, near(pct(habitual, 40_000_000), 3.9) && /3\.9% of MAU/.test(notes(id)));
  const h2 = cell(e2, "Habitual", 1);
  const o2 = cell(e2, "Other", 1);
  const none = cell(e2, "No podcast", 1);
  check(`${id}: ex2 groups match ex1 (habitual, 30-s listeners, MAU)`, h2 === habitual && h2 + o2 === listened && h2 + o2 + none === 40_000_000);
  check(`${id}: autoplay share stated in facts`, /40% of play starts/.test(facts(id)));
}
{
  const id = "da-metric-marketplace-health";
  const e = ex(id, "ex1");
  const cities = e.rows.map((r) => ({ city: String(r[0]), req: num(r[1]!), q: num(r[2]!), b: num(r[3]!), c: num(r[4]!) }));
  const req = cities.reduce((s, x) => s + x.req, 0);
  const done = cities.reduce((s, x) => s + x.c, 0);
  check(`${id}: overall fulfillment 50.6%`, near(pct(done, req), 50.6, 0.005) && /50\.6%/.test(notes(id)));
  for (const x of cities) {
    check(`${id}: ${x.city} book ≈70% / complete ≈95%`, near(x.b / x.q, 0.7, 0.01) && near(x.c / x.b, 0.95, 0.01));
  }
  const phx = cities.find((x) => x.city === "Phoenix")!;
  const others = cities.filter((x) => x.city !== "Phoenix");
  check(`${id}: Phoenix quote rate 55%, others 83–85%`, near(phx.q / phx.req, 0.55) && others.every((x) => between(x.q / x.req, 0.83, 0.851)));
  const gap = phx.req * 0.85 * 0.7 * 0.95 - phx.c;
  check(`${id}: Phoenix gap ≈2,000 jobs (${gap.toFixed(0)}) inside strong band`, between(gap, 1800, 2200));
  const rev = gap * 120 * 0.15;
  check(`${id}: revenue at stake ≈$36k (${rev.toFixed(0)}) inside strong band`, between(rev, 30_000, 40_000));
}
{
  const id = "da-metric-wau-definition";
  const e = ex(id, "ex1");
  const any = cell(e, "Any event", 1);
  const passive = cell(e, "Only background", 1) + cell(e, "Only push", 1);
  check(`${id}: any − passive-only = session_start users`, any - passive === cell(e, "session_start", 1));
  check(`${id}: passive share 30%`, near(pct(passive, any), 30) && /360,000 \(30%\)/.test(notes(id)));
  check(`${id}: meditating WAU 780k = 65% of reported`, near(pct(cell(e, "meditation_start", 1), any), 65));
  check(`${id}: start ≥ complete`, cell(e, "meditation_start", 1) >= cell(e, "meditation_complete", 1));
}
{
  const id = "da-ab-one-page-checkout";
  const n = n16(0.2, 0.01);
  check(`${id}: n per arm = 25,600`, near(n, 25_600) && /25,600 per arm/.test(notes(id)));
  check(`${id}: facts carry baseline, MDE, traffic`, /20% of users/.test(facts(id)) && /1 percentage point/.test(facts(id)) && /50,000 users/.test(facts(id)));
  check(`${id}: total n fits in ≤2 days of traffic`, (2 * n) / 50_000 <= 2);
}
{
  const id = "da-ab-surge-pricing";
  check(`${id}: 40 × 24 × 14 ≈ 13,000 city-hours`, near(40 * 24 * 14, 13_440) && /13,000 city-hours/.test(notes(id)));
}
{
  const id = "da-ab-morning-push";
  const n = n16(0.4, 0.02);
  check(`${id}: n per arm = 9,600`, near(n, 9_600) && /9,600 per arm/.test(notes(id)));
  check(`${id}: strong band contains it`, between(n, 8_000, 12_000));
}
{
  const id = "da-readout-onboarding-srm";
  const e1 = ex(id, "ex1");
  const e2 = ex(id, "ex2");
  const c = cell(e1, "Control", 1);
  const t = cell(e1, "Treatment", 1);
  check(`${id}: completion counts match rates`, near(cell(e1, "Control", 2) / c, 0.6) && near(cell(e1, "Treatment", 2) / t, 0.63));
  const expected = (c + t) / 2;
  const chi2 = ((c - expected) ** 2 + (t - expected) ** 2) / expected;
  const sdUnits = Math.abs(c - expected) / Math.sqrt((c + t) * 0.25);
  check(`${id}: expected 49,300, χ² ≈ 19.9 (${chi2.toFixed(2)})`, expected === 49_300 && near(chi2, 19.9, 0.01) && /19\.9/.test(notes(id)));
  check(`${id}: ≈4.5 SD (${sdUnits.toFixed(2)})`, between(sdUnits, 4.4, 4.6));
  const cs = e2.rows.reduce((s, r) => s + num(r[1]!), 0);
  const ts = e2.rows.reduce((s, r) => s + num(r[2]!), 0);
  check(`${id}: platform split sums to topline`, cs === c && ts === t);
  check(`${id}: Android shortfall 1,500`, cell(e2, "Android", 1) - cell(e2, "Android", 2) === 1_500);
}
{
  const id = "da-readout-feed-novelty";
  const e1 = ex(id, "ex1");
  let cSum = 0;
  let tSum = 0;
  for (const r of e1.rows) {
    const c = num(r[1]!);
    const t = num(r[2]!);
    cSum += c;
    tSum += t;
    check(`${id}: ${r[0]} lift matches`, Math.abs(pct(t - c, c) - num(r[3]!)) < 0.06);
    const [lo, hi] = String(r[4]).split(" to ").map(num);
    check(`${id}: ${r[0]} CI centered on lift`, near((lo! + hi!) / 2, num(r[3]!), 0.02));
  }
  check(`${id}: pooled lift 3.8% (prompt)`, Math.abs(pct(tSum - cSum, cSum) - 3.75) < 0.01 && /3\.8%/.test(getAnalyticsQuestion(id)!.prompt));
  const e2 = ex(id, "ex2");
  for (const r of e2.rows) check(`${id}: ex2 ${String(r[0]).slice(0, 20)} lift matches`, Math.abs(pct(num(r[2]!) - num(r[1]!), num(r[1]!)) - num(r[3]!)) < 0.06);
}
{
  const id = "da-readout-free-shipping";
  const e1 = ex(id, "ex1");
  const oc = cell(e1, "Orders", 1);
  const ot = cell(e1, "Orders", 2);
  const ac = cell(e1, "Average", 1);
  const at = cell(e1, "Average", 2);
  const rc = cell(e1, "Revenue", 1);
  const rt = cell(e1, "Revenue", 2);
  const sc = cell(e1, "Shipping", 1);
  const st = cell(e1, "Shipping", 2);
  check(`${id}: revenue = orders × AOV`, near(oc * ac, rc) && near(ot * at, rt, 0.001));
  for (const r of e1.rows) check(`${id}: ${String(r[0]).slice(0, 18)} lift matches`, Math.abs(pct(num(r[2]!) - num(r[1]!), num(r[1]!)) - num(r[3]!)) < 0.06);
  const mc = 0.3 * rc - oc * sc;
  const mt = 0.3 * rt - ot * st;
  const change = pct(mt - mc, mc);
  check(`${id}: contribution $5.65 → $5.17 (${change.toFixed(1)}%)`, near(mc, 5.65) && near(mt, 5.17, 0.002) && between(change, -10, -7));
  check(`${id}: margin fact stated`, /30% of order value/.test(facts(id)));
  const e2 = ex(id, "ex2");
  const sig = e2.rows.filter((r) => num(r[2]!) < 0.05).length;
  check(`${id}: exactly 1 of 8 segments p < 0.05, none under Bonferroni 0.05/8`, e2.rows.length === 8 && sig === 1 && e2.rows.every((r) => num(r[2]!) > 0.05 / 8));
}
{
  const id = "da-readout-pvalue-peeking";
  const e = ex(id, "ex1");
  const pc = cell(e, "Control", 2) / cell(e, "Control", 1);
  const pt = cell(e, "Treatment", 2) / cell(e, "Treatment", 1);
  const se = Math.sqrt((pc * (1 - pc)) / cell(e, "Control", 1) + (pt * (1 - pt)) / cell(e, "Treatment", 1));
  const z = (pt - pc) / se;
  const lo = (pt - pc - 1.96 * se) * 100;
  const hi = (pt - pc + 1.96 * se) * 100;
  // two-sided normal p-value
  const erfc = (x: number) => {
    const t = 1 / (1 + 0.5 * Math.abs(x));
    const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? y : 2 - y;
  };
  const p = erfc(z / Math.SQRT2);
  check(`${id}: SE ≈ 0.47 pp (${(se * 100).toFixed(3)})`, between(se * 100, 0.46, 0.48));
  check(`${id}: z ≈ 2.14, p ≈ 0.03 (${z.toFixed(2)}, ${p.toFixed(3)})`, near(z, 2.14, 0.01) && between(p, 0.03, 0.035));
  check(`${id}: CI ≈ +0.1 to +1.9 pp (${lo.toFixed(2)}, ${hi.toFixed(2)})`, between(lo, 0.05, 0.15) && between(hi, 1.85, 1.95));
  check(`${id}: peeking fact present`, /stopped the test on day 9/.test(facts(id)) && /21 days/.test(facts(id)));
}
{
  const id = "da-diag-dau-drop";
  const e1 = ex(id, "ex1");
  const last = e1.rows.reduce((s, r) => s + num(r[1]!), 0);
  const now = e1.rows.reduce((s, r) => s + num(r[2]!), 0);
  check(`${id}: platforms sum to 10.0 → 9.2M (−8%)`, near(last, 10) && near(now, 9.2) && near(pct(now - last, last), -8));
  for (const r of e1.rows) check(`${id}: ${r[0]} change matches`, Math.abs(pct(num(r[2]!) - num(r[1]!), num(r[1]!)) - num(r[3]!)) < 0.06);
  const e2 = ex(id, "ex2");
  const counted = cell(e2, "5.2", 2) + cell(e2, "5.1", 2);
  const server = cell(e2, "5.2", 1) + cell(e2, "5.1", 1);
  check(`${id}: Android version rows sum to ex1 Android`, near(counted, cell(e1, "Android", 2)) && near(cell(e2, "All versions", 2), cell(e1, "Android", 1)));
  const oldRate = cell(e2, "All versions", 2) / cell(e2, "All versions", 1);
  const artifact = cell(e2, "5.2", 1) * oldRate - cell(e2, "5.2", 2);
  check(`${id}: server-side Android ≈ flat (${server} vs ${cell(e2, "All versions", 1)})`, between(pct(server - cell(e2, "All versions", 1), cell(e2, "All versions", 1)), -2, 0));
  check(`${id}: 5.2 counted at 75%`, near(cell(e2, "5.2", 2) / cell(e2, "5.2", 1), 0.75, 0.005));
  check(`${id}: artifact ≈0.67M (${artifact.toFixed(3)}) inside strong band`, between(artifact, 0.6, 0.75) && /0\.67M/.test(notes(id)));
}
{
  const id = "da-diag-checkout-funnel";
  const e1 = ex(id, "ex1");
  const r = e1.rows.map((x) => [num(x[1]!), num(x[2]!)] as const);
  for (let i = 1; i < r.length - 1; i++) check(`${id}: step ${i} conversion unchanged`, near(r[i]![0] / r[i - 1]![0], r[i]![1] / r[i - 1]![1], 0.001));
  check(`${id}: checkout → order 71.4% → 64.9%`, near(pct(r[4]![0], r[3]![0]), 71.43, 0.001) && near(pct(r[4]![1], r[3]![1]), 64.94, 0.001));
  check(`${id}: orders 500k → 450k match facts`, r[4]![0] === 500_000 && r[4]![1] === 450_000 && /450,000 orders/.test(facts(id)));
  const e2 = ex(id, "ex2");
  const sum = (col: number) => e2.rows.reduce((s, x) => s + num(x[col]!), 0);
  check(`${id}: payment methods sum to funnel`, sum(1) === r[3]![0] && sum(2) === r[4]![0] && sum(3) === r[3]![1] && sum(4) === r[4]![1]);
  check(`${id}: card 70.0% → 59.2%`, near(cell(e2, "Credit", 2) / cell(e2, "Credit", 1), 0.7) && near(cell(e2, "Credit", 4) / cell(e2, "Credit", 3), 0.592, 0.001));
  check(`${id}: Apple Pay and PayPal rates unchanged`, ["Apple", "PayPal"].every((m) => near(cell(e2, m, 2) / cell(e2, m, 1), cell(e2, m, 4) / cell(e2, m, 3), 0.001)));
  const lost = cell(e2, "Credit", 3) * 0.7 - cell(e2, "Credit", 4);
  check(`${id}: lost card orders 45,000 (${lost.toFixed(0)})`, near(lost, 45_000) && /45,000/.test(notes(id)));
  check(`${id}: revenue at stake ≈$288k`, near(lost * 32 * 0.2, 288_000) && /\$288k/.test(notes(id)));
}
{
  const id = "da-diag-signup-mix-shift";
  const e = ex(id, "ex1");
  const tot = (col: number) => e.rows.reduce((s, x) => s + num(x[col]!), 0);
  check(`${id}: 12% → 9%`, near(pct(tot(2), tot(1)), 12) && near(pct(tot(4), tot(3)), 9));
  for (const r of e.rows) check(`${id}: ${r[0]} conversion held or rose`, num(r[4]!) / num(r[3]!) >= num(r[2]!) / num(r[1]!));
  const mix = e.rows.reduce((s, r) => s + (num(r[1]!) / tot(1)) * (num(r[4]!) / num(r[3]!)), 0) * 100;
  check(`${id}: mix-adjusted ≈12.2% (${mix.toFixed(2)})`, between(mix, 12.0, 12.5));
  check(`${id}: paid share 10% → 43.75%`, near(pct(cell(e, "Paid", 1), tot(1)), 10) && near(pct(cell(e, "Paid", 3), tot(3)), 43.75));
}
{
  const id = "da-diag-session-length-up";
  const e1 = ex(id, "ex1");
  const avg = (col: number) => (cell(e1, "Used", col) + cell(e1, "Did not", col)) / 2;
  check(`${id}: 6.0 → 6.9 min (+15%)`, near(avg(1), 6) && near(avg(2), 6.9) && near(pct(avg(2) - avg(1), avg(1)), 15));
  const e2 = ex(id, "ex2");
  const change = pct(cell(e2, "Orders", 2) - cell(e2, "Orders", 1), cell(e2, "Orders", 1));
  check(`${id}: orders per session −10%`, near(change, -10));
  const lostOrders = ((cell(e2, "Orders", 1) - cell(e2, "Orders", 2)) / 100) * 2_000_000;
  check(`${id}: ≈8,000 lost orders/month, ≈$400k`, near(lostOrders, 8_000) && near(lostOrders * 50, 400_000));
}

// ---------------------------------------------------------------------------
console.log("\n4. Privacy");
for (const file of ["lib/analytics-interview/registration.ts", "lib/analytics-interview/live.ts", "lib/analytics-interview/evaluator.ts", "lib/analytics-interview/frameworks.ts", "lib/engine/registry.ts", "lib/interview/types.ts"]) {
  const src = readFileSync(file, "utf8");
  check(`${file} does not import the bank`, !/analytics-interview\/questions|from "\.\/questions"/.test(src));
}
check("banks.server.ts registers the bank", /ANALYTICS_BANK/.test(readFileSync("lib/problem-interview/banks.server.ts", "utf8")));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
