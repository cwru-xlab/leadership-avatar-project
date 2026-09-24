import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import { loadOwnedScenario } from "@/lib/scenario/validation";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * POST /api/scenario/publish
 *
 * Owner-scoped publish/unpublish toggle. This deliberately reuses the
 * Phase 7 `published` flag, which gates DISCOVERY only and is not access
 * control — that semantic is unchanged: `/api/case/get` stays untouched.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      typeof body.published !== "boolean"
    ) {
      return response({ error: "Invalid request body" }, 400);
    }

    const existing = await loadOwnedScenario(body.id, currentUser.id);
    if (!existing) {
      return response({ error: "Scenario not found" }, 404);
    }

    const updated = {
      ...existing,
      published: body.published,
      lastEditedAt: new Date().toISOString(),
    };

    await s3Storage.saveCase(updated);

    return response({ success: true, published: updated.published }, 200);
  } catch (error) {
    console.error("Scenario publish error:", error);
    return response({ error: "Failed to update publish state" }, 500);
  }
}
