import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import type { CaseStudy } from "@/types";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Explicit, field-by-field projection for another student's published
 * scenario. Never spread the row — that would leak `ownerId` (identifying
 * information about a different user) and `cohortIds` (obsolete scoping
 * dead weight) to a caller who has no business seeing either.
 */
function toSharedProjection(scenario: CaseStudy) {
  return {
    id: scenario.id,
    name: scenario.name,
    backgroundInfo: scenario.backgroundInfo,
    coverImage: scenario.coverImage,
    avatars: scenario.avatars,
    published: scenario.published,
    createdBy: scenario.createdBy,
    createdAt: scenario.createdAt,
    lastEditedAt: scenario.lastEditedAt,
  };
}

function byNewest(a: { lastEditedAt: string }, b: { lastEditedAt: string }) {
  return new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime();
}

/**
 * GET /api/scenario/list
 *
 * Returns the caller's own scenarios (every state — an author always sees
 * their own drafts) plus every OTHER student's published scenario. Admin-
 * authored cases (no `ownerId`) appear in neither array; `/case-play`'s
 * admin-case section keeps sourcing those from the untouched
 * `/api/case/list?publishedOnly=true`.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const all = await s3Storage.listCases();

    const mine = all
      .filter((c) => c.ownerId === currentUser.id)
      .sort(byNewest);

    const shared = all
      .filter(
        (c) =>
          !!c.ownerId && c.ownerId !== currentUser.id && c.published === true
      )
      .sort(byNewest)
      .map(toSharedProjection);

    return response({ success: true, mine, shared }, 200);
  } catch (error) {
    console.error("Scenario list error:", error);
    return response({ error: "Failed to list scenarios" }, 500);
  }
}
