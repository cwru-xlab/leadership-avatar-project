/**
 * DEPRECATED — thin delegation to the engine. Deleted in plan 13-13 once no
 * client calls this path. Exists only so the un-migrated client surfaces keep
 * working mid-phase.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { finishSession } from "@/lib/engine/session";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const { reportId, log, metrics } = body as Record<string, unknown>;

    if (typeof reportId !== "string" || !reportId) {
      return response({ error: "Report not found" }, 404);
    }

    const result = await finishSession({
      userId: currentUser.id,
      userEmail: currentUser.email,
      reportId,
      log,
      metricsPayload: metrics,
      terminationSource: "student",
      terminationReason: null,
    });

    if (!result.ok) {
      if (result.status === 409) {
        // Preserve today's scenario 409 body shape (error only, no reportId).
        return response(
          { error: "This run has already been submitted." },
          409,
        );
      }
      // Preserve today's "Report not found" wording for 404.
      if (result.status === 404) {
        return response({ error: "Report not found" }, 404);
      }
      return response({ error: result.error }, result.status);
    }

    return response({ success: true, reportId: result.reportId }, 202);
  } catch (error) {
    console.error("Scenario session finish failed:", error);
    return response({ error: "Unable to finish the scenario run." }, 500);
  }
}
