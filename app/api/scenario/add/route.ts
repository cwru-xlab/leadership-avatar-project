import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import { validateScenarioInput } from "@/lib/scenario/validation";
import type { CaseStudy } from "@/types";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Server-side collision-proof id generator.
 *
 * A bare name-slug (what `lib/case-storage.ts`'s `generateId` does for admin
 * cases) can collide: two students may name a scenario the same thing, and
 * the `cases/` prefix is shared with admin cases. Appending a short random
 * suffix makes collisions practically impossible while keeping the id
 * legible.
 */
function generateScenarioId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = slug || "scenario";
  return `scn-${base}-${randomUUID().slice(0, 8)}`;
}

/**
 * POST /api/scenario/add
 *
 * Creates a new student-authored scenario. `ownerId` is always derived from
 * the authenticated session, never from the request body (REQ-29). New
 * scenarios are private by default (REQ-30) — publishing is a separate,
 * explicit owner action (see `/api/scenario/publish`).
 */
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

    const validated = validateScenarioInput(body);
    if (!validated.ok) {
      return response(
        { error: "Scenario is incomplete", fields: validated.errors },
        400
      );
    }

    let id = generateScenarioId(validated.value.name);
    // Practically unreachable, but guard against the (impossible) collision
    // rather than silently overwriting an existing case.
    if (id === "scn-new" || (await s3Storage.caseExists(id))) {
      id = generateScenarioId(validated.value.name);
    }

    const now = new Date().toISOString();
    const displayName = currentUser.name ?? currentUser.email;

    const scenario: CaseStudy = {
      id,
      name: validated.value.name,
      backgroundInfo: validated.value.backgroundInfo,
      evaluationPrompt: validated.value.evaluationPrompt,
      avatars: validated.value.avatars,
      ...(validated.value.coverImage
        ? { coverImage: validated.value.coverImage }
        : {}),
      cohortIds: [],
      published: false,
      ownerId: currentUser.id,
      createdBy: displayName,
      lastEditedBy: displayName,
      createdAt: now,
      lastEditedAt: now,
    };

    await s3Storage.saveCase(scenario);

    return response({ success: true, scenario }, 201);
  } catch (error) {
    console.error("Scenario add error:", error);
    return response({ error: "Failed to create scenario" }, 500);
  }
}
