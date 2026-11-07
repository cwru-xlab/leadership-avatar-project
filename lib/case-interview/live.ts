/**
 * Live-session copy for the consulting case interview: who the interviewer
 * is, the picker description, and the briefing.
 *
 * The live interviewer's conduct (facts only when asked, exhibits on request,
 * one neutral nudge per skipped step, never coach) is generic machinery in the
 * engine's `buildProblemInterviewSystemPrompt` (branch loop/problem-engine);
 * scripts/verify-case-interview-live.ts checks it against this content.
 *
 * Format note: candidate-led by default (Bain, BCG: the candidate drives and
 * decides what to ask for); the engine prompt only steps in with a neutral
 * question when a step is skipped, which is how an interviewer-led firm
 * (McKinsey) moves a candidate along, so both styles are represented.
 */

/** Minutes per stage of the ≈25-minute session. */
export const CASE_STAGE_MINUTES = { fit: 3, problem: 18, close: 2 } as const;
export const CASE_TARGET_MINUTES = 25;

export const CASE_INTERVIEWER_PERSONA =
  "a manager at a management consulting firm who interviews candidates every recruiting season. " +
  "You are friendly but businesslike, you let the candidate drive the case, and you give out facts and data " +
  "only when the candidate asks for them — exactly as a real case interviewer would";

export const CASE_DESCRIPTION =
  "A realistic consulting case interview: a quick fit question, then one business case, estimate or puzzle " +
  "you solve out loud with data exhibits. Your report grades each step of your process.";

export const CASE_QUESTION_AREAS = ["Fit question", "Live case with data exhibits", "Your questions"];

/** For the stage-plan copy (`caseBackground` on the legacy record). */
export const CASE_BACKGROUND =
  "This is a case interview. Ask one short fit question (why consulting, or a time the candidate led or " +
  "solved a hard problem), then pose ONE case and let the candidate work it out loud for most of the " +
  "session, then leave a couple of minutes for their questions.";

/**
 * Briefing-step copy, in the engine's `ProblemInterviewBriefing` shape
 * ({ headline, points }). Short by design (progressive disclosure).
 */
export const CASE_BRIEFING = {
  headline: "A real case interview, about 25 minutes",
  points: [
    "A quick question about you, then one case you solve out loud, then your questions.",
    "Ask for the facts and data you need — the interviewer won't volunteer them.",
    "Charts and tables appear on screen when you ask for that information.",
    "Have paper and a pen ready; no calculator.",
    "Your report shows each step of your process as done on your own, after a prompt, or missed.",
  ],
};
