/**
 * Questioned-persona grading VALIDITY study (REAL OpenAI calls).
 *
 * Grades the golden transcripts in `scripts/fixtures/persona-golden.ts` with
 * the REAL registered `clinical-communication` and `motivational-interviewing`
 * types: their evaluator prompts, the same model (INTERVIEW_EVAL_MODEL ||
 * gpt-4.1), the strict json_schema from `buildRubricJsonSchema`, the engine's
 * `buildPersonaEvaluationContext`, `validateEvaluationResult` — and, as the
 * runner does it, the supplementary pass FIRST, so the behavior counts the
 * rubric evaluator reads are the ones `countCodes` derived in code.
 *
 * Three things are measured per golden:
 *  1. CODING: the live tagger's per-utterance codes, counted by `countCodes`,
 *     against the author's hand coding (`expectCounts`), and the derived
 *     metric bands against `expectMetricBands`. The hand coding is itself
 *     asserted to satisfy its own bands by
 *     `scripts/verify-questioned-persona.ts`, so a failure here is the model.
 *  2. CHECKLIST: the judge's step verdicts and which hidden facts it believed
 *     were elicited (`expectSteps`, `expectFacts`), plus whether every
 *     evidence quote is verbatim from a student utterance.
 *  3. RUBRIC: the narrative evaluator's extra-dimension scores
 *     (`expectGlobals`) and whether it obeyed the two JSON rules the sibling
 *     system-design study proved — no double quotes inside a string field,
 *     and every rubric note starting with the Meets-all-criteria verdict.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-questioned-persona-grading.ts [--runs 2] [--only cc-strong,mi-strong] [--json out.json]
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

import { validateEvaluationResult } from "../lib/engine/evaluation";
import { getEngineType } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import type { DifficultConversationInstance } from "../lib/engine/types";
import { evaluatorNoteFor, runPersonaAnalysis } from "../lib/questioned-persona/analysis";
import { PERSONA_CASES, findPersonaCase } from "../lib/questioned-persona/cases";
import { locateQuote, studentUtterances } from "../lib/questioned-persona/coding";
import { buildPersonaEvaluationContext } from "../lib/questioned-persona/prompts";
import type { PersonaAnalysis, PersonaStyle } from "../lib/questioned-persona/types";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";

import { GOLDEN, goldenTurns, type GoldenTranscript } from "./fixtures/persona-golden";

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 1);
const ONLY = argOf("--only")?.split(",");
const JSON_OUT = argOf("--json");
const MODEL = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";
const GOLDENS = GOLDEN.filter((g) => !ONLY || ONLY.includes(g.id));
const STARTED_AT = 1_700_000_000_000;

for (const style of ["clinical-communication", "motivational-interviewing"] as const) {
  const t = getEngineType(style);
  if (!t?.supplementaryAnalysis) {
    throw new Error(`${style} is not registered with a supplementaryAnalysis pass`);
  }
}

/**
 * The resolved config a real session would hand the evaluator: the engine's
 * difficult-conversation instance with the persona card attached, exactly as
 * `resolveDifficultConversationInstance` builds it.
 */
function resolveFor(g: GoldenTranscript) {
  const record = findPersonaCase(g.caseId);
  if (!record) throw new Error(`golden ${g.id}: unknown case ${g.caseId}`);
  const style = record.personaCard.style;
  const typeConfig = getEngineType(style)!;
  const instance: DifficultConversationInstance = {
    kind: "difficult-conversation",
    conversationId: record.id,
    source: "seeded",
    role: record.avatarRole,
    studentRole: record.studentRole,
    situation: record.situation,
    sharedBackstory: record.sharedBackstory,
    hiddenPosition: record.hiddenPosition,
    studentObjective: record.studentObjective,
    stakes: record.stakes,
    difficulty: record.difficulty,
    avatarId: "golden-avatar",
    voiceId: "golden-voice",
    personaCard: record.personaCard,
  };
  const resolved = resolveFromTypeConfig(typeConfig, { instance });
  if (!resolved.ok) throw new Error(`golden ${g.id}: ${resolved.reason}`);
  return { style, typeConfig, config: resolved.config, card: record.personaCard };
}

/** The transcript the evaluator reads, in the engine's Clinician/Patient voice. */
function transcriptText(style: PersonaStyle, g: GoldenTranscript): string {
  const them = style === "clinical-communication" ? "Patient" : "Client";
  const you = style === "clinical-communication" ? "Clinician" : "Counselor";
  return goldenTurns(g, STARTED_AT)
    .map((t) => {
      const at = Math.round((t.timestamp - STARTED_AT) / 1000);
      const ss = String(at % 60).padStart(2, "0");
      return `[${Math.floor(at / 60)}:${ss}] ${t.role === "user" ? you : them}: ${t.content}`;
    })
    .join("\n");
}

interface Graded {
  id: string;
  style: PersonaStyle;
  run: number;
  /** Extra-dimension scores only; the shared four are not asserted. */
  scores: Record<string, number | null>;
  counts: Record<string, number>;
  bands: Record<string, string | undefined>;
  steps: Record<string, string>;
  facts: Record<string, boolean>;
  nonVerbatim: string[];
  doubleQuoted: string[];
  missingVerdict: string[];
  failures: string[];
}

async function grade(g: GoldenTranscript, run: number): Promise<Graded> {
  const { style, typeConfig, config, card } = resolveFor(g);
  const turns = goldenTurns(g, STARTED_AT);
  const failures: string[] = [];

  // 1. The supplementary pass, run exactly as evaluation-runner runs it.
  const analysis: PersonaAnalysis = await runPersonaAnalysis({
    style,
    card,
    turns,
    startedAt: STARTED_AT,
  });

  // 2. The rubric evaluator, with the behavior-coding note appended to the
  //    brief the way the runner appends it.
  const base = buildPersonaEvaluationContext(config);
  const brief = `${base.evaluatorBrief}\n\nBehavior coding:\n${evaluatorNoteFor(analysis)}`;
  const schema = buildRubricJsonSchema(config);
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 120_000,
    maxRetries: 1,
  });
  const roleContext = JSON.stringify({ role_title: "", industry: "", difficulty: "" });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}`,
      },
      {
        role: "user",
        content: `case_context:\n${brief}\n\nfull_transcript:\n${transcriptText(style, g)}\n\nresume_text:\n(No resume was provided.)\n\nrole_context:\n${roleContext}\n\nvisual_metrics: null\nvocal_metrics: null`,
      },
    ],
    max_tokens: 4000,
    response_format: { type: "json_schema", json_schema: schema },
  });
  const content = completion.choices[0]!.message.content!;
  let raw: unknown = null;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    failures.push(`report JSON did not parse: ${(err as Error).message.slice(0, 80)}`);
  }
  const validated = raw
    ? validateEvaluationResult(
        raw,
        config,
        { hasVisualMetrics: false, hasVocalMetrics: false },
        { ...base },
      )
    : null;

  // 3. Assertions.
  const scores: Record<string, number | null> = {};
  for (const d of typeConfig.extraRubricDimensions) {
    scores[d.key] = validated?.scores[d.key] ?? null;
    if (scores[d.key] === null) failures.push(`${d.key} score absent`);
  }
  for (const [key, [lo, hi]] of Object.entries(g.expectGlobals ?? {})) {
    const v = scores[key] ?? null;
    if (v === null || v < lo || v > hi) failures.push(`${key}=${v} outside ${lo}-${hi}`);
  }

  const counts = analysis.counts;
  for (const [code, [lo, hi]] of Object.entries(g.expectCounts ?? {})) {
    const v = counts[code] ?? 0;
    if (v < lo || v > hi) failures.push(`count ${code}=${v} outside ${lo}-${hi}`);
  }
  for (const s of g.expectCountSums ?? []) {
    const v = s.codes.reduce((n, c) => n + (counts[c] ?? 0), 0);
    if (v < s.band[0] || v > s.band[1]) {
      failures.push(`${s.label}=${v} outside ${s.band[0]}-${s.band[1]}`);
    }
  }
  const bands: Record<string, string | undefined> = {};
  for (const m of analysis.metrics) bands[m.key] = m.band;
  for (const [key, want] of Object.entries(g.expectMetricBands ?? {})) {
    if (bands[key] !== want) {
      failures.push(`metric ${key} band=${bands[key] ?? "none"} (want ${want})`);
    }
  }

  const steps: Record<string, string> = {};
  for (const s of analysis.steps) steps[s.key] = s.status;
  for (const [key, want] of Object.entries(g.expectSteps)) {
    if (steps[key] !== want) failures.push(`step ${key}=${steps[key] ?? "absent"} (want ${want})`);
  }

  const facts: Record<string, boolean> = {};
  for (const f of analysis.facts) facts[f.id] = f.elicited;
  for (const [id, want] of Object.entries(g.expectFacts)) {
    if (facts[id] !== want) failures.push(`fact ${id}=${facts[id] ?? "absent"} (want ${want})`);
  }

  // Evidence must be the student's own words. `assembleAnalysis` already
  // drops a quote that is not verbatim, so a hit step with an EMPTY quote is
  // the signal that the judge invented one.
  const utterances = studentUtterances(turns, STARTED_AT);
  const nonVerbatim = analysis.steps
    .filter((s) => s.status === "hit" && (!s.evidenceQuote || !locateQuote(s.evidenceQuote, utterances)))
    .map((s) => s.key);
  if (nonVerbatim.length > 0) {
    failures.push(`hit steps with no verbatim evidence: ${nonVerbatim.join(",")}`);
  }

  // The two rules the sibling study proved. A double quote inside a string
  // field corrupts the JSON for the next reader.
  const strings: Array<[string, string]> = [];
  if (validated) {
    const r = validated.reportStructured;
    strings.push(["overall_summary", r.overall_summary], ["practice_next", r.practice_next]);
    r.strengths.forEach((s, i) => strings.push([`strengths[${i}].detail`, s.detail]));
    r.growth_areas.forEach((s, i) =>
      strings.push([`growth[${i}].detail`, s.detail], [`growth[${i}].suggestion`, s.suggestion]),
    );
    r.rubric_notes.forEach((s, i) => strings.push([`rubric_notes[${i}].note`, s.note]));
  }
  const doubleQuoted = strings.filter(([, v]) => v.includes('"')).map(([k]) => k);
  if (doubleQuoted.length > 0) failures.push(`double quotes inside: ${doubleQuoted.join(",")}`);

  const notes = validated?.reportStructured.rubric_notes ?? [];
  const missingVerdict = notes
    .filter((n) => !/^Meets all criteria: (yes|no)\./.test(n.note.trim()))
    .map((n) => n.item);
  if (notes.length === 0) failures.push("rubric_notes empty");
  if (missingVerdict.length > 0) {
    failures.push(`notes without a Meets-all-criteria verdict: ${missingVerdict.join(",")}`);
  }

  return {
    id: g.id,
    style,
    run,
    scores,
    counts,
    bands,
    steps,
    facts,
    nonVerbatim,
    doubleQuoted,
    missingVerdict,
    failures,
  };
}

const ABBR: Record<string, string> = { hit: "H", missed: "M", not_applicable: "-" };

function row(r: Graded): string {
  const sc = Object.entries(r.scores)
    .map(([k, v]) => `${k.slice(0, 5)} ${v ?? "–"}`)
    .join(" ");
  const st = Object.values(r.steps)
    .map((v) => ABBR[v] ?? "?")
    .join("");
  const fa = Object.values(r.facts).filter(Boolean).length;
  return `run ${r.run}  ${r.id.padEnd(20)} ${sc}  steps ${st}  facts ${fa}/${Object.keys(r.facts).length}  ${r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "PASS"}`;
}

function errorRow(g: GoldenTranscript, run: number, err: unknown): Graded {
  return {
    id: g.id,
    style: "clinical-communication",
    run,
    scores: {},
    counts: {},
    bands: {},
    steps: {},
    facts: {},
    nonVerbatim: [],
    doubleQuoted: [],
    missingVerdict: [],
    failures: [`error: ${String(err).slice(0, 160)}`],
  };
}

async function main() {
  console.log(
    `model ${MODEL}; ${GOLDENS.length} golden transcript(s) × ${RUNS} run(s) over ${PERSONA_CASES.length} registered cases`,
  );
  console.log(
    "each graded run makes 3 real calls: tagger + judge (the supplementary pass) and the rubric evaluator\n",
  );
  const all: Graded[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results: Graded[] = [];
    // Two at a time keeps rate limits and output order calm.
    for (let i = 0; i < GOLDENS.length; i += 2) {
      results.push(
        ...(await Promise.all(
          GOLDENS.slice(i, i + 2).map((g) => grade(g, run).catch((err) => errorRow(g, run, err))),
        )),
      );
    }
    for (const r of results) console.log(row(r));
    all.push(...results);
  }

  const sum = (pick: (r: Graded) => number) => all.reduce((n, r) => n + pick(r), 0);
  console.log(
    `\nDouble quotes inside a JSON string field: ${sum((r) => r.doubleQuoted.length)} over ${all.length} reports`,
  );
  console.log(
    `Rubric notes missing the Meets-all-criteria verdict: ${sum((r) => r.missingVerdict.length)}`,
  );
  console.log(
    `Hit steps whose evidence was not the student's own words: ${sum((r) => r.nonVerbatim.length)}`,
  );

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
  const failed = all.filter((r) => r.failures.length > 0);
  console.log(`\n${all.length - failed.length}/${all.length} graded runs met every expectation\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
