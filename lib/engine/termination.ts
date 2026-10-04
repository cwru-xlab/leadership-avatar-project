/**
 * Who may end a session, and how an avatar-initiated end is recognized.
 *
 * Built on the SAME marker-and-tail-block machinery
 * `lib/interview/turn-control.ts`'s `parseInterviewTurn` already uses for its
 * `<interview-turn .../>` controller marker, rather than inventing a second
 * mechanism: the model emits a trailing marker, which is stripped from the
 * text the student sees before it reaches the UI, transcript, or avatar.
 *
 * MARKER SYNTAX (chosen here, documented once): a trailing
 *   <engine-end reason="..." />
 * The type's own `liveSystemPrompt` is what instructs the model to emit this
 * marker and lists the exact `reason` vocabulary it may cite — that
 * instruction text is itself session-constant (REQ-73: it does not vary
 * turn to turn), so wiring it into a type's prompt does not threaten the
 * OpenAI prefix cache. This module only parses and validates; it never
 * emits the instruction text.
 *
 * The floor exists so every session yields gradeable material (CONTEXT.md
 * 14: "gated by a floor — it may never end before a minimum has happened").
 * A rejected termination means the session CONTINUES; nothing about the
 * student's turn is cut short and no error surfaces to the student.
 *
 * Pure functions only — no I/O, no Prisma, no fetch.
 */

import type { TerminationPolicyConfig } from "./types";

const TERMINATION_MARKER = /\s*<engine-end\b([^>]*)\/?>(?:\s*)$/i;
const REASON_ATTRIBUTE = /\breason=(?:"([^"]*)"|'([^']*)')/i;

export interface ParsedTerminationMarker {
  cleanedText: string;
  termination: { reason: string } | null;
}

/**
 * Strips a trailing `<engine-end reason="..." />` marker from the model's
 * reply, exactly as `parseInterviewTurn` strips today's marker. Text with no
 * marker round-trips byte-identically. A trailing marker with no (or an
 * empty) `reason` attribute is stripped but not interpreted as a
 * termination — the model must supply a reason to be considered at all; it
 * is `resolveTermination` below that decides whether that reason is one the
 * session actually accepts.
 */
export function parseTerminationMarker(
  assistantText: string,
): ParsedTerminationMarker {
  const marker = assistantText.match(TERMINATION_MARKER);

  if (!marker) {
    return { cleanedText: assistantText, termination: null };
  }

  const attributes = marker[1];
  const reasonMatch = attributes.match(REASON_ATTRIBUTE);
  const reason = reasonMatch ? (reasonMatch[1] ?? reasonMatch[2] ?? "") : "";
  const cleanedText = assistantText.slice(0, marker.index).trim();

  if (!reason) {
    return { cleanedText, termination: null };
  }

  return { cleanedText, termination: { reason } };
}

export type TerminationResolution =
  | { ok: true; recordedReason: string }
  | { ok: false; recordedReason: null; reason?: "floor-not-met" };

/**
 * Decides whether a termination attempt is accepted under a type's
 * `TerminationPolicyConfig`.
 *
 * Gate order:
 * 1. `source: "avatar"` requires `policy.avatarMayEnd`.
 * 2. The reason must be in `policy.avatarEndReasons` — an unrecognized
 *    reason is REJECTED, not stored, so the model cannot invent a reason
 *    vocabulary the report would then have to display.
 * 3. If `policy.avatarEndFloor` is set, require
 *    `assistantTurnCount >= policy.avatarEndFloor.minAssistantTurns`.
 *    When the floor is set and `assistantTurnCount` is missing, FAIL CLOSED
 *    (reject) rather than letting an unmeasured session end.
 *
 * - `source: "student"` is accepted iff `policy.studentMayEnd` (no floor).
 *
 * A rejected result means the session continues; it never throws. With
 * `avatarMayEnd: false` (every built-in type today), no avatar-sourced call
 * can ever succeed regardless of the reason supplied.
 */
export function resolveTermination({
  policy,
  source,
  reason,
  assistantTurnCount,
}: {
  policy: TerminationPolicyConfig;
  source: "student" | "avatar";
  reason: string | null;
  /** Optional so Phase 13 call sites compile unchanged. Required when a
   * floor is configured — omission fails closed. */
  assistantTurnCount?: number;
}): TerminationResolution {
  if (source === "student") {
    if (!policy.studentMayEnd) {
      return { ok: false, recordedReason: null };
    }

    return { ok: true, recordedReason: reason ?? "" };
  }

  // source === "avatar"
  // (1) avatarMayEnd must be true
  if (!policy.avatarMayEnd) {
    return { ok: false, recordedReason: null };
  }

  // (2) reason must be in the closed vocabulary
  if (!reason || !policy.avatarEndReasons.includes(reason)) {
    return { ok: false, recordedReason: null };
  }

  // (3) avatar-end floor — fail closed when the count is missing
  const floor = policy.avatarEndFloor;
  if (floor != null) {
    if (
      assistantTurnCount === undefined ||
      assistantTurnCount < floor.minAssistantTurns
    ) {
      return { ok: false, recordedReason: null, reason: "floor-not-met" };
    }
  }

  return { ok: true, recordedReason: reason };
}
