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
import type { DrillDeliverySummary, DrillPointers } from "./types";
import { allowedDrillTechniques } from "./brief";
import { gradingSampling } from "../grading-determinism";

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
    required: ["score", "feedback", "rationale", "miss_quote", "miss_technique_id", "worked_quote", "worked_note"],
    properties: {
      score: { type: "integer", enum: [1, 2, 3, 4, 5] },
      feedback: { type: "string" },
      rationale: { type: "string" },
      miss_quote: { type: "string" },
      miss_technique_id: { type: "string" },
      worked_quote: { type: "string" },
      worked_note: { type: "string" },
    },
  },
} as const;

export const DRILL_GRADING_SYSTEM_PROMPT = `You grade one short spoken practice rep ("voice drill") for a leadership-practice student.

Score ONLY the named competency, on this scale: 1 = not shown at all, 2 = attempted but weak, 3 = adequate, 4 = strong, 5 = excellent. "rubric_anchors" describes what a 1, a 3 and a 5 look like for THIS competency: match the transcript to the closest anchor (2 and 4 sit between them). Reserve 5 for an answer that fully meets the 5 anchor. Judge the transcript against the competency; use the delivery figures only as supporting evidence for delivery-related competencies. Do not score anything else.

"feedback" is ONE sentence telling the student what to try next time: name a technique or move, in the second person. Never give them words to say, never quote them, never write a sample line.
"rationale" is 1-2 sentences explaining the score, for the record.

Point at the student's ACTUAL words:
- "miss_quote": a short excerpt (3-25 words, one sentence at most) copied CHARACTER FOR CHARACTER from the transcript, at the spot where the competency was weakest or the technique was missing — the spot your "feedback" is about. REQUIRED whenever the score is below 5; "" only for a 5.
- "miss_technique_id": exactly one id from "allowed_techniques" — the technique to try at that spot. "" when miss_quote is "".
- "worked_quote": ONLY when the score is 4 or 5, a short excerpt (3-25 words, one sentence at most) copied character for character from the transcript where the competency was shown well; otherwise "".
- "worked_note": ONLY when the score is 4 or 5, one short second-person sentence naming what worked there (do not quote); otherwise "".
Never invent or tidy up an excerpt: if you cannot copy it exactly, return "".`;

/**
 * One-line anchors for a 1, a 3 and a 5 on each competency, sent with every
 * drill grade so the scale means the same thing on every call.
 * PROVISIONAL UNTIL CALIBRATED (scripts/calibrate-graders.ts measures spread).
 */
export const DRILL_RUBRIC_ANCHORS: Readonly<Record<CompetencyKey, { 1: string; 3: string; 5: string }>> = {
  delivery_presence: {
    1: "Halting or rushed throughout; heavy filler; the point is lost in how it is said.",
    3: "Understandable and mostly steady, with noticeable filler, rushing or flat stretches.",
    5: "Measured, confident and varied; pauses land the key points; almost no filler.",
  },
  structure_and_clarity: {
    1: "No discernible structure; the main point is missing or buried; ideas run together.",
    3: "A main point is present and steps are followable, but it arrives late or sentences carry several ideas.",
    5: "Leads with the point, moves through clearly separated steps with transitions, and closes back on the point.",
  },
  concision_and_focus: {
    1: "Mostly preamble or tangents; the answer never gets to the point.",
    3: "Gets to the point but with padding, repetition or one unneeded detour.",
    5: "Every sentence earns its place; no preamble, no repetition, one supporting detail per claim.",
  },
  audience_attunement: {
    1: "Ignores the listener's question, terms or feelings; talks past them.",
    3: "Answers the question asked but in the speaker's own frame, with little acknowledgement of the listener.",
    5: "Picks up the listener's words and concerns, checks understanding, and shapes the answer to them.",
  },
  holding_position_under_pressure: {
    1: "Abandons or contradicts the position at the first pushback, or becomes defensive.",
    3: "Keeps the position but wavers, over-qualifies, or does not acknowledge the objection.",
    5: "Acknowledges the objection, then holds the position calmly with a reason; warm tone, firm content.",
  },
  credibility_of_the_case: {
    1: "Claims with no support; vague or unverifiable.",
    3: "Some support, but general, unsourced or loosely tied to the claim.",
    5: "Specific, sourced evidence tied directly to the ask, with one honest limit acknowledged.",
  },
  outcome_achievement: {
    1: "No goal stated or pursued; ends without any next step.",
    3: "A goal is implied and partly pursued, but the close is vague.",
    5: "States the goal, steers toward it, and ends with a concrete, agreed next step.",
  },
};

/** Excerpt bounds for a pointer quote. PROVISIONAL UNTIL CALIBRATED. */
export const POINTER_QUOTE_WORDS = { min: 3, max: 30 } as const;

/** Lower-case, unify quotes/dashes, collapse whitespace — with an index map back. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    let ch = text[i];
    if (/[\u2018\u2019\u201B]/.test(ch)) ch = "'";
    else if (/[\u201C\u201D]/.test(ch)) ch = '"';
    else if (/[\u2013\u2014]/.test(ch)) ch = "-";
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else {
      lastSpace = false;
    }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm: norm.trimEnd(), map };
}

/**
 * PURE. Returns the student's own words for `quote` — the matching slice of
 * `transcript` — or null when the quote is not a substring of it (after
 * whitespace/case/curly-quote normalization) or is outside the word bounds.
 * Surrounding quote marks and ellipses the model may add are ignored.
 */
export function exactExcerpt(quote: string, transcript: string): string | null {
  let cleaned = quote.trim().replace(/^["'\u201C\u2018…. ]+|["'\u201D\u2019… ]+$/g, "").trim();
  // An over-long excerpt is shortened to its opening sentence, then to the
  // word cap: a prefix of an exact excerpt is still the student's own words.
  if (cleaned.split(/\s+/).filter(Boolean).length > POINTER_QUOTE_WORDS.max) {
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0];
    const tokens = firstSentence.split(/\s+/).filter(Boolean);
    cleaned = tokens.slice(0, POINTER_QUOTE_WORDS.max).join(" ");
  }
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  if (words < POINTER_QUOTE_WORDS.min) return null;
  const q = normalizeWithMap(cleaned).norm.trim();
  const t = normalizeWithMap(transcript);
  const at = t.norm.indexOf(q);
  if (!q || at === -1) return null;
  const start = t.map[at];
  const end = t.map[at + q.length - 1];
  return transcript.slice(start, end + 1);
}

/**
 * PURE gate for the "point at their words" pointers. Each pointer is kept only
 * when its quote is an exact excerpt of the transcript; the miss technique
 * must come from the competency's closed library (else the drill's own
 * technique, else dropped); "what worked" only for a 4-5 and only with a note
 * that passes the tip rules.
 */
export function parseDrillPointers(
  p: Record<string, unknown>,
  ctx: { competencyKey: CompetencyKey; transcript: string; score: number; drillTechniqueId?: string | null },
): DrillPointers {
  // Q2: a content drill never points at a body/voice-only technique.
  const library = allowedDrillTechniques(ctx.competencyKey);
  let miss: DrillPointers["miss"] = null;
  const missQuote = typeof p.miss_quote === "string" ? exactExcerpt(p.miss_quote, ctx.transcript) : null;
  if (missQuote) {
    const technique =
      library.find((t) => t.id === p.miss_technique_id) ??
      library.find((t) => t.id === ctx.drillTechniqueId) ??
      null;
    if (technique) {
      miss = { quote: missQuote, techniqueId: technique.id, techniqueName: technique.name, reminder: technique.reminder };
    }
  }
  let worked: DrillPointers["worked"] = null;
  if (ctx.score >= 4) {
    const workedQuote = typeof p.worked_quote === "string" ? exactExcerpt(p.worked_quote, ctx.transcript) : null;
    const note = typeof p.worked_note === "string" ? p.worked_note.trim() : "";
    if (workedQuote && note && note.length <= 200 && validateTip(note, { studentLine: ctx.transcript }).ok) {
      worked = { quote: workedQuote, note };
    }
  }
  return { miss, worked };
}

/**
 * The pointers ride in the existing `graderRationale` text column as a JSON
 * envelope (no schema change). PURE; a legacy plain-text rationale reads back
 * as `{ rationale: text, pointers: null }`.
 */
export function encodeGraderRecord(rationale: string, pointers: DrillPointers): string {
  return JSON.stringify({ v: 1, rationale, pointers });
}

export function decodeGraderRecord(stored: string | null): { rationale: string; pointers: DrillPointers | null } {
  if (!stored) return { rationale: "", pointers: null };
  try {
    const parsed = JSON.parse(stored) as { v?: unknown; rationale?: unknown; pointers?: unknown };
    if (parsed && parsed.v === 1 && parsed.pointers && typeof parsed.pointers === "object") {
      const ptr = parsed.pointers as DrillPointers;
      return {
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
        pointers: { miss: ptr.miss ?? null, worked: ptr.worked ?? null },
      };
    }
  } catch {
    // legacy plain text
  }
  return { rationale: stored, pointers: null };
}

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
  /** Exact-excerpt pointers into the student's own words (may be empty). */
  pointers: DrillPointers;
  model: string;
}

/**
 * PURE gate over a raw model response. Exported for the battery.
 * `excludeTechniqueReminder` is the drill's own live tip, so a replacement
 * note is a different move where the library allows.
 */
export function parseDrillGrade(
  raw: unknown,
  ctx: {
    competencyKey: CompetencyKey;
    transcript: string;
    model: string;
    excludeTechniqueReminder?: string;
    drillTechniqueId?: string | null;
  },
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
  const pointers = parseDrillPointers(p, {
    competencyKey: ctx.competencyKey,
    transcript: ctx.transcript,
    score,
    drillTechniqueId: ctx.drillTechniqueId,
  });
  const proposed = typeof p.feedback === "string" ? p.feedback.trim() : "";
  const verdict = proposed ? validateTip(proposed, { studentLine: ctx.transcript }) : null;
  if (proposed && verdict?.ok) {
    return { score, feedback: proposed, feedbackReplaced: false, rationale, pointers, model: ctx.model };
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
    pointers,
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
    max_tokens: 700,
    ...gradingSampling(payload.model),
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
  techniqueId?: string | null;
  transcript: string;
  delivery: DrillDeliverySummary;
  callModel?: (payload: { model: string; system: string; user: string }) => Promise<unknown>;
  /** Q1's one note regeneration; defaults to a real model call. */
  callNoteModel?: (payload: { model: string; system: string; user: string }) => Promise<unknown>;
}): Promise<DrillGrade> {
  const model = process.env.DRILL_GRADING_MODEL || process.env.CHECK_GRADING_MODEL || "gpt-4.1";
  const competency = COMPETENCIES.find((c) => c.key === args.competencyKey);
  if (!competency) throw new DrillGradingFailedError(`unknown competency ${args.competencyKey}`);

  const user = JSON.stringify({
    competency: { label: competency.label, description: competency.description },
    scenario: args.scenarioPrompt,
    rubric_anchors: DRILL_RUBRIC_ANCHORS[args.competencyKey],
    live_technique_reminder: args.tipText,
    allowed_techniques: allowedDrillTechniques(args.competencyKey).map((t) => ({ id: t.id, name: t.name, reminder: t.reminder })),
    transcript: args.transcript,
    delivery: args.delivery,
  });

  let raw: unknown;
  try {
    raw = await (args.callModel ?? defaultCallModel)({ model, system: DRILL_GRADING_SYSTEM_PROMPT, user });
  } catch (error) {
    throw new DrillGradingFailedError(error instanceof Error ? error.message : String(error));
  }
  const grade = parseDrillGrade(raw, {
    competencyKey: args.competencyKey,
    transcript: args.transcript,
    model,
    excludeTechniqueReminder: args.tipText,
    drillTechniqueId: args.techniqueId ?? null,
  });

  // Q1: the note must be about the technique the quote points at. One
  // regeneration; if that does not match either, the technique's reminder.
  const miss = grade.pointers.miss;
  if (!miss || (!grade.feedbackReplaced && noteMatchesTechnique(grade.feedback, miss.techniqueId, args.competencyKey))) {
    return grade;
  }
  let regenerated: string | null = null;
  try {
    const rawNote = await (args.callNoteModel ?? defaultCallNoteModel)({
      model,
      system: DRILL_NOTE_SYSTEM_PROMPT,
      user: JSON.stringify({
        competency: competency.label,
        technique: { name: miss.techniqueName, reminder: miss.reminder },
        where_in_their_answer: miss.quote,
      }),
    });
    const parsedNote = typeof rawNote === "string" ? (JSON.parse(rawNote) as { feedback?: unknown }) : (rawNote as { feedback?: unknown });
    regenerated = typeof parsedNote?.feedback === "string" ? parsedNote.feedback.trim() : null;
  } catch {
    regenerated = null;
  }
  return reconcileNote(grade, regenerated, args.competencyKey, args.transcript);
}

export const DRILL_NOTE_SYSTEM_PROMPT = `Write ONE sentence, in the second person, telling a student what to try next time. It must be about the named technique and nothing else, applied at the named spot in their answer. Never give them words to say, never quote them, never write a sample line. Return {"feedback": "..."}.`;

const DRILL_NOTE_SCHEMA = {
  name: "voice_drill_note",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["feedback"],
    properties: { feedback: { type: "string" } },
  },
} as const;

async function defaultCallNoteModel(payload: { model: string; system: string; user: string }): Promise<unknown> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
  const completion = await openai.chat.completions.create({
    model: payload.model,
    messages: [
      { role: "system", content: payload.system },
      { role: "user", content: payload.user },
    ],
    max_tokens: 150,
    ...gradingSampling(payload.model),
    response_format: { type: "json_schema", json_schema: DRILL_NOTE_SCHEMA },
  });
  return completion.choices[0]?.message?.content ?? "";
}

const NOTE_STOPWORDS = new Set(["your", "with", "that", "this", "them", "what", "when", "next", "time", "more", "each", "just", "into", "from", "they", "their", "then", "than", "before", "after"]);

/** Crude stem so "splitting"/"split", "sentences"/"sentence" meet. */
function stemmedWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 3 && !NOTE_STOPWORDS.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1")),
  );
}

/**
 * PURE (Q1): the note is "about" `techniqueId` when that technique shares at
 * least two (stemmed) words with it and no other technique of the competency
 * shares more. PROVISIONAL UNTIL CALIBRATED.
 */
export function noteMatchesTechnique(note: string, techniqueId: string, competencyKey: CompetencyKey): boolean {
  const noteWords = stemmedWords(note);
  let target = 0;
  let bestOther = 0;
  for (const t of techniquesForCompetency(competencyKey)) {
    let score = 0;
    for (const w of stemmedWords(`${t.name} ${t.reminder}`)) if (noteWords.has(w)) score += 1;
    if (t.id === techniqueId) target = score;
    else bestOther = Math.max(bestOther, score);
  }
  return target >= 2 && target >= bestOther;
}

/**
 * PURE: the technique a retry should focus on. The miss pointer's technique
 * when there is one; otherwise the allowed library technique the note is
 * about, by the SAME overlap matcher (`noteMatchesTechnique`); else null.
 */
export function retryFocusFor(
  pointers: DrillPointers | null,
  feedback: string | null,
  competencyKey: CompetencyKey | undefined,
): { techniqueId: string; techniqueName: string } | null {
  if (pointers?.miss) return { techniqueId: pointers.miss.techniqueId, techniqueName: pointers.miss.techniqueName };
  if (!feedback || !competencyKey) return null;
  const match = allowedDrillTechniques(competencyKey).find((t) => noteMatchesTechnique(feedback, t.id, competencyKey));
  return match ? { techniqueId: match.id, techniqueName: match.name } : null;
}

/**
 * PURE (Q1): picks the final note once a regeneration was tried. The
 * regenerated note is kept only if it passes the tip rules AND matches the
 * pointer's technique; otherwise the technique's own reminder is the note.
 */
export function reconcileNote(
  grade: DrillGrade,
  regenerated: string | null,
  competencyKey: CompetencyKey,
  transcript: string,
): DrillGrade {
  const miss = grade.pointers.miss;
  if (!miss) return grade;
  if (
    regenerated &&
    validateTip(regenerated, { studentLine: transcript }).ok &&
    noteMatchesTechnique(regenerated, miss.techniqueId, competencyKey)
  ) {
    return { ...grade, feedback: regenerated, feedbackReplaced: false };
  }
  return { ...grade, feedback: miss.reminder, feedbackReplaced: true };
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
