/**
 * Short-lived server proof for an avatar walk-out.
 *
 * The browser may use SSE metadata to coordinate the final spoken line, but it
 * must not be able to forge the protected decline evidence persisted at finish.
 * A proof is issued only by the chat route after it has computed a qualifying
 * threshold crossing, then verified by finishSession against the authenticated
 * user and report row.
 */

import { SignJWT, jwtVerify } from "jose";

import type {
  DisengagementComputeResult,
  DisengagementCue,
} from "./disengagement";

const WALK_OUT_PROOF_TTL = "2m";
const WALK_OUT_PROOF_KIND = "engine-walk-out-v1";
const WALK_OUT_PROOF_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export type VerifiedWalkOutProof = {
  disengagement: DisengagementComputeResult;
  cue: DisengagementCue | null;
  assistantTurnCount: number;
  elapsedSeconds: number;
};

function isDisengagementCue(value: unknown): value is DisengagementCue {
  return value === "rising" || value === "high";
}

function isDisengagementResult(
  value: unknown,
): value is DisengagementComputeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Partial<DisengagementComputeResult>;
  return (
    typeof candidate.value === "number" &&
    Number.isFinite(candidate.value) &&
    typeof candidate.crossed === "boolean" &&
    Array.isArray(candidate.episodes) &&
    Array.isArray(candidate.dominantCauses)
  );
}

export async function createWalkOutProof({
  userId,
  reportId,
  disengagement,
  cue,
  assistantTurnCount,
  elapsedSeconds,
}: {
  userId: string;
  reportId: string;
  disengagement: DisengagementComputeResult;
  cue: DisengagementCue | null;
  assistantTurnCount: number;
  elapsedSeconds: number;
}): Promise<string> {
  return new SignJWT({
    kind: WALK_OUT_PROOF_KIND,
    reportId,
    disengagement,
    cue,
    assistantTurnCount,
    elapsedSeconds,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(WALK_OUT_PROOF_TTL)
    .sign(WALK_OUT_PROOF_SECRET);
}

export async function verifyWalkOutProof({
  token,
  userId,
  reportId,
}: {
  token: unknown;
  userId: string;
  reportId: string;
}): Promise<VerifiedWalkOutProof | null> {
  if (typeof token !== "string" || !token) return null;

  try {
    const { payload } = await jwtVerify(token, WALK_OUT_PROOF_SECRET);

    if (
      payload.kind !== WALK_OUT_PROOF_KIND ||
      payload.sub !== userId ||
      payload.reportId !== reportId ||
      !isDisengagementResult(payload.disengagement) ||
      !payload.disengagement.crossed ||
      (!isDisengagementCue(payload.cue) && payload.cue !== null) ||
      typeof payload.assistantTurnCount !== "number" ||
      !Number.isFinite(payload.assistantTurnCount) ||
      typeof payload.elapsedSeconds !== "number" ||
      !Number.isFinite(payload.elapsedSeconds) ||
      payload.elapsedSeconds < 0
    ) {
      return null;
    }

    return {
      disengagement: payload.disengagement,
      cue: payload.cue,
      assistantTurnCount: Math.max(0, Math.trunc(payload.assistantTurnCount)),
      elapsedSeconds: Math.max(0, Math.trunc(payload.elapsedSeconds)),
    };
  } catch {
    return null;
  }
}
