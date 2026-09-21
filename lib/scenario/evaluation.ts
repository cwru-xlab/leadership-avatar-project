/**
 * Scenario evaluation module.
 *
 * The scenario analogue of `lib/interview/evaluation.ts`, which stays
 * untouched and diff-empty. This module copies that file's structure
 * (schema-constrained JSON call, retry/timeout budget, hardcoded-null
 * validator, logging discipline) rather than importing from it, so the two
 * evaluators can evolve independently.
 *
 * The only place scenario scores are produced. Calls
 * `SCENARIO_EVALUATOR_PROMPT` (imported verbatim, never modified here) in
 * JSON mode and validates the response before anything is stored. Visual
 * and Vocal scores are forced to null in code — this is a Phase 6 project
 * decision reaffirmed here, unblocked only by Phase 10's real video/audio
 * metrics pipeline. A model claiming otherwise is discarded, not trusted.
 *
 * This module is a pure library: no Prisma, no S3, no `next/server`. The
 * caller (09-04's runner) owns persistence and turns a throw into a FAILED
 * report row.
 */

import {
  SCENARIO_EVALUATOR_PROMPT,
  buildScenarioEvaluationUserMessage,
  type ScenarioEvaluationCharacter,
} from "./prompts";

// ---------------------------------------------------------------------------
// JSON schema — must match SCENARIO_EVALUATOR_PROMPT's declared output shape
// exactly: {visual_score, vocal_score, content_score, behavioral_score,
// report_markdown}.
// ---------------------------------------------------------------------------

export const SCENARIO_EVALUATION_JSON_SCHEMA = {
  name: "scenario_evaluation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "visual_score",
      "vocal_score",
      "content_score",
      "behavioral_score",
      "report_markdown",
    ],
    properties: {
      visual_score: { type: ["integer", "null"], minimum: 1, maximum: 5 },
      vocal_score: { type: ["integer", "null"], minimum: 1, maximum: 5 },
      content_score: { type: ["integer", "null"], minimum: 1, maximum: 5 },
      behavioral_score: { type: ["integer", "null"], minimum: 1, maximum: 5 },
      report_markdown: { type: "string" },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawScenarioEvaluation {
  visual_score: unknown;
  vocal_score: unknown;
  content_score: unknown;
  behavioral_score: unknown;
  report_markdown: unknown;
}

/**
 * `visualScore`/`vocalScore` are typed `null` (not `number | null`) so a
 * regression that tries to pass a model's number through is a compile
 * error, not a runtime surprise.
 */
export interface ScenarioEvaluationResult {
  visualScore: null;
  vocalScore: null;
  contentScore: number | null;
  behavioralScore: number | null;
  reportMarkdown: string;
  evalModel: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns `value` only if it is a number, an integer, and within the 1-5
 * rubric range. Everything else — strings (even numeric-looking ones like
 * "4"), floats, out-of-range integers, NaN, null, undefined — becomes null.
 * A string score means the model ignored the schema and must not be
 * trusted, so this never parses strings.
 */
function coerceScore(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

/**
 * Enforces the evaluator prompt's CRITICAL RULE ON MISSING DATA in code,
 * not just in the prompt text. Visual and Vocal scores are ALWAYS null
 * here, discarding whatever the model returned — no metrics pipeline
 * exists yet (deferred to Phase 10; a Phase 6 project decision). Content
 * and Behavioral scores are coerced to null if they are not a clean 1-5
 * integer — "Not scored" is a legitimate, distinct outcome from "Not yet
 * measured" (the distinction 06-08 established and the report page already
 * renders differently). Throws if the report body is empty, so the caller
 * records FAILED instead of storing a blank report.
 */
export function validateScenarioEvaluationResult(
  raw: unknown
): Omit<ScenarioEvaluationResult, "evalModel"> {
  const r = (raw ?? {}) as Partial<RawScenarioEvaluation>;

  const reportMarkdown =
    typeof r.report_markdown === "string" ? r.report_markdown.trim() : "";
  if (!reportMarkdown) {
    throw new ScenarioEvaluationError("Evaluator returned an empty report body");
  }

  return {
    // Enforced in code, not just in the prompt. Phase 10 supplies real
    // visual/vocal metrics; until then this is always null, unconditionally.
    visualScore: null,
    vocalScore: null,
    contentScore: coerceScore(r.content_score),
    behavioralScore: coerceScore(r.behavioral_score),
    reportMarkdown,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Typed error thrown on an unusable evaluator response. Never a partial result. */
export class ScenarioEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioEvaluationError";
  }
}

// ---------------------------------------------------------------------------
// runScenarioEvaluation
// ---------------------------------------------------------------------------

export interface RunScenarioEvaluationInput {
  caseName: string;
  background: string;
  characters: ScenarioEvaluationCharacter[];
  authorCriteria: string | null;
  transcript: string;
}

const BUDGET_MS = 50_000;
const RETRIES = 1;
const PER_ATTEMPT_TIMEOUT = Math.floor(BUDGET_MS / (RETRIES + 1));
const RETRY_DELAY_MS = 1_000;

async function attemptScenarioEvaluation(
  input: RunScenarioEvaluationInput,
  model: string,
  timeoutMs: number
): Promise<Omit<ScenarioEvaluationResult, "evalModel">> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const userMessage = buildScenarioEvaluationUserMessage(input);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SCENARIO_EVALUATOR_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 4000,
    response_format: {
      type: "json_schema",
      json_schema: SCENARIO_EVALUATION_JSON_SCHEMA,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new ScenarioEvaluationError("Evaluator returned no content");
  }

  const parsed = JSON.parse(content) as unknown;
  return validateScenarioEvaluationResult(parsed);
}

/**
 * Runs the scenario evaluator once, retries once on failure. Unlike the
 * interview evaluator, this THROWS a `ScenarioEvaluationError` on final
 * failure rather than returning a discriminated-union failure value — the
 * caller (09-04's runner) is responsible for catching it and recording a
 * FAILED report row. Never returns a partially-built result.
 *
 * Never logs the transcript, the author criteria, or the report markdown —
 * only lengths, the model name, and the error class, matching
 * `app/api/interview/persona/distill/route.ts`'s established discipline.
 */
export async function runScenarioEvaluation(
  input: RunScenarioEvaluationInput
): Promise<ScenarioEvaluationResult> {
  const model = process.env.SCENARIO_EVAL_MODEL || "gpt-4.1";

  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    try {
      const result = await attemptScenarioEvaluation(
        input,
        model,
        PER_ATTEMPT_TIMEOUT
      );
      console.info("Scenario evaluation completed", {
        model,
        transcriptLength: input.transcript.length,
        authorCriteriaLength: input.authorCriteria?.length ?? 0,
        contentScore: result.contentScore,
        behavioralScore: result.behavioralScore,
        markdownLength: result.reportMarkdown.length,
      });
      return { ...result, evalModel: model };
    } catch (error) {
      lastError = error;
      const errorClass =
        error instanceof Error ? error.constructor.name : typeof error;
      if (attempt <= RETRIES) {
        console.warn("Scenario evaluation attempt failed, retrying", {
          attempt,
          model,
          errorClass,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  const errorClass =
    lastError instanceof Error ? lastError.constructor.name : typeof lastError;
  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  console.error("Scenario evaluation failed after all attempts", {
    model,
    attempts: RETRIES + 1,
    errorClass,
  });
  throw new ScenarioEvaluationError(
    `Scenario evaluation failed after ${RETRIES + 1} attempts: ${finalMessage}`
  );
}
