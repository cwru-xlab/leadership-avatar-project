/**
 * THE ONE report-GET endpoint for every interaction type (REQ-59).
 *
 * Returns the unified `ReportDTO` from `InteractionReport`. A report owned
 * by someone else is a 404, never a 403. Backfilled pre-Phase-13 rows load
 * through this path with scores, metrics, structured body and snapshot
 * intact (REQ-65/66).
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getReportForUser } from "@/lib/report/handlers";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
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
    const result = await getReportForUser(currentUser.id, reportId);

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    return response({ report: result.report }, 200);
  } catch (error) {
    console.error("Practice report fetch failed:", error);
    return response({ error: "Unable to load the report." }, 500);
  }
}
