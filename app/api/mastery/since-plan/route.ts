import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { readContributions } from "@/lib/mastery/ledger";
import {
  growthSincePlan,
  type SincePlanSnapshotFigure,
} from "@/lib/mastery/compute";
import { toSincePlanDTO } from "@/lib/mastery/mastery-dto";
import { resolveDriverLinks } from "@/lib/mastery/activity-links";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Reads the frozen selectionSnapshot defensively — it is Json, and an
 * unexpected shape must degrade to "no snapshot figure", not a 500. */
function snapshotFigures(raw: unknown): SincePlanSnapshotFigure[] {
  if (!Array.isArray(raw)) return [];
  const out: SincePlanSnapshotFigure[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.competencyKey !== "string") continue;
    out.push({
      competencyKey: entry.competencyKey,
      lifetimePercent: typeof entry.lifetimePercent === "number" ? entry.lifetimePercent : null,
      currentPercent: typeof entry.currentPercent === "number" ? entry.currentPercent : null,
    });
  }
  return out;
}

/**
 * GET /api/mastery/since-plan?planId=<studyPlanId>
 *
 * Growth since that plan's path was generated, for each competency the
 * path's steps target: the all-time figure at generation (recomputed from
 * the ledger), now, the delta, and the activities that moved it. Read-only
 * and scoped to the signed-in user — another student's plan is a 404.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const planId = request.nextUrl.searchParams.get("planId");
    if (!planId) return response({ error: "planId is required." }, 400);

    const path = await prisma.studyPlanPath.findFirst({
      where: { studyPlanId: planId, userId: currentUser.id },
      select: {
        generatedAt: true,
        selectionSnapshot: true,
        steps: { select: { competencyKey: true }, orderBy: { position: "asc" } },
      },
    });
    if (!path) return response({ error: "Study plan path not found." }, 404);

    const contributions = await readContributions(currentUser.id);
    // The one clock read, at the edge.
    const now = new Date();
    const results = growthSincePlan(
      contributions,
      path.steps.map((s) => s.competencyKey),
      path.generatedAt,
      now,
      snapshotFigures(path.selectionSnapshot)
    );
    const activityLinks = await resolveDriverLinks(
      currentUser.id,
      results.flatMap((r) => r.drivers)
    );

    const sincePlan = toSincePlanDTO({
      planId,
      since: path.generatedAt,
      now,
      results,
      activityLinks,
    });
    return response({ sincePlan }, 200);
  } catch (error) {
    console.error("Mastery since-plan fetch failed:", error);
    return response({ error: "Unable to load growth for this plan." }, 500);
  }
}
