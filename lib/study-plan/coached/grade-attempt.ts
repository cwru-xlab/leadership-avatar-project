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
 *
 * Phase 23 L6 (grading validity): an attempt must answer THIS moment's
 * prompt. In a real run the student replayed their moment-1 answer for an
 * unrelated moment-2 prompt and it was graded 5/5. The grader now returns
 * `onTopic`; an off-topic answer is never acceptable and its score is capped
 * at OFF_TOPIC_MAX_SCORE. This is a policy cap on a VALID response, not a
 * repair of a malformed one. (Verbatim reuse of another leg's words is caught
 * deterministically in coach.ts before the grader is called.)
 */

export const COACHED_ACCEPTABLE_SCORE = 4; // PROVISIONAL UNTIL CALIBRATED
export const MAX_GRADE_ATTEMPTS = 3; // first call + two retries
export const OFF_TOPIC_MAX_SCORE = 1;
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
  /** False when the attempt does not answer this moment's prompt. */
  onTopic: boolean;
}

/** Returns the raw (unvalidated) model JSON. Injectable for the battery. */
export type Grader = (args: GradeAttemptInput) => Promise<unknown>;

const GRADE_SCHEMA = {
  name: "coached_attempt_grade",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["onTopic", "score", "acceptable", "rationale"],
    properties: {
      onTopic: { type: "boolean" },
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
    "leadership conversation. FIRST decide onTopic: does the attempt answer the same " +
    "question the original line answered (questionTheyWereAnswering) and stay on the same " +
    "situation as the original line? An answer about a different situation, project, story " +
    "or question is off-topic however well it is delivered: then onTopic=false, score=1, " +
    "acceptable=false, and the rationale says it does not answer this question. " +
    "Otherwise judge ONLY the single competency given, using the " +
    "rubric dimensions as what good looks like. Score 1 (not shown at all) to 5 " +
    "(fully shown). Set acceptable=true only if the attempt genuinely shows the " +
    "competency. Do not reward length, polish or vocabulary unrelated to the " +
    "competency. The rationale is one or two plain sentences, 300 characters max.";

  const payload: Record<string, unknown> = {
    competency: args.competency,
    rubricDimensions: args.rubricDimensions,
    originalLine: args.originalLine,
    questionTheyWereAnswering: args.counterpartLine,
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
  // Required from the model (strict schema); an injected stub may omit it.
  if (r.onTopic !== undefined && typeof r.onTopic !== "boolean") return "onTopic must be boolean";
  if (
    typeof r.rationale !== "string" ||
    r.rationale.trim().length < 1 ||
    r.rationale.length > MAX_RATIONALE_LENGTH
  ) {
    return `rationale must be 1..${MAX_RATIONALE_LENGTH} chars`;
  }
  return { score: r.score, acceptable: r.acceptable, rationale: r.rationale.trim(), onTopic: r.onTopic !== false };
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
    if (!v.onTopic) {
      return { score: Math.min(v.score, OFF_TOPIC_MAX_SCORE), acceptable: false, rationale: v.rationale, onTopic: false };
    }
    return {
      score: v.score,
      // Both must agree.
      acceptable: v.acceptable && v.score >= COACHED_ACCEPTABLE_SCORE,
      rationale: v.rationale,
      onTopic: true,
    };
  }
  throw new Error(`gradeCoachedAttempt: grader failed after ${MAX_GRADE_ATTEMPTS} attempts (${lastProblem})`);
}
