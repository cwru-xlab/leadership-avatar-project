/**
 * Resolves a difficult-conversation id into the 15-01 InstanceConfig member.
 *
 * Seeded code array FIRST, then the authored S3 record. Both branches produce
 * the identical DifficultConversationInstance shape so nothing downstream —
 * resolveSessionConfig, the prompts, the evaluator, the report — may branch
 * on `source`. It is provenance only.
 */

import { assignSeededAvatar } from "@/lib/difficult-conversation/avatar-assignment";
import { findSeededConversation } from "@/lib/difficult-conversation/seeded";
import { loadDifficultConversationForPlay } from "@/lib/difficult-conversation/store";
import type { DifficultConversationRecord } from "@/lib/difficult-conversation/types";
import type { DifficultConversationInstance } from "@/lib/engine/types";
import { findPersonaCase, PERSONA_CAST } from "@/lib/questioned-persona/cases";

/**
 * Maps a seeded or authored record into the engine instance member.
 * Exported for verify scripts that need to assert structural identity of the
 * two source branches without re-implementing the field list.
 */
export function mapRecordToInstance(
  record: DifficultConversationRecord,
  source: "seeded" | "authored",
  avatar: { avatarId: string; voiceId: string },
  difficulty?: DifficultConversationInstance["difficulty"],
): DifficultConversationInstance {
  return {
    kind: "difficult-conversation",
    conversationId: record.id,
    source,
    role: record.avatarRole,
    studentRole: record.studentRole,
    situation: record.situation,
    sharedBackstory: record.sharedBackstory,
    hiddenPosition: record.hiddenPosition,
    studentObjective: record.studentObjective,
    stakes: record.stakes,
    difficulty: difficulty ?? record.difficulty,
    avatarId: avatar.avatarId,
    voiceId: avatar.voiceId,
  };
}

/**
 * Seeded-first instance resolver. No ownership check and no `published`
 * check on the authored branch — that is P15-SC3 (play-by-id).
 */
export async function resolveDifficultConversationInstance(
  id: string,
): Promise<DifficultConversationInstance | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  // Questioned-persona cases (patients, clients) are seeded records of the
  // same shape plus a persona card. They share this resolver so the session
  // start, chat and grading paths need no second branch; callers that
  // serve one type check `personaCard?.style` against their slug.
  const persona = findPersonaCase(trimmed);
  if (persona) {
    const avatar = await assignSeededAvatar(trimmed, PERSONA_CAST);
    return {
      ...mapRecordToInstance(persona, "seeded", avatar),
      personaCard: persona.personaCard,
    };
  }

  const seeded = findSeededConversation(trimmed);

  if (seeded) {
    const avatar = await assignSeededAvatar(trimmed);
    return mapRecordToInstance(seeded, "seeded", avatar);
  }

  const authored = await loadDifficultConversationForPlay(trimmed);

  if (!authored) return null;

  return mapRecordToInstance(authored, "authored", {
    avatarId: authored.avatarId,
    voiceId: authored.voiceId,
  });
}
