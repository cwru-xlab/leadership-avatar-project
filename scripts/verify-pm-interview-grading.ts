/**
 * PM interview VALIDITY STUDY — grades golden transcripts with the real
 * evaluator and asserts the report says what a FAANG PM interviewer would.
 *
 * Path: the app's own `runEvaluation` (same model, same OpenAI call, same
 * strict json_schema from `buildRubricJsonSchema`), against the registry's
 * `product-management` record (built by `makeProblemInterviewTypeConfig`),
 * with the question's private brief from `buildProblemEvaluatorBrief` passed
 * as `evaluationContext.problemBrief` — exactly what the evaluation runner
 * does. A fixture's `nudgesIssued` stands in for the server's nudge record
 * (what the live markers would have logged); the produced outcome then goes
 * through the runner's `finalizeProblemOutcome` before steps are checked.
 *
 * The schema order is the engine's: `buildRubricJsonSchema` emits `outcome`
 * before the `*_score` properties for every problem interview (asserted by
 * scripts/verify-rubric-schema-order.ts), so there is no script-local
 * reordering to opt into here.
 *
 * Run:   npx tsx scripts/verify-pm-interview-grading.ts [--runs=3] [--only=a-strong]
 * Needs: OPENAI_API_KEY (.env.local). Exit code non-zero on any failed check.
 */

import { config as loadEnv } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv();

import { runEvaluation } from "../lib/engine/evaluation";
import { getEngineType } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { getPmFramework } from "../lib/pm-interview/frameworks";
import { PM_INTERVIEW_SLUG } from "../lib/pm-interview/prompts";
import { getPmQuestion } from "../lib/pm-interview/questions";
import { buildProblemEvaluatorBrief } from "../lib/problem-interview/prompts";
import { finalizeProblemOutcome } from "../lib/problem-interview/outcome";
import { buildProblemSessionSnapshot } from "../lib/problem-interview/session-state";
import {
  PROCESS_STEP_STATUSES,
  type ProcessStepResult,
} from "../lib/problem-interview/types";

interface Fixture {
  id: string;
  label: string;
  questionId: string;
  /**
   * A documented, still-open grading gap. Failures in this fixture are
   * printed as KNOWN-GAP and do not fail the run, so the exit code keeps
   * catching regressions while the gap stays visible.
   */
  knownGap?: string;
  expect: {
    processRigorMin?: number;
    processRigorMax?: number;
    stepsHit?: string[];
    stepsMissed?: string[];
    stepsPrompted?: string[];
    stepsNotHit?: string[];
    productSenseMax?: number;
    analyticalJudgmentMax?: number;
  };
  turns: Array<{ t: string; who: "Interviewer" | "Candidate"; text: string }>;
  /** The server's nudge record for this session (step key + transcript time). */
  nudgesIssued?: Array<{ stepKey: string; t: string }>;
}

const args = process.argv.slice(2);
const runs = Number(args.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? "1");
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

const FIXTURE_DIR = join(__dirname, "fixtures", "pm-interview");
const fixtures: Fixture[] = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8")) as Fixture)
  .filter((f) => !only || f.id.startsWith(only));

let failures = 0;
let knownGapMisses = 0;
let currentKnownGap: string | undefined;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`    ok   ${name}`);
  else if (currentKnownGap) {
    knownGapMisses += 1;
    console.log(`    KNOWN-GAP ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`    FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function parseSteps(raw: unknown): ProcessStepResult[] | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (s): s is ProcessStepResult =>
        !!s &&
        typeof s === "object" &&
        typeof (s as ProcessStepResult).key === "string" &&
        (PROCESS_STEP_STATUSES as readonly string[]).includes((s as ProcessStepResult).status),
    );
  } catch {
    return null;
  }
}

interface RunRow {
  fixture: string;
  run: number;
  scores: Record<string, number | null>;
  steps: Record<string, string>;
}

async function gradeOnce(fx: Fixture, run: number): Promise<RunRow | null> {
  const question = getPmQuestion(fx.questionId);
  if (!question) {
    check(`${fx.id}: question exists`, false, fx.questionId);
    return null;
  }
  const type = getEngineType(PM_INTERVIEW_SLUG)!;
  const framework = getPmFramework(question.frameworkKey)!;
  const toSeconds = (t: string) => t.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
  const events = (fx.nudgesIssued ?? []).map((n, i) => ({
    kind: "nudge" as const,
    step: n.stepKey,
    atSeconds: toSeconds(n.t),
    turnIndex: i,
  }));
  const snapshot = buildProblemSessionSnapshot(question, framework, new Date(0).toISOString());
  snapshot.events = events;
  const problemBrief = buildProblemEvaluatorBrief({
    questionId: question.id,
    frameworkKey: framework.key,
    question,
    publicTitle: question.title,
    publicPrompt: question.prompt,
    framework,
    events,
  });
  {
    const resolved = resolveFromTypeConfig(type, {});
    if (!resolved.ok) {
      check(`${fx.id}: resolves`, false, resolved.reason);
      return null;
    }
    const transcript = fx.turns
      .map((t) => `[${t.t}] ${t.who}: ${t.text}`)
      .join("\n\n");
    const result = await runEvaluation({
      config: resolved.config,
      transcript,
      evaluationContext: { kind: "interview", customization: resolved.config.customization, problemBrief },
      metricsOutcome: { visualMetrics: null, vocalMetrics: null },
    });
    if (!result.ok) {
      check(`${fx.id} run ${run}: evaluation ok`, false, result.reason);
      return null;
    }
    const scores = result.result.scores;
    let outcome: Record<string, unknown> = result.producedOutcome ?? {};
    const modelLabel = result.model;
    const rawQuestionId = outcome.questionId;
    outcome = finalizeProblemOutcome(outcome, snapshot);
    const steps = parseSteps(outcome.processSteps);
    console.log(`\n  ${fx.label}  [run ${run}, ${modelLabel}]`);
    // Synchronous from here to the return, so concurrent fixtures don't interleave.
    currentKnownGap = fx.knownGap;
    if (fx.knownGap) console.log(`    (known gap: ${fx.knownGap})`);
    check("outcome.questionId matches", rawQuestionId === question.id, String(rawQuestionId));
    check("processSteps parses", steps !== null, String(outcome.processSteps).slice(0, 200));
    const byKey: Record<string, string> = {};
    const evidence: Record<string, string> = {};
    for (const s of steps ?? []) {
      byKey[s.key] = s.status;
      evidence[s.key] = s.evidenceQuote;
    }
    const why = (k: string) => `${byKey[k]} — evidence: "${(evidence[k] ?? "").slice(0, 160)}"`;
    check(
      "one result per framework step",
      framework.steps.every((s) => s.key in byKey),
      `missing: ${framework.steps.filter((s) => !(s.key in byKey)).map((s) => s.key).join(", ")}`,
    );

    const pr = scores.process_rigor ?? null;
    const ps = scores.product_sense ?? null;
    const aj = scores.analytical_judgment ?? null;
    console.log(
      `    scores: process_rigor=${pr} product_sense=${ps} analytical_judgment=${aj} content=${scores.content} behavioral=${scores.behavioral}`,
    );
    console.log(`    steps:  ${framework.steps.map((s) => `${s.key}=${byKey[s.key] ?? "?"}`).join("  ")}`);

    // Test-side mirror of PROCESS_RIGOR_SCORING_GUIDE, to measure whether the
    // model's score follows its own step results.
    const applicable = Object.values(byKey).filter((s) => s !== "not_applicable");
    const missed = applicable.filter((s) => s === "missed").length;
    const prompted = applicable.filter((s) => s === "prompted").length;
    const band =
      missed >= 3 ? 1
      : missed === 2 || prompted >= 3 ? 2
      : missed === 1 || prompted === 2 ? 3
      : prompted === 1 ? 4
      : 5;
    // INFORMATIONAL, not a failure: the model's own process_rigor_score can
    // still disagree with the band its step results imply. The report uses
    // the band derived from the steps — see the validity doc. Assertions on
    // process rigor below therefore use `band`.
    console.log(
      `    info process_rigor model=${pr} derived-from-steps=${band} (${missed} missed, ${prompted} prompted)${pr === band ? "" : "  <-- model disagrees with its own steps"}`,
    );

    const e = fx.expect;
    if (e.processRigorMin !== undefined)
      check(`process_rigor (derived) ≥ ${e.processRigorMin}`, band >= e.processRigorMin, String(band));
    if (e.processRigorMax !== undefined)
      check(`process_rigor (derived) ≤ ${e.processRigorMax}`, band <= e.processRigorMax, String(band));
    if (e.productSenseMax !== undefined)
      check(`product_sense ≤ ${e.productSenseMax}`, ps !== null && ps <= e.productSenseMax, String(ps));
    if (e.analyticalJudgmentMax !== undefined)
      check(`analytical_judgment ≤ ${e.analyticalJudgmentMax}`, aj !== null && aj <= e.analyticalJudgmentMax, String(aj));
    for (const k of e.stepsHit ?? []) check(`${k} = hit`, byKey[k] === "hit", why(k));
    for (const k of e.stepsMissed ?? []) check(`${k} = missed`, byKey[k] === "missed", why(k));
    for (const k of e.stepsPrompted ?? []) check(`${k} = prompted`, byKey[k] === "prompted", why(k));
    for (const k of e.stepsNotHit ?? [])
      check(`${k} ≠ hit`, byKey[k] === "missed" || byKey[k] === "prompted", why(k));

    currentKnownGap = undefined;
    return {
      fixture: fx.id,
      run,
      scores: { process_rigor: pr, band, product_sense: ps, analytical_judgment: aj, content: scores.content ?? null },
      steps: byKey,
    };
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(2);
  }
  console.log(`PM grading validity — ${fixtures.length} fixtures × ${runs} run(s)`);
  const rows: RunRow[] = [];
  for (let run = 1; run <= runs; run++) {
    const results = await Promise.all(fixtures.map((fx) => gradeOnce(fx, run)));
    for (const r of results) if (r) rows.push(r);
  }

  console.log("\nSUMMARY per run: process_rigor model(derived) / product_sense / analytical_judgment");
  for (const fx of fixtures) {
    const mine = rows.filter((r) => r.fixture === fx.id);
    const cells = mine.map(
      (r) => `${r.scores.process_rigor}(${r.scores.band})/${r.scores.product_sense}/${r.scores.analytical_judgment}`,
    );
    console.log(`  ${fx.id.padEnd(34)} ${cells.join("  ")}`);
  }
  if (knownGapMisses > 0) console.log(`\n${knownGapMisses} known-gap miss(es) (documented; not counted as failures)`);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
