/**
 * The coding report's "Your solution" tab: the student's final code, the
 * hints they were issued, and the post-session approach/complexity/pitfalls.
 *
 * Owner-only and READY-only (`getCodingSolutionForUser`). Signed out is 401;
 * another user's report, a non-coding report and one still being graded are
 * all the same 404, matching the report GET beside it. Never includes the
 * model solution — that is `./model-solution`, fetched on an explicit reveal.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getCodingSolutionForUser } from "@/lib/technical-interview/report-material.server";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { reportId } = await params;
    const result = await getCodingSolutionForUser(currentUser.id, reportId);
    if (!result.ok) return response({ error: result.error }, result.status);
    return response({ solution: result.solution }, 200);
  } catch (error) {
    console.error("Coding solution fetch failed:", error);
    return response({ error: "Unable to load your solution." }, 500);
  }
}
