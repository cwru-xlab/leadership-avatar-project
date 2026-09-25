import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import {
  createStudyPlanDraftToken,
  hasStudyPlanDraftSecret,
} from "@/lib/study-plan/draft-token";
import {
  extractBehavioralFeedback,
  generateStudyPlan,
  type AnonymousBehavioralReport,
} from "@/lib/study-plan/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ANONYMOUS_SOURCE_BYTES = 60_000;
const MAX_SOURCE_REPORTS = 50;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Generates an unsaved study-plan preview. Raw reports never leave this server:
 * the model receives only anonymous report ordinals, two score aggregates, and
 * locally extracted closed-vocabulary rubric label/rating strings.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    // A preview cannot be saved without this secret, so reject a broken deploy
    // before fetching reports or spending an OpenAI completion.
    if (!hasStudyPlanDraftSecret()) {
      console.error("Study-plan previews are not configured");
      return response({ error: "Study-plan previews are not configured." }, 503);
    }

    const rows = await prisma.interviewReport.findMany({
      where: {
        userId: currentUser.id,
        status: "READY",
        reportMarkdown: { not: null },
      },
      orderBy: { completedAt: "asc" },
      // Fetch one extra row so a large history is refused rather than silently
      // truncated while claiming every completed report was considered.
      take: MAX_SOURCE_REPORTS + 1,
      select: {
        id: true,
        contentScore: true,
        behavioralScore: true,
        reportMarkdown: true,
      },
    });

    if (rows.length > MAX_SOURCE_REPORTS) {
      return response(
        { error: "Your completed feedback history is too large to synthesize safely." },
        413
      );
    }

    const eligibleRows = rows.filter((row) => row.reportMarkdown?.trim());
    if (eligibleRows.length === 0) {
      return response(
        {
          code: "NO_COMPLETED_REPORTS",
          error: "Complete an interview with feedback before generating a study plan.",
        },
        409
      );
    }

    const reports: AnonymousBehavioralReport[] = eligibleRows.map((row, index) => ({
      reportNumber: index + 1,
      contentScore: row.contentScore,
      behavioralScore: row.behavioralScore,
      behavioralFeedbackSignals: extractBehavioralFeedback(row.reportMarkdown || ""),
    }));

    // Refuse to silently omit older reports. The model source contains only the
    // anonymous data above, but every eligible report is still represented.
    if (new TextEncoder().encode(JSON.stringify(reports)).byteLength > MAX_ANONYMOUS_SOURCE_BYTES) {
      return response(
        { error: "Your completed feedback is too large to synthesize safely." },
        413
      );
    }

    const result = await generateStudyPlan(reports);
    if (!result.ok) {
      console.error("Study-plan generation failed", {
        model: result.model,
        reportCount: reports.length,
        reason: result.reason,
      });
      return response({ error: "Unable to generate your study plan. Please try again." }, 502);
    }

    let draftToken: string;
    try {
      draftToken = await createStudyPlanDraftToken({
        userId: currentUser.id,
        content: result.content,
        sourceReportIds: eligibleRows.map((row) => row.id),
        sourceReportCount: eligibleRows.length,
        generationModel: result.model,
      });
    } catch (error) {
      console.error("Study-plan draft creation failed:", error);
      return response({ error: "Study-plan previews are not configured." }, 503);
    }

    return response(
      {
        content: result.content,
        sourceReportCount: eligibleRows.length,
        draftToken,
      },
      200
    );
  } catch (error) {
    console.error("Study-plan generation request failed:", error);
    return response({ error: "Unable to prepare your study plan." }, 500);
  }
}
