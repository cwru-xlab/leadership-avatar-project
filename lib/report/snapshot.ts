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
 * The closed union of input snapshot shapes. A new interaction type
 * (Phase 14's pitch, Phase 15's difficult conversation, Phase 16's
 * networking persona) adds a new member here and NO columns anywhere —
 * that is the mechanism REQ-65 exists to provide.
 */
export type InputSnapshot = InterviewInputSnapshot | ScenarioInputSnapshot;

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

function hasAllKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value);
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
