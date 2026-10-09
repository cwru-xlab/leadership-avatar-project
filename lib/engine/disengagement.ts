/**
 * Pure, deterministic disengagement signal extraction for threshold-enabled
 * termination policies. This module deliberately has no model, database,
 * network, or UI dependency: it only turns already-observed session facts
 * into a monotonic value that later termination code may enforce.
 */

import type { TerminationPolicyConfig } from "./types";
import { detectHostility } from "./hostility";

/** The policy-owned opt-in gate; null/omitted preserves existing behavior. */
type DisengagementThreshold = TerminationPolicyConfig["disengagementThreshold"];

/**
 * Appended, never reordered — appending keeps every persisted
 * `DisengagementEpisode` in existing report rows valid. The last four
 * entries are Phase 20's: `hostility`, `severe_content` and
 * `position_unacknowledged` were planned; `stonewalling` was added by the
 * 2026-10-08 amendment to 20-CONTEXT.md, which reversed 20-01's "no new
 * signal needed" finding — see `DEFAULT_DISENGAGEMENT_WEIGHTS.stonewalling`.
 */
export const DISENGAGEMENT_CAUSES = [
  "budget_pressure",
  "turn_count_pressure",
  "repeated_response",
  "short_response_streak",
  "no_common_ground",
  "hostility",
  "severe_content",
  "position_unacknowledged",
  "stonewalling",
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
  /**
   * How many student turns in this prefix `detectHostility` classified
   * `hostile` or `severe`. Deterministic: derived from student text only,
   * via the same per-prefix replay that holds every other signal below —
   * the avatar's structured cue can accelerate the already-computed value
   * elsewhere, but can never reach this term (REQ-79, unchanged).
   */
  hostileTurnCount: number;
  /** True iff any student turn in this prefix was classified `severe`. */
  severeContent: boolean;
  /**
   * Caller-supplied, observable signal that the student has never once
   * acknowledged the avatar's stated position. Defaults to false: modeled
   * on `commonGroundAbsent`, so no model prose becomes live evidence merely
   * by existing (REQ-98 / REQ-80's posture).
   */
  positionUnacknowledged: boolean;
  /**
   * How many of the MOST RECENT consecutive student turns matched the
   * stonewalling refusal pattern (`STONEWALLING_PATTERN`). Deterministic,
   * derived from student text only, exactly like `hostileTurnCount` — added
   * by the 2026-10-08 amendment so sustained pure refusal can cross a
   * type's threshold on its own, which Phase 18's existing
   * `repeated_response` / `short_response_streak` / `turn_count_pressure`
   * (0.35-0.45 combined) deliberately cannot (see
   * `DEFAULT_DISENGAGEMENT_WEIGHTS.stonewalling`).
   */
  stonewallingStreak: number;
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
  /** True iff any replayed prefix contained severe content. Lets a caller
   * see the severe tier without re-running `detectHostility`. */
  severe: boolean;
}

export interface ExtractDisengagementSignalsInput {
  transcript: Array<{ role: string; content: string }>;
  elapsedSeconds: number;
  budgetSeconds: number | null;
  assistantTurnCount: number;
  priorValue?: number;
  commonGroundAbsent?: boolean;
  positionUnacknowledged?: boolean;
}

/**
 * Each component is a normalized observable-pressure contribution. The
 * ORIGINAL five sum to one before the optional bounded cue accelerator is
 * considered — Phase 20's four new keys are all 0 here, so every existing
 * type (pitch-elevator included) computes byte-identically to before this
 * plan. A type opts into the new causes by declaring its OWN
 * `disengagementWeights` profile (`TerminationPolicyConfig`), never by this
 * shared default changing.
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
  /**
   * Zero by default (Phase 20). A type must opt in via `disengagementWeights`;
   * zero is what keeps Phase 18's calibrated types unchanged. PROVISIONAL
   * UNTIL CALIBRATED when a type turns it on — see
   * `scripts/verify-disengagement.ts`'s weight-profile section for the only
   * evidence any non-zero value here rests on.
   */
  hostility: 0,
  /** Zero by default (Phase 20) — see `hostility` above. Severe content's
   * floor-override carve-out is a SEPARATE mechanism (20-04); this weight
   * only governs its ordinary contribution to the accumulating value. */
  severeContent: 0,
  /** Zero by default (Phase 20) — see `hostility` above. */
  positionUnacknowledged: 0,
  /**
   * Zero by default. Added by the 2026-10-08 amendment to 20-CONTEXT.md:
   * sustained pure stonewalling must be able to cross a type's threshold on
   * its own, which the original five weights (0.35-0.45 combined in 20-01's
   * fixture) deliberately cannot. PROVISIONAL UNTIL CALIBRATED — see
   * `scripts/verify-disengagement.ts`'s stonewalling sections for the only
   * evidence any non-zero value here rests on.
   */
  stonewalling: 0,
  /** A future structured cue may add at most this much; it cannot be decisive alone. */
  maxCueAcceleration: 0.2,
} as const;

export type DisengagementWeights = typeof DEFAULT_DISENGAGEMENT_WEIGHTS;

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
 * Pure refusal-to-engage register: dismissing what the avatar said, declining
 * to answer, declaring the topic closed. Deliberately narrow and
 * self-contained (modeled on `lib/engine/hostility.ts`'s lexicon style) so a
 * firm but substantive refusal — "No. I am not taking that on, and I need
 * you to hear that as a no." (ask-for-raise's own FIRM_NOT_HOSTILE register,
 * `scripts/verify-hostility-detector.ts`) — never matches: that line argues
 * a position; it does not refuse to engage with one.
 *
 * PROVISIONAL UNTIL CALIBRATED (Phase 18's policy, 18-VALIDATION.md): the
 * only evidence behind this lexicon is `scripts/verify-disengagement.ts`'s
 * fixture, built in the register of 20-01's `STONEWALLING_CANDIDATES`
 * corpus (not imported, so the two batteries stay independently runnable).
 */
const STONEWALLING_PATTERN =
  /^\s*(no comment\.?|i'?m not discussing (this|that)\.?|i already told you\.?|whatever\.?( you say\.?)?|i have nothing (more|else) to say( about it)?\.?|not talking about (this|that)\.?)\s*$/i;

/**
 * How many of the MOST RECENT consecutive student turns matched the
 * stonewalling pattern. A streak, not a lifetime count, so one substantive
 * reply resets the count going forward — but because
 * `computeDisengagementOverTranscript` replays prefix by prefix and the
 * value only ratchets upward, pressure already earned by an earlier streak
 * is never erased (REQ-99's one-way rule, same mechanism as hostility).
 */
function stonewallingStreak(studentMessages: string[]): number {
  let streak = 0;

  for (const message of [...studentMessages].reverse()) {
    if (!STONEWALLING_PATTERN.test(message.trim())) break;
    streak += 1;
  }

  return streak;
}

/**
 * Extracts the fixed input contract from an already-held transcript. The
 * computation receives only student text; assistant prose is never interpreted
 * as an engagement authority — not even for the hostility/stonewalling
 * signals below, which run `detectHostility` / the stonewalling pattern over
 * student messages only. The avatar's structured cue cannot reach either
 * term at all.
 */
export function extractDisengagementSignals({
  transcript,
  elapsedSeconds,
  budgetSeconds,
  assistantTurnCount,
  priorValue = 0,
  commonGroundAbsent = false,
  positionUnacknowledged = false,
}: ExtractDisengagementSignalsInput): DisengagementSignals {
  const studentMessages = transcript
    .filter((message) => message.role === "user" || message.role === "student")
    .map((message) => message.content);
  const hostilityVerdicts = studentMessages.map((message) =>
    detectHostility(message),
  );

  return {
    elapsedSeconds: Math.max(0, elapsedSeconds),
    budgetSeconds:
      budgetSeconds != null &&
      Number.isFinite(budgetSeconds) &&
      budgetSeconds > 0
        ? budgetSeconds
        : null,
    assistantTurnCount: Math.max(0, Math.trunc(assistantTurnCount)),
    studentMessages,
    priorValue: clamp(priorValue),
    commonGroundAbsent,
    hostileTurnCount: hostilityVerdicts.filter(
      (verdict) => verdict.tier === "hostile" || verdict.tier === "severe",
    ).length,
    severeContent: hostilityVerdicts.some((verdict) => verdict.severe),
    positionUnacknowledged,
    stonewallingStreak: stonewallingStreak(studentMessages),
  };
}

/**
 * Accumulation curves for the two turn-counted Phase 20 causes — PROVISIONAL
 * UNTIL CALIBRATED, evidence named at each default-weight declaration above.
 * `HOSTILITY_ACCUMULATION_TURNS` (3): one sharp remark in a heated firing
 * conversation contributes a third of the term, a pattern contributes all of
 * it. `STONEWALLING_ACCUMULATION_TURNS` (4): a single refusal is not yet a
 * pattern; four consecutive refusals saturate the term, matching the length
 * of 20-01's six-row `STONEWALLING_CANDIDATES` fixture with room to spare.
 */
const HOSTILITY_ACCUMULATION_TURNS = 3;
const STONEWALLING_ACCUMULATION_TURNS = 4;

export function computeDisengagement({
  signals,
  threshold,
  cueAccel = 0,
  weights,
}: {
  signals: DisengagementSignals;
  threshold?: DisengagementThreshold;
  cueAccel?: number;
  /** Optional per-type override of DEFAULT_DISENGAGEMENT_WEIGHTS. Omitted ->
   * the shared defaults, byte-identical to before this plan. */
  weights?: Partial<DisengagementWeights>;
}): DisengagementComputeResult {
  const w = { ...DEFAULT_DISENGAGEMENT_WEIGHTS, ...(weights ?? {}) };
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
    ["budget_pressure", budgetPressure * w.budgetPressure],
    ["turn_count_pressure", turnCountPressure * w.turnCountPressure],
    ["repeated_response", repeatedResponse * w.repeatedResponse],
    ["short_response_streak", shortResponseStreak * w.shortResponseStreak],
    ["no_common_ground", noCommonGround * w.noCommonGround],
    [
      "hostility",
      clamp(signals.hostileTurnCount / HOSTILITY_ACCUMULATION_TURNS) *
        w.hostility,
    ],
    [
      "severe_content",
      (signals.severeContent ? 1 : 0) * w.severeContent,
    ],
    [
      "position_unacknowledged",
      (signals.positionUnacknowledged ? 1 : 0) * w.positionUnacknowledged,
    ],
    [
      "stonewalling",
      clamp(signals.stonewallingStreak / STONEWALLING_ACCUMULATION_TURNS) *
        w.stonewalling,
    ],
  ];
  const computed = contributions.reduce(
    (sum, [, contribution]) => sum + contribution,
    0,
  );
  const cueContribution = clamp(cueAccel, 0, 1) * w.maxCueAcceleration;
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

  return {
    value,
    crossed,
    episodes,
    dominantCauses,
    severe: signals.severeContent,
  };
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
 * Second-person acknowledgement of the other side's stated position —
 * "acknowledging is not agreeing" (Phase 15's `empathy` rubric dimension;
 * this is its live, in-session twin, per 20-CONTEXT.md). Written in
 * `deriveCommonGroundAbsent`'s exact shape, and applied PER PREFIX by
 * `computeDisengagementOverTranscript` the same way, so an early absence
 * ratchets instead of being erased by one later acknowledging turn.
 */
const ACKNOWLEDGEMENT_PATTERN =
  /\b(i (?:hear|understand|get|see) (?:you|that|why|where)|that'?s fair|you'?re right|i can see (?:why|that)|fair (?:enough|point)|i appreciate|i know (?:this|that) (?:is|must)|from your (?:side|point of view|perspective))\b/i;

export function deriveAcknowledgementAbsent(
  turns: Array<{ role: string; content: string }>,
): boolean {
  const assistantTurnCount = turns.filter(
    (turn) => turn.role === "assistant",
  ).length;

  return (
    assistantTurnCount >= 2 &&
    !turns.some(
      (turn) =>
        turn.role === "user" && ACKNOWLEDGEMENT_PATTERN.test(turn.content),
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
  weights,
}: {
  transcript: Array<{ role: string; content: string }>;
  elapsedSeconds: number;
  budgetSeconds: number | null;
  assistantTurnCount: number;
  threshold?: DisengagementThreshold;
  cueAccel?: number;
  /** Optional per-type override of DEFAULT_DISENGAGEMENT_WEIGHTS, threaded
   * to every replayed prefix's `computeDisengagement` call. Omitted -> the
   * shared defaults, byte-identical to before this plan. */
  weights?: Partial<DisengagementWeights>;
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
      weights,
    });
  }

  const episodes: DisengagementEpisode[] = [];
  let priorValue = 0;
  // A severe turn cannot be erased by later prefixes — carried forward the
  // same way `priorValue` is, never recomputed from only the final prefix.
  let everSevere = false;
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
        positionUnacknowledged: deriveAcknowledgementAbsent(prefix),
        priorValue,
      }),
      threshold,
      // The cue describes the turn being streamed, never a replayed prefix.
      cueAccel: isFinal ? cueAccel : 0,
      weights,
    });
    priorValue = latest.value;
    everSevere = everSevere || latest.severe;
    episodes.push(...latest.episodes);
  }

  // Episodes span the replayed session, not only the final turn.
  return { ...(latest as DisengagementComputeResult), episodes, severe: everSevere };
}
