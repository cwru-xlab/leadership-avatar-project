/**
 * One evaluator for every engine-backed interaction type (REQ-59).
 *
 * Collapses `lib/interview/evaluation.ts` (non-throwing discriminated union)
 * and `lib/scenario/evaluation.ts` (throws `ScenarioEvaluationError`) into
 * the interview contract: NEVER throws — returns `EvaluationOutcome |
 * EvaluationFailure`. The unified runner persists FAILED with a
 * `failureReason` on the failure branch, which is what the scenario
 * runner's catch block already did with the thrown error (REQ-69).
 *
 * Type-specific grading inputs stay out of this file: the type's
 * `buildEvaluationContext` supplies them, and the JSON schema comes from
 * `buildRubricJsonSchema(config)`. No `if (typeSlug === ...)` branch.
 *
 * Plan 14-04: optional image content parts (type-declared via
 * `buildEvaluationImages`) and a produced outcome parsed from the SAME
 * schema-constrained response. BUDGET_MS / RETRIES are locked by 13-05.
 */

import {
  composeReportMarkdown,
  parseStructuredReport,
  type StructuredReport,
} from "@/lib/report/structured";
import { sanitizeBodySignalWording } from "@/lib/report/body-signal-validator";
import type { ScoreMap } from "@/lib/report/snapshot";
import type { VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import { buildScenarioEvaluationUserMessage } from "@/lib/scenario/prompts";

import { getEngineType } from "./registry";
import {
  buildRubricJsonSchema,
  parseOutcomeFields,
  parseRubricScores,
} from "./rubric";
import type { EvaluatorImage, ResolvedSessionConfig } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidatedEvaluation {
  scores: ScoreMap;
  /** Composed from `reportStructured`, never returned by the model. */
  reportMarkdown: string;
  reportStructured: StructuredReport;
}

export interface EvaluationOutcome {
  ok: true;
  result: ValidatedEvaluation;
  model: string;
  /**
   * Raw outcome object pulled from the model response for `validateOutcome`.
   * Null when the type declares no outcome fields or the key was absent.
   */
  producedOutcome: Record<string, unknown> | null;
}

export interface EvaluationFailure {
  ok: false;
  reason: string;
  model: string;
}

export interface MetricsOutcome {
  visualMetrics: VisualMetrics | null;
  vocalMetrics: VocalMetrics | null;
}

export interface RunEvaluationInput {
  config: ResolvedSessionConfig;
  transcript: string;
  /**
   * Type-specific grading inputs from the type's `buildEvaluationContext`,
   * optionally enriched by the runner (e.g. interview `resumeText` from the
   * stored inputSnapshot). Discriminated on `kind`.
   */
  evaluationContext: Record<string, unknown>;
  metricsOutcome: MetricsOutcome;
  /**
   * Optional rendered artifact images. When present and non-empty, the user
   * message becomes a multimodal content array; when absent, a plain string
   * (byte-identical to today's requests for types that declare no images).
   */
  images?: EvaluatorImage[];
}

const MAX_REASON_LENGTH = 500;
const BUDGET_MS = 50_000;
const RETRIES = 1;
const PER_ATTEMPT_TIMEOUT = Math.floor(BUDGET_MS / (RETRIES + 1));
const RETRY_DELAY_MS = 1_000;

/**
 * Hard cap on evaluator images (14-RESEARCH.md Pitfall 3 / CONTEXT.md
 * Claude's-Discretion). Must fit inside BUDGET_MS with `detail: "low"`.
 */
export const MAX_EVALUATOR_IMAGES = 12;

function truncateReason(reason: string): string {
  return reason.length > MAX_REASON_LENGTH
    ? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`
    : reason;
}

/**
 * Eval-model env var honored per origin so existing deployments keep their
 * meaning. Derived from the evaluationContext kind (not a typeSlug list).
 */
function resolveEvalModel(evaluationContext: Record<string, unknown>): string {
  if (evaluationContext.kind === "scenario") {
    return process.env.SCENARIO_EVAL_MODEL || "gpt-4.1";
  }
  return process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";
}

function reportTitleFor(evaluationContext: Record<string, unknown>): string {
  return evaluationContext.kind === "scenario"
    ? "Scenario Performance Report"
    : "Interview Performance Report";
}

/**
 * Evenly samples up to `MAX_EVALUATOR_IMAGES`, always including the first and
 * last image. Exported so verification can assert the sampling contract.
 */
export function sampleEvaluatorImages(
  images: EvaluatorImage[],
  max: number = MAX_EVALUATOR_IMAGES,
): { sampled: EvaluatorImage[]; sampledFromTotal: number | null } {
  if (images.length <= max) {
    return { sampled: images, sampledFromTotal: null };
  }

  // Evenly-spaced index set that always includes first and last.
  const lastIndex = images.length - 1;
  const indices = new Set<number>();
  indices.add(0);
  indices.add(lastIndex);
  for (let i = 1; i < max - 1; i++) {
    indices.add(Math.round((i * lastIndex) / (max - 1)));
  }
  // If rounding under-filled, walk forward filling gaps.
  let cursor = 0;
  while (indices.size < max && cursor <= lastIndex) {
    indices.add(cursor);
    cursor += 1;
  }
  const ordered = [...indices].sort((a, b) => a - b).slice(0, max);
  return {
    sampled: ordered.map((i) => images[i]!),
    sampledFromTotal: images.length,
  };
}

/**
 * Builds the label-list / sampling note appended to the text part so the
 * model can refer to attached images by name (vision parts carry no labels).
 */
export function buildImageAttachmentNote(
  sampled: EvaluatorImage[],
  sampledFromTotal: number | null,
): string {
  const labels = sampled.map((img) => img.label).join(", ");
  if (sampledFromTotal !== null) {
    return (
      `Slide images attached, in order: ${labels}\n` +
      `(${sampled.length} of ${sampledFromTotal} slides, evenly sampled)`
    );
  }
  return `Slide images attached, in order: ${labels}`;
}

/**
 * Assembles the USER message. Format stays byte-compatible with today's two
 * evaluators so model-facing input does not change. Dispatch is on the
 * context's `kind` discriminator the type record produced — not on typeSlug.
 */
function buildUserMessage(
  transcript: string,
  evaluationContext: Record<string, unknown>,
  metrics: MetricsOutcome,
): string {
  if (evaluationContext.kind === "scenario") {
    const characters = Array.isArray(evaluationContext.characters)
      ? (evaluationContext.characters as Array<{ name: string; role: string }>)
      : [];
    return buildScenarioEvaluationUserMessage({
      caseName:
        typeof evaluationContext.caseName === "string"
          ? evaluationContext.caseName
          : "",
      background:
        typeof evaluationContext.background === "string"
          ? evaluationContext.background
          : "",
      characters,
      authorCriteria:
        typeof evaluationContext.authorCriteria === "string"
          ? evaluationContext.authorCriteria
          : evaluationContext.authorCriteria === null
            ? null
            : null,
      transcript,
      visualMetrics: metrics.visualMetrics,
      vocalMetrics: metrics.vocalMetrics,
    });
  }

  // Interview (and any future kind that shares this envelope).
  const customization =
    evaluationContext.customization &&
    typeof evaluationContext.customization === "object"
      ? (evaluationContext.customization as Record<string, unknown>)
      : {};
  const resumeText =
    typeof evaluationContext.resumeText === "string"
      ? evaluationContext.resumeText
      : "";
  const resumeSection = resumeText.trim() || "(No resume was provided.)";
  const roleContextJson = JSON.stringify({
    role_title:
      typeof customization.roleTitle === "string" ? customization.roleTitle : "",
    industry:
      typeof customization.industry === "string" ? customization.industry : "",
    difficulty:
      typeof customization.difficulty === "string"
        ? customization.difficulty
        : "",
  });

  return `full_transcript:
${transcript}

resume_text:
${resumeSection}

role_context:
${roleContextJson}

visual_metrics: ${metrics.visualMetrics ? JSON.stringify(metrics.visualMetrics) : "null"}
vocal_metrics: ${metrics.vocalMetrics ? JSON.stringify(metrics.vocalMetrics) : "null"}`;
}

type UserMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image_url";
          image_url: { url: string; detail: "low" };
        }
    >;

/**
 * When images are present, build a multimodal content array. Absent images
 * keep the plain string so existing types' requests are byte-identical.
 *
 * 14-RESEARCH.md: only the qualitative claim about `detail: "low"` is relied
 * on; no per-model token math is assumed. BUDGET_MS is not re-tuned here.
 */
function buildUserMessageContent(
  text: string,
  images: EvaluatorImage[] | undefined,
): UserMessageContent {
  if (!images || images.length === 0) return text;

  const { sampled, sampledFromTotal } = sampleEvaluatorImages(images);
  const note = buildImageAttachmentNote(sampled, sampledFromTotal);
  const textWithLabels = `${text}\n\n${note}`;

  return [
    { type: "text", text: textWithLabels },
    ...sampled.map((img) => ({
      type: "image_url" as const,
      image_url: { url: img.dataUrl, detail: "low" as const },
    })),
  ];
}

/**
 * Validates a model response into scores + structured body. Throws on an
 * empty body so the retry loop can catch and (eventually) return a failure
 * outcome — never a blank READY report.
 */
export function validateEvaluationResult(
  raw: unknown,
  config: ResolvedSessionConfig,
  opts: { hasVisualMetrics: boolean; hasVocalMetrics: boolean },
  evaluationContext: Record<string, unknown>,
): ValidatedEvaluation {
  const parsedReport = parseStructuredReport(raw);
  if (!parsedReport) {
    throw new Error("Evaluator returned an empty report body");
  }

  const { report: reportStructured, strippedCount } =
    sanitizeBodySignalWording(parsedReport);
  if (strippedCount > 0) {
    console.warn("Engine evaluator body-signal wording violation stripped", {
      strippedCount,
      typeSlug: config.typeSlug,
    });
  }

  const scores = parseRubricScores(raw, config);

  // Metric gate: no metrics supplied → visual/vocal forced null, discarding
  // whatever the model returned — same as both legacy validators.
  if (!opts.hasVisualMetrics) scores.visual = null;
  if (!opts.hasVocalMetrics) scores.vocal = null;

  const reportMarkdown = composeReportMarkdown(reportStructured, {
    title: reportTitleFor(evaluationContext),
    scores: {
      visual: scores.visual ?? null,
      vocal: scores.vocal ?? null,
      content: scores.content ?? null,
      behavioral: scores.behavioral ?? null,
    },
  });

  return { scores, reportMarkdown, reportStructured };
}

interface AttemptResult {
  validated: ValidatedEvaluation;
  producedOutcome: Record<string, unknown> | null;
}

async function attemptEvaluation(
  input: RunEvaluationInput,
  evaluatorPrompt: string,
  model: string,
  timeoutMs: number,
): Promise<AttemptResult> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const schema = buildRubricJsonSchema(input.config);
  const textMessage = buildUserMessage(
    input.transcript,
    input.evaluationContext,
    input.metricsOutcome,
  );
  const content = buildUserMessageContent(textMessage, input.images);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: evaluatorPrompt },
      {
        role: "user",
        content,
      },
    ],
    max_tokens: 4000,
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  });

  const responseContent = completion.choices[0]?.message?.content;
  if (!responseContent) {
    throw new Error("Evaluator returned no content");
  }

  const parsed = JSON.parse(responseContent) as unknown;
  const validated = validateEvaluationResult(
    parsed,
    input.config,
    {
      hasVisualMetrics: input.metricsOutcome.visualMetrics !== null,
      hasVocalMetrics: input.metricsOutcome.vocalMetrics !== null,
    },
    input.evaluationContext,
  );
  return {
    validated,
    producedOutcome: parseOutcomeFields(parsed, input.config),
  };
}

/**
 * Runs the type's evaluator once, retries once on failure, and NEVER
 * throws — the caller must always be able to record a FAILED report with a
 * readable reason rather than crashing a background job.
 */
export async function runEvaluation(
  input: RunEvaluationInput,
): Promise<EvaluationOutcome | EvaluationFailure> {
  const type = getEngineType(input.config.typeSlug);
  if (!type) {
    return {
      ok: false,
      reason: truncateReason(
        `Unknown interaction type slug: ${input.config.typeSlug}`,
      ),
      model: resolveEvalModel(input.evaluationContext),
    };
  }

  const model = resolveEvalModel(input.evaluationContext);
  const evaluatorPrompt = type.prompts.evaluatorPrompt;

  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    try {
      const { validated, producedOutcome } = await attemptEvaluation(
        input,
        evaluatorPrompt,
        model,
        PER_ATTEMPT_TIMEOUT,
      );
      console.info("Engine evaluation completed", {
        model,
        typeSlug: input.config.typeSlug,
        contentScore: validated.scores.content ?? null,
        behavioralScore: validated.scores.behavioral ?? null,
        markdownLength: validated.reportMarkdown.length,
        imageCount: input.images?.length ?? 0,
      });
      return { ok: true, result: validated, model, producedOutcome };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt <= RETRIES) {
        console.warn(
          `Engine evaluation attempt ${attempt} failed, retrying: ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  const reason = truncateReason(
    `Evaluation failed after ${RETRIES + 1} attempts: ${finalMessage}`,
  );

  return { ok: false, reason, model };
}
