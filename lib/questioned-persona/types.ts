/**
 * Questioned persona — the student INTERVIEWS or COUNSELS an avatar (a
 * standardized patient, an ambivalent client) who holds facts that come out
 * only when asked well. Built on the difficult-conversation engine: a case
 * here is a `DifficultConversationRecord` plus a `PersonaCard`, resolved into
 * the same `DifficultConversationInstance` (with `personaCard` set), played
 * in the same session room, and graded by the same runner. What it adds:
 *
 * - a hidden-information schema (the OSCE "case card": what the persona says
 *   unprompted versus only to the right question, cues, ICE, change talk);
 * - a behavior-count grader: an evaluator pass tags every student utterance
 *   (structured JSON), and counts / ratios are derived IN CODE from the tags
 *   (`./coding.ts`) — the model is never asked for totals;
 * - a checklist judged step by step with verbatim evidence quotes, reusing
 *   the problem-interview step contract (`ProcessFramework`,
 *   `ProcessStepResult`).
 */

import type {
  ProcessFramework,
  ProcessStepResult,
} from "@/lib/problem-interview/types";
import type { DifficultConversationRecord } from "@/lib/difficult-conversation/types";

export const PERSONA_STYLES = [
  "clinical-communication",
  "motivational-interviewing",
] as const;

export type PersonaStyle = (typeof PERSONA_STYLES)[number];

export function isPersonaStyle(value: unknown): value is PersonaStyle {
  return (
    typeof value === "string" &&
    (PERSONA_STYLES as readonly string[]).includes(value)
  );
}

/**
 * A fact the persona holds back. `revealWhen` is written for the live model:
 * the kind of question that earns it. The evaluator also uses it to judge
 * whether the student elicited the fact.
 */
export interface HiddenFact {
  /** Stable id within the case, e.g. "family_history". */
  id: string;
  /** Short label for the report, e.g. "Father's heart attack at 52". */
  label: string;
  /** The fact, in the persona's voice or plain prose. */
  fact: string;
  revealWhen: string;
  /**
   * Lowercase words that appear when the persona discloses the fact. Used by
   * tests to check a fact surfaced only after the right question; never used
   * for grading.
   */
  revealKeywords: string[];
}

/** An emotional cue the persona drops; the student should notice and respond. */
export interface PersonaCue {
  id: string;
  label: string;
  /** Roughly what the persona says (the model paraphrases). */
  line: string;
  /** What a good response opens up (usually a concern or an ICE item). */
  ifExplored: string;
}

export interface PersonaCard {
  style: PersonaStyle;
  /** First-name the persona answers to, e.g. "Mr. Daniel Ortiz". */
  personaName: string;
  /** Age / occupation / life context — given to the avatar. */
  profile: string;
  /** The setting, e.g. "Urgent-care clinic". */
  setting: string;
  /** What the persona says when asked an opening open question. */
  openingStatement: string;
  /** Facts the persona offers freely when asked anything relevant. */
  spontaneousFacts: string[];
  hiddenFacts: HiddenFact[];
  cues: PersonaCue[];
  /** How the persona talks: register, mood, tics. */
  manner: string;
  /** Clinical only: ideas, concerns, expectations the student should elicit. */
  ice?: { ideas: string; concerns: string; expectations: string };
  /** Clinical only: what the student may explain at the end, at lay level. */
  explanationPoints?: string;
  /** MI only: the change the client is ambivalent about. */
  targetBehavior?: string;
  /** MI only: what the client says FOR change when it is evoked. */
  changeTalk?: string[];
  /** MI only: what the client says AGAINST change (sustain talk). */
  sustainTalk?: string[];
  /** MI only: how the client reacts to the righting reflex. */
  reactanceRule?: string;
  /** Short line under the case card on the picker. */
  tagline: string;
  /** Profession tag on the card, e.g. "Medicine", "Nursing", "Dental". */
  discipline: string;
}

/** A playable case: the DC record (briefing fields) plus the persona card. */
export interface PersonaCase extends DifficultConversationRecord {
  personaCard: PersonaCard;
}

// ---------------------------------------------------------------------------
// Behavior coding
// ---------------------------------------------------------------------------

/**
 * Clinical utterance codes — Calgary–Cambridge / SEGUE vocabulary. One
 * utterance can carry several codes (an empathy statement followed by an open
 * question is two codes).
 */
export const CLINICAL_CODES = [
  "open_question",
  "closed_question",
  "leading_question",
  "stacked_question",
  "reflection",
  "summary",
  "empathy_statement",
  "jargon",
  "information_giving",
  "teach_back",
  "agenda_setting",
  "premature_reassurance",
] as const;

export type ClinicalCode = (typeof CLINICAL_CODES)[number];

/**
 * MITI 4.2.1 counselor behavior codes (Moyers, Manuel & Ernst, 2014;
 * Moyers et al., 2016). `persuade_with_permission` is MI-consistent;
 * `persuade` and `confront` are the MI-inconsistent codes. Open vs closed is
 * not a MITI 4 distinction, but it is recorded too (MITI 3 kept it, and
 * students ask for it).
 */
export const MI_CODES = [
  "open_question",
  "closed_question",
  "simple_reflection",
  "complex_reflection",
  "affirm",
  "seeking_collaboration",
  "emphasizing_autonomy",
  "giving_information",
  "persuade",
  "persuade_with_permission",
  "confront",
] as const;

export type MiCode = (typeof MI_CODES)[number];

export type BehaviorCode = ClinicalCode | MiCode;

/** One coded student utterance, as returned by the tagging pass. */
export interface TaggedUtterance {
  /** Index into the student-utterance list (0-based, canned opener removed). */
  index: number;
  text: string;
  codes: BehaviorCode[];
}

export type ThresholdBand = "below" | "fair" | "good";

export interface DerivedMetric {
  key: string;
  label: string;
  /** Rounded for display; null when undefined (e.g. no questions asked). */
  value: number | null;
  /** How the value is printed: "ratio" → "1.4 : 1", "percent" → "62%". */
  format: "ratio" | "percent" | "count";
  /** Fair / good cut-offs when a published threshold exists. */
  threshold?: { fair: number; good: number; source: string };
  band?: ThresholdBand;
  /** Plain-language "why this matters". */
  note: string;
}

export interface CueResult {
  id: string;
  label: string;
  status: "explored" | "acknowledged" | "missed" | "not_raised";
  evidenceQuote: string;
}

export interface FactResult {
  id: string;
  label: string;
  elicited: boolean;
  evidenceQuote: string;
}

/**
 * Stored in `InteractionReport.outcome.personaAnalysis` (engine-owned, set by
 * the type's supplementary analysis — never by the rubric evaluator).
 */
export interface PersonaAnalysis {
  version: 1;
  style: PersonaStyle;
  frameworkKey: string;
  utterances: TaggedUtterance[];
  counts: Record<string, number>;
  metrics: DerivedMetric[];
  steps: ProcessStepResult[];
  facts: FactResult[];
  cues: CueResult[];
  /** Clinical only. */
  ice?: Array<{ key: "ideas" | "concerns" | "expectations"; elicited: boolean; evidenceQuote: string }>;
  /** MITI global scores live in `report.scores` (they are rubric dimensions). */
  model: string;
}

export type { ProcessFramework, ProcessStepResult };
