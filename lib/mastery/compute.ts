/**
 * Deterministic mastery arithmetic: per competency, a LIFETIME figure (every
 * supplied contribution) and a CURRENT-WINDOW figure (a bounded recent
 * window), plus one overall figure for each.
 *
 * 21-CONTEXT.md locks mastery as BOTH lifetime and current — "a durable
 * record accumulating across every session and study plan, alongside a
 * current-window figure reflecting recent form" — and this phase's hard
 * constraint is deterministic derivation over model judgement for anything
 * consequential. A mastery percentage shown to a student, driving which
 * exercise they are given next, is as consequential as this phase gets. So
 * this module:
 *   - takes `now` as a REQUIRED parameter, never reads the clock itself —
 *     reading the system clock inside would make every test (and every real
 *     figure) time-dependent and unreproducible;
 *   - makes no model call and no database read — it is pure arithmetic over
 *     an array already fetched by the caller (21-05's `readContributions`);
 *   - uses each row's SNAPSHOTTED `weight` field, never a fresh weight-table
 *     lookup, so a later weight retune does not rewrite a figure the student
 *     already saw.
 */
import { COMPETENCIES, type CompetencyKey } from "./competencies";
import { MASTERY_WINDOW_DAYS } from "./weights";
import type { MasteryContributionRow } from "./ledger";

export interface CompetencyMastery {
  competencyKey: CompetencyKey;
  /** 0..100, rounded to one decimal. null when no contribution exists. */
  lifetimePercent: number | null;
  currentPercent: number | null;
  lifetimeEvidenceCount: number;
  currentEvidenceCount: number;
  /** Weighted-evidence totals, carried so 21-13 can judge thinness without recomputing. */
  lifetimeWeightSum: number;
  currentWeightSum: number;
  /** Most recent contributing occurredAt, or null. */
  lastContributionAt: Date | null;
}

export interface MasteryResult {
  competencies: CompetencyMastery[];
  overallLifetimePercent: number | null;
  overallCurrentPercent: number | null;
  /** The window boundary actually used, echoed so a caller can label it. */
  windowStart: Date;
  windowDays: number;
  /**
   * Rows whose competencyKey is not in COMPETENCIES. Counted, never silently
   * dropped — a non-zero value means the catalog and the ledger disagree,
   * which is a data bug a reader must be able to see. 21-13's MasteryDTO and
   * 21-18's surface both consume this field, so it is part of the contract,
   * not debug output.
   */
  unmappedRowCount: number;
}

/** Rounds to one decimal place. Shared so lifetime, current and overall
 * figures can never disagree by 0.1 due to three separate rounding
 * expressions. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Weighted-mean arithmetic over one window's worth of rows for a single
 * competency. Returns null percent (not 0) when there is no evidence — zero
 * is a measured failure, null is "we have not measured this." Shared by both
 * the lifetime and current-window calls below so the two figures always go
 * through the SAME code path and cannot drift apart.
 */
function figureFor(rows: MasteryContributionRow[]): {
  percent: number | null;
  count: number;
  weightSum: number;
  lastAt: Date | null;
} {
  if (rows.length === 0) {
    return { percent: null, count: 0, weightSum: 0, lastAt: null };
  }

  let numerator = 0;
  let weightSum = 0;
  let lastAt: Date | null = null;

  for (const row of rows) {
    numerator += row.rawScore * row.weight;
    weightSum += row.weight;
    if (lastAt === null || row.occurredAt.getTime() > lastAt.getTime()) {
      lastAt = row.occurredAt;
    }
  }

  const percent = weightSum > 0 ? round1((numerator / weightSum) * 100) : null;

  return { percent, count: rows.length, weightSum, lastAt };
}

/** Mean of the non-null values in `values`, each counted once. Null when
 * every value is null. Used for the overall figure so a competency with
 * heavy practice volume cannot dominate the cross-type view. */
function meanOfNonNull(values: ReadonlyArray<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) {
    return null;
  }
  const sum = present.reduce((acc, v) => acc + v, 0);
  return round1(sum / present.length);
}

export function computeMastery(
  contributions: ReadonlyArray<MasteryContributionRow>,
  now: Date,
  opts?: { windowDays?: number }
): MasteryResult {
  // Reversed rows are NOT filtered here. 21-05's `readContributions` already
  // excludes them by default, and filtering in two places means a future
  // change to one leaves the other wrong. A reversed row reaching this
  // function is a caller bug — a mark the student successfully contested
  // must never silently contribute to a figure.
  for (const row of contributions) {
    if (row.reversedAt !== null) {
      throw new Error(
        `computeMastery: row ${row.id} has a non-null reversedAt — reversed rows must be filtered by the caller (readContributions), not supplied here`
      );
    }
  }

  const windowDays = opts?.windowDays ?? MASTERY_WINDOW_DAYS;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Seed from the catalog, not from the data — this is what makes the empty
  // case (a competency with zero rows) fall out naturally, instead of
  // needing a second pass to backfill competencies nobody has evidence for.
  const byCompetency = new Map<CompetencyKey, MasteryContributionRow[]>();
  for (const competency of COMPETENCIES) {
    byCompetency.set(competency.key, []);
  }

  let unmappedRowCount = 0;
  for (const row of contributions) {
    const bucket = byCompetency.get(row.competencyKey as CompetencyKey);
    if (!bucket) {
      unmappedRowCount += 1;
      continue;
    }
    bucket.push(row);
  }

  const competencyResults: CompetencyMastery[] = [];
  for (const competency of COMPETENCIES) {
    const rows = byCompetency.get(competency.key)!;
    // Current = rows with occurredAt >= windowStart. Inclusive on the
    // boundary — a row landing exactly on the edge counts as current.
    const currentRows = rows.filter(
      (row) => row.occurredAt.getTime() >= windowStart.getTime()
    );

    const lifetime = figureFor(rows);
    const current = figureFor(currentRows);

    competencyResults.push({
      competencyKey: competency.key,
      lifetimePercent: lifetime.percent,
      currentPercent: current.percent,
      lifetimeEvidenceCount: lifetime.count,
      currentEvidenceCount: current.count,
      lifetimeWeightSum: lifetime.weightSum,
      currentWeightSum: current.weightSum,
      lastContributionAt: lifetime.lastAt,
    });
  }

  const overallLifetimePercent = meanOfNonNull(
    competencyResults.map((c) => c.lifetimePercent)
  );
  const overallCurrentPercent = meanOfNonNull(
    competencyResults.map((c) => c.currentPercent)
  );

  return {
    competencies: competencyResults,
    overallLifetimePercent,
    overallCurrentPercent,
    windowStart,
    windowDays,
    unmappedRowCount,
  };
}
