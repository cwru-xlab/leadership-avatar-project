/**
 * Coached session REPLAY-to-FRESH orchestration — step entry, tip gating,
 * leg advancement, and completion (REQ-113/114/115/122).
 *
 * FIRST, re-read `.planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md`
 * before changing anything here: this module implements that decision rather
 * than re-deciding it. Binding statements this module relies on: coached mode
 * REUSES the engine's live session machinery but is NOT an `ENGINE_TYPES`
 * entry; it runs over the competency's underlying interaction type — the same
 * type the replayed moment came from; it produces a normal `InteractionReport`
 * scored by the existing evaluator; `CoachedSession.reportId` is the join
 * mastery reads to tell a coached report from an unaided one.
 *
 * This module imports from `lib/engine/registry.ts` ONLY to validate the
 * underlying type slug resolves to a real, built-in engine type — it is the
 * ONLY place under `lib/study-plan/` authorized to import from `lib/engine/`
 * (`scripts/verify-knowledge-check-surface.ts`'s `ENGINE_IMPORT_CARVE_OUTS`
 * names exactly `lib/study-plan/coached/`, granted by the decision document
 * named above). This module is a CALLER only — it does NOT modify anything
 * under `lib/engine/`, and it does NOT register a `coached-practice` entry
 * in `ENGINE_TYPES` (21-12's section 2 guard still asserts the registry's
 * length is unchanged).
 */
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { asScoreMap } from "@/lib/report/snapshot";
import { contributionInputsFromScoreMap } from "@/lib/mastery/from-report";
import { COMPETENCIES, type CompetencyKey } from "@/lib/mastery/competencies";
import { getEngineType } from "@/lib/engine/registry";

import {
  createCoachedSession,
  finishCoachedSession,
  readCoachedSession,
  NotReachableOutsideAPathError,
  type CoachedPhase,
  type CoachedSessionView,
} from "./instance";
import { techniquesForCompetency, assertTipSafe } from "./tips";
import { recordCoachedContribution } from "./contribution";

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
 * a readable transcript — there is nothing eligible to replay. */
export class NoEligibleReplayTargetError extends Error {
  constructor(stepId: string, competencyKey: string) {
    super(
      `No eligible replay target found for step ${stepId} (competency "${competencyKey}") — ` +
        `no source report both scores this competency and has a readable transcript.`,
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

// ---------------------------------------------------------------------------
// View shape
// ---------------------------------------------------------------------------

export interface CoachedLegView {
  coachedSessionId: string;
  leg: "REPLAY" | "FRESH" | "COMPLETE";
  competencyKey: CompetencyKey;
  /** REPLAY only: the student's own words being reworked, verbatim. */
  replayMoment: { text: string; sourceReportId: string; turnIndex: number } | null;
  /** FRESH only: the new situation exercising the same competency. */
  freshScenarioPrompt: string | null;
  /** Technique reminders for this leg. Every entry has passed the tip gate. */
  tips: Array<{ id: string; name: string; reminder: string }>;
  /** The engine type slug this leg runs over, for the session transport. */
  underlyingTypeSlug: string;
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
// Replay-target selection (deterministic) + the S3 transcript read
// ---------------------------------------------------------------------------

interface ReplayTarget {
  reportId: string;
  turnIndex: number;
  studentText: string;
}

/**
 * Selects the student's weakest-scoring source report for this competency,
 * deterministically: lowest normalized dimension score mapping to the
 * competency, tie-broken by most recent report. Within the chosen report,
 * the replay turn is the first (lowest-index) student ("user") turn with
 * non-empty content. Deterministic so a student who reloads before entering
 * gets the same moment.
 *
 * Reuses `contributionInputsFromScoreMap` (21-21's pure scoring step) purely
 * to compute each report's normalized per-competency score — nothing is
 * written here; this is a read-only selection.
 */
async function selectReplayTarget(
  userId: string,
  pathStepId: string,
  competencyKey: CompetencyKey,
): Promise<ReplayTarget> {
  const step = await prisma.studyPlanPathStep.findFirst({
    where: { id: pathStepId },
    select: {
      path: { select: { studyPlan: { select: { sourceReportIds: true } } } },
    },
  });

  const sourceReportIds = Array.isArray(step?.path.studyPlan.sourceReportIds)
    ? (step.path.studyPlan.sourceReportIds as unknown[]).filter(
        (id): id is string => typeof id === "string",
      )
    : [];

  if (sourceReportIds.length === 0) {
    throw new NoEligibleReplayTargetError(pathStepId, competencyKey);
  }

  const reports = await prisma.interactionReport.findMany({
    where: { id: { in: sourceReportIds }, userId, transcriptKey: { not: null } },
    select: { id: true, scores: true, createdAt: true },
  });

  let best: { reportId: string; rawScore: number; createdAt: Date } | null = null;

  for (const report of reports) {
    const scoreMap = asScoreMap(report.scores);
    if (!scoreMap) continue;

    const { inputs } = contributionInputsFromScoreMap({
      scores: scoreMap,
      userId,
      // Placeholder source/occurredAt: this call computes a read-only
      // per-competency rawScore for SELECTION, it writes nothing. The real
      // write (with the real source/occurredAt) happens only in
      // `recordCoachedContribution` (21-16), after the session completes.
      source: "COACHED_SESSION",
      occurredAt: report.createdAt,
      sourceReportId: report.id,
    });

    const match = inputs.find((i) => i.competencyKey === competencyKey);
    if (!match) continue;

    if (
      !best ||
      match.rawScore < best.rawScore ||
      (match.rawScore === best.rawScore && report.createdAt > best.createdAt)
    ) {
      best = { reportId: report.id, rawScore: match.rawScore, createdAt: report.createdAt };
    }
  }

  if (!best) {
    throw new NoEligibleReplayTargetError(pathStepId, competencyKey);
  }

  // THE S3 READ 21-12 DELIBERATELY PUSHED OUT OF instance.ts — it belongs
  // here. Same accessor `lib/study-plan/checks/sources.ts` (21-25) already
  // uses: `s3Storage.getInterviewTranscript`.
  const transcript = await s3Storage.getInterviewTranscript(userId, best.reportId);
  if (!transcript) {
    throw new ReplayMomentUnavailableError(
      `selectReplayTarget: no transcript readable for report ${best.reportId}`,
    );
  }

  const turnIndex = transcript.turns.findIndex(
    (t) => t.role === "user" && t.content.trim().length > 0,
  );
  if (turnIndex === -1) {
    throw new ReplayMomentUnavailableError(
      `selectReplayTarget: no student turn found in transcript for report ${best.reportId}`,
    );
  }

  return {
    reportId: best.reportId,
    turnIndex,
    // VERBATIM — the next lines return this exactly, no trim/re-case/re-wrap.
    studentText: transcript.turns[turnIndex].content,
  };
}

/**
 * The real model call for the fresh scenario's text, isolated so it can be
 * swapped in tests. Generates ONLY the scenario text — no words for the
 * student to say.
 */
async function defaultGenerateFreshScenarioText(args: {
  competencyKey: CompetencyKey;
  studentLine: string;
}): Promise<string> {
  const { competencyKey, studentLine } = args;
  const competency = COMPETENCIES.find((c) => c.key === competencyKey);
  const model = process.env.CHECK_GENERATION_MODEL || "gpt-4.1";

  const system =
    "You write a brief new practice scenario for a leadership-practice student. " +
    "The scenario must exercise the SAME competency a prior moment evidenced, but must " +
    "describe a DIFFERENT situation — it must not restate, quote, paraphrase, or echo the " +
    "student's own prior words. Describe only the SITUATION the student will face; never " +
    "write a line of dialogue or any words for the student to say. 2-4 sentences.";
  const user =
    `Competency: ${competency?.label ?? competencyKey}\n\n` +
    `The student's prior moment (context only — do NOT quote or echo this):\n"""\n${studentLine}\n"""\n\n` +
    "Write the new scenario now.";

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 50_000,
    maxRetries: 0,
  });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 400,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("defaultGenerateFreshScenarioText: model returned no content");
  }
  return text;
}

async function generateFreshScenarioPrompt(args: {
  competencyKey: CompetencyKey;
  studentLine: string;
}): Promise<string> {
  const text = await defaultGenerateFreshScenarioText(args);

  // A scenario that echoes the student's own line back is the replay again,
  // not a transfer test — gated through the same tip-safety rejector before
  // persisting, with the replayed line as context.studentLine.
  assertTipSafe(text, { studentLine: args.studentLine });
  return text;
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

/**
 * Builds the `CoachedLegView` for an existing session, re-reading the
 * replay transcript turn on every call (needed both to render it on REPLAY
 * and as `assertTipSafe`'s `studentLine` context on every leg) and
 * resolving `underlyingTypeSlug` from the replayed report's own `typeSlug`.
 */
async function buildLegView(
  userId: string,
  session: CoachedSessionView,
): Promise<CoachedLegView> {
  const replayReport = await prisma.interactionReport.findFirst({
    where: { id: session.replaySourceReportId, userId },
    select: { typeSlug: true },
  });
  if (!replayReport) {
    throw new ReplayMomentUnavailableError(
      `buildLegView: replay source report ${session.replaySourceReportId} no longer exists for user ${userId}`,
    );
  }
  // Reading the registry is not registering in it — ENGINE_TYPES gains no
  // coached entry by this lookup; 21-12's section 2 guard still asserts
  // that. This only confirms the underlying type is a real, built-in one.
  if (!getEngineType(replayReport.typeSlug)) {
    throw new Error(
      `buildLegView: replay report's typeSlug "${replayReport.typeSlug}" is not a member of ENGINE_TYPES`,
    );
  }

  const transcript = await s3Storage.getInterviewTranscript(userId, session.replaySourceReportId);
  const turn = transcript?.turns[session.replayTurnIndex];
  if (!transcript || !turn) {
    throw new ReplayMomentUnavailableError(
      `buildLegView: transcript or turn ${session.replayTurnIndex} unavailable for report ${session.replaySourceReportId}`,
    );
  }
  const studentLine = turn.content;

  const leg = session.phase;
  const competencyKey = session.competencyKey as CompetencyKey;

  const replayMoment =
    leg === "REPLAY"
      ? {
          // VERBATIM — no trim/re-case/re-wrap.
          text: studentLine,
          sourceReportId: session.replaySourceReportId,
          turnIndex: session.replayTurnIndex,
        }
      : null;

  const freshScenarioPrompt = leg === "FRESH" ? session.freshScenarioPrompt : null;

  const tips =
    leg === "COMPLETE"
      ? []
      : await tipsForLeg({ competencyKey, leg, studentLine });

  return {
    coachedSessionId: session.id,
    leg,
    competencyKey,
    replayMoment,
    freshScenarioPrompt,
    tips,
    underlyingTypeSlug: replayReport.typeSlug,
  };
}

/**
 * Enters (creating if needed) or resumes a `COACHED_SESSION` path step.
 *
 * `opts.createIfMissing` defaults to `true`. The HTTP GET handler (resume /
 * poll) passes `false` so a GET can never create a session — see
 * `CoachedSessionNotStartedError` above.
 */
export async function enterCoachedStep(
  args: { userId: string; stepId: string },
  opts: { createIfMissing?: boolean } = {},
): Promise<CoachedLegView> {
  const { userId, stepId } = args;
  const createIfMissing = opts.createIfMissing ?? true;

  // 1. THE ONLY ENTRY — require an already-persisted, user-owned
  // COACHED_SESSION step. This re-checks what `createCoachedSession` also
  // checks, because this function ALSO runs on the RESUME path where
  // `createCoachedSession` is never called.
  const step = await loadOwnedCoachedStep(userId, stepId);

  let session: CoachedSessionView;

  if (step.coachedSessionId) {
    const existing = await readCoachedSession(userId, step.coachedSessionId);
    if (!existing) throw new NotReachableOutsideAPathError(stepId);
    session = existing;
  } else {
    if (!createIfMissing) {
      throw new CoachedSessionNotStartedError(stepId);
    }

    const competencyKey = step.competencyKey as CompetencyKey;
    const target = await selectReplayTarget(userId, stepId, competencyKey);
    const freshScenarioPrompt = await generateFreshScenarioPrompt({
      competencyKey,
      studentLine: target.studentText,
    });

    session = await createCoachedSession({
      userId,
      pathStepId: stepId,
      replaySourceReportId: target.reportId,
      replayTurnIndex: target.turnIndex,
      freshScenarioPrompt,
    });
  }

  return buildLegView(userId, session);
}

// ---------------------------------------------------------------------------
// advanceToFresh
// ---------------------------------------------------------------------------

/**
 * Advances a session from REPLAY to FRESH. Requires the session be in
 * REPLAY — throws `CoachedLegOrderError` if already FRESH or COMPLETE; the
 * ordering is LOCKED by 21-CONTEXT.md ("replay first, then fresh") and a
 * caller that could skip the replay would make REQ-114 false while the data
 * still looked right.
 *
 * `replayReportId` is the `InteractionReport` the REPLAY leg's own live
 * conversation produced (the engine session machinery produces one for
 * every live session, REPLAY included). Recording it here, in
 * `CoachedSession.reportId`, is what makes `readCoachedSession`'s derivation
 * (`reportId` set => FRESH) read correctly the instant REPLAY finishes;
 * `completeCoachedSession` below OVERWRITES this same column with the FRESH
 * leg's own report id when the session actually completes. There is NO
 * `advanceToReplay` and no way to reach FRESH without REPLAY having
 * completed — both absences are deliberate.
 */
export async function advanceToFresh(args: {
  userId: string;
  coachedSessionId: string;
  replayReportId: string;
}): Promise<CoachedLegView> {
  const { userId, coachedSessionId, replayReportId } = args;

  const session = await readCoachedSession(userId, coachedSessionId);
  if (!session) throw new NotReachableOutsideAPathError(coachedSessionId);

  if (session.phase !== "REPLAY") {
    throw new CoachedLegOrderError(
      `advanceToFresh: session ${coachedSessionId} is in phase "${session.phase}", not REPLAY — ` +
        `there is no advanceToReplay and no way to reach FRESH without REPLAY completing first.`,
    );
  }

  const replayReport = await prisma.interactionReport.findFirst({
    where: { id: replayReportId, userId },
    select: { id: true },
  });
  if (!replayReport) {
    throw new ReplayMomentUnavailableError(
      `advanceToFresh: replayReportId ${replayReportId} does not exist or is not owned by user ${userId}`,
    );
  }

  await prisma.coachedSession.update({
    where: { id: coachedSessionId },
    data: { reportId: replayReportId },
  });

  const updated = await readCoachedSession(userId, coachedSessionId);
  if (!updated) throw new NotReachableOutsideAPathError(coachedSessionId);

  return buildLegView(userId, updated);
}

// ---------------------------------------------------------------------------
// completeCoachedSession
// ---------------------------------------------------------------------------

/**
 * Completes a coached session. Requires the session be in FRESH — a session
 * completed from REPLAY would evidence only the scaffolded leg.
 *
 * ORDER IS MANDATORY: `finishCoachedSession` FIRST, `recordCoachedContribution`
 * SECOND. `recordCoachedContribution` (21-16) requires `completedAt` and
 * `reportId` to be non-null and THROWS otherwise — `finishCoachedSession`
 * (21-12) is what sets both, so calling the contribution writer first always
 * fails. This is a correctness property of the two modules' own contracts,
 * not a style preference.
 *
 * Each is called exactly once. Both are individually idempotent
 * (`finishCoachedSession` throws on a second finish; `recordCoachedContribution`
 * returns `{ written: 0 }` on a retry) — that idempotence is a safety net for
 * a retried request, not a license to call either twice on purpose here.
 */
export async function completeCoachedSession(args: {
  userId: string;
  coachedSessionId: string;
  reportId: string;
}): Promise<{ contributionsWritten: number }> {
  const { userId, coachedSessionId, reportId } = args;

  const session = await readCoachedSession(userId, coachedSessionId);
  if (!session) throw new NotReachableOutsideAPathError(coachedSessionId);

  if (session.phase !== "FRESH") {
    throw new CoachedLegOrderError(
      `completeCoachedSession: session ${coachedSessionId} is in phase "${session.phase}", not FRESH — ` +
        `a session completed from REPLAY would evidence only the scaffolded leg.`,
    );
  }

  await finishCoachedSession(userId, coachedSessionId, reportId);
  const { written } = await recordCoachedContribution({ userId, coachedSessionId });

  return { contributionsWritten: written };
}

export type { CoachedPhase };
