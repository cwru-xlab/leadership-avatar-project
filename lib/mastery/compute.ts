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

/**
 * Where a piece of evidence came from, at the granularity a student cares
 * about: an unaided LIVE practice session, or PATH learning (a knowledge
 * check, deterministic or model-graded, or a coached session). Derived from
 * the row's `source` column — never from its weight — so a weight retune
 * cannot move a row between origins.
 */
export const EVIDENCE_ORIGINS = ["live", "check", "coached"] as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

const ORIGIN_FOR_SOURCE: Record<string, EvidenceOrigin> = {
  LIVE_SESSION: "live",
  CHECK_DETERMINISTIC: "check",
  CHECK_MODEL_GRADED: "check",
  COACHED_SESSION: "coached",
  // Phase 23: a voice drill is path learning at the coached weight, spoken in
  // the same shell; it shares the coached origin bucket rather than adding a
  // fourth origin (which would ripple into every breakdown on /mastery).
  VOICE_DRILL: "coached",
};

/** Null for a source outside the vocabulary (counted in the figure, not in
 * any origin bucket — the breakdown then visibly fails to sum). */
export function originForSource(source: string): EvidenceOrigin | null {
  return ORIGIN_FOR_SOURCE[source] ?? null;
}

/** Number of rolling 7-day buckets in each competency's trend series. */
export const TREND_BUCKETS = 8;
const TREND_BUCKET_DAYS = 7;
/** How many activities per competency are named as having moved it. */
export const MAX_WINDOW_DRIVERS = 3;
/** How many competencies the "recent growth" list names. */
export const MAX_RECENT_GROWTH = 3;

export interface OriginFigure {
  origin: EvidenceOrigin;
  lifetimeCount: number;
  lifetimeWeightSum: number;
  lifetimePercent: number | null;
  currentCount: number;
  currentWeightSum: number;
  currentPercent: number | null;
}

export interface TrendPoint {
  /** Exclusive end of this 7-day bucket. The last bucket ends at `now`. */
  endsAt: Date;
  /** The LIFETIME figure as it stood at `endsAt` (every row before it). */
  cumulativePercent: number | null;
  /** Evidence rows that landed inside this bucket. */
  bucketCount: number;
}

/**
 * One activity (a live session report, a knowledge-check attempt, or a
 * coached session) that contributed to a competency inside the current
 * window. Rows from the same activity are grouped — a session that scores
 * two dimensions of one competency is one activity, not two.
 */
export interface WindowDriver {
  origin: EvidenceOrigin | null;
  source: string;
  sourceReportId: string | null;
  sourceAttemptId: string | null;
  sourceCoachedSessionId: string | null;
  occurredAt: Date;
  /** Weighted mean of this activity's rows, 0..100, one decimal. */
  percent: number;
  weightSum: number;
  /**
   * How hard this activity pulled the figure: weight x distance from the
   * reference (the pre-window lifetime figure, or the current figure when
   * there is no pre-window evidence). Used only for ordering.
   */
  pull: number;
}

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
  /** One entry per EVIDENCE_ORIGINS member, always in that order. */
  byOrigin: OriginFigure[];
  /** TREND_BUCKETS rolling weekly points, oldest first, the last ending at `now`. */
  trend: TrendPoint[];
  /**
   * The lifetime figure computed from rows BEFORE the window start — what
   * the student's all-time figure was when the current window opened. Null
   * when there was no evidence then.
   */
  windowStartLifetimePercent: number | null;
  /**
   * lifetimePercent - windowStartLifetimePercent, one decimal. Null when
   * either side is null or no evidence landed in the window (nothing moved
   * it, so there is no movement to report).
   */
  windowDelta: number | null;
  /** Up to MAX_WINDOW_DRIVERS in-window activities, strongest pull first. */
  windowDrivers: WindowDriver[];
}

export interface RecentGrowthEntry {
  competencyKey: CompetencyKey;
  /** "moved": had pre-window evidence and the lifetime figure changed.
   *  "new": first measured inside the current window. */
  kind: "moved" | "new";
  windowDelta: number | null;
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
  /**
   * Up to MAX_RECENT_GROWTH competencies that moved most in the current
   * window: "moved" entries by |windowDelta| descending (catalog order on a
   * tie), then "new" entries by current weighted evidence descending.
   */
  recentGrowth: RecentGrowthEntry[];
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

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
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

function originFigures(
  rows: MasteryContributionRow[],
  currentRows: MasteryContributionRow[]
): OriginFigure[] {
  return EVIDENCE_ORIGINS.map((origin) => {
    const lifetime = figureFor(rows.filter((r) => originForSource(r.source) === origin));
    const current = figureFor(
      currentRows.filter((r) => originForSource(r.source) === origin)
    );
    return {
      origin,
      lifetimeCount: lifetime.count,
      lifetimeWeightSum: lifetime.weightSum,
      lifetimePercent: lifetime.percent,
      currentCount: current.count,
      currentWeightSum: current.weightSum,
      currentPercent: current.percent,
    };
  });
}

function trendFor(rows: MasteryContributionRow[], now: Date): TrendPoint[] {
  const bucketMs = TREND_BUCKET_DAYS * 24 * 60 * 60 * 1000;
  const points: TrendPoint[] = [];
  for (let i = TREND_BUCKETS - 1; i >= 0; i -= 1) {
    const endsAt = new Date(now.getTime() - i * bucketMs);
    const startsAt = endsAt.getTime() - bucketMs;
    // The last bucket is inclusive of `now` itself so a row stamped exactly
    // at `now` is not lost; earlier buckets are [start, end).
    const isLast = i === 0;
    const upTo = rows.filter((r) =>
      isLast ? r.occurredAt.getTime() <= endsAt.getTime() : r.occurredAt.getTime() < endsAt.getTime()
    );
    const bucketCount = upTo.filter((r) => r.occurredAt.getTime() >= startsAt).length;
    points.push({ endsAt, cumulativePercent: figureFor(upTo).percent, bucketCount });
  }
  return points;
}

/** Groups in-window rows by the activity that produced them. */
function activityKeyFor(row: MasteryContributionRow): string {
  if (row.sourceReportId) return `report:${row.sourceReportId}`;
  if (row.sourceAttemptId) return `attempt:${row.sourceAttemptId}`;
  if (row.sourceCoachedSessionId) return `coached:${row.sourceCoachedSessionId}`;
  return `row:${row.id}`;
}

function windowDriversFor(
  currentRows: MasteryContributionRow[],
  referencePercent: number | null
): WindowDriver[] {
  const groups = new Map<string, MasteryContributionRow[]>();
  for (const row of currentRows) {
    const key = `${row.source}|${activityKeyFor(row)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const reference = referencePercent === null ? null : referencePercent / 100;
  const drivers: WindowDriver[] = [];
  for (const rows of groups.values()) {
    const figure = figureFor(rows);
    if (figure.percent === null || figure.lastAt === null) continue;
    const first = rows[0];
    const mean = figure.percent / 100;
    drivers.push({
      origin: originForSource(first.source),
      source: first.source,
      sourceReportId: first.sourceReportId,
      sourceAttemptId: first.sourceAttemptId,
      sourceCoachedSessionId: first.sourceCoachedSessionId,
      occurredAt: figure.lastAt,
      percent: figure.percent,
      // Rounded so float summation order (row order) can never reorder ties.
      weightSum: round6(figure.weightSum),
      pull: round6(
        reference === null ? figure.weightSum : figure.weightSum * Math.abs(mean - reference)
      ),
    });
  }

  // Strongest pull first; most recent breaks a tie; then a stable id order so
  // the output is fully deterministic for identical inputs.
  drivers.sort(
    (a, b) =>
      b.pull - a.pull ||
      b.occurredAt.getTime() - a.occurredAt.getTime() ||
      `${a.sourceReportId}${a.sourceAttemptId}${a.sourceCoachedSessionId}`.localeCompare(
        `${b.sourceReportId}${b.sourceAttemptId}${b.sourceCoachedSessionId}`
      )
  );
  return drivers.slice(0, MAX_WINDOW_DRIVERS);
}

function recentGrowthFor(competencies: CompetencyMastery[]): RecentGrowthEntry[] {
  const order = new Map(COMPETENCIES.map((c) => [c.key, c.order]));
  const moved = competencies
    .filter((c) => c.windowDelta !== null && c.windowDelta !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.windowDelta!) - Math.abs(a.windowDelta!) ||
        order.get(a.competencyKey)! - order.get(b.competencyKey)!
    )
    .map((c): RecentGrowthEntry => ({ competencyKey: c.competencyKey, kind: "moved", windowDelta: c.windowDelta }));
  const fresh = competencies
    .filter((c) => c.windowStartLifetimePercent === null && c.currentEvidenceCount > 0)
    .sort(
      (a, b) =>
        b.currentWeightSum - a.currentWeightSum ||
        order.get(a.competencyKey)! - order.get(b.competencyKey)!
    )
    .map((c): RecentGrowthEntry => ({ competencyKey: c.competencyKey, kind: "new", windowDelta: null }));
  return [...moved, ...fresh].slice(0, MAX_RECENT_GROWTH);
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
    const beforeWindow = figureFor(
      rows.filter((row) => row.occurredAt.getTime() < windowStart.getTime())
    );
    const windowDelta =
      lifetime.percent !== null && beforeWindow.percent !== null && current.count > 0
        ? round1(lifetime.percent - beforeWindow.percent)
        : null;

    competencyResults.push({
      competencyKey: competency.key,
      lifetimePercent: lifetime.percent,
      currentPercent: current.percent,
      lifetimeEvidenceCount: lifetime.count,
      currentEvidenceCount: current.count,
      lifetimeWeightSum: lifetime.weightSum,
      currentWeightSum: current.weightSum,
      lastContributionAt: lifetime.lastAt,
      byOrigin: originFigures(rows, currentRows),
      trend: trendFor(rows, now),
      windowStartLifetimePercent: beforeWindow.percent,
      windowDelta,
      windowDrivers: windowDriversFor(currentRows, beforeWindow.percent ?? current.percent),
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
    recentGrowth: recentGrowthFor(competencyResults),
  };
}

// === Per-study-plan baseline (Phase 23) ====================================

export interface SincePlanSnapshotFigure {
  competencyKey: string;
  lifetimePercent: number | null;
  currentPercent: number | null;
}

export interface SincePlanFigure {
  percent: number | null;
  evidenceCount: number;
  weightSum: number;
}

export interface CompetencySincePlan {
  competencyKey: CompetencyKey;
  /** All-time figure from ledger rows with occurredAt < `since`. */
  baseline: SincePlanFigure;
  /** All-time figure from ledger rows with occurredAt <= `now`. */
  now: SincePlanFigure;
  /** now - baseline, one decimal; null when either side is unmeasured. */
  delta: number | null;
  /** Rows that landed in [since, now]. */
  sinceEvidenceCount: number;
  /** Up to MAX_WINDOW_DRIVERS activities in [since, now], strongest pull first. */
  drivers: WindowDriver[];
  /**
   * The lifetime figure FROZEN into the path's selectionSnapshot at
   * generation, when present. Reported alongside, never substituted for
   * `baseline`: the snapshot predates any later-ingested history (e.g. the
   * live-session backfill), so it can disagree with a ledger recompute.
   */
  snapshotLifetimePercent: number | null;
}

/**
 * Growth since a study plan's path was generated, for the plan's targeted
 * competencies. Pure: no database, no clock (`since` = the path's
 * `generatedAt`, `now` from the caller). Baseline and now go through the
 * same `figureFor` as every other figure, so the delta compares like with
 * like; the frozen snapshot figure is echoed separately for reference.
 *
 * Unknown competency keys are skipped (the catalog decides what exists).
 * Duplicate keys are collapsed, first occurrence wins the order.
 */
export function growthSincePlan(
  contributions: ReadonlyArray<MasteryContributionRow>,
  competencyKeys: ReadonlyArray<string>,
  since: Date,
  now: Date,
  snapshot?: ReadonlyArray<SincePlanSnapshotFigure> | null
): CompetencySincePlan[] {
  for (const row of contributions) {
    if (row.reversedAt !== null) {
      throw new Error(
        `growthSincePlan: row ${row.id} has a non-null reversedAt — reversed rows must be filtered by the caller (readContributions)`
      );
    }
  }
  if (since.getTime() > now.getTime()) {
    throw new Error("growthSincePlan: `since` must not be after `now`");
  }

  const known = new Set<string>(COMPETENCIES.map((c) => c.key));
  const keys = [...new Set(competencyKeys)].filter((k) => known.has(k)) as CompetencyKey[];
  const snapshotByKey = new Map((snapshot ?? []).map((s) => [s.competencyKey, s]));

  return keys.map((competencyKey) => {
    const rows = contributions.filter(
      (r) => r.competencyKey === competencyKey && r.occurredAt.getTime() <= now.getTime()
    );
    const beforeRows = rows.filter((r) => r.occurredAt.getTime() < since.getTime());
    const sinceRows = rows.filter((r) => r.occurredAt.getTime() >= since.getTime());
    const baseline = figureFor(beforeRows);
    const current = figureFor(rows);
    const delta =
      baseline.percent !== null && current.percent !== null && sinceRows.length > 0
        ? round1(current.percent - baseline.percent)
        : null;
    return {
      competencyKey,
      baseline: { percent: baseline.percent, evidenceCount: baseline.count, weightSum: baseline.weightSum },
      now: { percent: current.percent, evidenceCount: current.count, weightSum: current.weightSum },
      delta,
      sinceEvidenceCount: sinceRows.length,
      drivers: windowDriversFor(sinceRows, baseline.percent ?? current.percent),
      snapshotLifetimePercent: snapshotByKey.get(competencyKey)?.lifetimePercent ?? null,
    };
  });
}
