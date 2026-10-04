/**
 * THE ONE session-finish endpoint for every interaction type (REQ-59).
 *
 * Always parses metrics (REQ-72), schedules evaluation via waitUntil inside
 * the engine handler, and returns 202 fast. A double-submit returns 409
 * carrying `{ reportId, status }` so the client can still navigate to the
 * report.
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

    const {
      reportId,
      turns,
      progress,
      metrics,
      log,
      terminationReason,
      terminationSource,
      outcome,
    } = body as Record<string, unknown>;

    if (typeof reportId !== "string") {
      return response({ error: "Report not found" }, 404);
    }

    const result = await finishSession({
      userId: currentUser.id,
      userEmail: currentUser.email,
      reportId,
      turns,
      progress,
      metricsPayload: metrics,
      log,
      terminationReason:
        typeof terminationReason === "string" ? terminationReason : null,
      terminationSource:
        terminationSource === "avatar" || terminationSource === "student"
          ? terminationSource
          : "student",
      outcome,
    });

    if (!result.ok) {
      if (result.status === 409) {
        return response(
          {
            error: result.error,
            reportId: result.reportId,
            status: result.reportStatus,
          },
          409,
        );
      }
      return response({ error: result.error }, result.status);
    }

    return response({ reportId: result.reportId }, 202);
  } catch (error) {
    console.error("Practice session finish failed:", error);
    return response({ error: "Unable to finish the session." }, 500);
  }
}
