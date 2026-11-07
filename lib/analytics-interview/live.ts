/**
 * Live-session copy for the data / product-analytics interview: the slug,
 * who the interviewer is, the picker description and the briefing. Public.
 *
 * The interviewer's conduct (facts only when asked, exhibits on request, one
 * neutral nudge per skipped step, never coach, markers) is generic machinery
 * in `lib/problem-interview/prompts.ts`; the persona below adds what that
 * prompt needs for analytics specifically — chiefly that exhibit numbers stay
 * on screen and are not read aloud (the PM study saw the live model read
 * exhibit values out; scripts/verify-analytics-interview-live.ts probes it).
 */

export const ANALYTICS_INTERVIEW_SLUG = "data-analytics";

export const ANALYTICS_TARGET_MINUTES = 30;

/** Minutes per stage of the ≈30-minute session. */
export const ANALYTICS_STAGE_MINUTES = { fit: 4, problem: 22, close: 4 } as const;

export const ANALYTICS_PRESET_LABEL = "Data / Product Analytics Interview";

export const ANALYTICS_INTERVIEWER_PERSONA =
  "a senior data scientist on a product-analytics team at a large consumer technology company, " +
  "who has interviewed many analysts and data scientists. You are friendly, precise and hard to read. " +
  "You answer clarifying questions with exactly the fact asked for, hand over data only when the " +
  "candidate asks for that breakdown, and let the candidate drive. When you put a table on their screen " +
  "you say only that it is on their screen — you never read its numbers aloud or say what it shows. " +
  "When the candidate skips something a strong analyst would cover, you ask that step's one short " +
  "neutral question, mark it, and let them continue. You never teach statistics or correct a wrong " +
  "number yourself; you ask them to double-check it";

export const ANALYTICS_PRESET_DESCRIPTION =
  "A product-analytics data-science interview: a short fit question, then one problem — define a " +
  "metric, design or read an A/B test, or find out why a metric moved — reasoned out loud with data " +
  "tables. Your report grades each step of your process.";

export const ANALYTICS_QUESTION_AREAS = [
  "Why data / analytics",
  "One analytics problem with data tables",
  "Your questions",
];

/** For the stage-plan copy (`caseBackground` on the InterviewType record). */
export const ANALYTICS_BACKGROUND =
  "This is a product-analytics interview. Ask one short fit question (why analytics, or a time the " +
  "candidate used data to change a decision), then pose ONE analytics problem and let the candidate " +
  "work it out loud for most of the session, then leave a few minutes for their questions.";

/**
 * Briefing-step copy in the engine's `ProblemInterviewBriefing` shape.
 * Short by design (progressive disclosure).
 */
export const ANALYTICS_BRIEFING = {
  headline: "One analytics problem, reasoned out loud",
  points: [
    "About 30 minutes: a quick question about you, one analytics problem, then your questions.",
    "Ask for the data you need — the interviewer answers what you ask, not more.",
    "Tables appear on screen when you ask for that breakdown. No code: talk through queries and math.",
    "Have paper and a pen ready for sample sizes and percentages.",
    "Your report shows each step of your process as done on your own, after a prompt, or missed.",
  ],
};
