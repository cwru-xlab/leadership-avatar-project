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
import type { DisengagementCause } from "./disengagement";

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
  | {
      ok: false;
      recordedReason: null;
      reason?: "floor-not-met" | "disengagement-below-threshold";
    };

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
 *    (reject) rather than letting an unmeasured session end — UNLESS
 *    `severeContent` is true — see the carve-out comment.
 * 4. If `policy.disengagementThreshold` is set, require a trusted derived
 *    `disengagementValue` at or above it. A missing value fails closed.
 *    This gate is NOT skipped by `severeContent` — only the floor is.
 *
 * - `source: "student"` is accepted iff `policy.studentMayEnd` (no floor).
 *
 * A rejected result means the session continues; it never throws. With
 * `avatarMayEnd: false`, no avatar-sourced call can ever succeed regardless
 * of the reason supplied.
 */
export function resolveTermination({
  policy,
  source,
  reason,
  assistantTurnCount,
  disengagementValue,
  severeContent = false,
}: {
  policy: TerminationPolicyConfig;
  source: "student" | "avatar";
  reason: string | null;
  /** Optional so Phase 13 call sites compile unchanged. Required when a
   * floor is configured — omission fails closed. */
  assistantTurnCount?: number;
  /** Required only by a threshold-enabled policy; otherwise ignored. */
  disengagementValue?: number;
  /**
   * NAMED CARVE-OUT (Phase 20 / REQ-100): true iff the deterministic
   * detector classified the triggering student turn(s) as severe —
   * slurs, harassment, or threats aimed at the person. Defaults to
   * `false` so every Phase 13/14/18 call site compiles and behaves
   * unchanged. See the carve-out comment at gate (3) below for what this
   * does and does not skip.
   */
  severeContent?: boolean;
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

  // (3) avatar-end floor — fail closed when the count is missing.
  //
  // NAMED CARVE-OUT (Phase 20 / REQ-100): severe content — slurs, harassment,
  // and threats aimed at the person — ends the session regardless of the
  // floor. This is a deliberate, enumerated exception to Phase 18 Success
  // Criterion 5 ("a walk-out can never fire before a type's avatarEndFloor
  // minimum turns"), recorded as an amendment in 20-VALIDATION.md, NOT an
  // incidental bypass. Keeping a student in the conversation for two more
  // turns to satisfy a gradeable-material floor after a slur is the wrong
  // trade. The floor is NOT lowered: it still governs every other trigger
  // at its declared value.
  //
  // The carve-out skips the FLOOR only. Gates (1), (2) and (4) still apply
  // in full: `avatarMayEnd` must be true, the reason must be in the closed
  // vocabulary, and the derived disengagement value must still reach the
  // threshold. A severe turn is not a bypass of the engine's authority,
  // only of the turn-count minimum. Severe content reaching the threshold
  // is the job of the signal path (20-02 and 20-05), not of this gate.
  const floor = policy.avatarEndFloor;

  if (floor != null && !severeContent) {
    if (
      assistantTurnCount === undefined ||
      assistantTurnCount < floor.minAssistantTurns
    ) {
      return { ok: false, recordedReason: null, reason: "floor-not-met" };
    }
  }

  // (4) threshold-enabled policies require engine-owned derived evidence.
  const threshold = policy.disengagementThreshold;

  if (
    threshold != null &&
    (disengagementValue === undefined ||
      !Number.isFinite(disengagementValue) ||
      disengagementValue < threshold)
  ) {
    return {
      ok: false,
      recordedReason: null,
      reason: "disengagement-below-threshold",
    };
  }

  return { ok: true, recordedReason: reason };
}

/**
 * Picks the reason a derived walk-out records, from the type's own closed
 * vocabulary. The engine never invents a reason and never emits one a policy
 * did not declare: an unmapped or non-member result returns null, and the
 * caller falls back to the model's own marker reason (today's behaviour).
 *
 * Precedence is deterministic and does not depend on map iteration order:
 *   1. severe content, when the policy maps `severe_content`
 *   2. the first cause in `dominantCauses` that the policy maps
 *   3. null
 *
 * Pure: no I/O, no Prisma, no fetch, matching this module's file-top
 * contract.
 */
export function resolveWalkOutReason({
  policy,
  dominantCauses,
  severe,
}: {
  policy: TerminationPolicyConfig;
  dominantCauses: readonly DisengagementCause[];
  severe: boolean;
}): string | null {
  const map = policy.avatarEndReasonByCause;

  if (!map) {
    return null;
  }

  const isDeclared = (value: string | undefined): value is string =>
    value !== undefined && policy.avatarEndReasons.includes(value);

  if (severe) {
    const severeReason = map.severe_content;

    if (isDeclared(severeReason)) {
      return severeReason;
    }
  }

  for (const cause of dominantCauses) {
    const mapped = map[cause];

    if (isDeclared(mapped)) {
      return mapped;
    }
  }

  return null;
}
