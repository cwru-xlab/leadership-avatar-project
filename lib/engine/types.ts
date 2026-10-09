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
import type { ScoreMap } from "@/lib/report/snapshot";
import type { DeckModeInputs } from "@/lib/pitch/deck-modes";
import type { DisengagementCause, DisengagementWeights } from "./disengagement";

/** A single scored dimension on the report. */
export interface RubricDimension {
  key: string;
  label: string;
  description: string;
}

/**
 * One rendered artifact image a type wants the evaluator to see.
 * `dataUrl` is a full `data:image/...;base64,...` (or https) URL the OpenAI
 * vision content part can consume; `label` is a human name ("slide 1") so the
 * text part of the user message can refer to images unambiguously.
 */
export interface EvaluatorImage {
  dataUrl: string;
  label: string;
}

/** Kind of a type-declared outcome field — maps 1:1 to JSON Schema types. */
export type OutcomeFieldKind = "string" | "number" | "boolean";

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
 * `avatarMayEnd` plus `avatarEndReasons` lets an eligible type accept a
 * marker-based avatar end with a recorded reason. Threshold-null types retain
 * that Phase 13/14 behavior. A Phase 18 threshold-enabled type additionally
 * requires derived disengagement before its avatar end is accepted; the
 * engine still owns that gate rather than trusting the model's judgment alone.
 */
export interface TerminationPolicyConfig {
  studentMayEnd: boolean;
  avatarMayEnd: boolean;
  /** Closed list of reasons the avatar may cite when it ends a session. */
  avatarEndReasons: string[];
  /**
   * An avatar-initiated end must never land before enough has happened to
   * grade. `null` / omitted means no floor.
   */
  avatarEndFloor?: { minAssistantTurns: number } | null;
  /**
   * Opt-in derived walk-out threshold on [0, 1]. When null/omitted, behavior
   * is identical to today — avatar ends only via the existing marker +
   * avatarMayEnd / avatarEndReasons / avatarEndFloor path (REQ-80). When set,
   * Phase 18's computeDisengagement value must reach this threshold
   * (accelerated by a cue in later plans) before an avatar-initiated end is
   * accepted.
   */
  disengagementThreshold?: number | null;
  /**
   * Optional per-type override of DEFAULT_DISENGAGEMENT_WEIGHTS. Omitted ->
   * the shared defaults, byte-identical to Phase 18. A type whose timeBudget
   * is null declares this so its dead budgetPressure weight is redistributed
   * deliberately rather than silently inherited (Phase 20).
   */
  disengagementWeights?: Partial<DisengagementWeights> | null;
  /**
   * Optional map from a dominant observable cause to the reason this type's
   * avatar cites when that cause ends the session. Every value MUST already
   * be a member of avatarEndReasons — the engine never invents a reason.
   * Omitted -> the existing behaviour, where the model's own marker reason
   * is used.
   */
  avatarEndReasonByCause?: Partial<Record<DisengagementCause, string>> | null;
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
  kind: OutcomeFieldKind;
  /**
   * Declarative hint for consumers. OpenAI strict `json_schema` still lists
   * every property under `required` with a nullable type (there is no optional
   * key); this flag does not change the schema wire shape.
   */
  required?: boolean;
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
  /**
   * Soft by construction. Nothing in the engine stops a turn; exceeding it
   * only changes what the tail block tells the model, which is how
   * CONTEXT.md's "visible timer, soft cutoff, avatar shows impatience and
   * may interrupt in dialogue" is implemented. There is deliberately no
   * hard cutoff anywhere.
   */
  firstTurnWindowSeconds?: number | null;
  /**
   * CONTEXT.md: session length is PROPOSED and student-adjustable. The
   * proposal is per-type logic; this field is only the clamp.
   */
  adjustableRangeSeconds?: [number, number] | null;
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
  /** When true, the step may be skipped (e.g. interview resume). The camera
   * consent gate is never optional — the wizard appends it separately. */
  optional?: boolean;
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
  /**
   * Networking character path (16-07): wizard characterId is not on
   * ResolveSessionConfigInput yet, so the live chat route threads it here.
   * Session-constant — resent identically every turn (REQ-73).
   */
  characterId?: string | null;
  /**
   * Networking brought-in path when the client has the distilled sentence but
   * has not rehydrated a full networking-persona InstanceConfig. Prefer a real
   * instance on ResolvedSessionConfig when available.
   */
  networkingPersona?: string | null;
  networkingDisplayName?: string | null;
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
  /**
   * A type that wants its artifacts judged on APPEARANCE supplies images here.
   * The engine passes them to the one evaluator as `image_url` content parts
   * with `detail: 'low'`. A type that declares nothing sends no images and its
   * call is byte-identical to today's. CONTEXT.md 14: rendered slide images
   * are an evaluator input, not only a student-facing asset.
   */
  buildEvaluationImages?: (ctx: {
    config: ResolvedSessionConfig;
  }) => Promise<EvaluatorImage[]>;
  /**
   * Optional per-turn tail fragment contributed by the type (e.g. an
   * in-character reminder). Composed into `buildTailBlock` only — never into
   * the session-constant system prompt — so the OpenAI prefix cache still
   * hits (REQ-73). Against 13-06: same delivery mechanism as the time-budget
   * and progress fragments; types declare the fragment, the engine does not
   * branch on slug.
   */
  buildTailFragment?: (config: ResolvedSessionConfig) => string;
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
  /**
   * Whether a session of this type requires a student-authored INSTANCE.
   * `true` for `case-study`; `false` for the interview presets, which run
   * off the type record alone (plus optional customization).
   *
   * `authoredInWizard: true` means the instance does not exist before the
   * wizard runs — the student creates it during setup (a pitch deck is
   * uploaded in the wizard). Such a type is reachable at `/practice/{slug}`
   * even though `required` is true, which is what distinguishes it from
   * `case-study`, whose instance is authored elsewhere and addressed by id.
   */
  instance: { required: boolean; authoredInWizard?: boolean };
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
  /**
   * A pure, type-declared adjustment applied AFTER the model's scores and
   * BEFORE persistence. It exists so CONTEXT.md's "an early end caps the
   * discovery/tailoring dimension, other dimensions unaffected" is expressible
   * without the engine knowing what an elevator pitch is. It must never
   * introduce a score where the model returned null, and must never lower a
   * dimension it was not asked to cap — plan 14-04's verification asserts both.
   */
  postProcessScores?: (
    scores: ScoreMap,
    ctx: {
      terminationReason: string | null;
      outcome: Record<string, unknown> | null;
    },
  ) => ScoreMap;
}

/**
 * A difficult-conversation INSTANCE — seeded catalog entry or student-authored
 * record resolved into the same shape. Distinct from `"case-study"`: the field
 * set differs, and `hiddenPosition` is a compiler-enforced privacy boundary
 * CaseStudy does not have.
 */
export interface DifficultConversationInstance {
  kind: "difficult-conversation";
  /** Id the instance was resolved from (seeded catalog or authored record). */
  conversationId: string;
  /**
   * Provenance only. The engine must NOT branch on it — `resolveSessionConfig`
   * and the report behave identically for `"seeded"` and `"authored"`.
   */
  source: "seeded" | "authored";
  /** Who the AVATAR is in this conversation (e.g. "Dana, your direct report"). */
  role: string;
  /** Who the STUDENT is (e.g. "their manager"). */
  studentRole: string;
  /** One-paragraph framing, shown to the student. */
  situation: string;
  /** Facts BOTH sides know. Shown in the briefing AND given to the avatar. */
  sharedBackstory: string;
  /**
   * What the character privately believes, wants, and will not volunteer:
   * their excuse, their counter-argument, their bottom line.
   *
   * Reaches the avatar's session-constant system prompt and the evaluator
   * ONLY. Never the briefing, never the report, never any client response. It
   * is deliberately absent from DifficultConversationInputSnapshot so a
   * client cannot receive it by rendering a report.
   */
  hiddenPosition: string;
  /** Explicit goal, shown in the briefing AND given to the evaluator. */
  studentObjective: string;
  /** What happens if it goes badly. Shapes avatar behavior and report framing. */
  stakes: string;
  /**
   * The only adjustable property of a seeded conversation (CONTEXT.md). It is
   * chosen in the wizard and is hidden entirely during the session — there is
   * no indicator and no meter.
   */
  difficulty: "receptive" | "guarded" | "hostile";
  /** Always set together with `voiceId`, never cross-paired (CaseAvatar precedent). */
  avatarId: string;
  /** Always set together with `avatarId`, never cross-paired (CaseAvatar precedent). */
  voiceId: string;
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
 *
 * The `"difficult-conversation"` member carries the Phase 15 seeded/authored
 * record shape; see `DifficultConversationInstance`.
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
  /**
   * `pitchSubject` is FREE TEXT typed by the student — there is no
   * category list (CONTEXT.md). `listenerKnowledge` is a student-selected
   * wizard choice at setup, NOT derived from Phase 8's difficulty
   * parameter and NOT a property of any scenario record.
   */
  | {
      kind: "pitch-elevator";
      pitchSubject: string;
      listenerKnowledge: "blind" | "name-role" | "full-profile";
    }
  /**
   * Shared by ALL FIVE deck modes (REQ-88, REQ-93): the existing investor
   * `pitch-deck`, plus Phase 19's `pitch-funding` / `pitch-product` /
   * `pitch-talk` / `pitch-general`. One `kind` for all five is deliberate —
   * a new `kind` would force edits to the chat route's `isInstanceConfig`
   * allow-list and slide-hydration branch, `session.ts`'s snapshot/ratchet
   * path and the evaluation runner's reconstruction, exactly the surfaces
   * REQ-93 forbids touching for a sixth mode.
   *
   * `askPriceUsd`/`askEquityPct`/`fairValueBand` are captured as plain
   * wizard form fields, not extracted by a model — they are session-constant
   * and safe in the system prompt from turn one (14-RESEARCH.md Open
   * Question 3). They are PRESENT ONLY for the one negotiating mode
   * (`pitch-deck`); every other mode carries NONE of the three fields at
   * all — absent, not zero, not null. A reader must never assume they
   * exist; check for presence before reading. `fairValueBand` is instance
   * config the avatar knows and the student does not; it is never
   * model-produced and never part of the outcome record.
   *
   * `slideTexts` is the per-slide extracted text; the live visible-context
   * cursor decides how much of it the avatar sees on a given turn, and that
   * cursor is server-authoritative (plan 14-11).
   *
   * `modeInputs` is the one extension point for per-mode wizard data (the
   * funding amount/use-of-funds, the buyer profile, the talk audience and
   * takeaway). A sixth deck mode adds a `DeckModeInputs` member under
   * `lib/pitch/deck-modes.ts` and never needs a new field here.
   */
  | {
      kind: "pitch-deck";
      deckId: string;
      slideCount: number;
      slideTexts: string[];
      askPriceUsd?: number;
      askEquityPct?: number;
      fairValueBand?: {
        priceUsdMin: number;
        priceUsdMax: number;
        equityPctMin: number;
        equityPctMax: number;
      };
      proposedSeconds: number;
      modeInputs?: DeckModeInputs;
    }
  | DifficultConversationInstance
  /**
   * This describes a REAL PERSON. It is owner-scoped and **NEVER publishable**.
   * 16-CONTEXT.md decision 7: "the publish affordance must be absent, not merely
   * off." There is deliberately no `published`, no `visibility` and no
   * `sharedWith` field here, and there is deliberately no
   * `/api/networking/persona/publish` route anywhere in the repo. Do NOT add
   * parity with `CaseStudy` (`app/api/scenario/publish/route.ts`) — the absence
   * is the enforcement. A defaulted-false flag is a latent bug; an absent field
   * cannot be flipped.
   *
   * `persona` is the DISTILLED sentence, never the raw pasted text. The raw
   * paste is never stored anywhere (16-CONTEXT.md decision 6; the contract at
   * `app/api/interview/persona/distill/route.ts:64-70`). `source` records which
   * input mode produced it without recording the input.
   *
   * `attestationId`/`attestedAt`/`attestedWordingVersion` are a RECEIPT of the
   * gate that already ran, not the gate itself. The gate is `consumeAttestation`
   * in `lib/networking/attestation.ts`, called before distillation (plan 16-05).
   * Do not reason about the attestation from this record alone.
   *
   * `ownerId` is enforced on read by the same idiom `loadOwnedScenario` uses at
   * `lib/scenario/validation.ts:252` — a non-owner gets not-found, not forbidden.
   */
  | {
      kind: "networking-persona";
      personaId: string;
      ownerId: string;
      displayName: string;
      /** The <=600-char distilled sentence. See MAX_PERSONA_LENGTH. */
      persona: string;
      /** Which of the three sources produced the text that was distilled. */
      source: "pasted" | "written" | "generated";
      /** The NetworkingAttestation row spent to create this persona, and its wording version. */
      attestationId: string;
      attestedAt: string;
      attestedWordingVersion: string;
      createdAt: string;
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
