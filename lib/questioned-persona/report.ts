/**
 * Defensive narrowing of the stored `personaAnalysis` for report panels.
 * Client-safe. A malformed value renders as absent; never throws.
 */

import type { ProcessStepResult } from "@/lib/problem-interview/types";

import { CALGARY_CAMBRIDGE_FRAMEWORK, MI_PROCESS_FRAMEWORK } from "./frameworks";
import type { PersonaAnalysis } from "./types";
import { isPersonaStyle } from "./types";

export function asPersonaAnalysis(outcome: unknown): PersonaAnalysis | null {
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return null;
  const raw = (outcome as Record<string, unknown>).personaAnalysis;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = raw as Partial<PersonaAnalysis>;
  if (
    a.version !== 1 ||
    !isPersonaStyle(a.style) ||
    !Array.isArray(a.utterances) ||
    !a.counts ||
    typeof a.counts !== "object" ||
    !Array.isArray(a.metrics) ||
    !Array.isArray(a.steps) ||
    !Array.isArray(a.facts) ||
    !Array.isArray(a.cues)
  ) {
    return null;
  }
  return a as PersonaAnalysis;
}

export function frameworkFor(analysis: PersonaAnalysis) {
  return analysis.style === "clinical-communication"
    ? CALGARY_CAMBRIDGE_FRAMEWORK
    : MI_PROCESS_FRAMEWORK;
}

export function stepTally(steps: ProcessStepResult[]): { hit: number; applicable: number } {
  const applicable = steps.filter((s) => s.status !== "not_applicable");
  return { hit: applicable.filter((s) => s.status === "hit").length, applicable: applicable.length };
}

/** MITI 4.2.1 summary globals, computed from the rubric scores. */
export function mitiSummaryGlobals(scores: Record<string, number | null> | null | undefined): Array<{
  key: string;
  label: string;
  value: number | null;
  fair: number;
  good: number;
  formula: string;
}> {
  const s = (k: string) => (typeof scores?.[k] === "number" ? (scores[k] as number) : null);
  const avg = (a: number | null, b: number | null) =>
    a === null || b === null ? null : Math.round(((a + b) / 2) * 10) / 10;
  return [
    {
      key: "relational",
      label: "Relational global",
      value: avg(s("partnership"), s("empathy_mi")),
      fair: 3.5,
      good: 4,
      formula: "(Partnership + Empathy) / 2",
    },
    {
      key: "technical",
      label: "Technical global",
      value: avg(s("cultivating_change_talk"), s("softening_sustain_talk")),
      fair: 3,
      good: 4,
      formula: "(Cultivating change talk + Softening sustain talk) / 2",
    },
  ];
}

export const CODE_LABELS: Record<string, string> = {
  open_question: "Open questions",
  closed_question: "Closed questions",
  leading_question: "Leading questions",
  stacked_question: "Stacked questions",
  reflection: "Reflections",
  summary: "Summaries",
  empathy_statement: "Empathy statements",
  jargon: "Unexplained jargon",
  information_giving: "Information giving",
  teach_back: "Teach-back checks",
  agenda_setting: "Agenda setting",
  premature_reassurance: "Premature reassurance",
  simple_reflection: "Simple reflections",
  complex_reflection: "Complex reflections",
  affirm: "Affirmations",
  seeking_collaboration: "Seeking collaboration",
  emphasizing_autonomy: "Emphasizing autonomy",
  giving_information: "Giving information",
  persuade: "Persuade (no permission)",
  persuade_with_permission: "Persuade with permission",
  confront: "Confront",
};
