/**
 * The TYPE + INSTANCE resolver.
 *
 * PURE and deterministic — no I/O, no `Date.now()`, no randomness. It is
 * re-run on every chat turn once later plans wire it into the live route
 * (the same discipline `lib/interview/customization.ts` documents for
 * `resolveInterviewType`), which is what keeps the OpenAI prefix cache safe:
 * the same `(typeSlug, input)` pair must always produce a deeply equal
 * `ResolvedSessionConfig`.
 */

import { getInterviewType } from "../interview/types";
import {
  resolveInterviewType,
  resolveCustomizationRecord,
  type InterviewCustomizationInput,
} from "../interview/customization";

import { getEngineType } from "./registry";
import {
  SHARED_RUBRIC_DIMENSION_KEYS,
  type InstanceConfig,
  type InteractionTypeConfig,
  type ResolvedSessionConfig,
  type RubricDimension,
} from "./types";

const SHARED_RUBRIC_DIMENSIONS: RubricDimension[] = [
  {
    key: "visual",
    label: "Visual",
    description: "Body language and camera presence.",
  },
  {
    key: "vocal",
    label: "Vocal",
    description: "Vocal delivery — pace, tone, filler words.",
  },
  {
    key: "content",
    label: "Content",
    description: "Substance and relevance of what was said.",
  },
  {
    key: "behavioral",
    label: "Behavioral",
    description: "How the candidate handled the conversation.",
  },
];

export interface ResolveSessionConfigInput {
  instance?: InstanceConfig | null;
  /** Only consulted for interview-shaped types — see `resolveFromTypeConfig`. */
  customization?: InterviewCustomizationInput | null;
}

export type ResolveSessionConfigResult =
  | { ok: true; config: ResolvedSessionConfig }
  | { ok: false; reason: string };

/**
 * Builds the shared-plus-extras rubric dimension list for one type record.
 * Always `[visual, vocal, content, behavioral, ...extras]` in that order.
 * An extra whose key collides with a shared key (or with another extra) is
 * rejected as `ok: false` rather than silently shadowing the shared
 * dimension — a type record has no way to remove or override visual/vocal.
 */
function resolveRubricDimensions(
  type: InteractionTypeConfig,
): { ok: true; dimensions: RubricDimension[] } | { ok: false; reason: string } {
  const seen = new Set<string>(SHARED_RUBRIC_DIMENSION_KEYS);

  for (const extra of type.extraRubricDimensions) {
    if (seen.has(extra.key)) {
      return {
        ok: false,
        reason: `interaction type "${type.slug}" declares a duplicate rubric dimension key "${extra.key}"`,
      };
    }
    seen.add(extra.key);
  }

  return {
    ok: true,
    dimensions: [...SHARED_RUBRIC_DIMENSIONS, ...type.extraRubricDimensions],
  };
}

/**
 * Lower-level resolver that takes an `InteractionTypeConfig` record
 * directly rather than a slug. `resolveSessionConfig` below is the normal
 * entry point (it looks the record up by slug through the registry); this
 * is exported separately so a caller — notably
 * `scripts/verify-engine-config.ts` — can exercise the duplicate-dimension
 * rejection path against a synthetic record, since none of the five
 * built-in records declare one.
 */
export function resolveFromTypeConfig(
  type: InteractionTypeConfig,
  input: ResolveSessionConfigInput = {},
): ResolveSessionConfigResult {
  const instance: InstanceConfig = input.instance ?? { kind: "none" };

  if (type.instance.required && instance.kind === "none") {
    return {
      ok: false,
      reason: `interaction type "${type.slug}" requires an instance`,
    };
  }

  const rubric = resolveRubricDimensions(type);

  if (!rubric.ok) return rubric;

  // Only interview-shaped types (today: the four presets, each transcribed
  // from a same-slug record in `lib/interview/types.ts`) accept the legacy
  // client customization payload. `resolveInterviewType` stays the single
  // place picker fields are validated — this does not reimplement it.
  const legacyBase = getInterviewType(type.slug);
  let customization: ResolvedSessionConfig["customization"] = null;
  let limits = type.limits;

  if (legacyBase) {
    const resolvedInterview = resolveInterviewType(
      type.slug,
      input.customization ?? undefined,
    );

    if (resolvedInterview) {
      customization = resolveCustomizationRecord(resolvedInterview);
      limits = {
        targetMinutes: customization.targetMinutes,
        targetQuestionCount: customization.targetQuestionCount,
      };
    }
  }

  const config: ResolvedSessionConfig = {
    typeSlug: type.slug,
    typeName: type.name,
    rubricDimensions: rubric.dimensions,
    limits,
    terminationPolicy: type.terminationPolicy,
    visibleContext: type.visibleContext,
    outcome: type.outcome,
    timeBudget: type.timeBudget,
    instance,
    customization,
  };

  return { ok: true, config };
}

/**
 * Resolves a type slug plus an optional instance/customization into one
 * `ResolvedSessionConfig`. An unknown slug returns `ok: false` and never
 * throws.
 */
export function resolveSessionConfig(
  typeSlug: string | undefined | null,
  input: ResolveSessionConfigInput = {},
): ResolveSessionConfigResult {
  const type = getEngineType(typeSlug);

  if (!type) {
    return {
      ok: false,
      reason: `unknown interaction type slug: ${String(typeSlug)}`,
    };
  }

  return resolveFromTypeConfig(type, input);
}
