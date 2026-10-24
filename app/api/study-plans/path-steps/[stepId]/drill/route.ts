/**
 * GET /api/study-plans/path-steps/{stepId}/drill — the VOICE_DRILL brief
 * (scenario prompt, ONE technique reminder, duration) and the student's
 * attempts. Keyed by a user-owned VOICE_DRILL path step and nothing else.
 * An open attempt never carries a score (lib/study-plan/drill/service.ts).
 *
 * Client contract: .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md
 */
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getDrill, DrillStepNotFoundError } from "@/lib/study-plan/drill/service";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { stepId } = await params;
    const drill = await getDrill(currentUser.id, stepId);
    return response({ drill }, 200);
  } catch (error) {
    if (error instanceof DrillStepNotFoundError) return response({ error: "Voice drill not found" }, 404);
    console.error("Voice drill fetch failed:", error);
    return response({ error: "Unable to load this voice drill." }, 500);
  }
}
