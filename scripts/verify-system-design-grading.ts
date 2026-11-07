/**
 * System-design grading VALIDITY study (REAL OpenAI calls).
 *
 * Grades the golden transcripts in scripts/fixtures/system-design/ with the
 * REAL registered `system-design` type: its evaluator prompt (shared problem
 * rules + SD addendum), the same model (INTERVIEW_EVAL_MODEL || gpt-4.1),
 * the strict json_schema from `buildRubricJsonSchema`, the engine's
 * `buildProblemEvaluatorBrief` (nudges and exhibit reveals as server events),
 * `validateEvaluationResult`, `finalizeProblemOutcome` and — as the runner
 * stores it — process_rigor DERIVED from the steps by
 * `deriveProcessRigorScore`. Expectations are asserted on the derived value.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-system-design-grading.ts [--runs 2] [--only url-strong,url-boxes] [--json out.json]
 * Exits 1 when any expectation fails in any run.
 */

import { writeFileSync } from "node:fs";

import { validateEvaluationResult } from "../lib/engine/evaluation";
import { getEngineType } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema, parseOutcomeFields } from "../lib/engine/rubric";
import { formatTranscriptForEvaluator, type InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import { findProblemQuestion } from "../lib/problem-interview/banks.server";
import { asProcessStepResults, finalizeProblemOutcome } from "../lib/problem-interview/outcome";
import { buildProblemEvaluatorBrief } from "../lib/problem-interview/prompts";
import {
  buildProblemSessionSnapshot,
  toPublicExhibit,
  type ProblemInterviewEvent,
} from "../lib/problem-interview/session-state";
import { deriveProcessRigorScore, type ProcessStepResult } from "../lib/problem-interview/types";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";
import { getSdFramework } from "../lib/system-design-interview/frameworks";
import { SD_INTERVIEW_SLUG } from "../lib/system-design-interview/live";

import { SD_GOLDENS, type GoldenTranscript } from "./fixtures/system-design/goldens";

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 1);
const ONLY = argOf("--only")?.split(",");
const JSON_OUT = argOf("--json");
const MODEL = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";
const GOLDENS = SD_GOLDENS.filter((g) => !ONLY || ONLY.includes(g.id));

const typeConfig = getEngineType(SD_INTERVIEW_SLUG)!;
if (!typeConfig?.problemInterview) throw new Error("system-design is not registered as a problem interview");
const resolved = resolveFromTypeConfig(typeConfig, {});
if (!resolved.ok) throw new Error(resolved.reason);
const config = resolved.config;
/**
 * --outcome-first: reorder the schema so `outcome` (the step verdicts) is
 * generated BEFORE the scores. Strict json_schema emits keys in schema order,
 * and the stock order (scores → … → outcome) makes the model commit to scores
 * before it has judged a single step. Engine proposal; see the validity doc.
 */
const OUTCOME_FIRST = args.includes("--outcome-first");
const schema = (() => {
  const base = buildRubricJsonSchema(config) as { schema: { properties: Record<string, unknown>; required?: string[] } };
  if (!OUTCOME_FIRST) return base;
  const { outcome, ...rest } = base.schema.properties;
  return { ...base, schema: { ...base.schema, properties: { outcome, ...rest } } };
})() as ReturnType<typeof buildRubricJsonSchema>;
const SYSTEM = `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}`;

function events(g: GoldenTranscript): ProblemInterviewEvent[] {
  const question = findProblemQuestion(SD_INTERVIEW_SLUG, g.questionId)!;
  const list: ProblemInterviewEvent[] = [
    ...g.nudgesIssued.map((n, i) => ({ kind: "nudge" as const, step: n.stepKey, atSeconds: n.atSeconds, turnIndex: i })),
    ...g.exhibitsRevealed.map((e, i) => ({
      kind: "exhibit" as const,
      exhibitId: e.exhibitId,
      exhibit: toPublicExhibit(question.exhibits!.find((x) => x.id === e.exhibitId)!),
      atSeconds: e.atSeconds,
      turnIndex: 100 + i,
    })),
  ];
  return list.sort((a, b) => a.atSeconds - b.atSeconds);
}

function transcriptText(g: GoldenTranscript): string {
  const startedAt = 1_800_000_000_000;
  const t: InterviewTranscript = {
    version: 1,
    reportId: g.id,
    userId: "golden",
    typeSlug: SD_INTERVIEW_SLUG,
    interviewer: { avatarId: null, name: null },
    startedAt,
    updatedAt: startedAt,
    turns: g.turns.map((x) => ({ role: x.role, content: x.content, timestamp: startedAt + x.t * 1000 })),
    progress: initialProgress(),
  };
  return formatTranscriptForEvaluator(t);
}

function userMessage(g: GoldenTranscript): string {
  const question = findProblemQuestion(SD_INTERVIEW_SLUG, g.questionId)!;
  const framework = getSdFramework(question.frameworkKey)!;
  const c = config.customization!;
  const brief = buildProblemEvaluatorBrief({
    questionId: question.id,
    frameworkKey: framework.key,
    question,
    publicTitle: question.title,
    publicPrompt: question.prompt,
    framework,
    events: events(g),
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
}

async function grade(g: GoldenTranscript, run: number): Promise<Graded> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
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
  const question = findProblemQuestion(SD_INTERVIEW_SLUG, g.questionId)!;
  const framework = getSdFramework(question.frameworkKey)!;
  const snapshot = { ...buildProblemSessionSnapshot(question, framework, new Date(0).toISOString()), events: events(g) };
  const outcome = finalizeProblemOutcome(parseOutcomeFields(raw, config) ?? {}, snapshot);
  const steps = asProcessStepResults(outcome.processSteps) ?? [];
  const derivedRigor = steps.length ? deriveProcessRigorScore(steps) : null;
  const rawRigor = validated.scores.process_rigor ?? null;
  const scores: Record<string, number | null> = { ...validated.scores, process_rigor: derivedRigor ?? rawRigor };

  const failures: string[] = [];
  if (steps.length === 0) {
    const rawSteps = String((raw as { outcome?: { processSteps?: unknown } }).outcome?.processSteps ?? "");
    let why = "absent";
    try {
      JSON.parse(rawSteps);
      why = "parsed but rejected by asProcessStepResults";
    } catch (err) {
      why = `invalid JSON (${(err as Error).message.slice(0, 60)})`;
    }
    failures.push(`processSteps unusable: ${why}; starts ${JSON.stringify(rawSteps.slice(0, 80))}`);
  }
  const e = g.expect;
  if (JSON.stringify(steps.map((s) => s.key)) !== JSON.stringify(framework.steps.map((s) => s.key))) {
    failures.push(`step keys ${steps.map((s) => s.key).join(",")}`);
  }
  const cmp = (k: string, min?: number, max?: number) => {
    const v = scores[k] ?? null;
    if (min !== undefined && (v === null || v < min)) failures.push(`${k}=${v} < ${min}`);
    if (max !== undefined && (v === null || v > max)) failures.push(`${k}=${v} > ${max}`);
  };
  cmp("process_rigor", e.rigorMin, e.rigorMax);
  cmp("quantitative", e.quantitativeMin, e.quantitativeMax);
  cmp("tradeoff_reasoning", e.tradeoffMin, e.tradeoffMax);
  cmp("technical_depth", e.depthMin, e.depthMax);
  if (e.allHit) for (const s of steps) if (s.status !== "hit") failures.push(`${s.key}=${s.status} (want hit)`);
  for (const [key, ok] of Object.entries(e.steps ?? {})) {
    const s = steps.find((x) => x.key === key);
    if (!s || !ok.includes(s.status)) failures.push(`${key}=${s?.status ?? "absent"} (want ${ok.join("|")})`);
  }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const text = norm(transcriptText(g));
  const nonVerbatim = steps
    .filter((s) => s.status !== "missed" && s.evidenceQuote && !text.includes(norm(s.evidenceQuote).slice(0, 30)))
    .map((s) => s.key);
  return { id: g.id, run, scores, rawRigor, derivedRigor, steps, nonVerbatim, failures };
}

const ABBR: Record<string, string> = { hit: "H", prompted: "P", missed: "M", not_applicable: "-" };

async function main() {
  console.log(`model ${MODEL}; schema order ${OUTCOME_FIRST ? "outcome-first" : "stock"}; ${GOLDENS.length} transcripts × ${RUNS} run(s)\n`);
  const all: Graded[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results: Graded[] = [];
    // Two at a time: keeps rate limits and output order calm.
    for (let i = 0; i < GOLDENS.length; i += 2) {
      results.push(
        ...(await Promise.all(
          GOLDENS.slice(i, i + 2).map((g) =>
            grade(g, run).catch(
              (err) => ({ id: g.id, run, scores: {}, rawRigor: null, derivedRigor: null, steps: [], nonVerbatim: [], failures: [`error: ${String(err)}`] }) as Graded,
            ),
          ),
        )),
      );
    }
    for (const r of results) {
      const sc = (k: string) => String(r.scores[k] ?? "–");
      console.log(
        `run ${run}  ${r.id.padEnd(18)} rigor ${sc("process_rigor")} (raw ${r.rawRigor ?? "–"})  quant ${sc("quantitative")}  trade ${sc("tradeoff_reasoning")}  depth ${sc("technical_depth")}  content ${sc("content")}  behav ${sc("behavioral")}  steps ${r.steps.map((x) => ABBR[x.status] ?? "?").join("")}${r.nonVerbatim.length ? `  [non-verbatim: ${r.nonVerbatim.join(",")}]` : ""}  ${r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "PASS"}`,
      );
    }
    all.push(...results);
  }
  const rawDisagree = all.filter((r) => r.rawRigor !== null && r.derivedRigor !== null && r.rawRigor !== r.derivedRigor).length;
  console.log(`\nModel's own process_rigor differed from the derived value: ${rawDisagree}/${all.length}`);
  console.log(`Non-verbatim evidence quotes: ${all.reduce((n, r) => n + r.nonVerbatim.length, 0)}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
  const failed = all.filter((r) => r.failures.length > 0);
  console.log(`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILING GRADE(S) of ${all.length}`}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
