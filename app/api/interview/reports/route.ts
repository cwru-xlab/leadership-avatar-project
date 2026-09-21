import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { toInterviewReportDTO } from "@/lib/interview/report-dto";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Owner-scoped list of the caller's own interview reports, newest first.
 *
 * IN_PROGRESS rows (abandoned sessions with no finish/checkpoint completion)
 * are excluded in the `where` clause itself — the browser is never told an
 * abandoned session exists, unlike a single-report GET which never encounters
 * this case because a client only ever links to a report it already knows
 * the id of.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const rows = await prisma.interviewReport.findMany({
      where: { userId: currentUser.id, status: { not: "IN_PROGRESS" } },
      orderBy: { createdAt: "desc" },
    });

    return response({ reports: rows.map(toInterviewReportDTO) }, 200);
  } catch (error) {
    console.error("Interview reports list fetch failed:", error);
    return response({ error: "Unable to load your reports." }, 500);
  }
}
