/**
 * Data-analytics grading VALIDITY study (REAL OpenAI calls).
 *
 * Grades the golden transcripts in scripts/fixtures/analytics-interview/ with
 * the registered `data-analytics` evaluator exactly as production does:
 * - system prompt: the type's evaluatorPrompt (shared interview prompt + the
 *   engine's problem rules + ANALYTICS_EVALUATOR_ADDENDUM) + REPORT_SPELLING_RULE;
 * - user message: lib/engine/evaluation.ts's interview envelope + the REAL
 *   `buildProblemEvaluatorBrief` with the golden's nudges / exhibit reveals as
 *   server events;
 * - model INTERVIEW_EVAL_MODEL || gpt-4.1, the strict schema from
 *   `buildRubricJsonSchema`, `validateEvaluationResult`, then the REAL
 *   `finalizeProblemOutcome` (a nudged step can't stay hit) and
 *   `deriveProcessRigorScore` (the stored process_rigor is derived from the
 *   steps, as lib/engine/evaluation-runner.ts does).
 *
 * Assertions use the DERIVED process_rigor; the model's raw value is printed
 * for reference.
 *
 * Run:  npx tsx --env-file=.env.local scripts/verify-analytics-interview-grading.ts [--runs 3] [--only srm-strong,srm-misread] [--json out.json]
 * Exits 1 when any expectation fails in any run.
 */

import { writeFileSync } from "node:fs";

import { getAnalyticsFramework } from "../lib/analytics-interview/frameworks";
import { ANALYTICS_INTERVIEW_SLUG } from "../lib/analytics-interview/live";
import { getAnalyticsQuestion } from "../lib/analytics-interview/questions";
import { validateEvaluationResult } from "../lib/engine/evaluation";
import { getEngineType } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema, parseOutcomeFields } from "../lib/engine/rubric";
import { formatTranscriptForEvaluator, type InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import { asProcessStepResults, finalizeProblemOutcome } from "../lib/problem-interview/outcome";
import { buildProblemEvaluatorBrief } from "../lib/problem-interview/prompts";
import type { ProblemSessionSnapshot } from "../lib/problem-interview/session-state";
import { deriveProcessRigorScore, type ProcessStepResult } from "../lib/problem-interview/types";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";

import { ANALYTICS_GOLDENS } from "./fixtures/analytics-interview/goldens";
import type { GoldenTranscript } from "./fixtures/analytics-interview/types";

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 1);
const ONLY = argOf("--only")?.split(",");
const JSON_OUT = argOf("--json");
const MODEL = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";

const GOLDENS = ANALYTICS_GOLDENS.filter((g) => !ONLY || ONLY.includes(g.id));

const typeConfig = getEngineType(ANALYTICS_INTERVIEW_SLUG);
if (!typeConfig?.problemInterview) throw new Error("data-analytics is not registered as a problem interview");
const resolved = resolveFromTypeConfig(typeConfig, {});
if (!resolved.ok) throw new Error(resolved.reason);
const config = resolved.config;
const schema = buildRubricJsonSchema(config);
const SYSTEM = `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}`;

function events(g: GoldenTranscript) {
  const question = getAnalyticsQuestion(g.questionId)!;
  return [
    ...g.nudgesIssued.map((n, i) => ({ kind: "nudge" as const, step: n.stepKey, atSeconds: n.atSeconds, turnIndex: i })),
    ...g.exhibitsRevealed.map((x, i) => {
      const exhibit = question.exhibits!.find((e) => e.id === x.exhibitId)!;
      return {
        kind: "exhibit" as const,
        exhibitId: x.exhibitId,
        exhibit: { id: exhibit.id, title: exhibit.title, kind: exhibit.kind, caption: exhibit.caption, columns: exhibit.columns, rows: exhibit.rows },
        atSeconds: x.atSeconds,
        turnIndex: 100 + i,
      };
    }),
  ].sort((a, b) => a.atSeconds - b.atSeconds);
}

function transcriptText(g: GoldenTranscript): string {
  const startedAt = 1_800_000_000_000;
  const t: InterviewTranscript = {
    version: 1,
    reportId: g.id,
    userId: "golden",
    typeSlug: ANALYTICS_INTERVIEW_SLUG,
    interviewer: { avatarId: null, name: null },
    startedAt,
    updatedAt: startedAt,
    turns: g.turns.map((x) => ({ role: x.role, content: x.content, timestamp: startedAt + x.t * 1000 })),
    progress: initialProgress(),
  };
  return formatTranscriptForEvaluator(t);
}

/** lib/engine/evaluation.ts's interview-kind user message + the problem brief. */
function userMessage(g: GoldenTranscript): string {
  const q = getAnalyticsQuestion(g.questionId)!;
  const fw = getAnalyticsFramework(q.frameworkKey)!;
  const c = config.customization!;
  const brief = buildProblemEvaluatorBrief({
    questionId: q.id,
    frameworkKey: fw.key,
    question: q,
    publicTitle: q.title,
    publicPrompt: q.prompt,
    framework: fw,
    events: events(g) as never,
  });
  return `full_transcript:
${transcriptText(g)}

resume_text:
(No resume was provided.)

role_context:
${JSON.stringify({ role_title: c.roleTitle, industry: c.industry, difficulty: c.difficulty })}

visual_metrics: null
vocal_metrics: null

${brief}`;
}

interface Graded {
  id: string;
  run: number;
  scores: Record<string, number | null>;
  rawRigor: number | null;
  derivedRigor: number | null;
  steps: ProcessStepResult[];
  nonVerbatim: string[];
  failures: string[];
  ms: number;
}

async function grade(g: GoldenTranscript, run: number): Promise<Graded> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
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
  const q = getAnalyticsQuestion(g.questionId)!;
  const fw = getAnalyticsFramework(q.frameworkKey)!;
  const snapshot = {
    questionId: q.id,
    frameworkKey: fw.key,
    framework: fw,
    state: { nudgedSteps: g.nudgesIssued.map((n) => n.stepKey) },
    events: events(g),
  } as unknown as ProblemSessionSnapshot;
  const outcome = finalizeProblemOutcome(parseOutcomeFields(raw, config) ?? {}, snapshot);
  const steps = asProcessStepResults(outcome.processSteps) ?? [];
  const failures: string[] = [];
  if (steps.length === 0) failures.push("processSteps missing or malformed");
  const rawRigor = validated.scores.process_rigor ?? null;
  const derivedRigor = deriveProcessRigorScore(steps);
  const scores: Record<string, number | null> = { ...validated.scores, process_rigor: derivedRigor ?? rawRigor };
  const e = g.expect;

  const cmp = (k: string, min?: number, max?: number) => {
    const v = scores[k] ?? null;
    if (min !== undefined && (v === null || v < min)) failures.push(`${k}=${v} < ${min}`);
    if (max !== undefined && (v === null || v > max)) failures.push(`${k}=${v} > ${max}`);
  };
  if (JSON.stringify(steps.map((x) => x.key)) !== JSON.stringify(fw.steps.map((x) => x.key))) {
    failures.push(`step keys ${steps.map((x) => x.key).join(",")}`);
  }
  cmp("process_rigor", e.processRigorMin, e.processRigorMax);
  cmp("statistical_reasoning", e.statisticalMin, e.statisticalMax);
  cmp("business_judgment", e.businessMin, e.businessMax);
  if (e.allHit) for (const st of steps) if (st.status !== "hit") failures.push(`${st.key}=${st.status} (want hit)`);
  for (const [key, ok] of Object.entries(e.steps ?? {})) {
    const st = steps.find((x) => x.key === key);
    if (!st || !ok.includes(st.status)) failures.push(`${key}=${st?.status ?? "absent"} (want ${ok.join("|")})`);
  }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const text = norm(transcriptText(g));
  const nonVerbatim = steps
    .filter((st) => st.status !== "missed" && st.evidenceQuote && !text.includes(norm(st.evidenceQuote).slice(0, 30)))
    .map((st) => st.key);
  return { id: g.id, run, scores, rawRigor, derivedRigor, steps, nonVerbatim, failures, ms: Date.now() - started };
}

const ABBR: Record<string, string> = { hit: "H", prompted: "P", missed: "M", not_applicable: "-" };

async function main() {
  console.log(`Model ${MODEL}; ${GOLDENS.length} transcripts × ${RUNS} run(s)\n`);
  const all: Graded[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      GOLDENS.map((g) =>
        grade(g, run).catch(
          (err) => ({ id: g.id, run, scores: {}, rawRigor: null, derivedRigor: null, steps: [], nonVerbatim: [], failures: [`error: ${String(err)}`], ms: 0 }) as Graded,
        ),
      ),
    );
    for (const r of results) {
      const sc = (k: string) => String(r.scores[k] ?? "–");
      console.log(
        `run ${run}  ${r.id.padEnd(20)} rigor ${sc("process_rigor")} (raw ${r.rawRigor ?? "–"})  stat ${sc("statistical_reasoning")}  biz ${sc("business_judgment")}  content ${sc("content")}  behav ${sc("behavioral")}  steps ${r.steps.map((x) => ABBR[x.status] ?? "?").join("")}${r.nonVerbatim.length ? `  [non-verbatim: ${r.nonVerbatim.join(",")}]` : ""}  ${r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "PASS"}`,
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
    const patterns = new Set(rs.map((r) => r.steps.map((x) => ABBR[x.status]).join("")));
    console.log(`  ${g.id.padEnd(20)} rigor ${span("process_rigor")}  stat ${span("statistical_reasoning")}  biz ${span("business_judgment")}  steps: ${[...patterns].join(" / ")}`);
  }
  const disagree = all.filter((r) => r.rawRigor !== null && r.derivedRigor !== null && r.rawRigor !== r.derivedRigor).length;
  console.log(`\nRaw process_rigor ≠ derived-from-steps: ${disagree}/${all.length}`);
  console.log(`Non-verbatim evidence quotes: ${all.reduce((n, r) => n + r.nonVerbatim.length, 0)}`);

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
  const failed = all.filter((r) => r.failures.length > 0);
  console.log(`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILING GRADE(S) of ${all.length}`}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
