/**
 * Deterministic checks on the PM interview content: bank coverage per family,
 * framework references, exhibit arithmetic, nudge neutrality, and the
 * product-management slug's registration everywhere the presets are listed.
 *
 * Run: npx tsx scripts/verify-pm-interview-bank.ts   (no network)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PM_FRAMEWORKS } from "../lib/pm-interview/frameworks";
import { PM_QUESTION_BANK } from "../lib/pm-interview/questions";
import { PM_INTERVIEW_SLUG, PM_RUBRIC_EXTRAS } from "../lib/pm-interview/prompts";
import { getInterviewType, listInterviewTypes } from "../lib/interview/types";
import { getEngineType } from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import { INTERVIEW_TYPE_SLUGS } from "../lib/report/filters";
import { typeLabelForReport } from "../lib/report/title";
import { PROCESS_RIGOR_DIMENSION } from "../lib/problem-interview/types";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("1. Bank coverage");
const byFamily = (f: string) => PM_QUESTION_BANK.filter((q) => q.family === f);
check("≥6 product-design", byFamily("product-design").length >= 6, String(byFamily("product-design").length));
check("≥4 product-improvement", byFamily("product-improvement").length >= 4);
check("≥4 metrics-execution", byFamily("metrics-execution").length >= 4);
check(
  "≥2 metric-drop questions with exactly one exhibit",
  byFamily("metrics-execution").filter((q) => (q.exhibits ?? []).length === 1).length >= 2,
);
check("≥3 estimation", byFamily("estimation").length >= 3);
check("≥3 strategy", byFamily("strategy").length >= 3);
check(
  "mixed difficulty",
  new Set(PM_QUESTION_BANK.map((q) => q.difficulty)).size === 3,
);
check("unique ids", new Set(PM_QUESTION_BANK.map((q) => q.id)).size === PM_QUESTION_BANK.length);
for (const q of PM_QUESTION_BANK) {
  check(`${q.id}: framework exists`, Boolean(PM_FRAMEWORKS[q.frameworkKey]), q.frameworkKey);
  check(`${q.id}: has source, notes and facts`, q.source.length > 20 && q.strongAnswerNotes.length > 100 && q.interviewerFacts.length > 0);
  check(`${q.id}: prompt is short and abstract (≤ 30 words)`, q.prompt.split(/\s+/).length <= 30, q.prompt);
}

console.log("\n2. Exhibit arithmetic");
const num = (v: string | number) => (typeof v === "number" ? v : Number(String(v).replace(/[,%−]/g, (c) => (c === "−" ? "-" : ""))));
for (const q of PM_QUESTION_BANK) {
  for (const ex of q.exhibits ?? []) {
    const body = ex.rows.filter((r) => r[0] !== "Total");
    const total = ex.rows.find((r) => r[0] === "Total");
    check(`${q.id}/${ex.id}: has a Total row`, Boolean(total));
    if (!total) continue;
    for (const col of [1, 2]) {
      const sum = body.reduce((acc, r) => acc + num(r[col]!), 0);
      check(`${q.id}/${ex.id}: column ${ex.columns[col]} sums to total`, Math.abs(sum - num(total[col]!)) < 1e-6, `${sum} vs ${total[col]}`);
    }
    for (const r of ex.rows) {
      const computed = (num(r[2]!) / num(r[1]!) - 1) * 100;
      const stated = num(r[3]!);
      check(
        `${q.id}/${ex.id}: ${r[0]} change ${r[3]} matches ${computed.toFixed(2)}%`,
        Math.abs(computed - stated) <= 0.051,
      );
    }
  }
}

console.log("\n3. Frameworks and nudge neutrality");
for (const fw of Object.values(PM_FRAMEWORKS)) {
  check(`${fw.key}: step keys unique snake_case`, new Set(fw.steps.map((s) => s.key)).size === fw.steps.length && fw.steps.every((s) => /^[a-z_]+$/.test(s.key)));
  for (const step of fw.steps) {
    const banned = [/circles?/i, /framework/i, /\bstep\b/i, /remember/i, /you should/i, new RegExp(step.label.split(" ")[0]!, "i")];
    const hit = banned.find((re) => re.test(step.nudge));
    check(`${fw.key}/${step.key}: nudge is neutral ("${step.nudge}")`, !hit && step.nudge.trim().endsWith("?"), hit ? String(hit) : "");
  }
}
check("circle has 7 steps", PM_FRAMEWORKS.circle?.steps.length === 7);

console.log("\n4. Slug registration");
check("interview preset exists", getInterviewType(PM_INTERVIEW_SLUG) !== null);
check("listed in the preset picker", listInterviewTypes().some((t) => t.slug === PM_INTERVIEW_SLUG));
check("engine type registered", getEngineType(PM_INTERVIEW_SLUG) !== null);
check("in report/study-plan interview slugs", INTERVIEW_TYPE_SLUGS.has(PM_INTERVIEW_SLUG));
check("has a report type label", typeLabelForReport(PM_INTERVIEW_SLUG) === "Product management interview");
const root = join(__dirname, "..");
for (const [file, needle] of [
  ["components/interview/interviewPicker.ts", `"${PM_INTERVIEW_SLUG}": PackageSearch`],
  ["components/practice/ReportChrome.tsx", `"${PM_INTERVIEW_SLUG}",`],
  ["app/api/study-plans/generate/route.ts", `"${PM_INTERVIEW_SLUG}",`],
] as const) {
  check(`${file} lists the slug`, readFileSync(join(root, file), "utf8").includes(needle));
}
const resolved = resolveSessionConfig(PM_INTERVIEW_SLUG, {});
check("resolves", resolved.ok);
if (resolved.ok) {
  const schema = buildRubricJsonSchema(resolved.config);
  for (const key of [PROCESS_RIGOR_DIMENSION.key, ...PM_RUBRIC_EXTRAS.map((d) => d.key)]) {
    check(`schema requires ${key}_score`, schema.schema.required.includes(`${key}_score`));
  }
  check("schema has outcome.processSteps", JSON.stringify(schema.schema.properties.outcome ?? {}).includes("processSteps"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
