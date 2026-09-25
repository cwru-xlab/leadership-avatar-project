import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import {
  hasStudyPlanDraftSecret,
  verifyStudyPlanDraftToken,
} from "@/lib/study-plan/draft-token";
import { toStudyPlanDTO, toStudyPlanSummaryDTO } from "@/lib/study-plan/plan-dto";

export const runtime = "nodejs";

// The signed draft embeds validated plan content. This bound exceeds the largest
// object the content validator accepts (after JWT encoding) while still
// rejecting obviously abusive request bodies before signature verification.
const MAX_DRAFT_TOKEN_LENGTH = 200_000;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function currentUserFor(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  return getCurrentUser(token || "");
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await currentUserFor(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const rows = await prisma.studyPlan.findMany({
      where: { userId: currentUser.id },
      orderBy: { savedAt: "desc" },
    });

    return response({ plans: rows.map(toStudyPlanSummaryDTO) }, 200);
  } catch (error) {
    console.error("Study-plan list fetch failed:", error);
    return response({ error: "Unable to load your saved study plans." }, 500);
  }
}

/**
 * Persist an already-reviewed, server-signed preview. The browser cannot submit
 * content, report IDs, model names, or an owner ID; those come only from the
 * verified short-lived token bound to the authenticated student.
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await currentUserFor(request);
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    if (!hasStudyPlanDraftSecret()) {
      console.error("Study-plan previews are not configured");
      return response({ error: "Study-plan previews are not configured." }, 503);
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const draftToken = body?.draftToken;
    if (
      typeof draftToken !== "string" ||
      !draftToken ||
      draftToken.length > MAX_DRAFT_TOKEN_LENGTH
    ) {
      return response({ error: "A valid study-plan preview is required." }, 400);
    }

    let draft;
    try {
      draft = await verifyStudyPlanDraftToken(draftToken);
    } catch {
      return response({ error: "This study-plan preview is invalid or has expired." }, 400);
    }

    if (draft.userId !== currentUser.id) {
      // Do not disclose whether a signed draft belongs to any other account.
      return response({ error: "This study-plan preview is invalid or has expired." }, 400);
    }

    const existing = await prisma.studyPlan.findUnique({
      where: { draftTokenId: draft.tokenId },
    });
    if (existing) {
      if (existing.userId !== currentUser.id) {
        return response({ error: "This study-plan preview is invalid or has expired." }, 400);
      }
      return response({ plan: toStudyPlanDTO(existing) }, 200);
    }

    try {
      const row = await prisma.studyPlan.create({
        data: {
          userId: currentUser.id,
          title: draft.content.title,
          content: draft.content as unknown as Prisma.InputJsonValue,
          sourceReportIds: draft.sourceReportIds as Prisma.InputJsonValue,
          sourceReportCount: draft.sourceReportCount,
          generationModel: draft.generationModel,
          draftTokenId: draft.tokenId,
        },
      });
      return response({ plan: toStudyPlanDTO(row) }, 201);
    } catch (error) {
      // A parallel browser retry can win the unique-token race. Return its
      // immutable result rather than adding a duplicate history item.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const saved = await prisma.studyPlan.findUnique({ where: { draftTokenId: draft.tokenId } });
        if (saved && saved.userId === currentUser.id) {
          return response({ plan: toStudyPlanDTO(saved) }, 200);
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Study-plan save failed:", error);
    return response({ error: "Unable to save your study plan." }, 500);
  }
}
