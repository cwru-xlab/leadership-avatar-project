/**
 * The one-on-one conversation engine's configuration layer.
 *
 * ADDING A NEW INTERACTION TYPE MEANS ADDING ONE RECORD IN `registry.ts` AND
 * NOTHING ELSE. No route, no evaluator module, no report page, no wizard
 * page. A type is declared entirely as data conforming to
 * `InteractionTypeConfig` below: its rubric extras, its prompts, its limits,
 * its four engine primitives (termination policy, visible-context slice,
 * outcome record, time budget), and its setup-wizard steps. Phases 14-16
 * exist to prove this by adding records here and touching nothing under
 * `lib/engine/`.
 *
 * Two layers compose into one session:
 *   - TYPE (`InteractionTypeConfig`) — a built-in, code-reviewed record.
 *   - INSTANCE (`InstanceConfig`) — optional student-authored data (the
 *     existing S3 `CaseStudy` shape, for now).
 * `resolveSessionConfig` in `./resolve` combines them into the single
 * `ResolvedSessionConfig` the rest of the engine consumes.
 */

import type { AttemptLanguage } from "@/lib/languages";

/** A single scored dimension on the report. */
export interface RubricDimension {
  key: string;
  label: string;
  description: string;
}

/**
 * The four dimensions every engine-backed type reports on, in display order.
 * Visual and Vocal are never type-optional (REQ-72) — this list is NOT
 * declarable or overridable by a type record. See
 * `InteractionTypeConfig.extraRubricDimensions`, which can only ADD to it.
 */
export const SHARED_RUBRIC_DIMENSION_KEYS = [
  "visual",
  "vocal",
  "content",
  "behavioral",
] as const;

export type SharedRubricKey = (typeof SHARED_RUBRIC_DIMENSION_KEYS)[number];

/**
 * Who may end a session, and why.
 *
 * Today nothing but the student can end an interview or scenario session —
 * `studentMayEnd: true, avatarMayEnd: false` on every built-in record
 * preserves that exactly. `avatarMayEnd` plus `avatarEndReasons` exists so a
 * future type (Phase 14's tedious pitch) can let the avatar end the session
 * with a recorded reason, without the engine needing a second shape later.
 */
export interface TerminationPolicyConfig {
  studentMayEnd: boolean;
  avatarMayEnd: boolean;
  /** Closed list of reasons the avatar may cite when it ends a session. */
  avatarEndReasons: string[];
}

/**
 * The per-turn slice of session state a type's avatar is allowed to see.
 *
 * Modeled generally — a type declares which CHANNELS of session state are
 * visible on a given turn, not literal slide bookkeeping. "The avatar must
 * not reference slide 10 while the student is on slide 4" (Phase 14) is one
 * instance of a type restricting `visibleChannels`; the permissive default
 * every built-in type uses today is "everything the session knows."
 */
export interface VisibleContextConfig {
  /** `"*"` means every channel of session state is visible every turn — the
   * permissive default every built-in type uses today. A future type can
   * instead list specific channel names (e.g. `"currentSlide"`) to restrict
   * what reaches the avatar on a given turn. */
  visibleChannels: "*" | string[];
}

/** One field of a type-declared structured outcome (e.g. a negotiated price). */
export interface OutcomeFieldDeclaration {
  key: string;
  label: string;
  kind: "string" | "number" | "boolean";
}

/**
 * A type-declared JSON outcome shape for structured results beyond the
 * rubric scores — a negotiated price and equity, for example. Empty for
 * every built-in type today; no built-in type has a structured outcome yet.
 */
export interface OutcomeRecordConfig {
  fields: OutcomeFieldDeclaration[];
}

/** `null` means no budget is enforced — the interview presets and the
 * case-study type have no hard cutoff today. */
export interface TimeBudgetConfig {
  totalSeconds: number | null;
  warnAtRemainingSeconds: number | null;
}

/** One step of the generic pre-session setup wizard (built in plan 13-09). */
export interface SetupStepDeclaration {
  /** Stable step id. */
  id: string;
  /** Human label for the wizard's progress indicator. */
  label: string;
  /** When set, the wizard renders this type's own component for the step
   * (e.g. deck upload, persona paste) instead of a generic field renderer. */
  customComponent?: string;
}

/**
 * Session-constant extra inputs a type's live prompt may need beyond the
 * resolved config itself — today, an interview type's resume text and
 * attempt language. These travel as a sibling input rather than folding into
 * `ResolvedSessionConfig` because `lib/interview/customization.ts` already
 * treats them as outside the TYPE/INSTANCE resolution it owns; this plan
 * does not re-home them. Still strictly session-constant — never a turn
 * index or a timestamp.
 */
export interface LiveSystemPromptExtra {
  resumeText?: string;
  language?: AttemptLanguage;
}

/**
 * A type's prompt wiring.
 *
 * `liveSystemPrompt` is modeled as a PURE function of session-constant
 * inputs only (the resolved config, plus the session-constant extra above) —
 * never a turn index or a timestamp. This is what keeps the assembled system
 * prompt byte-identical turn to turn so OpenAI's prefix cache hits (REQ-73),
 * the same discipline `lib/interview/prompts.ts`'s file header documents for
 * `buildInterviewSystemPrompt`.
 */
export interface InteractionPromptsConfig {
  liveSystemPrompt: (
    config: ResolvedSessionConfig,
    extra: LiveSystemPromptExtra,
  ) => string;
  evaluatorPrompt: string;
  buildEvaluationContext: (
    config: ResolvedSessionConfig,
  ) => Record<string, unknown>;
}

/** A type's limits, stated to the model, not enforced as a hard cutoff
 * (matches the interview presets' existing `targetMinutes`/
 * `targetQuestionCount` semantics). `null` means the type declares no target
 * — the case-study type has no question count or time target today. */
export interface InteractionLimitsConfig {
  targetMinutes: number | null;
  targetQuestionCount: number | null;
}

/**
 * A built-in interaction TYPE, declared entirely as data.
 *
 * `extraRubricDimensions` is EXTRAS ONLY — see
 * `SHARED_RUBRIC_DIMENSION_KEYS`. A type record has no field through which it
 * could declare, override, or omit visual/vocal/content/behavioral; this is
 * what makes REQ-72 structural rather than a convention every type must
 * remember to follow.
 */
export interface InteractionTypeConfig {
  /** URL segment and persisted report value. Stable. */
  slug: string;
  name: string;
  description: string;
  /** Additional scored dimensions beyond the four shared ones. Empty for
   * every built-in type today. */
  extraRubricDimensions: RubricDimension[];
  prompts: InteractionPromptsConfig;
  limits: InteractionLimitsConfig;
  terminationPolicy: TerminationPolicyConfig;
  visibleContext: VisibleContextConfig;
  outcome: OutcomeRecordConfig;
  timeBudget: TimeBudgetConfig;
  /** Whether a session of this type requires a student-authored INSTANCE.
   * `true` for `case-study`; `false` for the interview presets, which run
   * off the type record alone (plus optional customization). */
  instance: { required: boolean };
  /**
   * Whether the client drives mid-session transcript checkpoints.
   * `"client-driven"` — interview presets; client fires ~9-15 checkpoints.
   * `"none"` — case-study; transcript lives in the S3 InteractionLog via
   * `/api/interaction/save`. The engine must REJECT a checkpoint call for
   * `"none"` types rather than silently accepting one (REQ-69).
   */
  checkpointing: "client-driven" | "none";
  /**
   * Where finish flips the row to PENDING (REQ-69 finish-side divergence):
   * `"request-path"` — interview: finish handler writes PENDING before
   *   scheduling evaluation.
   * `"runner"` — case-study: finish does NOT flip status; the evaluation
   *   runner writes PENDING as its first write.
   */
  finishPendingFlip: "request-path" | "runner";
  /**
   * Whether this type exposes a report-evaluation retry route (REQ-69).
   * `true` — interview presets; `/retry` flips FAILED → PENDING and
   *   re-runs evaluation.
   * `false` — case-study; the path genuinely does not exist today, so the
   *   engine retry route returns 404 rather than inventing retry for free.
   */
  supportsRetry: boolean;
  /** Declared steps for the generic pre-session setup wizard (plan 13-09).
   * Declaration only — this plan does not build the wizard. */
  setupSteps: SetupStepDeclaration[];
}

/**
 * The student-authored INSTANCE layer — data, not code. A discriminated
 * union so the resolver can narrow on `kind` without a type guard library.
 *
 * The `"case-study"` member carries exactly the fields the existing scenario
 * pipeline already snapshots at session start (REQ-33) — see
 * `app/api/scenario/session/start/route.ts`'s `backgroundSnapshot` /
 * `avatarsSnapshot` / `criteriaSnapshot` and `lib/scenario/report-dto.ts`'s
 * `scenario.{name,background,characters,criteria}` DTO shape, which this
 * mirrors field-for-field.
 */
export type InstanceConfig =
  | {
      kind: "case-study";
      caseId: string;
      caseName: string;
      background: string;
      avatars: Array<{ name: string; role: string; additionalInfo?: string }>;
      /** The author's own rubric text, or null for a legacy case saved
       * before `evaluationPrompt` existed. */
      criteria: string | null;
    }
  | { kind: "none" };

/**
 * The single object the rest of the engine consumes for a session: the
 * type's identity, the FULL rubric dimension list (four shared dimensions
 * first, then the type's extras, in that fixed order), resolved limits, the
 * four primitives, the resolved instance, and the interview-style
 * `customization` passthrough where present.
 */
export interface ResolvedSessionConfig {
  typeSlug: string;
  typeName: string;
  /** Always `[visual, vocal, content, behavioral, ...extras]` in that order. */
  rubricDimensions: RubricDimension[];
  limits: InteractionLimitsConfig;
  terminationPolicy: TerminationPolicyConfig;
  visibleContext: VisibleContextConfig;
  outcome: OutcomeRecordConfig;
  timeBudget: TimeBudgetConfig;
  instance: InstanceConfig;
  /** Present only for interview types — the already-resolved customization
   * record `resolveCustomizationRecord` in `lib/interview/customization.ts`
   * produces (industry, role, difficulty, persona, etc.). `null` for
   * non-interview types. */
  customization: {
    industry: string;
    roleTitle: string;
    difficulty: string;
    targetMinutes: number;
    targetQuestionCount: number;
    interviewerPersona: string;
  } | null;
}
