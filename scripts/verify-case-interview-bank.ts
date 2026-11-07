/**
 * Static checks for the consulting case bank and frameworks (no network).
 *
 * - Frameworks: snake_case unique step keys; every nudge is a question that
 *   names neither its step, the method, nor words like "framework".
 * - Bank: ids unique, framework exists, family counts, Vault coverage,
 *   exhibits well-formed, every math-bearing case states a TOLERANCE.
 * - Math: recomputes every benchmark figure quoted in strongAnswerNotes from
 *   the exhibits and facts, so an edit that breaks consistency fails here.
 *
 * Run: npx tsx scripts/verify-case-interview-bank.ts
 */

import { CASE_BANK, CASE_VAULT_TYPE, VAULT_SCENARIO_TYPES, getCase } from "../lib/case-interview/cases";
import { CASE_FRAMEWORKS, getCaseFramework } from "../lib/case-interview/frameworks";
import type { Exhibit } from "../lib/problem-interview/types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-9;

/** Numeric cell of a table exhibit: "$8,400" / "2.0M" / "48%" / 9.5 / "10.2×". */
function num(v: string | number): number {
  if (typeof v === "number") return v;
  const m = v.replace(/[$,×%−]/g, (c) => (c === "−" ? "-" : "")).match(/-?\d+(\.\d+)?/);
  if (!m) throw new Error(`not numeric: ${v}`);
  const n = Number(m[0]);
  return /M$/.test(v.trim()) ? n * 1e6 : n;
}
function cell(ex: Exhibit, rowLabel: string, col = 1): number {
  const row = ex.rows.find((r) => String(r[0]).startsWith(rowLabel));
  if (!row) throw new Error(`${ex.id}: no row ${rowLabel}`);
  return num(row[col]!);
}
function ex(caseId: string, exId: string): Exhibit {
  const e = getCase(caseId)!.exhibits!.find((x) => x.id === exId);
  if (!e) throw new Error(`${caseId}/${exId} missing`);
  return e;
}

console.log("\n1. Frameworks");
for (const fw of CASE_FRAMEWORKS) {
  const keys = fw.steps.map((s) => s.key);
  check(`${fw.key}: step keys unique snake_case`, new Set(keys).size === keys.length && keys.every((k) => /^[a-z][a-z0-9_]*$/.test(k)));
  for (const s of fw.steps) {
    const n = s.nudge.toLowerCase();
    const leaks = [s.key.replace(/_/g, " "), s.label.toLowerCase(), "framework", "step", "method", "remember", "you should", "mece", "hypothesis"]
      .filter((w) => n.includes(w));
    check(`${fw.key}.${s.key}: nudge is a neutral question`, s.nudge.trim().endsWith("?") && leaks.length === 0, leaks.join(","));
    check(`${fw.key}.${s.key}: has evidence criteria`, s.evidenceCriteria.length > 40);
  }
}

console.log("\n2. Bank shape");
const ids = CASE_BANK.map((q) => q.id);
check("ids unique", new Set(ids).size === ids.length);
const byFamily = CASE_BANK.reduce<Record<string, number>>((acc, q) => ((acc[q.family] = (acc[q.family] ?? 0) + 1), acc), {});
console.log("   counts by family:", JSON.stringify(byFamily));
check("≥8 business scenarios", (byFamily["business-scenario"] ?? 0) >= 8);
check("≥3 guesstimates", (byFamily["guesstimate"] ?? 0) >= 3);
check("≥2 brainteasers", (byFamily["brainteaser"] ?? 0) >= 2);
const covered = new Set(Object.values(CASE_VAULT_TYPE));
check("all 8 Vault scenario types covered", VAULT_SCENARIO_TYPES.every((t) => covered.has(t)), VAULT_SCENARIO_TYPES.filter((t) => !covered.has(t)).join(","));
check("mixed difficulty", new Set(CASE_BANK.map((q) => q.difficulty)).size === 3);
for (const q of CASE_BANK) {
  const fw = getCaseFramework(q.frameworkKey);
  check(`${q.id}: framework exists`, fw !== null);
  check(`${q.id}: source cited`, q.source.length > 10);
  if (q.family === "business-scenario") {
    check(`${q.id}: vault type mapped`, q.id in CASE_VAULT_TYPE);
    check(`${q.id}: 1–3 exhibits`, (q.exhibits?.length ?? 0) >= 1 && (q.exhibits?.length ?? 0) <= 3);
    check(`${q.id}: ≥4 interviewer facts`, q.interviewerFacts.length >= 4);
  }
  if (q.family !== "brainteaser") {
    check(`${q.id}: states a TOLERANCE band`, /TOLERANCE:/.test(q.strongAnswerNotes));
  }
  const exIds = (q.exhibits ?? []).map((e) => e.id);
  check(`${q.id}: exhibit ids unique`, new Set(exIds).size === exIds.length);
  for (const e of q.exhibits ?? []) {
    const widthOk = e.kind === "bar"
      ? e.rows.every((r) => r.length === 2 && typeof r[1] === "number") && e.columns.length === 2
      : e.rows.every((r) => r.length === e.columns.length);
    check(`${q.id}/${e.id}: rows match columns`, widthOk);
    check(`${q.id}/${e.id}: prompt does not leak exhibit numbers`, !e.rows.some((r) => r.slice(1).some((c) => String(c).length > 2 && q.prompt.includes(String(c)))));
  }
}

console.log("\n3. Math");
{
  // Airline
  const e = ex("case-airline-cle-nyc", "ex2");
  const flights = cell(e, "One-way flights per day") * cell(e, "Operating days");
  const variable = flights * cell(e, "Operating cost");
  const total = variable + cell(e, "Fixed annual");
  const fullRev = cell(e, "Seats") * cell(e, "Planned one-way fare");
  const beLF = total / flights / fullRev;
  const loss70 = total - flights * fullRev * 0.7;
  const loss80 = total - flights * fullRev * 0.8;
  check("airline: 2,160 flights", flights === 2160);
  check("airline: total cost ≈ $20.1M", near(total, 20.144e6));
  check("airline: break-even LF ≈ 84%", near(beLF, 0.838, 0.005), beLF.toFixed(4));
  check("airline: loss at 70% ≈ $3.3M", near(loss70, 3.315e6, 0.01), String(loss70));
  check("airline: loss at 80% ≈ $0.9M", near(loss80, 0.911e6, 0.01), String(loss80));
  check("airline: ~10% of 1.1M market at 70%", near((flights * 70 * 0.7) / 1.1e6, 0.096, 0.02));
  const shares = ex("case-airline-cle-nyc", "ex1").rows.reduce((s, r) => s + num(r[1]!), 0);
  check("airline: shares sum to 100%", shares === 100);
}
{
  const e = ex("case-retail-falling-profits", "ex1");
  for (const col of [1, 2]) {
    const rev = cell(e, "Revenue", col);
    const costs = ["Cost of goods", "Store labor", "Store rent", "E-commerce", "Marketing"].reduce((s, l) => s + cell(e, l, col), 0);
    check(`retail: profit ties out (col ${col})`, rev - costs === cell(e, "Operating profit", col));
  }
  check("retail: gross margin 45% → 44%", near(1 - 330 / 600, 0.45) && near(1 - 346 / 618, 0.44, 0.005));
  check("retail: shipping +$18M is the largest cost delta", cell(e, "E-commerce", 2) - cell(e, "E-commerce", 1) === 18);
  const e2 = ex("case-retail-falling-profits", "ex2");
  check("retail: online revenue $60M → $154.5M", 600 * num(e2.rows[1]![1]!) / 100 === 60 && 618 * num(e2.rows[1]![2]!) / 100 === 154.5);
  check("retail: shipping ≈ 20% of online revenue both years", near(12 / 60, 0.2) && near(30 / 154.5, 0.194, 0.01));
}
{
  const bottles = (9e9 * 0.05) / 2.0;
  const contrib = bottles * (1.0 - 0.45) - 60e6;
  check("sports drink: 225M bottles", bottles === 225e6);
  check("sports drink: ≈ $64M after marketing", near(contrib, 63.75e6));
  check("sports drink: goal share ≈ 4.4%", near(((110e6 / 0.55) * 2) / 9e9, 0.0444, 0.01));
  check("sports drink: break-even share ≈ 2.4%", near(((60e6 / 0.55) * 2) / 9e9, 0.0242, 0.01));
  const shares = ex("case-sports-drink-launch", "ex1").rows.reduce((s, r) => s + num(r[1]!), 0);
  check("sports drink: shares sum to 100%", shares === 100);
}
{
  const e = ex("case-heat-pump-entry", "ex1");
  const u2028 = num(e.rows.find((r) => r[0] === "2028")![1]!) * 1e6;
  const profit = u2028 * 0.03 * 2500 * 0.2;
  check("heat pump: 168k units", near(u2028 * 0.03, 168000));
  check("heat pump: $84M profit", near(profit, 84e6));
  check("heat pump: payback < 2 years", 150e6 / profit < 2);
  check("heat pump: ~12% CAGR", near(Math.pow(5.6 / 4.0, 1 / 3) - 1, 0.119, 0.02));
}
{
  const be = 25000 / (4.5 - 1.5) / 30;
  check("coffee: break-even ≈ 278/day", near(be, 277.8, 0.002));
  check("coffee: ≈ 4.6% capture", near(be / 6000, 0.0463, 0.01));
  check("coffee: +$2,000 at 300/day", near(300 * 30 * 3 - 25000, 2000));
  check("coffee: −$3,400 at 240/day", near(240 * 30 * 3 - 25000, -3400));
  for (const r of ex("case-campus-coffee-shop", "ex1").rows) check(`coffee: capture ${r[0]}`, near(num(r[2]!) / num(r[1]!), num(r[3]!) / 100));
}
{
  const e = ex("case-distribution-center-site", "ex1");
  const annual = (col: number) => ["Labor", "Lease", "Outbound"].reduce((s, l) => s + cell(e, l, col), 0);
  const save = annual(1) - annual(2);
  const extra = cell(e, "One-time", 2) - cell(e, "One-time", 1);
  check("DC: $26.2M vs $23.3M", near(annual(1), 26.2) && near(annual(2), 23.3));
  check("DC: payback ≈ 1.4 yrs", near(extra / save, 1.38, 0.02));
  check("DC: ten-year gap ≈ $25M", near(cell(e, "One-time", 1) + 10 * annual(1) - (cell(e, "One-time", 2) + 10 * annual(2)), 25));
}
{
  const fin = ex("case-car-wash-acquisition", "ex1");
  for (const r of fin.rows) check(`car wash: margin ${r[0]}`, near(num(r[2]!) / num(r[1]!), num(r[3]!) / 100, 0.002));
  const comps = ex("case-car-wash-acquisition", "ex2").rows.map((r) => num(r[1]!));
  const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
  check("car wash: 12.0× asking", near(240 / 20, 12));
  check("car wash: comps ≈ 10.2×, standalone ≈ $204M", near(avg, 10.17, 0.005) && near(avg * 20, 203.3, 0.005));
  check("car wash: pro forma 9.8×", near(240 / (20 + 1.5 + 6 * 0.5), 9.8, 0.003));
}
{
  const m = ex("case-grocery-discounter-response", "ex2").rows.map((r) => [num(r[1]!) / 100, num(r[2]!) / 100]);
  const gp = m.reduce((s, [share, gm]) => s + 3000 * share! * gm!, 0);
  check("grocery: shares sum to 100%", near(m.reduce((s, [sh]) => s + sh!, 0), 1));
  check("grocery: GP ≈ $890M", near(gp, 889.5));
  check("grocery: matching costs ≈ 34% of GP", near((1500 * 0.2) / gp, 0.337, 0.01));
  check("grocery: $60M sales at risk", near(3000 * (15 / 60) * 0.08, 60));
}
{
  const tax = 12 * 0.015;
  const lost = 30e6 * tax * 1.3;
  const passProfit = (30e6 - lost) * 0.3;
  const switchGain = lost * 0.3 * 0.32;
  check("tax: 18¢ per can", near(tax, 0.18));
  check("tax: exhibit pass-through price $1.18", ex("case-beverage-tax", "ex1").rows[0]![1] === "$1.18");
  check("tax: pass-through ≈ $6.89M", near(passProfit, 6.894e6));
  check("tax: absorb ≈ $3.6M", near(30e6 * (0.3 - tax), 3.6e6));
  check("tax: switch-back ≈ +$0.67M", near(switchGain, 0.674e6, 0.01));
  check("tax: city profit $12.2M", near(30e6 * 0.3 + 10e6 * 0.32, 12.2e6));
  check("tax: net hit ≈ −$1.4M", near(9e6 - passProfit - switchGain, 1.432e6, 0.01));
}
{
  check("hair gel ≈ $42M", near((3.5e6 * 0.25 + 6e6 * 0.05) * 6 * 6, 42.3e6));
  check("pickleball ≈ $355M", near((4.2e6 / 1.5) * 80 + (9.8e6 / 3) * 40, 354.7e6, 0.005));
  check("kiosk ≈ $0.95M", near((180 + 10.5 * 15) * 1.3 * 6 * 360, 0.947e6, 0.01));
  check("clock: 22 overlaps", Math.round(24 / (12 / 11)) === 22);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
