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

    const { reportId, turns, progress, metrics } = body as Record<
      string,
      unknown
    >;

    if (typeof reportId !== "string") {
      return response({ error: "Invalid reportId" }, 400);
    }

    const result = await finishSession({
      userId: currentUser.id,
      userEmail: currentUser.email,
      reportId,
      turns,
      progress,
      metricsPayload: metrics,
      terminationSource: "student",
      terminationReason: null,
    });

    if (!result.ok) {
      if (result.status === 409) {
        return response(
          {
            error: "This interview has already been submitted.",
            reportId: result.reportId,
            status: result.reportStatus,
          },
          409,
        );
      }
      return response({ error: result.error }, result.status);
    }

    return response(
      { reportId: result.reportId, status: "PENDING" },
      202,
    );
  } catch (error) {
    console.error("Interview session finish failed:", error);
    return response({ error: "Unable to finish the interview." }, 500);
  }
}
