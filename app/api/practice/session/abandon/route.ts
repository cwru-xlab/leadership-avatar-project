import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/lib/auth";
import { abandonTechnicalCodingSession } from "@/lib/engine/session";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Permanently discard an unsubmitted, eager technical-coding session. */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => null);
    const reportId =
      body && typeof body === "object"
        ? (body as { reportId?: unknown }).reportId
        : null;
    if (typeof reportId !== "string" || !reportId.trim()) {
      return response({ error: "Invalid request body" }, 400);
    }

    await abandonTechnicalCodingSession({ userId: currentUser.id, reportId });
    // A conditional delete deliberately remains idempotent and does not reveal
    // whether the requested report belongs to another user.
    return response({ ok: true }, 200);
  } catch (error) {
    console.error("Technical session abandon failed:", error);
    return response({ error: "Unable to discard the session." }, 500);
  }
}
