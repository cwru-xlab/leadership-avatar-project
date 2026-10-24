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
import { prepareMomentsForGeneration } from "../moment-boundary";
import { validateVerbatimQuote } from "../verbatim";
import { techniquesForCompetency, validateCoachSpeech } from "../coached/tips";
import { DRILL_DURATION, type PromptBasis, type VoiceDrillBrief } from "./types";

/** One generic, second-person situation per competency, used when neither a
 * moment nor a theme can tailor the prompt. Hand-written; no scripted words. */
export const SCENARIO_TEMPLATES: Readonly<Record<CompetencyKey, string>> = {
  delivery_presence:
    "Introduce yourself and the piece of work you are proudest of, as if you were opening an interview.",
  structure_and_clarity:
    "Explain a decision you made recently: what you decided, why, and what happened as a result.",
  concision_and_focus:
    "Summarise a project you worked on so that someone outside your field understands its point.",
  audience_attunement:
    "A colleague tells you they are frustrated that a shared deadline slipped. Respond to them.",
  holding_position_under_pressure:
    "You have proposed a plan and your manager says it costs too much. Respond, and keep your case.",
  credibility_of_the_case:
    "Make the case for one change you would make where you work or study, and support it.",
  outcome_achievement:
    "You have a few minutes with a senior person who could help your career. Use them to come away with a concrete next step.",
};

const MAX_SCENARIO_LENGTH = 600;
const MIN_SCENARIO_LENGTH = 40;

function labelFor(key: CompetencyKey): string {
  return COMPETENCIES.find((c) => c.key === key)?.label ?? key;
}

function closingInstruction(key: CompetencyKey): string {
  return `Take ${DRILL_DURATION.minSeconds}-${DRILL_DURATION.maxSeconds} seconds and say it out loud, focusing on ${labelFor(key).toLowerCase()}.`;
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
  moments: ReadonlyArray<Pick<SessionMoment, "linkedGrowthAreaTitles">>,
): VoiceDrillBrief {
  const techniques = techniquesForCompetency(request.competencyKey);
  const technique = techniques.length ? techniques[request.variant % techniques.length] : null;

  const titled = moments.filter((m) => m.linkedGrowthAreaTitles.length > 0);
  const moment = titled.length ? titled[request.variant % titled.length] : null;

  let promptBasis: PromptBasis;
  let scenarioPrompt: string;
  if (moment) {
    promptBasis = "MOMENT";
    scenarioPrompt = `In one of the sessions this plan was built from, a moment was flagged for "${moment.linkedGrowthAreaTitles[0]}". Answer that same kind of question again. ${closingInstruction(request.competencyKey)}`;
  } else if (request.theme) {
    promptBasis = "THEME";
    scenarioPrompt = `Your plan's priority theme is "${request.theme}". ${SCENARIO_TEMPLATES[request.competencyKey]} ${closingInstruction(request.competencyKey)}`;
  } else {
    promptBasis = "COMPETENCY";
    scenarioPrompt = `${SCENARIO_TEMPLATES[request.competencyKey]} ${closingInstruction(request.competencyKey)}`;
  }

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
- "scenario_prompt": 1-3 sentences in the second person telling the student what situation to speak to. Tailor it to the student's own moments when supplied (the same kind of question they found hard), otherwise to the plan theme. Never give them words to say, never write a sample answer, never write lines of dialogue.
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
    briefs.set(request.position, templateBrief(request, args.momentsByCompetency.get(request.competencyKey) ?? []));
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

  const userMessage = JSON.stringify({
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
        allowed_techniques: techniquesForCompetency(r.competencyKey).map((t) => ({ id: t.id, name: t.name })),
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

  const technique = techniquesForCompetency(request.competencyKey).find((t) => t.id === c.technique_id);
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
      promptBasis: quotedText !== null ? "MOMENT" : request.theme ? "THEME" : "COMPETENCY",
      sourceReportId: quotedText !== null ? sourceReportId : null,
      quotedTurnIndex: quotedText !== null ? quotedTurnIndex : null,
      quotedText,
      generationModel: ctx.model,
    },
  };
}
