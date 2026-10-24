/**
 * Coach-turn orchestration for a coached session (REQ-114, REQ-115).
 *
 * 22-CONTEXT.md, "Session shape", on the soft cap: "Past a threshold the coach
 * is instructed to move toward closing rather than cutting off mid-sentence.
 * Recorded honestly: this is a prompt instruction, therefore advisory, not a
 * guarantee - the same class of thing as the advisory prompt in
 * lib/study-plan/checks/generate.ts."
 *
 * So, plainly: the SOFT CAP is ADVISORY. It is passed to the prompt
 * (`softCapReached`) and nothing here stops a model that ignores it; the only
 * mechanical effect is that a LEG_DONE at the cap is permitted (with at least
 * one attempt) and flagged `closedAtSoftCap`.
 *
 * What IS mechanical (steps 3-6 of `coachTurn`), independent of the prompt:
 *   - every spoken attempt is graded and parroting-checked (`isParrotOf`);
 *   - every candidate coach utterance passes `validateCoachSpeech`, and any
 *     demonstration passes `assertTipSafe(..., { gate: DEMONSTRATION })`, so no
 *     demonstration precedes the student's first attempt in a leg or occurs
 *     twice in a leg;
 *   - LEG_DONE is rejected unless the leg has an acceptable attempt, or the
 *     soft cap is reached with at least one attempt;
 *   - a rejected candidate is DISCARDED and regenerated, never repaired; after
 *     MAX_COACH_GENERATION_ATTEMPTS a fixed fallback (also gated) is delivered.
 *
 * `coachTurn` does not read S3 or the step: the caller resolves the moment and
 * ownership of the step. It reads/writes only CoachedSession (re-checked by
 * userId) and CoachedTurn.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../../prisma";
import {
  COACH_MOVES,
  buildCoachSystemPrompt,
  type CoachMove,
  type CoachTurnOutput,
} from "./coach-prompt";
import type { CoachIdentity } from "./coach-identity";
import {
  MAX_DEMONSTRATIONS_PER_LEG,
  assertTipSafe,
  isParrotOf,
  validateCoachSpeech,
} from "./tips";
import {
  gradeCoachedAttempt,
  type Grader,
} from "./grade-attempt";

export const SOFT_CAP_ATTEMPTS_PER_LEG = 4; // ADVISORY, PROVISIONAL UNTIL CALIBRATED
export const SOFT_CAP_COACH_TURNS_PER_LEG = 12; // ADVISORY, PROVISIONAL UNTIL CALIBRATED
export const MAX_COACH_GENERATION_ATTEMPTS = 3;

export type Leg = "REPLAY" | "FRESH";
export interface Msg {
  role: "user" | "assistant";
  content: string;
}

export interface CoachTurnDeps {
  generate?: (system: string, history: Msg[]) => Promise<unknown>;
  grade?: Grader;
}

export interface CoachedTurnRow {
  seq: number;
  leg: string;
  speaker: string;
  move: string;
  awaiting: string | null;
  text: string;
  demonstration: string | null;
  score: number | null;
  acceptable: boolean | null;
  parroted: boolean | null;
  gradeRationale: string | null;
  spokenDurationMs: number | null;
  closedAtSoftCap: boolean | null;
}

export class CoachTurnOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachTurnOrderError";
  }
}
export class UnspokenAttemptError extends Error {
  constructor() {
    super("A coached attempt must be spoken (spokenDurationMs > 0)");
    this.name = "UnspokenAttemptError";
  }
}
export class CoachSessionNotFoundError extends Error {
  constructor() {
    super("Coached session not found, not owned by this user, or already complete");
    this.name = "CoachSessionNotFoundError";
  }
}

export interface LegState {
  attemptsInLeg: number;
  demonstrationsInLeg: number;
  coachTurnsInLeg: number;
  awaiting: "REPLY" | "ATTEMPT" | "NONE" | null;
  /** A LEG_DONE coach turn has been delivered in this leg. */
  legReady: boolean;
  lastAttempt: CoachedTurnRow | null;
  hasOpened: boolean;
  hasAcceptableAttempt: boolean;
  lastDemonstration: string | null;
}

export function legStateFromTurns(turns: readonly CoachedTurnRow[], leg: Leg): LegState {
  const inLeg = turns.filter((t) => t.leg === leg).sort((a, b) => a.seq - b.seq);
  const coach = inLeg.filter((t) => t.speaker === "COACH");
  const attempts = inLeg.filter((t) => t.speaker === "STUDENT" && t.move === "ATTEMPT");
  const demos = coach.filter((t) => t.demonstration !== null);
  const lastCoach = coach[coach.length - 1] ?? null;
  const aw = lastCoach?.awaiting;
  return {
    attemptsInLeg: attempts.length,
    demonstrationsInLeg: demos.length,
    coachTurnsInLeg: coach.length,
    awaiting: aw === "REPLY" || aw === "ATTEMPT" || aw === "NONE" ? aw : null,
    legReady: coach.some((t) => t.move === "LEG_DONE"),
    lastAttempt: attempts[attempts.length - 1] ?? null,
    hasOpened: coach.length > 0,
    hasAcceptableAttempt: attempts.some((t) => t.acceptable === true),
    lastDemonstration: demos.length ? demos[demos.length - 1].demonstration : null,
  };
}

export interface CoachTurnArgs {
  userId: string;
  coachedSessionId: string;
  leg: Leg;
  legCount: 1 | 2;
  momentFraming: "REWORK" | "REFINEMENT";
  moment: { counterpartLine: string | null; studentLine: string };
  coach: CoachIdentity;
  competency: { key: string; label: string; description: string };
  rubricDimensions: Array<{ key: string; label: string; description?: string }>;
  underlyingTypeName: string;
  utterance: { text: string; spokenDurationMs: number } | null;
}

export interface CoachTurnResult {
  coachTurn: {
    speech: string;
    move: CoachMove;
    awaiting: "REPLY" | "ATTEMPT" | "NONE";
    demonstration: string | null;
    closedAtSoftCap: boolean;
  };
  legState: LegState;
}

const FALLBACK: CoachTurnOutput = {
  speech: "Let's stay with that moment. What were you aiming to get across?",
  move: "ASK_DIAGNOSIS",
  awaiting: "REPLY",
  demonstration: null,
};

async function defaultGenerate(system: string, history: Msg[]): Promise<unknown> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });
  const completion = await openai.chat.completions.create({
    model: process.env.COACH_MODEL || "gpt-4.1",
    messages: [{ role: "system", content: system }, ...history],
    max_tokens: 600,
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Coach model returned no content");
  return JSON.parse(content);
}

function loadTurns(coachedSessionId: string): Promise<CoachedTurnRow[]> {
  return prisma.coachedTurn.findMany({
    where: { coachedSessionId },
    orderBy: { seq: "asc" },
  }) as Promise<CoachedTurnRow[]>;
}

/** Append a row with the next seq; one retry on a seq collision (P2002). */
async function appendTurn(
  coachedSessionId: string,
  data: Omit<Prisma.CoachedTurnUncheckedCreateInput, "coachedSessionId" | "seq">,
): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const last = await prisma.coachedTurn.findFirst({
      where: { coachedSessionId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    try {
      await prisma.coachedTurn.create({
        data: { ...data, coachedSessionId, seq: (last?.seq ?? 0) + 1 },
      });
      return;
    } catch (err) {
      const dup = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!dup || i === 1) throw err;
    }
  }
}

function toHistory(turns: readonly CoachedTurnRow[], leg: Leg): Msg[] {
  const msgs: Msg[] = turns
    .filter((t) => t.leg === leg)
    .map((t) =>
      t.speaker === "COACH"
        ? { role: "assistant" as const, content: t.text }
        : { role: "user" as const, content: t.text },
    );
  if (msgs.length === 0) {
    msgs.push({ role: "user", content: "(The session is starting. Begin.)" });
  } else if (msgs[msgs.length - 1].role === "assistant") {
    msgs.push({ role: "user", content: "(The student has returned. Resume.)" });
  }
  return msgs;
}

export async function coachTurn(
  args: CoachTurnArgs,
  deps: CoachTurnDeps = {},
): Promise<CoachTurnResult> {
  // 1. Load session (ownership) and this leg's state.
  const session = await prisma.coachedSession.findFirst({
    where: { id: args.coachedSessionId, userId: args.userId, completedAt: null },
    select: { id: true },
  });
  if (!session) throw new CoachSessionNotFoundError();

  let turns = await loadTurns(args.coachedSessionId);
  let state = legStateFromTurns(turns, args.leg);

  // 2/3. Interpret the utterance.
  let isOpening = false;
  let isResume = false;
  if (args.utterance === null) {
    if (state.legReady) throw new CoachTurnOrderError("This leg is already complete");
    if (!state.hasOpened) isOpening = true;
    else isResume = true;
  } else {
    if (state.legReady) throw new CoachTurnOrderError("This leg is already complete");
    if (!state.hasOpened) throw new CoachTurnOrderError("The coach has not opened this leg yet");
    if (!(args.utterance.spokenDurationMs > 0)) throw new UnspokenAttemptError();

    const isAttempt = state.awaiting === "ATTEMPT";
    if (isAttempt) {
      const parroted = state.lastDemonstration
        ? isParrotOf(args.utterance.text, state.lastDemonstration)
        : false;
      const grade = await gradeCoachedAttempt(
        {
          competency: args.competency,
          rubricDimensions: args.rubricDimensions,
          counterpartLine: args.moment.counterpartLine,
          originalLine: args.moment.studentLine,
          attempt: args.utterance.text,
          spokenDurationMs: args.utterance.spokenDurationMs,
          demonstration: state.lastDemonstration,
        },
        { grader: deps.grade },
      );
      await appendTurn(args.coachedSessionId, {
        leg: args.leg,
        speaker: "STUDENT",
        move: "ATTEMPT",
        text: args.utterance.text, // VERBATIM from transcription
        score: grade.score,
        acceptable: !parroted && grade.acceptable,
        parroted,
        gradeRationale: grade.rationale,
        spokenDurationMs: args.utterance.spokenDurationMs,
      });
    } else {
      await appendTurn(args.coachedSessionId, {
        leg: args.leg,
        speaker: "STUDENT",
        move: "REPLY",
        text: args.utterance.text,
        spokenDurationMs: args.utterance.spokenDurationMs,
      });
    }
    turns = await loadTurns(args.coachedSessionId);
    state = legStateFromTurns(turns, args.leg);
  }

  // 4. Gate inputs.
  const demonstrationAllowed =
    state.attemptsInLeg >= 1 &&
    state.demonstrationsInLeg < MAX_DEMONSTRATIONS_PER_LEG &&
    state.lastAttempt?.acceptable !== true;
  const softCapReached =
    state.attemptsInLeg >= SOFT_CAP_ATTEMPTS_PER_LEG ||
    state.coachTurnsInLeg >= SOFT_CAP_COACH_TURNS_PER_LEG;

  const studentAttempts = turns
    .filter((t) => t.leg === args.leg && t.speaker === "STUDENT" && t.move === "ATTEMPT")
    .map((t) => t.text);
  const speechCtx = {
    studentLine: args.moment.studentLine,
    counterpartLine: args.moment.counterpartLine,
    studentAttempts,
  };

  const last = state.lastAttempt;
  const system = buildCoachSystemPrompt({
    coachName: args.coach.name,
    competency: args.competency,
    rubricDimensions: args.rubricDimensions,
    underlyingTypeName: args.underlyingTypeName,
    leg: args.leg,
    legCount: args.legCount,
    momentFraming: args.momentFraming,
    moment: args.moment,
    attemptsInLeg: state.attemptsInLeg,
    demonstrationsInLeg: state.demonstrationsInLeg,
    demonstrationAllowed,
    lastAttempt: last
      ? {
          text: last.text,
          score: last.score ?? 0,
          acceptable: last.acceptable === true,
          parroted: last.parroted === true,
          rationale: last.gradeRationale ?? "",
        }
      : null,
    softCapReached,
    isOpening,
    isResume,
  });
  const history = toHistory(turns, args.leg);
  const generate = deps.generate ?? defaultGenerate;

  // 5. Generate / gate / discard-and-retry.
  const check = (raw: unknown): { ok: true; out: CoachTurnOutput; closedAtSoftCap: boolean } | { ok: false; reason: string } => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "SHAPE_NOT_OBJECT" };
    const r = raw as Record<string, unknown>;
    if (typeof r.move !== "string" || !(COACH_MOVES as readonly string[]).includes(r.move)) {
      return { ok: false, reason: "SHAPE_MOVE" };
    }
    if (r.awaiting !== "REPLY" && r.awaiting !== "ATTEMPT" && r.awaiting !== "NONE") {
      return { ok: false, reason: "SHAPE_AWAITING" };
    }
    if (typeof r.speech !== "string" || r.speech.trim().length === 0) {
      return { ok: false, reason: "SHAPE_SPEECH" };
    }
    if (r.demonstration !== null && r.demonstration !== undefined && typeof r.demonstration !== "string") {
      return { ok: false, reason: "SHAPE_DEMONSTRATION" };
    }
    const demonstration =
      typeof r.demonstration === "string" && r.demonstration.trim().length > 0
        ? r.demonstration
        : null;
    const move = r.move as CoachMove;
    const speech = r.speech.trim();

    const sp = validateCoachSpeech(speech, speechCtx);
    if (!sp.ok) return { ok: false, reason: `SPEECH_${sp.reason}` };

    if (demonstration !== null) {
      try {
        assertTipSafe(demonstration, {
          studentLine: args.moment.studentLine,
          gate: {
            kind: "DEMONSTRATION",
            attemptsInLeg: state.attemptsInLeg,
            demonstrationsInLeg: state.demonstrationsInLeg,
          },
        });
      } catch (err) {
        const m = /\((\w+)\)/.exec(err instanceof Error ? err.message : "");
        return { ok: false, reason: `DEMONSTRATION_${m?.[1] ?? "REJECTED"}` };
      }
      if (move !== "DEMONSTRATE") return { ok: false, reason: "DEMONSTRATION_WITHOUT_MOVE" };
      if (state.lastAttempt?.acceptable === true) return { ok: false, reason: "DEMONSTRATION_AFTER_ACCEPTABLE" };
    } else if (move === "DEMONSTRATE") {
      return { ok: false, reason: "DEMONSTRATE_WITHOUT_DEMONSTRATION" };
    }

    let closedAtSoftCap = false;
    if (move === "LEG_DONE") {
      if (state.hasAcceptableAttempt) closedAtSoftCap = false;
      else if (softCapReached && state.attemptsInLeg >= 1) closedAtSoftCap = true;
      else return { ok: false, reason: "LEG_DONE_NOT_EARNED" };
    }
    if (move === "OPEN" && !isOpening) return { ok: false, reason: "OPEN_NOT_OPENING" };

    return {
      ok: true,
      closedAtSoftCap,
      out: { speech, move, awaiting: r.awaiting, demonstration },
    };
  };

  let chosen: { out: CoachTurnOutput; closedAtSoftCap: boolean } | null = null;
  for (let i = 0; i < MAX_COACH_GENERATION_ATTEMPTS && !chosen; i++) {
    let raw: unknown;
    try {
      raw = await generate(system, history);
    } catch (err) {
      console.warn(`[coach] generation ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const res = check(raw);
    if (res.ok) chosen = { out: res.out, closedAtSoftCap: res.closedAtSoftCap };
    else console.info(`[coach] candidate ${i + 1} rejected: ${res.reason}`);
  }

  // 6. Fixed fallback, itself gated.
  if (!chosen) {
    const fb = validateCoachSpeech(FALLBACK.speech, speechCtx);
    if (!fb.ok) throw new Error(`coach fallback speech failed its own gate (${fb.reason})`);
    console.warn("[coach] all generation attempts rejected; delivering fallback");
    chosen = { out: FALLBACK, closedAtSoftCap: false };
  }

  // 7. Persist and return.
  await appendTurn(args.coachedSessionId, {
    leg: args.leg,
    speaker: "COACH",
    move: chosen.out.move,
    awaiting: chosen.out.awaiting,
    text: chosen.out.speech,
    demonstration: chosen.out.demonstration,
    closedAtSoftCap: chosen.out.move === "LEG_DONE" ? chosen.closedAtSoftCap : null,
  });
  turns = await loadTurns(args.coachedSessionId);
  return {
    coachTurn: { ...chosen.out, closedAtSoftCap: chosen.closedAtSoftCap },
    legState: legStateFromTurns(turns, args.leg),
  };
}
