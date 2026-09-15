/**
 * LeadPath practice topic taxonomy and skill rubric keys.
 * Video/presence camera metrics are documented but not scored in this pass.
 */

export const PRACTICE_TOPICS = [
  "interview",
  "pitch",
  "courageous_conversation",
] as const;

export type PracticeTopic = (typeof PRACTICE_TOPICS)[number];

export const TOPIC_META: Record<
  PracticeTopic,
  { label: string; shortLabel: string; description: string; href: string }
> = {
  interview: {
    label: "Practice Interviews",
    shortLabel: "Interviews",
    description:
      "Behavioral, technical, and leadership interviews with adaptive interviewer personas.",
    href: "/practice/interview",
  },
  pitch: {
    label: "Practice Pitches",
    shortLabel: "Pitches",
    description:
      "Persuasive pitches to investors, executives, faculty, and community stakeholders.",
    href: "/practice/pitch",
  },
  courageous_conversation: {
    label: "Courageous Conversations",
    shortLabel: "Courageous Conversations",
    description:
      "Conflict resolution, feedback delivery, and accountability discussions.",
    href: "/practice/courageous_conversation",
  },
};

export const TOPIC_SUBTYPES: Record<PracticeTopic, string[]> = {
  interview: ["Behavioral", "Technical", "Leadership"],
  pitch: ["Investor", "Executive", "Faculty", "Community"],
  courageous_conversation: ["Conflict", "Feedback", "Accountability"],
};

/** Skills scored from chat/transcript (no video analysis). */
export const TRACKABLE_SKILLS = [
  "organization",
  "completeness",
  "conciseness",
  "professional_language",
  "examples",
  "reflection",
  "preparation",
  "judgment",
  "confidence",
  "emotional_regulation",
  "empathy",
  "listening",
  "ownership",
  "accountability",
  "coachability",
  "collaboration",
  "storytelling",
  "persuasion",
  "handling_questions",
] as const;

export type SkillKey = (typeof TRACKABLE_SKILLS)[number];

export const SKILL_META: Record<
  SkillKey,
  { label: string; category: "communication" | "substance" | "presence" | "ei_leadership" | "pitch" }
> = {
  organization: { label: "Organization", category: "communication" },
  completeness: { label: "Completeness", category: "communication" },
  conciseness: { label: "Conciseness", category: "communication" },
  professional_language: { label: "Professional language", category: "communication" },
  examples: { label: "Examples", category: "substance" },
  reflection: { label: "Reflection", category: "substance" },
  preparation: { label: "Preparation", category: "substance" },
  judgment: { label: "Judgment", category: "substance" },
  confidence: { label: "Confidence", category: "presence" },
  emotional_regulation: { label: "Emotional regulation", category: "presence" },
  empathy: { label: "Empathy", category: "ei_leadership" },
  listening: { label: "Listening", category: "ei_leadership" },
  ownership: { label: "Ownership", category: "ei_leadership" },
  accountability: { label: "Accountability", category: "ei_leadership" },
  coachability: { label: "Coachability", category: "ei_leadership" },
  collaboration: { label: "Collaboration", category: "ei_leadership" },
  storytelling: { label: "Storytelling", category: "pitch" },
  persuasion: { label: "Persuasion", category: "pitch" },
  handling_questions: { label: "Handling questions", category: "pitch" },
};

export const DEFAULT_TOPIC_SKILLS: Record<PracticeTopic, SkillKey[]> = {
  interview: [
    "organization",
    "completeness",
    "conciseness",
    "examples",
    "reflection",
    "preparation",
    "confidence",
    "professional_language",
    "listening",
  ],
  pitch: [
    "storytelling",
    "persuasion",
    "organization",
    "conciseness",
    "handling_questions",
    "confidence",
    "preparation",
    "professional_language",
  ],
  courageous_conversation: [
    "empathy",
    "listening",
    "emotional_regulation",
    "ownership",
    "accountability",
    "judgment",
    "collaboration",
    "coachability",
    "professional_language",
  ],
};

export const SKILL_TARGET_SCORE = 80;
export const SKILL_EMA_ALPHA = 0.35;
export const FOCUS_SKILL_COUNT = 3;
export const PLAN_ACTIVITY_COUNT = 5;
export const SKILL_IMPROVEMENT_THRESHOLD = 5;

export function isPracticeTopic(value: string): value is PracticeTopic {
  return (PRACTICE_TOPICS as readonly string[]).includes(value);
}

export function xpToLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

export function scoreToXp(score: number): number {
  return Math.max(0, Math.round(score));
}
