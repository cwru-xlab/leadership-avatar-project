/**
 * Data / product-analytics grading: the rubric extras and the evaluator
 * addendum. Public content — safe for the engine registry to import.
 *
 * Criteria sources (ANALYTICS_SOURCES):
 * - Meta Product Analytics loop (via Exponent / DataLemur / Prepfully):
 *   analytical reasoning (metrics, tradeoffs, experiment design — no single
 *   right answer) and analytical execution (statistics, hypothesis testing,
 *   statistical intuition over formulas); correctness AND communication.
 * - Kohavi/Tang/Xu: OEC + guardrails, trust checks (SRM) before reading
 *   lifts, novelty, interference, multiple testing, practical vs. statistical
 *   significance.
 * - Ace the Data Science Interview / Interview Query / Emma Ding: metric-drop
 *   order (clarify → data integrity → internal/external → segment →
 *   hypothesis → recommend); the classic failures (guessing a cause without a
 *   breakdown, "p = 0.03 means 97% it works", peeking, shipping on a
 *   post-hoc segment).
 *
 * The addendum layers on the engine's shared problem-interview rules
 * (`buildProblemEvaluatorRules`), which already define the step statuses,
 * PROCESS_RIGOR_SCORING_GUIDE and the outcome format. The engine also derives
 * the stored process_rigor from the step results in code, so this addendum
 * spends its words on getting the STEPS right. Techniques carried over from
 * the consulting study (docs/interviews/case-interview-validity.md): evidence
 * before verdict, the two-question step test, re-checking the arithmetic,
 * tolerance bands, and capping the decision score when it had to be asked for.
 */

import type { RubricDimension } from "@/lib/engine/types";

/**
 * Keys are global across types (lib/mastery/competencies.ts groups them), so
 * they are plain words, not analytics-prefixed.
 */
export const ANALYTICS_RUBRIC_EXTRAS: RubricDimension[] = [
  {
    key: "statistical_reasoning",
    label: "Statistical reasoning",
    description:
      "Correct statistics and arithmetic: power and sample size, reading effects with their uncertainty, trust checks, and numbers that hold up.",
  },
  {
    key: "business_judgment",
    label: "Business judgment",
    description:
      "Metrics that track real value, guardrails for what could go wrong, and a clear, sized decision the business could act on.",
  },
];

export const ANALYTICS_EVALUATOR_ADDENDUM = `
DATA / PRODUCT-ANALYTICS INTERVIEW — TYPE RULES (these refine the problem-interview rules above)
This was a product-analytics data-science interview: a short fit question, then
ONE analytics problem worked out loud — defining a metric, designing an A/B
test, reading an A/B test's results, or diagnosing why a metric moved. There is
no code execution: SQL and statistics are reasoned out loud. Grade the way
product-analytics interviewers grade (Meta's analytical reasoning / execution
rounds; Kohavi, Tang & Xu): structured thinking, statistical correctness,
business sense, and clear communication of uncertainty.

DECIDING EACH STEP
Decide every step's status BEFORE you write any score. For each step of
graded_framework, in order, answer two questions:
  Q1. Is there candidate evidence that FULLY meets the step's "counts as hit
      when" criteria? If NO, the step is "missed" — stop. A thin, partial or
      one-line reply does not meet the criteria, even when it answers a nudge:
      naming a metric is not defining it, saying "I'd check power" is not
      sizing the test, "maybe it's a bug" is not checking data integrity, and
      guessing a cause is not segmenting, and looking at a split and calling
      a beyond-chance imbalance "noise" is not a trust check — even right
      after a nudge, that step is "missed", never "prompted".
  Q2. If YES: did the interviewer nudge that step BEFORE the first such
      evidence? Nudges are listed in interviewer_events and also show in the
      transcript as an interviewer question that opens the door to the step
      (e.g. "How many users do you need?" before any sizing). If YES the step
      is "prompted", otherwise "hit".
A nudge only rules out "hit". It never makes a step "prompted" by itself: after
a nudge the step is "prompted" ONLY if the reply meets the full criteria,
otherwise it is "missed".
Judge each step on the candidate's best evidence in the right phase. Order
matters: for an experiment readout, trust checks that only appear AFTER the
candidate has already recommended shipping on the lift do not make
check_validity a hit; for a diagnosis, a breakdown requested only after the
candidate has committed to a cause does not rescue segment_and_locate.
A step whose criteria require a CORRECT number or interpretation is missed
when the candidate's version is wrong and never corrected: a sample size
outside the question's acceptable band, a duration shorter than one week, a
p-value read as "the probability the change works", or an imbalanced split
called "normal noise".
Write each processSteps object with its keys in THIS order, so the verdict
follows the evidence: {"key","evidenceQuote","note","status","timecodeSeconds"}.
The note says whether the evidence FULLY meets the criteria; the status must
agree with the note — if the note says it fell short, the status is "missed",
whether or not it followed a nudge.

STATISTICAL REASONING (statistical_reasoning_score)
reference_notes states a TOLERANCE for every question with numbers. Grade
against it, not exact match:
  1. Recompute every number the candidate states from the inputs they used
     (e.g. 16 × 0.2 × 0.8 / 0.01² = 25,600 per arm, not 2,560; 48,600 vs
     50,000 is 700 off an expected 49,300). A candidate who catches and fixes
     their own slip is not penalized.
  2. Compare the key result their conclusion rests on with the bands.
  3. Strong band, method narrated, uncertainty stated correctly: 4–5.
     Acceptable band, or right with no stated uncertainty: 3.
     Outside the acceptable band, an uncorrected arithmetic or
     order-of-magnitude error the conclusion depends on, a misread exhibit,
     OR any of these statistical errors: p-value read as the probability the
     hypothesis is true; stopping or deciding at the first significant peek;
     ignoring a sample ratio mismatch the data shows; reading a decaying
     (novelty) lift as the lasting effect; treating one post-hoc segment out of
     many as a real win; randomizing users where users interfere with each
     other without addressing it — 1–2, however good the structure was.
For a metric-definition question, statistical_reasoning is about the precision
of the computation (numerator, denominator, window, filters, dedup) and the
arithmetic on any exhibit; if the question had no numbers and the candidate did
no math, judge the precision of the definition.

BUSINESS JUDGMENT (business_judgment_score)
FIRST apply the cap. The last step of each framework is the decision:
validate_and_commit (metric definition), decision_rule (experiment design),
recommend_decision (readout), recommend_and_size (diagnosis). If
interviewer_events lists a nudge for that step, OR the turn right before the
candidate's final decision was the interviewer asking for one ("So what would
you tell the team?", "Where does that leave you?", "Which one would you put in
front of the team?"), business_judgment_score is AT MOST 3 — however good the
answer that followed. State the cap in rubric_notes when you apply it. Then:
5: an unprompted, clear decision (ship / don't / rerun / fix / which metric),
backed by the decisive facts, with the guardrail or tradeoff that shaped it
and the impact sized in users, orders or dollars. 4: clear decision with
support, but unsized or thin on tradeoffs. 3: a decision that had to be asked
for, or one buried in a recap. 2: hedged non-decision, or a decision that
optimizes a vanity or wrong metric (e.g. ship because orders rose while
revenue per user fell). 1: no decision at all, or one that contradicts the
data on screen.

SHARED DIMENSIONS
statistical_reasoning and business_judgment carry the analysis and the
decision, so (overriding the general note about content_score above):
- content_score: communication — is the reasoning organized and easy to
  follow, are numbers stated with units and denominators, is uncertainty
  explained in plain language a PM could act on, are fit answers specific.
  Do NOT require situation-action-result story structure for the problem.
- behavioral_score: composure with ambiguous data, driving the analysis
  (asking for the breakdowns they need rather than waiting), coachability
  when the interviewer questions a number, professional judgment. Being
  nudged is not a behavioral penalty — that cost belongs to process_rigor.

STRENGTHS / GROWTH AREAS
Name the moment ("When you saw 48,600 vs 50,000…", "On the funnel table…").
At least one growth area must reference the weakest process step unless every
step was hit. Quote numbers the candidate actually said. Never reveal facts or
exhibits the candidate did not ask for.
`.trim();
