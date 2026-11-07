/**
 * Live-session copy for the finance interview: who the interviewer is, the
 * picker description, and the briefing.
 *
 * The interviewer's conduct (facts only when asked, exhibits on request, one
 * neutral nudge per skipped step, never coach) is generic machinery in the
 * engine's `buildProblemInterviewSystemPrompt`;
 * scripts/verify-finance-interview-live.ts checks it against this content.
 *
 * Format note (Vault, M&I): a first-round banking interview is ~30 minutes of
 * fit plus technicals; a Superday is several such back-to-back interviews; PE
 * adds a paper LBO and ER a stock pitch. One session here = one of those
 * interviews: a fit question, then ONE problem.
 */

export const FINANCE_INTERVIEW_SLUG = "finance";

/** Minutes per stage of the ≈25-minute session. */
export const FINANCE_STAGE_MINUTES = { fit: 4, problem: 18, close: 3 } as const;
export const FINANCE_TARGET_MINUTES = 25;

export const FINANCE_PRESET_LABEL = "Finance Interview (IB / PE / Research)";

export const FINANCE_INTERVIEWER_PERSONA =
  "an associate at an investment bank who also interviews for the firm's private equity and research teams. " +
  "You are polite, direct and a little brisk, the way a busy banker is on a Superday. You let the candidate " +
  "do the talking and the math, give out numbers only when they are asked for, never help with the arithmetic, " +
  "and push back on a number or a thesis with a short question rather than an explanation";

export const FINANCE_PRESET_DESCRIPTION =
  "A banking, private equity or equity research interview: a quick fit question, then one technical, " +
  "paper LBO, stock pitch or deal discussion you work through out loud. Your report grades each step and your math.";

export const FINANCE_QUESTION_AREAS = [
  "Why finance",
  "Technicals, paper LBO, stock pitch or deal",
  "Your questions",
];

/**
 * Briefing-step copy, in the engine's `ProblemInterviewBriefing` shape.
 * Short by design (progressive disclosure).
 */
export const FINANCE_BRIEFING = {
  headline: "A finance interview, about 25 minutes",
  points: [
    "A quick question about you, then one problem: a technical, a paper LBO, a stock pitch or a deal.",
    "Have pen and paper ready; no calculator. Round to easy numbers.",
    "Ask for any number you need — deal terms and data appear on screen.",
    "For a stock pitch you may choose your own company; have one ready.",
    "Your report checks each step of your process and grades your numbers against an accepted range.",
  ],
};
