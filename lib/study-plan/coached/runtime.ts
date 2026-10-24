/**
 * Coached session orchestration — step entry, coach turns, tip gating, leg
 * closure and completion (REQ-113/114/115/122).
 *
 * FIRST, re-read `.planning/phases/22-coached-mode/22-COACH-LAYER-DECISION.md`
 * before changing anything here: this module implements it. Binding
 * statements: the coach is the ONLY presence in a coached session; both legs
 * are real moments of the student's own (chosen by `selectCoachedMoments`),
 * never a generated scenario; the COACH closes each leg (LEG_DONE); there is
 * NO engine session, NO `InteractionReport` and no counterpart avatar (see
 * the decision's "No counterpart"). Mastery comes from the coach's graded
 * attempts via `recordCoachedContribution`.
 *
 * This module imports from `lib/engine/registry.ts` ONLY to read the
 * underlying type's display name; it is the ONLY place under `lib/study-plan/`
 * authorized to import from `lib/engine/` (`ENGINE_IMPORT_CARVE_OUTS`). It is
 * a CALLER only, modifies nothing under `lib/engine/`, and does NOT register a
 * `coached-practice` entry in `ENGINE_TYPES`.
 */
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { COMPETENCIES, type CompetencyKey } from "@/lib/mastery/competencies";
import { CONTRIBUTION_WEIGHTS } from "@/lib/mastery/weights";
import { getEngineType } from "@/lib/engine/registry";

import {
  createCoachedSession,
  finishCoachedSession,
  markReplayLegComplete,
  readCoachedSession,
  retargetLegacyCoachedSession,
  NotReachableOutsideAPathError,
  type CoachedPhase,
  type CoachedSessionView,
} from "./instance";
import { techniquesForCompetency, assertTipSafe } from "./tips";
import { gradedLegScore, recordCoachedContribution } from "./contribution";
import {
  selectCoachedMoments,
  NoQualifyingMomentError,
  type CoachedMomentSelection,
  type SelectionOpts,
} from "./moment-selection";
import { momentFramingFor } from "./moment-ranking";
import { resolveCoachForUser } from "./coach-identity";
import { rubricDimensionsForCompetency } from "./coach-prompt";
import {
  coachTurn,
  legStateFromTurns,
  type CoachedTurnRow,
  type CoachTurnDeps,
  type CoachTurnResult,
  type CoachTurnArgs,
} from "./coach";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the replay moment's transcript (or the specific turn within
 * it) cannot be read back. A paraphrased "your words" is the exact failure
 * 21-04's verbatim gate exists to prevent, arriving by a different door — so
 * this is a thrown error, never a substituted paraphrase.
 */
export class ReplayMomentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayMomentUnavailableError";
  }
}

/** No source report of the student's evidences this step's competency with
 * a readable transcript — there is nothing eligible to work on. */
export class NoEligibleReplayTargetError extends Error {
  constructor(stepId: string, competencyKey: string) {
    super(
      `No eligible replay target found for step ${stepId} (competency "${competencyKey}") — ` +
        `no source report has a qualifying moment for this competency.`,
    );
    this.name = "NoEligibleReplayTargetError";
  }
}

/**
 * Thrown by a GET-style read that must NOT create a session when the step
 * has none yet. A GET that creates is a GET a browser prefetch could start a
 * session with, and that must not be possible.
 */
export class CoachedSessionNotStartedError extends Error {
  constructor(stepId: string) {
    super(`Coached step ${stepId} has not been entered yet — POST to start it.`);
    this.name = "CoachedSessionNotStartedError";
  }
}

/**
 * Thrown by `advanceToFresh` / `completeCoachedSession` when called against
 * the wrong leg. REPLAY-then-FRESH is LOCKED by 21-CONTEXT.md; there is no
 * `advanceToReplay` and no way to reach FRESH without REPLAY having
 * completed, and no way to complete from REPLAY — both absences are
 * deliberate, not omissions.
 */
export class CoachedLegOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachedLegOrderError";
  }
}

/** Thrown when a leg is closed or advanced before the coach delivered LEG_DONE. */
export class CoachedLegNotDoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachedLegNotDoneError";
  }
}

// ---------------------------------------------------------------------------
// View shape
// ---------------------------------------------------------------------------

export interface CoachedMomentView {
  counterpartLine: string | null;
  studentLine: string;
  sourceReportId: string;
  turnIndex: number;
  sessionDate: string;
}

export interface CoachedTurnView {
  seq: number;
  speaker: "COACH" | "STUDENT";
  move: string;
  text: string;
  demonstration: string | null;
  /**
   * ALWAYS null in a live leg view. User decision 2026-10-24: technique tips
   * during the session, numeric grade ONLY at the end — so per-attempt scores
   * never leave the server mid-session. The graded numbers are in
   * `CoachedLegView.summary`, which exists only once the session is COMPLETE.
   */
  score: number | null;
  acceptable: boolean | null;
  parroted: boolean | null;
}

export interface CoachedLegView {
  coachedSessionId: string;
  leg: "REPLAY" | "FRESH" | "COMPLETE";
  legCount: 1 | 2;
  thinEvidence: boolean;
  competencyKey: CompetencyKey;
  competencyLabel: string;
  competencyDescription: string;
  coach: { name: string; avatarId: string; voiceId: string; isDefault: boolean };
  /** The CURRENT leg's moment, verbatim; null on COMPLETE. */
  moment: CoachedMomentView | null;
  /** Current leg, ordered by seq. */
  conversation: CoachedTurnView[];
  awaiting: "REPLY" | "ATTEMPT" | "NONE" | null;
  legReady: boolean;
  attemptsInLeg: number;
  /** Technique reminders for this leg. Every entry has passed the tip gate. */
  tips: Array<{ id: string; name: string; reminder: string }>;
  underlyingTypeSlug: string;
  underlyingTypeName: string;
  worth: { coachedWeight: number; unaidedWeight: number };
  selectionBasis: "PER_TURN_SCORE" | "GROWTH_AREA_FALLBACK";
  /** Current leg's moment: momentFramingFor(stored score) — REFINEMENT when above MAX_REWORKABLE_SCORE. */
  momentFraming: "REWORK" | "REFINEMENT";
  /** The graded end-of-session summary. Null until the session is COMPLETE. */
  summary: CoachedSessionSummary | null;
}

export interface CoachedLegSummaryAttempt {
  text: string;
  /** The coach's 1..5 grade of this attempt; null if it was not graded. */
  score: number | null;
  acceptable: boolean | null;
  parroted: boolean | null;
}

export interface CoachedLegSummary {
  leg: "REPLAY" | "FRESH";
  /** The original moment, verbatim. */
  moment: CoachedMomentView;
  /** The per-turn score the moment was selected with (1..5); null under the growth-area fallback. */
  originalScore: number | null;
  attempts: CoachedLegSummaryAttempt[];
  /**
   * The graded score this leg contributed to mastery — `gradedLegScore`, the
   * same rule `recordCoachedContribution` writes. Null when no usable attempt.
   */
  gradedScore: number | null;
  /** The attempt that earned `gradedScore` (latest of equal scores), verbatim. */
  gradedAttemptText: string | null;
  closedAtSoftCap: boolean;
}

export interface CoachedSessionSummary {
  legs: CoachedLegSummary[];
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// tipsForLeg
// ---------------------------------------------------------------------------

/**
 * Returns technique reminders for a leg, every one of which has passed
 * `assertTipSafe` — INCLUDING library entries. 21-16's library is safe by
 * construction, but a library edit after this module ships could still slip
 * past 21-16's own battery; re-running the gate here on every tip actually
 * rendered costs nothing and is what REQ-115 ("every tip actually rendered")
 * requires, as opposed to only at authoring time.
 *
 * A tip that fails the gate is DROPPED with a logged warning — not repaired,
 * not substituted. If zero survive, an empty array is returned: a coached
 * session with no tips is a worse session, but a scripted tip invalidates
 * the evidence (21-16's own documented tradeoff).
 *
 * Selection is deterministic (the library's own stable order, sliced), so
 * the same step entered twice shows the same reminders.
 */
export async function tipsForLeg(args: {
  competencyKey: CompetencyKey;
  leg: "REPLAY" | "FRESH";
  studentLine: string;
  max?: number;
}): Promise<CoachedLegView["tips"]> {
  const { competencyKey, studentLine, max = 3 } = args;

  const candidates = techniquesForCompetency(competencyKey).slice(0, max);
  const survivors: CoachedLegView["tips"] = [];

  for (const technique of candidates) {
    try {
      assertTipSafe(technique.reminder, { studentLine });
      survivors.push({
        id: technique.id,
        name: technique.name,
        reminder: technique.reminder,
      });
    } catch (err) {
      console.warn("tipsForLeg: dropped a tip that failed assertTipSafe", {
        competencyKey,
        techniqueId: technique.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return survivors;
}

// ---------------------------------------------------------------------------
// Moment resolution (the S3 read lives here, never in instance.ts)
// ---------------------------------------------------------------------------

interface LegContext {
  leg: "REPLAY" | "FRESH";
  moment: CoachedMomentView;
  typeSlug: string;
  typeName: string;
  framing: "REWORK" | "REFINEMENT";
}

async function resolveLegContext(
  userId: string,
  session: CoachedSessionView,
  leg: "REPLAY" | "FRESH",
): Promise<LegContext> {
  const reportId = leg === "REPLAY" ? session.replaySourceReportId : session.freshSourceReportId;
  const turnIndex = leg === "REPLAY" ? session.replayTurnIndex : session.freshTurnIndex;
  const score = leg === "REPLAY" ? session.replayMomentScore : session.freshMomentScore;
  if (reportId === null || turnIndex === null) {
    throw new ReplayMomentUnavailableError(
      `resolveLegContext: session ${session.id} has no ${leg} moment`,
    );
  }

  const report = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
    select: { typeSlug: true, createdAt: true },
  });
  if (!report) {
    throw new ReplayMomentUnavailableError(
      `resolveLegContext: source report ${reportId} no longer exists for user ${userId}`,
    );
  }
  // Reading the registry is not registering in it.
  const engineType = getEngineType(report.typeSlug);
  if (!engineType) {
    throw new Error(
      `resolveLegContext: report typeSlug "${report.typeSlug}" is not a member of ENGINE_TYPES`,
    );
  }

  const transcript = await s3Storage.getInterviewTranscript(userId, reportId);
  const turn = transcript?.turns[turnIndex];
  if (!transcript || !turn) {
    throw new ReplayMomentUnavailableError(
      `resolveLegContext: transcript or turn ${turnIndex} unavailable for report ${reportId}`,
    );
  }
  let counterpartLine: string | null = null;
  for (let i = turnIndex - 1; i >= 0; i -= 1) {
    if (transcript.turns[i].role === "assistant") {
      counterpartLine = transcript.turns[i].content; // VERBATIM
      break;
    }
  }

  return {
    leg,
    moment: {
      counterpartLine,
      studentLine: turn.content, // VERBATIM — no trim/re-case/re-wrap.
      sourceReportId: reportId,
      turnIndex,
      sessionDate: report.createdAt.toISOString(),
    },
    typeSlug: report.typeSlug,
    typeName: engineType.name,
    framing: momentFramingFor(score),
  };
}

function loadTurnRows(coachedSessionId: string): Promise<CoachedTurnRow[]> {
  return prisma.coachedTurn.findMany({
    where: { coachedSessionId },
    orderBy: { seq: "asc" },
  }) as Promise<CoachedTurnRow[]>;
}

// ---------------------------------------------------------------------------
// Step ownership
// ---------------------------------------------------------------------------

async function loadOwnedCoachedStep(userId: string, stepId: string) {
  const step = await prisma.studyPlanPathStep.findFirst({
    where: { id: stepId, path: { userId } },
  });
  if (!step || step.kind !== "COACHED_SESSION") {
    throw new NotReachableOutsideAPathError(stepId);
  }
  return step;
}

// ---------------------------------------------------------------------------
// enterCoachedStep / buildLegView
// ---------------------------------------------------------------------------

function competencyInfo(key: CompetencyKey) {
  const c = COMPETENCIES.find((x) => x.key === key);
  return {
    label: c?.label ?? key,
    description: (c as { description?: string } | undefined)?.description ?? "",
  };
}

/**
 * The graded end-of-session summary: per leg, the original moment, every
 * graded attempt, and the score that leg contributed to mastery. Built only
 * for a COMPLETE session — mid-session views carry no numbers at all.
 */
async function buildSessionSummary(
  userId: string,
  session: CoachedSessionView,
  replayCtx: LegContext,
): Promise<CoachedSessionSummary> {
  const rows = await loadTurnRows(session.id);
  const legs: Array<"REPLAY" | "FRESH"> = session.legCount === 2 ? ["REPLAY", "FRESH"] : ["REPLAY"];
  const summaries: CoachedLegSummary[] = [];

  for (const leg of legs) {
    let ctx: LegContext;
    try {
      ctx = leg === "REPLAY" ? replayCtx : await resolveLegContext(userId, session, leg);
    } catch (error) {
      // A source transcript that vanished after completion must not take the
      // whole summary down; that leg is simply omitted.
      console.warn("[coached] summary: leg context unavailable", { leg, error });
      continue;
    }
    const legRows = rows.filter((r) => r.leg === leg);
    const attemptRows = legRows.filter((r) => r.speaker === "STUDENT" && r.move === "ATTEMPT");
    const closure = legRows.find((r) => r.speaker === "COACH" && r.move === "LEG_DONE");
    const closedAtSoftCap = closure?.closedAtSoftCap === true;
    const gradedScore = closure
      ? gradedLegScore(
          attemptRows.map((r) => ({ leg, score: r.score, acceptable: r.acceptable, parroted: r.parroted })),
          { leg, closedAtSoftCap: closure.closedAtSoftCap },
        )
      : null;
    const gradedAttempt =
      gradedScore === null
        ? null
        : [...attemptRows].reverse().find((r) => r.score === gradedScore && r.parroted !== true) ?? null;

    summaries.push({
      leg,
      moment: ctx.moment,
      originalScore: leg === "REPLAY" ? session.replayMomentScore : session.freshMomentScore,
      attempts: attemptRows.map((r) => ({
        text: r.text,
        score: r.score,
        acceptable: r.acceptable,
        parroted: r.parroted,
      })),
      gradedScore,
      gradedAttemptText: gradedAttempt?.text ?? null,
      closedAtSoftCap,
    });
  }

  return {
    legs: summaries,
    completedAt: session.completedAt ? new Date(session.completedAt).toISOString() : null,
  };
}

/**
 * Builds the `CoachedLegView` for an existing session. The current leg's
 * moment text is re-read from the transcript on every call.
 */
async function buildLegView(
  userId: string,
  session: CoachedSessionView,
): Promise<CoachedLegView> {
  const competencyKey = session.competencyKey as CompetencyKey;
  const info = competencyInfo(competencyKey);
  const coach = await resolveCoachForUser(userId);
  const phase = session.phase;
  // A pre-Phase-22 row has no basis; it is shown stale until a POST re-targets it.
  const selectionBasis = session.selectionBasis ?? "GROWTH_AREA_FALLBACK";
  const worth = {
    coachedWeight: CONTRIBUTION_WEIGHTS.COACHED_SESSION,
    unaidedWeight: CONTRIBUTION_WEIGHTS.LIVE_SESSION,
  };

  if (phase === "COMPLETE") {
    const ctx = await resolveLegContext(userId, session, "REPLAY");
    const summary = await buildSessionSummary(userId, session, ctx);
    return {
      coachedSessionId: session.id,
      leg: "COMPLETE",
      legCount: session.legCount,
      thinEvidence: session.legCount === 1,
      competencyKey,
      competencyLabel: info.label,
      competencyDescription: info.description,
      coach,
      moment: null,
      conversation: [],
      awaiting: "NONE",
      legReady: true,
      attemptsInLeg: 0,
      tips: [],
      underlyingTypeSlug: ctx.typeSlug,
      underlyingTypeName: ctx.typeName,
      worth,
      selectionBasis,
      momentFraming: ctx.framing,
      summary,
    };
  }

  const ctx = await resolveLegContext(userId, session, phase);
  const rows = await loadTurnRows(session.id);
  const state = legStateFromTurns(rows, phase);
  const conversation: CoachedTurnView[] = rows
    .filter((r) => r.leg === phase)
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({
      seq: r.seq,
      speaker: r.speaker === "COACH" ? ("COACH" as const) : ("STUDENT" as const),
      move: r.move,
      text: r.text,
      demonstration: r.demonstration,
      // Numeric grade only at the end (user decision 2026-10-24).
      score: null,
      acceptable: r.acceptable,
      parroted: r.parroted,
    }));
  const tips = await tipsForLeg({
    competencyKey,
    leg: phase,
    studentLine: ctx.moment.studentLine,
  });

  return {
    coachedSessionId: session.id,
    leg: phase,
    legCount: session.legCount,
    thinEvidence: session.legCount === 1,
    competencyKey,
    competencyLabel: info.label,
    competencyDescription: info.description,
    coach,
    moment: ctx.moment,
    conversation,
    awaiting: state.awaiting,
    legReady: state.legReady,
    attemptsInLeg: state.attemptsInLeg,
    tips,
    underlyingTypeSlug: ctx.typeSlug,
    underlyingTypeName: ctx.typeName,
    worth,
    selectionBasis,
    momentFraming: ctx.framing,
    summary: null,
  };
}

async function selectForStep(
  userId: string,
  stepId: string,
  competencyKey: CompetencyKey,
  scorer: SelectionOpts["scorer"],
): Promise<CoachedMomentSelection> {
  try {
    return await selectCoachedMoments(
      { userId, pathStepId: stepId, competencyKey },
      scorer ? { scorer } : undefined,
    );
  } catch (err) {
    if (err instanceof NoQualifyingMomentError) {
      throw new NoEligibleReplayTargetError(stepId, competencyKey);
    }
    throw err;
  }
}

function targetsFrom(sel: CoachedMomentSelection) {
  return {
    replaySourceReportId: sel.replay.reportId,
    replayTurnIndex: sel.replay.turnIndex,
    freshSourceReportId: sel.fresh?.reportId ?? null,
    freshTurnIndex: sel.fresh?.turnIndex ?? null,
    selectionBasis: sel.basis,
    replayMomentScore: sel.replay.score,
    freshMomentScore: sel.fresh?.score ?? null,
  };
}

/**
 * Enters (creating if needed) or resumes a `COACHED_SESSION` path step.
 *
 * `opts.createIfMissing` defaults to `true`. The HTTP GET handler passes
 * `false` so a GET can never create or re-target a session.
 *
 * A session started under the Phase 21 rules (`selectionBasis === null`, not
 * completed) carries no coach work; on a POST it is re-targeted to real
 * moments. A completed one is left alone.
 */
export async function enterCoachedStep(
  args: { userId: string; stepId: string },
  opts: { createIfMissing?: boolean; scorer?: SelectionOpts["scorer"] } = {},
): Promise<CoachedLegView> {
  const { userId, stepId } = args;
  const createIfMissing = opts.createIfMissing ?? true;

  // THE ONLY ENTRY — require an already-persisted, user-owned COACHED_SESSION step.
  const step = await loadOwnedCoachedStep(userId, stepId);
  const competencyKey = step.competencyKey as CompetencyKey;

  let session: CoachedSessionView;

  if (step.coachedSessionId) {
    const existing = await readCoachedSession(userId, step.coachedSessionId);
    if (!existing) throw new NotReachableOutsideAPathError(stepId);
    session = existing;
    if (session.selectionBasis === null && session.completedAt === null && createIfMissing) {
      const sel = await selectForStep(userId, stepId, competencyKey, opts.scorer);
      session = await retargetLegacyCoachedSession(userId, session.id, targetsFrom(sel));
    }
  } else {
    if (!createIfMissing) {
      throw new CoachedSessionNotStartedError(stepId);
    }
    const sel = await selectForStep(userId, stepId, competencyKey, opts.scorer);
    session = await createCoachedSession({
      userId,
      pathStepId: stepId,
      ...targetsFrom(sel),
    });
  }

  return buildLegView(userId, session);
}

// ---------------------------------------------------------------------------
// takeCoachTurn
// ---------------------------------------------------------------------------

/**
 * One coach turn. The session is resolved from the owned step — a session id
 * is never accepted from the caller. `utterance === null` asks the coach to
 * open or resume the leg.
 */
export async function takeCoachTurn(
  args: { userId: string; stepId: string; utterance: CoachTurnArgs["utterance"] },
  deps: CoachTurnDeps = {},
): Promise<{ coachTurn: CoachTurnResult; leg: CoachedLegView }> {
  const { userId, stepId, utterance } = args;
  const step = await loadOwnedCoachedStep(userId, stepId);
  if (!step.coachedSessionId) throw new CoachedSessionNotStartedError(stepId);

  const session = await readCoachedSession(userId, step.coachedSessionId);
  if (!session) throw new NotReachableOutsideAPathError(stepId);
  if (session.phase === "COMPLETE") {
    throw new CoachedLegOrderError(
      `takeCoachTurn: session ${session.id} is already complete.`,
    );
  }

  const ctx = await resolveLegContext(userId, session, session.phase);
  const competencyKey = session.competencyKey as CompetencyKey;
  const info = competencyInfo(competencyKey);
  const coach = await resolveCoachForUser(userId);

  const result = await coachTurn(
    {
      userId,
      coachedSessionId: session.id,
      leg: session.phase,
      legCount: session.legCount,
      momentFraming: ctx.framing,
      moment: {
        counterpartLine: ctx.moment.counterpartLine,
        studentLine: ctx.moment.studentLine,
      },
      coach,
      competency: { key: competencyKey, label: info.label, description: info.description },
      rubricDimensions: rubricDimensionsForCompetency(ctx.typeSlug, competencyKey),
      underlyingTypeName: ctx.typeName,
      utterance,
    },
    deps,
  );

  return { coachTurn: result, leg: await buildLegView(userId, session) };
}

// ---------------------------------------------------------------------------
// nextLeg — the pure leg-transition rule, factored out so
// scripts/verify-coached-entry.ts section 2 can exercise the full table
// with no database.
// ---------------------------------------------------------------------------

export type CoachedAction = "advance" | "complete";
export type LegTransitionResult = "FRESH" | "COMPLETE" | "REJECTED";

/**
 * The full REPLAY-then-FRESH ordering, as data. With a fresh moment:
 * REPLAY + advance -> FRESH; REPLAY + complete -> REJECTED; FRESH + advance ->
 * REJECTED; FRESH + complete -> COMPLETE; COMPLETE + anything -> REJECTED.
 * Without one (thin evidence, one leg): REPLAY + complete -> COMPLETE and
 * REPLAY + advance -> REJECTED.
 */
export function nextLeg(
  current: CoachedPhase,
  action: CoachedAction,
  opts: { hasFreshMoment: boolean } = { hasFreshMoment: true },
): LegTransitionResult {
  if (current === "REPLAY" && action === "advance" && opts.hasFreshMoment) return "FRESH";
  if (current === "REPLAY" && action === "complete" && !opts.hasFreshMoment) return "COMPLETE";
  if (current === "FRESH" && action === "complete" && opts.hasFreshMoment) return "COMPLETE";
  return "REJECTED";
}

async function currentLegReady(session: CoachedSessionView): Promise<boolean> {
  if (session.phase === "COMPLETE") return false;
  const rows = await loadTurnRows(session.id);
  return legStateFromTurns(rows, session.phase).legReady;
}

// ---------------------------------------------------------------------------
// advanceToFresh
// ---------------------------------------------------------------------------

/**
 * Advances a session from REPLAY to FRESH. Requires REPLAY, a fresh moment,
 * and a REPLAY leg the coach has closed (LEG_DONE). There is NO
 * `advanceToReplay` and no way to reach FRESH without REPLAY having
 * completed — both absences are deliberate.
 */
export async function advanceToFresh(args: {
  userId: string;
  coachedSessionId: string;
}): Promise<CoachedLegView> {
  const { userId, coachedSessionId } = args;

  const session = await readCoachedSession(userId, coachedSessionId);
  if (!session) throw new NotReachableOutsideAPathError(coachedSessionId);

  if (nextLeg(session.phase, "advance", { hasFreshMoment: session.legCount === 2 }) === "REJECTED") {
    throw new CoachedLegOrderError(
      `advanceToFresh: session ${coachedSessionId} is in phase "${session.phase}" with ${session.legCount} leg(s) — ` +
        `FRESH is reachable only from a completed REPLAY leg of a two-leg session.`,
    );
  }
  if (!(await currentLegReady(session))) {
    throw new CoachedLegNotDoneError(
      `advanceToFresh: the coach has not closed the REPLAY leg of session ${coachedSessionId}.`,
    );
  }

  await markReplayLegComplete(userId, coachedSessionId);
  const updated = await readCoachedSession(userId, coachedSessionId);
  if (!updated) throw new NotReachableOutsideAPathError(coachedSessionId);
  return buildLegView(userId, updated);
}

// ---------------------------------------------------------------------------
// completeCoachedSession
// ---------------------------------------------------------------------------

/**
 * Completes a coached session once its final leg is coach-closed (FRESH for a
 * two-leg session, REPLAY for a thin-evidence one).
 *
 * ORDER IS MANDATORY: `finishCoachedSession` FIRST, `recordCoachedContribution`
 * SECOND. `recordCoachedContribution` requires `completedAt` and THROWS
 * otherwise. Each is called exactly once.
 */
export async function completeCoachedSession(args: {
  userId: string;
  coachedSessionId: string;
}): Promise<{ contributionsWritten: number }> {
  const { userId, coachedSessionId } = args;

  const session = await readCoachedSession(userId, coachedSessionId);
  if (!session) throw new NotReachableOutsideAPathError(coachedSessionId);

  if (nextLeg(session.phase, "complete", { hasFreshMoment: session.legCount === 2 }) === "REJECTED") {
    throw new CoachedLegOrderError(
      `completeCoachedSession: session ${coachedSessionId} is in phase "${session.phase}" with ${session.legCount} leg(s) — ` +
        `it cannot be completed from here.`,
    );
  }
  if (!(await currentLegReady(session))) {
    throw new CoachedLegNotDoneError(
      `completeCoachedSession: the coach has not closed the ${session.phase} leg of session ${coachedSessionId}.`,
    );
  }

  await finishCoachedSession(userId, coachedSessionId);
  const { written } = await recordCoachedContribution({ userId, coachedSessionId });

  return { contributionsWritten: written };
}

export type { CoachedPhase };
