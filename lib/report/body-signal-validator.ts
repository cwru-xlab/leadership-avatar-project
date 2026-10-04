/**
 * Code-side backstop for the describe-then-ask body-signal wording rules
 * both evaluator prompts already state in prose (12-04, `INTERVIEW_EVALUATOR_PROMPT`
 * / `SCENARIO_EVALUATOR_PROMPT`): every body finding (gesture, hands-near-face,
 * posture drift, fidgeting, phone-in-frame) must describe the motion and ask a
 * question, never assert an effect on the interviewer or infer an internal
 * state no sensor measured.
 *
 * WHY THIS EXISTS AS CODE, NOT MORE PROMPT TEXT: commit 0ae1f40 (12-04) already
 * added these exact rules in prose — a question-mark requirement and a
 * verbatim list of forbidden phrasings — after a live run violated the
 * ORIGINAL (looser) rule text. A second live run (12-08 Task 1 checkpoint,
 * Defect C) violated the STRENGTHENED rule text anyway ("...with no visible
 * hand movement or gesturing, which can seem flat over video" — no question
 * mark, an effect-on-viewer claim). A THIRD live run (12-08 Task 1
 * checkpoint, Defect G) violated the CODE backstop itself: "gesture use was
 * at times excessive and hand movements near his face may have distracted
 * from his responses" landed in `overall_summary`, a field the first
 * version of this module never scanned, with a HEDGED effect claim ("may
 * have distracted from") that was not on the exact-phrase list either.
 * Escalating the prompt has no track record of working, and an
 * exact-phrase blocklist alone cannot keep up with hedged rephrasings of
 * the same claim — see `EFFECT_CLAIM_STEMS` below for the structural rule
 * added in response, and `fieldsOf` for the widened field coverage.
 *
 * Pure functions only — no network calls, no `next/server`, nothing. Both
 * evaluator modules (`lib/interview/evaluation.ts`, `lib/scenario/evaluation.ts`)
 * call `sanitizeBodySignalWording` on the parsed `StructuredReport` before it is
 * composed into markdown or returned to the caller.
 */

import type { StructuredReport } from "./structured";

/** Substrings (lowercase-matched) whose presence in ANY narrative field means
 * a body finding is describing an effect on the interviewer/viewer or
 * inferring an internal state — neither of which any sensor in this pipeline
 * measures. This is a FINITE, CURATED blocklist of EXACT phrasings real
 * evaluator runs actually produced — kept for precision on known incidents,
 * but NOT the primary defense against new phrasings of the same claim; see
 * `EFFECT_CLAIM_STEMS` below for that. Append new observed failures here as
 * they are found. */
const FORBIDDEN_PHRASES: string[] = [
  "can seem flat over video",
  "which can obscure facial expressions",
  "signal uncertainty",
  "to reinforce key points and signal engagement",
  "this pulls attention away",
  "which can obscure",
  "you were distracted",
  "checking your phone",
  "checking a phone",
];

/**
 * STRUCTURAL rule, preferred over growing `FORBIDDEN_PHRASES` for every new
 * hedged rephrasing (12-08 Task 1 checkpoint, Defect G: "may have
 * distracted from his responses" was not on the exact-phrase list, but
 * hedging an effect claim with "may have"/"might"/"could" does not make it
 * a measurement). These are VERB STEMS for claiming an effect on the
 * interviewer/viewer or the candidate's own internal state — matched as
 * substrings so tense and hedging ("distracted" / "may have distracted" /
 * "could distract") all match the same stem — combined with
 * `mentionsBodySignal` so a legitimate, unrelated use of a word like
 * "reinforce" (e.g. praising how examples reinforced an argument) is never
 * flagged on its own. Still a curated list, not true semantic parsing —
 * the tradeoff this file's header already states — but one layer more
 * general than matching whole sentences verbatim. */
const EFFECT_CLAIM_STEMS: string[] = [
  "distract",
  "obscur",
  "pull attention",
  "pull away",
  "undermine",
  "disrupt",
  "reinforce",
  "come across",
  "read as",
  "convey",
  "project engagement",
  "project confidence",
  "signal uncertainty",
  "signal engagement",
  "signal confidence",
  "seem flat",
  "seem disengaged",
  "seem unprofessional",
  "seem unprepared",
];

/** Keywords (lowercase-matched substrings) that mark a sentence as a body
 * finding subject to the question-mark rule. Deliberately broad — a false
 * positive here only means a sentence that should have ended in "?" anyway
 * gets double-checked; a false negative lets a real violation through. */
const BODY_SIGNAL_KEYWORDS: string[] = [
  "gestur",
  "hand",
  "posture",
  "fidget",
  "phone",
  "wave",
  "waving",
  "arm",
  "shoulder",
  "slouch",
  "wrist",
  "finger",
];

function mentionsBodySignal(text: string): boolean {
  const lower = text.toLowerCase();
  return BODY_SIGNAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Splits narrative text into sentences, keeping terminal punctuation,
 * tolerant of text with no terminal punctuation at all (returned as one
 * "sentence"). Good enough for this blocklist's purposes — it does not need
 * to be a real sentence tokenizer, only to isolate the clause containing a
 * violation so the REST of a multi-sentence finding can survive. */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/(?<=[.?!])\s+/).filter((part) => part.length > 0);
}

export type BodySignalViolationReason =
  | "missing-question-mark"
  | "forbidden-phrase"
  | "effect-claim-stem";

export interface BodySignalViolation {
  field: string;
  sentence: string;
  reason: BodySignalViolationReason;
  phrase?: string;
}

function sentenceViolation(
  sentence: string,
  opts: { checkQuestionMark: boolean }
): BodySignalViolation | null {
  const lower = sentence.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      return { field: "", sentence, reason: "forbidden-phrase", phrase };
    }
  }
  // Structural rule (12-08 Task 1 checkpoint, Defect G): an effect-claim verb
  // stem ANYWHERE in a sentence that also mentions a body signal is a
  // violation regardless of hedging ("may have distracted" / "could
  // distract" / "distracted" all match the same stem). Gated on
  // `mentionsBodySignal` so an unrelated, legitimate use of e.g. "reinforce"
  // is never flagged on its own.
  if (mentionsBodySignal(sentence)) {
    for (const stem of EFFECT_CLAIM_STEMS) {
      if (lower.includes(stem)) {
        return { field: "", sentence, reason: "effect-claim-stem", phrase: stem };
      }
    }
  }
  // The question-mark rule is specific to a FINDING (describe-then-ask);
  // `opts.checkQuestionMark` is false for fields that are inherently
  // imperative/advisory rather than a finding (e.g. `growth_areas[].suggestion`
  // — "Notice when your hand moves toward your face" is correct advice, not
  // a finding missing its question mark). The forbidden-phrase/effect-claim
  // checks above still apply to those fields unconditionally.
  if (
    opts.checkQuestionMark &&
    mentionsBodySignal(sentence) &&
    !sentence.trim().endsWith("?")
  ) {
    return { field: "", sentence, reason: "missing-question-mark" };
  }
  return null;
}

/** One narrative text field this validator inspects, with a getter/setter so
 * `findBodySignalWordingViolations`/`sanitizeBodySignalWording` can share one
 * field-enumeration instead of hand-listing fields twice.
 *
 * `checkQuestionMark` (12-08 Task 1 checkpoint, Defect G) defaults to true —
 * most fields are findings subject to the full describe-then-ask contract.
 * Set false for fields that are inherently advisory rather than a finding
 * (currently only `growth_areas[].suggestion`); the forbidden-phrase and
 * effect-claim-stem checks still apply regardless. */
interface FieldRef {
  field: string;
  get: () => string | null;
  set: (value: string | null) => void;
  checkQuestionMark: boolean;
}

function fieldsOf(report: StructuredReport): FieldRef[] {
  const refs: FieldRef[] = [];

  // BUG FIX (12-08 Task 1 checkpoint, Defect G): a real evaluator run put an
  // effect claim in `overall_summary` — a field the first version of this
  // module never scanned at all. Every narrative field the evaluator
  // prompts actually let the model write free-form prose into is covered
  // below, not only the ones an earlier incident happened to hit.
  refs.push({
    field: "overall_summary",
    get: () => report.overall_summary,
    set: (v) => {
      report.overall_summary = v ?? "";
    },
    checkQuestionMark: true,
  });

  refs.push({
    field: "practice_next",
    get: () => report.practice_next,
    set: (v) => {
      report.practice_next = v ?? "";
    },
    checkQuestionMark: true,
  });

  report.strengths.forEach((s, i) => {
    refs.push({
      field: `strengths[${i}].detail`,
      get: () => s.detail,
      set: (v) => {
        s.detail = v ?? "";
      },
      checkQuestionMark: true,
    });
  });

  report.growth_areas.forEach((g, i) => {
    refs.push({
      field: `growth_areas[${i}].detail`,
      get: () => g.detail,
      set: (v) => {
        g.detail = v ?? "";
      },
      checkQuestionMark: true,
    });
    // Advisory, not a finding (12-08 Task 1 checkpoint, Defect G) — see
    // `FieldRef.checkQuestionMark`'s own doc comment.
    refs.push({
      field: `growth_areas[${i}].suggestion`,
      get: () => g.suggestion,
      set: (v) => {
        g.suggestion = v ?? "";
      },
      checkQuestionMark: false,
    });
  });

  refs.push({
    field: "category_notes.visual",
    get: () => report.category_notes.visual,
    set: (v) => {
      report.category_notes.visual = v;
    },
    checkQuestionMark: true,
  });
  refs.push({
    field: "category_notes.behavioral",
    get: () => report.category_notes.behavioral,
    set: (v) => {
      report.category_notes.behavioral = v;
    },
    checkQuestionMark: true,
  });
  // vocal/content are unlikely to carry a body-signal finding, but scanned
  // anyway — the whole point of this fix is to stop assuming which field
  // the next violation will land in.
  refs.push({
    field: "category_notes.vocal",
    get: () => report.category_notes.vocal,
    set: (v) => {
      report.category_notes.vocal = v;
    },
    checkQuestionMark: true,
  });
  refs.push({
    field: "category_notes.content",
    get: () => report.category_notes.content,
    set: (v) => {
      report.category_notes.content = v;
    },
    checkQuestionMark: true,
  });

  report.rubric_notes.forEach((r, i) => {
    refs.push({
      field: `rubric_notes[${i}].note`,
      get: () => r.note,
      set: (v) => {
        r.note = v ?? "";
      },
      checkQuestionMark: true,
    });
  });

  return refs;
}

/**
 * Pure, read-only. Returns every sentence across every narrative field that
 * violates the describe-then-ask body-signal contract, WITHOUT mutating
 * `report`. Used by assertions; `sanitizeBodySignalWording` below is the
 * enforcement path the evaluators actually call.
 */
export function findBodySignalWordingViolations(
  report: StructuredReport
): BodySignalViolation[] {
  const violations: BodySignalViolation[] = [];
  for (const ref of fieldsOf(report)) {
    const text = ref.get();
    if (!text) continue;
    for (const sentence of splitSentences(text)) {
      const violation = sentenceViolation(sentence, {
        checkQuestionMark: ref.checkQuestionMark,
      });
      if (violation) {
        violations.push({ ...violation, field: ref.field });
      }
    }
  }
  return violations;
}

/**
 * Pure. Returns a NEW `StructuredReport` (never mutates the input) with every
 * violating sentence removed from its field, and a count of how many
 * sentences were stripped so the caller can log it.
 *
 * MECHANISM CHOICE (12-08 Task 3 pre-sign-off, Defect C): strip-and-log over
 * reject-and-retry. A prompt-only escalation already failed once (see this
 * file's header), so a bare retry of the SAME prompt has no guaranteed
 * improvement — it would pay a full second model call for no better odds of
 * compliance. Stripping is deterministic, pays no extra latency or token
 * cost, and GUARANTEES the specific forbidden text never reaches the
 * student, which a retry cannot guarantee even once. The tradeoff: a
 * stripped finding can read as slightly truncated (a clause removed
 * mid-paragraph, or an empty field if every sentence in it violated), and
 * because the strip happens inside validation rather than as a thrown
 * error, a systemic prompt-following regression is visible only through the
 * caller's `console.warn`, never as a failed job a human would otherwise
 * notice looking at error rates. Callers MUST log the returned
 * `strippedCount` when nonzero, not swallow it.
 */
export function sanitizeBodySignalWording(report: StructuredReport): {
  report: StructuredReport;
  strippedCount: number;
} {
  const clone: StructuredReport = JSON.parse(JSON.stringify(report));
  let strippedCount = 0;

  for (const ref of fieldsOf(clone)) {
    const text = ref.get();
    if (!text) continue;
    const kept: string[] = [];
    for (const sentence of splitSentences(text)) {
      if (sentenceViolation(sentence, { checkQuestionMark: ref.checkQuestionMark })) {
        strippedCount += 1;
      } else {
        kept.push(sentence);
      }
    }
    const rejoined = kept.join(" ").trim();
    ref.set(rejoined.length > 0 ? rejoined : null);
  }

  // BUG FIX (12-09 Task 2, investigation of the 12-08 Task 3 sign-off's
  // "Excessive gesturing at times" / "Try this:" / no-question observation):
  // a growth area's `detail` can be reduced to an EMPTY string when every
  // sentence in it violated the describe-then-ask contract (the "empty
  // field" tradeoff this function's own header comment already documents).
  // `title` is NEVER validated or stripped — it is a short label, not a
  // finding — so leaving the growth area in place with a now-empty `detail`
  // renders exactly the real defect: a bare title plus
  // `ReportBody.tsx`'s unconditional "Try this: " suggestion line, with NO
  // question anywhere, reproducing the describe-then-ask violation the
  // stripping was meant to prevent, one level up in the same report.
  // Dropping the whole entry — never showing a half-populated one — is the
  // same omit-don't-default discipline this codebase already applies
  // elsewhere (REQ-51's "Measured from" row, `visualBodyLanguageBands`'s row
  // omission): a hollow finding is worse than no finding at all.
  clone.growth_areas = clone.growth_areas.filter(
    (g) => g.detail.trim().length > 0
  );

  return { report: clone, strippedCount };
}
