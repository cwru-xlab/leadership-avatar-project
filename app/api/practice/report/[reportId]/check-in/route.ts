/**
 * Saves one check-in answer about a flagged visual observation on the
 * caller's own report (see `lib/report/check-in.ts`).
 *
 * Same contract as the report GET beside it: signed out is 401, and a report
 * owned by someone else is the same 404 as one that does not exist. Answers
 * never touch scores, never regenerate the report and never call a model.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { saveCheckInForUser } from "@/lib/report/handlers";

export const runtime = "nodejs";

/** A valid body is three short closed-vocabulary strings. */
const MAX_BODY_BYTES = 1024;

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

    const text = await request.text();
    let body: unknown = null;
    if (text.length <= MAX_BODY_BYTES) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    const { reportId } = await params;
    const result = await saveCheckInForUser(currentUser.id, reportId, body);

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    return response({ checkIn: result.checkIn }, 200);
  } catch (error) {
    console.error("Report check-in save failed:", error);
    return response({ error: "Unable to save your answer." }, 500);
  }
}
