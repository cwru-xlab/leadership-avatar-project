/**
 * Daily and weekly activity goals, computed from the mastery contribution
 * ledger — never from a separate counter. This is the second of the two
 * Duolingo mechanics 21-CONTEXT.md selected ("levels / progression per
 * skill, and daily/weekly goals"); the two it rejected ("streaks and
 * unlocking. Not selected. Do not add them.") have no presence anywhere in
 * this module, proven by `scripts/verify-levels-goals.ts`'s negative guard.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT COMPUTE:
 *   - consecutive days met
 *   - a "longest run" / "longest streak"
 *   - "don't break your chain" copy or logic
 *   - any day-over-day comparison
 *   - any notion of a day being "missed"
 * A streak is exactly "consecutive days met" — this list exists so the
 * negative guard in `scripts/verify-levels-goals.ts` looks for precisely
 * that, and so a future contributor sees the omission was deliberate rather
 * than an oversight.
 */
import type { MasteryContributionRow } from "../mastery/ledger";

/**
 * GOAL_DEFAULTS — PROVISIONAL UNTIL CALIBRATED.
 *
 * Neither number has been validated against real student behaviour.
 * Derivation:
 *   - `dailyActivities: 1` — one activity a day is achievable alongside a
 *     full course load and is the smallest unit that still means something;
 *     a daily target of zero or a fraction would not be a goal.
 *   - `weeklyActivities: 4` — deliberately LESS than 7, so a student who
 *     misses one or more days can still hit the weekly goal from the days
 *     they did show up. That asymmetry (daily target x7 = 7, weekly target
 *     = 4) is intentional: it is the closest this phase gets to the
 *     motivational function a streak would serve, WITHOUT the punishment a
 *     streak carries (a missed day does not erase prior progress, because
 *     there is no running chain to break). This is the design answer to
 *     "why no streaks" — the weekly goal absorbs the slack a streak would
 *     otherwise demand be perfect about.
 */
export const GOAL_DEFAULTS = {
  dailyActivities: 1,
  weeklyActivities: 4,
} as const;

export interface GoalProgress {
  daily: {
    target: number;
    completed: number;
    met: boolean;
    windowStart: string;
    windowEnd: string;
  };
  weekly: {
    target: number;
    completed: number;
    met: boolean;
    windowStart: string;
    windowEnd: string;
  };
}

/**
 * Finds the numeric value of a given `Intl.DateTimeFormatPart` type from a
 * formatted set of parts, for the supplied IANA time zone. Used to compute
 * local day boundaries without adding a date library — `now` and `timeZone`
 * are both required parameters precisely so a "today" computed from the
 * server's own clock/zone (typically UTC) never disagrees with the
 * student's actual local day: a student practising at 8pm Eastern must not
 * be told their session landed on "tomorrow" because the server is in UTC.
 */
function localParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday, matches Date#getUTCDay semantics
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekdayShort = get("weekday") ?? "Sun";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayShort] ?? 0;

  return { year, month, day, weekday };
}

/**
 * Full local wall-clock datetime (not just the date) at a given UTC instant,
 * for the supplied zone. Used only by `localMidnightUtc`'s offset
 * correction below, which needs hour/minute/second precision to derive the
 * zone's UTC offset at an instant — `localParts` above deliberately only
 * exposes date+weekday, since that is all the window-boundary logic needs.
 */
function localWallClockAsUtcMs(instantMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(instantMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // Some locales/zones format midnight as hour "24" under hour12: false;
  // normalize that to 0 on the following day's date component is not
  // necessary here since Date.UTC correctly rolls "24" into the next day's
  // hour 0 either way — Date.UTC(y, m, d, 24) === Date.UTC(y, m, d+1, 0).
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));

  return Date.UTC(year, month - 1, day, hour, minute, second, 0);
}

/**
 * Builds the UTC instant corresponding to local midnight on the given
 * year/month/day in `timeZone`, by deriving the zone's UTC offset at an
 * initial guess instant and correcting for it. This avoids pulling in a
 * date library while remaining correct across DST transitions:
 *
 *   offsetFromUtcMs(T) = localWallClockAsUtcMs(T) - T
 *
 * is the zone's UTC offset at instant T (e.g. -4h for EDT, expressed as
 * milliseconds such that local = UTC + offset). We want the instant T whose
 * LOCAL wall clock equals (year, month, day, 00:00:00) — i.e.
 * `UTC(year,month,day,0,0,0) = T + offsetFromUtcMs(T)`, so
 * `T = UTC(year,month,day,0,0,0) - offsetFromUtcMs(T)`.
 *
 * The offset is evaluated at an initial naive guess (treating the local
 * date as if it were already UTC) rather than at the true answer, which is
 * correct for every real-world IANA zone: no DST transition moves the
 * offset far enough within one day to change which offset applies at local
 * midnight versus at the guess instant used to look it up.
 */
function localMidnightUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetFromUtcMs = localWallClockAsUtcMs(naiveUtcMs, timeZone) - naiveUtcMs;
  return new Date(naiveUtcMs - offsetFromUtcMs);
}

/**
 * Groups contributions into distinct ACTIVITIES, not distinct contribution
 * rows. 21-16 writes one contribution row PER COMPETENCY for a single
 * coached session, so counting rows directly would let one session satisfy
 * a weekly goal of four on its own — the goal would then measure nothing.
 *
 * Grouping key: `sourceReportId ?? sourceAttemptId`. A row with both null
 * (no source id at all) is counted as its own activity, keyed by its own
 * `id` — there is no larger unit to fold it into, and folding distinct
 * sourceless rows together would silently undercount activity.
 */
function distinctActivityKeys(
  contributions: ReadonlyArray<MasteryContributionRow>
): Set<string> {
  const keys = new Set<string>();
  for (const row of contributions) {
    const key = row.sourceReportId ?? row.sourceAttemptId ?? `row:${row.id}`;
    keys.add(key);
  }
  return keys;
}

/**
 * Computes daily and weekly goal progress from the ledger's contributions.
 *
 * `now` and `timeZone` are REQUIRED (see `localParts`'s comment on why).
 *
 * `contributions` must already have reversed rows excluded by the caller —
 * the caller passes `readContributions`'s default (`includeReversed:
 * false`), so a contested contribution stops counting toward a goal exactly
 * the way it stops counting toward a mastery figure. This mirrors 21-09's
 * single-filter-location rule (`computeMastery` throws if it receives a
 * reversed row rather than filtering a second time); this module does the
 * same by contract rather than by a second runtime check, since the
 * `MasteryContributionRow` type itself carries `reversedAt` for a caller who
 * wants to assert it.
 *
 * Windows:
 *   - daily: local midnight TODAY (in `timeZone`) through `now`.
 *   - weekly: local midnight of the current ISO week's MONDAY through `now`.
 *     Monday is declared explicitly rather than left to locale/`Intl.Locale`
 *     week-start inference, so the week boundary is the same for every
 *     student regardless of browser locale.
 *
 * `met` is strictly `completed >= target` — no partial credit, no
 * overachievement bonus beyond `met: true`.
 *
 * `targets` lets a caller override `GOAL_DEFAULTS` (e.g. a future
 * per-student preference). This phase ships only the defaults and does not
 * persist a per-student target anywhere — that is a deliberate omission,
 * not an oversight; there is no student-preference storage wired to this
 * function.
 */
export function goalProgress(args: {
  contributions: ReadonlyArray<MasteryContributionRow>;
  now: Date;
  timeZone: string;
  targets?: { dailyActivities?: number; weeklyActivities?: number };
}): GoalProgress {
  const { contributions, now, timeZone } = args;
  const dailyTarget =
    args.targets?.dailyActivities ?? GOAL_DEFAULTS.dailyActivities;
  const weeklyTarget =
    args.targets?.weeklyActivities ?? GOAL_DEFAULTS.weeklyActivities;

  const todayParts = localParts(now, timeZone);
  const dailyWindowStart = localMidnightUtc(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    timeZone
  );

  // Walk back to the current local week's Monday. `weekday` is 0=Sun..6=Sat;
  // days-since-Monday is `(weekday + 6) % 7` (Sunday is 6 days after Monday).
  const daysSinceMonday = (todayParts.weekday + 6) % 7;
  const mondayInstant = new Date(
    dailyWindowStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000
  );
  const mondayParts = localParts(mondayInstant, timeZone);
  const weeklyWindowStart = localMidnightUtc(
    mondayParts.year,
    mondayParts.month,
    mondayParts.day,
    timeZone
  );

  const dailyContributions = contributions.filter(
    (row) =>
      row.occurredAt.getTime() >= dailyWindowStart.getTime() &&
      row.occurredAt.getTime() <= now.getTime()
  );
  const weeklyContributions = contributions.filter(
    (row) =>
      row.occurredAt.getTime() >= weeklyWindowStart.getTime() &&
      row.occurredAt.getTime() <= now.getTime()
  );

  const dailyCompleted = distinctActivityKeys(dailyContributions).size;
  const weeklyCompleted = distinctActivityKeys(weeklyContributions).size;

  return {
    daily: {
      target: dailyTarget,
      completed: dailyCompleted,
      met: dailyCompleted >= dailyTarget,
      windowStart: dailyWindowStart.toISOString(),
      windowEnd: now.toISOString(),
    },
    weekly: {
      target: weeklyTarget,
      completed: weeklyCompleted,
      met: weeklyCompleted >= weeklyTarget,
      windowStart: weeklyWindowStart.toISOString(),
      windowEnd: now.toISOString(),
    },
  };
}
