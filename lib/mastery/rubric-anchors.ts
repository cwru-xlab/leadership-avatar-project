/**
 * One-line anchors for a 1, a 3 and a 5 on each competency — the single
 * source both model graders send (the VOICE_DRILL grader and the coached
 * attempt grader), so the 1-5 scale means the same thing in both.
 * PROVISIONAL UNTIL CALIBRATED (scripts/calibrate-graders.ts measures spread
 * and drill/coached agreement).
 */
import type { CompetencyKey } from "./competencies";

export const RUBRIC_ANCHORS: Readonly<Record<CompetencyKey, { 1: string; 3: string; 5: string }>> = {
  delivery_presence: {
    1: "Halting or rushed throughout; heavy filler; the point is lost in how it is said.",
    3: "Understandable and mostly steady, with one noticeable gap in pause, filler, presence or variation — not automatically a rushing problem.",
    5: "Measured, confident and varied; pauses land the key points; almost no filler.",
  },
  structure_and_clarity: {
    1: "No discernible structure; the main point is missing or buried; ideas run together.",
    3: "A main point is present and steps are followable, but it arrives late or sentences carry several ideas.",
    5: "Leads with the point, moves through clearly separated steps with transitions, and closes back on the point.",
  },
  concision_and_focus: {
    1: "Mostly preamble or tangents; the answer never gets to the point.",
    3: "Gets to the point but with padding, repetition or one unneeded detour.",
    5: "Every sentence earns its place; no preamble, no repetition, one supporting detail per claim.",
  },
  audience_attunement: {
    1: "Ignores the listener's question, terms or feelings; talks past them.",
    3: "Answers the question asked but in the speaker's own frame, with little acknowledgement of the listener.",
    5: "Picks up the listener's words and concerns, checks understanding, and shapes the answer to them.",
  },
  holding_position_under_pressure: {
    1: "Abandons or contradicts the position at the first pushback, or becomes defensive.",
    3: "Keeps the position but wavers, over-qualifies, or does not acknowledge the objection.",
    5: "Acknowledges the objection, then holds the position calmly with a reason; warm tone, firm content.",
  },
  credibility_of_the_case: {
    1: "Claims with no support; vague or unverifiable.",
    3: "Some support, but general, unsourced or loosely tied to the claim.",
    5: "Specific, sourced evidence tied directly to the ask, with one honest limit acknowledged.",
  },
  outcome_achievement: {
    1: "No goal stated or pursued; ends without any next step.",
    3: "A goal is implied and partly pursued, but the close is vague.",
    5: "States the goal, steers toward it, and ends with a concrete, agreed next step.",
  },
};
