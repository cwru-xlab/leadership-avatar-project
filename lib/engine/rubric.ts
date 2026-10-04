/**
 * Type-derived evaluator JSON schema and score parsing.
 *
 * The two hardcoded schemas in `lib/interview/evaluation.ts` and
 * `lib/scenario/evaluation.ts` are byte-identical in shape for today's five
 * types. This module derives that same shape from
 * `ResolvedSessionConfig.rubricDimensions` so a Phase 14 type that declares
 * extras gets them appended to `required[]` / `properties` without a second
 * evaluator module (REQ-71). Visual and Vocal are structurally required
 * (REQ-72) — this module rejects a config that somehow omits them.
 */

import {
  rubricDimensionProperty,
  STRUCTURED_REPORT_PROPERTIES,
  STRUCTURED_REPORT_REQUIRED,
} from "@/lib/report/structured";
import type { ScoreMap } from "@/lib/report/snapshot";
import {
  SHARED_RUBRIC_DIMENSION_KEYS,
  type ResolvedSessionConfig,
} from "./types";

/** OpenAI strict json_schema envelope matching today's two hardcoded schemas. */
export interface RubricJsonSchema {
  name: string;
  strict: true;
  schema: {
    type: "object";
    additionalProperties: false;
    required: string[];
    properties: Record<string, unknown>;
  };
}

/**
 * Score property name for a dimension key — same `_score` suffix the
 * existing prompts and schemas expect (`visual` → `visual_score`).
 */
export function scorePropertyName(dimensionKey: string): string {
  return `${dimensionKey}_score`;
}

/**
 * Schema name preserved for deep equality with the legacy constants until
 * plan 13-13 deletes them. Interview-shaped types (instance kind `"none"`)
 * keep `"interview_evaluation"`; case-study keeps `"scenario_evaluation"`.
 */
function schemaNameFor(config: ResolvedSessionConfig): string {
  return config.instance.kind === "case-study"
    ? "scenario_evaluation"
    : "interview_evaluation";
}

/**
 * Builds the OpenAI `json_schema` envelope for one resolved type.
 *
 * Throws at CONFIG level (not per session) if `visual` or `vocal` is missing
 * from `config.rubricDimensions` — belt-and-braces for REQ-72 given that
 * `resolve.ts` already always prepends the four shared dimensions.
 */
export function buildRubricJsonSchema(
  config: ResolvedSessionConfig,
): RubricJsonSchema {
  const keys = config.rubricDimensions.map((d) => d.key);
  if (!keys.includes("visual") || !keys.includes("vocal")) {
    throw new Error(
      `ResolvedSessionConfig for "${config.typeSlug}" is missing visual or vocal in rubricDimensions — visual/vocal are never type-optional (REQ-72)`,
    );
  }

  const scoreRequired = config.rubricDimensions.map((d) =>
    scorePropertyName(d.key),
  );
  const scoreProperties: Record<string, unknown> = {};
  for (const dim of config.rubricDimensions) {
    scoreProperties[scorePropertyName(dim.key)] = rubricDimensionProperty(
      dim.key,
      dim.label,
    );
  }

  return {
    name: schemaNameFor(config),
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [...scoreRequired, ...STRUCTURED_REPORT_REQUIRED],
      properties: {
        ...scoreProperties,
        ...STRUCTURED_REPORT_PROPERTIES,
      },
    },
  };
}

/**
 * Maps a model response's `*_score` fields into a dimension-keyed `ScoreMap`
 * for the config's rubric. Nulls stay null (never coerced to 0). Missing keys
 * become null. Non-integer / out-of-range numbers become null — same
 * discipline as the legacy validators' `coerceScore`.
 */
export function parseRubricScores(
  parsedJson: unknown,
  config: ResolvedSessionConfig,
): ScoreMap {
  const raw =
    parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
      ? (parsedJson as Record<string, unknown>)
      : {};

  const scores: ScoreMap = {};
  for (const dim of config.rubricDimensions) {
    scores[dim.key] = coerceScore(raw[scorePropertyName(dim.key)]);
  }

  // Guarantee the four shared keys exist even if a synthetic config somehow
  // reordered them — callers (and report cards) always expect these.
  for (const key of SHARED_RUBRIC_DIMENSION_KEYS) {
    if (!(key in scores)) scores[key] = null;
  }

  return scores;
}

function coerceScore(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}
