/**
 * SERVER-SIDE GATE for 16-CONTEXT.md decision 8.
 *
 * An attestation is recorded before third-party pasted text is accepted for
 * persona distillation. `consumeAttestation` MUST be called and MUST return
 * `ok` BEFORE any persona-distillation model call runs (plan 16-05 owns the
 * route that enforces this ordering).
 *
 * This is a table rather than a `User` column because decision 8 explicitly
 * rejects "a once-per-student acknowledgement that later sessions skip".
 * Each row is single-use via `consumedAt`: one tick, one distillation.
 */

import { prisma } from "@/lib/prisma";

export const NETWORKING_ATTESTATION_WORDING: Record<string, string> = {
  // DRAFT — pending human sign-off (Task 3)
  v1:
    "I confirm I have a legitimate basis for entering this description of a real person " +
    "(for example, they shared it with me, or it is publicly available professional " +
    "information I am using for practice). This text will be used once to shape a " +
    "role-play persona for my own practice session and will never be stored. The " +
    "resulting persona is private to me and can never be shared with other students.",
};

/**
 * Bumping this invalidates every un-consumed attestation, which is the point:
 * a student who ticked old wording has not agreed to the new wording.
 */
export const CURRENT_ATTESTATION_WORDING_VERSION = "v1";

/**
 * An attestation is a tick the student made moments ago in the wizard, not a
 * standing permission. Thirty minutes is generous for a wizard and far short of
 * a session boundary.
 */
export const ATTESTATION_FRESHNESS_SECONDS = 30 * 60;

export type RecordAttestationResult =
  | { ok: true; attestationId: string; attestedAt: Date }
  | { ok: false; reason: "stale-wording" };

export type ConsumeAttestationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not-found"
        | "not-owned"
        | "already-consumed"
        | "expired"
        | "stale-wording";
    };

/**
 * Insert a new attestation for `userId` against the wording version the client
 * claims it showed. Rejects stale wording WITHOUT writing a row.
 */
export async function recordAttestation(args: {
  userId: string;
  wordingVersion: string;
}): Promise<RecordAttestationResult> {
  const { userId, wordingVersion } = args;

  if (wordingVersion !== CURRENT_ATTESTATION_WORDING_VERSION) {
    return { ok: false, reason: "stale-wording" };
  }

  const row = await prisma.networkingAttestation.create({
    data: {
      userId,
      wordingVersion,
    },
    select: { id: true, attestedAt: true },
  });

  return { ok: true, attestationId: row.id, attestedAt: row.attestedAt };
}

/**
 * Spend one attestation on one distillation. Race-safe: stamps `consumedAt`
 * with a conditional update (`consumedAt: null`) so two concurrent consumes
 * cannot both succeed.
 *
 * `currentWordingVersion` defaults to `CURRENT_ATTESTATION_WORDING_VERSION` and
 * is overridable so the verify script can simulate a version bump without
 * mutating the module constant.
 */
export async function consumeAttestation(args: {
  attestationId: string;
  userId: string;
  now: Date;
  currentWordingVersion?: string;
}): Promise<ConsumeAttestationResult> {
  const {
    attestationId,
    userId,
    now,
    currentWordingVersion = CURRENT_ATTESTATION_WORDING_VERSION,
  } = args;

  const row = await prisma.networkingAttestation.findUnique({
    where: { id: attestationId },
  });

  if (!row) {
    return { ok: false, reason: "not-found" };
  }

  // Opaque at the route layer with not-found — same posture as loadOwnedScenario.
  if (row.userId !== userId) {
    return { ok: false, reason: "not-owned" };
  }

  if (row.consumedAt !== null) {
    return { ok: false, reason: "already-consumed" };
  }

  const ageSeconds = (now.getTime() - row.attestedAt.getTime()) / 1000;

  if (ageSeconds > ATTESTATION_FRESHNESS_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  if (row.wordingVersion !== currentWordingVersion) {
    return { ok: false, reason: "stale-wording" };
  }

  const updated = await prisma.networkingAttestation.updateMany({
    where: { id: attestationId, consumedAt: null },
    data: { consumedAt: now },
  });

  if (updated.count === 0) {
    return { ok: false, reason: "already-consumed" };
  }

  return { ok: true };
}
