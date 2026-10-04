/**
 * An explicit session time budget and its tail-block fragment.
 *
 * `remainingSeconds` is `null` when the type declares no total
 * (`TimeBudgetConfig.totalSeconds === null`, today's `case-study`) — nothing
 * in this module may fabricate a number where the type declared none.
 *
 * `buildTimeBudgetFragment`'s output — including the first-turn soft-window
 * fragment — MUST NEVER be concatenated into a system prompt. It belongs
 * solely in the per-turn tail block appended to the latest user message, in
 * the same style `lib/interview/prompts.ts`'s `buildProgressBlock` already
 * established for interview progress. Its content varies turn to turn
 * (elapsed time keeps moving; the opening-turn window overage keeps
 * growing); putting it in the system prompt would make the assembled system
 * prompt vary turn to turn too, which breaks the OpenAI prefix cache this
 * engine depends on (REQ-73). `computeTimeBudgetState` takes `now` as an
 * argument rather than calling `Date.now()` internally so both functions
 * stay pure and testable.
 */

import type { TimeBudgetConfig } from "./types";

export interface FirstTurnWindowState {
  windowSeconds: number;
  elapsedSeconds: number;
  /** Seconds past the window; 0 while still inside it. */
  overBy: number;
  /** True once the opening turn has been delivered (follow-up phase). */
  concluded: boolean;
}

export interface TimeBudgetState {
  elapsedSeconds: number;
  /** `null` when the type declared no total. */
  remainingSeconds: number | null;
  warn: boolean;
  expired: boolean;
  /**
   * Soft first-turn window state. `null` / omitted when the type declares
   * no window (every Phase 13 type). There is deliberately no `expired` /
   * `hardStop` flag on this object — CONTEXT.md: nothing hard-stops the
   * student's turn. Optional so Phase 13 call sites / verify literals that
   * predate this field still typecheck.
   */
  firstTurnWindow?: FirstTurnWindowState | null;
}

export function computeTimeBudgetState({
  config,
  startedAt,
  now,
  firstTurn,
}: {
  config: TimeBudgetConfig;
  startedAt: Date;
  now: Date;
  /** Soft window for the student's opening turn. Absent for types with no
   * first-turn window. */
  firstTurn?: { startedAt: Date; deliveredAt?: Date };
}): TimeBudgetState {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - startedAt.getTime()) / 1000),
  );

  let firstTurnWindow: FirstTurnWindowState | null = null;
  const windowSeconds = config.firstTurnWindowSeconds;

  if (windowSeconds != null && windowSeconds > 0 && firstTurn !== undefined) {
    const end = firstTurn.deliveredAt ?? now;
    const firstElapsed = Math.max(
      0,
      Math.floor((end.getTime() - firstTurn.startedAt.getTime()) / 1000),
    );

    firstTurnWindow = {
      windowSeconds,
      elapsedSeconds: firstElapsed,
      overBy: Math.max(0, firstElapsed - windowSeconds),
      concluded: firstTurn.deliveredAt !== undefined,
    };
  }

  if (config.totalSeconds === null) {
    return {
      elapsedSeconds,
      remainingSeconds: null,
      warn: false,
      expired: false,
      firstTurnWindow,
    };
  }

  const remainingSeconds = Math.max(0, config.totalSeconds - elapsedSeconds);
  const warn =
    config.warnAtRemainingSeconds !== null &&
    remainingSeconds <= config.warnAtRemainingSeconds;
  const expired = remainingSeconds <= 0;

  return {
    elapsedSeconds,
    remainingSeconds,
    warn,
    expired,
    firstTurnWindow,
  };
}

/**
 * The tail-block fragment for a time-budgeted session. Empty string when
 * there is neither a session budget nor a first-turn window to report.
 */
export function buildTimeBudgetFragment(state: TimeBudgetState): string {
  const parts: string[] = [];

  if (state.remainingSeconds !== null) {
    const minutes = Math.floor(state.remainingSeconds / 60);
    const seconds = state.remainingSeconds % 60;
    const timeText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const lines = [
      "[TIME BUDGET — not spoken aloud, do not reference it directly]",
      `Remaining: ~${timeText}.`,
    ];

    if (state.expired) {
      lines.push("Time budget has expired — wrap up now.");
    } else if (state.warn) {
      lines.push("Time is running low — begin wrapping up.");
    }

    parts.push(lines.join("\n"));
  }

  if (state.firstTurnWindow) {
    parts.push(buildFirstTurnWindowFragment(state.firstTurnWindow));
  }

  return parts.join("\n\n");
}

function buildFirstTurnWindowFragment(window: FirstTurnWindowState): string {
  const header =
    "[OPENING TURN WINDOW — not spoken aloud, do not reference it directly]";

  if (window.concluded) {
    if (window.overBy > 0) {
      return [
        header,
        `The speaker's opening ran ${window.elapsedSeconds} seconds against a ${window.windowSeconds}-second window (over by ${window.overBy}s). The follow-up phase is underway.`,
      ].join("\n");
    }

    return [
      header,
      `The speaker finished their opening within the ${window.windowSeconds}-second window (${window.elapsedSeconds}s). The follow-up phase is underway.`,
    ].join("\n");
  }

  if (window.overBy > 0) {
    return [
      header,
      `The speaker has now been talking for ${window.elapsedSeconds} seconds against a ${window.windowSeconds}-second window; a listener would be getting restless.`,
    ].join("\n");
  }

  return [
    header,
    `The speaker is still within the ${window.windowSeconds}-second opening window (${window.elapsedSeconds}s elapsed).`,
  ].join("\n");
}

/**
 * Clamps a student-requested session budget into the type's declared
 * adjustable range. When the range is absent, returns the type's
 * `totalSeconds` untouched (or 0 if that is also null) and ignores the
 * request.
 */
export function clampAdjustableBudget(
  config: TimeBudgetConfig,
  requestedSeconds: number,
): { seconds: number; clamped: boolean } {
  const range = config.adjustableRangeSeconds;

  if (range == null) {
    return {
      seconds: config.totalSeconds ?? 0,
      clamped: false,
    };
  }

  const [min, max] = range;
  const seconds = Math.min(max, Math.max(min, requestedSeconds));

  return { seconds, clamped: seconds !== requestedSeconds };
}
