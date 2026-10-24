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
import { COMPETENCIES } from "../../mastery/competencies";

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

/** A technique the coach may pick by id (from `techniquesForCompetency`). */
export interface PromptTechnique {
  id: string;
  name: string;
  reminder: string;
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
    /** Phase 23 L6: the attempt did not answer this moment's prompt. */
    offTopic?: boolean;
  } | null;
  softCapReached: boolean;
  isOpening: boolean;
  isResume: boolean;
  /**
   * Phase 23 L1/L2. Optional so older callers still build a prompt; coach.ts
   * always passes them. The moves are enforced mechanically in coach.ts too.
   */
  techniques?: PromptTechnique[];
  allowedMoves?: readonly CoachMove[];
  /** The one diagnosis question for this leg has been asked. */
  diagnosisCapReached?: boolean;
  /** The student's latest utterance repeated a technique back instead of answering. */
  lastUtteranceWasTipParrot?: boolean;
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
  const owned = new Set(
    COMPETENCIES.find((c) => c.key === competencyKey)?.dimensionKeys ?? [],
  );
  return dims.filter((d) => owned.has(d.key));
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
    "Fast reps. Every turn moves the student toward saying a better version out loud; no turn is wasted on chat.",
  );
  lines.push(
    "1. ONE QUESTION, THEN TEACH. You ask at most ONE diagnostic question per moment (in your opening). After the student's reply, never ask another question: confirm or correct their diagnosis in ONE short sentence, pick ONE technique from the list below by its id, and invite the attempt (move INVITE_ATTEMPT).",
  );
  lines.push(
    "2. The student attempts the rework FIRST, out loud, in their own words. When you invite an attempt, the app speaks the technique you picked and the invitation right after your `speech`, so your `speech` must NOT name, explain or paraphrase the technique or invite them itself: it is only your ONE-sentence reaction (under 25 words; longer is discarded).",
  );
  lines.push(
    "2b. If the student's reply was already a full reworked answer, it has been graded as an attempt; the verdict is below. After a not-yet attempt, say in one sentence specifically what was missing and pick the technique that fixes it.",
  );
  if (input.demonstrationAllowed) {
    lines.push(
      "3. A demonstration is allowed right now. Give exactly ONE version of words to say, ONLY in the `demonstration` field (never inside `speech`), then ask the student to try again in their own words. It must answer THIS moment's question using only what the student said in this moment; never blend in another story.",
    );
  } else {
    lines.push(
      "3. A demonstration is NOT allowed right now. `demonstration` MUST be null. Do not give words to say anywhere in `speech`.",
    );
  }
  lines.push(
    "4. Emit LEG_DONE right after an acceptable attempt (the grader's verdict is given to you below): one or two sentences naming what they did well. If the attempt was parroted from a demonstration, ask for their own words instead.",
  );
  lines.push(
    "5. Spoken style: 1-3 short sentences per turn, warm, direct, no lists, no quotation marks around new lines, and never say \"try saying\". Never mention a score, grade, rating or number for their attempt: grades are shown only when the session ends.",
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
      "OPENING TURN: in one or two short sentences restate the objective (which skill, which moment, and that they will say a better version aloud), then ask your ONE short diagnostic question (awaiting REPLY)." +
        (leg === "FRESH"
          ? " Introduce this second moment as another real moment of theirs showing the same skill."
          : ""),
    );
  }
  if (input.isResume) {
    lines.push("RESUMING: give a one-sentence recap, then continue (do not ask a new question; invite the attempt).");
  }
  if (lastAttempt) {
    // No number here: the coach must not speak one (numeric grade only at the end).
    lines.push(
      `Grader verdict on the latest attempt (${JSON.stringify(lastAttempt.text)}): ${lastAttempt.acceptable ? "ACCEPTABLE" : "NOT YET"}, parroted=${lastAttempt.parroted}. Rationale: ${lastAttempt.rationale}`,
    );
    if (lastAttempt.offTopic) {
      lines.push(
        "That attempt did NOT answer this moment's question (it was about a different situation, or reused their answer from the other moment). Your ONE short sentence (under 25 words) says plainly it answers a different question and names, in a few of your own words, what this moment's question is about (never read it aloud). The app adds the technique and the invitation.",
      );
    }
  }
  if (input.lastUtteranceWasTipParrot) {
    lines.push(
      "The student's latest words repeated the technique itself instead of answering. Do not treat that as an attempt: in one sentence, ask them to use it on their real answer.",
    );
  }
  if (input.diagnosisCapReached && !input.isOpening) {
    lines.push("Your one diagnostic question has been asked. Do not ask another question.");
  }
  if (input.techniques && input.techniques.length > 0) {
    lines.push("Techniques for this skill (pick ONE by id when you invite an attempt):");
    for (const t of input.techniques) lines.push(`- ${t.id}: ${t.name}. ${t.reminder}`);
  }
  if (input.allowedMoves && input.allowedMoves.length > 0) {
    lines.push(`Allowed moves this turn: ${input.allowedMoves.join(", ")}. Any other move is discarded.`);
  }
  if (input.softCapReached) {
    lines.push(
      "SOFT CAP REACHED: move toward closing. Offer one final attempt and close the leg with their best attempt. Never cut them off mid-thought.",
    );
  }

  lines.push("");
  lines.push("## Output contract");
  lines.push(
    `Reply with a single JSON object: {"speech": string, "move": one of ${COACH_MOVES.join(" | ")}, "awaiting": "REPLY" | "ATTEMPT" | "NONE", "demonstration": string | null, "techniqueId": string | null}. awaiting is ATTEMPT when you have invited a rework, REPLY when you asked a question, NONE after LEG_DONE. techniqueId is the id you picked when awaiting is ATTEMPT, otherwise null.`,
  );

  return lines.join("\n");
}
