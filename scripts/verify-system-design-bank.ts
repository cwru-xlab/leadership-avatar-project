/**
 * System-design bank checks (no network).
 *
 *  1. Structure: ≥10 questions, unique ids, every family covered, every
 *     frameworkKey is a framework the type passes to the factory, exhibit ids
 *     unique per question, revealWhen / keyInsight present.
 *  2. Nudges: ≥12 characters (engine verbatim-fallback threshold), phrased as
 *     a spoken question/sentence, and never naming a step, the method, or an
 *     answer term.
 *  3. Math: recomputes every figure each `strongAnswerNotes` quotes FROM THE
 *     EXHIBIT CELLS (or the stated facts), and checks the notes quote it and
 *     state a TOLERANCE.
 *  4. Registration: the bank is the one banks.server.ts serves for the slug,
 *     and the registry builds the slug as a problem interview.
 *
 * Run: npx tsx scripts/verify-system-design-bank.ts
 */

import { getEngineType } from "../lib/engine/registry";
import { getProblemBank, selectProblemQuestion } from "../lib/problem-interview/banks.server";
import type { ProblemQuestion } from "../lib/problem-interview/types";
import { SD_FRAMEWORKS } from "../lib/system-design-interview/frameworks";
import { SD_INTERVIEW_SLUG } from "../lib/system-design-interview/live";
import { SD_BANK, SD_FAMILIES, getSdQuestion } from "../lib/system-design-interview/questions";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- structure
check("bank has ≥ 10 questions", SD_BANK.length >= 10, String(SD_BANK.length));
check("ids unique", new Set(SD_BANK.map((q) => q.id)).size === SD_BANK.length);
for (const family of SD_FAMILIES) {
  check(`family "${family}" covered`, SD_BANK.some((q) => q.family === family));
}
const fwKeys = new Set(SD_FRAMEWORKS.map((f) => f.key));
for (const q of SD_BANK) {
  check(`${q.id}: framework "${q.frameworkKey}" declared`, fwKeys.has(q.frameworkKey));
  const ids = (q.exhibits ?? []).map((e) => e.id);
  check(`${q.id}: exhibit ids unique`, new Set(ids).size === ids.length);
  for (const e of q.exhibits ?? []) {
    check(`${q.id}/${e.id}: revealWhen + keyInsight`, e.revealWhen.length > 10 && e.keyInsight.length > 10);
  }
  check(`${q.id}: states a TOLERANCE`, q.strongAnswerNotes.includes("TOLERANCE"));
}
const levels = new Set(SD_BANK.filter((q) => q.family === "system-design").map((q) => q.difficulty));
check("system-design family spans Beginner..Advanced", levels.has("Beginner") && levels.has("Intermediate") && levels.has("Advanced"));

// ------------------------------------------------------------------- nudges
const BANNED = [
  /framework/i, /structur/i, /\bsteps?\b/i, /hypothes/i, /clarif/i, /requirement/i, /estimat/i,
  /trade-?off/i, /bottleneck/i, /deep dive/i, /\bapi\b/i, /data model/i, /cach/i, /shard/i,
  /replic/i, /root cause/i, /mitigat/i, /postmortem/i, /remember to/i, /\bmece\b/i,
];
for (const fw of SD_FRAMEWORKS) {
  const keys = fw.steps.map((s) => s.key);
  check(`${fw.key}: step keys unique snake_case`, new Set(keys).size === keys.length && keys.every((k) => /^[a-z][a-z0-9_]*$/.test(k)));
  for (const step of fw.steps) {
    const n = step.nudge;
    check(`${fw.key}/${step.key}: nudge ≥ 12 chars, spoken`, n.length >= 12 && /[?.]$/.test(n), n);
    const hits = BANNED.filter((re) => re.test(n));
    check(`${fw.key}/${step.key}: nudge names no step/method/answer`, hits.length === 0, hits.join(","));
  }
}

// --------------------------------------------------------------------- math
/** "40 million" → 4e7, "3×" → 3, "500 bytes" → 500, "0.2%" → 0.2, "2,000" → 2000. */
function num(cell: string | number): number {
  if (typeof cell === "number") return cell;
  const m = cell.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*(thousand|million|billion)?/i);
  if (!m) throw new Error(`no number in "${cell}"`);
  const mult = { thousand: 1e3, million: 1e6, billion: 1e9 }[(m[2] ?? "").toLowerCase() as "thousand"] ?? 1;
  return Number(m[1]) * mult;
}
function cell(q: ProblemQuestion, exhibitId: string, rowLabel: string, col = 1): number {
  const ex = q.exhibits?.find((e) => e.id === exhibitId);
  const row = ex?.rows.find((r) => String(r[0]).toLowerCase().startsWith(rowLabel.toLowerCase()));
  if (!row) throw new Error(`${q.id}/${exhibitId}: no row "${rowLabel}"`);
  return num(row[col]!);
}
const DAY = 86_400;
function quotes(q: ProblemQuestion, label: string, computed: number, expectedText: string) {
  check(`${q.id}: ${label} = ${expectedText}`, q.strongAnswerNotes.includes(expectedText), `computed ${computed}`);
}
function near(q: ProblemQuestion, label: string, computed: number, stated: number, tol = 0.02) {
  check(`${q.id}: ${label} ≈ ${stated}`, Math.abs(computed - stated) / stated <= tol, `computed ${computed}`);
}

{
  const q = getSdQuestion("sd-url-shortener")!;
  const perDay = cell(q, "ex1", "New links per day");
  const ratio = cell(q, "ex1", "Redirects per new link");
  const peak = cell(q, "ex1", "Peak-to-average");
  const years = cell(q, "ex1", "Retention");
  const bytes = cell(q, "ex1", "Stored size");
  const w = perDay / DAY, r = w * ratio, records = perDay * 365 * years;
  near(q, "writes/s", w, 460); quotes(q, "writes/s", w, "≈ 460 writes/s");
  near(q, "reads/s", r, 11_600); quotes(q, "reads/s", r, "≈ 11,600 reads/s");
  near(q, "peak reads/s", r * peak, 35_000); quotes(q, "peak", r * peak, "≈ 35,000 reads/s");
  near(q, "records", records, 73e9); quotes(q, "records", records, "73 billion links");
  near(q, "storage TB", (records * bytes) / 1e12, 36.5); quotes(q, "storage", 36.5, "≈ 36.5 TB");
  near(q, "bandwidth MB/s", (r * bytes) / 1e6, 5.8); quotes(q, "bandwidth", 5.8, "≈ 5.8 MB/s");
  near(q, "62^6", 62 ** 6, 56.8e9); near(q, "62^7", 62 ** 7, 3.52e12);
  check(`${q.id}: 6 chars too few, 7 enough`, 62 ** 6 < records && 62 ** 7 > records);
}
{
  const q = getSdQuestion("sd-game-leaderboard")!;
  const dau = cell(q, "ex1", "Daily active"), mau = cell(q, "ex1", "Monthly active");
  const u = (dau * cell(q, "ex1", "Matches per")) / DAY;
  near(q, "updates/s", u, 580); quotes(q, "updates/s", u, "≈ 580 updates/s");
  near(q, "peak updates/s", u * cell(q, "ex1", "Peak-to-average"), 2_900, 0.02); quotes(q, "peak", 0, "≈ 2,900 updates/s");
  near(q, "reads/s", (dau * cell(q, "ex1", "Leaderboard views")) / DAY, 230, 0.02); quotes(q, "reads", 0, "≈ 230 reads/s");
  near(q, "memory GB", (mau * cell(q, "ex1", "Memory per")) / 1e9, 2.5); quotes(q, "memory", 0, "= 2.5 GB");
}
{
  const q = getSdQuestion("sd-api-rate-limiter")!;
  const keys = cell(q, "ex1", "Active API keys");
  const limit = cell(q, "ex1", "Default limit");
  near(q, "counter MB", (keys * cell(q, "ex1", "Memory per counter")) / 1e6, 50); quotes(q, "counter", 0, "= 50 MB");
  const log = (keys * limit * cell(q, "ex1", "Memory per stored")) / 1e6;
  near(q, "log MB", log, 800); quotes(q, "log", log, "= 800 MB (16× more)");
  near(q, "per-gateway limit", limit / cell(q, "ex1", "Gateway servers"), 2.5); quotes(q, "per gateway", 2.5, "= 2.5 requests/min");
  quotes(q, "peak checks", cell(q, "ex1", "Peak API"), "50,000 limit checks/s");
}
{
  const q = getSdQuestion("sd-notification-service")!;
  const total = cell(q, "ex1", "Push notifications") + cell(q, "ex1", "Text messages") + cell(q, "ex1", "Emails");
  near(q, "avg/s", total / DAY, 185); quotes(q, "avg", total / DAY, "≈ 185 notifications/s");
  near(q, "push peak", cell(q, "ex1", "Largest push") / 600, 3_300, 0.02); quotes(q, "push", 0, "≈ 3,300 per second");
  const sms = cell(q, "ex1", "Planned text"), lim = cell(q, "ex1", "SMS provider limit");
  near(q, "sms needed/s", sms / 3600, 139); near(q, "sms minutes", sms / lim / 60, 83, 0.01);
  check(`${q.id}: SMS campaign cannot finish in 1 hour`, sms / lim > 3600);
  quotes(q, "sms", 0, "≈ 83 minutes");
  near(q, "log TB", (total * 1e3 * cell(q, "ex1", "Delivery log retention")) / 1e12, 1.44); quotes(q, "log", 0, "≈ 1.44 TB");
}
{
  const q = getSdQuestion("sd-news-feed")!;
  const dau = cell(q, "ex1", "Daily active");
  const posts = dau * cell(q, "ex1", "Posts per");
  near(q, "posts/s", posts / DAY, 1_160, 0.01); quotes(q, "posts", 0, "≈ 1,160 posts/s");
  const reads = (dau * cell(q, "ex1", "Feed loads")) / DAY;
  near(q, "reads/s", reads, 23_000, 0.02); quotes(q, "reads", 0, "≈ 23,000 reads/s");
  near(q, "peak", reads * cell(q, "ex1", "Peak-to-average"), 46_000, 0.02);
  const fan = (posts * cell(q, "ex1", "Average followers")) / DAY;
  near(q, "fan-out/s", fan, 350_000, 0.02); quotes(q, "fan-out", fan, "≈ 350,000 feed inserts/s");
  near(q, "posts GB/day", (posts * 1e3) / 1e9, 100);
  near(q, "feed cache GB", (dau * cell(q, "ex1", "Post IDs kept") * cell(q, "ex1", "Bytes per post ID")) / 1e9, 800);
  quotes(q, "feed cache", 0, "= 800 GB");
}
{
  const q = getSdQuestion("sd-ticket-booking")!;
  const arrivals = cell(q, "ex1", "Fans arriving") / 600;
  near(q, "arrivals/s", arrivals, 3_300, 0.02); quotes(q, "arrivals", 0, "≈ 3,300 fans/s");
  near(q, "requests/s", arrivals * cell(q, "ex1", "Requests per fan"), 67_000, 0.01); quotes(q, "requests", 0, "≈ 67,000 requests/s");
  const orders = cell(q, "ex1", "Seats") / cell(q, "ex1", "Average tickets");
  near(q, "orders", orders, 12_500); quotes(q, "orders", orders, "= 12,500");
  near(q, "orders/s", orders / 600, 21, 0.01);
}
{
  const q = getSdQuestion("fd-threaded-comments")!;
  near(q, "writes/s", 30e6 / DAY, 350, 0.01); near(q, "reads/s", 500e6 / DAY, 5_800, 0.01);
  check(`${q.id}: facts carry 10 million / 3 / 50`, q.interviewerFacts.some((f) => /10 million.*3 comments.*50 comment/.test(f)));
}
{
  const q = getSdQuestion("fd-event-waitlist")!;
  near(q, "rsvps/s", 2000 / 60, 33, 0.02);
  check(`${q.id}: facts carry 2,000 / 200`, q.interviewerFacts.some((f) => f.includes("2,000")) && q.interviewerFacts.some((f) => f.includes("200 seats")));
}
{
  const q = getSdQuestion("fd-read-receipts")!;
  const msgs = cell(q, "ex1", "Daily active") * cell(q, "ex1", "Messages sent");
  const receipts = (msgs * (cell(q, "ex1", "Average chat size") - 1)) / DAY;
  near(q, "receipts/s", receipts, 83_000, 0.01); quotes(q, "receipts", 0, "≈ 83,000 receipts/s");
  const wm = (cell(q, "ex1", "Daily active") * cell(q, "ex1", "Chat opens")) / DAY;
  near(q, "watermark/s", wm, 6_900, 0.01); quotes(q, "watermark", 0, "≈ 6,900 updates/s");
  near(q, "ratio", receipts / wm, 12, 0.01);
}
{
  const q = getSdQuestion("inc-disk-full")!;
  const rates = ["api-1", "api-2", "api-3", "api-4"].map((h) => cell(q, "ex1", h));
  near(q, "overall error %", rates.reduce((a, b) => a + b, 0) / 4, 9.7, 0.01); quotes(q, "overall", 0, "≈ 9.7%");
  const before = cell(q, "ex2", "Disk used", 1), now = cell(q, "ex2", "Disk used", 2);
  const gb = ((now - before) / 100) * 200;
  near(q, "GB filled", gb, 78); quotes(q, "growth", gb, "= 78 GB");
  near(q, "GB/hour", gb / 9, 8.7, 0.01);
}
{
  const q = getSdQuestion("inc-checkout-latency")!;
  const extra = cell(q, "ex2", "Database queries", 2) - cell(q, "ex2", "Database queries", 1);
  check(`${q.id}: extra queries = 4 per item × 10 items`, extra === 40);
  near(q, "p99 ratio", cell(q, "ex1", "/checkout", 2) / cell(q, "ex1", "/checkout", 1), 11, 0.02);
  const budget = 0.001 * 30 * 24 * 60;
  near(q, "error budget minutes", budget, 43.2); quotes(q, "budget", budget, "= 43.2 minutes");
  check(`${q.id}: 45 minutes exceeds the budget`, 45 > budget);
}
{
  const q = getSdQuestion("inc-cache-stampede")!;
  const traffic = 50_000;
  const hit0 = cell(q, "ex1", "8:55", 1) / 100, hit1 = cell(q, "ex1", "9:00", 1) / 100;
  near(q, "db before", traffic * (1 - hit0), 2_000); near(q, "db after", traffic * (1 - hit1), 20_000);
  check(`${q.id}: exhibit DB qps matches hit rate`, cell(q, "ex1", "8:55", 2) === 2000 && cell(q, "ex1", "9:00", 2) === 20000);
  near(q, "over capacity", (traffic * (1 - hit1)) / 8_000, 2.5);
  quotes(q, "capacity", 0, "2.5× the database's 8,000/s capacity");
}

// ------------------------------------------------------------ registration
check("banks.server serves SD_BANK for the slug", getProblemBank(SD_INTERVIEW_SLUG) === SD_BANK);
const type = getEngineType(SD_INTERVIEW_SLUG) as { problemInterview?: { frameworks: { key: string }[] }; extraRubricDimensions: { key: string }[] } | null;
check("registry builds system-design as a problem interview", Boolean(type?.problemInterview));
check(
  "rubric dims: process_rigor once + technical_depth, tradeoff_reasoning, quantitative",
  JSON.stringify(type?.extraRubricDimensions.map((d) => d.key)) ===
    JSON.stringify(["process_rigor", "technical_depth", "tradeoff_reasoning", "quantitative"]),
);
for (const level of ["Beginner", "Intermediate", "Advanced"] as const) {
  const pick = selectProblemQuestion(SD_BANK, SD_FRAMEWORKS, { difficulty: level }, () => 0);
  check(`selection honors difficulty ${level}`, pick?.question.difficulty === level);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} — ${SD_BANK.length} questions`);
process.exit(failures === 0 ? 0 : 1);
