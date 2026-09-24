import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import {
  resolveInterviewType,
  resolveCustomizationRecord,
  type InterviewCustomizationInput,
} from "@/lib/interview/customization";
import type { CameraMode } from "@/lib/metrics/types";

export const runtime = "nodejs";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_RESUME_TEXT_LENGTH = 60000;
const MAX_NAME_LENGTH = 200;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Create the IN_PROGRESS InterviewReport row.
 *
 * Called by the client after the first real turn lands, not on entering the
 * session step — no row is created for a session where the avatar never
 * connected or the student bailed instantly.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return response({ error: "Invalid request body" }, 400);
    }

    const {
      typeSlug,
      interviewerAvatarId: rawInterviewerAvatarId,
      interviewerName: rawInterviewerName,
      resumeId: rawResumeId,
      resumeText: rawResumeText,
      customization,
      cameraMode: rawCameraMode,
    } = body as Record<string, unknown>;

    // `resolveInterviewType` is the only place field validation happens; the
    // raw `customization` payload is passed straight through unfiltered.
    const type = resolveInterviewType(
      typeof typeSlug === "string" ? typeSlug : null,
      customization as InterviewCustomizationInput | undefined
    );
    if (!type) {
      return response({ error: "Unknown interview type" }, 400);
    }

    const interviewerAvatarId =
      typeof rawInterviewerAvatarId === "string"
        ? truncate(rawInterviewerAvatarId, MAX_NAME_LENGTH)
        : null;

    const interviewerName =
      typeof rawInterviewerName === "string"
        ? truncate(rawInterviewerName, MAX_NAME_LENGTH)
        : null;

    // Client-supplied resumeId is never allowed to shape an S3 key downstream;
    // a malformed value is silently dropped rather than rejected.
    const resumeId =
      typeof rawResumeId === "string" && UUID_V4_REGEX.test(rawResumeId)
        ? rawResumeId
        : null;

    const resumeText =
      typeof rawResumeText === "string"
        ? truncate(rawResumeText, MAX_RESUME_TEXT_LENGTH)
        : null;

    // The customization snapshot comes off the already-resolved `type`, so the
    // row records exactly what the prompt used — even when the client sent
    // garbage that fell back to preset defaults.
    const customizationRecord = resolveCustomizationRecord(type);

    // REQ-35: never trust the client's string. Anything other than the two
    // literal CameraMode values falls back to "OFF", mirroring the
    // resolveInterviewType precedent of a hostile value silently falling
    // back rather than throwing.
    let cameraMode: CameraMode =
      rawCameraMode === "ON" || rawCameraMode === "OFF" ? rawCameraMode : "OFF";

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { videoAnalysisConsentAt: true },
    });
    const consentAt = user?.videoAnalysisConsentAt ?? null;

    // REQ-36 enforced in code, not only in UI: a client that skipped the
    // consent dialog must not be able to start a measured session, the same
    // discipline the evaluators use for score nulling. The server is the
    // last line of defence — it never trusts a client-reported "consent
    // already given".
    if (cameraMode === "ON" && !consentAt) {
      console.info("Interview session start: forcing camera OFF (no consent)", {
        userId: currentUser.id,
      });
      cameraMode = "OFF";
    }

    // cameraMode and metricsConsentAt are written ONCE, here, at creation.
    // There is no update path anywhere that mutates cameraMode later — that
    // is REQ-35's lock enforced structurally, not by the UI disabling a toggle.
    const report = await prisma.interviewReport.create({
      data: {
        userId: currentUser.id,
        typeSlug: type.slug,
        interviewerAvatarId,
        interviewerName,
        resumeId,
        resumeText,
        status: "IN_PROGRESS",
        cameraMode,
        metricsConsentAt: consentAt,
        ...customizationRecord,
      },
      select: { id: true },
    });

    console.info("Interview report created", {
      userId: currentUser.id,
      reportId: report.id,
      typeSlug: type.slug,
      difficulty: customizationRecord.difficulty,
      targetMinutes: customizationRecord.targetMinutes,
      cameraMode,
    });

    // Return the RESOLVED mode, not the requested one. The server may have
    // forced OFF for missing consent above; a client that never learns this
    // would keep capturing and showing the live banner while the report
    // records a deliberate opt-out — the exact contradiction a student sees
    // as "I had my camera on but my report says it was off".
    return response({ reportId: report.id, cameraMode }, 201);
  } catch (error) {
    console.error("Interview session start failed:", error);
    return response({ error: "Unable to start the interview session." }, 500);
  }
}
