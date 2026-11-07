/**
 * Finance-interview grading: the rubric extras and the evaluator addendum.
 *
 * Criteria sources (lib/finance-interview/sources.ts):
 * - BIWS / Wall Street Prep / Vault: technical accuracy, walking through the
 *   statements and valuation in order, mental-math fluency, and the fit story.
 * - Wall Street Prep paper LBO: the step order (entry, S&U, FCF, exit, MOIC /
 *   IRR) and rule-of-thumb IRR; rounding to convenient numbers is fine.
 * - Mergers & Inquisitions stock pitch and CFA Research Challenge: a call and
 *   target up front, a variant view, hard catalysts, a valuation that produces
 *   the target, thesis-specific risks, handling of Q&A.
 *
 * The addendum reuses what fixed grading in the consulting study
 * (docs/interviews/case-interview-validity.md): evidence before verdict, the
 * two-question step test, explicit arithmetic re-checks, tolerance bands, and
 * a cap when the conclusion had to be asked for.
 */

import type { RubricDimension } from "@/lib/engine/types";

/**
 * Rubric extras beyond the shared four and `process_rigor` (added by the
 * factory). Keys are global across types, so they are generic words.
 */
export const FINANCE_RUBRIC_EXTRAS: RubricDimension[] = [
  {
    key: "technical_accuracy",
    label: "Technical accuracy",
    description:
      "Correct accounting and valuation concepts, and numbers (IRR, MOIC, implied values) inside the accepted range, with the math shown.",
  },
  {
    key: "commercial_judgment",
    label: "Commercial judgment",
    description:
      "A clear investment view — buy or sell, do the deal or not — backed by drivers, risks and market awareness.",
  },
];

/**
 * Appended AFTER the engine's shared problem-interview evaluator rules
 * (`buildProblemEvaluatorRules`), which already state the step statuses, the
 * process_rigor guide and the outcome format, and read the per-session
 * `problem_interview` block (facts, exhibits with key insights,
 * `reference_notes` with the TOLERANCE band, `graded_framework`,
 * `interviewer_events`). process_rigor is re-derived in code from the steps.
 */
export const FINANCE_EVALUATOR_ADDENDUM = `
FINANCE INTERVIEW — TYPE RULES (these refine the problem-interview rules above)
This was a finance interview in the style of investment banking, private equity
or equity research: a short fit question, then ONE problem — a technical
walk-through, a paper LBO, a stock pitch, or a market / deal discussion —
worked out loud without a calculator, and a brief close. Grade the way finance
interviewers say they grade: technical accuracy, mental-math fluency, a clear
order of reasoning, market awareness, and a defensible view.

DECIDING EACH STEP
Decide every step's status BEFORE you write any score. For each step of
graded_framework, in order, answer two questions:
  Q1. Is there candidate evidence that FULLY meets the step's "counts as hit
      when" criteria — including any arithmetic it requires? If NO, the step
      is "missed" — stop. A thin or one-line reply does not meet the
      criteria, even when it answers a nudge.
  Q2. If YES: did the interviewer nudge that step BEFORE the first such
      evidence? Nudges are in interviewer_events, and are also visible in the
      transcript as an interviewer question that opens the door to that step
      (e.g. "What does that work out to as an annual return?" before any IRR
      was given, or "So what would you actually do with the stock?" before
      any call). If YES the step is "prompted", otherwise "hit".
A nudge in interviewer_events only rules out "hit". It never makes a step
"prompted" by itself: after a nudge the step is "prompted" ONLY if the reply
meets the full criteria, otherwise it is "missed".
A step done only AFTER the candidate already gave the final answer does not
count as done in its place: e.g. inputs confirmed only after the IRR was
stated, or a price target stated only at the very end after the interviewer
asked for a call.

RE-CHECK THE ARITHMETIC — DO NOT TRUST THE NARRATION
You write the scores BEFORE the outcome, so do this audit FIRST, before any
score: list to yourself every number the candidate states and recompute each
one from the numbers they used and from the exhibits and facts — EVERY
intermediate figure, one by one, not just the totals. In a multi-year
projection check each year's figure separately (e.g. 70 × 0.75 = 52.5, not
50); a total that comes out right from wrong components is two cancelling
errors, not correct math. Write the checks in the step's note (e.g.
"8 × 50 = 400 ✓; 500 / 200 = 2.5× ✓; year 2: 62 × 0.75 = 46.5, said 45 ✗").
Rounding vs. error: rounding is announced or goes to a convenient number
("call it 45", "roughly 1,200"). A figure stated as the result of a
calculation that is simply wrong (62 × 0.75 = "45"; it is 46.5) is an
ARITHMETIC ERROR, not rounding, even when it is small. Any uncorrected
intermediate arithmetic error caps technical_accuracy_score at 3, even if
the final answer lands inside the band.
An IRR "method" names an anchor — "2x in five years is about 15%, 3x about
25%", the rule of 72 / 115, or compounding a rate. "2.9x, so somewhere
around 24%" with no anchor is a number with no method.
Then:
- A key figure outside the TOLERANCE band in reference_notes, left
  uncorrected, makes the step that produced it MISSED, however confident the
  delivery.
- IRR is never MOIC ÷ years and never (MOIC − 1) ÷ years; check it against
  the rule of thumb (2× in 5 years ≈ 15%, 2.5× ≈ 20%, 3× ≈ 25%; in 4 years
  2× ≈ 19%; rule of 72) or the exact value in reference_notes.
- A candidate who catches and fixes their own error is not penalized.
- For a stock or deal of the candidate's own choosing you cannot verify live
  market data: do not penalize facts the transcript does not contradict.
  Check internal consistency instead — upside % vs. price and target,
  multiple × metric vs. the target, implied multiple = price ÷ metric.

Write each processSteps object with its keys in THIS order, so the verdict
follows the evidence: {"key","evidenceQuote","note","status","timecodeSeconds"}.
The note says whether the evidence FULLY meets the criteria (with the
arithmetic check where there is math); the status must agree with the note.
If your note mentions ANY uncorrected error, omission or shortfall — "did
not", "omitted", "slip", "not correct", "outside the band", "no rule of
thumb", "rounded" for a figure that was simply miscalculated — the status is
NOT "hit": it is "missed" (or "prompted" only if a nudge came first and the
reply then fully met the criteria).
Count prompted and missed steps first, then apply the process_rigor guide.

TECHNICAL ACCURACY (technical_accuracy_score)
Grade against the TOLERANCE band in reference_notes, never exact match:
  5: final answer(s) inside the strong band, every intermediate figure right,
     the method shown (how IRR was estimated, which bridge items, which tax
     rate), concepts explained correctly.
  4: inside the strong band with the method shown, one small slip that does
     not change the answer, or a concept explained loosely.
  Before choosing 4 or 5, confirm your audit found ZERO uncorrected
  intermediate errors and a stated method for every estimate (e.g. an IRR
  anchor). One uncorrected wrong intermediate figure, however small, or one
  estimate with no method, means the score is at most 3.
  3: inside the acceptable band; OR inside the strong band but SLOPPY — an
     uncorrected intermediate arithmetic error that happens not to move the
     final answer much, two errors that cancel, a final number given with no
     method, or the right number for a wrong reason. A right final number
     reached sloppily is a 3, not a 4.
  2: outside the acceptable band on a key figure, or a conceptual error
     (adding cash in the EV bridge, IRR as MOIC ÷ years, depreciation as a
     cash outflow), with the rest mostly right.
  1: mostly wrong, or no numbers given where the problem required them.
For a candidate-choice stock pitch or deal, judge accuracy on finance concepts
and internal arithmetic only.

COMMERCIAL JUDGMENT (commercial_judgment_score)
FIRST find where the candidate's final view (do the deal or not; buy or
short and the target; good or bad deal; the "so what" of a technical) FIRST
appears. If it first appears in a reply to an interviewer question that came
after the candidate had stopped — "Would you do the deal?", "So what would
you do with the stock?", "So where do you come out?", or ANY nudge recorded
in interviewer_events for the step that holds the view (drivers_sanity in a
paper LBO, call_and_target in a stock pitch, takeaway in a deal discussion,
explain_why in a technical) — then commercial_judgment_score is AT MOST 3,
however good the answer. A view that had to be drawn out is a 3 at best.
Then:
  5: an unprompted, clear view tied to the numbers (e.g. "24% clears a 20%
     hurdle, so yes — but it relies on 50% EBITDA growth"), the main value
     drivers named, at least one specific risk and what would change the
     view, and awareness of the market context.
  4: a clear unprompted view with support, thin on risks or drivers.
  3: a view that had to be asked for, or one that is clear but generic.
  2: a hedge or a view that contradicts the candidate's own numbers.
  1: no view at all.
For a pure technical walk-through, "view" means the practical so-what — why
the result matters, when it is used, what it changes in a deal.

SHARED DIMENSIONS IN A FINANCE INTERVIEW
technical_accuracy and commercial_judgment carry the analysis and the view,
so (overriding the general note about content_score above):
- content_score: presentation — is the spoken reasoning in a clear order and
  easy to follow (signposting, numbers stated with units and $M), are fit
  answers specific ("why banking / why this firm"), did they answer what was
  asked. Do NOT require situation-action-result story structure for the
  problem part.
- behavioral_score: composure under pressure and pushback, owning and fixing
  mistakes, conviction without arrogance, coachability when the interviewer
  questions a number, professional judgment. Being nudged is not a
  behavioral penalty — that cost belongs to process_rigor only.

STRENGTHS / GROWTH AREAS
Name the moment ("When you got to the exit equity…", "On your catalyst…").
At least one growth area must reference the weakest process step unless
every step was hit. Quote numbers the candidate actually said and, where they
were wrong, the corrected figure. Never reveal facts or exhibits the
candidate did not ask for.
`.trim();
