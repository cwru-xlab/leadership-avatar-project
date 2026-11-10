/**
 * Picker-facing view of the interview catalog: icons, short value lines and the
 * specialized list. Presentation only — nothing here reaches a prompt.
 *
 * The specialized list is built from `listInterviewTypes()` filtered by
 * `isListedInterviewType`, so a preset added on another branch shows up here
 * with no edit (an unknown slug gets the briefcase icon and the first sentence
 * of its description). The coding room is not an `InterviewType`, so it is
 * appended by hand.
 */
import {
  BarChart3,
  Braces,
  Briefcase,
  Cpu,
  GraduationCap,
  Landmark,
  Lightbulb,
  Network,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";

import {
  DEFAULT_INTERVIEW_TYPE,
  isListedInterviewType,
  listInterviewTypes,
  type InterviewDifficulty,
  type InterviewType,
} from "@/lib/interview/types";
import { routes } from "@/lib/routes";

const ICONS: Record<string, LucideIcon> = {
  general: Briefcase,
  technical: Cpu,
  consulting: Lightbulb,
  "early-career": GraduationCap,
  "product-management": PackageSearch,
  "data-analytics": BarChart3,
  finance: Landmark,
  "system-design": Network,
  "technical-coding": Braces,
};

/** One line on the card: what this interview is good for. Falls back to the description's first sentence. */
const TAGLINES: Record<string, string> = {
  general: "Behavioral questions built from your resume. A good first session.",
  technical: "How you reason through engineering tradeoffs.",
  consulting: "Structure a business problem out loud.",
  "product-management": "One product problem, worked step by step.",
  "data-analytics": "Turn a messy question into an analysis plan.",
  finance: "IB, PE or research: technicals, a paper LBO, or your market view.",
  "system-design": "Design a system and defend the tradeoffs.",
  "technical-coding": "Solve one coding problem in Python or JavaScript while you explain.",
};

export function interviewIcon(slug: string): LucideIcon {
  return ICONS[slug] ?? Briefcase;
}

function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
}

export function interviewTagline(type: Pick<InterviewType, "slug" | "description">): string {
  return TAGLINES[type.slug] ?? firstSentence(type.description);
}

/**
 * "Consulting / Case-Style Interview" reads as "Consulting / Case-Style" on a
 * page of interviews; a trailing parenthetical goes too ("Finance Interview
 * (IB / PE / Research)" → "Finance") — the card's tagline carries that detail.
 */
export function shortInterviewLabel(label: string): string {
  return (
    label
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+interview$/i, "")
      .trim() || label
  );
}

export interface SpecializedInterview {
  key: string;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  minutes: number;
  /** Difficulty word, or a format word for presets without one (the coding room). */
  level: InterviewDifficulty | string;
  areas: string[];
  href: string;
  /** False for the coding room, which has no customization; its card starts directly. */
  customizable: boolean;
}

const CODING_INTERVIEW: SpecializedInterview = {
  key: "technical-coding",
  title: "Technical coding",
  tagline: TAGLINES["technical-coding"],
  description:
    "Solve an original algorithm exercise in Python or JavaScript in a code workspace while explaining your reasoning to an interviewer. Visible tests run as you work.",
  icon: Braces,
  minutes: 30,
  level: "Python or JavaScript",
  areas: ["Clarify the problem", "Explain your approach", "Code and test"],
  href: routes.interview("technical-coding"),
  customizable: false,
};

/** Every listed preset except general, then the coding room. */
export function listSpecializedInterviews(): SpecializedInterview[] {
  const presets = listInterviewTypes()
    .filter((type) => isListedInterviewType(type) && type.slug !== DEFAULT_INTERVIEW_TYPE.slug)
    .map<SpecializedInterview>((type) => ({
      key: type.slug,
      title: shortInterviewLabel(type.label),
      tagline: interviewTagline(type),
      description: type.description,
      icon: interviewIcon(type.slug),
      minutes: type.targetMinutes,
      level: type.difficulty,
      areas: type.questionAreas ?? [],
      href: routes.customizeInterview(type.slug),
      customizable: true,
    }));
  return [...presets, CODING_INTERVIEW];
}
