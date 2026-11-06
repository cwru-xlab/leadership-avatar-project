/**
 * Product-management interview: persona, preset copy, rubric extras and the
 * evaluator addendum. Content only — the problem-interview engine composes
 * these into a type record via `makeProblemInterviewTypeConfig`.
 *
 * How FAANG PM interviewers grade (sources in docs/interviews/pm-interview-validity.md):
 *   - Holistic, not checklist: Google and Meta interviewer guidance as
 *     reported by Exponent / IGotAnOffer / Product Alliance, and McDowell &
 *     Bavaro, "Cracking the PM Interview", all stress that a framework is
 *     NECESSARY but not SUFFICIENT — reciting CIRCLES with generic content
 *     does not pass.
 *   - Meta splits "product sense" (user empathy, insight, creative but
 *     grounded solutions) from "analytical thinking / execution" (metrics,
 *     root cause, tradeoffs) — mirrored by our two extra dimensions.
 *   - Common reasons for a "no hire" in public debriefs: generic personas,
 *     jumping to features, listing features without prioritizing, no
 *     tradeoffs, no recommendation, and for metric drops, guessing causes
 *     without segmenting the data.
 */

import type { RubricDimension } from "@/lib/engine/types";

export const PM_INTERVIEW_SLUG = "product-management";

/** The live interviewer. Interpolated as {INTERVIEWER_PERSONA}. */
export const PM_INTERVIEWER_PERSONA =
  "a senior product leader at a large consumer technology company who has run " +
  "hundreds of product manager interviews. You are friendly but neutral and " +
  "hard to read: you answer clarifying questions crisply, hand over data only " +
  "when it is asked for, let the candidate drive the structure, and never coach " +
  "or hint at a framework. When the candidate skips something a strong PM would " +
  "cover, you ask one short, open question about it — the way a real " +
  "interviewer probes — and then let them continue";

export const PM_PRESET_LABEL = "Product Management Interview";

export const PM_PRESET_DESCRIPTION =
  "A FAANG-style PM interview: a short fit question, then one deliberately open " +
  "product problem — design, improvement, metrics, estimation or strategy — " +
  "that you structure and solve out loud.";

export const PM_QUESTION_AREAS = [
  "Why product management",
  "One open product problem",
  "Your questions",
];

/**
 * Stage timing for the ~30-minute session the engine's live prompt follows.
 * Fit ~4 min, one product problem ~22 min, questions and close ~4 min.
 */
export const PM_STAGE_MINUTES = { fit: 4, problem: 22, close: 4 } as const;

/**
 * Briefing step copy (progressive disclosure: one headline and three short
 * bullets up front; detail lives in `more`).
 */
export const PM_BRIEFING = {
  headline: "One open product problem, solved out loud",
  bullets: [
    "About 30 minutes: a quick fit question, then one product problem.",
    "The prompt will be vague on purpose. Ask questions and state your assumptions.",
    "Your report checks each step of your process, not just your answer.",
  ],
  more:
    "Real PM interviews at large tech companies grade how you get to an answer. " +
    "Your interviewer will answer clarifying questions and share data if you ask " +
    "for it, but won't tell you what to do next. If you skip something, they may " +
    "ask a short question about it; your report shows those steps as prompted.",
} as const;

/** Rubric dimensions the PM type adds beyond the shared four and `process_rigor`. */
export const PM_RUBRIC_EXTRAS: RubricDimension[] = [
  {
    key: "product_sense",
    label: "Product sense",
    description:
      "User empathy, insightful needs, and creative solutions grounded in the user and goal.",
  },
  {
    key: "analytical_judgment",
    label: "Analytical judgment",
    description:
      "Clear prioritization criteria, well-chosen metrics, sound numbers, and honest tradeoffs.",
  },
];

/**
 * Appended by the engine to the shared problem-interview evaluator. Tuned to
 * how FAANG PM interviewers grade. Does NOT restate the step statuses or the
 * process_rigor bands — those live in `PROCESS_RIGOR_SCORING_GUIDE`.
 */
export const PM_EVALUATOR_ADDENDUM = `
PRODUCT-MANAGEMENT GRADING (how FAANG PM interviewers actually decide)
Grade holistically. Structure is NECESSARY but NOT SUFFICIENT: a candidate who
names every step but fills it with generic content has not shown product
sense, and you must say so. Specifically:

- Generic personas ("busy professionals", "millennials", "everyone") or a single
  persona chosen without comparing alternatives are a weakness in product_sense,
  and do NOT count as hitting the customer step.
- Listing features without first stating needs, or without choosing among needs
  by explicit criteria, is the most common failure. Call it out by name in a
  growth area, with the timecode where the candidate jumped to features.
- "Needs" phrased as features ("they need an app that…") are features, not needs.
- No tradeoffs = no judgment. If the candidate never names a downside of the
  option they favor, analytical_judgment cannot exceed 3.
- No explicit recommendation at the end = the summary step is missed, however
  good the middle was.
- Metric-drop questions: guessing causes without SEGMENTING the data (platform,
  region, cohort, funnel stage) is the classic failure; the diagnosis step is
  missed, and analytical_judgment cannot exceed 2, even if the guessed cause
  happens to be right. Data revealed in an exhibit only counts if the candidate
  asked for the breakdown and then used it.
- Estimation: credit the decomposition and stated assumptions over the final
  number; an answer within ~2-3x of the benchmark with sound structure is good,
  a lucky number with no structure is not.
- Interviewer nudges: when the interviewer asks a short open question about a
  skipped step (e.g. "Who do you picture using this?") and the candidate only
  then covers it, that step is PROMPTED, not hit. Look for these turns.

product_sense_score (1-5): 5 = specific, insightful segments and needs that
reveal real user empathy, a deliberate choice, and solutions that are creative
yet clearly serve the chosen need; 3 = reasonable but predictable segments,
needs and solutions; 1 = no user perspective, features for their own sake.
For estimation questions, score product_sense on how well the candidate's
segmentation reflects real user behavior.

analytical_judgment_score (1-5): 5 = explicit prioritization criteria, a
well-reasoned metric set with a counter-metric, correct arithmetic or a
segmented diagnosis, and honest tradeoffs that shape the recommendation;
3 = some criteria or tradeoffs, but thin or not acted on; 1 = no criteria,
no tradeoffs, conclusions asserted.

content_score keeps its usual meaning (clarity, completeness, conciseness of
what was said); behavioral_score covers composure, listening, and how the
candidate used the interviewer's answers and data.

Use strongAnswerNotes only as a reference for what a strong answer covers. A
different, well-reasoned path can score just as well; never mark a step missed
because the candidate chose a different segment or solution than the notes.
`.trim();
