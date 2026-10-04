/**
 * Builds the NetworkingInputSnapshot for session start (16-09).
 *
 * Kept outside lib/engine/ so the engine never names a `goal` field — the
 * goal is per-type data. startSession delegates here, then persists the
 * returned snapshot.
 */

import { getNetworkingCharacter } from "./characters";
import { loadOwnedNetworkingPersona } from "./persona-store";
import type { NetworkingInputSnapshot } from "@/lib/report/snapshot";
import type { InstanceConfig } from "@/lib/engine/types";

/** Matches NETWORKING_GOAL_MAX_LENGTH on NetworkingGoalStep (16-08). */
export const MAX_NETWORKING_GOAL_LENGTH = 300;

export type NetworkingStartSnapshotResult =
  | {
      ok: true;
      snapshot: NetworkingInputSnapshot;
      resolveInstance?: InstanceConfig;
    }
  | { ok: false; status: number; error: string };

/**
 * Resolve character XOR brought-in persona + required goal into a snapshot.
 * `customization` is the wizard bag `{ characterId?, goal? }`.
 */
export async function buildNetworkingStartSnapshot(input: {
  userId: string;
  instanceId?: string | null;
  customization?: unknown;
  interviewerAvatarId?: string | null;
}): Promise<NetworkingStartSnapshotResult> {
  const customBag =
    input.customization && typeof input.customization === "object"
      ? (input.customization as Record<string, unknown>)
      : {};

  const characterIdRaw =
    typeof customBag.characterId === "string"
      ? customBag.characterId.trim()
      : "";
  const goalRaw =
    typeof customBag.goal === "string" ? customBag.goal.trim() : "";
  const personaIdRaw =
    typeof input.instanceId === "string" && input.instanceId.trim()
      ? input.instanceId.trim()
      : "";

  if (!goalRaw) {
    return { ok: false, status: 400, error: "A networking goal is required" };
  }
  if (goalRaw.length > MAX_NETWORKING_GOAL_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Networking goal must be at most ${MAX_NETWORKING_GOAL_LENGTH} characters`,
    };
  }

  const hasCharacter = Boolean(characterIdRaw);
  const hasPersona = Boolean(personaIdRaw);
  if (hasCharacter === hasPersona) {
    return {
      ok: false,
      status: 400,
      error:
        "Networking requires exactly one of characterId or a brought-in persona",
    };
  }

  const interviewerAvatarId = input.interviewerAvatarId ?? null;

  if (hasCharacter) {
    const character = getNetworkingCharacter(characterIdRaw);
    if (!character) {
      return { ok: false, status: 400, error: "Unknown networking character" };
    }
    return {
      ok: true,
      snapshot: {
        kind: "networking",
        personaSource: "character",
        characterId: character.id,
        personaId: null,
        displayName: character.displayName,
        goal: goalRaw,
        interviewerAvatarId,
        interviewerVoice: null,
        budgetSeconds: null,
      },
    };
  }

  const persona = await loadOwnedNetworkingPersona(personaIdRaw, input.userId);
  if (!persona) {
    return { ok: false, status: 404, error: "Persona not found" };
  }

  return {
    ok: true,
    resolveInstance: persona,
    snapshot: {
      kind: "networking",
      personaSource: "brought-in",
      characterId: null,
      personaId: persona.personaId,
      displayName: persona.displayName,
      goal: goalRaw,
      interviewerAvatarId,
      interviewerVoice: null,
      budgetSeconds: null,
    },
  };
}
