/**
 * VOICE_DRILL brief generation, at path-generation time (23-CONTEXT.md:
 * "a scenario prompt tailored from the student's own weak moment or plan
 * theme, and one live technique reminder").
 *
 * TWO LAYERS, following the knowledge-check generation pattern
 * (lib/study-plan/checks/generate.ts):
 *
 * 1. `templateBrief` — DETERMINISTIC, no model, always available. Every
 *    drill gets one first; a model failure can never leave a drill without a
 *    brief, and the drill GET route rebuilds it lazily if a write was lost.
 * 2. `generateDrillBriefs` — ONE optional model call for all drills of a
 *    path. Generation PROPOSES, validation DISPOSES: a candidate is used only
 *    if it survives every mechanical gate below, otherwise the template
 *    stands. Never repaired, never re-prompted.
 *
 * GATES (per candidate):
 *   - The tip is NEVER free text: the model picks a `technique_id` from the
 *     competency's closed TECHNIQUE_LIBRARY entries and the stored tip is
 *     that entry's reminder verbatim (coached/tips.ts Mechanism A: "name the
 *     skill, never script the words", safe by construction).
 *   - The scenario prompt passes `validateCoachSpeech` (no script cues, no
 *     quoted words that are not the student's own, length cap) — the same
 *     mechanical rules coach utterances obey.
 *   - A quote of the student is checked with `validateVerbatimQuote` against
 *     the stored transcript, must come from a moment supplied for THAT
 *     competency, and must appear verbatim inside the prompt (REQ-110).
 *   - Transcript text reaches the model ONLY through
 *     `prepareMomentsForGeneration` (REQ-109 redaction boundary).
 */
import { COMPETENCIES, type CompetencyKey } from "../../mastery/competencies";
import type { InterviewTranscript } from "../../interview/transcript";
import type { SessionMoment } from "../moments";
import { prepareMomentsForGeneration, redact } from "../moment-boundary";
import { validateVerbatimQuote } from "../verbatim";
import { techniquesForCompetency, validateCoachSpeech, type Technique } from "../coached/tips";
import { isWrittenTechnique } from "../checks/explain";
import { DRILL_DURATION, type PromptBasis, type VoiceDrillBrief } from "./types";

/** One generic, first-person situation per competency — the LAST-RESORT
 * template, used only when no moment, no source session and no theme can
 * tailor the prompt. Hand-written; no scripted words. */
export const SCENARIO_TEMPLATES: Readonly<Record<CompetencyKey, string>> = {
  delivery_presence:
    "I introduce myself and the piece of work I am proudest of, as if I were opening an interview.",
  structure_and_clarity:
    "I explain a decision I made recently: what I decided, why, and what happened as a result.",
  concision_and_focus:
    "I summarise a project I worked on so that someone outside my field understands its point.",
  audience_attunement:
    "A colleague tells me they are frustrated that a shared deadline slipped. I respond to them.",
  holding_position_under_pressure:
    "I have proposed a plan and my manager says it costs too much. I respond, and keep my case.",
  credibility_of_the_case:
    "I make the case for one change I would make where I work or study, and support it.",
  outcome_achievement:
    "I have a few minutes with a senior person who could help my career. I use them to come away with a concrete next step.",
};

const MAX_SCENARIO_LENGTH = 600;
const MIN_SCENARIO_LENGTH = 40;

function labelFor(key: CompetencyKey): string {
  return COMPETENCIES.find((c) => c.key === key)?.label ?? key;
}

function closingInstruction(key: CompetencyKey): string {
  return `I take ${DRILL_DURATION.minSeconds}-${DRILL_DURATION.maxSeconds} seconds and say it out loud, focusing on ${labelFor(key).toLowerCase()}.`;
}

/**
 * What the plan's source sessions say about the student (D4): the practice
 * type, the role/industry they practised for, and interviewer questions they
 * were actually asked. Questions are the INTERVIEWER's words (never the
 * student's), pass the same structural redactor as moments, and a question
 * the redactor would alter is dropped, never sent redacted.
 */
export interface DrillSessionContext {
  reportId: string;
  typeName: string;
  roleTitle: string | null;
  industry: string | null;
  questions: string[];
}

/** PROVISIONAL UNTIL CALIBRATED. */
const QUESTIONS_PER_SESSION = 5;
const QUESTION_LENGTH = { min: 20, max: 220 } as const;

/** PURE: the last question sentence of an interviewer line, or null. */
export function questionFromInterviewerLine(line: string, selfNames: string[]): string | null {
  const sentences = line.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const question = [...sentences].reverse().find((x) => x.endsWith("?"));
  if (!question) return null;
  if (question.length < QUESTION_LENGTH.min || question.length > QUESTION_LENGTH.max) return null;
  if (question.split(" ").length < 6) return null;
  if (/["\u201C\u201D]/.test(question)) return null;
  const { changed } = redact(question, selfNames);
  return changed ? null : question;
}

/** PURE: one context per source session, questions from its transcript. */
export function buildDrillSessionContexts(
  reports: ReadonlyArray<{ id: string; typeName: string; roleTitle: string | null; industry: string | null }>,
  transcriptsByReportId: ReadonlyMap<string, InterviewTranscript>,
  selfNames: string[],
): DrillSessionContext[] {
  return reports.map((report) => {
    const turns = transcriptsByReportId.get(report.id)?.turns ?? [];
    const questions: string[] = [];
    for (const turn of turns) {
      if (turn.role !== "assistant") continue;
      const q = questionFromInterviewerLine(turn.content, selfNames);
      if (q && !questions.includes(q)) questions.push(q);
      if (questions.length >= QUESTIONS_PER_SESSION) break;
    }
    return {
      reportId: report.id,
      typeName: report.typeName,
      roleTitle: report.roleTitle?.trim() || null,
      industry: report.industry?.trim() || null,
      questions,
    };
  });
}

function practisedFor(ctx: DrillSessionContext): string {
  const role = ctx.roleTitle ? ` for a ${ctx.roleTitle} role` : "";
  const industry = ctx.industry ? ` in ${ctx.industry}` : "";
  return `my ${ctx.typeName.toLowerCase()} practice${role}${industry}`;
}

export interface DrillRequest {
  /** Path position — the key the route uses to attach briefs to steps. */
  position: number;
  competencyKey: CompetencyKey;
  /** 0 for the first drill on this competency, 1 for the second. */
  variant: number;
  /** The plan theme that matched this competency, verbatim, if any. */
  theme: string | null;
}

/**
 * DETERMINISTIC brief. `moments` are the competency's source moments
 * (momentsByCompetency); only a moment's growth-area TITLE is used (the
 * evaluator's words), never transcript text, so the template needs no
 * redaction and quotes nobody.
 */
export function templateBrief(
  request: DrillRequest,
  moments: ReadonlyArray<Pick<SessionMoment, "linkedGrowthAreaTitles"> & Partial<Pick<SessionMoment, "precedingAvatarText">>>,
  opts: { sessions?: ReadonlyArray<DrillSessionContext>; selfNames?: string[] } = {},
): VoiceDrillBrief {

  const titled = moments.filter((m) => m.linkedGrowthAreaTitles.length > 0);
  const moment = titled.length ? titled[request.variant % titled.length] : null;

  // A real question from the source sessions, varied by path position.
  const selfNames = opts.selfNames ?? [];
  const asked = (opts.sessions ?? []).flatMap((ctx) => ctx.questions.map((question) => ({ ctx, question })));
  const pick = asked.length ? asked[(request.position + request.variant) % asked.length] : null;
  const sessionCtx = (opts.sessions ?? [])[0] ?? null;

  let promptBasis: PromptBasis;
  let scenarioPrompt: string;
  if (moment) {
    promptBasis = "MOMENT";
    const momentQuestion = moment.precedingAvatarText
      ? questionFromInterviewerLine(moment.precedingAvatarText, selfNames)
      : null;
    scenarioPrompt = momentQuestion
      ? `In one of the sessions this plan was built from, I was asked: ${momentQuestion} My answer was flagged for "${moment.linkedGrowthAreaTitles[0]}". I answer it again now. ${closingInstruction(request.competencyKey)}`
      : `In one of the sessions this plan was built from, a moment was flagged for "${moment.linkedGrowthAreaTitles[0]}". I answer that same kind of question again. ${closingInstruction(request.competencyKey)}`;
  } else if (pick) {
    promptBasis = "SESSION";
    scenarioPrompt = `In ${practisedFor(pick.ctx)}, the interviewer asked: ${pick.question} I answer it again now. ${closingInstruction(request.competencyKey)}`;
  } else if (sessionCtx && (sessionCtx.roleTitle || sessionCtx.industry)) {
    promptBasis = "SESSION";
    scenarioPrompt = `I picture ${practisedFor(sessionCtx)}. ${SCENARIO_TEMPLATES[request.competencyKey]} ${closingInstruction(request.competencyKey)}`;
  } else if (request.theme) {
    promptBasis = "THEME";
    scenarioPrompt = `My plan's priority theme is "${request.theme}". ${SCENARIO_TEMPLATES[request.competencyKey]} ${closingInstruction(request.competencyKey)}`;
  } else {
    promptBasis = "COMPETENCY";
    scenarioPrompt = `${SCENARIO_TEMPLATES[request.competencyKey]} ${closingInstruction(request.competencyKey)}`;
  }

  // Q2: the technique that FITS this prompt (and its weak-moment flag), never
  // a library-position pick. A later drill on the same competency takes the
  // next-best fit so the two reps practise different moves.
  const ranked = rankDrillTechniques(request.competencyKey, scenarioPrompt, moment?.linkedGrowthAreaTitles ?? []);
  const technique = ranked.length ? ranked[Math.min(request.variant, ranked.length - 1)] : null;

  return {
    competencyKey: request.competencyKey,
    scenarioPrompt,
    tipText: technique ? technique.reminder : `Focus on ${labelFor(request.competencyKey).toLowerCase()} throughout.`,
    techniqueId: technique ? technique.id : null,
    promptBasis,
    sourceReportId: null,
    quotedTurnIndex: null,
    quotedText: null,
    generationModel: "template",
  };
}

export const DRILL_GENERATION_SYSTEM_PROMPT = `You write short spoken-practice prompts ("voice drills") for a leadership-practice student. Each drill is a 60-90 second spoken rep on ONE competency.

For each requested drill return:
- "scenario_prompt": 1-3 sentences in first person from the learner's perspective (I/my) naming the situation to speak to; never refer to the learner as you, the learner, or the student. It MUST be specific to this student: tailor it to their own moments when supplied (the same kind of question they found hard); otherwise ground it in one of "student_sessions" — name the role or industry they practised for and build on a question they were actually asked, paraphrased in your own words (never in quotation marks). Only when no sessions are supplied may you fall back to the plan theme. Never give them words to say, never write a sample answer, never write lines of dialogue.
- "technique_id": exactly one id from that drill's "allowed_techniques".
- "quoted_text": null, OR a line copied CHARACTER FOR CHARACTER from one of that drill's supplied moments' studentText (when the prompt reminds them what they said). If you quote, the quote must appear verbatim inside scenario_prompt, and "source_report_id"/"quoted_turn_index" must be that moment's. Otherwise all three are null.

Omit a drill rather than approximate a quote.`;

export const DRILL_GENERATION_SCHEMA = {
  name: "voice_drill_briefs",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["drills"],
    properties: {
      drills: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "position",
            "scenario_prompt",
            "technique_id",
            "quoted_text",
            "source_report_id",
            "quoted_turn_index",
          ],
          properties: {
            position: { type: "integer" },
            scenario_prompt: { type: "string" },
            technique_id: { type: "string" },
            quoted_text: { type: ["string", "null"] },
            source_report_id: { type: ["string", "null"] },
            quoted_turn_index: { type: ["integer", "null"] },
          },
        },
      },
    },
  },
} as const;

async function defaultCallModel(payload: {
  model: string;
  system: string;
  user: string;
}): Promise<unknown> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 0 });
  const completion = await openai.chat.completions.create({
    model: payload.model,
    messages: [
      { role: "system", content: payload.system },
      { role: "user", content: payload.user },
    ],
    max_tokens: 2_000,
    response_format: { type: "json_schema", json_schema: DRILL_GENERATION_SCHEMA },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Drill generator returned no content");
  return content;
}

export interface DrillDiscard {
  position: number | null;
  reason: string;
}

export interface GenerateDrillBriefsArgs {
  userId: string;
  requests: DrillRequest[];
  momentsByCompetency: ReadonlyMap<CompetencyKey, SessionMoment[]>;
  transcriptsByReportId: ReadonlyMap<string, InterviewTranscript>;
  selfNames: string[];
  /** The plan's source sessions (D4). Empty -> moments/theme/template only. */
  sessionContexts?: ReadonlyArray<DrillSessionContext>;
  /** Injected for testing; defaults to the real OpenAI call. Pass `null` to
   * skip the model entirely (template only). */
  callModel?: ((payload: { model: string; system: string; user: string }) => Promise<unknown>) | null;
}

/** Moments per drill sent to the model. PROVISIONAL UNTIL CALIBRATED. */
const MOMENTS_PER_DRILL = 3;

/**
 * Returns a brief for EVERY request (template first, model override when it
 * survives the gates) plus the discards, for diagnostics. Never throws on a
 * model failure.
 */
export async function generateDrillBriefs(
  args: GenerateDrillBriefsArgs,
): Promise<{ briefs: Map<number, VoiceDrillBrief>; discarded: DrillDiscard[]; model: string | null }> {
  const briefs = new Map<number, VoiceDrillBrief>();
  for (const request of args.requests) {
    briefs.set(
      request.position,
      templateBrief(request, args.momentsByCompetency.get(request.competencyKey) ?? [], {
        sessions: args.sessionContexts,
        selfNames: args.selfNames,
      }),
    );
  }
  const discarded: DrillDiscard[] = [];
  if (args.requests.length === 0 || args.callModel === null) return { briefs, discarded, model: null };

  const model = process.env.DRILL_GENERATION_MODEL || process.env.CHECK_GENERATION_MODEL || "gpt-4.1";

  // REDACTION BOUNDARY: the only way transcript text reaches the model.
  const preparedByCompetency = new Map<CompetencyKey, SessionMoment[]>();
  try {
    for (const request of args.requests) {
      if (preparedByCompetency.has(request.competencyKey)) continue;
      const raw = args.momentsByCompetency.get(request.competencyKey) ?? [];
      const prepared = prepareMomentsForGeneration({
        requestingUserId: args.userId,
        moments: raw,
        momentOwnerUserIds: raw.map(() => args.userId),
        selfNames: args.selfNames,
      });
      preparedByCompetency.set(request.competencyKey, prepared.moments);
    }
  } catch (error) {
    discarded.push({ position: null, reason: `moment preparation failed: ${error instanceof Error ? error.message : String(error)}` });
    return { briefs, discarded, model };
  }

  const sessions = args.sessionContexts ?? [];
  const userMessage = JSON.stringify({
    student_sessions: sessions.map((ctx) => ({
      type: ctx.typeName,
      role: ctx.roleTitle,
      industry: ctx.industry,
      questions_asked: ctx.questions,
    })),
    drills: args.requests.map((r) => {
      const competency = COMPETENCIES.find((c) => c.key === r.competencyKey)!;
      const moments = (preparedByCompetency.get(r.competencyKey) ?? []).slice(
        r.variant * MOMENTS_PER_DRILL,
        r.variant * MOMENTS_PER_DRILL + MOMENTS_PER_DRILL,
      );
      return {
        position: r.position,
        competency: { label: competency.label, description: competency.description },
        plan_theme: r.theme,
        allowed_techniques: allowedDrillTechniques(r.competencyKey).map((t) => ({ id: t.id, name: t.name })),
        moments: moments.map((m) => ({
          reportId: m.reportId,
          turnIndex: m.turnIndex,
          studentText: m.studentText,
          precedingAvatarText: m.precedingAvatarText,
          growthAreas: m.linkedGrowthAreaTitles,
        })),
      };
    }),
  });

  let raw: unknown;
  try {
    raw = await (args.callModel ?? defaultCallModel)({ model, system: DRILL_GENERATION_SYSTEM_PROMPT, user: userMessage });
  } catch (error) {
    discarded.push({ position: null, reason: `model call failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) });
    return { briefs, discarded, model };
  }

  let candidates: unknown[];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { drills?: unknown }).drills)) {
      throw new Error("missing drills array");
    }
    candidates = (parsed as { drills: unknown[] }).drills;
  } catch (error) {
    discarded.push({ position: null, reason: `malformed model output: ${error instanceof Error ? error.message : String(error)}` });
    return { briefs, discarded, model };
  }

  const requestByPosition = new Map(args.requests.map((r) => [r.position, r]));
  const used = new Set<number>();

  for (const candidate of candidates) {
    const result = validateCandidate(candidate, {
      requestByPosition,
      used,
      preparedByCompetency,
      transcriptsByReportId: args.transcriptsByReportId,
      sessions,
      model,
    });
    if (!result.ok) {
      discarded.push({ position: result.position, reason: result.reason });
      continue;
    }
    used.add(result.position);
    briefs.set(result.position, result.brief);
  }

  return { briefs, discarded, model };
}

type CandidateResult =
  | { ok: true; position: number; brief: VoiceDrillBrief }
  | { ok: false; position: number | null; reason: string };

/** Exported for the battery: every gate, run on one candidate. */
export function validateCandidate(
  candidate: unknown,
  ctx: {
    requestByPosition: ReadonlyMap<number, DrillRequest>;
    used: ReadonlySet<number>;
    preparedByCompetency: ReadonlyMap<CompetencyKey, ReadonlyArray<Pick<SessionMoment, "reportId" | "turnIndex">>>;
    transcriptsByReportId: ReadonlyMap<string, InterviewTranscript>;
    /** When present and non-empty, an unquoted prompt must be grounded in them. */
    sessions?: ReadonlyArray<DrillSessionContext>;
    model: string;
  },
): CandidateResult {
  if (!candidate || typeof candidate !== "object") return { ok: false, position: null, reason: "not an object" };
  const c = candidate as Record<string, unknown>;
  const position = typeof c.position === "number" ? c.position : null;
  if (position === null) return { ok: false, position: null, reason: "missing position" };
  const request = ctx.requestByPosition.get(position);
  if (!request) return { ok: false, position, reason: "position was not requested" };
  if (ctx.used.has(position)) return { ok: false, position, reason: "duplicate position" };

  const scenario = typeof c.scenario_prompt === "string" ? c.scenario_prompt.trim() : "";
  if (scenario.length < MIN_SCENARIO_LENGTH || scenario.length > MAX_SCENARIO_LENGTH) {
    return { ok: false, position, reason: `scenario_prompt length ${scenario.length} outside ${MIN_SCENARIO_LENGTH}-${MAX_SCENARIO_LENGTH}` };
  }

  const technique = allowedDrillTechniques(request.competencyKey).find((t) => t.id === c.technique_id);
  if (!technique) return { ok: false, position, reason: `technique_id ${JSON.stringify(c.technique_id)} is not in this competency's library` };

  const quotedText = typeof c.quoted_text === "string" ? c.quoted_text : null;
  const sourceReportId = typeof c.source_report_id === "string" ? c.source_report_id : null;
  const quotedTurnIndex = typeof c.quoted_turn_index === "number" ? c.quoted_turn_index : null;

  if (quotedText !== null) {
    if (!sourceReportId || quotedTurnIndex === null) {
      return { ok: false, position, reason: "quote without provenance" };
    }
    const supplied = (ctx.preparedByCompetency.get(request.competencyKey) ?? []).some(
      (m) => m.reportId === sourceReportId && m.turnIndex === quotedTurnIndex,
    );
    if (!supplied) return { ok: false, position, reason: "quote names a moment not supplied for this competency" };
    const transcript = ctx.transcriptsByReportId.get(sourceReportId);
    if (!transcript) return { ok: false, position, reason: "quote names a report with no transcript" };
    const verbatim = validateVerbatimQuote(quotedText, transcript, { expectedTurnIndex: quotedTurnIndex });
    if (!verbatim.ok) return { ok: false, position, reason: `${verbatim.reason}: ${verbatim.detail}` };
    if (!scenario.includes(quotedText)) return { ok: false, position, reason: "quote does not appear verbatim in the prompt" };
  }

  if (quotedText === null && ctx.sessions && ctx.sessions.length > 0 && !groundedInSessions(scenario, ctx.sessions)) {
    return { ok: false, position, reason: "prompt is not specific to the student's sessions (generic)" };
  }

  const speech = validateCoachSpeech(scenario, {
    studentLine: quotedText ?? "",
    counterpartLine: null,
    studentAttempts: [],
  });
  if (!speech.ok) return { ok: false, position, reason: `${speech.reason}: ${speech.detail}` };

  return {
    ok: true,
    position,
    brief: {
      competencyKey: request.competencyKey,
      scenarioPrompt: scenario,
      tipText: technique.reminder,
      techniqueId: technique.id,
      promptBasis:
        quotedText !== null
          ? "MOMENT"
          : ctx.sessions && ctx.sessions.length > 0
            ? "SESSION"
            : request.theme
              ? "THEME"
              : "COMPETENCY",
      sourceReportId: quotedText !== null ? sourceReportId : null,
      quotedTurnIndex: quotedText !== null ? quotedTurnIndex : null,
      quotedText,
      generationModel: ctx.model,
    },
  };
}

const STOPWORDS = new Set([
  "about", "would", "could", "should", "there", "their", "which", "where", "these", "those", "think",
  "tell", "describe", "something", "situation", "example", "being", "while", "after", "before", "really",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !STOPWORDS.has(w)),
  );
}

/**
 * PURE (D4 gate): an unquoted prompt counts as specific to the student when
 * it names a role or industry they practised for, or shares at least two
 * content words with a question they were actually asked.
 */
export function groundedInSessions(scenario: string, sessions: ReadonlyArray<DrillSessionContext>): boolean {
  const lower = scenario.toLowerCase();
  const words = contentWords(scenario);
  return sessions.some((ctx) => {
    if (ctx.roleTitle && lower.includes(ctx.roleTitle.toLowerCase())) return true;
    if (ctx.industry && lower.includes(ctx.industry.toLowerCase())) return true;
    return ctx.questions.some((q) => {
      let shared = 0;
      for (const w of contentWords(q)) if (words.has(w)) shared += 1;
      return shared >= 2;
    });
  });
}

/**
 * Q2: the techniques a drill on this competency may use. A delivery drill may
 * use any delivery move; a CONTENT drill (every other competency) never gets
 * a body/voice-only technique (the checks' spoken-only exclusion).
 */
export function allowedDrillTechniques(competencyKey: CompetencyKey): readonly Technique[] {
  const library = techniquesForCompetency(competencyKey);
  return competencyKey === "delivery_presence" ? library : library.filter(isWrittenTechnique);
}

function fitWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w) && !FIT_STOPWORDS.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1")),
  );
}

const FIT_STOPWORDS = new Set(["your", "with", "that", "this", "them", "what", "when", "they", "from", "into", "then", "than", "said", "says", "focus", "answer", "seconds", "take", "loud", "out"]);

function stableHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * PURE (Q2): allowed techniques ranked by fit — word overlap of name +
 * reminder with the scenario, with the weak-moment flag counted double. Ties
 * are ordered by a hash of the scenario text (content, not path position).
 */
export function rankDrillTechniques(
  competencyKey: CompetencyKey,
  scenario: string,
  flagTitles: readonly string[],
): Technique[] {
  const scenarioWords = fitWords(scenario);
  const flagWords = fitWords(flagTitles.join(" "));
  const seed = stableHash(scenario);
  return allowedDrillTechniques(competencyKey)
    .map((t) => {
      let score = 0;
      for (const w of fitWords(`${t.name} ${t.reminder}`)) {
        if (scenarioWords.has(w)) score += 1;
        if (flagWords.has(w)) score += 2;
      }
      return { t, score, tie: stableHash(`${seed}:${t.id}`) };
    })
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .map((x) => x.t);
}
