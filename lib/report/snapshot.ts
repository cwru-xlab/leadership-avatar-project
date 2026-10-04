/**
 * Phase 13 unified report contract — the TypeScript shapes enforced on
 * `InteractionReport`'s two JSON columns (`inputSnapshot`, `scores`).
 *
 * These shapes are LOCKED by `13-CONTEXT.md`'s "Report storage" decisions —
 * they are transcribed here from the existing `InterviewReport` /
 * `ScenarioReport` snapshot columns, not redesigned. A new interaction type
 * (Phases 14-16) adds a member to `InputSnapshot` and NOTHING to the schema:
 * that is the entire point of storing this as JSON rather than as typed
 * columns.
 */

/**
 * The interview type's input snapshot — the union of every typed
 * customization column `InterviewReport` carries today
 * (`resumeId`/`resumeText`/`industry`/`roleTitle`/`difficulty`/
 * `targetMinutes`/`targetQuestionCount`/`interviewerPersona`), plus the
 * interviewer identity fields, folded into one JSON shape under `kind:
 * "interview"`.
 */
export interface InterviewInputSnapshot {
  kind: "interview";
  interviewerAvatarId: string | null;
  interviewerName: string | null;
  resumeId: string | null;
  resumeText: string | null;
  industry: string | null;
  roleTitle: string | null;
  difficulty: string | null;
  targetMinutes: number | null;
  targetQuestionCount: number | null;
  interviewerPersona: string | null;
}

/**
 * The scenario type's input snapshot — the union of `ScenarioReport`'s
 * today's `caseName`/`backgroundSnapshot`/`avatarsSnapshot`/
 * `criteriaSnapshot` columns, folded into one JSON shape under `kind:
 * "scenario"`.
 *
 * `caseId` is a bare string here, by design — it is NOT a foreign key.
 * `ScenarioReport.caseId` lives alongside it as its own top-level column
 * (not inside this snapshot) for the same reason it was never an FK on
 * `ScenarioReport`: a report must survive deletion of the S3 scenario it
 * came from (REQ-34; see HANDOFF.md §3). This `caseId` field is a
 * redundant run-time snapshot of that same bare string, not a new
 * relation.
 */
export interface ScenarioInputSnapshot {
  kind: "scenario";
  caseId: string;
  caseName: string;
  background: string;
  avatars: unknown[];
  criteria: string | null;
}

/**
 * 13-CONTEXT.md anticipated this member verbatim (`{kind:'pitch', deck,
 * ask}`); REQ-65's design intent is that a new input shape needs no
 * migration. Every field here is SESSION-CONSTANT, captured at start and
 * never re-fetched — the mutable slide cursor lives in its own column
 * (plan 14-05), not in here.
 */
export interface PitchInputSnapshot {
  kind: "pitch";
  pitchKind: "elevator" | "deck";
  pitchSubject: string | null;
  listenerKnowledge: "blind" | "name-role" | "full-profile" | null;
  deckId: string | null;
  slideCount: number | null;
  askPriceUsd: number | null;
  askEquityPct: number | null;
  fairValueBand: {
    priceUsdMin: number;
    priceUsdMax: number;
    equityPctMin: number;
    equityPctMax: number;
  } | null;
  firstTurnWindowSeconds: number | null;
  budgetSeconds: number | null;
  listenerPersona: string | null;
}

/**
 * The difficult-conversation type's input snapshot.
 *
 * Field-for-field with DifficultConversationInstance minus hiddenPosition.
 * The omission is the privacy boundary and is asserted in
 * scripts/verify-dc-engine-extensions.ts.
 *
 * Also omits `voiceId` (not needed for report rendering) and adds
 * `conversationTitle` for report headings. Termination reason codes are NOT
 * duplicated here — they already live as engine columns.
 */
export interface DifficultConversationInputSnapshot {
  kind: "difficult-conversation";
  conversationId: string;
  conversationTitle: string;
  source: "seeded" | "authored";
  role: string;
  studentRole: string;
  situation: string;
  sharedBackstory: string;
  // hiddenPosition deliberately omitted — privacy boundary; see interface doc.
  studentObjective: string;
  stakes: string;
  difficulty: "receptive" | "guarded" | "hostile";
  avatarId: string;
}

/**
 * The networking type's input snapshot.
 *
 * REQ-65's design intent is that a new input shape needs no migration — this
 * rides the existing `InteractionReport.inputSnapshot` JSON column.
 *
 * Every field here is SESSION-CONSTANT, captured at session start and never
 * re-fetched.
 *
 * `goal` is recorded here because the EVALUATOR and the REPORT need it — the
 * Goal Progress dimension is unscoreable without it (16-CONTEXT.md: the goal
 * is required to start, so Goal Progress always scores). It is **never**
 * admitted to the avatar's visible context on any turn; that exclusion is
 * declared on the `networking` type's `visibleContext` (plan 16-07) and tested
 * in plan 16-09. Nothing may read `goal` from this snapshot to build a live
 * prompt.
 *
 * The raw pasted text is NOT here and must never be. Only the distilled
 * persona's id and display name are recorded (16-CONTEXT.md decision 6).
 *
 * Mirror of the `networking-persona` `InstanceConfig` member's field names, so
 * the two cannot drift.
 */
export interface NetworkingInputSnapshot {
  kind: "networking";
  /** "character" for a built-in record, "brought-in" for a distilled real person. */
  personaSource: "character" | "brought-in";
  /** The built-in character's id, or null for a brought-in person. */
  characterId: string | null;
  /** The brought-in persona instance's id, or null for a built-in character. */
  personaId: string | null;
  displayName: string | null;
  /** The student's goal text. EVALUATOR-ONLY — see the interface doc. */
  goal: string;
  interviewerAvatarId: string | null;
  interviewerVoice: string | null;
  budgetSeconds: number | null;
}

/**
 * The closed union of input snapshot shapes. A new interaction type
 * (Phase 14's pitch, Phase 15's difficult conversation, Phase 16's
 * networking persona) adds a new member here and NO columns anywhere —
 * that is the mechanism REQ-65 exists to provide.
 */
export type InputSnapshot =
  | InterviewInputSnapshot
  | ScenarioInputSnapshot
  | PitchInputSnapshot
  | DifficultConversationInputSnapshot
  | NetworkingInputSnapshot;

/**
 * The dimension-keyed score map replacing the four fixed score columns
 * (`visualScore`/`vocalScore`/`contentScore`/`behavioralScore`) both legacy
 * tables carry today. The four shared keys (`visual`, `vocal`, `content`,
 * `behavioral`) are always present once a report reaches READY; a type may
 * declare additional keys (`deck_quality`, `negotiation`, `rapport`, …) and
 * those are type-declared extras, never enforced by this map's own shape.
 * A new rubric dimension needs no migration.
 */
export type ScoreMap = Record<string, number | null>;

const INTERVIEW_INPUT_KEYS: readonly (keyof InterviewInputSnapshot)[] = [
  "kind",
  "interviewerAvatarId",
  "interviewerName",
  "resumeId",
  "resumeText",
  "industry",
  "roleTitle",
  "difficulty",
  "targetMinutes",
  "targetQuestionCount",
  "interviewerPersona",
];

const SCENARIO_INPUT_KEYS: readonly (keyof ScenarioInputSnapshot)[] = [
  "kind",
  "caseId",
  "caseName",
  "background",
  "avatars",
  "criteria",
];

const PITCH_KINDS = ["elevator", "deck"] as const;
const LISTENER_KNOWLEDGE = ["blind", "name-role", "full-profile"] as const;

const PITCH_INPUT_KEYS: readonly (keyof PitchInputSnapshot)[] = [
  "kind",
  "pitchKind",
  "pitchSubject",
  "listenerKnowledge",
  "deckId",
  "slideCount",
  "askPriceUsd",
  "askEquityPct",
  "fairValueBand",
  "firstTurnWindowSeconds",
  "budgetSeconds",
  "listenerPersona",
];

const DC_DIFFICULTY_BANDS = ["receptive", "guarded", "hostile"] as const;
const DC_SOURCES = ["seeded", "authored"] as const;

const DIFFICULT_CONVERSATION_INPUT_KEYS: readonly (keyof DifficultConversationInputSnapshot)[] =
  [
    "kind",
    "conversationId",
    "conversationTitle",
    "source",
    "role",
    "studentRole",
    "situation",
    "sharedBackstory",
    "studentObjective",
    "stakes",
    "difficulty",
    "avatarId",
  ];

const NETWORKING_PERSONA_SOURCES = ["character", "brought-in"] as const;

const NETWORKING_INPUT_KEYS: readonly (keyof NetworkingInputSnapshot)[] = [
  "kind",
  "personaSource",
  "characterId",
  "personaId",
  "displayName",
  "goal",
  "interviewerAvatarId",
  "interviewerVoice",
  "budgetSeconds",
];

function hasAllKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => key in value);
}

function isNetworkingPersonaSource(
  value: unknown,
): value is NetworkingInputSnapshot["personaSource"] {
  return (
    typeof value === "string" &&
    (NETWORKING_PERSONA_SOURCES as readonly string[]).includes(value)
  );
}

function isPitchKind(value: unknown): value is PitchInputSnapshot["pitchKind"] {
  return (
    typeof value === "string" &&
    (PITCH_KINDS as readonly string[]).includes(value)
  );
}

function isListenerKnowledge(
  value: unknown,
): value is NonNullable<PitchInputSnapshot["listenerKnowledge"]> {
  return (
    typeof value === "string" &&
    (LISTENER_KNOWLEDGE as readonly string[]).includes(value)
  );
}

function isDcDifficulty(
  value: unknown,
): value is DifficultConversationInputSnapshot["difficulty"] {
  return (
    typeof value === "string" &&
    (DC_DIFFICULTY_BANDS as readonly string[]).includes(value)
  );
}

function isDcSource(
  value: unknown,
): value is DifficultConversationInputSnapshot["source"] {
  return (
    typeof value === "string" &&
    (DC_SOURCES as readonly string[]).includes(value)
  );
}

/**
 * Defensively narrows an unknown JSON value into a typed `InputSnapshot`,
 * discriminating on `kind`. Follows the precedent `lib/interview/report-dto.ts`
 * and `lib/scenario/report-dto.ts` already establish for their JSON columns:
 * an unrecognized or garbage value degrades to `null` through a small local
 * narrowing helper, NOT a bare cast, so a legacy or corrupt row renders as
 * "not measured" rather than crashing the page.
 */
export function asInputSnapshot(value: unknown): InputSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  if (v.kind === "interview" && hasAllKeys(v, INTERVIEW_INPUT_KEYS)) {
    return value as InterviewInputSnapshot;
  }
  if (
    v.kind === "scenario" &&
    hasAllKeys(v, SCENARIO_INPUT_KEYS) &&
    typeof v.caseId === "string" &&
    typeof v.caseName === "string" &&
    typeof v.background === "string" &&
    Array.isArray(v.avatars)
  ) {
    return value as ScenarioInputSnapshot;
  }
  if (
    v.kind === "pitch" &&
    hasAllKeys(v, PITCH_INPUT_KEYS) &&
    isPitchKind(v.pitchKind)
  ) {
    // Discriminant `pitchKind` is required; other fields may be null per
    // the PitchInputSnapshot shape (elevator vs deck populate different
    // subsets). Reject an incomplete bare `{ kind: "pitch" }` via hasAllKeys.
    if (
      v.listenerKnowledge !== null &&
      !isListenerKnowledge(v.listenerKnowledge)
    ) {
      return null;
    }

    return value as PitchInputSnapshot;
  }
  if (
    v.kind === "difficult-conversation" &&
    hasAllKeys(v, DIFFICULT_CONVERSATION_INPUT_KEYS) &&
    typeof v.conversationId === "string" &&
    typeof v.conversationTitle === "string" &&
    isDcSource(v.source) &&
    typeof v.role === "string" &&
    typeof v.studentRole === "string" &&
    typeof v.situation === "string" &&
    typeof v.sharedBackstory === "string" &&
    typeof v.studentObjective === "string" &&
    typeof v.stakes === "string" &&
    isDcDifficulty(v.difficulty) &&
    typeof v.avatarId === "string"
  ) {
    return value as DifficultConversationInputSnapshot;
  }
  if (
    v.kind === "networking" &&
    hasAllKeys(v, NETWORKING_INPUT_KEYS) &&
    isNetworkingPersonaSource(v.personaSource) &&
    typeof v.goal === "string" &&
    (v.characterId === null || typeof v.characterId === "string") &&
    (v.personaId === null || typeof v.personaId === "string") &&
    (v.displayName === null || typeof v.displayName === "string") &&
    (v.interviewerAvatarId === null ||
      typeof v.interviewerAvatarId === "string") &&
    (v.interviewerVoice === null || typeof v.interviewerVoice === "string") &&
    (v.budgetSeconds === null || typeof v.budgetSeconds === "number")
  ) {
    return value as NetworkingInputSnapshot;
  }

  return null;
}

/**
 * Defensively narrows an unknown JSON value into a typed `ScoreMap`: a
 * plain object whose values are each `number | null`. Anything else
 * (including a string, an array, or an object with a non-numeric,
 * non-null value) degrades to `null`.
 */
export function asScoreMap(value: unknown): ScoreMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);

  for (const [, v] of entries) {
    if (v !== null && typeof v !== "number") return null;
  }

  return value as ScoreMap;
}
