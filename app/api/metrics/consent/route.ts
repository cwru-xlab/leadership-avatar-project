import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * REQ-36: account-level record of whether the student has ever accepted the
 * in-app explanation of what video/audio analysis measures and retains.
 *
 * GET returns the current user's own acceptance state only — never accepts a
 * userId from the client. POST records first acceptance and is idempotent:
 * an already-accepted user gets their ORIGINAL timestamp back, never a
 * refreshed one, because the value is "when they first accepted" and the
 * audit trail depends on it never moving.
 *
 * Deliberately no revoke endpoint — CONTEXT.md scopes this phase to
 * acceptance; a revoke flow would need its own decision about in-flight
 * sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { videoAnalysisConsentAt: true },
    });

    return response(
      {
        acceptedAt: user?.videoAnalysisConsentAt
          ? user.videoAnalysisConsentAt.toISOString()
          : null,
      },
      200
    );
  } catch (error) {
    console.error("Metrics consent GET failed:", error);
    return response({ error: "Unable to read consent state." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    // Accepts no body fields at all; anything sent is ignored.
    const existing = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { videoAnalysisConsentAt: true },
    });

    let acceptedAt = existing?.videoAnalysisConsentAt ?? null;
    const firstAccept = acceptedAt === null;

    if (firstAccept) {
      const updated = await prisma.user.update({
        where: { id: currentUser.id },
        data: { videoAnalysisConsentAt: new Date() },
        select: { videoAnalysisConsentAt: true },
      });
      acceptedAt = updated.videoAnalysisConsentAt;
    }

    console.info("Metrics consent recorded", {
      userId: currentUser.id,
      firstAccept,
    });

    return response(
      { acceptedAt: acceptedAt ? acceptedAt.toISOString() : null },
      200
    );
  } catch (error) {
    console.error("Metrics consent POST failed:", error);
    return response({ error: "Unable to record consent." }, 500);
  }
}
