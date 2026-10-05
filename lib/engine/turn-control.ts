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

import {
  isInterviewIntegrityRequest,
  parseInterviewTurn,
  reduceInterviewProgress,
  type InterviewTurnAction,
} from "@/lib/interview/turn-control";
import {
  getInterviewType,
  initialProgress,
  type InterviewProgress,
} from "@/lib/interview/types";

/** Re-export so the chat route imports integrity checks from one engine module. */
export { isInterviewIntegrityRequest };

export interface ParseEngineTurnOptions {
  /** Prior progress; required to reduce interview stage state. */
  previousProgress?: InterviewProgress;
  hasResume?: boolean;
  targetQuestionCount?: number;
  assistantTurnCount?: number;
  /** Trusted derived value supplied by the chat path for threshold-enabled types. */
  disengagementValue?: number;
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
    });

    if (resolved.ok) {
      termination = { reason: resolved.recordedReason };
    }
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
