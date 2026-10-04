/**
 * DEPRECATED — thin delegation to the engine. Deleted in plan 13-13 once no
 * client calls this path. Exists only so the un-migrated client surfaces keep
 * working mid-phase.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { startSession } from "@/lib/engine/session";

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

    const { caseId, language, cameraMode } = body as Record<string, unknown>;

    if (typeof caseId !== "string" || !caseId) {
      return response({ error: "Scenario not found" }, 404);
    }

    const result = await startSession({
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      typeSlug: "case-study",
      instanceId: caseId,
      cameraModeRequest: cameraMode,
      language,
    });

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    return response(
      { success: true, reportId: result.reportId, log: result.log },
      201,
    );
  } catch (error) {
    console.error("Scenario session start failed:", error);
    return response({ error: "Unable to start the scenario." }, 500);
  }
}
