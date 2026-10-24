/**
 * Coach persona system prompt (REQ-113).
 *
 * Authority: 22-CONTEXT.md (locked behaviours) and 22-COACH-LAYER-DECISION.md.
 * HARD CONTAINMENT RULE: a coach must never appear in any other kind of
 * session. This module is therefore imported only from `lib/study-plan/coached/`
 * and the coached route; `scripts/verify-coach-containment.ts` proves that
 * mechanically (import closure + runtime marker on every engine prompt).
 *
 * The prompt's instructions are ADVISORY. The mechanical gates live in
 * `tips.ts` (22-05: demonstration gate) and `coach.ts` (22-10: leg completion,
 * soft cap). Do not rely on the prompt alone for any of them.
 *
 * PURE: no prisma / s3 / openai. The only engine use is the read-only rubric
 * dimension lookup, covered by the `lib/study-plan/coached/` carve-out.
 */
import { listRubricDimensionsForSlug } from "../../engine/resolve";
import { competencyForDimension } from "../../mastery/competencies";

/**
 * First line of every prompt this module builds. It exists so the containment
 * guard can prove its absence from every other prompt.
 */
export const COACH_LAYER_MARKER = "[[COACHED-MODE COACH LAYER v1]]";

export const COACH_MOVES = [
  "OPEN",
  "ASK_DIAGNOSIS",
  "CONFIRM",
  "CORRECT",
  "INVITE_ATTEMPT",
  "DEMONSTRATE",
  "LEG_DONE",
] as const;

export type CoachMove = (typeof COACH_MOVES)[number];

export interface CoachTurnOutput {
  speech: string;
  move: CoachMove;
  awaiting: "REPLY" | "ATTEMPT" | "NONE";
  demonstration: string | null;
}

export interface CoachPromptInput {
  coachName: string;
  competency: { key: string; label: string; description: string };
  rubricDimensions: Array<{ key: string; label: string; description?: string }>;
  underlyingTypeName: string;
  leg: "REPLAY" | "FRESH";
  legCount: 1 | 2;
  momentFraming: "REWORK" | "REFINEMENT";
  moment: { counterpartLine: string | null; studentLine: string };
  attemptsInLeg: number;
  demonstrationsInLeg: number;
  demonstrationAllowed: boolean;
  lastAttempt: {
    text: string;
    score: number;
    acceptable: boolean;
    parroted: boolean;
    rationale: string;
  } | null;
  softCapReached: boolean;
  isOpening: boolean;
  isResume: boolean;
}

/**
 * Rubric dimensions of the underlying type that evidence the competency.
 * Read-only engine use.
 */
export function rubricDimensionsForCompetency(
  typeSlug: string,
  competencyKey: string,
): Array<{ key: string; label: string; description: string }> {
  const dims = listRubricDimensionsForSlug(typeSlug) ?? [];
  return dims.filter((d) => competencyForDimension(d.key) === competencyKey);
}

export function buildCoachSystemPrompt(input: CoachPromptInput): string {
  const {
    coachName,
    competency,
    rubricDimensions,
    underlyingTypeName,
    leg,
    legCount,
    momentFraming,
    moment,
    lastAttempt,
  } = input;

  const lines: string[] = [];
  lines.push(COACH_LAYER_MARKER);
  lines.push("");
  lines.push(
    `You are ${coachName}, a leadership-communication coach. You are the ONLY person in this conversation. There is no interviewer, investor or colleague here. Never role-play, imitate or speak as the other person from the student's session, and never read their words aloud; refer to them indirectly ("when they asked about..."). Their line is on the student's screen.`,
  );
  lines.push("");
  lines.push(
    `The work is the student's OWN recorded moment from their ${underlyingTypeName} session, shown verbatim on screen. Quote the student's own words back only when it helps.`,
  );
  lines.push(
    `Skill in focus: ${competency.label} - ${competency.description}`,
  );
  if (rubricDimensions.length > 0) {
    lines.push("What good looks like on this skill:");
    for (const d of rubricDimensions) {
      lines.push(`- ${d.label}${d.description ? `: ${d.description}` : ""}`);
    }
  }
  lines.push("");
  lines.push("## How you coach");
  lines.push(
    "1. ASK BEFORE TELLING. When something is weak, first ask the student to diagnose it (for example, what were you trying to land there?), then confirm or correct their diagnosis.",
  );
  lines.push(
    "2. The student attempts the rework FIRST, out loud, in their own words.",
  );
  if (input.demonstrationAllowed) {
    lines.push(
      "3. A demonstration is allowed right now. Give exactly ONE version of words to say, ONLY in the `demonstration` field (never inside `speech`), then ask the student to try again in their own words.",
    );
  } else {
    lines.push(
      "3. A demonstration is NOT allowed right now. `demonstration` MUST be null. Do not give words to say anywhere in `speech`.",
    );
  }
  lines.push(
    "4. You decide when the leg is done: emit LEG_DONE only after an acceptable attempt (the grader's verdict is given to you below). If the attempt was parroted from a demonstration, ask for their own words instead.",
  );
  lines.push(
    "5. Spoken style: 1-3 short sentences per turn, warm, direct, no lists, no quotation marks around new lines, and never say \"try saying\".",
  );
  lines.push("");
  lines.push("## This conversation");
  lines.push(`Leg: ${leg} (${legCount === 2 ? "one of two moments" : "the only moment"}).`);
  if (momentFraming === "REFINEMENT") {
    lines.push(
      "Framing: this moment was already decent. Frame the work honestly as sharpening a good moment, not fixing a weak one.",
    );
  } else {
    lines.push("Framing: this moment is worth reworking.");
  }
  if (leg === "FRESH") {
    lines.push(
      "This is a second, different real moment of theirs that shows the same skill.",
    );
  }
  if (legCount === 1) {
    lines.push(
      "Say plainly that there was not a second moment worth using, so this is the only one.",
    );
  }
  lines.push(
    `Their words in this moment: ${JSON.stringify(moment.studentLine)}`,
  );
  if (moment.counterpartLine) {
    lines.push(
      "What they were responding to (context for you only; NEVER read it aloud or speak as that person): " +
        JSON.stringify(moment.counterpartLine),
    );
  }
  lines.push(
    `Attempts so far this leg: ${input.attemptsInLeg}. Demonstrations so far this leg: ${input.demonstrationsInLeg}.`,
  );

  if (input.isOpening) {
    lines.push(
      "OPENING TURN: restate the objective in your own words (which skill, which moment, and that they will say a better version aloud), then ask your first diagnostic question." +
        (leg === "FRESH"
          ? " Introduce this second moment as another real moment of theirs showing the same skill."
          : ""),
    );
  }
  if (input.isResume) {
    lines.push("RESUMING: give a one-sentence recap, then continue.");
  }
  if (lastAttempt) {
    lines.push(
      `Grader verdict on the latest attempt (${JSON.stringify(lastAttempt.text)}): score ${lastAttempt.score}, acceptable=${lastAttempt.acceptable}, parroted=${lastAttempt.parroted}. Rationale: ${lastAttempt.rationale}`,
    );
  }
  if (input.softCapReached) {
    lines.push(
      "SOFT CAP REACHED: move toward closing. Offer one final attempt and close the leg with their best attempt. Never cut them off mid-thought.",
    );
  }

  lines.push("");
  lines.push("## Output contract");
  lines.push(
    `Reply with a single JSON object: {"speech": string, "move": one of ${COACH_MOVES.join(" | ")}, "awaiting": "REPLY" | "ATTEMPT" | "NONE", "demonstration": string | null}. awaiting is ATTEMPT when you have invited a rework, REPLY when you asked a question, NONE after LEG_DONE.`,
  );

  return lines.join("\n");
}
