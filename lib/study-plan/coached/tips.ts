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
 *
 * MECHANISM C — the Phase 22 gated carve-out. 22-CONTEXT.md: "Can the coach
 * give words to say — YES, but only after the student has tried. ... This is
 * a gated carve-out in `lib/study-plan/coached/tips.ts`'s `assertTipSafe`,
 * NOT its removal. The no-parroting guarantee stands for the first attempt —
 * that is the whole reason the rule exists." So `assertTipSafe` accepts an
 * optional `gate`; with none, it is exactly Mechanism B. With a DEMONSTRATION
 * gate the attempt count is checked FIRST (before any content rule), at most
 * MAX_DEMONSTRATIONS_PER_LEG is allowed per leg, and the quoted-speech,
 * script-cue and first-person rules are waived, because a demonstration is
 * by design words to say. The rail's promise ("these are not words to say")
 * stays true because demonstrations never enter the rail: they are spoken
 * by the coach, a different channel. `validateCoachSpeech` is the mechanical
 * gate for every other coach utterance (no scripting, no voicing the other
 * party), and `isParrotOf` detects a student attempt that merely repeats a
 * demonstration.
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

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * The ONE spoken sentence that names a technique before the coach invites an
 * attempt (Phase 23 L2), e.g. "Try headline first: lead with your conclusion,
 * then give at most two supports." It is composed from the library entry's
 * own name and reminder, so it names the skill and never scripts the words;
 * `scripts/verify-coach-tips.ts` proves every library entry's line passes
 * `assertTipSafe`, and `coach.ts` re-runs the gate on every line it speaks.
 */
export function techniqueLine(t: Pick<Technique, "name" | "reminder">): string {
  return `Try ${lowerFirst(t.name)}: ${lowerFirst(t.reminder)}`;
}

/**
 * True when an utterance merely repeats a technique reminder (or its spoken
 * line) back instead of answering. Uses `isParrotOf`, so a full answer that
 * happens to apply the technique is not flagged: the 70%-token rule only
 * fires on an utterance about as short as the reminder itself.
 */
export function isTechniqueParrot(
  utterance: string,
  techniques: ReadonlyArray<Pick<Technique, "name" | "reminder">>,
): boolean {
  return techniques.some(
    (t) => isParrotOf(utterance, t.reminder) || isParrotOf(utterance, techniqueLine(t)),
  );
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

/**
 * THE one contiguous-span finder. Returns the longest span of at least
 * `minWords` words from `source` that appears verbatim (case-insensitive)
 * inside `haystack`, or null. Every threshold in this module (tip echo 6,
 * demonstration echo 10, counterpart 6, parrot 8) goes through here.
 */
function findSharedSpan(
  haystack: string,
  source: string,
  minWords: number,
): string | null {
  const words = source.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length < minWords) return null;
  const lowerHaystack = haystack.toLowerCase();

  for (let len = words.length; len >= minWords; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const span = words.slice(start, start + len).join(" ");
      if (lowerHaystack.includes(span)) {
        return span;
      }
    }
  }
  return null;
}

/** Lowercased word tokens joined by single spaces: punctuation-insensitive. */
function normalizeWords(s: string): string {
  return (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).join(" ");
}

/** Finds a 6+ word contiguous span shared between `tip` and `studentLine`. */
function findEchoedSpan(tip: string, studentLine: string): string | null {
  return findSharedSpan(tip, studentLine, 6);
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

export const MAX_DEMONSTRATIONS_PER_LEG = 1;
/** PROVISIONAL UNTIL CALIBRATED — a demonstration is one better version of
 * one line, not a speech. */
export const MAX_DEMONSTRATION_LENGTH = 400;
/** PROVISIONAL UNTIL CALIBRATED — a coach turn is a few sentences. */
export const MAX_COACH_SPEECH_LENGTH = 700;

export const DEMONSTRATION_REJECT_REASONS = [
  "DEMONSTRATION_BEFORE_ATTEMPT",
  "DEMONSTRATION_LIMIT",
  "TOO_LONG",
  "ECHOES_STUDENT_LINE",
] as const;

export const COACH_SPEECH_REJECT_REASONS = [
  "CONTAINS_SCRIPT_CUE",
  "CONTAINS_SCRIPTED_QUOTE",
  "VOICES_COUNTERPART",
  "TOO_LONG",
] as const;

export type TipGate = {
  kind: "DEMONSTRATION";
  attemptsInLeg: number;
  demonstrationsInLeg: number;
};

export type DemonstrationValidation =
  | { ok: true }
  | {
      ok: false;
      reason: (typeof DEMONSTRATION_REJECT_REASONS)[number];
      detail: string;
    };

export type CoachSpeechValidation =
  | { ok: true }
  | {
      ok: false;
      reason: (typeof COACH_SPEECH_REJECT_REASONS)[number];
      detail: string;
    };

/**
 * Gated demonstration check. The attempt count comes FIRST, before any
 * content rule: a demonstration before the student has produced anything is
 * the failure mode this whole module was written against.
 */
export function validateDemonstration(
  text: string,
  ctx: {
    studentLine: string;
    attemptsInLeg: number;
    demonstrationsInLeg: number;
  },
): DemonstrationValidation {
  if (ctx.attemptsInLeg < 1) {
    return {
      ok: false,
      reason: "DEMONSTRATION_BEFORE_ATTEMPT",
      detail: "the student has not yet attempted the rework in this leg",
    };
  }
  if (ctx.demonstrationsInLeg >= MAX_DEMONSTRATIONS_PER_LEG) {
    return {
      ok: false,
      reason: "DEMONSTRATION_LIMIT",
      detail: `already ${ctx.demonstrationsInLeg} demonstration(s) in this leg (max ${MAX_DEMONSTRATIONS_PER_LEG})`,
    };
  }
  if (text.length > MAX_DEMONSTRATION_LENGTH) {
    return {
      ok: false,
      reason: "TOO_LONG",
      detail: `length ${text.length} exceeds MAX_DEMONSTRATION_LENGTH (${MAX_DEMONSTRATION_LENGTH})`,
    };
  }
  // 10 words, higher than the tip rule's 6: a better version of the line
  // legitimately reuses some of the student's own words, so only a long
  // verbatim run counts as an echo. Quoted speech, script cues and
  // first-person sentences are WAIVED here by design.
  const echoed = findSharedSpan(text, ctx.studentLine, 10);
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
 *
 * With no `gate` this is exactly the Mechanism B path. With a DEMONSTRATION
 * gate it applies `validateDemonstration` instead.
 */
export function assertTipSafe(
  tip: string,
  context: { studentLine: string; gate?: TipGate },
): void {
  if (context.gate && context.gate.kind === "DEMONSTRATION") {
    const result = validateDemonstration(tip, {
      studentLine: context.studentLine,
      attemptsInLeg: context.gate.attemptsInLeg,
      demonstrationsInLeg: context.gate.demonstrationsInLeg,
    });
    if (!result.ok) {
      throw new Error(
        `assertTipSafe: demonstration rejected (${result.reason}): ${result.detail}`,
      );
    }
    return;
  }
  const result = validateTip(tip, { studentLine: context.studentLine });
  if (!result.ok) {
    throw new Error(
      `assertTipSafe: tip rejected (${result.reason}): ${result.detail}`,
    );
  }
}

/** Double- or curly-double-quoted spans, plus single-quoted spans only when
 * the quotes sit at word edges (so apostrophes in "I'd" are not quotes). */
const COACH_QUOTE_RE =
  /["“]([^"”]+)["”]|(?:^|[\s(])'([^']+)'(?=[\s.,;:!?)]|$)/g;

/**
 * Mechanical gate for every coach utterance. Quoting the student's own words
 * back is coaching; quoting new words is scripting. The first-person rule
 * does not apply: the coach speaks as "I".
 */
export function validateCoachSpeech(
  speech: string,
  ctx: {
    studentLine: string;
    counterpartLine: string | null;
    studentAttempts: readonly string[];
  },
): CoachSpeechValidation {
  const cue = containsScriptCue(speech);
  if (cue) {
    return {
      ok: false,
      reason: "CONTAINS_SCRIPT_CUE",
      detail: `matched script-cue phrase: "${cue}"`,
    };
  }

  const known = [ctx.studentLine, ...ctx.studentAttempts].map(normalizeWords);
  COACH_QUOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COACH_QUOTE_RE.exec(speech)) !== null) {
    const quoted = m[1] ?? m[2] ?? "";
    if (wordCount(quoted) >= 4) {
      const norm = normalizeWords(quoted);
      if (!known.some((k) => k.includes(norm))) {
        return {
          ok: false,
          reason: "CONTAINS_SCRIPTED_QUOTE",
          detail: `quoted words not from the student: "${quoted}"`,
        };
      }
    }
  }

  if (ctx.counterpartLine) {
    const voiced = findSharedSpan(
      normalizeWords(speech),
      ctx.counterpartLine,
      6,
    );
    if (voiced) {
      return {
        ok: false,
        reason: "VOICES_COUNTERPART",
        detail: `voices the other party's words: "${voiced}"`,
      };
    }
  }

  if (speech.length > MAX_COACH_SPEECH_LENGTH) {
    return {
      ok: false,
      reason: "TOO_LONG",
      detail: `length ${speech.length} exceeds MAX_COACH_SPEECH_LENGTH (${MAX_COACH_SPEECH_LENGTH})`,
    };
  }
  return { ok: true };
}

/**
 * True when a student attempt merely repeats the coach's demonstration:
 * a contiguous 8+ word shared span, OR 70%+ of the demonstration's tokens
 * present in an attempt no longer than 1.3x the demonstration.
 *
 * PROVISIONAL UNTIL CALIBRATED. FALSE-POSITIVE RISK, documented honestly: a
 * student who legitimately lands on the same key nouns in a similarly short
 * line will occasionally be flagged. That tradeoff is chosen DELIBERATELY,
 * as in the tip rejector: a flagged honest attempt costs one more try; an
 * unflagged parrot would let the coach's words score as the student's.
 */
export function isParrotOf(attempt: string, demonstration: string): boolean {
  const attemptNorm = normalizeWords(attempt);
  const demoTokens = normalizeWords(demonstration).split(" ").filter(Boolean);
  const attemptTokens = attemptNorm.split(" ").filter(Boolean);
  if (demoTokens.length === 0 || attemptTokens.length === 0) return false;

  if (findSharedSpan(attemptNorm, demonstration, 8)) return true;

  const attemptSet = new Set(attemptTokens);
  const hits = demoTokens.filter((t) => attemptSet.has(t)).length;
  return (
    hits / demoTokens.length >= 0.7 &&
    attemptTokens.length <= demoTokens.length * 1.3
  );
}

// Reference COMPETENCIES so a future competency added to the catalog with
// no library coverage is caught at review time, not only by the verifier's
// runtime assertion.
void COMPETENCIES;

/** PROVISIONAL UNTIL CALIBRATED — a 10-word verbatim run is reuse, not coincidence. */
export const RECYCLE_SPAN_WORDS = 10;

/**
 * Phase 23 L6: true when an attempt reuses, verbatim, the student's own words
 * from ANOTHER leg (a different moment, a different prompt): a contiguous
 * RECYCLE_SPAN_WORDS-word span shared with any of `earlier`. Deterministic,
 * never a model call. A recycled answer does not answer this moment's prompt,
 * so `coach.ts` forces it unacceptable and scores it 1. Reuse WITHIN a leg is
 * expected (each try builds on the last) and is not checked here.
 */
export function isRecycledFrom(attempt: string, earlier: readonly string[]): boolean {
  const attemptNorm = normalizeWords(attempt);
  return earlier.some((e) => findSharedSpan(attemptNorm, normalizeWords(e), RECYCLE_SPAN_WORDS) !== null);
}
