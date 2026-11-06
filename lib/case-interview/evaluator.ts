/**
 * Case-interview grading: the rubric extras, the evaluator addendum, and the
 * per-session problem brief the evaluator reads.
 *
 * Criteria sources:
 * - CWRU / Vault: leadership, analytical ability, presentation, energy;
 *   communication, critical thinking, listening, responding quickly,
 *   summarizing clearly; creative thinking with realistic assumptions.
 * - BCG: structuring, thoughtful questions, data analysis and quick
 *   calculations, identifying the most important factors, clear logic.
 * - Bain: structure, reasoning, sharing calculations, responding to new
 *   information, adapting to interviewer cues.
 * - Oliver Wyman: use numbers and double-check them; a recommendation that
 *   ties back to the key issues.
 * - McKinsey: problem solving — structuring, quantitative reasoning, business
 *   judgment, synthesis.
 */

import {
  PROCESS_RIGOR_DIMENSION,
  PROCESS_RIGOR_SCORING_GUIDE,
  type ProblemQuestion,
  type ProcessFramework,
} from "@/lib/problem-interview/types";

/**
 * Consulting's rubric extras beyond the shared four and the shared
 * `process_rigor` (which the factory adds for every problem interview).
 * Keys are global across types (lib/mastery/competencies.ts groups them), so
 * they are deliberately generic words, not case-prefixed.
 */
export const CASE_RUBRIC_EXTRAS = [
  {
    key: "quantitative",
    label: "Quantitative analysis",
    description:
      "Math accuracy, realistic assumptions, sanity checks, and reading the exhibits for what matters.",
  },
  {
    key: "synthesis",
    label: "Synthesis & recommendation",
    description:
      "An answer-first recommendation backed by the key facts, with risks and next steps.",
  },
] as const;

/**
 * Appended to the shared interview evaluator prompt for the consulting type.
 * Session-constant; everything case-specific arrives in the user message's
 * `problem_context` block built by `buildCaseEvaluationBrief`.
 */
export const CASE_EVALUATOR_ADDENDUM = `
CONSULTING CASE INTERVIEW — ADDITIONAL GRADING RULES
This session is a consulting case interview, not a behavioral interview. It has
three parts: a short fit question or two, ONE case (a business scenario, a
market-sizing estimate, or a brainteaser) that the candidate works out loud
with the interviewer, and a brief close. The user message carries a
problem_context block: the case prompt, the facts the interviewer could
release, the exhibits with what a strong candidate reads from them, a
benchmark answer with an explicit tolerance, the method's steps, and the
nudges the interviewer issued. Use it as a REFERENCE, never as an answer key:
a well-reasoned different conclusion can score well.

Grade the way consulting firms say they grade (CWRU/Vault: leadership,
analytical ability, presentation, energy; clear logical reasoning and
realistic assumptions. BCG/Bain/McKinsey/Oliver Wyman: structure, thoughtful
questions, data and quick math, identifying what matters, a recommendation
tied to the key issues).

THE PROCESS STEPS (outcome.processSteps)
Decide every step's status BEFORE you write any score: the scores below are
derived from the steps, not the other way round. For each step of the method
in problem_context, in order, answer two questions:
  Q1. Is there candidate evidence that FULLY meets the step's "Hit when"
      criteria? If NO, the step is "missed" — stop. A thin, partial or
      one-line reply does not meet the criteria, even if it was the answer to
      a nudge: naming a single area is not a structure, and one question about
      price is not clarifying the objective.
  Q2. If YES: did the interviewer ask a nudge-like question for that step
      BEFORE the first such evidence? Nudges are listed under nudges_issued,
      and are also visible in the transcript as an interviewer question that
      opens the door to that step (e.g. "How are you thinking about tackling
      this?" before any structure was given). If YES the step is "prompted",
      otherwise "hit". Doing it well after a nudge is prompted, never hit.
- not_applicable: ONLY when the session ended before the step could be
  reached for reasons outside the candidate's process (the interviewer ran out
  of time). Never use it to excuse a skipped step.
Judge each step on the candidate's best evidence in the right phase: an early
half-attempt followed, before any nudge for that step, by a full version is a
hit. But order matters: clarifying questions or a structure that only appear
after the candidate has already committed to an answer do not make those
steps hits.
Check the arithmetic yourself. If a key calculation is off by more than about
10% (or by an order of magnitude) and the candidate does not correct it, the
analysis / calculation step is MISSED however well it was narrated.
A sanity check means comparing the result with an independent number or a
second method; listing sources of uncertainty is not a sanity check.
The evidenceQuote must be the candidate's own words, verbatim from the
transcript; "" when missed.

Then set process_rigor_score from the counts of prompted and missed steps,
exactly as this guide says — count first, then apply it:
${PROCESS_RIGOR_SCORING_GUIDE}

QUANTITATIVE (quantitative_score)
Grade against the TOLERANCE written in problem_context.benchmark, not exact
match. Procedure:
  1. Recompute each calculation the candidate states from the numbers they
     used (e.g. 1.2 million × 6 = 7.2 million, not 72 million).
  2. Compare the candidate's key result (final estimate, break-even, profit
     impact, or the figure their conclusion rests on) with the tolerance bands.
  3. Score: inside the strong band with a narrated method and a sanity check
     or "so what": 4–5. Inside the acceptable band, or right with no check: 3.
     Outside the acceptable band, ANY uncorrected arithmetic or
     order-of-magnitude error in a step the result depends on, a misread
     exhibit, or a conclusion that contradicts the numbers: 1–2 — however
     good the structure and assumptions were (those belong to process_rigor).
A candidate who catches and fixes their own error is not penalized for it.
If the case had no quantitative component (a non-numeric brainteaser) and the
candidate did no math, return null.

SYNTHESIS (synthesis_score)
FIRST look at what came right before the candidate's final recommendation or
answer. If it was the interviewer asking for one ("What would you tell the
CEO?", "So where do you land?", or any nudge for the last method step), the
synthesis_score is AT MOST 3, however polished the answer. Then:
5: unprompted, answer-first recommendation ("I'd recommend…"), 2–3 supporting
facts from the case, at least one risk and one next step. 4: answer-first with
support but thin on risks or next steps. 3: a recommendation buried at the end of a
recap. A recommendation given only in reply to the interviewer asking for one
(e.g. "What would you tell the CEO?") is capped at 3, however good it is. 2: a recap with a vague or hedged non-decision. 1: no recommendation
or final answer at all. For estimates and brainteasers "recommendation" means
committing to a final number or answer and saying how confident they are.

SHARED DIMENSIONS IN A CASE
- content_score: presentation — is the candidate's spoken reasoning organized
  and easy to follow (signposting, "first/second/third", numbers stated with
  units), are fit answers specific, did they listen and answer what was asked.
  Do NOT require situation-action-result story structure for the case part.
- behavioral_score: composure under ambiguity and pressure, energy and drive
  (driving the case forward rather than waiting to be led), coachability when
  the interviewer redirects or questions a number, and professional judgment.
  Fit answers count here too.
- A candidate who was nudged is not marked down on behavioral for having been
  nudged — that cost belongs to process_rigor only.

STRENGTHS / GROWTH AREAS FOR A CASE
Name the case moment ("When you laid out revenue vs. cost…", "On the route
economics exhibit…"). At least one growth area must reference the weakest
process step unless every step was hit. Quote numbers the candidate actually
said. Never reveal facts or exhibits the candidate did not ask for.

OUTCOME FIELDS
- outcome.questionId and outcome.frameworkKey: copy from problem_context.
- outcome.processSteps: a JSON-encoded array (a string), one object per
  method step in order, with the keys written in THIS order so the verdict
  follows the evidence:
  {"key","evidenceQuote","note","status","timecodeSeconds"}.
  evidenceQuote: the candidate's best evidence for the step, verbatim ("" if
  none). note: one sentence of coaching that says whether that evidence FULLY
  meets the step's "Hit when" criteria. status: must agree with the note — if
  the note says the evidence fell short (thin, partial, wrong arithmetic, no
  real check), the status is "missed", whether or not it followed a nudge.
  timecodeSeconds: the [m:ss] stamp of the evidence turn converted to seconds,
  or null when missed.
`.trim();

/** Seconds → "m:ss", matching `formatTranscriptForEvaluator`. */
function stamp(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface IssuedNudge {
  stepKey: string;
  /** Seconds from session start of the interviewer turn that carried the nudge. */
  atSeconds: number;
}

/**
 * The per-session `problem_context` block for the evaluator's user message.
 * Lists the method steps with their evidence criteria, so the evaluator
 * grades against the exact steps the report will show.
 */
export function buildCaseEvaluationBrief(
  question: ProblemQuestion,
  framework: ProcessFramework,
  nudgesIssued: IssuedNudge[] = [],
): string {
  const facts = question.interviewerFacts.map((f) => `  - ${f}`).join("\n");
  const exhibits = (question.exhibits ?? [])
    .map((ex) => {
      const rows = ex.rows.map((r) => `      ${r.join(" | ")}`).join("\n");
      return [
        `  - ${ex.id}: ${ex.title}${ex.caption ? ` (${ex.caption})` : ""}`,
        `      ${ex.columns.join(" | ")}`,
        rows,
        `      key insight: ${ex.keyInsight}`,
      ].join("\n");
    })
    .join("\n");
  const steps = framework.steps
    .map((s, i) => `  ${i + 1}. ${s.key} — ${s.label}. Hit when: ${s.evidenceCriteria}`)
    .join("\n");
  const nudges = nudgesIssued.length
    ? nudgesIssued.map((n) => `  - ${n.stepKey} at [${stamp(n.atSeconds)}]`).join("\n")
    : "  (none recorded)";

  return `problem_context:
questionId: ${question.id}
frameworkKey: ${framework.key}
family: ${question.family}
title: ${question.title}
difficulty: ${question.difficulty}
case_prompt: ${question.prompt}
interviewer_facts (released only if asked):
${facts}
exhibits:
${exhibits || "  (none)"}
benchmark (reference, not an answer key): ${question.strongAnswerNotes}
method: ${framework.label}
steps:
${steps}
nudges_issued (from session markers):
${nudges}
${PROCESS_RIGOR_DIMENSION.key}: ${PROCESS_RIGOR_DIMENSION.description}`;
}
