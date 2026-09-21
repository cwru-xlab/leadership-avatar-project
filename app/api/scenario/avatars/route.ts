import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { s3Storage } from "@/lib/s3-client";
import type { VideoAudioProfile } from "@/types";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Explicit, field-by-field projection of a `VideoAudioProfile` for the
 * builder's character card grid. Deliberately drops `knowledgeId`, `voice`,
 * `quality`, `language`, `createdBy`, `lastEditedBy` and the timestamps —
 * `/api/profile/list` returns the full profile today and is admin-gated;
 * this route exists precisely so students get a picker catalog without that
 * surface.
 */
function toAvatarProjection(profile: VideoAudioProfile) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    portrait: profile.portrait,
    avatarName: profile.avatarName,
  };
}

/**
 * GET /api/scenario/avatars
 *
 * The character catalog the builder's card grid reads. A student picks one
 * of these, stores its `id` into `CaseAvatar.profileId`, and `/case-play`'s
 * existing `loadAvatarConfig` resolves it through the already-student-gated
 * `/api/profile/get`, exactly as it does for admin cases.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const profiles = await s3Storage.listProfiles();

    const avatars = profiles
      .map(toAvatarProjection)
      .sort((a, b) => a.name.localeCompare(b.name));

    return response({ success: true, avatars }, 200);
  } catch (error) {
    console.error("Scenario avatars error:", error);
    return response({ error: "Failed to list avatars" }, 500);
  }
}
