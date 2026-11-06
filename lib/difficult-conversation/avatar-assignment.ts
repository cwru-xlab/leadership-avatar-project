/**
 * Avatar assignment for seeded difficult conversations.
 *
 * Seeded records deliberately leave `avatarId` / `voiceId` empty. They are
 * filled here at resolve time (play, session start and grading all call
 * `resolveDifficultConversationInstance`) from the pinned stock cast in
 * `SEEDED_COUNTERPART_CAST`, checked against the same filtered, cached catalog
 * the interviewer picker renders (`lib/interview/avatar-catalog.ts`). Nothing
 * is written anywhere, so changing the cast changes every student's next
 * session; reports already taken keep the avatar their snapshot recorded.
 *
 * NEVER A FACULTY FACE. The account's custom avatars are likenesses of real
 * Weatherhead faculty. Neither the cast nor any fallback below may pick one:
 * fallbacks draw only from the seated public roster (`lib/avatar-roster.ts`).
 * Authored conversations never come through here; they keep the avatar the
 * student picked, faculty included.
 *
 * Voice pairing: always the chosen avatar's OWN default voice. Never
 * cross-pair — same discipline as `CaseAvatar` in `types/index.ts`.
 */

import { createHash } from "crypto";

import { SEATED_PUBLIC_AVATAR_ID_SET } from "@/lib/avatar-roster";
import {
  loadInterviewerCatalog,
  type InterviewerOption,
} from "@/lib/interview/avatar-catalog";
import { SEEDED_COUNTERPART_CAST } from "@/lib/difficult-conversation/seeded";

export interface SeededAvatarPair {
  avatarId: string;
  voiceId: string;
}

/** Stable non-negative index from conversationId into a list of `length`. */
function catalogIndex(conversationId: string, length: number): number {
  const digest = createHash("sha256").update(conversationId).digest();
  return digest.readUInt32BE(0) % length;
}

/**
 * The pure rule, separated so verification can run it against a fixed catalog.
 *
 * `catalog` is the live interviewer catalog, or null when it could not be
 * loaded. In order:
 * 1. The cast avatar is in the catalog: use it with its current default voice.
 * 2. It churned out: a stock avatar of the same presentation, preferring one
 *    no other seeded scenario is cast with, chosen by a stable hash of the id.
 * 3. No catalog, or no stock match: the cast's own pinned pair. A catalog
 *    outage must not stop a student starting (or a report grading); the
 *    session's avatar error path covers a pair that truly stopped working.
 */
export function resolveSeededCounterpart(
  conversationId: string,
  catalog: readonly InterviewerOption[] | null,
): SeededAvatarPair | null {
  const cast = SEEDED_COUNTERPART_CAST[conversationId];
  if (!cast) return null;

  const pinned = { avatarId: cast.avatarId, voiceId: cast.voiceId };
  if (!catalog) return pinned;

  const live = catalog.find((option) => option.avatarId === cast.avatarId);
  if (live) return { avatarId: live.avatarId, voiceId: live.voice.id };

  const stock = catalog
    .filter(
      (option) =>
        SEATED_PUBLIC_AVATAR_ID_SET.has(option.avatarId) &&
        option.gender === cast.presentation,
    )
    .sort((a, b) => a.avatarId.localeCompare(b.avatarId));
  const castIds = new Set(
    Object.values(SEEDED_COUNTERPART_CAST).map((c) => c.avatarId),
  );
  const uncast = stock.filter((option) => !castIds.has(option.avatarId));
  const pool = uncast.length ? uncast : stock;
  if (!pool.length) return pinned;

  const chosen = pool[catalogIndex(conversationId, pool.length)]!;
  console.error("[dc-avatar] cast avatar not in catalog; substituting", {
    conversationId,
    missing: cast.avatarId,
    substitute: chosen.name,
  });
  return { avatarId: chosen.avatarId, voiceId: chosen.voice.id };
}

/**
 * The stock avatar (+ its own voice) that plays a seeded conversation's
 * counterpart. Throws only for an id with no cast entry, which is a code bug.
 */
export async function assignSeededAvatar(
  conversationId: string,
): Promise<SeededAvatarPair> {
  const id = conversationId.trim();
  const catalog = await loadInterviewerCatalog();
  const pair = resolveSeededCounterpart(
    id,
    catalog.ok ? catalog.interviewers : null,
  );
  if (!pair) {
    throw new Error(
      `Cannot resolve seeded conversation avatar: "${id}" has no entry in SEEDED_COUNTERPART_CAST.`,
    );
  }
  return pair;
}
