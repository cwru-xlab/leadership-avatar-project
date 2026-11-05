/**
 * THE ONE reports-list endpoint for every interaction type (REQ-59).
 *
 * Reads `InteractionReport`, scoped to the authenticated user, excluding
 * `IN_PROGRESS` (abandoned sessions) — same contract as today's
 * `/api/interview/reports`.
 *
 * Optional `?types=` (comma-separated slugs) filters by typeSlug. When
 * absent, every type is returned.
 *
 * `app/reports/page.tsx` lists every finished interaction type and filters
 * client-side (`lib/report/filters.ts`), which relies on this route returning
 * the whole list unpaged. Study-plan generation remains interview-only.
 *
 * `plannedReportIds` names the owner's reports used by any of their saved
 * plans, so "has a study plan" can be filtered without a schema change.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { listPlannedReportIds, listReportsForUser } from "@/lib/report/handlers";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const typesParam = request.nextUrl.searchParams.get("types");
    const types =
      typesParam && typesParam.trim().length > 0
        ? typesParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

    const result = await listReportsForUser(currentUser.id, types);

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    const plannedReportIds = await listPlannedReportIds(currentUser.id);

    return response({ reports: result.reports, plannedReportIds }, 200);
  } catch (error) {
    console.error("Practice reports list fetch failed:", error);
    return response({ error: "Unable to load your reports." }, 500);
  }
}
