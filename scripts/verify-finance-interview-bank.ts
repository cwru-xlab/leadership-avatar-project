/**
 * Static checks for the finance interview bank and frameworks (no network).
 *
 * - Frameworks: unique snake_case step keys; every nudge is a question that
 *   names neither its step, its label, the method, nor coaching words.
 * - Bank: ids unique, framework exists and is declared by the registered
 *   type, family minimums (≥4 technicals, ≥3 paper LBOs with exhibits, ≥2
 *   stock pitches, ≥2 market/deal), exhibits well-formed, every question
 *   states a TOLERANCE.
 * - Math: recomputes every benchmark figure quoted in strongAnswerNotes from
 *   the exhibits and facts — every paper LBO's entry, paydown, exit equity,
 *   MOIC and IRR, and checks that the quoted benchmarks sit inside their own
 *   tolerance bands.
 * - Privacy: the engine registry's import graph never reaches the bank.
 *
 * Run: npx tsx scripts/verify-finance-interview-bank.ts
 */

import { readFileSync } from "node:fs";

import { getEngineType } from "../lib/engine/registry";
import { FINANCE_FRAMEWORKS } from "../lib/finance-interview/frameworks";
import { FINANCE_INTERVIEW_SLUG } from "../lib/finance-interview/live";
import { FINANCE_BANK, getFinanceQuestion } from "../lib/finance-interview/questions";
import { getProblemBank } from "../lib/problem-interview/banks.server";
import type { Exhibit } from "../lib/problem-interview/types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-9;
const within = (v: number, lo: number, hi: number) => v >= lo - 1e-9 && v <= hi + 1e-9;
const irr = (moic: number, years: number) => Math.pow(moic, 1 / years) - 1;

/** Numeric cell: "$50M" → 50, "8.0×" → 8, "50%" → 0.5 when pct, "100M" → 100. */
function num(v: string | number, pct = false): number {
  if (typeof v === "number") return v;
  const m = v.replace(/[$,×]/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) throw new Error(`not numeric: ${v}`);
  const n = Number(m[0]);
  return pct || v.trim().endsWith("%") ? n / 100 : n;
}
function cell(e: Exhibit, rowLabel: string, col = 1): number {
  const row = e.rows.find((r) => String(r[0]).startsWith(rowLabel));
  if (!row) throw new Error(`${e.id}: no row ${rowLabel}`);
  return num(row[col]!);
}
function ex(questionId: string, exId: string): Exhibit {
  const e = getFinanceQuestion(questionId)?.exhibits?.find((x) => x.id === exId);
  if (!e) throw new Error(`${questionId}/${exId} missing`);
  return e;
}
const notes = (id: string) => getFinanceQuestion(id)!.strongAnswerNotes;
/** The notes must quote this figure (as written, e.g. "$1,170M" or "2.5×"). */
function quotes(id: string, text: string) {
  check(`${id}: notes quote "${text}"`, notes(id).includes(text));
}

console.log("\n1. Frameworks");
const BANNED = ["framework", "step", "method", "remember", "you should", "assumption", "catalyst", "thesis", "irr", "moic", "sources and uses", "tie out", "ties out", "intuition"];
for (const fw of FINANCE_FRAMEWORKS) {
  const keys = fw.steps.map((s) => s.key);
  check(`${fw.key}: step keys unique snake_case`, new Set(keys).size === keys.length && keys.every((k) => /^[a-z][a-z0-9_]*$/.test(k)));
  for (const s of fw.steps) {
    const n = s.nudge.toLowerCase();
    const leaks = [s.key.replace(/_/g, " "), s.label.toLowerCase(), ...BANNED].filter((w) => n.includes(w));
    check(`${fw.key}.${s.key}: nudge is a neutral question`, s.nudge.trim().endsWith("?") && leaks.length === 0, leaks.join(","));
    check(`${fw.key}.${s.key}: has evidence criteria`, s.evidenceCriteria.length > 60);
  }
}

console.log("\n2. Bank shape and registration");
const ids = FINANCE_BANK.map((q) => q.id);
check("ids unique", new Set(ids).size === ids.length);
check("≥ 12 questions", FINANCE_BANK.length >= 12, String(FINANCE_BANK.length));
const fam = (f: string) => FINANCE_BANK.filter((q) => q.family === f);
check("≥ 4 technical walk-throughs", fam("technical-walkthrough").length >= 4);
check("≥ 3 paper LBOs, each with exhibits", fam("paper-lbo").length >= 3 && fam("paper-lbo").every((q) => (q.exhibits?.length ?? 0) > 0));
check("≥ 2 stock pitches", fam("stock-pitch").length >= 2);
check("≥ 2 market / deal discussions", fam("market-deal").length >= 2);
const fwKeys = new Set(FINANCE_FRAMEWORKS.map((f) => f.key));
const type = getEngineType(FINANCE_INTERVIEW_SLUG);
check("finance is registered in the engine as a problem interview", Boolean(type?.problemInterview));
const declared = new Set(type?.problemInterview?.frameworks.map((f) => f.key) ?? []);
check("server bank registry resolves finance → FINANCE_BANK", getProblemBank(FINANCE_INTERVIEW_SLUG) === FINANCE_BANK);
check("registered type declares process_rigor, technical_accuracy, commercial_judgment",
  ["process_rigor", "technical_accuracy", "commercial_judgment"].every((k) => type?.extraRubricDimensions.some((d) => d.key === k)));
for (const q of FINANCE_BANK) {
  check(`${q.id}: framework exists and is declared`, fwKeys.has(q.frameworkKey) && declared.has(q.frameworkKey));
  check(`${q.id}: states a TOLERANCE`, q.strongAnswerNotes.includes("TOLERANCE"));
  check(`${q.id}: has a source`, q.source.length > 20);
  for (const e of q.exhibits ?? []) {
    const widthOk = e.kind === "bar" ? e.rows.every((r) => r.length === 2 && typeof r[1] === "number") : e.rows.every((r) => r.length === e.columns.length);
    check(`${q.id}/${e.id}: well-formed ${e.kind}`, widthOk && e.revealWhen.length > 10 && e.keyInsight.length > 20);
  }
  const exIds = (q.exhibits ?? []).map((e) => e.id);
  check(`${q.id}: exhibit ids unique`, new Set(exIds).size === exIds.length);
}

console.log("\n3. Math — technicals");
{
  // $10 depreciation at 25%.
  const t = 0.25;
  const ni = -10 * (1 - t);
  const cash = ni + 10;
  check("depreciation: NI −7.50, cash +2.50, assets −7.50 = equity −7.50", near(ni, -7.5) && near(cash, 2.5) && near(cash - 10, ni));
  quotes("fin-tech-depreciation-10", "net income down $7.50");
  // Debt-funded PP&E, year 1.
  const ni1 = -(10 + 5) * (1 - t);
  const cash1 = ni1 + 10;
  check("debt PP&E: NI −11.25, cash −1.25, assets +88.75 = L+E", near(ni1, -11.25) && near(cash1, -1.25) && near(90 + cash1, 100 + ni1));
  quotes("fin-tech-debt-funded-ppe", "+$88.75");
  const ni40 = -(15) * 0.6;
  check("debt PP&E alt at 40%: NI −9, cash +1, assets +91", near(ni40, -9) && near(ni40 + 10, 1) && near(90 + ni40 + 10, 91));
  // EV bridge.
  const e = ex("fin-tech-ev-bridge", "ex1");
  const eq = cell(e, "Share price") * cell(e, "Diluted shares");
  const ev = eq + cell(e, "Total debt") + cell(e, "Preferred") + cell(e, "Noncontrolling") - cell(e, "Cash");
  check(`EV bridge: equity ${eq}, EV ${ev}, ${ev / cell(e, "LTM EBITDA")}×`, eq === 2000 && ev === 2500 && ev / cell(e, "LTM EBITDA") === 10);
  check("EV bridge: strong band 2,450–2,550 contains benchmark", within(ev, 2450, 2550));
  // DCF terminal value.
  const tv = (100 * 1.03) / (0.09 - 0.03);
  const pv = tv / Math.pow(1.09, 5);
  check(`DCF: TV ${tv.toFixed(1)} ≈ 1,717; PV ${pv.toFixed(1)} ≈ 1,116`, near(tv, 1717, 0.001) && near(pv, 1116, 0.001));
  check("DCF: benchmark inside strong bands", within(tv, 1600, 1800) && within(pv, 1000, 1250));
  check("DCF: the no-step-up shortcut (1,667) sits inside the band; WACC-only (1,111) does not", within(100 / 0.06, 1600, 1800) && !within(100 / 0.09, 1600, 1800));
  // Comps.
  const c = ex("fin-tech-comps-valuation", "ex1");
  const mults = c.rows.map((r) => num(r[1]!)).sort((a, b) => a - b);
  const median = (mults[1]! + mults[2]!) / 2;
  const mean = mults.reduce((a, b) => a + b, 0) / mults.length;
  const evC = median * 120;
  check(`comps: median ${median}× mean ${mean}× → EV ${evC}, equity ${evC - 300}, $${(evC - 300) / 45}/sh`, median === 10 && mean === 10 && evC === 1200 && (evC - 300) / 45 === 20);
  check("comps: range EV 1,020–1,380", near(mults[0]! * 120, 1020) && near(mults[3]! * 120, 1380));
}

console.log("\n4. Math — paper LBOs");
{
  // Quick LBO.
  const e = ex("fin-lbo-quick-five-minute", "ex1");
  const entry = cell(e, "LTM EBITDA") * cell(e, "Entry multiple");
  const debt = entry * 0.5;
  const equity = entry - debt;
  const exitEv = cell(e, "Year-5 EBITDA") * cell(e, "Exit multiple");
  const exitEq = exitEv - (debt - cell(e, "Cumulative debt paydown"));
  const moic = exitEq / equity;
  const r = irr(moic, cell(e, "Holding period"));
  check(`quick LBO: entry ${entry}, equity ${equity}, exit equity ${exitEq}, MOIC ${moic}, IRR ${(r * 100).toFixed(1)}%`, entry === 400 && equity === 200 && exitEq === 500 && moic === 2.5 && near(r, 0.201, 0.01));
  check("quick LBO: benchmark inside strong band (MOIC 2.4–2.6, IRR 18–22%)", within(moic, 2.4, 2.6) && within(r, 0.18, 0.22));
  check("quick LBO: (MOIC−1)/years = 30% is outside the acceptable band", !within((moic - 1) / 5, 0.16, 0.24));
  quotes("fin-lbo-quick-five-minute", "MOIC = 500 / 200 = 2.5×");
}
{
  // Harbor Foods.
  const id = "fin-lbo-harbor-foods";
  const terms = ex(id, "ex1");
  const proj = ex(id, "ex2").rows.map((r) => Number(r[1]));
  const ltm = cell(terms, "LTM EBITDA");
  const entry = ltm * cell(terms, "Entry multiple");
  const debt = ltm * cell(terms, "Debt");
  const equity = entry - debt;
  const interest = debt * cell(terms, "Interest rate");
  const fcf = proj.map((ebitda) => (ebitda - 10 - interest) * 0.75); // capex = D&A = 10, tax 25%
  const paydown = fcf.reduce((a, b) => a + b, 0);
  const exitEv = proj[proj.length - 1]! * cell(terms, "Exit multiple");
  const exitEq = exitEv - (debt - paydown);
  const moic = exitEq / equity;
  const r = irr(moic, cell(terms, "Holding period"));
  check(`Harbor: FCF ${fcf.join(", ")} = ${paydown}`, paydown === 270 && fcf.join() === "39,46.5,54,61.5,69");
  check(`Harbor: entry ${entry}, debt ${debt}, equity ${equity}, interest ${interest}`, entry === 1000 && debt === 600 && equity === 400 && interest === 48);
  check(`Harbor: exit EV ${exitEv}, exit equity ${exitEq}, MOIC ${moic.toFixed(3)}, IRR ${(r * 100).toFixed(1)}%`, exitEv === 1500 && exitEq === 1170 && near(moic, 2.925) && near(r, 0.239, 0.01));
  check("Harbor: benchmark inside strong band (paydown 250–290, equity 1,130–1,210, MOIC 2.8–3.0, IRR 22–26%)",
    within(paydown, 250, 290) && within(exitEq, 1130, 1210) && within(moic, 2.8, 3.0) && within(r, 0.22, 0.26));
  // Named errors land outside the acceptable band.
  const noInterest = proj.map((x) => (x - 10) * 0.75).reduce((a, b) => a + b, 0);
  const noInterestMoic = (exitEv - (debt - noInterest)) / equity;
  check(`Harbor: ignoring interest → MOIC ${noInterestMoic.toFixed(2)} outside acceptable 2.6–3.2`, !within(noInterestMoic, 2.6, 3.2));
  check("Harbor: not subtracting debt → MOIC 3.75 outside acceptable", !within(exitEv / equity, 2.6, 3.2));
  check("Harbor: IRR as MOIC ÷ years (58%) outside acceptable 20–28%", !within(moic / 5, 0.2, 0.28));
  check("Harbor: value bridge — growth 500 + paydown 270 = 770 = exit equity − entry equity", (150 - ltm) * 10 + paydown === exitEq - equity);
  quotes(id, "$1,170M");
  quotes(id, "IRR ≈ 24%");
}
{
  // Crestline.
  const id = "fin-lbo-crestline-multiple-contraction";
  const t = ex(id, "ex1");
  const ltm = cell(t, "LTM EBITDA");
  const entry = ltm * cell(t, "Entry multiple");
  const debt = ltm * cell(t, "Debt");
  const equity = entry - debt + 40; // fees funded with equity
  const g = num(t.rows.find((r) => r[0] === "EBITDA growth")![1]!, true);
  const years = cell(t, "Holding period");
  const ebitda = Array.from({ length: years }, (_, i) => ltm * Math.pow(1 + g, i + 1));
  const paydown = ebitda.reduce((a, x) => a + 0.35 * x, 0);
  const exitEbitda = ebitda[years - 1]!;
  const exitEv = exitEbitda * cell(t, "Exit multiple");
  const exitEq = exitEv - (debt - paydown);
  const moic = exitEq / equity;
  const r = irr(moic, years);
  check(`Crestline: entry ${entry}, equity ${equity}, exit EBITDA ${exitEbitda.toFixed(1)}, paydown ${paydown.toFixed(1)}`,
    entry === 2400 && equity === 1440 && near(exitEbitda, 243.1, 0.001) && near(paydown, 316.8, 0.002));
  check(`Crestline: exit EV ${exitEv.toFixed(0)}, exit equity ${exitEq.toFixed(0)}, MOIC ${moic.toFixed(3)}, IRR ${(r * 100).toFixed(1)}%`,
    near(exitEv, 2431, 0.001) && near(exitEq, 1748, 0.001) && near(moic, 1.21, 0.01) && near(r, 0.05, 0.02));
  check("Crestline: benchmark inside strong band (paydown 290–340, MOIC 1.15–1.30, IRR 4–7%)",
    within(paydown, 290, 340) && within(moic, 1.15, 1.3) && within(r, 0.04, 0.07));
  const m12 = (exitEbitda * 12 - (debt - paydown)) / equity;
  check(`Crestline: flat 12× exit → MOIC ${m12.toFixed(2)} ≈ 1.55, IRR ${(irr(m12, years) * 100).toFixed(1)}% ≈ 12% (a material error as the base case)`,
    near(m12, 1.55, 0.01) && near(irr(m12, years), 0.116, 0.02) && !within(irr(m12, years), 0.025, 0.08));
  check(`Crestline: contraction destroys ≈ $486M (2 turns × 243)`, near(2 * exitEbitda, 486, 0.001));
  const noFees = exitEq / (entry - debt);
  check(`Crestline: missing fees (MOIC ${noFees.toFixed(3)}) stays inside acceptable 1.1–1.35`, within(noFees, 1.1, 1.35));
  quotes(id, "$1,440M");
  quotes(id, "IRR ≈ 5%");
}

console.log("\n5. Math — stock pitch and deals");
{
  const id = "fin-pitch-cobalt-trail";
  const e = ex(id, "ex1");
  const price = cell(e, "Share price");
  const shares = cell(e, "Shares outstanding");
  const consensus = cell(e, "Consensus EPS");
  check("Cobalt: P/E 16× = 48 / 3.00", near(price / consensus, cell(e, "P/E")));
  const mixUplift = ((0.35 - 0.25) / 0.05) * 0.01 * 2000 * 0.75; // $M after tax
  const ni = consensus * shares + mixUplift;
  const sharesAfter = shares - 150 / price;
  const eps = ni / sharesAfter;
  const target = cell(e, "Peer median P/E") * eps;
  check(`Cobalt: uplift $${mixUplift}M → EPS ${eps.toFixed(3)} ≈ 3.40; target $${target.toFixed(1)}; upside ${((target / price - 1) * 100).toFixed(1)}%`,
    near(mixUplift, 30) && near(eps, 3.4, 0.005) && near(target, 61.3, 0.01) && within(target / price - 1, 0.25, 0.3));
  check("Cobalt: target inside strong band $55–68, EPS inside $3.25–3.50", within(target, 55, 68) && within(eps, 3.25, 3.5));
  check("Cobalt: bear case 2.70 × 14 ≈ $38 (−21%)", near(2.7 * 14, 37.8) && near(2.7 * 14 / price - 1, -0.2125, 0.01));
}
{
  const id = "fin-deal-accretion-dilution";
  const e = ex(id, "ex1");
  const acqNi = num(e.rows.find((r) => r[0] === "Net income")![1]!);
  const tgtNi = num(e.rows.find((r) => r[0] === "Net income")![2]!);
  const price = num(e.rows.find((r) => String(r[0]).startsWith("Purchase"))![2]!);
  const sp = num(e.rows.find((r) => r[0] === "Share price")![1]!);
  const sh = num(e.rows.find((r) => r[0] === "Shares outstanding")![1]!);
  const eps0 = acqNi / sh;
  const epsStock = (acqNi + tgtNi) / (sh + price / sp);
  const epsDebt = (acqNi + tgtNi - price * 0.06 * 0.75) / sh;
  check(`accretion: base ${eps0}, stock ${epsStock.toFixed(3)} (+${((epsStock / eps0 - 1) * 100).toFixed(1)}%), debt ${epsDebt.toFixed(3)} (+${((epsDebt / eps0 - 1) * 100).toFixed(1)}%)`,
    eps0 === 2.5 && near(epsStock, 2.627, 0.001) && near(epsDebt, 2.695, 0.001));
  check("accretion: inside strong bands (stock 2.60–2.65, debt 2.68–2.72)", within(epsStock, 2.6, 2.65) && within(epsDebt, 2.68, 2.72));
  const preTax = (acqNi + tgtNi - price * 0.06) / sh;
  check(`accretion: pre-tax interest error (${preTax.toFixed(3)}) is outside the debt band`, !within(preTax, 2.68, 2.72));
  check("accretion: yields — stock 5%, debt 4.5%, target 6.67%", near(1 / (sp / eps0), 0.05) && near(0.06 * 0.75, 0.045) && near(tgtNi / price, 0.0667, 0.01));
  check("accretion: debt leverage 900 / 450 = 2×", price / 450 === 2);
}
{
  check("rates: 6× at 5% = 30% of EBITDA (3.3× coverage); at 9% = 54% (1.9×)", near(6 * 0.05, 0.3) && near(6 * 0.09, 0.54) && near(1 / 0.54, 1.85, 0.01));
  check("rates: max leverage at 2× coverage — 9% → 5.56×, 5% → 10×", near(1 / (2 * 0.09), 5.56, 0.002) && near(1 / (2 * 0.05), 10));
  check("deal hypothetical: 3,000 / 150 = 20×; with $60M synergies 14.3×", 3000 / 150 === 20 && near(3000 / 210, 14.29, 0.001) && within(3000 / 210, 14, 14.5));
}

console.log("\n6. Privacy — the bank stays server-side");
{
  const registry = readFileSync("lib/engine/registry.ts", "utf8");
  const registration = readFileSync("lib/finance-interview/registration.ts", "utf8");
  const live = readFileSync("lib/finance-interview/live.ts", "utf8");
  const types = readFileSync("lib/interview/types.ts", "utf8");
  const noBank = (src: string) => !/finance-interview\/questions|from "\.\/questions"/.test(src);
  check("registry, registration, live copy and interview types never import the bank", [registry, registration, live, types].every(noBank));
  check("registration passes no `bank` to the factory", !/\bbank\s*:/.test(registration));
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
