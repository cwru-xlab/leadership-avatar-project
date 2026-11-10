/**
 * Finance interview grading VALIDITY study (REAL OpenAI calls).
 *
 * Grades the golden transcripts in scripts/fixtures/finance-interview/ with
 * the REGISTERED `finance` type (makeProblemInterviewTypeConfig) — same model
 * (INTERVIEW_EVAL_MODEL || gpt-4.1), same system prompt + spelling rule,
 * same strict json_schema (`buildRubricJsonSchema`), same
 * `validateEvaluationResult` as lib/engine/evaluation.ts — with the user
 * message carrying the real `buildProblemEvaluatorBrief` (bank question from
 * the server-only registry, nudges and exhibit reveals as server events).
 * Then it applies what lib/engine/evaluation-runner.ts persists:
 * `finalizeProblemOutcome` (a nudged step can never stay "hit") and
 * process_rigor DERIVED from the steps (`deriveProcessRigorScore`).
 * Expectations are asserted on the derived value.
 *
 * Run:  npx tsx --env-file=.env.local scripts/verify-finance-interview-grading.ts [--runs 3] [--only lbo-strong,dep-skipped] [--json out.json]
 * Exits 1 when any expectation fails in any run.
 */

import { writeFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";

// Load .env.local BEFORE the lib imports below: they construct the OpenAI
// client at module scope, so a key set afterwards arrives too late.
loadEnv({ path: ".env.local" });
loadEnv();

import { requireEnv } from "./guard-env";

// This guard makes real model calls. Without a key it died on an OpenAI
// "Missing credentials" stack trace, indistinguishable from a regression.
requireEnv(__filename.split("/").pop()!.replace(/\.ts$/, ""), ["OPENAI_API_KEY"]);

import { getEngineType } from "../lib/engine/registry";
import { validateEvaluationResult } from "../lib/engine/evaluation";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema, parseOutcomeFields } from "../lib/engine/rubric";
import { FINANCE_INTERVIEW_SLUG } from "../lib/finance-interview/live";
import { formatTranscriptForEvaluator, type InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import { findProblemQuestion } from "../lib/problem-interview/banks.server";
import { asProcessStepResults, finalizeProblemOutcome, parseProcessStepsValue } from "../lib/problem-interview/outcome";
import { buildProblemEvaluatorBrief } from "../lib/problem-interview/prompts";
import {
  buildProblemSessionSnapshot,
  toPublicExhibit,
  type ProblemInterviewEvent,
} from "../lib/problem-interview/session-state";
import { deriveProcessRigorScore, type ProcessStepResult } from "../lib/problem-interview/types";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";

import { HARBOR_GOLDENS } from "./fixtures/finance-interview/harbor-lbo";
import { TECH_PITCH_GOLDENS } from "./fixtures/finance-interview/technical-and-pitch";
import type { GoldenTranscript } from "./fixtures/finance-interview/types";

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 1);
const ONLY = argOf("--only")?.split(",");
const JSON_OUT = argOf("--json");
const MODEL = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";

const GOLDENS: GoldenTranscript[] = [...HARBOR_GOLDENS, ...TECH_PITCH_GOLDENS].filter(
  (g) => !ONLY || ONLY.includes(g.id),
);

const typeConfig = getEngineType(FINANCE_INTERVIEW_SLUG);
if (!typeConfig?.problemInterview) throw new Error("finance is not registered as a problem interview");
const resolved = resolveFromTypeConfig(typeConfig, {});
if (!resolved.ok) throw new Error(resolved.reason);
const config = resolved.config;
const schema = buildRubricJsonSchema(config);
const SYSTEM = `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}`;

function setup(g: GoldenTranscript) {
  const question = findProblemQuestion(FINANCE_INTERVIEW_SLUG, g.questionId);
  if (!question) throw new Error(`${g.id}: no bank question ${g.questionId}`);
  const framework = typeConfig!.problemInterview!.frameworks.find((f) => f.key === question.frameworkKey)!;
  const events: ProblemInterviewEvent[] = [
    ...g.exhibitsRevealed.map((e, i) => ({
      kind: "exhibit" as const,
      exhibitId: e.exhibitId,
      exhibit: toPublicExhibit(question.exhibits!.find((x) => x.id === e.exhibitId)!),
      atSeconds: e.atSeconds,
      turnIndex: i,
    })),
    ...g.nudgesIssued.map((n, i) => ({ kind: "nudge" as const, step: n.stepKey, atSeconds: n.atSeconds, turnIndex: 100 + i })),
  ].sort((a, b) => a.atSeconds - b.atSeconds) as ProblemInterviewEvent[];
  const snapshot = { ...buildProblemSessionSnapshot(question, framework, new Date(0).toISOString()), events };
  snapshot.state = {
    ...snapshot.state,
    stage: "closing",
    promptPosed: true,
    revealedExhibits: g.exhibitsRevealed.map((e) => e.exhibitId),
    nudgedSteps: g.nudgesIssued.map((n) => n.stepKey),
  };
  const brief = buildProblemEvaluatorBrief({
    questionId: question.id,
    frameworkKey: framework.key,
    question,
    publicTitle: question.title,
    publicPrompt: question.prompt,
    framework,
    events,
  });
  return { question, framework, snapshot, brief };
}

function transcriptText(g: GoldenTranscript): string {
  const startedAt = 1_800_000_000_000;
  const t: InterviewTranscript = {
    version: 1,
    reportId: g.id,
    userId: "golden",
    typeSlug: FINANCE_INTERVIEW_SLUG,
    interviewer: { avatarId: null, name: null },
    startedAt,
    updatedAt: startedAt,
    turns: g.turns.map((x) => ({ role: x.role, content: x.content, timestamp: startedAt + x.t * 1000 })),
    progress: initialProgress(),
  };
  return formatTranscriptForEvaluator(t);
}

/** Mirrors lib/engine/evaluation.ts's interview-kind user message + the problem brief. */
function userMessage(g: GoldenTranscript, brief: string): string {
  const c = config.customization!;
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
  nonVerbatim: string[];
  steps: ProcessStepResult[];
  /**
   * Instrumentation for the 2026-11-07 re-measurement of the two grading
   * rules the shared problem addendum carries (f4359f6). The STORED note keeps
   * the `Meets all criteria: yes.|no.` prefix — only the render path strips
   * it — so it is visible here. Mirrors the case/PM scripts' counters.
   */
  prefixedNotes: number;
  /** Prefix verdicts that were neither `yes` nor `no` (the invented verdict). */
  otherVerdicts: string[];
  noteSaysNo: number;
  /** Steps whose note says "no" while the status is not missed/not_applicable. */
  prefixStatusConflicts: string[];
  /** Steps that still carry a raw double-quote in evidenceQuote or note. */
  nestedQuoteSteps: string[];
  /** The model's own processSteps string did not parse strictly. */
  stepsRepaired: boolean;
  /** Not even the deterministic repair parsed it. */
  stepsMalformed: boolean;
  failures: string[];
  notes: unknown;
}

/** Any opening word after the mandated prefix, so an invented verdict shows up. */
const NOTE_PREFIX = /^\s*meets all criteria\s*[:\u2014\u2013-]?\s*([a-z_]+)/i;

async function grade(g: GoldenTranscript, run: number): Promise<Graded> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 });
  const { framework, snapshot, brief } = setup(g);
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMessage(g, brief) },
    ],
    max_tokens: 4000,
    response_format: { type: "json_schema", json_schema: schema },
  });
  const raw = JSON.parse(completion.choices[0]!.message.content!) as unknown;
  const validated = validateEvaluationResult(raw, config, { hasVisualMetrics: false, hasVocalMetrics: false }, { kind: "interview" });
  const produced = parseOutcomeFields(raw, config) ?? {};
  // Did the MODEL's own string parse, or did the engine's deterministic repair
  // rescue it? `finalizeProblemOutcome` re-stringifies, so read this first.
  const modelSteps = produced.processSteps;
  let stepsRepaired = false;
  let stepsMalformed = false;
  if (typeof modelSteps === "string" && modelSteps.trim()) {
    try {
      JSON.parse(modelSteps);
    } catch (err) {
      const repaired = parseProcessStepsValue(modelSteps);
      stepsRepaired = repaired !== null;
      stepsMalformed = repaired === null;
      console.log(`    info ${g.id} run ${run}: processSteps needed the engine repair — ${String(err).slice(0, 140)}`);
    }
  }
  const finalized = finalizeProblemOutcome(produced, snapshot);
  const steps = asProcessStepResults(finalized.processSteps) ?? [];
  const failures: string[] = [];
  if (steps.length === 0) failures.push("processSteps missing or malformed");
  const rawRigor = validated.scores.process_rigor ?? null;
  const derived = deriveProcessRigorScore(steps);
  const base = typeConfig!.postProcessScores
    ? typeConfig!.postProcessScores(validated.scores, { terminationReason: null, outcome: finalized })
    : validated.scores;
  const scores: Record<string, number | null> = { ...base, ...(derived !== null ? { process_rigor: derived } : {}) };

  const e = g.expect;
  const s = (k: string) => scores[k] ?? null;
  const stepKeys = framework.steps.map((x) => x.key);
  if (JSON.stringify(steps.map((x) => x.key)) !== JSON.stringify(stepKeys)) failures.push(`step keys ${steps.map((x) => x.key).join(",")}`);
  const cmp = (k: string, min?: number, max?: number) => {
    const v = s(k);
    if (min !== undefined && (v === null || v < min)) failures.push(`${k}=${v} < ${min}`);
    if (max !== undefined && (v === null || v > max)) failures.push(`${k}=${v} > ${max}`);
  };
  cmp("process_rigor", e.processRigorMin, e.processRigorMax);
  cmp("technical_accuracy", e.technicalMin, e.technicalMax);
  cmp("commercial_judgment", e.commercialMin, e.commercialMax);
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
  const verdicts = steps.map((st) => NOTE_PREFIX.exec(st.note ?? "")?.[1]?.toLowerCase() ?? null);
  const prefixedNotes = verdicts.filter((v) => v !== null).length;
  const otherVerdicts = steps
    .map((st, i) => (verdicts[i] && verdicts[i] !== "yes" && verdicts[i] !== "no" ? `${st.key}=${verdicts[i]}` : null))
    .filter((x): x is string => x !== null);
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
    steps,
    prefixedNotes,
    otherVerdicts,
    noteSaysNo,
    prefixStatusConflicts,
    nestedQuoteSteps,
    stepsRepaired,
    stepsMalformed,
    failures,
    notes: (raw as Record<string, unknown>).rubric_notes ?? null,
  };
}

const ABBR: Record<string, string> = { hit: "H", prompted: "P", missed: "M", not_applicable: "-" };

async function main() {
  console.log(`Engine type "${typeConfig!.slug}"; model ${MODEL}; ${GOLDENS.length} transcripts × ${RUNS} run(s)\n`);
  const all: Graded[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      GOLDENS.map((g) =>
        grade(g, run).catch((err) => ({ id: g.id, run, scores: {}, rawRigor: null, nonVerbatim: [], steps: [], prefixedNotes: 0, otherVerdicts: [], noteSaysNo: 0, prefixStatusConflicts: [], nestedQuoteSteps: [], stepsRepaired: false, stepsMalformed: false, failures: [`error: ${String(err)}`], notes: null }) as Graded),
      ),
    );
    for (const r of results) {
      const sc = (k: string) => String(r.scores[k] ?? "–");
      console.log(
        `run ${run}  ${r.id.padEnd(14)} rigor ${sc("process_rigor")} (raw ${r.rawRigor ?? "–"})  tech ${sc("technical_accuracy")}  comm ${sc("commercial_judgment")}  content ${sc("content")}  behav ${sc("behavioral")}  steps ${r.steps.map((x) => ABBR[x.status] ?? "?").join("")}${r.nonVerbatim.length ? `  [non-verbatim: ${r.nonVerbatim.join(",")}]` : ""}  ${r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "PASS"}`,
      );
      // The stored notes verbatim: defect 1's signature is a note that says
      // "no." on a step the nudge record makes "prompted".
      console.log(
        `         note prefix ${r.prefixedNotes}/${r.steps.length}; says-no ${r.noteSaysNo}` +
          `${r.otherVerdicts.length ? `; OTHER-VERDICT ${r.otherVerdicts.join(",")}` : ""}` +
          `${r.prefixStatusConflicts.length ? `; CONFLICT note-says-no but status ${r.prefixStatusConflicts.join(",")}` : ""}` +
          `${r.nestedQuoteSteps.length ? `; NESTED-QUOTE ${r.nestedQuoteSteps.join(",")}` : ""}` +
          `${r.stepsRepaired ? "; REPAIRED" : ""}${r.stepsMalformed ? "; MALFORMED" : ""}`,
      );
      for (const st of r.steps) console.log(`         note ${st.key} [${st.status}]: ${(st.note ?? "").replace(/\s+/g, " ")}`);
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
    const pass = rs.filter((r) => r.failures.length === 0).length;
    console.log(`  ${g.id.padEnd(14)} rigor ${span("process_rigor")}  tech ${span("technical_accuracy")}  comm ${span("commercial_judgment")}  steps ${[...patterns].join(" / ")}  pass ${pass}/${rs.length}`);
  }
  const rawDisagree = all.filter((r) => r.rawRigor !== null && r.rawRigor !== r.scores.process_rigor).length;
  console.log(`\nModel's raw process_rigor disagreed with the derived value: ${rawDisagree}/${all.length}`);
  console.log(`Non-verbatim evidence quotes: ${all.reduce((n, r) => n + r.nonVerbatim.length, 0)}`);

  // The two grading rules the shared problem addendum carries (6cc4258, fixed
  // in f4359f6) — same counters as the case and PM studies.
  const slots = all.reduce((n, r) => n + r.steps.length, 0);
  const prefixed = all.reduce((n, r) => n + r.prefixedNotes, 0);
  const saysNo = all.reduce((n, r) => n + r.noteSaysNo, 0);
  const other = all.flatMap((r) => r.otherVerdicts.map((v) => `${r.id} run ${r.run} ${v}`));
  const conflicts = all.flatMap((r) => r.prefixStatusConflicts.map((c) => `${r.id} run ${r.run} ${c}`));
  const nested = all.flatMap((r) => r.nestedQuoteSteps.map((k) => `${r.id} run ${r.run} ${k}`));
  const repaired = all.filter((r) => r.stepsRepaired).map((r) => `${r.id} run ${r.run}`);
  const malformed = all.filter((r) => r.stepsMalformed).map((r) => `${r.id} run ${r.run}`);
  console.log(`'Meets all criteria:' prefix present in ${prefixed}/${slots} stored step notes (${saysNo} say no)`);
  console.log(`Prefix verdicts other than yes./no.: ${other.length}${other.length ? ` — ${other.join("; ")}` : ""}`);
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
