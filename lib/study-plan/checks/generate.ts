/**
 * Generates the four knowledge-check formats from a student's own session
 * moments, with the verbatim-quote validator wired as a HARD POST-GATE.
 *
 * WHY THIS MODULE EXISTS: 21-CONTEXT.md locks "content is generated from the
 * student's own session moments... not a generic authored bank" and its
 * first named guardrail — "never misquote the student... mechanically
 * checkable against the stored transcript, and should be." 21-04 built the
 * check (`validateVerbatimQuote`); this module is what makes it unbypassable.
 * Generation PROPOSES, validation DISPOSES. Nothing the model says about its
 * own fidelity is consulted — a candidate's claim that its quote is accurate
 * is worth exactly nothing here.
 *
 * THE GATE DISCARDS; IT NEVER REPAIRS. A candidate whose quote does not
 * match the stored turn exactly is thrown away, not corrected, not
 * re-prompted into shape, not fuzzy-matched back into compliance. A repaired
 * quote is the model's text wearing the student's name — see the forbidden
 * list at the top of the per-candidate quote gate below.
 *
 * INPUTS ARRIVE AS PARAMETERS. This module does NOT read S3, does NOT query
 * `StudyPlan`/`InteractionReport`, and does NOT look up `prisma.user`. Its
 * `moments`, `momentOwnerUserIds`, `transcriptsByReportId` and `selfNames`
 * are assembled elsewhere — by `loadGenerationSources` in
 * `lib/study-plan/checks/sources.ts` (21-25), which owns the ownership-scoped
 * queries. Keeping that fetch logic OUT of this file is deliberate: it keeps
 * this module's adversarial battery credential-free and database-free, and
 * it keeps the ownership scoping in exactly one place. Do not add a
 * convenience overload here that fetches its own sources — that overload is
 * how the ownership scoping gets bypassed.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../../prisma";
import { COMPETENCIES, type CompetencyKey } from "../../mastery/competencies";
import type { InterviewTranscript } from "../../interview/transcript";
import type { SessionMoment } from "../moments";
import { prepareMomentsForGeneration } from "../moment-boundary";
import { validateVerbatimQuote } from "../verbatim";
import {
  CHECK_FORMATS,
  validateCheckPayload,
  validateAnswerKey,
  type CheckFormat,
  type CheckPayload,
  type AnswerKey,
} from "./types";

// ---------------------------------------------------------------------------
// System prompt — ADVISORY ONLY
// ---------------------------------------------------------------------------

/**
 * This prompt instructs the model to quote accurately. IT IS NOT THE
 * GUARANTEE. The guarantee is the mechanical gate below (step 5 of
 * `generateChecksForCompetency`'s pipeline) — `validateVerbatimQuote` against
 * the stored transcript. A future reader must not conclude, upon finding a
 * strong prompt here, that the gate is therefore redundant or safe to
 * loosen. The prompt is worth nothing without the gate; the gate is worth
 * everything without the prompt.
 */
export const CHECK_GENERATION_SYSTEM_PROMPT = `You write knowledge-check questions for a leadership-practice student, grounded ONLY in the session moments supplied below.

Every "quoted_text" you return MUST be reproduced CHARACTER FOR CHARACTER from one of the supplied moments' studentText — the exact words, exact punctuation, exact casing, exact spelling. Do not tidy grammar, do not fix a typo, do not shorten or paraphrase, do not merge two moments into one quote.

If you cannot reproduce a moment's words exactly for a candidate, OMIT that candidate entirely rather than approximating it. An approximated quote is worse than no candidate at all.

For a "REWRITE_WEAK_LINE" candidate, the "payload.weakLine" field MUST be byte-identical to "quoted_text" — it is the same string in both places, not a rephrasing of it. For a "PICK_BETTER_RESPONSE" candidate, "payload.candidates[0]" MUST be byte-identical to "quoted_text" for the same reason: the first candidate is always the student's own verbatim line, and the second is a constructed alternative.

Never invent a "source_report_id" or "quoted_turn_index" that was not given to you in the supplied moments. Never attribute a line to the student that was spoken by the avatar.

Return between 1 and the requested number of candidates. A candidate that quotes nobody (quoted_text is null) is acceptable ONLY for "MULTIPLE_CHOICE" and "FILL_IN_BLANK" — "REWRITE_WEAK_LINE" and "PICK_BETTER_RESPONSE" are both defined by reworking the student's own line and therefore always require a non-null quoted_text.`;

/**
 * CONCEPT MODE (Phase 23 user decision, 2026-10-24): "generate a concept
 * knowledge check (multiple choice or pick-the-better-response) that does not
 * quote the student, so every path keeps learn -> drill -> prove" when the
 * competency has NO student moment. No transcript text is sent, and the gate
 * below DISCARDS any candidate that quotes anyone or names a source — with no
 * moment supplied there is nothing a quote could be verified against, so the
 * verbatim guarantee is kept by refusing quotes outright, not by trusting.
 */
export const CONCEPT_CHECK_FORMATS = ["MULTIPLE_CHOICE", "PICK_BETTER_RESPONSE"] as const;

export const CONCEPT_CHECK_SYSTEM_PROMPT = `You write concept knowledge-check questions for a leadership-practice student about ONE competency. No session moments are available, so the question tests the IDEA of the competency, not anything the student said.

Use only the "MULTIPLE_CHOICE" or "PICK_BETTER_RESPONSE" format. For PICK_BETTER_RESPONSE, both candidates are short constructed responses to the same situation (neither is the student's), and answer_key.betterIndex marks the stronger one. For MULTIPLE_CHOICE, answer_key.correctIndex marks the one correct option.

"quoted_text", "source_report_id" and "quoted_turn_index" MUST all be null: never quote or attribute any words to the student.`;

// ---------------------------------------------------------------------------
// Strict JSON schema
// ---------------------------------------------------------------------------

/**
 * `strict: true` has no discriminated-union support, so every format's
 * fields are modelled as one object with every field nullable, and the
 * format-specific subset is validated in code via `validateCheckPayload` /
 * `validateAnswerKey` (21-06). This mirrors `STUDY_PLAN_JSON_SCHEMA`
 * (`lib/study-plan/types.ts`) and the rules `lib/report/structured.ts`
 * documents: every property listed in `required`, `additionalProperties:
 * false` everywhere, and nullable spelled `type: ["x", "null"]`.
 */
export const CHECK_GENERATION_SCHEMA = {
  name: "knowledge_check_candidates",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "format",
            "prompt",
            "payload",
            "answer_key",
            "quoted_text",
            "source_report_id",
            "quoted_turn_index",
          ],
          properties: {
            format: { type: "string", enum: [...CHECK_FORMATS] },
            prompt: { type: "string" },
            payload: {
              type: "object",
              additionalProperties: false,
              required: [
                "options",
                "segments",
                "blankCount",
                "candidates",
                "rationalePrompt",
                "weakLine",
                "techniqueHint",
                "rubricCriteria",
              ],
              properties: {
                options: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                segments: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                blankCount: { type: ["integer", "null"] },
                candidates: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                rationalePrompt: { type: ["string", "null"] },
                weakLine: { type: ["string", "null"] },
                techniqueHint: { type: ["string", "null"] },
                rubricCriteria: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
              },
            },
            answer_key: {
              type: ["object", "null"],
              additionalProperties: false,
              required: ["correctIndex", "accepted", "betterIndex"],
              properties: {
                correctIndex: { type: ["integer", "null"] },
                accepted: {
                  type: ["array", "null"],
                  items: { type: "array", items: { type: "string" } },
                },
                betterIndex: { type: ["integer", "null"] },
              },
            },
            quoted_text: { type: ["string", "null"] },
            source_report_id: { type: ["string", "null"] },
            quoted_turn_index: { type: ["integer", "null"] },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Outcome shapes
// ---------------------------------------------------------------------------

/**
 * One record per discarded candidate, naming the pipeline stage it died at
 * (so a payload-shape failure is distinguishable from a quote-gate failure
 * in diagnostics) and the reason, never a repair.
 */
export interface DiscardRecord {
  index: number;
  stage: "shape" | "payload" | "answer_key" | "quote";
  reason: string;
}

export type GenerationOutcome =
  | { ok: true; created: number; discarded: DiscardRecord[]; model: string }
  | { ok: false; reason: string; discarded: DiscardRecord[]; model: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The real model call, used when the caller does not inject `callModel`.
 * Isolated here so the injectable parameter is a plain function, not a
 * module-level mock hook — that is what lets the adversarial battery run a
 * deliberately-disobedient stub with no API key.
 */
async function defaultCallModel(payload: unknown): Promise<unknown> {
  const { model, system, user, schema } = payload as {
    model: string;
    system: string;
    user: string;
    schema: typeof CHECK_GENERATION_SCHEMA;
  };

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 50_000,
    maxRetries: 0,
  });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 4_000,
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Check generator returned no content");
  return content;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface GenerateChecksArgs {
  userId: string;
  studyPlanId: string;
  competencyKey: CompetencyKey;
  selfNames: string[];
  moments: SessionMoment[];
  momentOwnerUserIds: string[];
  transcriptsByReportId: ReadonlyMap<string, InterviewTranscript>;
  desiredCount: number;
  /** Injected for testing. Defaults to the real OpenAI call. */
  callModel?: (payload: unknown) => Promise<unknown>;
  /** Concept mode: no student moment exists for this competency (see
   * CONCEPT_CHECK_SYSTEM_PROMPT). `moments` must then be empty. */
  concept?: boolean;
}

export async function generateChecksForCompetency(
  args: GenerateChecksArgs,
): Promise<GenerationOutcome> {
  const model = process.env.CHECK_GENERATION_MODEL || "gpt-4.1";
  const discarded: DiscardRecord[] = [];

  const competency = COMPETENCIES.find((c) => c.key === args.competencyKey);
  if (!competency) {
    return {
      ok: false,
      reason: `Unknown competency key: ${args.competencyKey}`,
      discarded,
      model,
    };
  }

  // STEP 1. The ONLY way transcript text may reach the model (REQ-109 /
  // 21-07). Do NOT build the prompt from `args.moments` directly — the raw
  // array is right there on `args`, and reaching for it instead of the
  // prepared payload would be a one-line mistake that bypasses the boundary
  // entirely.
  const concept = args.concept === true;
  if (concept && args.moments.length > 0) {
    return {
      ok: false,
      reason: "concept mode is only for a competency with no student moment",
      discarded,
      model,
    };
  }

  const prepared = prepareMomentsForGeneration({
    requestingUserId: args.userId,
    moments: args.moments,
    momentOwnerUserIds: args.momentOwnerUserIds,
    selfNames: args.selfNames,
  });

  // STEP 2. Build the request from the prepared payload plus the
  // competency's label/description and the linked growth-area titles the
  // moments carry. Nothing else.
  const linkedGrowthAreaTitles = Array.from(
    new Set(prepared.moments.flatMap((m) => m.linkedGrowthAreaTitles)),
  );

  const userMessage = JSON.stringify({
    ...(concept ? { mode: "CONCEPT", allowedFormats: CONCEPT_CHECK_FORMATS } : {}),
    competency: {
      key: competency.key,
      label: competency.label,
      description: competency.description,
    },
    growthAreaTitles: linkedGrowthAreaTitles,
    desiredCount: args.desiredCount,
    moments: prepared.moments.map((m) => ({
      reportId: m.reportId,
      turnIndex: m.turnIndex,
      studentText: m.studentText,
      precedingAvatarText: m.precedingAvatarText,
    })),
  });

  const callModel = args.callModel ?? defaultCallModel;

  // STEP 3. Call the model. On throw or malformed JSON, return a failure —
  // never a partial list.
  let raw: unknown;
  try {
    raw = await callModel({
      model,
      system: concept ? CONCEPT_CHECK_SYSTEM_PROMPT : CHECK_GENERATION_SYSTEM_PROMPT,
      user: userMessage,
      schema: CHECK_GENERATION_SCHEMA,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Check generation model call failed: ${reason}`.slice(0, 500),
      discarded,
      model,
    };
  }

  let rawCandidates: unknown[];
  try {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
      throw new Error("Model response is missing a candidates array");
    }
    rawCandidates = parsed.candidates;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Malformed model output: ${reason}`.slice(0, 500),
      discarded,
      model,
    };
  }

  interface Survivor {
    format: CheckFormat;
    prompt: string;
    payload: CheckPayload;
    answerKey: AnswerKey | null;
    quotedText: string | null;
    sourceReportId: string | null;
    quotedTurnIndex: number | null;
  }

  const survivors: Survivor[] = [];

  rawCandidates.forEach((rawCandidate, index) => {
    if (!isRecord(rawCandidate)) {
      discarded.push({ index, stage: "shape", reason: "Candidate is not an object" });
      return;
    }

    const formatValue = rawCandidate.format;
    if (
      typeof formatValue !== "string" ||
      !(CHECK_FORMATS as readonly string[]).includes(formatValue)
    ) {
      discarded.push({
        index,
        stage: "shape",
        reason: `Unknown or missing format: ${String(formatValue)}`,
      });
      return;
    }
    const format = formatValue as CheckFormat;
    if (concept && !(CONCEPT_CHECK_FORMATS as readonly string[]).includes(format)) {
      discarded.push({
        index,
        stage: "shape",
        reason: `${format} is not a concept-check format (MULTIPLE_CHOICE or PICK_BETTER_RESPONSE only)`,
      });
      return;
    }

    const promptValue = rawCandidate.prompt;
    if (typeof promptValue !== "string" || promptValue.trim().length === 0) {
      discarded.push({
        index,
        stage: "shape",
        reason: "Candidate prompt must be non-empty text",
      });
      return;
    }

    // STEP 4. Validate payload and answer key (21-06). A throw here is a
    // DISCARD with its reason recorded, not a repair.
    let payload: CheckPayload;
    try {
      payload = validateCheckPayload(format, rawCandidate.payload);
    } catch (error) {
      discarded.push({
        index,
        stage: "payload",
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let answerKey: AnswerKey | null;
    try {
      const answerKeyRaw =
        rawCandidate.answer_key === undefined ? null : rawCandidate.answer_key;
      answerKey = validateAnswerKey(format, answerKeyRaw);
    } catch (error) {
      discarded.push({
        index,
        stage: "answer_key",
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const quotedTextRaw = rawCandidate.quoted_text;
    const quotedText = typeof quotedTextRaw === "string" ? quotedTextRaw : null;
    const sourceReportIdRaw = rawCandidate.source_report_id;
    const sourceReportId =
      typeof sourceReportIdRaw === "string" ? sourceReportIdRaw : null;
    const quotedTurnIndexRaw = rawCandidate.quoted_turn_index;
    const quotedTurnIndex =
      typeof quotedTurnIndexRaw === "number" ? quotedTurnIndexRaw : null;

    // An unquoted REWRITE_WEAK_LINE or PICK_BETTER_RESPONSE is discarded: both
    // formats are defined by reworking the student's own line, so an
    // unquoted one is a generic question from the authored bank the
    // Deferred list in 21-CONTEXT.md rejects.
    // CONCEPT GATE: no moment was supplied, so any quote or provenance is
    // unverifiable — DISCARD, never strip it and keep the candidate.
    if (concept) {
      if (quotedText !== null || sourceReportId !== null || quotedTurnIndex !== null) {
        discarded.push({
          index,
          stage: "quote",
          reason: "a concept check must not quote or attribute words to the student (no moment was supplied to verify against)",
        });
        return;
      }
    } else if (
      (format === "REWRITE_WEAK_LINE" || format === "PICK_BETTER_RESPONSE") &&
      quotedText === null
    ) {
      discarded.push({
        index,
        stage: "quote",
        reason: `${format} requires a non-null quoted_text — an unquoted rewrite is a generic question, not one drawn from the student's own moment`,
      });
      return;
    }

    if (quotedText !== null) {
      // STEP 5. THE GATE. FORBIDDEN on any rejection below: retrying,
      // re-prompting, trimming, fuzzy-matching, or substituting the nearest
      // real turn. Each of those is a plausible "fix" that quietly converts
      // the guarantee into a lie. DISCARD, full stop.

      if (!sourceReportId || !args.transcriptsByReportId.has(sourceReportId)) {
        discarded.push({
          index,
          stage: "quote",
          reason: `source_report_id ${JSON.stringify(sourceReportId)} names a report not supplied for this generation run — fabricated provenance`,
        });
        return;
      }

      const transcript = args.transcriptsByReportId.get(sourceReportId)!;
      const result = validateVerbatimQuote(quotedText, transcript, {
        expectedTurnIndex: quotedTurnIndex ?? undefined,
      });

      if (!result.ok) {
        discarded.push({
          index,
          stage: "quote",
          reason: `${result.reason}: ${result.detail}`,
        });
        return;
      }

      // The quote must BE the worked line for the two quote-defined formats,
      // not decoration elsewhere in the question.
      if (format === "REWRITE_WEAK_LINE") {
        const rwl = payload as Extract<CheckPayload, { format: "REWRITE_WEAK_LINE" }>;
        if (rwl.weakLine !== quotedText) {
          discarded.push({
            index,
            stage: "quote",
            reason: "REWRITE_WEAK_LINE's weakLine must be exactly the quoted_text",
          });
          return;
        }
      }
      if (format === "PICK_BETTER_RESPONSE") {
        const pbr = payload as Extract<CheckPayload, { format: "PICK_BETTER_RESPONSE" }>;
        if (pbr.candidates[0] !== quotedText) {
          discarded.push({
            index,
            stage: "quote",
            reason: "PICK_BETTER_RESPONSE's first candidate must be exactly the quoted_text",
          });
          return;
        }
      }
    }

    survivors.push({
      format,
      prompt: promptValue,
      payload,
      answerKey,
      quotedText,
      sourceReportId,
      quotedTurnIndex,
    });
  });

  // A zero-survivor run is a failure the caller sees, not a silent empty
  // success — 21-14's path-step assembly would otherwise point at nothing.
  if (survivors.length === 0) {
    return {
      ok: false,
      reason: "no candidate survived validation",
      discarded,
      model,
    };
  }

  // STEP 6. Persist survivors only, with their provenance.
  await prisma.knowledgeCheck.createMany({
    data: survivors.map((s) => ({
      userId: args.userId,
      studyPlanId: args.studyPlanId,
      competencyKey: args.competencyKey,
      format: s.format,
      prompt: s.prompt,
      payload: s.payload as unknown as Prisma.InputJsonValue,
      answerKey:
        s.answerKey === null
          ? Prisma.JsonNull
          : (s.answerKey as unknown as Prisma.InputJsonValue),
      sourceReportId: s.sourceReportId,
      quotedTurnIndex: s.quotedTurnIndex,
      quotedText: s.quotedText,
      generationModel: model,
    })),
  });

  return { ok: true, created: survivors.length, discarded, model };
}
