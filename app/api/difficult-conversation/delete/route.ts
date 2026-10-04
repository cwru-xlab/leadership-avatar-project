import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, type User } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { deleteDifficultConversation } from "@/lib/difficult-conversation/store";

export const runtime = "nodejs";

/**
 * Test hook for scripts/verify-dc-routes.ts — when set, bypasses cookie auth.
 */
declare global {
  // eslint-disable-next-line no-var
  var __DC_AUTH_USER__: User | null | undefined;
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function resolveUser(request: NextRequest): Promise<User | null> {
  if (typeof globalThis.__DC_AUTH_USER__ !== "undefined") {
    return globalThis.__DC_AUTH_USER__;
  }
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

/**
 * POST /api/difficult-conversation/delete
 *
 * Owner-scoped delete. No pre-publish check — the record ceases to exist.
 * Non-owned / missing / seeded (ownerId null) → 404, never 403.
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await resolveUser(request);
    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.id !== "string") {
      return response({ error: "Invalid request body" }, 400);
    }

    // Intentionally no runPrePublishCheck — deleting removes the record.
    const deleted = await deleteDifficultConversation(body.id, currentUser.id);
    if (!deleted) {
      return response({ error: "Difficult conversation not found" }, 404);
    }

    return response({ success: true }, 200);
  } catch (error) {
    console.error("Difficult conversation delete error:", error);
    return response({ error: "Failed to delete difficult conversation" }, 500);
  }
}
