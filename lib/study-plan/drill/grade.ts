/**
 * Grades a finished VOICE_DRILL attempt — ONLY at the end (23-CONTEXT.md:
 * "numeric grade ONLY at the end"). One model call, strict JSON schema,
 * scoring ONLY the drill's competency on the shared 1-5 rubric scale
 * (normalized for the ledger by `normalizeRubricScore`, never restated).
 *
 * The "what to try next time" note is held to the tip rules
 * (coached/tips.ts `validateTip`: no quoted speech, no script cue, no
 * first-person line, no echo of the student's own words, length cap). A note
 * that fails is REPLACED by a library technique reminder, never repaired.
 * A score that fails validation fails the grade (the attempt stays
 * ungraded and the client can retry completion) — a fabricated score would
 * be worse than none.
 */
import { COMPETENCIES, type CompetencyKey } from "../../mastery/competencies";
import type { ContributionInput } from "../../mastery/ledger";
import { normalizeRubricScore } from "../../mastery/weights";
import type { VisualMetrics, VocalMetrics } from "../../metrics/types";
import { techniquesForCompetency, validateTip } from "../coached/tips";
import type { DrillDeliverySummary } from "./types";

export class DrillGradingFailedError extends Error {
  constructor(reason: string) {
    super(`Voice drill grading failed: ${reason}`);
    this.name = "DrillGradingFailedError";
  }
}

export const DRILL_GRADING_SCHEMA = {
  name: "voice_drill_grade",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["score", "feedback", "rationale"],
    properties: {
      score: { type: "integer", enum: [1, 2, 3, 4, 5] },
      feedback: { type: "string" },
      rationale: { type: "string" },
    },
  },
} as const;

export const DRILL_GRADING_SYSTEM_PROMPT = `You grade one short spoken practice rep ("voice drill") for a leadership-practice student.

Score ONLY the named competency, on this scale: 1 = not shown at all, 2 = attempted but weak, 3 = adequate, 4 = strong, 5 = excellent. Judge the transcript against the competency; use the delivery figures only as supporting evidence for delivery-related competencies. Do not score anything else.

"feedback" is ONE sentence telling the student what to try next time: name a technique or move, in the second person. Never give them words to say, never quote them, never write a sample line.
"rationale" is 1-2 sentences explaining the score, for the record.`;

/** PURE: the delivery figures shown with a result. */
export function deliverySummary(
  visual: VisualMetrics | null,
  vocal: VocalMetrics | null,
  spokenDurationMs: number | null,
): DrillDeliverySummary {
  return {
    wordsPerMinute: vocal ? Math.round(vocal.words_per_minute) : null,
    fillerWordCount: vocal ? vocal.filler_word_count : null,
    pauseCount: vocal ? vocal.pause_count : null,
    eyeContactPct: visual ? Math.round(visual.eye_contact_pct) : null,
    spokenSeconds: typeof spokenDurationMs === "number" ? Math.round(spokenDurationMs / 1000) : null,
  };
}

export interface DrillGrade {
  score: number;
  feedback: string;
  /** True when the model's note was replaced by a library reminder. */
  feedbackReplaced: boolean;
  rationale: string;
  model: string;
}

/**
 * PURE gate over a raw model response. Exported for the battery.
 * `excludeTechniqueReminder` is the drill's own live tip, so a replacement
 * note is a different move where the library allows.
 */
export function parseDrillGrade(
  raw: unknown,
  ctx: { competencyKey: CompetencyKey; transcript: string; model: string; excludeTechniqueReminder?: string },
): DrillGrade {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new DrillGradingFailedError("model output is not JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new DrillGradingFailedError("model output is not an object");
  const p = parsed as Record<string, unknown>;

  const score = p.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
    throw new DrillGradingFailedError(`score ${JSON.stringify(score)} is not an integer in 1..5`);
  }
  // Throws on anything normalizeRubricScore rejects — the single scale source.
  normalizeRubricScore(score);

  const rationale = typeof p.rationale === "string" ? p.rationale.trim().slice(0, 1000) : "";
  const proposed = typeof p.feedback === "string" ? p.feedback.trim() : "";
  const verdict = proposed ? validateTip(proposed, { studentLine: ctx.transcript }) : null;
  if (proposed && verdict?.ok) {
    return { score, feedback: proposed, feedbackReplaced: false, rationale, model: ctx.model };
  }
  const library = techniquesForCompetency(ctx.competencyKey);
  const replacement =
    library.find((t) => t.reminder !== ctx.excludeTechniqueReminder) ?? library[0];
  const label = COMPETENCIES.find((c) => c.key === ctx.competencyKey)?.label ?? ctx.competencyKey;
  return {
    score,
    feedback: replacement ? replacement.reminder : `Next time, keep ${label.toLowerCase()} in focus from your first sentence.`,
    feedbackReplaced: true,
    rationale,
    model: ctx.model,
  };
}

async function defaultCallModel(payload: { model: string; system: string; user: string }): Promise<unknown> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  const completion = await openai.chat.completions.create({
    model: payload.model,
    messages: [
      { role: "system", content: payload.system },
      { role: "user", content: payload.user },
    ],
    max_tokens: 500,
    response_format: { type: "json_schema", json_schema: DRILL_GRADING_SCHEMA },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Drill grader returned no content");
  return content;
}

export async function gradeDrillAttempt(args: {
  competencyKey: CompetencyKey;
  scenarioPrompt: string;
  tipText: string;
  transcript: string;
  delivery: DrillDeliverySummary;
  callModel?: (payload: { model: string; system: string; user: string }) => Promise<unknown>;
}): Promise<DrillGrade> {
  const model = process.env.DRILL_GRADING_MODEL || process.env.CHECK_GRADING_MODEL || "gpt-4.1";
  const competency = COMPETENCIES.find((c) => c.key === args.competencyKey);
  if (!competency) throw new DrillGradingFailedError(`unknown competency ${args.competencyKey}`);

  const user = JSON.stringify({
    competency: { label: competency.label, description: competency.description },
    scenario: args.scenarioPrompt,
    live_technique_reminder: args.tipText,
    transcript: args.transcript,
    delivery: args.delivery,
  });

  let raw: unknown;
  try {
    raw = await (args.callModel ?? defaultCallModel)({ model, system: DRILL_GRADING_SYSTEM_PROMPT, user });
  } catch (error) {
    throw new DrillGradingFailedError(error instanceof Error ? error.message : String(error));
  }
  return parseDrillGrade(raw, {
    competencyKey: args.competencyKey,
    transcript: args.transcript,
    model,
    excludeTechniqueReminder: args.tipText,
  });
}

/**
 * PURE: the ONE ledger row a graded attempt writes, at the VOICE_DRILL
 * weight (bound to COACHED_SESSION in lib/mastery/weights.ts). `occurredAt`
 * is the attempt's completion time, not the clock.
 */
export function contributionInputFromDrillAttempt(args: {
  userId: string;
  attemptId: string;
  competencyKey: CompetencyKey;
  score: number;
  completedAt: Date;
}): ContributionInput {
  return {
    userId: args.userId,
    competencyKey: args.competencyKey,
    source: "VOICE_DRILL",
    rawScore: normalizeRubricScore(args.score),
    occurredAt: args.completedAt,
    sourceReportId: null,
    sourceAttemptId: null,
    sourceCoachedSessionId: null,
    sourceVoiceDrillAttemptId: args.attemptId,
  };
}
