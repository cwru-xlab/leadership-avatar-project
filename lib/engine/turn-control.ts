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

import {
  parseTerminationMarker,
  resolveTermination,
} from "./termination";
import type { ResolvedSessionConfig } from "./types";

/** Re-export so the chat route imports integrity checks from one engine module. */
export { isInterviewIntegrityRequest };

export interface ParseEngineTurnOptions {
  /** Prior progress; required to reduce interview stage state. */
  previousProgress?: InterviewProgress;
  hasResume?: boolean;
  targetQuestionCount?: number;
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
   * Accepted avatar termination only. With `avatarMayEnd: false` on every
   * built-in type today this is always `null`, even when the model emits a
   * marker — the marker is still stripped from `cleanedText`.
   */
  termination: { reason: string } | null;
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
  // Termination marker is trailing-only. Strip it first so a co-emitted
  // interview marker (also trailing) can still be recognized on the remainder.
  const { cleanedText: afterTermination, termination: rawTermination } =
    parseTerminationMarker(assistantText);

  let termination: { reason: string } | null = null;
  if (rawTermination) {
    const resolved = resolveTermination({
      policy: config.terminationPolicy,
      source: "avatar",
      reason: rawTermination.reason,
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
  };
}
