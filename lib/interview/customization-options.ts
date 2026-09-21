/**
 * Curated customization option lists for the interview picker.
 *
 * These are CLOSED SETS validated server-side by `./customization.ts` — they are
 * not merely UI hints. Student input is checked for membership against these
 * exact arrays; nothing here is user-extensible, and no value outside these
 * lists ever reaches the assembled system prompt.
 */

import type { InterviewDifficulty } from "./types";

/**
 * Shared shape for a curated dropdown option.
 *
 * `label` is what the dropdown shows to the student. `promptValue` is the
 * exact phrase interpolated into the system prompt — kept separate so the
 * prompt never receives a UI label (e.g. "Tech") where it expects a natural
 * phrase (e.g. "technology").
 */
export interface CuratedOption {
  slug: string;
  label: string;
  promptValue: string;
}

/**
 * Curated industries. The first entry's `promptValue` is byte-identical to
 * `GENERAL_INTERVIEW.defaultIndustry` in `./types.ts`, so resolving the
 * `general` slug round-trips to today's shipped value exactly.
 */
export const CURATED_INDUSTRIES: CuratedOption[] = [
  { slug: "general", label: "General / cross-industry", promptValue: "general / cross-industry" },
  { slug: "technology", label: "Technology", promptValue: "technology" },
  { slug: "consulting", label: "Consulting", promptValue: "management consulting" },
  { slug: "finance", label: "Finance", promptValue: "finance" },
  { slug: "healthcare", label: "Healthcare", promptValue: "healthcare" },
  { slug: "nonprofit-public-sector", label: "Nonprofit / Public sector", promptValue: "nonprofit or public sector" },
  { slug: "marketing-communications", label: "Marketing / Communications", promptValue: "marketing and communications" },
  { slug: "retail-consumer", label: "Retail / Consumer", promptValue: "retail and consumer goods" },
  { slug: "manufacturing-operations", label: "Manufacturing / Operations", promptValue: "manufacturing and operations" },
  { slug: "education", label: "Education", promptValue: "education" },
];

/**
 * Curated roles. Deliberately a FLAT list, not cascading off industry — a
 * "team lead" role reads naturally across any industry above. `promptValue`
 * is written to read naturally after "Target role: ".
 */
export const CURATED_ROLES: CuratedOption[] = [
  { slug: "early-career", label: "Early-career / entry-level", promptValue: "an early-career, entry-level role" },
  { slug: "individual-contributor", label: "Individual contributor", promptValue: "an individual contributor role" },
  { slug: "team-lead", label: "Team lead / people manager", promptValue: "a team lead or people-manager role" },
  { slug: "senior-staff", label: "Senior / staff-level", promptValue: "a senior or staff-level role" },
  { slug: "consulting-advisory", label: "Consulting / advisory", promptValue: "a consulting or advisory role" },
  { slug: "technical-engineering", label: "Technical / engineering", promptValue: "a technical or engineering role" },
  { slug: "sales-client-facing", label: "Sales / client-facing", promptValue: "a sales or client-facing role" },
  { slug: "product-program-management", label: "Product / program management", promptValue: "a product or program management role" },
];

/**
 * Session length presets. Length is an enum, never a free number — both
 * `buildProgressBlock` and the client progress tracker key off these exact
 * (minutes, questionCount) pairs, and mixing a preset's minutes with a
 * different preset's question count would produce an incoherent target.
 *
 * `standard` intentionally matches `GENERAL_INTERVIEW`'s existing values
 * exactly (20 minutes / 9 questions) so resolving `general` with no length
 * override, or an explicit `standard` override, is indistinguishable.
 */
export interface SessionLengthPreset {
  slug: string;
  label: string;
  targetMinutes: number;
  targetQuestionCount: number;
}

export const SESSION_LENGTH_PRESETS: SessionLengthPreset[] = [
  { slug: "quick", label: "Quick (~10 min)", targetMinutes: 10, targetQuestionCount: 5 },
  { slug: "standard", label: "Standard (~20 min)", targetMinutes: 20, targetQuestionCount: 9 },
  { slug: "extended", label: "Extended (~30 min)", targetMinutes: 30, targetQuestionCount: 13 },
];

export const DEFAULT_SESSION_LENGTH_SLUG = "standard";

/**
 * Interviewer personality dials. `clause` is a short sentence fragment that
 * composes onto a preset's `interviewerPersona` string (never replaces it).
 * `neutral`'s clause is the empty string — it is the no-op default closest to
 * how the presets already read.
 */
export interface PersonalityDial {
  slug: string;
  label: string;
  clause: string;
}

export const PERSONALITY_DIALS: PersonalityDial[] = [
  {
    slug: "warm",
    label: "Warm & encouraging",
    clause: "and you keep your tone warm and encouraging throughout, giving the candidate room to think",
  },
  {
    slug: "neutral",
    label: "Neutral & professional",
    clause: "",
  },
  {
    slug: "pressure",
    label: "Pressure-testing",
    clause: "and you press hard for specifics, following up more than once when an answer stays vague",
  },
];

export const DEFAULT_PERSONALITY_SLUG = "neutral";

/**
 * Difficulty keeps its existing meaning and type — this list is exported only
 * so the resolver can validate membership without redefining the union.
 */
export const INTERVIEW_DIFFICULTIES: readonly InterviewDifficulty[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];
