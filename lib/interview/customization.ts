/**
 * The single validating resolver that every server call site uses in place of
 * the raw `getInterviewType`.
 *
 * REQ-23 requires the assembled system prompt to stay session-constant while
 * the student tunes it. The answer is a pure, deterministic resolver — the
 * client resends an identical customization payload each turn (exactly as
 * `resumeText` already travels), and the server re-derives the same
 * `InterviewType` object every time, validating every field against fixed
 * lists so no unsanitized student input reaches the prompt.
 *
 * This module does no I/O and must stay pure: the same `(slug, customization)`
 * pair must always produce a deeply equal `InterviewType`, which is exactly
 * what keeps the OpenAI prefix cache hitting turn to turn.
 */

import { getInterviewType } from "./types";
import type { InterviewType, InterviewDifficulty } from "./types";
import {
  CURATED_INDUSTRIES,
  CURATED_ROLES,
  SESSION_LENGTH_PRESETS,
  PERSONALITY_DIALS,
  INTERVIEW_DIFFICULTIES,
} from "./customization-options";

export const MAX_PERSONA_LENGTH = 600;

export interface InterviewCustomizationInput {
  industrySlug?: string;
  roleSlug?: string;
  difficulty?: string;
  lengthSlug?: string;
  personalitySlug?: string;
  /** Pre-distilled persona text ONLY — never the student's raw pasted profile. */
  distilledPersona?: string;
  /**
   * Display-only name of the person the persona plays, from the distiller.
   * Never interpolated into the prompt — the persona string already names them.
   * Used so the session header does not contradict the persona by showing the
   * avatar's name instead (REQ-22: the interviewer plays the named person).
   */
  personaDisplayName?: string;
}

/**
 * Resolves the interviewer persona for a customized session.
 *
 * If a distilled persona was pasted in, it REPLACES the preset persona
 * entirely and the personality dial is ignored — per 08-CONTEXT.md the
 * pasted-profile persona plays the named person directly, and splicing a
 * generic "pressure-testing" clause onto a named real person is incoherent.
 * Otherwise the personality dial's clause composes onto the preset's own
 * persona sentence (never replacing it).
 */
export function composePersona(
  base: InterviewType,
  input: InterviewCustomizationInput
): string {
  if (input.distilledPersona && input.distilledPersona.trim()) {
    return input.distilledPersona.trim().slice(0, MAX_PERSONA_LENGTH);
  }

  const dial = PERSONALITY_DIALS.find((d) => d.slug === input.personalitySlug);
  if (!dial || !dial.clause) {
    return base.interviewerPersona;
  }
  return `${base.interviewerPersona}, ${dial.clause}`;
}

/**
 * Resolves an `InterviewType` slug plus an optional customization payload
 * into a complete `InterviewType` object.
 *
 * With no customization, returns the raw registry lookup unchanged. With a
 * customization payload, returns a NEW object with every field validated
 * against a fixed list — an unknown, empty, or malicious value silently falls
 * back to the base preset's value rather than throwing (REQ-20: a blank or
 * cleared field falls back to the preset's default).
 */
export function resolveInterviewType(
  slug: string | undefined | null,
  customization?: InterviewCustomizationInput | null
): InterviewType | null {
  const base = getInterviewType(slug);
  if (!base) return null;
  if (!customization) return base;

  const industryMatch = CURATED_INDUSTRIES.find((o) => o.slug === customization.industrySlug);
  const roleMatch = CURATED_ROLES.find((o) => o.slug === customization.roleSlug);
  const difficulty: InterviewDifficulty = INTERVIEW_DIFFICULTIES.includes(
    customization.difficulty as InterviewDifficulty
  )
    ? (customization.difficulty as InterviewDifficulty)
    : base.difficulty;
  const lengthMatch = SESSION_LENGTH_PRESETS.find((p) => p.slug === customization.lengthSlug);

  return {
    ...base,
    defaultIndustry: industryMatch ? industryMatch.promptValue : base.defaultIndustry,
    defaultRoleTitle: roleMatch ? roleMatch.promptValue : base.defaultRoleTitle,
    difficulty,
    targetMinutes: lengthMatch ? lengthMatch.targetMinutes : base.targetMinutes,
    targetQuestionCount: lengthMatch ? lengthMatch.targetQuestionCount : base.targetQuestionCount,
    interviewerPersona: composePersona(base, customization),
  };
}

/**
 * The six values that `session/start` persists on the report row, read
 * straight off the already-resolved `InterviewType`. Does NOT re-derive from
 * raw input — the resolved object is the single source of truth.
 */
export function resolveCustomizationRecord(resolved: InterviewType) {
  return {
    industry: resolved.defaultIndustry,
    roleTitle: resolved.defaultRoleTitle,
    difficulty: resolved.difficulty,
    targetMinutes: resolved.targetMinutes,
    targetQuestionCount: resolved.targetQuestionCount,
    interviewerPersona: resolved.interviewerPersona,
  };
}
