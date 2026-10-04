/**
 * DEPRECATED — thin delegation to the engine. Deleted in plan 13-13 once no
 * page calls this path.
 *
 * Preserves today's ScenarioReportDTO response body so the un-migrated
 * case-play report page keeps working until plan 13-12 moves it.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getReportForUser } from "@/lib/report/handlers";
import { toLegacyScenarioReportDTO } from "@/lib/report/legacy-adapters";

export const runtime = "nodejs";

const NOT_FOUND = { error: "Report not found" };

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

    // Preserve the legacy table's type scope: an interview row was never in
    // ScenarioReport, so this path must still 404 for it (REQ-69).
    if (!result.ok || result.report.input?.kind !== "scenario") {
      return response(NOT_FOUND, 404);
    }

    return response(
      { report: toLegacyScenarioReportDTO(result.report) },
      200,
    );
  } catch (error) {
    console.error("Scenario report fetch failed:", error);
    return response({ error: "Unable to load the report." }, 500);
  }
}
