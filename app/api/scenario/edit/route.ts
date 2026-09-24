import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import { loadOwnedScenario, validateScenarioInput } from "@/lib/scenario/validation";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * POST /api/scenario/edit
 *
 * Owner-scoped scenario update. Ownership is checked BEFORE validation so a
 * non-owner never learns whether their malformed body would have been
 * accepted — both failures return distinct statuses (404 vs 400), but the
 * 404 path never leaks anything about the body's validity.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.id !== "string") {
      return response({ error: "Invalid request body" }, 400);
    }

    const existing = await loadOwnedScenario(body.id, currentUser.id);
    if (!existing) {
      return response({ error: "Scenario not found" }, 404);
    }

    const validated = validateScenarioInput(body);
    if (!validated.ok) {
      return response(
        { error: "Scenario is incomplete", fields: validated.errors },
        400
      );
    }

    const displayName = currentUser.name ?? currentUser.email;

    const updated = {
      ...existing,
      name: validated.value.name,
      backgroundInfo: validated.value.backgroundInfo,
      evaluationPrompt: validated.value.evaluationPrompt,
      avatars: validated.value.avatars,
      coverImage: validated.value.coverImage,
      // Immutable fields, explicitly preserved from the existing object.
      id: existing.id,
      ownerId: existing.ownerId,
      published: existing.published,
      cohortIds: existing.cohortIds,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
      lastEditedBy: displayName,
      lastEditedAt: new Date().toISOString(),
    };

    await s3Storage.saveCase(updated);

    return response({ success: true, scenario: updated }, 200);
  } catch (error) {
    console.error("Scenario edit error:", error);
    return response({ error: "Failed to update scenario" }, 500);
  }
}
