import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, type User } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { saveDifficultConversation } from "@/lib/difficult-conversation/store";
import { validateDifficultConversationInput } from "@/lib/difficult-conversation/validation";
import type { DifficultyBand } from "@/lib/difficult-conversation/types";

export const runtime = "nodejs";

/**
 * Test hook for scripts/verify-dc-routes.ts — when set, bypasses cookie auth.
 * Production traffic never sets this; undefined means real getCurrentUser.
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
 * POST /api/difficult-conversation/add
 *
 * Creates a private student-authored scenario. No pre-publish check runs here:
 * a private scenario is not publish-visible, and gating creation would break
 * "practice it immediately" (P15-SC2). Publishing is a separate deliberate act.
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await resolveUser(request);
    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return response({ error: "Invalid request body" }, 400);
    }

    const errors = validateDifficultConversationInput(body);
    if (errors.length > 0) {
      return response({ errors }, 400);
    }

    const input = body as Record<string, unknown>;
    const record = await saveDifficultConversation(
      {
        title: String(input.title),
        avatarRole: String(input.avatarRole),
        studentRole: String(input.studentRole),
        situation: String(input.situation),
        sharedBackstory: String(input.sharedBackstory),
        hiddenPosition: String(input.hiddenPosition),
        studentObjective: String(input.studentObjective),
        stakes: String(input.stakes),
        difficulty: String(input.difficulty).trim() as DifficultyBand,
        avatarId: typeof input.avatarId === "string" ? input.avatarId : "",
        voiceId: typeof input.voiceId === "string" ? input.voiceId : "",
      },
      currentUser.id
    );

    // published:false and lastCheck:null are stamped by the store on create.
    // Intentionally no runPrePublishCheck — private content is immediately
    // practiceable without a gate.
    return response({ id: record.id, published: false }, 201);
  } catch (error) {
    console.error("Difficult conversation add error:", error);
    return response({ error: "Failed to create difficult conversation" }, 500);
  }
}
