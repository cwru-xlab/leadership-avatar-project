/**
 * Pure, deterministic moment selection for coached sessions.
 *
 * Observed failure this exists to prevent: `runtime.ts` took the first student
 * turn and replayed "I'm ready to begin the interview." Filtering by position
 * alone is insufficient (22-CONTEXT.md): a student can open with something
 * substantive, and pleasantries can appear mid-session. So the filter is
 * position AND content: content (strip pleasantry phrases, count what is left)
 * applies at every position; position only raises the bar at the edges.
 *
 * Ranking is lowest score on the competency with NO score cutoff. A high-scoring
 * best moment is still chosen and framed as REFINEMENT rather than dropped.
 *
 * This module does no I/O: no prisma, no s3, no model call.
 */

/** Position among STUDENT turns only. */
export type TurnPosition = "FIRST" | "MIDDLE" | "LAST";

export interface RankableMoment {
  reportId: string;
  turnIndex: number;
  /** Verbatim; never trimmed by this module. */
  studentText: string;
  position: TurnPosition;
  reportCreatedAt: Date;
  linkedGrowthAreaCount: number;
  /** null = unscored */
  evidencesCompetency: boolean | null;
  /** 1..5, null when unscored / not evidencing */
  score: number | null;
}

export type MomentRejection = "PLEASANTRY" | "NOT_EVIDENCING" | "UNSCORED";
export type MomentFraming = "REWORK" | "REFINEMENT";

export interface RankedMoments {
  replay: RankableMoment | null;
  /** null = thin evidence */
  fresh: RankableMoment | null;
  replayFraming: MomentFraming | null;
  freshFraming: MomentFraming | null;
  rejected: Array<{ moment: RankableMoment; reason: MomentRejection }>;
}

// PROVISIONAL UNTIL CALIBRATED
export const MIN_SUBSTANTIVE_WORDS = 8;
// PROVISIONAL UNTIL CALIBRATED (FIRST / LAST student turns)
export const MIN_SUBSTANTIVE_WORDS_AT_EDGE = 15;
// PROVISIONAL UNTIL CALIBRATED. A PREFERENCE, not a filter: above it = REFINEMENT framing.
export const MAX_REWORKABLE_SCORE = 3;

// Longer phrases first so they are stripped whole before standalone words.
export const PLEASANTRY_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:nice|great|pleased|good)\s+to\s+(?:meet|see)\s+you\b/gi,
  /\bthank(?:s|\s+you)(?:\s+so\s+much)?(?:\s+for\s+(?:having\s+me|your\s+time|the\s+opportunity))?/gi,
  /\bI['’]?m\s+ready(?:\s+to\s+(?:begin|start|get\s+started))?(?:\s+the\s+interview)?/gi,
  /\bready\s+when\s+you\s+are\b/gi,
  /\blet['’]?s\s+(?:begin|get\s+started|start)\b/gi,
  /\bcan\s+you\s+hear\s+me\b/gi,
  /\bsounds\s+good\b/gi,
  /\bgood\s+(?:morning|afternoon|evening)\b/gi,
  /\b(?:hi|hello|hey)\b/gi,
  /\b(?:yes|yeah|sure|okay|ok|great|perfect|absolutely)\b/gi,
];

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function substantiveWordCount(text: string): number {
  let rest = text;
  for (const p of PLEASANTRY_PATTERNS) rest = rest.replace(p, " ");
  return rest.match(WORD)?.length ?? 0;
}

export function isPleasantry(text: string, position: TurnPosition): boolean {
  const bar =
    position === "MIDDLE" ? MIN_SUBSTANTIVE_WORDS : MIN_SUBSTANTIVE_WORDS_AT_EDGE;
  return substantiveWordCount(text) < bar;
}

/** Shared qualification predicate: not a pleasantry, scored, evidences the competency. No score cutoff. */
export function isQualifyingMoment(m: RankableMoment): boolean {
  return (
    !isPleasantry(m.studentText, m.position) &&
    m.evidencesCompetency === true &&
    m.score !== null
  );
}

export function momentFramingFor(score: number | null): MomentFraming {
  return score !== null && score > MAX_REWORKABLE_SCORE ? "REFINEMENT" : "REWORK";
}

function tail(a: RankableMoment, b: RankableMoment): number {
  return (
    b.reportCreatedAt.getTime() - a.reportCreatedAt.getTime() ||
    a.turnIndex - b.turnIndex ||
    (a.reportId < b.reportId ? -1 : a.reportId > b.reportId ? 1 : 0)
  );
}

function compareByScore(a: RankableMoment, b: RankableMoment): number {
  return (
    (a.score ?? Infinity) - (b.score ?? Infinity) ||
    b.linkedGrowthAreaCount - a.linkedGrowthAreaCount ||
    tail(a, b)
  );
}

function compareByGrowthArea(a: RankableMoment, b: RankableMoment): number {
  return b.linkedGrowthAreaCount - a.linkedGrowthAreaCount || tail(a, b);
}

function pickFresh(
  sorted: RankableMoment[],
  replay: RankableMoment
): RankableMoment | null {
  const rest = sorted.filter((m) => m !== replay);
  return (
    rest.find((m) => m.reportId !== replay.reportId) ??
    rest.find((m) => m.turnIndex !== replay.turnIndex) ??
    null
  );
}

function assemble(
  survivors: RankableMoment[],
  rejected: RankedMoments["rejected"],
  compare: (a: RankableMoment, b: RankableMoment) => number
): RankedMoments {
  const sorted = [...survivors].sort(compare);
  const replay = sorted[0] ?? null;
  const fresh = replay ? pickFresh(sorted, replay) : null;
  return {
    replay,
    fresh,
    replayFraming: replay ? momentFramingFor(replay.score) : null,
    freshFraming: fresh ? momentFramingFor(fresh.score) : null,
    rejected,
  };
}

export function rankCoachedMoments(
  moments: ReadonlyArray<RankableMoment>
): RankedMoments {
  const survivors: RankableMoment[] = [];
  const rejected: RankedMoments["rejected"] = [];
  for (const m of moments) {
    if (isPleasantry(m.studentText, m.position)) rejected.push({ moment: m, reason: "PLEASANTRY" });
    else if (m.evidencesCompetency === null) rejected.push({ moment: m, reason: "UNSCORED" });
    else if (m.evidencesCompetency === false) rejected.push({ moment: m, reason: "NOT_EVIDENCING" });
    else if (!isQualifyingMoment(m)) rejected.push({ moment: m, reason: "UNSCORED" });
    else survivors.push(m);
  }
  return assemble(survivors, rejected, compareByScore);
}

/** Recorded fallback basis: linked growth areas stand in for per-turn evidence. */
export function rankCoachedMomentsByGrowthArea(
  moments: ReadonlyArray<RankableMoment>
): RankedMoments {
  const survivors: RankableMoment[] = [];
  const rejected: RankedMoments["rejected"] = [];
  for (const m of moments) {
    if (isPleasantry(m.studentText, m.position)) rejected.push({ moment: m, reason: "PLEASANTRY" });
    else if (m.linkedGrowthAreaCount > 0) survivors.push(m);
    else rejected.push({ moment: m, reason: "NOT_EVIDENCING" });
  }
  return assemble(survivors, rejected, compareByGrowthArea);
}
