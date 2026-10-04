/**
 * DEPRECATED — thin delegation to the engine. Deleted in plan 13-13 once no
 * client calls this path. Exists only so the un-migrated client surfaces keep
 * working mid-phase.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { startSession } from "@/lib/engine/session";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

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
      interviewerAvatarId,
      interviewerName,
      resumeId,
      resumeText,
      customization,
      cameraMode,
    } = body as Record<string, unknown>;

    if (typeof typeSlug !== "string" || !typeSlug) {
      return response({ error: "Unknown interview type" }, 400);
    }

    const result = await startSession({
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      typeSlug,
      customization: customization as InterviewCustomizationInput | undefined,
      cameraModeRequest: cameraMode,
      interviewerAvatarId,
      interviewerName,
      resumeId,
      resumeText,
    });

    if (!result.ok) {
      return response(
        { error: result.error === "Unknown interaction type" ? "Unknown interview type" : result.error },
        result.status,
      );
    }

    return response({ reportId: result.reportId, cameraMode: result.cameraMode }, 201);
  } catch (error) {
    console.error("Interview session start failed:", error);
    return response({ error: "Unable to start the interview session." }, 500);
  }
}
