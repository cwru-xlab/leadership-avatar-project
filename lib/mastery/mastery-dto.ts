/**
 * `toMasteryDTO()` — the SINGLE server exit for mastery.
 *
 * 20-06 found that a guarantee applied at render time has already shipped
 * the unsafe value in the page payload — a sanitizer run inside a component
 * is too late, because the browser already received the un-sanitized data.
 * Thinness is the same shape of problem: if the evidence tier were computed
 * in a component instead of here, a second component (a different page, a
 * future API consumer, a notification) would forget to call it, and a bare,
 * tier-less percent would ship. So every route and every server component
 * MUST go through `toMasteryDTO()`; nothing may serialize a `MasteryResult`
 * directly to a client.
 *
 * Follows the explicit-mapping discipline of `lib/study-plan/plan-dto.ts`
 * ("Explicit mapping prevents future private model columns leaking to the
 * client") — every field below is named individually, never spread.
 */
import { COMPETENCIES } from "./competencies";
import type {
  CompetencyMastery,
  EvidenceOrigin,
  MasteryResult,
  WindowDriver,
} from "./compute";
import { evidenceTierFor, TIER_DISCLOSURE, type EvidenceTier } from "./thinness";

export interface MasteryFigureDTO {
  percent: number | null;
  evidenceCount: number;
  tier: EvidenceTier;
  disclosure: string | null;
  tierLabel: string;
}

/**
 * Student-facing names for each evidence origin. Live practice is unaided
 * work; checks and coached sessions are both "path learning" (study-plan
 * steps). Lives here, at the single exit, so the panel never maps a raw
 * source string itself.
 */
export const ORIGIN_LABELS: Record<EvidenceOrigin, string> = {
  live: "Live practice",
  check: "Knowledge checks",
  coached: "Coached sessions",
};

/** Which group an origin belongs to, for the "live vs path" split. */
export const ORIGIN_GROUP: Record<EvidenceOrigin, "live" | "path"> = {
  live: "live",
  check: "path",
  coached: "path",
};

export interface OriginFigureDTO {
  origin: EvidenceOrigin;
  label: string;
  group: "live" | "path";
  lifetime: { percent: number | null; evidenceCount: number };
  current: { percent: number | null; evidenceCount: number };
}

export interface TrendPointDTO {
  endsAt: string;
  /** The all-time figure as it stood at `endsAt`; null before any evidence. */
  percent: number | null;
  /** Evidence rows that landed in this 7-day bucket. */
  count: number;
}

/** A resolved link for one contributing activity (built server-side). */
export interface ActivityLink {
  href: string;
  label: string;
}

export interface WindowDriverDTO {
  origin: EvidenceOrigin | null;
  originLabel: string;
  /** e.g. "Case study session", "Knowledge check", "Coached session". */
  activityLabel: string;
  occurredAt: string;
  percent: number;
  /** Null when the source no longer resolves (deleted report or plan). */
  href: string | null;
}

export interface RecentGrowthDTO {
  competencyKey: string;
  label: string;
  kind: "moved" | "new";
  /** Change in the all-time figure since the window opened. Null for "new". */
  delta: number | null;
  windowStartPercent: number | null;
  lifetimePercent: number | null;
  drivers: WindowDriverDTO[];
}

export interface CompetencyMasteryDTO {
  competencyKey: string;
  label: string;
  description: string;
  order: number;
  lifetime: MasteryFigureDTO;
  current: MasteryFigureDTO;
  lastContributionAt: string | null;
  /** Where the evidence came from — one entry per origin, fixed order. */
  sources: OriginFigureDTO[];
  /** Rolling weekly points of the all-time figure, oldest first. */
  trend: TrendPointDTO[];
  windowChange: { startPercent: number | null; delta: number | null };
  drivers: WindowDriverDTO[];
}

export interface MasteryDTO {
  competencies: CompetencyMasteryDTO[];
  overall: { lifetimePercent: number | null; currentPercent: number | null };
  window: { days: number; startsAt: string };
  /**
   * Non-zero means the competency catalog and the contribution ledger
   * disagree (a row's `competencyKey` is not in `COMPETENCIES`) — surfaced
   * here, not swallowed, so a reader can see the data bug rather than a
   * silently short-counted figure.
   */
  unmappedRowCount: number;
  /** Competencies that moved most in the current window, with what moved them. */
  recentGrowth: RecentGrowthDTO[];
}

export interface MasteryDTOOptions {
  /** Keyed by `activityKeyForDriver`. Missing entries render with no link. */
  activityLinks?: ReadonlyMap<string, ActivityLink>;
}

/**
 * The key `activityLinks` is looked up by. Exported so the route's link
 * resolver and this mapper agree on one spelling.
 */
export function activityKeyForDriver(driver: {
  sourceReportId: string | null;
  sourceAttemptId: string | null;
  sourceCoachedSessionId: string | null;
}): string | null {
  if (driver.sourceReportId) return `report:${driver.sourceReportId}`;
  if (driver.sourceAttemptId) return `attempt:${driver.sourceAttemptId}`;
  if (driver.sourceCoachedSessionId) return `coached:${driver.sourceCoachedSessionId}`;
  return null;
}

const FALLBACK_ACTIVITY_LABEL: Record<EvidenceOrigin, string> = {
  live: "Live practice session",
  check: "Knowledge check",
  coached: "Coached session",
};

function driverDTOFor(
  driver: WindowDriver,
  links: ReadonlyMap<string, ActivityLink> | undefined
): WindowDriverDTO {
  const key = activityKeyForDriver(driver);
  const link = key ? links?.get(key) : undefined;
  return {
    origin: driver.origin,
    originLabel: driver.origin ? ORIGIN_LABELS[driver.origin] : driver.source,
    activityLabel:
      link?.label ?? (driver.origin ? FALLBACK_ACTIVITY_LABEL[driver.origin] : driver.source),
    occurredAt: driver.occurredAt.toISOString(),
    percent: driver.percent,
    href: link?.href ?? null,
  };
}

/**
 * Builds a single lifetime-or-current figure, attaching its tier, tier
 * label and disclosure from `TIER_DISCLOSURE`.
 *
 * There is NO variant of this function (or of `toMasteryDTO`) that omits
 * the tier, and no boolean flag on the opts object to turn tier-attachment
 * off. Such a flag would be the single change that reintroduces the
 * bare-number failure 21-CONTEXT.md names — a caller that wanted a quick
 * percent without its disclosure would reach for it, and the whole point of
 * attaching the tier at this one exit is that no caller gets to opt out. So
 * it deliberately does not exist.
 *
 * Does NOT round, re-scale, or clamp `percent` — `lib/mastery/compute.ts`'s
 * `figureFor()` already rounded it once (to one decimal). Rounding again
 * here would let this boundary and the arithmetic module disagree on the
 * last digit.
 */
function figureDTOFor(
  percent: number | null,
  evidenceCount: number,
  weightSum: number
): MasteryFigureDTO {
  const tier = evidenceTierFor({ evidenceCount, weightSum });
  const { label, disclosure } = TIER_DISCLOSURE[tier];

  return {
    percent,
    evidenceCount,
    tier,
    disclosure,
    tierLabel: label,
  };
}

function competencyDTOFor(
  result: CompetencyMastery,
  links: ReadonlyMap<string, ActivityLink> | undefined
): CompetencyMasteryDTO {
  const catalogEntry = COMPETENCIES.find(
    (c) => c.key === result.competencyKey
  );

  if (!catalogEntry) {
    // computeMastery() seeds its map from COMPETENCIES, so every result row
    // has a matching catalog entry by construction. A missing entry here
    // would mean the two modules have drifted — fail loudly rather than
    // emit a competency with no label.
    throw new Error(
      `toMasteryDTO: competencyKey "${result.competencyKey}" has no entry in COMPETENCIES`
    );
  }

  return {
    competencyKey: result.competencyKey,
    label: catalogEntry.label,
    description: catalogEntry.description,
    order: catalogEntry.order,
    lifetime: figureDTOFor(
      result.lifetimePercent,
      result.lifetimeEvidenceCount,
      result.lifetimeWeightSum
    ),
    current: figureDTOFor(
      result.currentPercent,
      result.currentEvidenceCount,
      result.currentWeightSum
    ),
    lastContributionAt: result.lastContributionAt
      ? result.lastContributionAt.toISOString()
      : null,
    sources: result.byOrigin.map((figure) => ({
      origin: figure.origin,
      label: ORIGIN_LABELS[figure.origin],
      group: ORIGIN_GROUP[figure.origin],
      lifetime: { percent: figure.lifetimePercent, evidenceCount: figure.lifetimeCount },
      current: { percent: figure.currentPercent, evidenceCount: figure.currentCount },
    })),
    trend: result.trend.map((point) => ({
      endsAt: point.endsAt.toISOString(),
      percent: point.cumulativePercent,
      count: point.bucketCount,
    })),
    windowChange: {
      startPercent: result.windowStartLifetimePercent,
      delta: result.windowDelta,
    },
    drivers: result.windowDrivers.map((driver) => driverDTOFor(driver, links)),
  };
}

/**
 * The single server exit for mastery. Converts a `MasteryResult` (21-09's
 * pure arithmetic output) into the one shape a client ever receives.
 *
 * Every competency gets an INDEPENDENTLY-computed `lifetime` and `current`
 * tier. A competency with nine lifetime sessions and one session this month
 * is ESTABLISHED lifetime and THIN current — collapsing the two tiers to
 * one would let a stale, well-evidenced lifetime figure mask a current
 * figure that is actually still thin, which is exactly the "presented as
 * if well-evidenced" failure 21-CONTEXT.md names, just displaced from the
 * number onto the window instead of the competency.
 *
 * Labels, descriptions and ordering come from `COMPETENCIES`, never from the
 * caller or the unmapped source result — a client-side key-to-label map would be a
 * second catalog, and a second catalog breaks the replaceability seam
 * REQ-103 established for swapping in a faculty-authored framework later.
 *
 * No `Date` object crosses this boundary; every date is an ISO string.
 */
export function toMasteryDTO(
  result: MasteryResult,
  opts?: MasteryDTOOptions
): MasteryDTO {
  const links = opts?.activityLinks;
  const competencies = result.competencies
    .map((competency) => competencyDTOFor(competency, links))
    .sort((a, b) => a.order - b.order);

  const byKey = new Map(competencies.map((c) => [c.competencyKey, c]));
  const recentGrowth: RecentGrowthDTO[] = result.recentGrowth.map((entry) => {
    const competency = byKey.get(entry.competencyKey);
    if (!competency) {
      throw new Error(
        `toMasteryDTO: recentGrowth names "${entry.competencyKey}", which is not in the competency list`
      );
    }
    return {
      competencyKey: entry.competencyKey,
      label: competency.label,
      kind: entry.kind,
      delta: entry.windowDelta,
      windowStartPercent: competency.windowChange.startPercent,
      lifetimePercent: competency.lifetime.percent,
      drivers: competency.drivers,
    };
  });

  return {
    competencies,
    overall: {
      lifetimePercent: result.overallLifetimePercent,
      currentPercent: result.overallCurrentPercent,
    },
    window: {
      days: result.windowDays,
      startsAt: result.windowStart.toISOString(),
    },
    unmappedRowCount: result.unmappedRowCount,
    recentGrowth,
  };
}
