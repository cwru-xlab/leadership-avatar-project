import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { toScenarioReportDTO } from "@/lib/scenario/report-dto";

export const runtime = "nodejs";

// A report you do not own is indistinguishable from one that does not exist.
const NOT_FOUND = { error: "Report not found" };

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Owner-scoped read for the scenario report page's initial load and its poll
 * loop.
 *
 * Ownership always comes from the authenticated JWT user in the single
 * lookup's where-clause, never from an unscoped lookup plus a manual
 * comparison. A report owned by someone else, a malformed id, and a
 * nonexistent id all return the exact same 404 body and status — never a
 * distinguishable forbidden response.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { reportId } = await params;

    if (typeof reportId !== "string" || !reportId) {
      return response(NOT_FOUND, 404);
    }

    const row = await prisma.scenarioReport.findFirst({
      where: { id: reportId, userId: currentUser.id },
    });

    if (!row) {
      return response(NOT_FOUND, 404);
    }

    return response({ report: toScenarioReportDTO(row) }, 200);
  } catch (error) {
    console.error("Scenario report fetch failed:", error);
    return response({ error: "Unable to load the report." }, 500);
  }
}
