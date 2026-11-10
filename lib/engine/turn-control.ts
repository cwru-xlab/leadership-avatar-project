/**
 * Generic turn-marker parsing for the engine chat path.
 *
 * Interview-shaped types keep today's five-stage state machine
 * (`opening|resume|behavioral|role_specific|closing`) by delegating to
 * `lib/interview/turn-control.ts` — this module WRAP and DELEGATES, it does
 * not copy the grammar or the reducer. The engine additionally strips and
 * policy-gates the `<engine-end …/>` termination marker from plan 13-03.
 *
 * Pure functions only. Does not end a session.
 */

import type { ResolvedSessionConfig } from "./types";

import { parseDisengagementCue, type DisengagementCue } from "./disengagement";
import { parseTerminationMarker, resolveTermination } from "./termination";
import { getEngineType } from "./registry";

import { parseProblemTurn } from "@/lib/problem-interview/turn-control";
import type { ProblemTurnAction } from "@/lib/problem-interview/session-state";

import {
  isInterviewIntegrityRequest,
  parseInterviewTurn,
  reduceInterviewProgress,
  type InterviewTurnAction,
} from "@/lib/interview/turn-control";
import { isThinkingTimeRequest } from "@/lib/problem-interview/turn-control";
import {
  getInterviewType,
  initialProgress,
  type InterviewProgress,
} from "@/lib/interview/types";

/** Re-export so the chat route imports integrity checks from one engine module. */
export { isInterviewIntegrityRequest, isThinkingTimeRequest };

export interface ParseEngineTurnOptions {
  /** Prior progress; required to reduce interview stage state. */
  previousProgress?: InterviewProgress;
  hasResume?: boolean;
  targetQuestionCount?: number;
  assistantTurnCount?: number;
  /** Trusted derived value supplied by the chat path for threshold-enabled types. */
  disengagementValue?: number;
  /** Trusted severe-content flag from the same derivation (REQ-100 floor carve-out). */
  severeContent?: boolean;
}

export interface ParsedEngineTurn {
  cleanedText: string;
  /**
   * Reduced interview progress when the type is interview-shaped and
   * `previousProgress` was supplied; otherwise `null`.
   */
  progress: InterviewProgress | null;
  /** The parsed interview action (for callers that reduce themselves). */
  action: InterviewTurnAction | null;
  malformed: boolean;
  /**
   * Accepted avatar termination only. An avatar marker is still stripped when
   * policy, floor, or derived disengagement rejects it.
   */
  termination: { reason: string } | null;
  /** Parsed model self-report; never independently accepts an avatar end. */
  disengagementCue: DisengagementCue | null;
  /**
   * Problem interviews only: every parsed controller action (stage, nudge,
   * exhibit). The chat route reduces these into the server-owned state; the
   * client only needs `cleanedText`. Absent for every other type.
   */
  problemActions?: ProblemTurnAction[];
}

/**
 * Strip interview + termination markers from an assistant turn and (for
 * interview types) reduce progress. Never ends a session — the caller
 * decides what to do with a non-null `termination`.
 */
export function parseEngineTurn(
  assistantText: string,
  config: ResolvedSessionConfig,
  options: ParseEngineTurnOptions = {},
): ParsedEngineTurn {
  // Strip the cue first. It is allowed immediately before a trailing end marker,
  // so termination remains trailing after removal; interview parsing runs last.
  const { cleanedText: afterCue, cue: disengagementCue } =
    parseDisengagementCue(assistantText);
  const { cleanedText: afterTermination, termination: rawTermination } =
    parseTerminationMarker(afterCue);

  let termination: { reason: string } | null = null;

  if (rawTermination) {
    const resolved = resolveTermination({
      policy: config.terminationPolicy,
      source: "avatar",
      reason: rawTermination.reason,
      assistantTurnCount: options.assistantTurnCount,
      disengagementValue: options.disengagementValue,
      // Without this a severe walk-out before the floor was rejected live and
      // the student's report recorded no termination (UAT 2026-10-25).
      severeContent: options.severeContent === true,
    });

    if (resolved.ok) {
      termination = { reason: resolved.recordedReason };
    }
  }

  // Problem interviews: their own grammar (several markers per reply, nudge
  // and exhibit kinds). Progress is server-owned for them, so none is reduced
  // here — `progress` stays null and the client keeps its untouched value.
  if (getEngineType(config.typeSlug)?.problemInterview) {
    const parsed = parseProblemTurn(afterTermination);
    return {
      cleanedText: parsed.content,
      progress: null,
      action: null,
      malformed: parsed.malformed,
      termination,
      disengagementCue,
      problemActions: parsed.actions,
    };
  }

  const interviewBase = getInterviewType(config.typeSlug);

  if (!interviewBase) {
    return {
      cleanedText: afterTermination,
      progress: null,
      action: null,
      malformed: false,
      termination,
      disengagementCue,
    };
  }

  const parsed = parseInterviewTurn(afterTermination);
  const previous = options.previousProgress ?? initialProgress();
  const targetQuestionCount =
    options.targetQuestionCount ??
    config.limits.targetQuestionCount ??
    interviewBase.targetQuestionCount;
  const progress = reduceInterviewProgress(previous, parsed.action, {
    hasResume: options.hasResume ?? false,
    targetQuestionCount,
  });

  return {
    cleanedText: parsed.content,
    progress,
    action: parsed.action,
    malformed: parsed.malformed,
    termination,
    disengagementCue,
  };
}
