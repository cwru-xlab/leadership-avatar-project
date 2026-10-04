/**
 * DEPRECATED — thin delegation to the engine. Deleted in plan 13-13 once no
 * page calls this path.
 *
 * Delegates with the four interview preset slugs as the type filter so
 * `/reports` keeps rendering exactly today's interview-only list (REQ-69).
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { listReportsForUser } from "@/lib/report/handlers";
import { toLegacyInterviewReportDTO } from "@/lib/report/legacy-adapters";

export const runtime = "nodejs";

/** The four interview presets — today's `/reports` page set (REQ-69). */
const INTERVIEW_PRESET_SLUGS = [
  "general",
  "technical",
  "consulting",
  "early-career",
] as const;

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

    const result = await listReportsForUser(currentUser.id, [
      ...INTERVIEW_PRESET_SLUGS,
    ]);

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    return response(
      { reports: result.reports.map(toLegacyInterviewReportDTO) },
      200,
    );
  } catch (error) {
    console.error("Interview reports list fetch failed:", error);
    return response({ error: "Unable to load your reports." }, 500);
  }
}
