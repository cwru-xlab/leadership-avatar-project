/**
 * Selects the two real moments a coached session works on (22-07).
 *
 * Pipeline: loadGenerationSources (REQ-123's single ownership-scoped assembler)
 * -> keep reports that scored the competency -> pleasantry filter (BEFORE any
 * model spend) -> prepareMomentsForGeneration (the only path by which transcript
 * text may reach a model call) -> per-turn scorer -> rankCoachedMoments.
 *
 * The REPLAY moment is the student's lowest-scored qualifying turn on the
 * competency, NOT turn index 0. The same moment comes back every time because
 * scores are cached and ranking is a total order.
 *
 * NO SCORE CUTOFF: a best moment scored 4 or 5 is still selected and framed
 * REFINEMENT. Entry fails (NoQualifyingMomentError) only when no turn qualifies.
 *
 * FALLBACK IS RECORDED, NEVER SILENT: if EVERY report's scoring failed, linked
 * growth areas stand in and `basis` says GROWTH_AREA_FALLBACK. Partial failure
 * is not a fallback trigger; what scored is ranked.
 *
 * `selectCoachedMomentsFromReports` is also what the path route's placement
 * guard calls, so placement and entry use the same `isQualifyingMoment`
 * predicate and a placed step cannot dead-end.
 */
import { prisma } from "@/lib/prisma";
import type { CompetencyKey } from "@/lib/mastery/competencies";
import {
  loadGenerationSources,
  type LoadGenerationSourcesOpts,
} from "@/lib/study-plan/checks/sources";
import { prepareMomentsForGeneration } from "@/lib/study-plan/moment-boundary";
import type { SessionMoment } from "@/lib/study-plan/moments";
import { loadCoachedEvidence } from "./evidence";
import {
  isPleasantry,
  rankCoachedMoments,
  rankCoachedMomentsByGrowthArea,
  type MomentFraming,
  type RankableMoment,
  type TurnPosition,
} from "./moment-ranking";
import {
  scoreTurnsForCompetency,
  type TurnScore,
  type TurnScorer,
} from "./moment-scoring";

export interface SelectedMoment {
  reportId: string;
  turnIndex: number;
  /** VERBATIM from the transcript. The coached session replays this text on
   * screen so the student can compare their rework against the original; it
   * must never be trimmed, paraphrased or redacted after selection. */
  studentText: string;
  precedingAvatarText: string | null;
  reportCreatedAt: Date;
  score: number | null;
  framing: MomentFraming;
}

export interface CoachedMomentSelection {
  replay: SelectedMoment;
  /** null = thin evidence: no second distinct qualifying moment. */
  fresh: SelectedMoment | null;
  basis: "PER_TURN_SCORE" | "GROWTH_AREA_FALLBACK";
}

export interface SelectionOpts {
  scorer?: TurnScorer;
  /** Injected for tests; passed straight through to loadGenerationSources. */
  readTranscript?: LoadGenerationSourcesOpts["readTranscript"];
}

/** Defined here (not runtime.ts's NoEligibleReplayTargetError) to avoid a
 * runtime <-> selection import cycle; 22-12 maps one to the other. */
export class NoQualifyingMomentError extends Error {
  constructor(public readonly competencyKey: CompetencyKey) {
    super(`No qualifying moment for competency ${competencyKey}`);
    this.name = "NoQualifyingMomentError";
  }
}

function key(reportId: string, turnIndex: number): string {
  return `${reportId}#${turnIndex}`;
}

function toSelected(
  m: RankableMoment,
  framing: MomentFraming,
  preceding: Map<string, string | null>,
): SelectedMoment {
  return {
    reportId: m.reportId,
    turnIndex: m.turnIndex,
    studentText: m.studentText,
    precedingAvatarText: preceding.get(key(m.reportId, m.turnIndex)) ?? null,
    reportCreatedAt: m.reportCreatedAt,
    score: m.score,
    framing,
  };
}

export async function selectCoachedMomentsFromReports(
  args: { userId: string; reportIds: string[]; competencyKey: CompetencyKey },
  opts?: SelectionOpts,
): Promise<CoachedMomentSelection> {
  const { userId, reportIds, competencyKey } = args;

  // The ONLY source of transcripts and moments (REQ-123).
  const sources = await loadGenerationSources(userId, reportIds, {
    readTranscript: opts?.readTranscript,
  });

  // A moment from a session that never scored the competency is not a candidate.
  const evidence = await loadCoachedEvidence(userId, reportIds);
  const scoredReports = new Set(evidence.get(competencyKey)?.scoredReportIds ?? []);

  // Ownership in the WHERE clause; createdAt for deterministic tie-breaks.
  const reportRows = await prisma.interactionReport.findMany({
    where: { id: { in: reportIds }, userId, status: "READY" },
    select: { id: true, createdAt: true },
  });
  const createdAtById = new Map(reportRows.map((r) => [r.id, r.createdAt]));

  // Position among each transcript's STUDENT turns.
  const positionOf = (reportId: string, turnIndex: number): TurnPosition => {
    const transcript = sources.transcriptsByReportId.get(reportId);
    const studentIdx = (transcript?.turns ?? [])
      .map((t, i) => (t.role === "user" ? i : -1))
      .filter((i) => i >= 0);
    if (studentIdx.length === 0) return "MIDDLE";
    if (turnIndex === studentIdx[0]) return "FIRST";
    if (turnIndex === studentIdx[studentIdx.length - 1]) return "LAST";
    return "MIDDLE";
  };

  // Pleasantry filter BEFORE scoring, grouped per report.
  const byReport = new Map<string, SessionMoment[]>();
  const positions = new Map<string, TurnPosition>();
  for (const m of sources.moments) {
    if (!scoredReports.has(m.reportId)) continue;
    const position = positionOf(m.reportId, m.turnIndex);
    if (isPleasantry(m.studentText, position)) continue;
    positions.set(key(m.reportId, m.turnIndex), position);
    const list = byReport.get(m.reportId);
    if (list) list.push(m);
    else byReport.set(m.reportId, [m]);
  }

  // Boundary: redaction/ownership/caps. Only survivors are candidates, in BOTH bases.
  let droppedForRedaction = 0;
  let droppedForCap = 0;
  const candidatesByReport = new Map<string, SessionMoment[]>();
  const preceding = new Map<string, string | null>();
  for (const [reportId, moments] of byReport) {
    const payload = prepareMomentsForGeneration({
      requestingUserId: userId,
      moments,
      momentOwnerUserIds: moments.map(() => userId),
      selfNames: sources.selfNames,
    });
    droppedForRedaction += payload.droppedForRedaction;
    droppedForCap += payload.droppedForCap;
    if (payload.moments.length === 0) continue;
    candidatesByReport.set(reportId, payload.moments);
    for (const m of payload.moments) preceding.set(key(m.reportId, m.turnIndex), m.precedingAvatarText);
  }
  if (droppedForRedaction > 0 || droppedForCap > 0) {
    console.warn(
      `Coached moment selection (${competencyKey}): boundary dropped ${droppedForRedaction} for redaction, ${droppedForCap} for cap`,
    );
  }

  const reportEntries = Array.from(candidatesByReport.entries());
  if (reportEntries.length === 0) throw new NoQualifyingMomentError(competencyKey);

  const toRankable = (
    m: SessionMoment,
    s: TurnScore | null,
  ): RankableMoment => ({
    reportId: m.reportId,
    turnIndex: m.turnIndex,
    studentText: m.studentText,
    position: positions.get(key(m.reportId, m.turnIndex)) ?? "MIDDLE",
    reportCreatedAt: createdAtById.get(m.reportId) ?? new Date(0),
    linkedGrowthAreaCount: m.linkedGrowthAreaTitles.length,
    evidencesCompetency: s ? s.evidencesCompetency : null,
    score: s ? s.score : null,
  });

  // Score per report, reports in parallel.
  const settled = await Promise.allSettled(
    reportEntries.map(([reportId, moments]) =>
      scoreTurnsForCompetency(
        {
          userId,
          reportId,
          competencyKey,
          turns: moments.map((m) => ({
            turnIndex: m.turnIndex,
            studentText: m.studentText,
            precedingAvatarText: m.precedingAvatarText,
          })),
        },
        { scorer: opts?.scorer },
      ),
    ),
  );

  const scored: RankableMoment[] = [];
  const failures: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      failures.push(
        result.reason instanceof Error ? result.reason.name : "UnknownError",
      );
      return;
    }
    const byIndex = new Map(result.value.map((s) => [s.turnIndex, s]));
    for (const m of reportEntries[i][1]) {
      scored.push(toRankable(m, byIndex.get(m.turnIndex) ?? null));
    }
  });

  let basis: CoachedMomentSelection["basis"] = "PER_TURN_SCORE";
  let ranked = rankCoachedMoments(scored);

  if (failures.length === reportEntries.length) {
    // EVERY report failed to score: deliberate, recorded fallback. No student text logged.
    console.warn(
      `Coached moment selection (${competencyKey}): per-turn scoring failed for all reports (${failures.join(", ")}); using GROWTH_AREA_FALLBACK`,
    );
    basis = "GROWTH_AREA_FALLBACK";
    const inCompetency = new Set(
      (sources.momentsByCompetency.get(competencyKey) ?? []).map((m) =>
        key(m.reportId, m.turnIndex),
      ),
    );
    const fallback: RankableMoment[] = [];
    for (const [, moments] of reportEntries) {
      for (const m of moments) {
        if (inCompetency.has(key(m.reportId, m.turnIndex))) fallback.push(toRankable(m, null));
      }
    }
    ranked = rankCoachedMomentsByGrowthArea(fallback);
  }

  if (!ranked.replay || !ranked.replayFraming) throw new NoQualifyingMomentError(competencyKey);

  return {
    replay: toSelected(ranked.replay, ranked.replayFraming, preceding),
    fresh:
      ranked.fresh && ranked.freshFraming
        ? toSelected(ranked.fresh, ranked.freshFraming, preceding)
        : null,
    basis,
  };
}

export async function selectCoachedMoments(
  args: { userId: string; pathStepId: string; competencyKey: CompetencyKey },
  opts?: SelectionOpts,
): Promise<CoachedMomentSelection> {
  const step = await prisma.studyPlanPathStep.findFirst({
    // Scoped by the owning path's userId.
    where: { id: args.pathStepId, path: { userId: args.userId } },
    select: { path: { select: { studyPlan: { select: { sourceReportIds: true } } } } },
  });
  const raw = step?.path.studyPlan.sourceReportIds;
  const reportIds = Array.isArray(raw)
    ? (raw as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  if (reportIds.length === 0) throw new NoQualifyingMomentError(args.competencyKey);
  return selectCoachedMomentsFromReports(
    { userId: args.userId, reportIds, competencyKey: args.competencyKey },
    opts,
  );
}
