/**
 * Interview evaluation module.
 *
 * The only place scores are produced. Calls `INTERVIEW_EVALUATOR_PROMPT`
 * (imported verbatim, never modified here) in JSON mode and validates the
 * response before anything is stored. Visual and Vocal scores are forced to
 * null in code — Phase 8 will supply a real video/audio metrics pipeline.
 *
 * This module is a pure library: no Prisma, no S3, no `next/server`. The
 * caller (an API route) owns persistence and request handling.
 */

import { INTERVIEW_EVALUATOR_PROMPT } from "./prompts";

// ---------------------------------------------------------------------------
// JSON schema — must match INTERVIEW_EVALUATOR_PROMPT's declared output shape
// exactly: {visual_score, vocal_score, content_score, behavioral_score,
// report_markdown}.
// ---------------------------------------------------------------------------

export const EVALUATION_JSON_SCHEMA = {
  name: "interview_evaluation",
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

export interface RawEvaluation {
  visual_score: unknown;
  vocal_score: unknown;
  content_score: unknown;
  behavioral_score: unknown;
  report_markdown: unknown;
}

export interface ValidatedEvaluation {
  visualScore: null; // typed null — Phase 8 widens this
  vocalScore: null;
  contentScore: number | null;
  behavioralScore: number | null;
  reportMarkdown: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns `value` only if it is a number, an integer, and within the 1-5
 * rubric range. Everything else — strings (even numeric-looking ones like
 * "4"), floats, out-of-range integers, NaN, null, undefined — becomes null.
 * A string score means the model ignored the schema and must not be trusted,
 * so this never parses strings.
 */
function coerceScore(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

/**
 * Enforces the evaluator prompt's CRITICAL RULE ON MISSING DATA in code,
 * not just in the prompt text. Visual and Vocal scores are ALWAYS null here,
 * discarding whatever the model returned — no metrics pipeline exists yet
 * (deferred to Phase 8). Content and Behavioral scores are coerced to null
 * if they are not a clean 1-5 integer. Throws if the report body is empty,
 * so the caller records FAILED instead of storing a blank report.
 */
export function validateEvaluationResult(raw: unknown): ValidatedEvaluation {
  const r = (raw ?? {}) as Partial<RawEvaluation>;

  const reportMarkdown =
    typeof r.report_markdown === "string" ? r.report_markdown.trim() : "";
  if (!reportMarkdown) {
    throw new Error("Evaluator returned an empty report body");
  }

  return {
    // Enforced in code, not just in the prompt. Phase 8 supplies real metrics.
    visualScore: null,
    vocalScore: null,
    contentScore: coerceScore(r.content_score),
    behavioralScore: coerceScore(r.behavioral_score),
    reportMarkdown,
  };
}

/** True if either Content or Behavioral is non-null — used to decide whether a READY report is meaningful. */
export function hasAnyScore(e: ValidatedEvaluation): boolean {
  return e.contentScore !== null || e.behavioralScore !== null;
}

// ---------------------------------------------------------------------------
// runInterviewEvaluation
// ---------------------------------------------------------------------------

export interface EvaluationInput {
  /** Speaker-labeled transcript text. Produced by formatTranscriptForEvaluator. */
  fullTranscript: string;
  /** Snapshot of the candidate's extracted resume text. "" when skipped. */
  resumeText: string;
  roleContext: { roleTitle: string; industry: string; difficulty: string };
}

export interface EvaluationOutcome {
  ok: true;
  result: ValidatedEvaluation;
  model: string;
}

export interface EvaluationFailure {
  ok: false;
  reason: string;
  model: string;
}

const MAX_REASON_LENGTH = 500;

function truncateReason(reason: string): string {
  return reason.length > MAX_REASON_LENGTH
    ? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`
    : reason;
}

function buildUserMessage(input: EvaluationInput): string {
  const resumeSection = input.resumeText.trim() || "(No resume was provided.)";
  const roleContextJson = JSON.stringify({
    role_title: input.roleContext.roleTitle,
    industry: input.roleContext.industry,
    difficulty: input.roleContext.difficulty,
  });

  return `full_transcript:
${input.fullTranscript}

resume_text:
${resumeSection}

role_context:
${roleContextJson}

visual_metrics: null
vocal_metrics: null`;
}

async function attemptEvaluation(
  input: EvaluationInput,
  model: string,
  timeoutMs: number
): Promise<ValidatedEvaluation> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: INTERVIEW_EVALUATOR_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    max_tokens: 4000,
    response_format: {
      type: "json_schema",
      json_schema: EVALUATION_JSON_SCHEMA,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Evaluator returned no content");
  }

  const parsed = JSON.parse(content) as unknown;
  return validateEvaluationResult(parsed);
}

/**
 * Runs the interview evaluator once, retries once on failure, and NEVER
 * throws — the caller must always be able to record a FAILED report with a
 * readable reason rather than crashing a background job.
 */
export async function runInterviewEvaluation(
  input: EvaluationInput
): Promise<EvaluationOutcome | EvaluationFailure> {
  const model = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";

  // Budget mirrors app/api/interaction/finish/route.ts: total 50s, one retry,
  // so each attempt gets half.
  const BUDGET_MS = 50_000;
  const RETRIES = 1;
  const PER_ATTEMPT_TIMEOUT = Math.floor(BUDGET_MS / (RETRIES + 1));
  const RETRY_DELAY_MS = 1_000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    try {
      const result = await attemptEvaluation(input, model, PER_ATTEMPT_TIMEOUT);
      console.info("Interview evaluation completed", {
        model,
        contentScore: result.contentScore,
        behavioralScore: result.behavioralScore,
        markdownLength: result.reportMarkdown.length,
      });
      return { ok: true, result, model };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt <= RETRIES) {
        console.warn(
          `Interview evaluation attempt ${attempt} failed, retrying: ${message}`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  const reason = truncateReason(
    `Evaluation failed after ${RETRIES + 1} attempts: ${finalMessage}`
  );

  return { ok: false, reason, model };
}
