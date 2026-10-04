/**
 * THE ONE session-start endpoint for every interaction type (REQ-59).
 *
 * Accepts `typeSlug` (and `instanceId` where the type requires an instance)
 * so one path serves interview presets and case-study alike. Legacy
 * `/api/interview/session/start` and `/api/scenario/session/start` delegate
 * here pending deletion in plan 13-13.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { startSession } from "@/lib/engine/session";
import type { InstanceConfig } from "@/lib/engine/types";
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
      instanceId,
      instance,
      customization,
      cameraMode,
      interviewerAvatarId,
      interviewerName,
      resumeId,
      resumeText,
      language,
      timeBudgetOverrideSeconds,
    } = body as Record<string, unknown>;

    if (typeof typeSlug !== "string" || !typeSlug) {
      return response({ error: "Unknown interaction type" }, 400);
    }

    const result = await startSession({
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      typeSlug,
      instanceId: typeof instanceId === "string" ? instanceId : null,
      instance:
        instance && typeof instance === "object"
          ? (instance as InstanceConfig)
          : null,
      customization: customization as InterviewCustomizationInput | undefined,
      cameraModeRequest: cameraMode,
      interviewerAvatarId,
      interviewerName,
      resumeId,
      resumeText,
      language,
      timeBudgetOverrideSeconds,
    });

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    const payload: Record<string, unknown> = {
      reportId: result.reportId,
      cameraMode: result.cameraMode,
    };
    if (result.log) {
      payload.success = true;
      payload.log = result.log;
    }

    return response(payload, 200);
  } catch (error) {
    console.error("Practice session start failed:", error);
    return response({ error: "Unable to start the session." }, 500);
  }
}
