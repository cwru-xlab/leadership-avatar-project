/**
 * An explicit session time budget and its tail-block fragment.
 *
 * `remainingSeconds` is `null` when the type declares no total
 * (`TimeBudgetConfig.totalSeconds === null`, today's `case-study`) — nothing
 * in this module may fabricate a number where the type declared none.
 *
 * `buildTimeBudgetFragment`'s output MUST NEVER be concatenated into a
 * system prompt. It belongs solely in the per-turn tail block appended to
 * the latest user message, in the same style `lib/interview/prompts.ts`'s
 * `buildProgressBlock` already established for interview progress. Its
 * content varies turn to turn (elapsed time keeps moving); putting it in
 * the system prompt would make the assembled system prompt vary turn to
 * turn too, which breaks the OpenAI prefix cache this engine depends on
 * (REQ-73). `computeTimeBudgetState` takes `now` as an argument rather than
 * calling `Date.now()` internally so both functions stay pure and testable.
 */

import type { TimeBudgetConfig } from "./types";

export interface TimeBudgetState {
  elapsedSeconds: number;
  /** `null` when the type declared no total. */
  remainingSeconds: number | null;
  warn: boolean;
  expired: boolean;
}

export function computeTimeBudgetState({
  config,
  startedAt,
  now,
}: {
  config: TimeBudgetConfig;
  startedAt: Date;
  now: Date;
}): TimeBudgetState {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - startedAt.getTime()) / 1000),
  );

  if (config.totalSeconds === null) {
    return {
      elapsedSeconds,
      remainingSeconds: null,
      warn: false,
      expired: false,
    };
  }

  const remainingSeconds = Math.max(0, config.totalSeconds - elapsedSeconds);
  const warn =
    config.warnAtRemainingSeconds !== null &&
    remainingSeconds <= config.warnAtRemainingSeconds;
  const expired = remainingSeconds <= 0;

  return { elapsedSeconds, remainingSeconds, warn, expired };
}

/**
 * The tail-block fragment for a time-budgeted session. Empty string for an
 * unbudgeted session (`remainingSeconds === null`) — there is nothing to
 * append to the tail block when no budget was declared.
 */
export function buildTimeBudgetFragment(state: TimeBudgetState): string {
  if (state.remainingSeconds === null) return "";

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

  return lines.join("\n");
}
