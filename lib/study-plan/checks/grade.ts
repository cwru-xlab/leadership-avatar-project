/**
 * Grades the four knowledge-check formats: the three closed ones (MULTIPLE_CHOICE,
 * FILL_IN_BLANK, PICK_BETTER_RESPONSE) deterministically with a pure function that
 * never calls a model, and REWRITE_WEAK_LINE — which has no deterministic answer
 * key (21-06) — with a model grader at the lower CHECK_MODEL_GRADED weight.
 *
 * 21-CONTEXT.md locks that all four formats move mastery but a model-graded
 * rewrite counts for LESS than a deterministically-graded answer. That split is
 * made structural here, not conventional:
 *   - `gradeDeterministic` THROWS if called with REWRITE_WEAK_LINE — there is no
 *     deterministic grade for it, and a caller reaching for one via an `as any`
 *     cast fails loudly instead of silently grading nothing.
 *   - `submitAndGrade` routes on `isDeterministicFormat` (21-06) and only ever
 *     reaches `gradeRewriteWithModel` — and therefore only ever reaches a model
 *     call — for REWRITE_WEAK_LINE. A multiple-choice, fill-in-the-blank, or
 *     pick-the-better-response answer NEVER reaches a model. The battery proves
 *     this with a `callModel` stub that THROWS if invoked, rather than merely
 *     asserting the happy path.
 *   - The mastery contribution this function writes is recorded at the weight
 *     class `CONTRIBUTION_SOURCE_FOR_FORMAT(format)` implies — CHECK_DETERMINISTIC
 *     for the three closed formats, CHECK_MODEL_GRADED for the rewrite — never
 *     the other way around.
 *
 * FILL_IN_BLANK NORMALIZATION — DELIBERATELY DIFFERENT FROM `lib/study-plan/
 * verbatim.ts`. `validateVerbatimQuote` (21-04) permits ONLY Unicode NFC
 * normalization, because it protects a STUDENT'S OWN WORDS from being altered —
 * any further normalization there could let a near-miss be reported as an exact
 * quote match it is not. Blank-matching here is the opposite problem: it is
 * grading the student's TYPING of a known-correct answer, so it additionally
 * permits trimming, internal-whitespace collapsing, and case-insensitive
 * comparison. It does NOT permit stemming, approximate-distance scoring,
 * punctuation stripping, or a superstring/partial-text match — each of those
 * would silently accept a wrong answer as correct, and the student would
 * learn the wrong thing.
 *
 * NEVER RETURNS THE ANSWER KEY. `DeterministicGrade.detail` and
 * `GradeOutcome.detail` carry explanatory TEXT (e.g. naming the correct option's
 * text so a wrong answer still teaches something) — never the raw `AnswerKey`
 * object the check was generated with. 21-22 builds the student-facing route and
 * asserts the key never reaches the browser; this module's return shapes are
 * built so that assertion can hold.
 *
 * CONTEST SEMANTICS ARE OUT OF SCOPE HERE. 21-15 owns what happens when a
 * student disputes a grade (REQ-112) — "the mark stands; the contest is a flag."
 * This module does not read or write `GradingContest`.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type CheckFormat,
  type CheckPayload,
  type AnswerKey,
  type RewriteWeakLinePayload,
  isDeterministicFormat,
  CONTRIBUTION_SOURCE_FOR_FORMAT,
} from "./types";
import {
  CONTRIBUTION_WEIGHTS,
  normalizeRubricScore,
  weightForSource,
} from "@/lib/mastery/weights";
import { validateContributionInputs } from "@/lib/mastery/ledger";
import type { CompetencyKey } from "@/lib/mastery/competencies";
import type { Technique } from "@/lib/study-plan/coached/tips";
import { bestTechniqueFor, explanationFor, techniqueById } from "./explain";

// ---------------------------------------------------------------------------
// Weight-class ordering — duplicated from 21-05's verifier DELIBERATELY. This
// is the file that would be edited if someone decided rewrites should count
// the same as a deterministic grade; the guard belongs where the change would
// happen, not only in lib/mastery/weights.ts's own verifier.
// ---------------------------------------------------------------------------
if (
  !(
    CONTRIBUTION_WEIGHTS.CHECK_DETERMINISTIC >
    CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED
  )
) {
  throw new Error(
    "lib/study-plan/checks/grade.ts: CONTRIBUTION_WEIGHTS.CHECK_DETERMINISTIC must be " +
      "strictly greater than CONTRIBUTION_WEIGHTS.CHECK_MODEL_GRADED — a model-graded " +
      "rewrite must never count as much as a deterministically-graded answer."
  );
}

// ---------------------------------------------------------------------------
// Deterministic grading — pure, no Prisma import reachable from this path.
// ---------------------------------------------------------------------------

export interface DeterministicGrade {
  correct: boolean;
  score: number;
  detail: string;
}

interface MultipleChoiceResponse {
  selectedIndex: number;
}

interface FillInBlankResponse {
  blanks: string[];
}

interface PickBetterResponseResponse {
  betterIndex: number;
}

/**
 * Optional grading context (Phase 23, K2). With a competency key, every
 * result explains WHY, tied to a named library technique — the stored
 * explanation when the check has one, a template for older rows. Without
 * it (pure callers that predate K2) the detail is the bare verdict.
 * Correctness and score NEVER depend on this context.
 */
export interface GradeContext {
  competencyKey?: string;
  prompt?: string;
}

function explanationLines(
  ctx: GradeContext | undefined,
  stored: Parameters<typeof explanationFor>[1],
  matchText: string,
  missIndex: number | null,
): { lines: string[]; options: (string | null)[] | null } {
  if (!ctx?.competencyKey) return { lines: [], options: null };
  const ex = explanationFor(ctx.competencyKey, stored, `${ctx.prompt ?? ""} ${matchText}`);
  if (!ex) return { lines: [], options: null };
  const miss = missIndex !== null ? ex.options?.[missIndex] ?? null : null;
  return {
    lines: [
      ...(miss ? [`What your pick missed: ${miss}`] : []),
      `Why it works: ${ex.why}`,
      ...(ex.technique ? [`Technique: ${ex.technique.name}`] : []),
    ],
    options: ex.options,
  };
}

/** One line per part; the card renders each line on its own row. */
function joinDetail(lines: string[]): string {
  return lines.join("\n");
}

function normalizeBlank(value: string): string {
  // NFC, trim, collapse internal whitespace runs to one space, case-fold.
  // See the module doc comment above for why this differs from verbatim.ts.
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSelectedIndex(
  value: unknown,
  field: "selectedIndex" | "betterIndex",
  maxIndex: number,
  label: string
): number {
  if (!isRecord(value)) {
    throw new Error(`${label}: response must be an object`);
  }
  const raw = value[field];
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > maxIndex
  ) {
    throw new Error(
      `${label}: response.${field} must be an integer between 0 and ${maxIndex}, got ${JSON.stringify(
        raw
      )} — an unanswerable submission is a client bug, not a wrong answer`
    );
  }
  return raw;
}

function gradeMultipleChoice(
  payload: CheckPayload,
  answerKey: AnswerKey | null,
  response: unknown,
  ctx?: GradeContext
): DeterministicGrade {
  if (payload.format !== "MULTIPLE_CHOICE") {
    throw new Error("gradeMultipleChoice: payload.format must be MULTIPLE_CHOICE");
  }
  if (!answerKey || !("correctIndex" in answerKey)) {
    throw new Error("gradeMultipleChoice: answerKey must carry correctIndex");
  }
  const selectedIndex = readSelectedIndex(
    response,
    "selectedIndex",
    payload.options.length - 1,
    "gradeMultipleChoice"
  );
  const correct = selectedIndex === answerKey.correctIndex;
  const correctOptionText = payload.options[answerKey.correctIndex]!;
  const why = explanationLines(
    ctx,
    "explanation" in answerKey ? answerKey.explanation : undefined,
    correctOptionText,
    correct ? null : selectedIndex,
  );
  return {
    correct,
    score: correct ? 1 : 0,
    detail: joinDetail([
      correct
        ? "Nice work — that's the best answer."
        : `Not quite — the correct option was: "${correctOptionText}"`,
      ...why.lines,
    ]),
  };
}

function gradePickBetterResponse(
  payload: CheckPayload,
  answerKey: AnswerKey | null,
  response: unknown,
  ctx?: GradeContext
): DeterministicGrade {
  if (payload.format !== "PICK_BETTER_RESPONSE") {
    throw new Error(
      "gradePickBetterResponse: payload.format must be PICK_BETTER_RESPONSE"
    );
  }
  if (!answerKey || !("betterIndex" in answerKey)) {
    throw new Error("gradePickBetterResponse: answerKey must carry betterIndex");
  }
  // A stored key pointing past the stored candidates is a corrupt row, not
  // a wrong answer — fail loudly rather than mark anything.
  if (answerKey.betterIndex >= payload.candidates.length) {
    throw new Error("gradePickBetterResponse: answerKey.betterIndex is out of range for the stored candidates");
  }
  const betterIndex = readSelectedIndex(
    response,
    "betterIndex",
    payload.candidates.length - 1,
    "gradePickBetterResponse"
  );
  const correct = betterIndex === answerKey.betterIndex;
  const correctCandidateText = payload.candidates[answerKey.betterIndex]!;
  const why = explanationLines(
    ctx,
    "explanation" in answerKey ? answerKey.explanation : undefined,
    correctCandidateText,
    correct ? null : betterIndex,
  );
  return {
    correct,
    score: correct ? 1 : 0,
    detail: joinDetail([
      correct
        ? "Nice work — that's the stronger response."
        : `Not quite — the better response was: "${correctCandidateText}"`,
      ...why.lines,
    ]),
  };
}

function gradeFillInBlank(
  payload: CheckPayload,
  answerKey: AnswerKey | null,
  response: unknown,
  ctx?: GradeContext
): DeterministicGrade {
  if (payload.format !== "FILL_IN_BLANK") {
    throw new Error("gradeFillInBlank: payload.format must be FILL_IN_BLANK");
  }
  if (!answerKey || !("accepted" in answerKey)) {
    throw new Error("gradeFillInBlank: answerKey must carry accepted");
  }
  if (!isRecord(response) || !Array.isArray(response.blanks)) {
    throw new Error("gradeFillInBlank: response.blanks must be an array");
  }
  const blanks = response.blanks;
  if (blanks.length !== payload.blankCount) {
    throw new Error(
      `gradeFillInBlank: response.blanks has ${blanks.length} entries, expected exactly ` +
        `${payload.blankCount} — a response with fewer or more entries than blankCount is a client bug`
    );
  }
  if (blanks.length !== answerKey.accepted.length) {
    throw new Error(
      "gradeFillInBlank: response.blanks length does not match answerKey.accepted length"
    );
  }

  let blanksCorrect = 0;
  const missedBlanks: string[] = [];
  for (let i = 0; i < blanks.length; i++) {
    const submitted = blanks[i];
    if (typeof submitted !== "string") {
      throw new Error(`gradeFillInBlank: response.blanks[${i}] must be a string`);
    }
    const acceptedForBlank = answerKey.accepted[i]!;
    // Defense in depth: 21-06's validateFillInBlankAnswerKey already rejects an
    // empty accepted entry at generation time (itemMin: 1 on readStringArray),
    // but an empty accepted answer would match an empty submission and mark a
    // blank answer correct, so this is re-checked here at grade time too.
    if (acceptedForBlank.some((entry) => entry === "")) {
      throw new Error(
        `gradeFillInBlank: answerKey.accepted[${i}] contains an empty string — ` +
          "an empty accepted answer would match an empty submission"
      );
    }
    const normalizedSubmitted = normalizeBlank(submitted);
    const isCorrect = acceptedForBlank.some(
      (entry) => normalizeBlank(entry) === normalizedSubmitted
    );
    if (isCorrect) blanksCorrect += 1;
    else missedBlanks.push(`Blank ${i + 1} accepts: "${acceptedForBlank[0]}"`);
  }

  const score = blanksCorrect / payload.blankCount;
  const allCorrect = blanksCorrect === payload.blankCount;
  const filled = payload.segments
    .map((seg, i) => (i < answerKey.accepted.length ? `${seg}${answerKey.accepted[i]![0]}` : seg))
    .join("");
  const why = explanationLines(
    ctx,
    "explanation" in answerKey ? answerKey.explanation : undefined,
    filled,
    null,
  );
  return {
    correct: allCorrect,
    score,
    detail: joinDetail([
      allCorrect
        ? `Nice work — ${blanksCorrect} of ${payload.blankCount} blank(s) correct.`
        : `${blanksCorrect} of ${payload.blankCount} blank(s) correct.`,
      ...missedBlanks,
      ...why.lines,
    ]),
  };
}

/**
 * Pure function: no Prisma import reachable from this call path, so the
 * battery's pure section runs with no DATABASE_URL.
 *
 * Throws if called with REWRITE_WEAK_LINE — the type system should prevent
 * this at compile time, but the throw catches the `as any` cast that
 * eventually appears somewhere in a caller.
 */
export function gradeDeterministic(
  format: CheckFormat,
  payload: CheckPayload,
  answerKey: AnswerKey | null,
  response: unknown,
  ctx?: GradeContext
): DeterministicGrade {
  switch (format) {
    case "MULTIPLE_CHOICE":
      return gradeMultipleChoice(payload, answerKey, response, ctx);
    case "PICK_BETTER_RESPONSE":
      return gradePickBetterResponse(payload, answerKey, response, ctx);
    case "FILL_IN_BLANK":
      return gradeFillInBlank(payload, answerKey, response, ctx);
    case "REWRITE_WEAK_LINE":
      throw new Error(
        "gradeDeterministic: REWRITE_WEAK_LINE has no deterministic grade — " +
          "use gradeRewriteWithModel instead"
      );
    default: {
      const exhaustive: never = format;
      throw new Error(`gradeDeterministic: unknown format ${String(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Model-graded rewrite
// ---------------------------------------------------------------------------

/**
 * The JSON schema a rewrite-grading model call must satisfy: one `score`
 * integer 1..5, one `rationale` string, and a per-criterion boolean array.
 * `criteriaMet`'s LENGTH is not enforced by the schema itself (it varies per
 * question, 1..4 criteria) — it is checked against `payload.rubricCriteria.
 * length` in code, and a mismatch is rejected as a grading failure rather
 * than silently truncated or padded.
 */
export const REWRITE_GRADING_SCHEMA = {
  name: "rewrite_weak_line_grade",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["score", "rationale", "criteriaMet"],
    properties: {
      score: { type: "integer" },
      rationale: { type: "string" },
      criteriaMet: {
        type: "array",
        items: { type: "boolean" },
      },
    },
  },
} as const;

export interface RewriteGradeModelResponse {
  score: number;
  rationale: string;
  criteriaMet: boolean[];
}

export type CallRewriteModel = (args: {
  payload: RewriteWeakLinePayload;
  response: { rewrittenLine: string };
  technique?: Pick<Technique, "name" | "reminder"> | null;
}) => Promise<RewriteGradeModelResponse>;

export type RewriteGradeOutcome =
  | { score: number; rationale: string; model: string }
  | { ok: false; reason: string };

async function defaultCallRewriteModel(args: {
  payload: RewriteWeakLinePayload;
  response: { rewrittenLine: string };
  technique?: Pick<Technique, "name" | "reminder"> | null;
}): Promise<RewriteGradeModelResponse> {
  const OpenAI = (await import("openai")).default;
  const model = process.env.REWRITE_GRADING_MODEL || "gpt-4.1";
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });

  const systemPrompt =
    "You grade a student's rewrite of a weak line from a leadership conversation " +
    "against a technique hint and a fixed list of rubric criteria. Score 1 " +
    "(did not apply the technique) to 5 (applied it fully). For each rubric " +
    "criterion, report whether the rewrite satisfies it, in the SAME ORDER the " +
    "criteria were given. Do not invent criteria. When `contextLine` is " +
    "present it is what the other person said just before the weak line: " +
    "judge whether the rewrite answers it. Write the rationale as 1-2 " +
    "sentences addressed to the student (\"you\"), naming the technique by " +
    "its name when one is given, and saying what the rewrite did or still " +
    "needs to do. Do not quote the student's words.";

  const userMessage = JSON.stringify({
    contextLine: args.payload.contextLine ?? null,
    technique: args.technique ?? null,
    weakLine: args.payload.weakLine,
    techniqueHint: args.payload.techniqueHint,
    rubricCriteria: args.payload.rubricCriteria,
    rewrittenLine: args.response.rewrittenLine,
  });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 1_000,
    response_format: {
      type: "json_schema",
      json_schema: REWRITE_GRADING_SCHEMA,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Rewrite grading model returned no content");
  return JSON.parse(content) as RewriteGradeModelResponse;
}

/**
 * Grades a REWRITE_WEAK_LINE response with a model. `callModel` is injectable
 * (same shape convention as `attemptGeneration` in lib/study-plan/generate.ts)
 * so the battery needs no OPENAI_API_KEY.
 *
 * Normalizes the model's 1..5 score to 0..1 via `normalizeRubricScore` (21-05)
 * — imported, never restated — so a floor-scoring rewrite contributes 0, not
 * 20% credit. Rejects (does not clamp) an out-of-range score, and rejects a
 * `criteriaMet` array whose length does not match `payload.rubricCriteria.
 * length` — a grader that invented criteria graded a different question.
 */
export async function gradeRewriteWithModel(args: {
  payload: RewriteWeakLinePayload;
  response: { rewrittenLine: string };
  callModel?: CallRewriteModel;
  technique?: Pick<Technique, "name" | "reminder"> | null;
}): Promise<RewriteGradeOutcome> {
  const callModel = args.callModel ?? defaultCallRewriteModel;
  const model = process.env.REWRITE_GRADING_MODEL || "gpt-4.1";

  let raw: RewriteGradeModelResponse;
  try {
    raw = await callModel({
      payload: args.payload,
      response: args.response,
      technique: args.technique ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Rewrite grading model call failed: ${message}` };
  }

  if (
    !raw ||
    typeof raw.rationale !== "string" ||
    !Array.isArray(raw.criteriaMet)
  ) {
    return { ok: false, reason: "Rewrite grading model returned a malformed response" };
  }

  if (raw.criteriaMet.length !== args.payload.rubricCriteria.length) {
    return {
      ok: false,
      reason:
        `Rewrite grading model returned ${raw.criteriaMet.length} criteriaMet ` +
        `entries, expected exactly ${args.payload.rubricCriteria.length} — a grader ` +
        "that invented criteria graded a different question",
    };
  }
  if (!raw.criteriaMet.every((entry) => typeof entry === "boolean")) {
    return {
      ok: false,
      reason: "Rewrite grading model's criteriaMet must contain only booleans",
    };
  }

  let normalized: number;
  try {
    normalized = normalizeRubricScore(raw.score);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Rewrite grading model returned an invalid score: ${message}` };
  }

  return { score: normalized, rationale: raw.rationale, model };
}

// ---------------------------------------------------------------------------
// submitAndGrade — the one database-touching entry point
// ---------------------------------------------------------------------------

/** The stored library technique, or the best match for older rows. */
export function rewriteTechniqueFor(
  competencyKey: string,
  payload: RewriteWeakLinePayload,
  prompt: string,
): Technique | null {
  return (
    techniqueById(competencyKey, payload.techniqueId) ??
    bestTechniqueFor(competencyKey, `${prompt} ${payload.techniqueHint}`)
  );
}

export class AlreadyAnsweredError extends Error {
  constructor(public readonly knowledgeCheckId: string) {
    super(`Knowledge check ${knowledgeCheckId} has already been answered`);
    this.name = "AlreadyAnsweredError";
  }
}

export class CheckNotFoundError extends Error {
  constructor(public readonly knowledgeCheckId: string) {
    super(`Knowledge check ${knowledgeCheckId} does not exist or is not owned by this user`);
    this.name = "CheckNotFoundError";
  }
}

export class RewriteGradingFailedError extends Error {
  constructor(public readonly reason: string) {
    super(`Rewrite grading failed: ${reason}`);
    this.name = "RewriteGradingFailedError";
  }
}

export interface GradeOutcome {
  attemptId: string;
  correct: boolean | null;
  score: number;
  gradedBy: "DETERMINISTIC" | "MODEL";
  /** Explanatory feedback text. NEVER the raw answer key. */
  detail: string;
}

/**
 * Loads the check (scoped by userId in the WHERE clause, not filtered after
 * fetching), routes on `isDeterministicFormat`, and writes the attempt plus
 * exactly ONE MasteryContribution in a single transaction.
 *
 * `recordContributions` (lib/mastery/ledger.ts) hardcodes the module-level
 * `prisma` singleton rather than accepting an injectable client, so it cannot
 * participate in the SAME low-level transaction as the attempt write without
 * breaking the "attempt and contribution in one transaction" invariant this
 * plan requires (a graded attempt with no contribution is invisible mastery;
 * a contribution with no attempt cannot be contested). This function reuses
 * `recordContributions`'s own validation (`validateContributionInputs`) and
 * weight-snapshot rule (`weightForSource`) directly, and writes both rows via
 * Prisma's BATCH `$transaction([...])` form so they commit or roll back
 * together — see 21-11-SUMMARY.md for this disclosed deviation.
 */
export async function submitAndGrade(args: {
  userId: string;
  knowledgeCheckId: string;
  response: unknown;
  callModel?: CallRewriteModel;
}): Promise<GradeOutcome> {
  const check = await prisma.knowledgeCheck.findFirst({
    where: { id: args.knowledgeCheckId, userId: args.userId },
  });
  if (!check) {
    throw new CheckNotFoundError(args.knowledgeCheckId);
  }

  const format = check.format as CheckFormat;
  const payload = check.payload as unknown as CheckPayload;
  const answerKey = (check.answerKey as unknown as AnswerKey | null) ?? null;
  const occurredAt = new Date();

  let correct: boolean | null;
  let score: number;
  let gradedBy: "DETERMINISTIC" | "MODEL";
  let graderModel: string | null;
  let graderRationale: string;

  if (isDeterministicFormat(format)) {
    const grade = gradeDeterministic(format, payload, answerKey, args.response, {
      competencyKey: check.competencyKey,
      prompt: check.prompt,
    });
    correct = grade.correct;
    score = grade.score;
    gradedBy = "DETERMINISTIC";
    graderModel = null;
    graderRationale = grade.detail;
  } else {
    if (payload.format !== "REWRITE_WEAK_LINE") {
      throw new Error(
        "submitAndGrade: non-deterministic format must be REWRITE_WEAK_LINE"
      );
    }
    const technique = rewriteTechniqueFor(check.competencyKey, payload, check.prompt);
    const outcome = await gradeRewriteWithModel({
      payload,
      response: args.response as { rewrittenLine: string },
      callModel: args.callModel,
      technique,
    });
    if ("ok" in outcome && outcome.ok === false) {
      throw new RewriteGradingFailedError(outcome.reason);
    }
    const success = outcome as { score: number; rationale: string; model: string };
    correct = null;
    score = success.score;
    gradedBy = "MODEL";
    graderModel = success.model;
    // K2: the result names the library technique the rewrite practises.
    graderRationale = technique
      ? joinDetail([success.rationale, `Technique: ${technique.name} — ${technique.reminder}`])
      : success.rationale;
  }

  const source = CONTRIBUTION_SOURCE_FOR_FORMAT(format);

  // Validate with the SAME rule recordContributions enforces, before any
  // write — a batch $transaction cannot be rolled back by a validation
  // failure discovered mid-flight the way an interactive transaction can.
  validateContributionInputs([
    {
      userId: args.userId,
      competencyKey: check.competencyKey as CompetencyKey,
      source,
      rawScore: score,
      occurredAt,
    },
  ]);

  const attemptId = randomUUID();
  const contributionId = randomUUID();

  try {
    await prisma.$transaction([
      prisma.knowledgeCheckAttempt.create({
        data: {
          id: attemptId,
          knowledgeCheckId: check.id,
          userId: args.userId,
          response: args.response as Prisma.InputJsonValue,
          correct,
          score,
          gradedBy,
          graderModel,
          graderRationale,
          submittedAt: occurredAt,
          gradedAt: occurredAt,
        },
      }),
      prisma.masteryContribution.create({
        data: {
          id: contributionId,
          userId: args.userId,
          competencyKey: check.competencyKey,
          source,
          rawScore: score,
          // Snapshotted at write time — the same rule recordContributions
          // applies. Retuning a weight later must never retroactively
          // rewrite a figure the student already saw.
          weight: weightForSource(source),
          occurredAt,
          sourceAttemptId: attemptId,
        },
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AlreadyAnsweredError(args.knowledgeCheckId);
    }
    throw err;
  }

  return {
    attemptId,
    correct,
    score,
    gradedBy,
    detail: graderRationale,
  };
}
