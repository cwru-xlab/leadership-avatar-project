/**
 * Pure, deterministic disengagement signal extraction for threshold-enabled
 * termination policies. This module deliberately has no model, database,
 * network, or UI dependency: it only turns already-observed session facts
 * into a monotonic value that later termination code may enforce.
 */

import type { TerminationPolicyConfig } from "./types";

/** The policy-owned opt-in gate; null/omitted preserves existing behavior. */
type DisengagementThreshold = TerminationPolicyConfig["disengagementThreshold"];

export const DISENGAGEMENT_CAUSES = [
  "budget_pressure",
  "turn_count_pressure",
  "repeated_response",
  "short_response_streak",
  "no_common_ground",
] as const;

export type DisengagementCause = (typeof DISENGAGEMENT_CAUSES)[number];

export type DisengagementCue = "rising" | "high";

/**
 * The compact structured cue is a model self-report, not a termination command.
 * `high` remains below either pitch type's opt-in threshold from a cold start.
 */
export const DISENGAGEMENT_CUE_ACCELERATION: Record<DisengagementCue, number> =
  {
    rising: 0.5,
    high: 1,
  };

const CUE_MARKER = /\s*<engine-cue\b([^>]*)\/?>(?=\s*(?:<engine-end\b|$))/i;
const DISENGAGEMENT_ATTRIBUTE = /\bdisengagement=(?:"([^"]*)"|'([^']*)')/i;

export interface ParsedDisengagementCue {
  cleanedText: string;
  cue: DisengagementCue | null;
}

/**
 * Removes one suffix cue before termination parsing. A cue may precede a
 * trailing engine-end marker, which keeps that marker trailing after cue
 * removal. Invalid cue values are stripped but never become evidence.
 */
export function parseDisengagementCue(
  assistantText: string,
): ParsedDisengagementCue {
  const marker = assistantText.match(CUE_MARKER);

  if (!marker || marker.index === undefined) {
    return { cleanedText: assistantText, cue: null };
  }

  const attribute = marker[1].match(DISENGAGEMENT_ATTRIBUTE);
  const value = attribute ? (attribute[1] ?? attribute[2] ?? "") : "";
  const cue: DisengagementCue | null =
    value === "rising" || value === "high" ? value : null;

  return {
    cleanedText:
      `${assistantText.slice(0, marker.index)}${assistantText.slice(marker.index + marker[0].length)}`.trim(),
    cue,
  };
}

export function cueAcceleration(cue: DisengagementCue | null): number {
  return cue == null ? 0 : DISENGAGEMENT_CUE_ACCELERATION[cue];
}

export interface DisengagementSignals {
  elapsedSeconds: number;
  budgetSeconds: number | null;
  assistantTurnCount: number;
  studentMessages: string[];
  priorValue: number;
  /**
   * A caller may supply an observable, already-established common-ground
   * signal. It defaults to false: no evaluator or model prose is treated as
   * live evidence merely because it exists.
   */
  commonGroundAbsent: boolean;
}

export interface DisengagementEpisode {
  kind: "disengagement_rise" | "disengagement_cross";
  start_s: number;
  end_s: number;
  causes: DisengagementCause[];
}

export interface DisengagementComputeResult {
  value: number;
  crossed: boolean;
  episodes: DisengagementEpisode[];
  dominantCauses: DisengagementCause[];
}

export interface ExtractDisengagementSignalsInput {
  transcript: Array<{ role: string; content: string }>;
  elapsedSeconds: number;
  budgetSeconds: number | null;
  assistantTurnCount: number;
  priorValue?: number;
  commonGroundAbsent?: boolean;
}

/**
 * Each component is a normalized observable-pressure contribution. The values
 * sum to one before the optional bounded cue accelerator is considered.
 */
export const DEFAULT_DISENGAGEMENT_WEIGHTS = {
  /** Pressure rises only in the final forty percent of a declared budget. */
  budgetPressure: 0.25,
  /** Long exchanges without resolution carry some, but not dominant, weight. */
  turnCountPressure: 0.1,
  /** Repeating a prior student response is a strong engagement failure signal. */
  repeatedResponse: 0.25,
  /** Consecutive very short student responses indicate stalling. */
  shortResponseStreak: 0.2,
  /** Caller-supplied, observable lack of common ground completes the picture. */
  noCommonGround: 0.2,
  /** A future structured cue may add at most this much; it cannot be decisive alone. */
  maxCueAcceleration: 0.2,
} as const;

const RISE_BANDS = [0.25, 0.5, 0.75] as const;
const SHORT_RESPONSE_WORDS = 8;
const REPEAT_SIMILARITY = 0.75;

function clamp(value: number, minimum = 0, maximum = 1): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeMessage(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function similarity(left: string, right: string): number {
  const leftWords = new Set(normalizeMessage(left));
  const rightWords = new Set(normalizeMessage(right));

  if (leftWords.size === 0 || rightWords.size === 0) return 0;

  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared += 1;
  }

  return shared / Math.max(leftWords.size, rightWords.size);
}

function repetitionPressure(studentMessages: string[]): number {
  if (studentMessages.length < 2) return 0;

  const latest = studentMessages.at(-1) ?? "";
  const highestSimilarity = studentMessages
    .slice(0, -1)
    .reduce(
      (highest, message) => Math.max(highest, similarity(latest, message)),
      0,
    );

  return clamp(
    (highestSimilarity - REPEAT_SIMILARITY) / (1 - REPEAT_SIMILARITY),
  );
}

function shortResponsePressure(studentMessages: string[]): number {
  let streak = 0;

  for (const message of [...studentMessages].reverse()) {
    if (normalizeMessage(message).length >= SHORT_RESPONSE_WORDS) break;
    streak += 1;
  }

  return clamp(streak / 3);
}

/**
 * Extracts the fixed input contract from an already-held transcript. The
 * computation receives only student text; assistant prose is never interpreted
 * as an engagement authority.
 */
export function extractDisengagementSignals({
  transcript,
  elapsedSeconds,
  budgetSeconds,
  assistantTurnCount,
  priorValue = 0,
  commonGroundAbsent = false,
}: ExtractDisengagementSignalsInput): DisengagementSignals {
  return {
    elapsedSeconds: Math.max(0, elapsedSeconds),
    budgetSeconds:
      budgetSeconds != null &&
      Number.isFinite(budgetSeconds) &&
      budgetSeconds > 0
        ? budgetSeconds
        : null,
    assistantTurnCount: Math.max(0, Math.trunc(assistantTurnCount)),
    studentMessages: transcript
      .filter(
        (message) => message.role === "user" || message.role === "student",
      )
      .map((message) => message.content),
    priorValue: clamp(priorValue),
    commonGroundAbsent,
  };
}

export function computeDisengagement({
  signals,
  threshold,
  cueAccel = 0,
}: {
  signals: DisengagementSignals;
  threshold?: DisengagementThreshold;
  cueAccel?: number;
}): DisengagementComputeResult {
  const elapsed = Math.max(0, signals.elapsedSeconds);
  const budgetPressure =
    signals.budgetSeconds == null
      ? 0
      : clamp((elapsed / signals.budgetSeconds - 0.6) / 0.4);
  const turnCountPressure = clamp((signals.assistantTurnCount - 4) / 8);
  const repeatedResponse = repetitionPressure(signals.studentMessages);
  const shortResponseStreak = shortResponsePressure(signals.studentMessages);
  const noCommonGround = signals.commonGroundAbsent ? 1 : 0;

  const contributions: Array<[DisengagementCause, number]> = [
    [
      "budget_pressure",
      budgetPressure * DEFAULT_DISENGAGEMENT_WEIGHTS.budgetPressure,
    ],
    [
      "turn_count_pressure",
      turnCountPressure * DEFAULT_DISENGAGEMENT_WEIGHTS.turnCountPressure,
    ],
    [
      "repeated_response",
      repeatedResponse * DEFAULT_DISENGAGEMENT_WEIGHTS.repeatedResponse,
    ],
    [
      "short_response_streak",
      shortResponseStreak * DEFAULT_DISENGAGEMENT_WEIGHTS.shortResponseStreak,
    ],
    [
      "no_common_ground",
      noCommonGround * DEFAULT_DISENGAGEMENT_WEIGHTS.noCommonGround,
    ],
  ];
  const computed = contributions.reduce(
    (sum, [, contribution]) => sum + contribution,
    0,
  );
  const cueContribution =
    clamp(cueAccel, 0, 1) * DEFAULT_DISENGAGEMENT_WEIGHTS.maxCueAcceleration;
  const value = clamp(
    Math.max(clamp(signals.priorValue), computed + cueContribution),
  );
  const effectiveThreshold =
    threshold != null && Number.isFinite(threshold) ? clamp(threshold) : null;
  const crossed = effectiveThreshold !== null && value >= effectiveThreshold;
  const dominantCauses = contributions
    .filter(([, contribution]) => contribution > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([cause]) => cause);
  const episodes: DisengagementEpisode[] = [];

  for (const band of RISE_BANDS) {
    if (signals.priorValue < band && value >= band) {
      episodes.push({
        kind: "disengagement_rise",
        start_s: elapsed,
        end_s: elapsed,
        causes: dominantCauses,
      });
    }
  }

  if (
    effectiveThreshold !== null &&
    signals.priorValue < effectiveThreshold &&
    crossed
  ) {
    episodes.push({
      kind: "disengagement_cross",
      start_s: elapsed,
      end_s: elapsed,
      causes: dominantCauses,
    });
  }

  return { value, crossed, episodes, dominantCauses };
}

/**
 * Observable evidence that the student never established common ground. Shared
 * by the chat route and the finish re-derivation so both agree on one rule, and
 * applied per transcript prefix by `computeDisengagementOverTranscript` so an
 * early absence ratchets instead of being erased by one later mention.
 */
const COMMON_GROUND_PATTERN =
  /\b(common ground|align(?:s|ed|ment)?|fit|relevant|priority|interest)\b/i;

export function deriveCommonGroundAbsent(
  turns: Array<{ role: string; content: string }>,
): boolean {
  const assistantTurnCount = turns.filter(
    (turn) => turn.role === "assistant",
  ).length;

  return (
    assistantTurnCount >= 2 &&
    !turns.some(
      (turn) =>
        turn.role === "user" && COMMON_GROUND_PATTERN.test(turn.content),
    )
  );
}

/**
 * Computes the one-way disengagement value across a whole transcript.
 *
 * `computeDisengagement` only ratchets when the caller threads `priorValue`
 * forward, and a single request holds no memory of earlier turns. Replaying the
 * transcript prefix by prefix reconstructs that history from the transcript
 * itself, so the value is monotonic without session state, extra storage, or a
 * browser-supplied prior — a novel reply can no longer erase pressure already
 * earned by repetition, stalling, or an absent common ground (REQ-78).
 *
 * The session clock is interpolated linearly across intermediate prefixes
 * because per-turn timestamps are not recorded; the final step always uses the
 * caller's server-stamped elapsed value, assistant turn count, and cue, so the
 * returned value stays bound to server evidence. Deterministic and replay-safe:
 * the same transcript and elapsed time always produce the same result.
 */
export function computeDisengagementOverTranscript({
  transcript,
  elapsedSeconds,
  budgetSeconds,
  assistantTurnCount,
  threshold,
  cueAccel = 0,
}: {
  transcript: Array<{ role: string; content: string }>;
  elapsedSeconds: number;
  budgetSeconds: number | null;
  assistantTurnCount: number;
  threshold?: DisengagementThreshold;
  cueAccel?: number;
}): DisengagementComputeResult {
  const total = transcript.length;
  const elapsed = Math.max(0, elapsedSeconds);

  if (total === 0) {
    return computeDisengagement({
      signals: extractDisengagementSignals({
        transcript,
        elapsedSeconds: elapsed,
        budgetSeconds,
        assistantTurnCount,
        commonGroundAbsent: false,
      }),
      threshold,
      cueAccel,
    });
  }

  const episodes: DisengagementEpisode[] = [];
  let priorValue = 0;
  let latest: DisengagementComputeResult | null = null;

  for (let end = 1; end <= total; end += 1) {
    const prefix = transcript.slice(0, end);
    const isFinal = end === total;

    latest = computeDisengagement({
      signals: extractDisengagementSignals({
        transcript: prefix,
        elapsedSeconds: isFinal ? elapsed : Math.round((elapsed * end) / total),
        budgetSeconds,
        assistantTurnCount: isFinal
          ? assistantTurnCount
          : prefix.filter((turn) => turn.role === "assistant").length,
        commonGroundAbsent: deriveCommonGroundAbsent(prefix),
        priorValue,
      }),
      threshold,
      // The cue describes the turn being streamed, never a replayed prefix.
      cueAccel: isFinal ? cueAccel : 0,
    });
    priorValue = latest.value;
    episodes.push(...latest.episodes);
  }

  // Episodes span the replayed session, not only the final turn.
  return { ...(latest as DisengagementComputeResult), episodes };
}
