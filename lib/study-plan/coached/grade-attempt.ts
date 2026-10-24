/**
 * Grades a student's SPOKEN rework in a coached session against the coached
 * competency only (REQ-114).
 *
 * The grade is a model judgement, so it is never the sole gate: the server
 * requires BOTH the model's `acceptable` flag AND `score >= COACHED_ACCEPTABLE_SCORE`,
 * and `coach.ts` additionally forces `acceptable = false` for a parroted
 * demonstration (a mechanical check, `isParrotOf`, that never consults a model).
 *
 * Output is validated (integer 1..5, rationale 1..300 chars). A malformed
 * response is DISCARDED and the call retried twice, then this throws; it is
 * never repaired or clamped.
 *
 * PROVISIONAL UNTIL CALIBRATED: COACHED_ACCEPTABLE_SCORE.
 */

export const COACHED_ACCEPTABLE_SCORE = 4; // PROVISIONAL UNTIL CALIBRATED
export const MAX_GRADE_ATTEMPTS = 3; // first call + two retries
const MAX_RATIONALE_LENGTH = 300;

export interface GradeAttemptInput {
  competency: { key: string; label: string; description: string };
  rubricDimensions: Array<{ key: string; label: string; description?: string }>;
  counterpartLine: string | null;
  originalLine: string;
  attempt: string;
  spokenDurationMs: number;
  demonstration: string | null;
}

export interface CoachedAttemptGrade {
  score: number;
  acceptable: boolean;
  rationale: string;
}

/** Returns the raw (unvalidated) model JSON. Injectable for the battery. */
export type Grader = (args: GradeAttemptInput) => Promise<unknown>;

const GRADE_SCHEMA = {
  name: "coached_attempt_grade",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["score", "acceptable", "rationale"],
    properties: {
      score: { type: "integer", description: "1 (not shown) to 5 (fully shown)" },
      acceptable: { type: "boolean" },
      rationale: { type: "string" },
    },
  },
} as const;

export function wordsPerMinute(text: string, spokenDurationMs: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (spokenDurationMs <= 0) return 0;
  return Math.round((words / spokenDurationMs) * 60_000);
}

async function defaultGrader(args: GradeAttemptInput): Promise<unknown> {
  const OpenAI = (await import("openai")).default;
  const model = process.env.COACH_MODEL || "gpt-4.1";
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });

  const system =
    "You grade ONE spoken attempt by a student to rework a line from their own " +
    "leadership conversation. Judge ONLY the single competency given, using the " +
    "rubric dimensions as what good looks like. Score 1 (not shown at all) to 5 " +
    "(fully shown). Set acceptable=true only if the attempt genuinely shows the " +
    "competency. Do not reward length, polish or vocabulary unrelated to the " +
    "competency. The rationale is one or two plain sentences, 300 characters max.";

  const payload: Record<string, unknown> = {
    competency: args.competency,
    rubricDimensions: args.rubricDimensions,
    originalLine: args.originalLine,
    context: args.counterpartLine,
    attempt: args.attempt,
  };
  if (args.competency.key === "delivery_presence") {
    payload.wordsPerMinute = wordsPerMinute(args.attempt, args.spokenDurationMs);
    payload.spokenDurationMs = args.spokenDurationMs;
  }

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
    max_tokens: 400,
    response_format: { type: "json_schema", json_schema: GRADE_SCHEMA },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Coached attempt grader returned no content");
  return JSON.parse(content);
}

function validate(raw: unknown): CoachedAttemptGrade | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "not an object";
  const r = raw as Record<string, unknown>;
  if (typeof r.score !== "number" || !Number.isInteger(r.score) || r.score < 1 || r.score > 5) {
    return "score must be an integer 1..5";
  }
  if (typeof r.acceptable !== "boolean") return "acceptable must be boolean";
  if (
    typeof r.rationale !== "string" ||
    r.rationale.trim().length < 1 ||
    r.rationale.length > MAX_RATIONALE_LENGTH
  ) {
    return `rationale must be 1..${MAX_RATIONALE_LENGTH} chars`;
  }
  return { score: r.score, acceptable: r.acceptable, rationale: r.rationale.trim() };
}

export async function gradeCoachedAttempt(
  input: GradeAttemptInput,
  opts?: { grader?: Grader },
): Promise<CoachedAttemptGrade> {
  const grader = opts?.grader ?? defaultGrader;
  let lastProblem = "unknown";
  for (let i = 0; i < MAX_GRADE_ATTEMPTS; i++) {
    let raw: unknown;
    try {
      raw = await grader(input);
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
      continue;
    }
    const v = validate(raw);
    if (typeof v === "string") {
      lastProblem = v;
      continue;
    }
    return {
      score: v.score,
      // Both must agree.
      acceptable: v.acceptable && v.score >= COACHED_ACCEPTABLE_SCORE,
      rationale: v.rationale,
    };
  }
  throw new Error(`gradeCoachedAttempt: grader failed after ${MAX_GRADE_ATTEMPTS} attempts (${lastProblem})`);
}
