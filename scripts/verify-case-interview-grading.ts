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
 * The type config is the registry's real `consulting` record (built by
 * `makeProblemInterviewTypeConfig`), the brief is the real
 * `buildProblemEvaluatorBrief` with the nudges as server events, and the
 * outcome/score pass is the evaluation runner's: `finalizeProblemOutcome`
 * (nudged steps can never stay hit) then `deriveProcessRigorScore`.
 *
 * Run:  npx tsx --env-file=.env.local scripts/verify-case-interview-grading.ts [--runs 3] [--only airline-strong,retail-nudged] [--json out.json]
 * Exits 1 when any expectation fails in any run.
 */

import { writeFileSync } from "node:fs";

import { getCase } from "../lib/case-interview/cases";
import { getEngineType } from "../lib/engine/registry";
import type { InteractionTypeConfig } from "../lib/engine/types";
import { getCaseFramework } from "../lib/case-interview/frameworks";
import { validateEvaluationResult } from "../lib/engine/evaluation";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema, parseOutcomeFields } from "../lib/engine/rubric";
import { formatTranscriptForEvaluator, type InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";
import { deriveProcessRigorScore, type ProcessStepResult } from "../lib/problem-interview/types";
import { buildProblemEvaluatorBrief } from "../lib/problem-interview/prompts";
import { finalizeProblemOutcome, parseProcessStepsValue } from "../lib/problem-interview/outcome";
import { buildProblemSessionSnapshot } from "../lib/problem-interview/session-state";

import { AIRLINE_GOLDENS } from "./fixtures/case-interview/airline";
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

const MODE = "engine";
const typeConfig = getEngineType("consulting") as InteractionTypeConfig;
if (!typeConfig?.problemInterview) throw new Error("consulting is not registered as a problem interview");

let config: ReturnType<typeof resolveConfig>;
let schema: ReturnType<typeof buildRubricJsonSchema>;
let SYSTEM = "";

function resolveConfig() {
  const resolved = resolveFromTypeConfig(typeConfig, {});
  if (!resolved.ok) throw new Error(resolved.reason);
  return resolved.config;
}

function briefFor(g: GoldenTranscript): string {
  const q = getCase(g.caseId)!;
  const fw = getCaseFramework(q.frameworkKey)!;
  return buildProblemEvaluatorBrief({
    questionId: q.id,
    frameworkKey: fw.key,
    question: q,
    publicTitle: q.title,
    publicPrompt: q.prompt,
    framework: fw,
    events: g.nudgesIssued.map((n, i) => ({ kind: "nudge", step: n.stepKey, atSeconds: n.atSeconds, turnIndex: i })),
  });
}

/** The evaluation runner's pass: reconcile steps with the nudge record, then derive process_rigor. */
function finalize(g: GoldenTranscript, outcome: Record<string, unknown>) {
  const q = getCase(g.caseId)!;
  const snapshot = buildProblemSessionSnapshot(q, getCaseFramework(q.frameworkKey)!, new Date(0).toISOString());
  snapshot.events = g.nudgesIssued.map((n, i) => ({ kind: "nudge" as const, step: n.stepKey, atSeconds: n.atSeconds, turnIndex: i }));
  return finalizeProblemOutcome(outcome, snapshot);
}

function postProcess(scores: Record<string, number | null>, steps: ProcessStepResult[]) {
  const derived = deriveProcessRigorScore(steps);
  return derived === null ? scores : { ...scores, process_rigor: derived };
}

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

/** Mirrors lib/engine/evaluation.ts's interview-kind user message + the problem brief. */
function userMessage(g: GoldenTranscript): string {
  const c = config.customization!;
  return `full_transcript:
${transcriptText(g)}

resume_text:
(No resume was provided.)

role_context:
${JSON.stringify({ role_title: c.roleTitle, industry: c.industry, difficulty: c.difficulty })}

visual_metrics: null
vocal_metrics: null

${briefFor(g)}`;
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
  /**
   * Measurements of the shared problem addendum's two grading rules, added for
   * the 2026-11-07 study (docs/interviews/case-interview-validity.md). The
   * STORED note keeps the `Meets all criteria: yes.|no.` prefix — only the
   * render path strips it — so it is visible here.
   */
  prefixedNotes: number;
  noteSaysNo: number;
  /** Steps whose note says "no" while the status is not missed/not_applicable. */
  prefixStatusConflicts: string[];
  /** Steps that still carry a raw double-quote in evidenceQuote or note. */
  nestedQuoteSteps: string[];
  /** The model's processSteps string did not parse strictly and needed the repair. */
  stepsRepaired: boolean;
  /** Not even the deterministic repair parsed it. */
  stepsMalformed: boolean;
  failures: string[];
  ms: number;
}

const NOTE_PREFIX = /^\s*meets all criteria\s*[:\u2014\u2013-]?\s*(yes|no)\b/i;

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
  const produced = parseOutcomeFields(raw, config) ?? {};
  // Did the MODEL's own string parse, or did the engine's deterministic repair
  // have to rescue it? `finalize` re-stringifies, so this has to be read first.
  const modelSteps = produced.processSteps;
  let stepsRepaired = false;
  let stepsMalformed = false;
  if (typeof modelSteps === "string" && modelSteps.trim()) {
    try {
      JSON.parse(modelSteps);
    } catch {
      const repaired = parseProcessStepsValue(modelSteps);
      stepsRepaired = repaired !== null;
      stepsMalformed = repaired === null;
    }
  }
  const outcome = finalize(g, produced);
  let steps: ProcessStepResult[] = [];
  const failures: string[] = [];
  try {
    steps = JSON.parse(String(outcome.processSteps ?? "[]")) as ProcessStepResult[];
  } catch {
    failures.push("processSteps is not valid JSON");
    stepsMalformed = true;
  }
  const rawRigor = validated.scores.process_rigor ?? null;
  const scores = postProcess(validated.scores, steps);
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
  const verdicts = steps.map((st) => NOTE_PREFIX.exec(st.note ?? "")?.[1]?.toLowerCase() ?? null);
  const prefixedNotes = verdicts.filter((v) => v !== null).length;
  const noteSaysNo = verdicts.filter((v) => v === "no").length;
  const prefixStatusConflicts = steps
    .filter((st, i) => verdicts[i] === "no" && st.status !== "missed" && st.status !== "not_applicable")
    .map((st) => `${st.key}=${st.status}`);
  const nestedQuoteSteps = steps
    .filter((st) => `${st.evidenceQuote ?? ""}${st.note ?? ""}`.includes('"'))
    .map((st) => st.key);
  return {
    id: g.id,
    run,
    scores,
    rawRigor,
    nonVerbatim,
    notes,
    steps,
    prefixedNotes,
    noteSaysNo,
    prefixStatusConflicts,
    nestedQuoteSteps,
    stepsRepaired,
    stepsMalformed,
    failures,
    ms: Date.now() - started,
  };
}

const ABBR: Record<string, string> = { hit: "H", prompted: "P", missed: "M", not_applicable: "-" };

async function main() {
  config = resolveConfig();
  schema = buildRubricJsonSchema(config);
  SYSTEM = `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}`;
  console.log(`Mode ${MODE}; model ${MODEL}; ${GOLDENS.length} transcripts × ${RUNS} run(s)\n`);
  const all: Graded[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      GOLDENS.map((g) =>
        grade(g, run).catch(
          (err) =>
            ({
              id: g.id,
              run,
              scores: {},
              rawRigor: null,
              nonVerbatim: [],
              notes: null,
              steps: [],
              prefixedNotes: 0,
              noteSaysNo: 0,
              prefixStatusConflicts: [],
              nestedQuoteSteps: [],
              stepsRepaired: false,
              stepsMalformed: false,
              failures: [`error: ${String(err)}`],
              ms: 0,
            }) as Graded,
        ),
      ),
    );
    for (const r of results) {
      const sc = (k: string) => String(r.scores[k] ?? "–");
      console.log(
        `run ${run}  ${r.id.padEnd(16)} rigor ${sc("process_rigor")} (raw ${r.rawRigor ?? "–"}, band ${deriveProcessRigorScore(r.steps) ?? "–"})  quant ${sc("quantitative")}  synth ${sc("synthesis")}  content ${sc("content")}  behav ${sc("behavioral")}  steps ${r.steps.map((x) => ABBR[x.status] ?? "?").join("")}${r.nonVerbatim.length ? `  [non-verbatim: ${r.nonVerbatim.join(",")}]` : ""}  ${r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "PASS"}`,
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

  const rawOver = all.filter((r) => r.rawRigor !== null && r.rawRigor > (deriveProcessRigorScore(r.steps) ?? 5)).length;
  const rawDiff = all.filter((r) => r.rawRigor !== null && r.rawRigor !== (deriveProcessRigorScore(r.steps) ?? r.rawRigor)).length;
  const nv = all.reduce((n, r) => n + r.nonVerbatim.length, 0);
  console.log(`\nRaw process_rigor above its guide band (fixed by the cap): ${rawOver}/${all.length}`);
  console.log(`Raw process_rigor disagreeing with the derived band at all: ${rawDiff}/${all.length}`);
  console.log(`Non-verbatim evidence quotes: ${nv}`);

  // The two rules the shared problem addendum gained in dbd25ce.
  const slots = all.reduce((n, r) => n + r.steps.length, 0);
  const prefixed = all.reduce((n, r) => n + r.prefixedNotes, 0);
  const saysNo = all.reduce((n, r) => n + r.noteSaysNo, 0);
  const conflicts = all.flatMap((r) => r.prefixStatusConflicts.map((c) => `${r.id} run ${r.run} ${c}`));
  const nested = all.flatMap((r) => r.nestedQuoteSteps.map((k) => `${r.id} run ${r.run} ${k}`));
  const repaired = all.filter((r) => r.stepsRepaired).map((r) => `${r.id} run ${r.run}`);
  const malformed = all.filter((r) => r.stepsMalformed).map((r) => `${r.id} run ${r.run}`);
  console.log(`'Meets all criteria:' prefix present in ${prefixed}/${slots} stored step notes (${saysNo} say no)`);
  console.log(`Notes saying no while the status is not missed: ${conflicts.length}${conflicts.length ? ` — ${conflicts.join("; ")}` : ""}`);
  console.log(`Steps still carrying a double-quote character: ${nested.length}${nested.length ? ` — ${nested.join("; ")}` : ""}`);
  console.log(`processSteps needing the deterministic repair: ${repaired.length}/${all.length}${repaired.length ? ` — ${repaired.join("; ")}` : ""}`);
  console.log(`processSteps unrecoverable: ${malformed.length}/${all.length}${malformed.length ? ` — ${malformed.join("; ")}` : ""}`);

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
  const failed = all.filter((r) => r.failures.length > 0);
  console.log(`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILING GRADE(S) of ${all.length}`}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
