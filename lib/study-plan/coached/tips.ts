/**
 * Coach tips as TECHNIQUE REMINDERS ONLY — enforced MECHANICALLY, not by a
 * prompt instruction (REQ-115).
 *
 * 21-CONTEXT.md states the load-bearing clause plainly: "Tips are TECHNIQUE
 * REMINDERS ONLY. Name the skill; never script the words. The student's
 * words stay theirs, which is what lets a coached session evidence anything
 * at all." If the coach feeds the student a line and the student says it,
 * the resulting score measures the coach, not the student — and the entire
 * case for a coached session contributing to mastery collapses. A prompt
 * saying "do not script the words" is not enforcement; this module is.
 *
 * TWO MECHANISMS, in order of strength:
 *
 * MECHANISM A (primary, stronger) — a CLOSED technique library.
 * `TECHNIQUE_LIBRARY` is a hand-written, human-reviewed set of reminders,
 * each one instructing a MOVE in the second person, with no quoted speech.
 * A tip drawn verbatim from this library is safe BY CONSTRUCTION — a human
 * wrote it, and Section 1 of `scripts/verify-coach-tips.ts` proves every
 * entry also passes Mechanism B's rejector, so the two mechanisms can never
 * silently disagree. The coach SHOULD select a technique id from
 * `techniquesForCompetency(key)` and render its `reminder` text verbatim;
 * this is the preferred path for the common case.
 *
 * MECHANISM B (fallback, for anything not drawn verbatim from the library)
 * — `validateTip` / `assertTipSafe`, a mechanical rejector over free tip
 * text, for the rarer case where a tip must reference the student's
 * specific moment (and therefore cannot be a static library entry).
 *
 * FALSE-POSITIVE RISK, documented honestly: this rejector will occasionally
 * refuse a legitimate tip — for instance, a technique named with a short
 * quoted term of art ("the \"name it, claim it\" move") sitting right at a
 * rule's threshold. That tradeoff is chosen DELIBERATELY: a rejected good
 * tip costs the generator one regeneration; an accepted scripted tip
 * invalidates the session's evidence entirely. The mitigation is Mechanism
 * A itself — the common path (selecting from the closed library) never
 * touches the rejector at all, so the false-positive cost is paid only on
 * the rarer free-text path.
 */
import {
  COMPETENCIES,
  type CompetencyKey,
} from "@/lib/mastery/competencies";

/**
 * A single library entry. `reminder` is one sentence, second person,
 * instructing a move — never a line of speech the student could repeat
 * verbatim.
 */
export interface Technique {
  id: string;
  competencyKey: CompetencyKey;
  name: string;
  reminder: string;
}

/**
 * CLOSED — 3-5 techniques per competency, covering all seven keys in
 * `COMPETENCIES`. Every `reminder` below is proven, in
 * `scripts/verify-coach-tips.ts` Section 1, to pass `validateTip` itself —
 * a library entry its own rejector refuses would be the most embarrassing
 * possible bug, and that proof is cheap to run on every change here.
 */
export const TECHNIQUE_LIBRARY: ReadonlyArray<Technique> = [
  // delivery_presence
  {
    id: "delivery-eyes-up",
    competencyKey: "delivery_presence",
    name: "Eyes up, shoulders back",
    reminder:
      "Lift your eyes to the camera and square your shoulders before you start your next sentence.",
  },
  {
    id: "delivery-slow-down",
    competencyKey: "delivery_presence",
    name: "Cut your pace by a third",
    reminder:
      "Slow your pace by about a third and let your last word land before you move on.",
  },
  {
    id: "delivery-pause-after-point",
    competencyKey: "delivery_presence",
    name: "Pause after the point",
    reminder:
      "After you make your main point, stop talking for a full two seconds before continuing.",
  },
  {
    id: "delivery-own-the-room",
    competencyKey: "delivery_presence",
    name: "Address the whole room",
    reminder:
      "Widen your gaze to sweep the whole room instead of fixing on one listener.",
  },
  // structure_and_clarity
  {
    id: "structure-headline-first",
    competencyKey: "structure_and_clarity",
    name: "Headline first",
    reminder: "Lead with your conclusion, then give at most two supports.",
  },
  {
    id: "structure-one-idea-per-sentence",
    competencyKey: "structure_and_clarity",
    name: "One idea per sentence",
    reminder:
      "Split any sentence carrying two ideas into two separate sentences.",
  },
  {
    id: "structure-signpost-transitions",
    competencyKey: "structure_and_clarity",
    name: "Signpost your transitions",
    reminder:
      "Name the shift out loud before you move to your next point, so the listener can follow the turn.",
  },
  {
    id: "structure-close-the-loop",
    competencyKey: "structure_and_clarity",
    name: "Close the loop",
    reminder:
      "Return explicitly to the question you opened with before you finish.",
  },
  // concision_and_focus
  {
    id: "concision-cut-the-preamble",
    competencyKey: "concision_and_focus",
    name: "Cut the preamble",
    reminder: "Drop your opening warm-up sentence and start on your point.",
  },
  {
    id: "concision-one-supporting-detail",
    competencyKey: "concision_and_focus",
    name: "One supporting detail, not three",
    reminder:
      "Keep only your strongest supporting detail and drop the other two.",
  },
  {
    id: "concision-trim-qualifiers",
    competencyKey: "concision_and_focus",
    name: "Trim your qualifiers",
    reminder:
      "Remove hedging qualifiers like 'kind of' or 'sort of' from your next sentence.",
  },
  // audience_attunement
  {
    id: "audience-name-the-feeling",
    competencyKey: "audience_attunement",
    name: "Name the feeling you're hearing",
    reminder:
      "Name, out loud, the emotion you notice in the other person before you respond to their content.",
  },
  {
    id: "audience-ask-before-telling",
    competencyKey: "audience_attunement",
    name: "Ask before you tell",
    reminder:
      "Ask one open question about their situation before you offer your own view.",
  },
  {
    id: "audience-mirror-their-language",
    competencyKey: "audience_attunement",
    name: "Mirror their own terms",
    reminder:
      "Reuse a key term the other person just used instead of substituting your own word for it.",
  },
  {
    id: "audience-check-understanding",
    competencyKey: "audience_attunement",
    name: "Check your understanding",
    reminder:
      "Summarize what you heard in one sentence and pause for confirmation before continuing.",
  },
  // holding_position_under_pressure
  {
    id: "pressure-restate-the-ask",
    competencyKey: "holding_position_under_pressure",
    name: "Restate the ask",
    reminder:
      "Say the ask again in the same words you used the first time, before you respond to the objection.",
  },
  {
    id: "pressure-acknowledge-then-hold",
    competencyKey: "holding_position_under_pressure",
    name: "Acknowledge, then hold",
    reminder:
      "Acknowledge the pushback in one sentence, then return to your original position without softening it.",
  },
  {
    id: "pressure-slow-your-response",
    competencyKey: "holding_position_under_pressure",
    name: "Slow your response to pressure",
    reminder:
      "Take a visible breath before you answer the objection instead of responding immediately.",
  },
  {
    id: "pressure-separate-position-from-tone",
    competencyKey: "holding_position_under_pressure",
    name: "Keep your tone warm, your position firm",
    reminder:
      "Keep your voice warm while your position stays exactly where it was before the pushback.",
  },
  // credibility_of_the_case
  {
    id: "credibility-cite-the-source",
    competencyKey: "credibility_of_the_case",
    name: "Cite where the number comes from",
    reminder:
      "Name the source of your key figure before you state the figure itself.",
  },
  {
    id: "credibility-connect-ask-to-evidence",
    competencyKey: "credibility_of_the_case",
    name: "Connect the ask to the evidence",
    reminder:
      "Point explicitly at the piece of evidence that supports your ask before moving to the next point.",
  },
  {
    id: "credibility-acknowledge-a-limit",
    competencyKey: "credibility_of_the_case",
    name: "Acknowledge one limit of your case",
    reminder:
      "Name one limitation of your own case before the other side raises it.",
  },
  // outcome_achievement
  {
    id: "outcome-state-the-goal",
    competencyKey: "outcome_achievement",
    name: "State your goal out loud",
    reminder:
      "State the outcome you are aiming for in one sentence before you continue.",
  },
  {
    id: "outcome-ask-for-the-next-step",
    competencyKey: "outcome_achievement",
    name: "Ask for the next step",
    reminder:
      "Ask explicitly for a concrete next step before the conversation ends.",
  },
  {
    id: "outcome-check-against-the-goal",
    competencyKey: "outcome_achievement",
    name: "Check your progress against the goal",
    reminder:
      "Compare what just happened against your stated goal before you decide what to say next.",
  },
];

/** Returns every technique tagged to the given competency. */
export function techniquesForCompetency(
  key: CompetencyKey,
): ReadonlyArray<Technique> {
  return TECHNIQUE_LIBRARY.filter((t) => t.competencyKey === key);
}

/** PROVISIONAL UNTIL CALIBRATED — a technique reminder is a sentence; a
 * paragraph is either a script or a lecture, and length is the cheapest
 * reliable proxy for which one it is. */
export const MAX_TIP_LENGTH = 240;

/**
 * Scripted-line lead-in phrases. Kept as an exported, reviewable array
 * rather than inlined into the regex construction, so the list is a single
 * place to extend and `scripts/verify-coach-tips.ts` can iterate it to
 * prove every phrase actually fires.
 */
export const SCRIPT_CUE_PHRASES: ReadonlyArray<string> = [
  "try saying",
  "say something like",
  "you could say",
  "respond with",
  "tell them",
  "use this",
  "for example:",
  "here's how to phrase",
  "instead say",
  "word it as",
];

export const TIP_REJECT_REASONS = [
  "CONTAINS_QUOTED_SPEECH",
  "CONTAINS_SCRIPT_CUE",
  "CONTAINS_FIRST_PERSON_LINE",
  "TOO_LONG",
  "ECHOES_STUDENT_LINE",
] as const;

export type TipRejectReason = (typeof TIP_REJECT_REASONS)[number];

export type TipValidation =
  | { ok: true }
  | { ok: false; reason: TipRejectReason; detail: string };

/** Matches a double-, single-, or curly-quoted span of 4+ words. */
const QUOTED_SPEECH_RE =
  /["“‘']([^"”’']*?)["”’']/g;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Word-boundary, case-insensitive match for one script-cue phrase. */
function containsScriptCue(tip: string): string | null {
  const lower = tip.toLowerCase();
  for (const phrase of SCRIPT_CUE_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, "i");
    if (re.test(lower)) {
      return phrase;
    }
  }
  return null;
}

/**
 * Matches a first-person declarative of 6+ words: a sentence starting with
 * `I ` / `I'm` / `I'd` / `My ` / `We ` (case-sensitive on the pronoun
 * itself — a mid-sentence lowercase "i" is not this pattern). This is the
 * rule that catches an UNQUOTED script — the form the quoted-speech and
 * script-cue rules both miss.
 */
const FIRST_PERSON_SENTENCE_RE =
  /(?:^|[.!?]\s+)(I\s|I'm\b|I'd\b|My\s|We\s)([^.!?]*)/g;

function findFirstPersonLine(tip: string): string | null {
  FIRST_PERSON_SENTENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FIRST_PERSON_SENTENCE_RE.exec(tip)) !== null) {
    const sentence = `${match[1]}${match[2]}`;
    if (wordCount(sentence) >= 6) {
      return sentence.trim();
    }
  }
  return null;
}

/** Finds a 6+ word contiguous span shared between `tip` and `studentLine`. */
function findEchoedSpan(tip: string, studentLine: string): string | null {
  const tipWords = tip.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const studentWords = studentLine.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (studentWords.length < 6) return null;

  for (let len = studentWords.length; len >= 6; len--) {
    for (let start = 0; start + len <= studentWords.length; start++) {
      const span = studentWords.slice(start, start + len).join(" ");
      if (tip.toLowerCase().includes(span)) {
        return span;
      }
    }
  }
  return null;
}

/**
 * Mechanism B. Returns `{ ok: true }` or `{ ok: false; reason; detail }`.
 * Checked in the order documented above; the first violation found is
 * reported (a tip can fail more than one rule, but one reason is enough to
 * reject it).
 */
export function validateTip(
  tip: string,
  context: { studentLine: string },
): TipValidation {
  QUOTED_SPEECH_RE.lastIndex = 0;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = QUOTED_SPEECH_RE.exec(tip)) !== null) {
    if (wordCount(quotedMatch[1]) >= 4) {
      return {
        ok: false,
        reason: "CONTAINS_QUOTED_SPEECH",
        detail: `quoted span: "${quotedMatch[1]}"`,
      };
    }
  }

  const scriptCue = containsScriptCue(tip);
  if (scriptCue) {
    return {
      ok: false,
      reason: "CONTAINS_SCRIPT_CUE",
      detail: `matched script-cue phrase: "${scriptCue}"`,
    };
  }

  const firstPersonLine = findFirstPersonLine(tip);
  if (firstPersonLine) {
    return {
      ok: false,
      reason: "CONTAINS_FIRST_PERSON_LINE",
      detail: `first-person sentence: "${firstPersonLine}"`,
    };
  }

  if (tip.length > MAX_TIP_LENGTH) {
    return {
      ok: false,
      reason: "TOO_LONG",
      detail: `length ${tip.length} exceeds MAX_TIP_LENGTH (${MAX_TIP_LENGTH})`,
    };
  }

  const echoed = findEchoedSpan(tip, context.studentLine);
  if (echoed) {
    return {
      ok: false,
      reason: "ECHOES_STUDENT_LINE",
      detail: `echoes student line span: "${echoed}"`,
    };
  }

  return { ok: true };
}

/**
 * Throwing form of `validateTip`, for any call site that renders a tip to
 * the student and must not proceed on rejection. The non-throwing form
 * (`validateTip`) is for a generator that wants to discard-and-retry.
 */
export function assertTipSafe(
  tip: string,
  context: { studentLine: string },
): void {
  const result = validateTip(tip, context);
  if (!result.ok) {
    throw new Error(
      `assertTipSafe: tip rejected (${result.reason}): ${result.detail}`,
    );
  }
}

// Reference COMPETENCIES so a future competency added to the catalog with
// no library coverage is caught at review time, not only by the verifier's
// runtime assertion.
void COMPETENCIES;
