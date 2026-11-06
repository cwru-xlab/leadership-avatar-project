/**
 * Consulting case grading VALIDITY study (REAL OpenAI calls).
 *
 * Grades the golden transcripts in scripts/fixtures/case-interview/ with the
 * consulting evaluator — same model (INTERVIEW_EVAL_MODEL || gpt-4.1), same
 * system-prompt suffix, same strict json_schema from `buildRubricJsonSchema`,
 * same `validateEvaluationResult` as lib/engine/evaluation.ts — and asserts
 * each transcript's expectations:
 *   strong → process_rigor ≥ 4, every step hit
 *   jump   → process_rigor ≤ 2, clarify/structure missed
 *   botch  → quantitative ≤ 2, final answer/recommendation missed
 *   nudged → nudged steps marked prompted, never hit
 * Quantitative is graded against each case's TOLERANCE band, not exact match.
 *
 * The type config comes from scripts/fixtures/case-interview/factory-mirror.ts
 * until the engine factory lands (see TODO in lib/case-interview/registration.ts).
 *
 * Run:  npx tsx --env-file=.env.local scripts/verify-case-interview-grading.ts [--runs 3] [--only airline-strong,retail-nudged] [--json out.json]
 * Exits 1 when any expectation fails in any run.
 */

import { writeFileSync } from "node:fs";

import { getCase } from "../lib/case-interview/cases";
import { buildCaseEvaluationBrief } from "../lib/case-interview/evaluator";
import { getCaseFramework } from "../lib/case-interview/frameworks";
import { validateEvaluationResult } from "../lib/engine/evaluation";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema, parseOutcomeFields } from "../lib/engine/rubric";
import { formatTranscriptForEvaluator, type InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";
import type { ProcessStepResult } from "../lib/problem-interview/types";

import { AIRLINE_GOLDENS } from "./fixtures/case-interview/airline";
import { capProcessRigor, mirrorConsultingTypeConfig, processRigorCeiling } from "./fixtures/case-interview/factory-mirror";
import { HAIRGEL_GOLDENS } from "./fixtures/case-interview/hair-gel";
import { RETAIL_GOLDENS } from "./fixtures/case-interview/retail";
import type { GoldenTranscript } from "./fixtures/case-interview/types";

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 1);
const ONLY = argOf("--only")?.split(",");
const JSON_OUT = argOf("--json");
const MODEL = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";

const GOLDENS: GoldenTranscript[] = [...AIRLINE_GOLDENS, ...RETAIL_GOLDENS, ...HAIRGEL_GOLDENS].filter(
  (g) => !ONLY || ONLY.includes(g.id),
);

const typeConfig = mirrorConsultingTypeConfig();
const resolved = resolveFromTypeConfig(typeConfig, {});
if (!resolved.ok) throw new Error(resolved.reason);
const config = resolved.config;
const schema = buildRubricJsonSchema(config);
const SYSTEM = `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}`;

function transcriptText(g: GoldenTranscript): string {
  const startedAt = 1_800_000_000_000;
  const t: InterviewTranscript = {
    version: 1,
    reportId: g.id,
    userId: "golden",
    typeSlug: "consulting",
    interviewer: { avatarId: null, name: null },
    startedAt,
    updatedAt: startedAt,
    turns: g.turns.map((x) => ({ role: x.role, content: x.content, timestamp: startedAt + x.t * 1000 })),
    progress: initialProgress(),
  };
  return formatTranscriptForEvaluator(t);
}

/** Mirrors lib/engine/evaluation.ts's interview-kind user message + problem_context. */
function userMessage(g: GoldenTranscript): string {
  const q = getCase(g.caseId)!;
  const fw = getCaseFramework(q.frameworkKey)!;
  const c = config.customization!;
  return `full_transcript:
${transcriptText(g)}

resume_text:
(No resume was provided.)

role_context:
${JSON.stringify({ role_title: c.roleTitle, industry: c.industry, difficulty: c.difficulty })}

visual_metrics: null
vocal_metrics: null

${buildCaseEvaluationBrief(q, fw, g.nudgesIssued)}`;
}

interface Graded {
  id: string;
  run: number;
  /** After the proposed postProcessScores cap — what the report would persist. */
  scores: Record<string, number | null>;
  /** process_rigor as the model returned it. */
  rawRigor: number | null;
  /** Evidence quotes that are not verbatim transcript text (soft metric). */
  nonVerbatim: string[];
  notes: unknown;
  steps: ProcessStepResult[];
  failures: string[];
  ms: number;
}

async function grade(g: GoldenTranscript, run: number): Promise<Graded> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 });
  const started = Date.now();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMessage(g) },
    ],
    max_tokens: 4000,
    response_format: { type: "json_schema", json_schema: schema },
  });
  const raw = JSON.parse(completion.choices[0]!.message.content!) as unknown;
  const validated = validateEvaluationResult(raw, config, { hasVisualMetrics: false, hasVocalMetrics: false }, { kind: "interview" });
  const outcome = parseOutcomeFields(raw, config) ?? {};
  let steps: ProcessStepResult[] = [];
  const failures: string[] = [];
  try {
    steps = JSON.parse(String(outcome.processSteps ?? "[]")) as ProcessStepResult[];
  } catch {
    failures.push("processSteps is not valid JSON");
  }
  const rawRigor = validated.scores.process_rigor ?? null;
  const scores = capProcessRigor(validated.scores, outcome);
  const e = g.expect;
  const s = (k: string) => scores[k] ?? null;
  const fw = getCaseFramework(getCase(g.caseId)!.frameworkKey)!;
  const stepKeys = fw.steps.map((x) => x.key);

  if (outcome.questionId !== g.caseId) failures.push(`questionId=${String(outcome.questionId)}`);
  if (JSON.stringify(steps.map((x) => x.key)) !== JSON.stringify(stepKeys)) failures.push(`step keys ${steps.map((x) => x.key).join(",")}`);
  const cmp = (k: string, min?: number, max?: number) => {
    const v = s(k);
    if (min !== undefined && (v === null || v < min)) failures.push(`${k}=${v} < ${min}`);
    if (max !== undefined && (v === null || v > max)) failures.push(`${k}=${v} > ${max}`);
  };
  cmp("process_rigor", e.processRigorMin, e.processRigorMax);
  cmp("quantitative", e.quantitativeMin, e.quantitativeMax);
  cmp("synthesis", e.synthesisMin, e.synthesisMax);
  if (e.allHit) {
    for (const st of steps) if (st.status !== "hit") failures.push(`${st.key}=${st.status} (want hit)`);
  }
  for (const [key, ok] of Object.entries(e.steps ?? {})) {
    const st = steps.find((x) => x.key === key);
    if (!st || !ok.includes(st.status)) failures.push(`${key}=${st?.status ?? "absent"} (want ${ok.join("|")})`);
  }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const text = norm(transcriptText(g));
  const nonVerbatim = steps
    .filter((st) => st.status !== "missed" && st.evidenceQuote && !text.includes(norm(st.evidenceQuote).slice(0, 30)))
    .map((st) => st.key);
  const notes = (raw as Record<string, unknown>).rubric_notes ?? null;
  return { id: g.id, run, scores, rawRigor, nonVerbatim, notes, steps, failures, ms: Date.now() - started };
}

const ABBR: Record<string, string> = { hit: "H", prompted: "P", missed: "M", not_applicable: "-" };

async function main() {
  console.log(`Model ${MODEL}; ${GOLDENS.length} transcripts × ${RUNS} run(s)\n`);
  const all: Graded[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      GOLDENS.map((g) =>
        grade(g, run).catch((err) => ({ id: g.id, run, scores: {}, rawRigor: null, nonVerbatim: [], notes: null, steps: [], failures: [`error: ${String(err)}`], ms: 0 }) as Graded),
      ),
    );
    for (const r of results) {
      const sc = (k: string) => String(r.scores[k] ?? "–");
      console.log(
        `run ${run}  ${r.id.padEnd(16)} rigor ${sc("process_rigor")} (raw ${r.rawRigor ?? "–"}, band ${processRigorCeiling(r.steps) ?? "–"})  quant ${sc("quantitative")}  synth ${sc("synthesis")}  content ${sc("content")}  behav ${sc("behavioral")}  steps ${r.steps.map((x) => ABBR[x.status] ?? "?").join("")}${r.nonVerbatim.length ? `  [non-verbatim: ${r.nonVerbatim.join(",")}]` : ""}  ${r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "PASS"}`,
      );
    }
    all.push(...results);
  }

  console.log("\nSpread across runs (min–max):");
  for (const g of GOLDENS) {
    const rs = all.filter((r) => r.id === g.id);
    const span = (k: string) => {
      const v = rs.map((r) => r.scores[k]).filter((x): x is number => typeof x === "number");
      return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : "null";
    };
    const stepVariants = new Set(rs.map((r) => r.steps.map((x) => ABBR[x.status]).join("")));
    console.log(`  ${g.id.padEnd(16)} rigor ${span("process_rigor")}  quant ${span("quantitative")}  synth ${span("synthesis")}  step patterns: ${[...stepVariants].join(" / ")}`);
  }

  const rawOver = all.filter((r) => r.rawRigor !== null && r.rawRigor > (processRigorCeiling(r.steps) ?? 5)).length;
  const nv = all.reduce((n, r) => n + r.nonVerbatim.length, 0);
  console.log(`\nRaw process_rigor above its guide band (fixed by the cap): ${rawOver}/${all.length}`);
  console.log(`Non-verbatim evidence quotes: ${nv}`);

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
  const failed = all.filter((r) => r.failures.length > 0);
  console.log(`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILING GRADE(S) of ${all.length}`}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
