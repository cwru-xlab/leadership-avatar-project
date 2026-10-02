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
 * mark, an effect-on-viewer claim). Escalating the prompt a second time has
 * no track record of working; this module is the enforcement mechanism that
 * does not depend on the model choosing to comply.
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
 * measures. This is a FINITE, CURATED blocklist of phrasings real evaluator
 * runs actually produced, not an attempt at exhaustive semantic detection —
 * see this file's header for why a blocklist is the chosen tradeoff. Append
 * new observed failures here as they are found. */
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
  | "forbidden-phrase";

export interface BodySignalViolation {
  field: string;
  sentence: string;
  reason: BodySignalViolationReason;
  phrase?: string;
}

function sentenceViolation(sentence: string): BodySignalViolation | null {
  const lower = sentence.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      return { field: "", sentence, reason: "forbidden-phrase", phrase };
    }
  }
  if (mentionsBodySignal(sentence) && !sentence.trim().endsWith("?")) {
    return { field: "", sentence, reason: "missing-question-mark" };
  }
  return null;
}

/** One narrative text field this validator inspects, with a getter/setter so
 * `findBodySignalWordingViolations`/`sanitizeBodySignalWording` can share one
 * field-enumeration instead of hand-listing fields twice. */
interface FieldRef {
  field: string;
  get: () => string | null;
  set: (value: string | null) => void;
}

function fieldsOf(report: StructuredReport): FieldRef[] {
  const refs: FieldRef[] = [];

  report.strengths.forEach((s, i) => {
    refs.push({
      field: `strengths[${i}].detail`,
      get: () => s.detail,
      set: (v) => {
        s.detail = v ?? "";
      },
    });
  });

  report.growth_areas.forEach((g, i) => {
    refs.push({
      field: `growth_areas[${i}].detail`,
      get: () => g.detail,
      set: (v) => {
        g.detail = v ?? "";
      },
    });
  });

  refs.push({
    field: "category_notes.visual",
    get: () => report.category_notes.visual,
    set: (v) => {
      report.category_notes.visual = v;
    },
  });
  refs.push({
    field: "category_notes.behavioral",
    get: () => report.category_notes.behavioral,
    set: (v) => {
      report.category_notes.behavioral = v;
    },
  });

  report.rubric_notes.forEach((r, i) => {
    refs.push({
      field: `rubric_notes[${i}].note`,
      get: () => r.note,
      set: (v) => {
        r.note = v ?? "";
      },
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
      const violation = sentenceViolation(sentence);
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
      if (sentenceViolation(sentence)) {
        strippedCount += 1;
      } else {
        kept.push(sentence);
      }
    }
    const rejoined = kept.join(" ").trim();
    ref.set(rejoined.length > 0 ? rejoined : null);
  }

  return { report: clone, strippedCount };
}
