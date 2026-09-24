import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { runAndPersistEvaluation } from "@/lib/interview/evaluation-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Re-run evaluation for a FAILED report, reusing the same reportId and the
 * stored transcript. Only FAILED is eligible — a READY report can never be
 * regenerated (prevents score-shopping and double LLM spend); PENDING and
 * IN_PROGRESS are also rejected since an evaluation is already running or
 * the interview hasn't finished.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const { reportId } = await params;

    if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) {
      return response({ error: "Invalid reportId" }, 400);
    }

    const report = await prisma.interviewReport.findFirst({
      where: { id: reportId, userId: currentUser.id },
      select: { id: true, status: true, transcriptKey: true },
    });

    if (!report) {
      return response({ error: "Not found" }, 404);
    }

    if (report.status !== "FAILED") {
      return response(
        { error: "Only a failed report can be re-run.", status: report.status },
        409
      );
    }

    if (report.transcriptKey === null) {
      return response(
        { error: "This interview has no stored transcript to re-run." },
        409
      );
    }

    await prisma.interviewReport.update({
      where: { id: report.id },
      data: { status: "PENDING", failureReason: null },
    });

    waitUntil(runAndPersistEvaluation(currentUser.id, report.id));

    return response({ reportId: report.id, status: "PENDING" }, 202);
  } catch (error) {
    console.error("Interview report retry failed:", error);
    return response({ error: "Unable to re-run the evaluation." }, 500);
  }
}
