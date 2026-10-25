/**
 * Decides whether a student's REPLY to a coach question is in fact a reworked
 * answer (Phase 23 L1).
 *
 * The failure it fixes: in a real run the student's first reply to the
 * diagnosis question was already a strong rework, but a REPLY was never
 * graded, so the coach could not close the leg (LEG_DONE needs an acceptable
 * attempt) and burned two more turns on questions. A reply that re-answers
 * the original prompt is now graded as an ATTEMPT.
 *
 * Deterministic pre-filters run first and never consult a model:
 *   - fewer than MIN_ATTEMPT_WORDS words is a reply;
 *   - (in coach.ts, before this is called) repeating a technique reminder back
 *     is never an attempt.
 * Then a model judges "re-answers the original prompt vs talks about it". A
 * classifier failure falls back to REPLY, the conservative side: the coach
 * then teaches and invites, which costs one turn, while a wrongly graded
 * reply could close a leg on something that was not an answer.
 */
import { gradingSampling } from "../grading-determinism";

export const MIN_ATTEMPT_WORDS = 12; // PROVISIONAL UNTIL CALIBRATED
export const MAX_CLASSIFY_ATTEMPTS = 2;

export interface ReplyClassifyInput {
  competency: { key: string; label: string; description: string };
  underlyingTypeName: string;
  counterpartLine: string | null;
  originalLine: string;
  coachQuestion: string | null;
  reply: string;
}

/** Returns raw (unvalidated) model JSON. Injectable for verifiers. */
export type ReplyClassifier = (input: ReplyClassifyInput) => Promise<unknown>;

export interface ReplyClassification {
  isAttempt: boolean;
  reason: "TOO_SHORT" | "REANSWERS_PROMPT" | "TALKS_ABOUT_ANSWER" | "CLASSIFIER_FAILED";
}

const SCHEMA = {
  name: "coached_reply_kind",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reanswers", "why"],
    properties: {
      reanswers: { type: "boolean" },
      why: { type: "string" },
    },
  },
} as const;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

async function defaultClassifier(input: ReplyClassifyInput): Promise<unknown> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20_000,
    maxRetries: 0,
  });
  const system =
    `A student is in a coaching session, reworking one line they said earlier in a ${input.underlyingTypeName} conversation. ` +
    "The coach has just asked them something. Decide whether the student's utterance is a REWORKED ANSWER: " +
    "they answer the original question again, directly, the way they would say it to the original listener " +
    "(it may start with a filler such as 'Sure' or 'OK, so'). It is NOT a reworked answer when they mainly talk " +
    "ABOUT their answer (what they meant, what they would change, what went wrong), ask a question, or repeat " +
    "coaching advice. Quality and topic do not matter here: a weak answer, or an answer that is about the " +
    "wrong situation, still counts as spoken AS an answer (it is graded separately). " +
    'Reply as JSON {"reanswers": boolean, "why": one short sentence}.';
  const completion = await openai.chat.completions.create({
    model: process.env.COACH_CLASSIFIER_MODEL || process.env.COACH_MODEL || "gpt-4.1",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({
          skill: input.competency.label,
          originalPrompt: input.counterpartLine,
          originalAnswer: input.originalLine,
          coachJustSaid: input.coachQuestion,
          studentUtterance: input.reply,
        }),
      },
    ],
    max_tokens: 120,
    ...gradingSampling(process.env.COACH_CLASSIFIER_MODEL || process.env.COACH_MODEL || "gpt-4.1"),
    response_format: { type: "json_schema", json_schema: SCHEMA },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Reply classifier returned no content");
  return JSON.parse(content);
}

export async function classifyReply(
  input: ReplyClassifyInput,
  opts?: { classifier?: ReplyClassifier },
): Promise<ReplyClassification> {
  if (wordCount(input.reply) < MIN_ATTEMPT_WORDS) return { isAttempt: false, reason: "TOO_SHORT" };
  const classifier = opts?.classifier ?? defaultClassifier;
  for (let i = 0; i < MAX_CLASSIFY_ATTEMPTS; i++) {
    let raw: unknown;
    try {
      raw = await classifier(input);
    } catch (err) {
      console.warn(`[coach] reply classification ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (raw && typeof raw === "object" && typeof (raw as { reanswers?: unknown }).reanswers === "boolean") {
      return (raw as { reanswers: boolean }).reanswers
        ? { isAttempt: true, reason: "REANSWERS_PROMPT" }
        : { isAttempt: false, reason: "TALKS_ABOUT_ANSWER" };
    }
  }
  return { isAttempt: false, reason: "CLASSIFIER_FAILED" };
}
