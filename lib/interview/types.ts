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
  label: "Technical / Engineering Interview",
  description:
    "A behavioral interview for engineering roles, with a focus on how you think " +
    "through technical tradeoffs, not on quizzing you with trivia.",
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
 * Consulting / case-style interview. Persona is Socratic and composed, asking
 * the candidate to structure their thinking out loud rather than race to an
 * answer.
 */
const CONSULTING_INTERVIEW: InterviewType = {
  slug: "consulting",
  label: "Consulting / Case-Style Interview",
  description:
    "A behavioral interview styled after a consulting-firm interview, emphasizing " +
    "structured, Socratic thinking under the interviewer's questioning.",
  interviewerPersona:
    "a composed, Socratic consulting-firm interviewer who asks the candidate to " +
    "structure their thinking out loud. You are patient but exacting, and you " +
    "reward candidates who lay out a clear framework before diving into details",
  defaultRoleTitle: "a management consulting associate role",
  defaultIndustry: "management consulting",
  difficulty: "Advanced",
  targetMinutes: 20,
  targetQuestionCount: 9,
  caseBackground:
    "For the role-specific stage, pose a generic business situation and ask the " +
    "candidate to structure how they would approach it.",
  questionAreas: ["Your background", "Behavioral stories", "Structured problem solving"],
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
};

export const INTERVIEW_TYPES: Record<string, InterviewType> = {
  [GENERAL_INTERVIEW.slug]: GENERAL_INTERVIEW,
  [TECHNICAL_INTERVIEW.slug]: TECHNICAL_INTERVIEW,
  [CONSULTING_INTERVIEW.slug]: CONSULTING_INTERVIEW,
  [EARLY_CAREER_INTERVIEW.slug]: EARLY_CAREER_INTERVIEW,
};

export const DEFAULT_INTERVIEW_TYPE = GENERAL_INTERVIEW;

/** Resolve a slug from a URL segment or request body. Returns null on unknown. */
export function getInterviewType(slug: string | undefined | null): InterviewType | null {
  if (!slug) return null;
  return INTERVIEW_TYPES[slug.trim().toLowerCase()] ?? null;
}

/** For the launcher listing. */
export function listInterviewTypes(): InterviewType[] {
  return Object.values(INTERVIEW_TYPES);
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
}

export function initialProgress(): InterviewProgress {
  return {
    stage: "opening",
    questionsAsked: 0,
    categoriesCovered: [],
    dodgedCategories: [],
    followUpsUsed: 0,
  };
}
