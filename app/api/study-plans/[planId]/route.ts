import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { toStudyPlanDTO } from "@/lib/study-plan/plan-dto";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: "Study plan not found" };

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** A plan owned by someone else is indistinguishable from a missing plan. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { planId } = await params;
    if (typeof planId !== "string" || !UUID_REGEX.test(planId)) {
      return response(NOT_FOUND, 404);
    }

    const row = await prisma.studyPlan.findFirst({
      where: { id: planId, userId: currentUser.id },
    });
    if (!row) return response(NOT_FOUND, 404);

    return response({ plan: toStudyPlanDTO(row) }, 200);
  } catch (error) {
    console.error("Study-plan fetch failed:", error);
    return response({ error: "Unable to load this study plan." }, 500);
  }
}
