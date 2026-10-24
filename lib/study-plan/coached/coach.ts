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
 *     MAX_COACH_GENERATION_ATTEMPTS a deterministic, state-aware fallback (also
 *     gated) is delivered: a technique-plus-invite line, the closing line after
 *     an acceptable attempt, or the opening. Never a repeated generic question.
 *
 * Phase 23 (learning quality, L1/L2), also mechanical:
 *   - a REPLY that re-answers the original prompt is graded as an ATTEMPT
 *     (`classifyReply`); one that repeats a technique back never is;
 *   - at most MAX_DIAGNOSIS_QUESTIONS_PER_LEG question (awaiting REPLY) per leg;
 *   - after an acceptable attempt the only accepted move is LEG_DONE;
 *   - every non-demonstration invite (awaiting ATTEMPT) is followed by exactly
 *     one technique line composed from the library (`techniqueLine`, gated by
 *     `assertTipSafe`) and an invitation, so the coach names a technique aloud
 *     before every attempt;
 *   - no coach speech mentions a score or grade (numeric grade only at the end).
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
  isTechniqueParrot,
  techniqueLine,
  techniquesForCompetency,
  validateCoachSpeech,
  type Technique,
} from "./tips";
import {
  gradeCoachedAttempt,
  type Grader,
} from "./grade-attempt";
import { classifyReply, type ReplyClassifier } from "./reply-classifier";
import type { CompetencyKey } from "../../mastery/competencies";

export const SOFT_CAP_ATTEMPTS_PER_LEG = 4; // ADVISORY, PROVISIONAL UNTIL CALIBRATED
export const SOFT_CAP_COACH_TURNS_PER_LEG = 12; // ADVISORY, PROVISIONAL UNTIL CALIBRATED
export const MAX_COACH_GENERATION_ATTEMPTS = 3;
/** Phase 23 L1: one diagnosis question per leg, then teach and invite. */
export const MAX_DIAGNOSIS_QUESTIONS_PER_LEG = 1;

/** Spoken after the technique line when the coach invites an attempt. */
export const INVITE_FIRST_ATTEMPT = "Now say your answer again, out loud, as if you're back in that moment.";
export const INVITE_RETRY = "Give it one more try, out loud.";

export type Leg = "REPLAY" | "FRESH";
export interface Msg {
  role: "user" | "assistant";
  content: string;
}

export interface CoachTurnDeps {
  generate?: (system: string, history: Msg[]) => Promise<unknown>;
  grade?: Grader;
  classifyReply?: ReplyClassifier;
  /** Diagnostics only (verifiers, evaluation scripts). Never affects behaviour. */
  trace?: (event: CoachTraceEvent) => void;
}

export type CoachTraceEvent =
  | { kind: "UTTERANCE"; storedAs: "ATTEMPT" | "REPLY"; reason: string }
  | { kind: "CANDIDATE_REJECTED"; candidate: number; reason: string }
  | { kind: "FALLBACK"; move: CoachMove };

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
  /** Coach turns in this leg that asked a question (awaiting REPLY). */
  diagnosisQuestionsInLeg: number;
  /** The latest row in this leg, if it is the student's. */
  lastStudentRow: CoachedTurnRow | null;
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
    diagnosisQuestionsInLeg: coach.filter((t) => t.awaiting === "REPLY").length,
    lastStudentRow: inLeg.length && inLeg[inLeg.length - 1].speaker === "STUDENT" ? inLeg[inLeg.length - 1] : null,
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

/** Matches a spoken score/grade: numeric grade only at the end. */
const MENTIONS_GRADE_RE =
  /\b(?:score[sd]?|scoring|grade[sd]?|grading|grader|rating|rated)\b|\b[1-5]\s*(?:\/|out of)\s*(?:5|five)\b/i;

export function mentionsGrade(speech: string): boolean {
  return MENTIONS_GRADE_RE.test(speech);
}

/** Library techniques for the competency whose spoken line passes the tip gate. */
export function safeTechniques(competencyKey: string, studentLine: string): Technique[] {
  return techniquesForCompetency(competencyKey as CompetencyKey).filter((t) => {
    try {
      assertTipSafe(techniqueLine(t), { studentLine });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The technique to name: the model's pick when it is a safe library id,
 * otherwise the first safe technique not yet named in this leg (cycling).
 */
export function chooseTechnique(
  safe: readonly Technique[],
  requestedId: unknown,
  coachTextsInLeg: readonly string[],
): Technique | null {
  if (safe.length === 0) return null;
  const requested = typeof requestedId === "string" ? safe.find((t) => t.id === requestedId) : undefined;
  if (requested) return requested;
  const unused = safe.find((t) => !coachTextsInLeg.some((txt) => txt.includes(techniqueLine(t))));
  return unused ?? safe[coachTextsInLeg.length % safe.length];
}

/** Reaction + technique line + invitation, as one spoken turn. */
export function composeInvite(reaction: string, technique: Technique | null, attemptsInLeg: number): string {
  return [reaction.trim(), technique ? techniqueLine(technique) : "", attemptsInLeg === 0 ? INVITE_FIRST_ATTEMPT : INVITE_RETRY]
    .filter(Boolean)
    .join(" ");
}

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

    const utterance = args.utterance;
    const allTechniques = techniquesForCompetency(args.competency.key as CompetencyKey);
    const trace = deps.trace ?? (() => {});
    let isAttempt = false;
    let tipParrot = false;
    if (isTechniqueParrot(utterance.text, allTechniques)) {
      // Repeating the technique back is never an answer (L1, case c).
      tipParrot = true;
      trace({ kind: "UTTERANCE", storedAs: "REPLY", reason: "PARROTS_TECHNIQUE" });
    } else if (state.awaiting === "ATTEMPT") {
      isAttempt = true;
      trace({ kind: "UTTERANCE", storedAs: "ATTEMPT", reason: "AWAITING_ATTEMPT" });
    } else {
      const lastCoach = turns.filter((t) => t.leg === args.leg && t.speaker === "COACH").pop();
      const cls = await classifyReply(
        {
          competency: args.competency,
          underlyingTypeName: args.underlyingTypeName,
          counterpartLine: args.moment.counterpartLine,
          originalLine: args.moment.studentLine,
          coachQuestion: lastCoach?.text ?? null,
          reply: utterance.text,
        },
        { classifier: deps.classifyReply },
      );
      isAttempt = cls.isAttempt;
      trace({ kind: "UTTERANCE", storedAs: isAttempt ? "ATTEMPT" : "REPLY", reason: cls.reason });
    }
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
        // Flags a reply that only repeated a technique back (not graded).
        parroted: tipParrot ? true : null,
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
  const diagnosisCapReached = state.diagnosisQuestionsInLeg >= MAX_DIAGNOSIS_QUESTIONS_PER_LEG;
  const lastStudent = state.lastStudentRow;
  // The student's latest words were an acceptable attempt: close, nothing else.
  const mustClose = lastStudent?.move === "ATTEMPT" && lastStudent.acceptable === true;
  const lastWasTipParrot = lastStudent?.move === "REPLY" && lastStudent.parroted === true;
  const legDoneEarned = state.hasAcceptableAttempt || (softCapReached && state.attemptsInLeg >= 1);
  const allowedMoves: CoachMove[] = isOpening
    ? ["OPEN"]
    : mustClose
      ? ["LEG_DONE"]
      : [
          "INVITE_ATTEMPT",
          ...(diagnosisCapReached ? [] : (["ASK_DIAGNOSIS", "CONFIRM", "CORRECT"] as CoachMove[])),
          ...(demonstrationAllowed ? (["DEMONSTRATE"] as CoachMove[]) : []),
          ...(legDoneEarned ? (["LEG_DONE"] as CoachMove[]) : []),
        ];
  const safe = safeTechniques(args.competency.key, args.moment.studentLine);
  const coachTextsInLeg = turns
    .filter((t) => t.leg === args.leg && t.speaker === "COACH")
    .map((t) => t.text);

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
    techniques: safe.map((t) => ({ id: t.id, name: t.name, reminder: t.reminder })),
    allowedMoves,
    diagnosisCapReached,
    lastUtteranceWasTipParrot: lastWasTipParrot,
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
    const awaiting = r.awaiting;
    if (!allowedMoves.includes(move)) {
      const isQuestionMove = move === "ASK_DIAGNOSIS" || move === "CONFIRM" || move === "CORRECT";
      return {
        ok: false,
        reason: mustClose
          ? "MUST_CLOSE_AFTER_ACCEPTABLE"
          : diagnosisCapReached && isQuestionMove
            ? "DIAGNOSIS_CAP"
            : `MOVE_NOT_ALLOWED_${move}`,
      };
    }
    if ((awaiting === "NONE") !== (move === "LEG_DONE")) return { ok: false, reason: "AWAITING_MOVE_MISMATCH" };
    if ((move === "INVITE_ATTEMPT" || move === "DEMONSTRATE") && awaiting !== "ATTEMPT") {
      return { ok: false, reason: "AWAITING_MOVE_MISMATCH" };
    }
    if (awaiting === "REPLY" && diagnosisCapReached) return { ok: false, reason: "DIAGNOSIS_CAP" };

    // Every non-demonstration invite names one library technique aloud (L2).
    const speech =
      awaiting === "ATTEMPT" && move !== "DEMONSTRATE"
        ? composeInvite(r.speech, chooseTechnique(safe, r.techniqueId, coachTextsInLeg), state.attemptsInLeg)
        : r.speech.trim();

    if (mentionsGrade(speech)) return { ok: false, reason: "SPEECH_MENTIONS_GRADE" };
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
      out: { speech, move, awaiting, demonstration },
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
    else {
      console.info(`[coach] candidate ${i + 1} rejected: ${res.reason}`);
      deps.trace?.({ kind: "CANDIDATE_REJECTED", candidate: i + 1, reason: res.reason });
    }
  }

  // 6. Deterministic, state-aware fallback, itself gated. Never a generic or
  // repeated question (L1): open, close, or name a technique and invite.
  if (!chosen) {
    let out: CoachTurnOutput;
    if (isOpening) {
      out = {
        speech: `We're working on ${args.competency.label.toLowerCase()}, using the moment from your ${args.underlyingTypeName} session that's on your screen, and you'll say a better version out loud. What were you trying to get across there?`,
        move: "OPEN",
        awaiting: "REPLY",
        demonstration: null,
      };
    } else if (mustClose) {
      out = { speech: "That version lands. We can close this moment here.", move: "LEG_DONE", awaiting: "NONE", demonstration: null };
    } else {
      const reaction = lastWasTipParrot
        ? "That's the technique itself; now use it on your real answer."
        : lastStudent?.move === "ATTEMPT" && lastStudent.parroted === true
          ? "Put it in your own words this time."
          : "";
      out = {
        speech: composeInvite(reaction, chooseTechnique(safe, null, coachTextsInLeg), state.attemptsInLeg),
        move: "INVITE_ATTEMPT",
        awaiting: "ATTEMPT",
        demonstration: null,
      };
    }
    const fb = validateCoachSpeech(out.speech, speechCtx);
    if (!fb.ok || mentionsGrade(out.speech)) {
      throw new Error(`coach fallback speech failed its own gate (${fb.ok ? "MENTIONS_GRADE" : fb.reason})`);
    }
    console.warn("[coach] all generation attempts rejected; delivering fallback");
    deps.trace?.({ kind: "FALLBACK", move: out.move });
    chosen = { out, closedAtSoftCap: false };
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
