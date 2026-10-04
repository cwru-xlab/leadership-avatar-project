/**
 * THE ONE session-checkpoint endpoint for every interaction type (REQ-59).
 *
 * Types that declare `checkpointing: "none"` (case-study) are rejected —
 * the engine never issues a checkpoint on their behalf (REQ-69). Fire-and-
 * forget from the client; response stays tiny and never blocks on LLM work.
 */

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { checkpointSession } from "@/lib/engine/session";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return response({ error: "Invalid request body" }, 400);
    }

    const { reportId, turns, progress } = body as Record<string, unknown>;

    if (typeof reportId !== "string") {
      return response({ error: "Invalid reportId" }, 400);
    }

    const result = await checkpointSession({
      userId: currentUser.id,
      reportId,
      turns,
      progress,
    });

    if (!result.ok) {
      return response({ error: result.error }, result.status);
    }

    return response({ ok: true, turnCount: result.turnCount }, 200);
  } catch (error) {
    console.error("Practice session checkpoint failed:", error);
    return response({ error: "Checkpoint failed" }, 502);
  }
}
