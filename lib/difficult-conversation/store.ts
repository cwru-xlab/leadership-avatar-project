/**
 * Owner-scoped CRUD for difficult-conversation S3 records.
 *
 * Objects live under DIFFICULT_CONVERSATIONS_PREFIX with a maintained index —
 * the Phase 9 cases/ pattern, on a NEW prefix. Never touches the cases/ tree.
 */

import { randomUUID } from "crypto";

import {
  DIFFICULT_CONVERSATIONS_PREFIX,
  s3Storage,
  type DifficultConversationIndexEntry,
} from "@/lib/s3-client";
import type {
  DifficultConversationRecord,
  DifficultyBand,
} from "@/lib/difficult-conversation/types";

/** Re-export so callers can see the S3 prefix without importing s3-client. */
export { DIFFICULT_CONVERSATIONS_PREFIX };

/**
 * Lightweight listing row. Deliberately omits `hiddenPosition` — the index
 * never stores it, and summaries must not leak the avatar's private stance
 * to discovery UIs (plan 15-07).
 */
export type DifficultConversationSummary = DifficultConversationIndexEntry;

/** Authored fields a caller may supply when creating or updating a record. */
export interface DifficultConversationSaveInput {
  id?: string;
  title: string;
  avatarRole: string;
  studentRole: string;
  situation: string;
  sharedBackstory: string;
  hiddenPosition: string;
  studentObjective: string;
  stakes: string;
  difficulty: DifficultyBand;
  avatarId: string;
  voiceId: string;
  // Intentionally no ownerId / published — stamped server-side only.
}

/**
 * Loads a difficult conversation and confirms `userId` is its owner.
 *
 * Returns null for every non-owned case: the record does not exist, it has
 * no `ownerId` (an ownerless / legacy record), or `ownerId` belongs to a
 * different user. Callers MUST turn a null return into a 404
 * `{error:"Difficult conversation not found"}` — the same body and status
 * regardless of which of those three reasons applies. Never 403, never a
 * distinguishing message; this keeps ownership private per the project-wide
 * 404-never-403 rule.
 */
export async function loadOwnedDifficultConversation(
  id: string,
  userId: string
): Promise<DifficultConversationRecord | null> {
  const record = await s3Storage.getDifficultConversationObject(id);
  if (!record || !record.ownerId || record.ownerId !== userId) {
    return null;
  }
  return record;
}

/**
 * Loads a difficult conversation by id with NO ownership check and NO
 * `published` check.
 *
 * This is the read path a session uses, and it is what makes a published
 * scenario playable by any user (P15-SC3). Phase 9's precedent: `published`
 * gates DISCOVERY only, not access — `/api/case/get` stays untouched by the
 * publish flag; the same semantic applies here.
 *
 * Callers MUST strip `hiddenPosition` before anything reaches a student-facing
 * client. The authoring UI may keep it when the caller has already passed
 * `loadOwnedDifficultConversation`.
 */
export async function loadDifficultConversationForPlay(
  id: string
): Promise<DifficultConversationRecord | null> {
  return s3Storage.getDifficultConversationObject(id);
}

/**
 * Creates or updates a difficult-conversation record.
 *
 * Stamps `ownerId` from the authenticated `userId` — never from the payload.
 * On update, preserves `createdAt` and `published`; never accepts `published`
 * from the caller's payload. Writes under DIFFICULT_CONVERSATIONS_PREFIX and
 * refreshes the index.
 */
export async function saveDifficultConversation(
  input: DifficultConversationSaveInput,
  userId: string
): Promise<DifficultConversationRecord> {
  const now = new Date().toISOString();
  const id = input.id?.trim() || randomUUID();

  const existing = input.id
    ? await s3Storage.getDifficultConversationObject(id)
    : null;

  // Ownership check on update: same 404-never-403 posture as the loader.
  if (existing && (!existing.ownerId || existing.ownerId !== userId)) {
    throw new Error("Difficult conversation not found");
  }

  const record: DifficultConversationRecord = {
    id,
    title: input.title.trim(),
    avatarRole: input.avatarRole.trim(),
    studentRole: input.studentRole.trim(),
    situation: input.situation.trim(),
    sharedBackstory: input.sharedBackstory.trim(),
    hiddenPosition: input.hiddenPosition.trim(),
    studentObjective: input.studentObjective.trim(),
    stakes: input.stakes.trim(),
    difficulty: input.difficulty,
    avatarId: input.avatarId.trim(),
    voiceId: input.voiceId.trim(),
    ownerId: userId,
    published: existing ? existing.published : false,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    lastCheck: existing ? existing.lastCheck : null,
  };

  await s3Storage.saveDifficultConversationObject(record);
  return record;
}

/**
 * Lists difficult conversations from the index as lightweight summaries.
 * Never includes `hiddenPosition`. Optionally filter by owner and/or
 * published-only (discovery).
 */
export async function listDifficultConversations(options?: {
  ownerId?: string;
  publishedOnly?: boolean;
}): Promise<DifficultConversationSummary[]> {
  const index = await s3Storage.listDifficultConversationObjects();
  return index.filter((entry) => {
    if (options?.ownerId !== undefined && entry.ownerId !== options.ownerId) {
      return false;
    }
    if (options?.publishedOnly && !entry.published) {
      return false;
    }
    return true;
  });
}

/**
 * Owner-scoped delete. Returns false when the loader would return null
 * (missing / ownerless / not yours) so callers can 404 uniformly.
 */
export async function deleteDifficultConversation(
  id: string,
  userId: string
): Promise<boolean> {
  const owned = await loadOwnedDifficultConversation(id, userId);
  if (!owned) return false;
  await s3Storage.deleteDifficultConversationObject(id);
  return true;
}
