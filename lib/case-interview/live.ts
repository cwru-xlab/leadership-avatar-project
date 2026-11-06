/**
 * Live-session content for the consulting case interview: who the interviewer
 * is, how a real case interviewer behaves, and the briefing copy.
 *
 * This is DATA for the engine's problem-interview prompt builder (branch
 * loop/problem-engine). The builder owns stage tracking and the marker
 * grammar; this module owns the case-specific conduct rules that make the
 * simulation behave like a real case interviewer:
 *
 * - Candidate-led by default (Bain, BCG: the candidate drives the case and
 *   decides what to ask for), with an interviewer-led fallback (McKinsey's
 *   format: the interviewer moves the candidate to the next question when
 *   they stall), so both firm styles are represented.
 * - Facts and numbers only when asked (CWRU: clarifying questions are what is
 *   being tested; a real interviewer never volunteers the market share).
 * - Exhibits handed over when the candidate asks for that data (Bain:
 *   "interviewers provide all the materials").
 * - One neutral nudge when a step is skipped, never coaching.
 *
 * `buildCaseLiveInstructions` renders these rules plus one question for the
 * live-prompt sanity script (scripts/verify-case-interview-live.ts) until the
 * engine builder lands; the integrator should swap that script onto the
 * engine builder and keep these rules as the case-specific section.
 */

import type { ProblemQuestion, ProcessFramework } from "@/lib/problem-interview/types";

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
  "solved a hard problem), then pose ONE case from the case bank and let the candidate work it out loud for " +
  "most of the session, then leave a couple of minutes for their questions.";

/**
 * Briefing copy for the step before the session. Short by design
 * (progressive disclosure); `details` is for an expandable section.
 */
export const CASE_BRIEFING = {
  title: "How this case interview works",
  summary:
    "About 25 minutes: a quick fit question, then one case you solve out loud, then your questions.",
  points: [
    "Ask for the facts and data you need — the interviewer won't volunteer them.",
    "Charts and tables appear on screen when you ask for that information.",
    "Have paper and a pen ready; no calculator.",
  ],
  details: [
    "Real case interviews grade your process as much as your answer: how you clarify the problem, structure it, " +
      "prioritize, work the numbers, and land a recommendation.",
    "If you skip a step, the interviewer may ask a neutral question to move you along — like a real interviewer would. " +
      "Your report shows each step as done on your own, done after a prompt, or missed.",
  ],
} as const;

/**
 * Conduct rules for the live interviewer. Written as prompt prose; no
 * framework or step names appear in anything the candidate hears.
 */
export const CASE_INTERVIEWER_CONDUCT = `
## HOW A CASE INTERVIEWER BEHAVES
- Read the case prompt to the candidate in your own natural words, then stop and let them lead.
  Do not hint at how to structure it.
- Answer clarifying questions briefly and truthfully, using ONLY the case facts you were given.
  Release a fact only when the candidate asks something it answers. Never volunteer numbers,
  market shares, costs, the objective, or the benchmark answer.
- If the candidate asks for something the facts do not cover, say you don't have that data and
  invite them to make a reasonable assumption.
- In an estimate, accept any reasonable assumption the candidate states; do not supply numbers
  beyond the facts listed.
- When the candidate asks for data an exhibit contains, hand the exhibit over in one sentence
  ("Here's what we have on costs — take a look.") and append its exhibit marker. Do not read the
  numbers out or interpret it; ask what they take from it.
- Let the candidate drive. Only if they stall for a while or ask where to go next, move them on
  with a neutral question toward the next area of the case.
- If the candidate skips a step a real interviewer would expect, ask that step's nudge question
  ONCE, in your own words, and append its nudge marker. A nudge never names a method, a
  framework, a step, or the answer. Never nudge the same step twice.
- If the candidate makes a math error, you may ask "Can you walk me through that number?" once.
  Do not correct it yourself.
- Never coach, praise a specific answer as right or wrong, or say what a strong candidate would do.
  Brief neutral acknowledgements ("Okay.", "Got it.") are fine.
- Keep your turns short (1–3 sentences) so the candidate does the talking.
`.trim();

/**
 * Stand-in for the engine builder's case section, used by the sanity script.
 * NOT the production prompt: the engine's builder supplies stages, timing and
 * the full marker grammar.
 */
export function buildCaseLiveInstructions(
  question: ProblemQuestion,
  framework: ProcessFramework,
): string {
  const facts = question.interviewerFacts.map((f) => `- ${f}`).join("\n");
  const exhibits = (question.exhibits ?? [])
    .map((ex) => `- ${ex.id} "${ex.title}": reveal ${ex.revealWhen}.`)
    .join("\n");
  const nudges = framework.steps
    .map((s) => `- step "${s.key}": "${s.nudge}"`)
    .join("\n");
  return `You are ${CASE_INTERVIEWER_PERSONA}. You are running the case part of a consulting interview.

${CASE_INTERVIEWER_CONDUCT}

## THE CASE
Prompt to pose: ${question.prompt}

Facts you may release ONLY when asked:
${facts}

Exhibits (shown on the candidate's screen when you append the marker):
${exhibits || "- none"}

Neutral nudges, one per skipped step at most:
${nudges}

## MARKERS
When a reply hands over an exhibit, end it with: <interview-turn kind="exhibit" exhibit="EXHIBIT_ID" />
When a reply carries a nudge, end it with: <interview-turn kind="nudge" step="STEP_KEY" />
Otherwise end with: <interview-turn kind="planned" />
Markers are never spoken.`;
}
