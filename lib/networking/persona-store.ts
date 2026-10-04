/**
 * Owner-scoped store for a brought-in person's DISTILLED networking persona.
 *
 * 16-CONTEXT.md decision 7: this record describes a REAL PERSON and is
 * NEVER publishable. The publish affordance must be absent, not merely
 * defaulted off. There is deliberately no analogue of
 * `app/api/scenario/publish/route.ts` for networking personas — no
 * `published` field, no shared listing, and no publish route. Do not add
 * one "for symmetry".
 *
 * 16-CONTEXT.md decision 6: the raw pasted text is stored nowhere. This
 * module only ever persists the distilled `persona` sentence plus its
 * `displayName`. The record has no field for the original paste, and
 * write validation never accepts one.
 *
 * Key layout (deliberate divergence from `cases/`):
 *   networking-personas/{ownerId}/{personaId}.json
 * Partitioning by owner in the key makes a cross-owner read impossible to
 * express by accident, and makes `listOwnedNetworkingPersonas` a prefix
 * list rather than a full scan plus filter. There is no
 * `listAllNetworkingPersonas` and must never be one.
 *
 * No Phase 13 shared instance-storage helper existed; this module copies
 * the Put/Get/Delete Object pattern of `s3Storage.saveCase` /
 * `s3Storage.getCase` (`lib/s3-client.ts`) onto the owner-partitioned
 * prefix above.
 */

import type { InstanceConfig } from "@/lib/engine/types";

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { MAX_PERSONA_LENGTH } from "@/lib/interview/customization";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/interview/persona-distill";

export const NETWORKING_PERSONA_PREFIX = "networking-personas/";

/** The `kind: "networking-persona"` InstanceConfig member — do not redeclare. */
export type NetworkingPersonaRecord = Extract<
  InstanceConfig,
  { kind: "networking-persona" }
>;

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

function sanitizePathSegment(segment: string, fieldName: string): string {
  if (
    segment.includes("..") ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    throw new Error(`Invalid ${fieldName}: contains path traversal characters`);
  }
  const safe = segment.replace(/[^a-zA-Z0-9_-]/g, "");

  if (safe !== segment) {
    throw new Error(`Invalid ${fieldName}: contains disallowed characters`);
  }
  if (!safe) {
    throw new Error(`Invalid ${fieldName}: cannot be empty after sanitization`);
  }

  return safe;
}

function personaKey(ownerId: string, personaId: string): string {
  const safeOwner = sanitizePathSegment(ownerId, "ownerId");
  const safePersona = sanitizePathSegment(personaId, "personaId");

  return `${NETWORKING_PERSONA_PREFIX}${safeOwner}/${safePersona}.json`;
}

/**
 * Validate a record before write. Throws on violation — the route turns
 * that into a 400.
 */
export function validateNetworkingPersonaRecord(
  record: NetworkingPersonaRecord,
): void {
  if (!record.ownerId || !record.ownerId.trim()) {
    throw new Error("ownerId is required");
  }
  if (!record.attestationId || !record.attestationId.trim()) {
    throw new Error("attestationId is required");
  }
  if (!record.displayName || !record.displayName.trim()) {
    throw new Error("displayName is required");
  }
  if (record.displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `displayName must be <= ${MAX_DISPLAY_NAME_LENGTH} characters`,
    );
  }
  if (!record.persona || !record.persona.trim()) {
    throw new Error("persona is required");
  }
  if (record.persona.length > MAX_PERSONA_LENGTH) {
    throw new Error(`persona must be <= ${MAX_PERSONA_LENGTH} characters`);
  }
}

/**
 * Writes one owner-scoped networking persona JSON object to S3.
 */
export async function saveNetworkingPersona(
  record: NetworkingPersonaRecord,
): Promise<void> {
  validateNetworkingPersonaRecord(record);

  const key = personaKey(record.ownerId, record.personaId);
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(record, null, 2),
    ContentType: "application/json",
  });

  await s3Client.send(command);
}

/**
 * Loads a persona only when `userId` owns it.
 *
 * Copies the `loadOwnedScenario` idiom at `lib/scenario/validation.ts:252`:
 * ownership failure and non-existence are indistinguishable. Callers MUST
 * turn a null return into a 404 — never 403. Belt and braces: the key is
 * already under the caller's prefix, then we still re-check
 * `record.ownerId === userId` so a mismatched field cannot leak.
 */
export async function loadOwnedNetworkingPersona(
  personaId: string,
  userId: string,
): Promise<NetworkingPersonaRecord | null> {
  let key: string;

  try {
    key = personaKey(userId, personaId);
  } catch {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);

    if (!response.Body) return null;

    const content = await response.Body.transformToString();
    const record = JSON.parse(content) as NetworkingPersonaRecord;

    // loadOwnedScenario idiom: null → 404, never 403.
    if (!record || !record.ownerId || record.ownerId !== userId) {
      return null;
    }

    return record;
  } catch (error: unknown) {
    const err = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };

    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    // eslint-disable-next-line no-console -- match s3-client getCase error logging
    console.error(`Failed to get networking persona ${personaId}:`, error);

    return null;
  }
}

/**
 * Lists personas under the caller's own prefix only, newest-createdAt first.
 *
 * There is no `listAllNetworkingPersonas` and must never be one — a
 * cross-owner list would be a publish surface by another name.
 */
export async function listOwnedNetworkingPersonas(
  userId: string,
): Promise<NetworkingPersonaRecord[]> {
  let prefix: string;

  try {
    const safeOwner = sanitizePathSegment(userId, "ownerId");

    prefix = `${NETWORKING_PERSONA_PREFIX}${safeOwner}/`;
  } catch {
    return [];
  }

  const records: NetworkingPersonaRecord[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await s3Client.send(command);

      for (const obj of response.Contents ?? []) {
        if (!obj.Key || !obj.Key.endsWith(".json")) continue;
        const personaId = obj.Key.slice(prefix.length).replace(/\.json$/, "");

        if (!personaId) continue;
        const record = await loadOwnedNetworkingPersona(personaId, userId);

        if (record) records.push(record);
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
  } catch (error) {
    // eslint-disable-next-line no-console -- match s3-client listCases error logging
    console.error(`Failed to list networking personas for ${userId}:`, error);

    return [];
  }

  records.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return records;
}

/**
 * Deletes a persona only when `userId` owns it. A non-owner's delete is a
 * no-op returning `false` (same 404-never-403 posture).
 */
export async function deleteOwnedNetworkingPersona(
  personaId: string,
  userId: string,
): Promise<boolean> {
  const existing = await loadOwnedNetworkingPersona(personaId, userId);

  if (!existing) return false;

  let key: string;

  try {
    key = personaKey(userId, personaId);
  } catch {
    return false;
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);

  return true;
}
