/**
 * Interview types — the parameterization seam for the baseline interview page.
 *
 * One baseline page serves every interview variant; the variant is selected by
 * slug over HTTP (`/interview/[type]`, and `interviewType` in the chat body).
 * Adding a variant means adding a record here, not forking the page.
 *
 * Every field is constant for the duration of a session, which is what lets the
 * assembled system prompt sit inside the OpenAI prefix cache. Anything that
 * varies per turn (elapsed time, questions asked so far) belongs in the tail
 * block instead — see `buildProgressBlock` in ./prompts.
 *
 * Lookup goes through `getInterviewType()` so that moving this catalog into S3
 * or Postgres later touches exactly one function.
 */

import {
  FINANCE_INTERVIEW_SLUG,
  FINANCE_INTERVIEWER_PERSONA,
  FINANCE_PRESET_DESCRIPTION,
  FINANCE_PRESET_LABEL,
  FINANCE_QUESTION_AREAS,
  FINANCE_TARGET_MINUTES,
} from "../finance-interview/live";
import {
  PROBLEM_FIXTURE_BASE,
  PROBLEM_FIXTURE_ENABLED,
} from "@/lib/problem-interview/fixtures/type";
import {
  CASE_BACKGROUND,
  CASE_DESCRIPTION,
  CASE_INTERVIEWER_PERSONA,
  CASE_QUESTION_AREAS,
  CASE_TARGET_MINUTES,
} from "../case-interview/live";
import {
  PM_INTERVIEW_SLUG,
  PM_INTERVIEWER_PERSONA,
  PM_PRESET_DESCRIPTION,
  PM_PRESET_LABEL,
  PM_QUESTION_AREAS,
} from "../pm-interview/prompts";
import {
  ANALYTICS_BACKGROUND,
  ANALYTICS_INTERVIEWER_PERSONA,
  ANALYTICS_INTERVIEW_SLUG,
  ANALYTICS_PRESET_DESCRIPTION,
  ANALYTICS_PRESET_LABEL,
  ANALYTICS_QUESTION_AREAS,
  ANALYTICS_TARGET_MINUTES,
} from "@/lib/analytics-interview/live";

import {
  SD_INTERVIEW_SLUG,
  SD_INTERVIEWER_PERSONA,
  SD_PRESET_DESCRIPTION,
  SD_PRESET_LABEL,
  SD_QUESTION_AREAS,
  SD_TARGET_MINUTES,
} from "../system-design-interview/live";

export type InterviewDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface InterviewType {
  /** URL segment and HTTP parameter value. Stable — it is persisted on reports. */
  slug: string;
  /** Shown in the launcher. */
  label: string;
  /** One-line description for the launcher card. */
  description: string;
  /** {INTERVIEWER_PERSONA} — who the avatar is playing. */
  interviewerPersona: string;
  /** {ROLE_TITLE} — the job being interviewed for. */
  defaultRoleTitle: string;
  /** {INDUSTRY} */
  defaultIndustry: string;
  /** {DIFFICULTY} — drives follow-up depth, not question count. */
  difficulty: InterviewDifficulty;
  /** {TARGET_MINUTES} — a target stated to the model, not a hard cutoff. */
  targetMinutes: number;
  /** {TARGET_QUESTION_COUNT} */
  targetQuestionCount: number;
  /** {CASE_BACKGROUND} — omitted for interviews with no scenario attached. */
  caseBackground?: string;
  /** Picker-card display only — never interpolated into the prompt. */
  questionAreas?: string[];
  /**
   * `false` folds the preset out of the picker without retiring it: its slug
   * still resolves, so old reports, "Practice again" and study-plan links keep
   * working. Omitted means listed.
   */
  listed?: boolean;
}

/**
 * The general interview. Deliberately not role-specific: the persona is a
 * competent generalist interviewer so the prompt's resume-grounded and
 * behavioral stages carry the session. Specialized variants (coding, VC pitch,
 * consulting case) get their own records and override the persona and role.
 */
const GENERAL_INTERVIEW: InterviewType = {
  slug: "general",
  label: "General Interview",
  description:
    "A structured behavioral interview grounded in your resume. Covers your background, " +
    "how you work with others, and how you handle setbacks.",
  interviewerPersona:
    "a warm but rigorous hiring manager with fifteen years of experience across several " +
    "industries. You are genuinely curious about people and you listen closely, but you " +
    "do not accept a vague answer — you press politely for specifics until you understand " +
    "what the candidate actually did",
  defaultRoleTitle: "an early-career professional role",
  defaultIndustry: "general / cross-industry",
  difficulty: "Intermediate",
  targetMinutes: 20,
  targetQuestionCount: 9,
  questionAreas: ["Your background", "Behavioral stories", "Working with others"],
};

/**
 * Technical / engineering interview. Persona probes reasoning and tradeoffs
 * rather than quizzing on trivia; the role-specific stage stays a short,
 * generic prompt to walk through a past decision (full case scenarios are
 * Phase 9's job, not this preset's).
 */
const TECHNICAL_INTERVIEW: InterviewType = {
  slug: "technical",
  label: "Engineering Behavioral Interview",
  description:
    "Behavioral questions for engineering roles: how you reason through technical " +
    "tradeoffs. No live coding.",
  interviewerPersona:
    "a pragmatic senior engineering manager who cares more about how the candidate " +
    "thinks through tradeoffs than about quizzing them on trivia. You ask \"why that " +
    "way\" after every design claim, pushing gently for the reasoning behind decisions " +
    "rather than just the outcome",
  defaultRoleTitle: "a software engineering role",
  defaultIndustry: "technology",
  difficulty: "Intermediate",
  targetMinutes: 20,
  targetQuestionCount: 9,
  caseBackground:
    "For the role-specific stage, ask the candidate to walk through a technical " +
    "decision they owned and defend the tradeoffs they made.",
  questionAreas: ["Your background", "Behavioral stories", "Technical judgment & tradeoffs"],
};

/**
 * Consulting case interview. Upgraded in place (2026-11-06): the slug stays
 * "consulting" so reports from the earlier behavioral-style preset still
 * resolve and render. The session is a real case interview (fit → one case →
 * close); content, persona and copy live in `lib/case-interview/`.
 * `targetQuestionCount` is 1: one problem (the problem-interview factory
 * sets the same limit).
 */
const CONSULTING_INTERVIEW: InterviewType = {
  slug: "consulting",
  label: "Consulting / Case-Style Interview",
  description: CASE_DESCRIPTION,
  interviewerPersona: CASE_INTERVIEWER_PERSONA,
  defaultRoleTitle: "a management consulting associate role",
  defaultIndustry: "management consulting",
  difficulty: "Advanced",
  targetMinutes: CASE_TARGET_MINUTES,
  targetQuestionCount: 1,
  caseBackground: CASE_BACKGROUND,
  questionAreas: [...CASE_QUESTION_AREAS],
};

/**
 * Early-career / internship interview. Persona is deliberately warm and does
 * not pressure-test — matches the shorter, lower-stakes shape of a real
 * internship screen.
 */
const EARLY_CAREER_INTERVIEW: InterviewType = {
  slug: "early-career",
  label: "Early-Career / Internship Interview",
  description:
    "A shorter, lower-pressure behavioral interview styled after an internship or " +
    "entry-level screening call.",
  interviewerPersona:
    "a warm, encouraging early-career recruiter who gives the candidate plenty of " +
    "room to think and does not pressure-test their answers. You ask clear, " +
    "supportive follow-ups and are genuinely rooting for the candidate to do well",
  defaultRoleTitle: "an internship or entry-level rotational role",
  defaultIndustry: "general / cross-industry",
  difficulty: "Beginner",
  targetMinutes: 10,
  targetQuestionCount: 5,
  questionAreas: ["Your background", "Behavioral stories", "Motivation & fit"],
  // Folded away from the picker 2026-11-06; the general interview at Beginner
  // difficulty and Quick length covers the same ground.
  listed: false,
};

/**
 * Product-management interview. A problem-solving preset, not a behavioral
 * one: a short fit question, then ONE deliberately abstract product problem
 * (design, improvement, metrics, estimation or strategy) graded step by step
 * against a named method such as CIRCLES. Copy and content live in
 * `lib/pm-interview/`; the engine record is built in
 * `lib/pm-interview/type.ts`. `targetQuestionCount` counts the fit question
 * and the problem.
 */
const PRODUCT_MANAGEMENT_INTERVIEW: InterviewType = {
  slug: PM_INTERVIEW_SLUG,
  label: PM_PRESET_LABEL,
  description: PM_PRESET_DESCRIPTION,
  interviewerPersona: PM_INTERVIEWER_PERSONA,
  defaultRoleTitle: "a product manager role",
  defaultIndustry: "technology",
  difficulty: "Advanced",
  targetMinutes: 30,
  targetQuestionCount: 2,
  questionAreas: PM_QUESTION_AREAS,
};

/**
 * Data / product-analytics interview. A problem interview (fit question, then
 * ONE analytics problem — metric definition, experiment design or readout,
 * metric diagnosis — graded step by step); the engine record is built by
 * `makeProblemInterviewTypeConfig` in `lib/engine/registry.ts`. Copy lives in
 * `lib/analytics-interview/live.ts`. `targetQuestionCount` is 1: one problem.
 */
const DATA_ANALYTICS_INTERVIEW: InterviewType = {
  slug: ANALYTICS_INTERVIEW_SLUG,
  label: ANALYTICS_PRESET_LABEL,
  description: ANALYTICS_PRESET_DESCRIPTION,
  interviewerPersona: ANALYTICS_INTERVIEWER_PERSONA,
  defaultRoleTitle: "a data scientist (product analytics) role",
  defaultIndustry: "consumer technology",
  difficulty: "Advanced",
  targetMinutes: ANALYTICS_TARGET_MINUTES,
  targetQuestionCount: 1,
  caseBackground: ANALYTICS_BACKGROUND,
  questionAreas: [...ANALYTICS_QUESTION_AREAS],
};

/**
 * Finance interview (investment banking / private equity / equity research).
 * A problem-solving preset: a short fit question, then ONE technical
 * walk-through, paper LBO, stock pitch or market / deal discussion, graded
 * step by step with numbers checked against a tolerance band. Copy and
 * content live in `lib/finance-interview/`; the engine record is built by
 * `makeProblemInterviewTypeConfig` in `lib/engine/registry.ts`.
 * `targetQuestionCount` is 1: one problem.
 */
const FINANCE_INTERVIEW: InterviewType = {
  slug: FINANCE_INTERVIEW_SLUG,
  label: FINANCE_PRESET_LABEL,
  description: FINANCE_PRESET_DESCRIPTION,
  interviewerPersona: FINANCE_INTERVIEWER_PERSONA,
  defaultRoleTitle: "an investment banking analyst role",
  defaultIndustry: "finance",
  difficulty: "Advanced",
  targetMinutes: FINANCE_TARGET_MINUTES,
  targetQuestionCount: 1,
  questionAreas: [...FINANCE_QUESTION_AREAS],
};

/**
 * System-design interview. A problem-solving preset (verbal, no whiteboard):
 * a short fit question, then ONE design, feature or incident problem graded
 * step by step. Content lives in `lib/system-design-interview/`; the engine
 * record is built from `lib/system-design-interview/registration.ts`.
 * `targetQuestionCount` counts the fit question and the problem.
 */
const SYSTEM_DESIGN_INTERVIEW: InterviewType = {
  slug: SD_INTERVIEW_SLUG,
  label: SD_PRESET_LABEL,
  description: SD_PRESET_DESCRIPTION,
  interviewerPersona: SD_INTERVIEWER_PERSONA,
  defaultRoleTitle: "a software engineering role",
  defaultIndustry: "technology",
  difficulty: "Intermediate",
  targetMinutes: SD_TARGET_MINUTES,
  targetQuestionCount: 2,
  questionAreas: SD_QUESTION_AREAS,
};

export const INTERVIEW_TYPES: Record<string, InterviewType> = {
  [GENERAL_INTERVIEW.slug]: GENERAL_INTERVIEW,
  [TECHNICAL_INTERVIEW.slug]: TECHNICAL_INTERVIEW,
  [CONSULTING_INTERVIEW.slug]: CONSULTING_INTERVIEW,
  [EARLY_CAREER_INTERVIEW.slug]: EARLY_CAREER_INTERVIEW,
  [PRODUCT_MANAGEMENT_INTERVIEW.slug]: PRODUCT_MANAGEMENT_INTERVIEW,
  [DATA_ANALYTICS_INTERVIEW.slug]: DATA_ANALYTICS_INTERVIEW,
  [FINANCE_INTERVIEW.slug]: FINANCE_INTERVIEW,
  [SYSTEM_DESIGN_INTERVIEW.slug]: SYSTEM_DESIGN_INTERVIEW,
};

export const DEFAULT_INTERVIEW_TYPE = GENERAL_INTERVIEW;

/**
 * Resolvable by slug but never listed: the problem-interview engine's test
 * fixture, outside production builds only (see
 * `lib/problem-interview/fixtures/type.ts`). Kept out of `INTERVIEW_TYPES` so
 * the launcher and every script that iterates the presets never see it.
 */
const HIDDEN_INTERVIEW_TYPES: Record<string, InterviewType> = PROBLEM_FIXTURE_ENABLED
  ? { [PROBLEM_FIXTURE_BASE.slug]: PROBLEM_FIXTURE_BASE }
  : {};

/** Resolve a slug from a URL segment or request body. Returns null on unknown. */
export function getInterviewType(slug: string | undefined | null): InterviewType | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  return INTERVIEW_TYPES[key] ?? HIDDEN_INTERVIEW_TYPES[key] ?? null;
}

/** Every preset, listed or not — for lookups, validation and verify scripts. */
export function listInterviewTypes(): InterviewType[] {
  return Object.values(INTERVIEW_TYPES);
}

/** Whether the picker offers this preset. Unlisted presets still resolve by slug. */
export function isListedInterviewType(type: InterviewType): boolean {
  return type.listed !== false;
}

/**
 * The five stages of Prompt 1's question sequence, in order.
 *
 * Tracked server-side rather than left to the model: the chat route sends only a
 * sliding window of recent turns, so by the role-specific stage the opening
 * questions have dropped out of context and the model can no longer tell where
 * it is. See `buildProgressBlock`.
 */
export const INTERVIEW_STAGES = [
  "opening",
  "resume",
  "behavioral",
  "role_specific",
  "closing",
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

/** Behavioral categories Prompt 1 draws from; tracked so none repeat or get skipped. */
export const BEHAVIORAL_CATEGORIES = [
  "conflict/disagreement",
  "failure/setback",
  "leadership without authority",
  "feedback received",
  "ambiguity",
  "teamwork",
] as const;

export type BehavioralCategory = (typeof BEHAVIORAL_CATEGORIES)[number];

/**
 * Where the interview has got to. Persisted with the interaction log and passed
 * back on each turn, because the model cannot reconstruct it from a windowed
 * transcript.
 */
export interface InterviewProgress {
  stage: InterviewStage;
  /** Questions asked so far, counting only planned questions, not follow-ups. */
  questionsAsked: number;
  /** Behavioral categories already covered, so the model does not repeat one. */
  categoriesCovered: BehavioralCategory[];
  /** Categories the candidate dodged. Prompt 1 circles back to each exactly once. */
  dodgedCategories: BehavioralCategory[];
  /** Follow-ups spent on the current question. Prompt 1 caps this at one. */
  followUpsUsed: number;
  /**
   * Planned questions asked while in the `behavioral` stage, categorised or
   * not.
   *
   * Exists because stage advancement used to depend ENTIRELY on
   * `categoriesCovered` reaching a quota, and categories only arrive when the
   * model labels its marker. A model emitting the uncategorised
   * `<interview-turn kind="planned" />` therefore parked the interview in
   * `behavioral` permanently. This counter is the independent escape hatch:
   * enough questions asked in the stage advances it even when none of them
   * were labeled. Absent on progress objects persisted before this field
   * existed — always read it defensively.
   */
  behavioralQuestionsAsked: number;
}

export function initialProgress(): InterviewProgress {
  return {
    stage: "opening",
    questionsAsked: 0,
    categoriesCovered: [],
    dodgedCategories: [],
    followUpsUsed: 0,
    behavioralQuestionsAsked: 0,
  };
}
