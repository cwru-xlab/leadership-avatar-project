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
 * Appended AFTER the engine's shared problem-interview evaluator rules
 * (`buildProblemEvaluatorRules` on loop/problem-engine), which already state
 * the step statuses, PROCESS_RIGOR_SCORING_GUIDE and the outcome format, and
 * read the per-session `problem_interview` block (facts, exhibits with key
 * insights, `reference_notes`, `graded_framework`, `interviewer_events`).
 *
 * What this adds is what the grading study showed the shared rules need for
 * cases (docs/interviews/case-interview-validity.md):
 * - a two-question procedure per step, so a thin reply to a nudge is
 *   "missed", not "prompted";
 * - evidence-first key order inside processSteps, so the verdict follows the
 *   evidence (the model otherwise marked wrong arithmetic "hit");
 * - arithmetic re-checking and tolerance-band grading for `quantitative`;
 * - a cap on `synthesis` when the recommendation had to be asked for;
 * - what the shared content/behavioral dimensions mean in a case.
 */
export const CASE_EVALUATOR_ADDENDUM = `
CONSULTING CASE INTERVIEW — TYPE RULES (these refine the problem-interview rules above)
This was a consulting case interview: a short fit question, ONE case (a
business scenario, a market-sizing estimate, or a brainteaser) worked out
loud, and a brief close. Grade the way consulting firms say they grade
(CWRU/Vault: leadership, analytical ability, presentation, energy; clear
logical reasoning and realistic assumptions. BCG/Bain/McKinsey/Oliver Wyman:
structure, thoughtful questions, data and quick math, identifying what
matters, a recommendation tied to the key issues).

DECIDING EACH STEP
Decide every step's status BEFORE you write any score: the scores are derived
from the steps, not the other way round. For each step of graded_framework,
in order, answer two questions:
  Q1. Is there candidate evidence that FULLY meets the step's "counts as hit
      when" criteria? If NO, the step is "missed" — stop. A thin, partial or
      one-line reply does not meet the criteria, even when it answers a nudge:
      naming a single area is not a structure, and one question about price
      is not clarifying the objective.
  Q2. If YES: did the interviewer nudge that step BEFORE the first such
      evidence? Nudges are in interviewer_events, and are also visible in the
      transcript as an interviewer question that opens the door to that step
      (e.g. "How are you thinking about tackling this?" before any structure
      was given). If YES the step is "prompted", otherwise "hit".
Judge each step on the candidate's best evidence in the right phase: an early
half-attempt followed, before any nudge for that step, by a full version is a
hit. Order matters: clarifying questions or a structure that only appear
after the candidate has already committed to an answer do not make those
steps hits.
Check the arithmetic yourself. If a key calculation is off by more than about
10% (or by an order of magnitude) and the candidate does not correct it, the
analysis / calculation step is MISSED however well it was narrated.
A sanity check means comparing the result with an independent number or a
second method; listing sources of uncertainty is not a sanity check.
Write each processSteps object with its keys in THIS order, so the verdict
follows the evidence: {"key","evidenceQuote","note","status","timecodeSeconds"}.
The note says whether the evidence FULLY meets the criteria; the status must
agree with the note — if the note says it fell short, the status is "missed",
whether or not it followed a nudge.
Count prompted and missed steps first, then apply the process_rigor scoring
guide above exactly.

QUANTITATIVE (quantitative_score)
reference_notes states a TOLERANCE for every case with math. Grade against
it, not exact match:
  1. Recompute each calculation the candidate states from the numbers they
     used (e.g. 1.2 million × 6 = 7.2 million, not 72 million).
  2. Compare the candidate's key result (final estimate, break-even, profit
     impact, or the figure their conclusion rests on) with the tolerance bands.
  3. Inside the strong band with a narrated method and a sanity check or "so
     what": 4–5. Inside the acceptable band, or right with no check: 3.
     Outside the acceptable band, ANY uncorrected arithmetic or
     order-of-magnitude error in a step the result depends on, a misread
     exhibit, or a conclusion that contradicts the numbers: 1–2 — however good
     the structure and assumptions were (those belong to process_rigor).
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
support but thin on risks or next steps. 3: a recommendation buried at the end
of a recap, or one that had to be asked for. 2: a recap with a vague or hedged
non-decision. 1: no recommendation or final answer at all. For estimates and
brainteasers "recommendation" means committing to a final number or answer.

SHARED DIMENSIONS IN A CASE
For this type quantitative and synthesis carry the analysis and the answer,
so (overriding the general note about content_score above):
- content_score: presentation — is the spoken reasoning organized and easy to
  follow (signposting, numbers stated with units), are fit answers specific,
  did they listen and answer what was asked. Do NOT require
  situation-action-result story structure for the case part.
- behavioral_score: composure under ambiguity and pressure, energy and drive
  (driving the case rather than waiting to be led), coachability when the
  interviewer redirects or questions a number, professional judgment. Fit
  answers count here too. Being nudged is not a behavioral penalty — that
  cost belongs to process_rigor only.

STRENGTHS / GROWTH AREAS FOR A CASE
Name the case moment ("When you laid out revenue vs. cost…", "On the route
economics exhibit…"). At least one growth area must reference the weakest
process step unless every step was hit. Quote numbers the candidate actually
said. Never reveal facts or exhibits the candidate did not ask for.
`.trim();
