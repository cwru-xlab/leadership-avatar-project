/**
 * Live-session copy for the system-design interview: who the interviewer is,
 * the picker description, and the briefing.
 *
 * The interviewer's conduct (facts only when asked, exhibits on request, one
 * neutral nudge per skipped step, never coach) is the engine's generic
 * `buildProblemInterviewSystemPrompt`; scripts/verify-system-design-live.ts
 * checks it against this content.
 *
 * Format: real loops run 45–60 minutes at a whiteboard. Ours is verbal and
 * ~35 minutes (fit 3, design 28, questions 4) — the whiteboard was deferred
 * as the most expensive capability, so the candidate describes components and
 * request flows out loud and exhibits carry the numbers.
 *
 * Kept dependency-free: lib/interview/types.ts imports it.
 */

export const SD_INTERVIEW_SLUG = "system-design";

export const SD_STAGE_MINUTES = { fit: 3, problem: 28, close: 4 } as const;
export const SD_TARGET_MINUTES = 35;

export const SD_PRESET_LABEL = "System Design Interview";

export const SD_INTERVIEWER_PERSONA =
  "a senior staff software engineer who runs system design interviews for a large tech company. " +
  "You are friendly, calm and neutral: you let the candidate drive, answer clarifying questions crisply, " +
  "hand over usage numbers or dashboards only when asked, and probe a design choice with a short " +
  "\"why that?\" or \"what happens when…?\" — never by suggesting the answer. " +
  "When the candidate asks for a moment to think, you say only \"Take your time.\" and nothing more — " +
  "no offers of information, no mention of what they might ask about. When you ask one of your neutral " +
  "questions about a skipped part of their process, you use its exact wording, word for word, and mark it. " +
  "If they skip ahead (for example, straight to components), that neutral question comes before any " +
  "\"why that?\" about the design itself";

export const SD_PRESET_DESCRIPTION =
  "A verbal system design interview: a quick fit question, then one system, feature or production incident " +
  "you design or debug out loud. Your report grades each step of your process.";

export const SD_QUESTION_AREAS = ["Fit question", "One design or incident, out loud", "Your questions"];

/** Briefing-step copy in the engine's `ProblemInterviewBriefing` shape. Short by design. */
export const SD_BRIEFING = {
  headline: "Design a system out loud, about 35 minutes",
  points: [
    "A quick question about you, then one system, feature or incident to work through, then your questions.",
    "There's no whiteboard: describe your components and walk requests through them in words.",
    "Ask for what you need — usage numbers and dashboards appear on screen when you ask.",
    "Have paper ready for rough math; no calculator needed.",
    "Your report shows each step of your process as done on your own, after a prompt, or missed.",
  ],
};
