/**
 * The model solution for a coding report, in one language
 * (`?language=python|javascript`). Fetched ONLY when the student clicks
 * "Show model solution", so the answer is never in the page unless asked for.
 *
 * Same access rule as `../route.ts`: owner-only, READY-only, 401 signed out,
 * 404 for anything else (including a problem with no authored solution).
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getModelSolutionForUser } from "@/lib/technical-interview/report-material.server";

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
    const language = request.nextUrl.searchParams.get("language");
    const result = await getModelSolutionForUser(currentUser.id, reportId, language);
    if (!result.ok) return response({ error: result.error }, result.status);
    return response({ language: result.language, code: result.code }, 200);
  } catch (error) {
    console.error("Model solution fetch failed:", error);
    return response({ error: "Unable to load the model solution." }, 500);
  }
}
