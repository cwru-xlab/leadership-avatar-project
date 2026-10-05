/**
 * Report-evaluation retry for types that declare `supportsRetry`.
 *
 * Interview presets: FAILED → PENDING + waitUntil(engine evaluation).
 * case-study: 404 — retry does not exist for that type today (REQ-69).
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { retryReportForUser } from "@/lib/report/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { reportId } = await params;
    const result = await retryReportForUser(currentUser.id, reportId);

    if (!result.ok) {
      if (result.status === 409 && result.reportStatus) {
        return response(
          { error: result.error, status: result.reportStatus },
          409,
        );
      }
      return response({ error: result.error }, result.status);
    }

    return response(
      { reportId: result.reportId, status: result.status },
      202,
    );
  } catch (error) {
    console.error("Practice report retry failed:", error);
    return response({ error: "Unable to re-run the evaluation." }, 500);
  }
}
