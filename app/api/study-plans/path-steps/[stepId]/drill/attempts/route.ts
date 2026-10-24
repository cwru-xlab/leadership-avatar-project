/**
 * POST /api/study-plans/path-steps/{stepId}/drill/attempts — start a new
 * attempt (a redo is just another POST). Body: `{ cameraMode: "ON" | "OFF" }`
 * (optional; the shell's locked camera choice). 201 with the attempt DTO,
 * which carries no score.
 */
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { startAttempt, DrillStepNotFoundError } from "@/lib/study-plan/drill/service";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { stepId } = await params;
    const body = (await request.json().catch(() => ({}))) as { cameraMode?: unknown };
    const cameraMode = body.cameraMode === "ON" || body.cameraMode === "OFF" ? body.cameraMode : null;

    const attempt = await startAttempt(currentUser.id, stepId, cameraMode);
    return response({ attempt }, 201);
  } catch (error) {
    if (error instanceof DrillStepNotFoundError) return response({ error: "Voice drill not found" }, 404);
    console.error("Voice drill attempt start failed:", error);
    return response({ error: "Unable to start this voice drill." }, 500);
  }
}
