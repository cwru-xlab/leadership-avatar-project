/**
 * The questioned-persona supplementary analysis: two structured evaluator
 * calls run in parallel, then pure code.
 *
 * 1. TAGGER — codes every student utterance (structured JSON, temperature 0).
 *    It is never asked for totals; `coding.ts` counts.
 * 2. JUDGE — the checklist (hit / missed / not_applicable with a verbatim
 *    evidence quote), which hidden facts were elicited, how each cue was
 *    handled, and (clinical) which ICE items were elicited.
 *
 * Evidence quotes are checked against the transcript in code: a quote that
 * is not the student's own words is dropped rather than shown as evidence.
 */

import type { ProcessStepResult } from "@/lib/problem-interview/types";

import {
  CODE_DEFINITIONS,
  cleanEvidenceQuote,
  codesForStyle,
  countCodes,
  deriveMetrics,
  locateQuote,
  studentUtterances,
  type StudentUtterance,
} from "./coding";
import { frameworkForStyle } from "./frameworks";
import type {
  BehaviorCode,
  CueResult,
  FactResult,
  PersonaAnalysis,
  PersonaCard,
  PersonaStyle,
  TaggedUtterance,
} from "./types";

export const ANALYSIS_MODEL_DEFAULT = "gpt-4.1";

function analysisModel(): string {
  return process.env.PERSONA_ANALYSIS_MODEL || process.env.INTERVIEW_EVAL_MODEL || ANALYSIS_MODEL_DEFAULT;
}

type Turn = { role: "user" | "assistant"; content: string; timestamp: number };

function personaWord(style: PersonaStyle): string {
  return style === "clinical-communication" ? "Patient" : "Client";
}

function studentWord(style: PersonaStyle): string {
  return style === "clinical-communication" ? "Clinician" : "Counselor";
}

/** Transcript with student utterances labelled [S0], [S1], … for the tagger. */
export function labelledTranscript(
  style: PersonaStyle,
  turns: Turn[],
  utterances: StudentUtterance[],
): string {
  const byText = [...utterances];
  const lines: string[] = [];
  for (const turn of turns) {
    const text = turn.content.trim();
    if (!text) continue;
    if (turn.role === "assistant") {
      lines.push(`${personaWord(style)}: ${text}`);
      continue;
    }
    const u = byText[0];
    if (u && u.text === text) {
      byText.shift();
      lines.push(`[S${u.index}] ${studentWord(style)}: ${text}`);
    }
  }
  return lines.join("\n");
}

async function openaiJson<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ data: T; model: string }> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: opts.timeoutMs ?? 45_000,
    maxRetries: 1,
  });
  const model = analysisModel();
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 6000,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
    },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error(`${opts.schemaName}: empty response`);
  return { data: JSON.parse(content) as T, model };
}

// ---------------------------------------------------------------------------
// Tagger
// ---------------------------------------------------------------------------

export function buildTaggerSystemPrompt(style: PersonaStyle): string {
  const defs = CODE_DEFINITIONS[style];
  const codeLines = Object.entries(defs)
    .map(([code, def]) => `- ${code}: ${def}`)
    .join("\n");
  const frame =
    style === "motivational-interviewing"
      ? "You are a trained MITI 4.2.1 coder. You code the COUNSELOR's utterances in a motivational interviewing practice session."
      : "You are a trained standardized-patient communication rater (Calgary–Cambridge / SEGUE). You code the CLINICIAN's utterances in a history-taking practice encounter.";
  return `${frame}

Code ONLY the lines labelled [S#]. The other speaker's lines are context (a reflection is judged against what the other person just said).

For each [S#] utterance, return the list of codes that apply. Rules:
- An utterance can carry several different codes (e.g. a reflection followed by an open question = two codes). List each code AT MOST ONCE per utterance.
- Greetings, thanks, small talk and fillers with no codable behavior get an empty list.
- A sentence phrased as a question but functioning as a reflection with rising tone in speech is still a question here (the transcript is typed).
- Code what was said, not what was intended. Do not reward or penalize — just code.
- Return one entry for EVERY [S#] index, in order.

Codes:
${codeLines}`;
}

function taggerSchema(style: PersonaStyle): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["utterances"],
    properties: {
      utterances: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "codes"],
          properties: {
            index: { type: "integer" },
            codes: {
              type: "array",
              items: { type: "string", enum: [...codesForStyle(style)] },
            },
          },
        },
      },
    },
  };
}

export async function tagUtterances(
  style: PersonaStyle,
  turns: Turn[],
  utterances: StudentUtterance[],
): Promise<{ tagged: TaggedUtterance[]; model: string }> {
  if (utterances.length === 0) return { tagged: [], model: analysisModel() };
  const { data, model } = await openaiJson<{ utterances: Array<{ index: number; codes: string[] }> }>({
    system: buildTaggerSystemPrompt(style),
    user: `Transcript:\n${labelledTranscript(style, turns, utterances)}`,
    schemaName: "utterance_codes",
    schema: taggerSchema(style),
  });
  const allowed = new Set<string>(codesForStyle(style));
  const byIndex = new Map(data.utterances.map((u) => [u.index, u.codes]));
  const tagged = utterances.map((u) => ({
    index: u.index,
    text: u.text,
    codes: [...new Set((byIndex.get(u.index) ?? []).filter((c) => allowed.has(c)))] as BehaviorCode[],
  }));
  return { tagged, model };
}

// ---------------------------------------------------------------------------
// Judge (checklist, facts, cues, ICE)
// ---------------------------------------------------------------------------

function caseCardForJudge(card: PersonaCard): string {
  const facts = card.hiddenFacts
    .map((f) => `- ${f.id} (${f.label}): ${f.fact} — earned by: ${f.revealWhen}`)
    .join("\n");
  const cues = card.cues.map((c) => `- ${c.id} (${c.label}): "${c.line}"`).join("\n");
  const parts = [
    `Persona: ${card.personaName} — ${card.profile}`,
    `Setting: ${card.setting}`,
    `Hidden facts (revealed only to the right question):\n${facts}`,
    `Emotional cues the persona was told to drop:\n${cues}`,
  ];
  if (card.ice) {
    parts.push(
      `Ideas, concerns, expectations (ICE):\n- ideas: ${card.ice.ideas}\n- concerns: ${card.ice.concerns}\n- expectations: ${card.ice.expectations}`,
    );
  }
  if (card.targetBehavior) {
    parts.push(`Target behavior the client is ambivalent about: ${card.targetBehavior}`);
  }
  return parts.join("\n\n");
}

export function buildJudgeSystemPrompt(style: PersonaStyle): string {
  const framework = frameworkForStyle(style);
  const steps = framework.steps
    .map((s) => `- ${s.key} — ${s.label}. HIT when: ${s.evidenceCriteria}`)
    .join("\n");
  const who = studentWord(style).toLowerCase();
  return `You rate a ${style === "clinical-communication" ? "standardized-patient communication encounter" : "motivational interviewing practice session"} against a checklist. The student is the ${who}. Judge only what the transcript shows.

Checklist — ${framework.label}:
${steps}

For each step return:
- status: "hit" if the ${who} clearly did it (credit substance, not wording — a step done well without naming it is a hit); "missed" if not; "not_applicable" ONLY if the encounter ended before the step could reasonably arise through no fault of the student (e.g. a closing step when the transcript stops mid-history). Never use not_applicable to excuse a skipped step.
- evidenceQuote: for a hit, COPY AND PASTE a span of characters from ONE [S#] line, exactly as it appears. Do not paraphrase, do not stitch two lines together, do not tidy the grammar, do not add or remove words, and do not wrap it in quotation marks. It is checked character by character against the transcript and a quote that is not found is discarded, which leaves the step with no evidence. If no single [S#] line contains words that show the step, the step is "missed", not a hit with an approximate quote. Use "" when missed.
- note: one sentence of specific coaching for this step, written to the student ("you").

Hidden facts: elicited = true only if the persona actually disclosed the fact in the transcript. evidenceQuote = the ${who}'s exact question or statement that drew it out; "" if not elicited.

Cues: for each cue the persona was told to drop: "not_raised" if the persona never voiced it; otherwise "explored" (the ${who} named the feeling and invited more), "acknowledged" (named or validated it but moved on), or "missed" (ignored it). evidenceQuote = the ${who}'s exact response, or "".
${style === "clinical-communication" ? `
ICE: for ideas, concerns and expectations, elicited = true only if the ${who} ASKED about it (the patient volunteering it does not count). evidenceQuote = the ${who}'s exact question, or "".` : ""}`;
}

function judgeSchema(style: PersonaStyle, card: PersonaCard): Record<string, unknown> {
  const framework = frameworkForStyle(style);
  const evidence = { type: "string" };
  const properties: Record<string, unknown> = {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "status", "evidenceQuote", "note"],
        properties: {
          key: { type: "string", enum: framework.steps.map((s) => s.key) },
          status: { type: "string", enum: ["hit", "missed", "not_applicable"] },
          evidenceQuote: evidence,
          note: { type: "string" },
        },
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "elicited", "evidenceQuote"],
        properties: {
          id: { type: "string", enum: card.hiddenFacts.map((f) => f.id) },
          elicited: { type: "boolean" },
          evidenceQuote: evidence,
        },
      },
    },
    cues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "evidenceQuote"],
        properties: {
          id: { type: "string", enum: card.cues.map((c) => c.id) },
          status: { type: "string", enum: ["explored", "acknowledged", "missed", "not_raised"] },
          evidenceQuote: evidence,
        },
      },
    },
  };
  const required = ["steps", "facts", "cues"];
  if (style === "clinical-communication") {
    properties.ice = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "elicited", "evidenceQuote"],
        properties: {
          key: { type: "string", enum: ["ideas", "concerns", "expectations"] },
          elicited: { type: "boolean" },
          evidenceQuote: evidence,
        },
      },
    };
    required.push("ice");
  }
  return { type: "object", additionalProperties: false, required, properties };
}

interface JudgeOutput {
  steps: Array<{ key: string; status: "hit" | "missed" | "not_applicable"; evidenceQuote: string; note: string }>;
  facts: Array<{ id: string; elicited: boolean; evidenceQuote: string }>;
  cues: Array<{ id: string; status: CueResult["status"]; evidenceQuote: string }>;
  ice?: Array<{ key: "ideas" | "concerns" | "expectations"; elicited: boolean; evidenceQuote: string }>;
}

export async function judgeChecklist(
  style: PersonaStyle,
  card: PersonaCard,
  turns: Turn[],
  utterances: StudentUtterance[],
): Promise<{ data: JudgeOutput; model: string }> {
  return openaiJson<JudgeOutput>({
    system: buildJudgeSystemPrompt(style),
    user: `Case card:\n${caseCardForJudge(card)}\n\nTranscript:\n${labelledTranscript(style, turns, utterances)}`,
    schemaName: "persona_checklist",
    schema: judgeSchema(style, card),
  });
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

function verified(quote: string, utterances: StudentUtterance[]): { quote: string; at: number | null } {
  const cleaned = cleanEvidenceQuote(quote);
  const hit = cleaned ? locateQuote(cleaned, utterances) : null;
  return hit ? { quote: cleaned, at: hit.timecodeSeconds } : { quote: "", at: null };
}

export function assembleAnalysis(opts: {
  style: PersonaStyle;
  card: PersonaCard;
  utterances: StudentUtterance[];
  tagged: TaggedUtterance[];
  judge: JudgeOutput;
  model: string;
}): PersonaAnalysis {
  const { style, card, utterances, tagged, judge } = opts;
  const framework = frameworkForStyle(style);
  const counts = countCodes(style, tagged);

  const stepByKey = new Map(judge.steps.map((s) => [s.key, s]));
  const steps: ProcessStepResult[] = framework.steps.map((def) => {
    const raw = stepByKey.get(def.key);
    const ev = verified(raw?.evidenceQuote ?? "", utterances);
    return {
      key: def.key,
      status: raw?.status ?? "missed",
      evidenceQuote: ev.quote,
      timecodeSeconds: ev.at,
      note: raw?.note ?? "",
    };
  });

  const factById = new Map(judge.facts.map((f) => [f.id, f]));
  const facts: FactResult[] = card.hiddenFacts.map((f) => {
    const raw = factById.get(f.id);
    return {
      id: f.id,
      label: f.label,
      elicited: raw?.elicited ?? false,
      evidenceQuote: raw?.elicited ? verified(raw.evidenceQuote, utterances).quote : "",
    };
  });

  const cueById = new Map(judge.cues.map((c) => [c.id, c]));
  const cues: CueResult[] = card.cues.map((c) => {
    const raw = cueById.get(c.id);
    return {
      id: c.id,
      label: c.label,
      status: raw?.status ?? "not_raised",
      evidenceQuote: verified(raw?.evidenceQuote ?? "", utterances).quote,
    };
  });

  const ice =
    style === "clinical-communication"
      ? (["ideas", "concerns", "expectations"] as const).map((key) => {
          const raw = judge.ice?.find((i) => i.key === key);
          return {
            key,
            elicited: raw?.elicited ?? false,
            evidenceQuote: raw?.elicited ? verified(raw.evidenceQuote, utterances).quote : "",
          };
        })
      : undefined;

  return {
    version: 1,
    style,
    frameworkKey: framework.key,
    utterances: tagged,
    counts,
    metrics: deriveMetrics(style, counts),
    steps,
    facts,
    cues,
    ...(ice ? { ice } : {}),
    model: opts.model,
  };
}

/** A compact, factual note for the rubric evaluator so narrative and counts agree. */
export function evaluatorNoteFor(analysis: PersonaAnalysis): string {
  const metricLines = analysis.metrics
    .map((m) => `- ${m.label}: ${m.value === null ? "n/a" : m.format === "percent" ? `${m.value}%` : m.format === "ratio" ? `${m.value}:1` : m.value}${m.band ? ` (${m.band})` : ""}`)
    .join("\n");
  const stepLines = analysis.steps.map((s) => `- ${s.key}: ${s.status}`).join("\n");
  const factLine = analysis.facts.map((f) => `${f.label}: ${f.elicited ? "elicited" : "not elicited"}`).join("; ");
  const cueLine = analysis.cues.map((c) => `${c.label}: ${c.status}`).join("; ");
  return `Behavior counts were computed in code from per-utterance coding. Use them; do not recount.
Counts: ${JSON.stringify(analysis.counts)}
Derived:
${metricLines}
Checklist:
${stepLines}
Hidden facts: ${factLine}
Cues: ${cueLine}${analysis.ice ? `\nICE: ${analysis.ice.map((i) => `${i.key} ${i.elicited ? "asked" : "not asked"}`).join(", ")}` : ""}`;
}

export async function runPersonaAnalysis(input: {
  style: PersonaStyle;
  card: PersonaCard;
  turns: Turn[];
  startedAt: number;
}): Promise<PersonaAnalysis> {
  const utterances = studentUtterances(input.turns, input.startedAt);
  const [tags, judge] = await Promise.all([
    tagUtterances(input.style, input.turns, utterances),
    judgeChecklist(input.style, input.card, input.turns, utterances),
  ]);
  return assembleAnalysis({
    style: input.style,
    card: input.card,
    utterances,
    tagged: tags.tagged,
    judge: judge.data,
    model: tags.model,
  });
}
