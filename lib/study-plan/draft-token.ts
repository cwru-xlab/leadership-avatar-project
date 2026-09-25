import { randomUUID } from "crypto";
import { jwtVerify, SignJWT } from "jose";

import { validateStudyPlanContent, type StudyPlanContent } from "./types";

const DRAFT_TOKEN_TTL = "30m";
const PURPOSE = "study-plan-preview";
const MIN_SECRET_BYTES = 32;

export interface StudyPlanDraft {
  tokenId: string;
  userId: string;
  content: StudyPlanContent;
  sourceReportIds: string[];
  sourceReportCount: number;
  generationModel: string;
}

export function hasStudyPlanDraftSecret(): boolean {
  const secret = process.env.STUDY_PLAN_DRAFT_SECRET;
  return Boolean(secret && new TextEncoder().encode(secret).byteLength >= MIN_SECRET_BYTES);
}

function draftSecret(): Uint8Array {
  const secret = process.env.STUDY_PLAN_DRAFT_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < MIN_SECRET_BYTES) {
    throw new Error("Study-plan previews are not configured");
  }
  return new TextEncoder().encode(secret);
}

function validateDraft(value: unknown): StudyPlanDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Study-plan preview is invalid");
  }

  const payload = value as Record<string, unknown>;
  if (
    payload.purpose !== PURPOSE ||
    typeof payload.tokenId !== "string" ||
    !payload.tokenId ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    typeof payload.generationModel !== "string" ||
    !payload.generationModel ||
    !Number.isInteger(payload.sourceReportCount) ||
    typeof payload.sourceReportCount !== "number" ||
    payload.sourceReportCount < 1 ||
    !Array.isArray(payload.sourceReportIds) ||
    payload.sourceReportIds.length !== payload.sourceReportCount ||
    !payload.sourceReportIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    throw new Error("Study-plan preview is invalid");
  }

  return {
    tokenId: payload.tokenId,
    userId: payload.userId,
    content: validateStudyPlanContent(payload.content, payload.sourceReportCount),
    sourceReportIds: [...payload.sourceReportIds],
    sourceReportCount: payload.sourceReportCount,
    generationModel: payload.generationModel,
  };
}

export async function createStudyPlanDraftToken(
  draft: Omit<StudyPlanDraft, "tokenId">
): Promise<string> {
  const tokenId = randomUUID();
  return new SignJWT({
    purpose: PURPOSE,
    tokenId,
    userId: draft.userId,
    content: draft.content,
    sourceReportIds: draft.sourceReportIds,
    sourceReportCount: draft.sourceReportCount,
    generationModel: draft.generationModel,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(DRAFT_TOKEN_TTL)
    .sign(draftSecret());
}

export async function verifyStudyPlanDraftToken(token: string): Promise<StudyPlanDraft> {
  if (!token || typeof token !== "string") throw new Error("Study-plan preview is invalid");
  const { payload } = await jwtVerify(token, draftSecret());
  return validateDraft(payload);
}
