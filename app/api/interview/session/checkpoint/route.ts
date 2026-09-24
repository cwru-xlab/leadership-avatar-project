import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import {
  buildInterviewTranscript,
  normalizeTurns,
} from "@/lib/interview/transcript";
import { initialProgress, type InterviewProgress } from "@/lib/interview/types";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isValidProgress(value: unknown): value is InterviewProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.stage === "string" &&
    typeof candidate.questionsAsked === "number" &&
    Array.isArray(candidate.categoriesCovered) &&
    Array.isArray(candidate.dodgedCategories) &&
    typeof candidate.followUpsUsed === "number"
  );
}

/**
 * Persist the canonical transcript to S3 after every assistant turn.
 *
 * Fires ~9-15 times per interview and is called fire-and-forget by the
 * client. Kept lean: no LLM work, no S3 reads, no extra queries beyond the
 * single ownership fetch and the single row update.
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

    const { reportId, turns: rawTurns, progress: rawProgress } = body as Record<
      string,
      unknown
    >;

    if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) {
      return response({ error: "Invalid reportId" }, 400);
    }

    const report = await prisma.interviewReport.findFirst({
      where: { id: reportId, userId: currentUser.id },
      select: {
        id: true,
        status: true,
        typeSlug: true,
        interviewerAvatarId: true,
        interviewerName: true,
        startedAt: true,
      },
    });

    if (!report) {
      return response({ error: "Not found" }, 404);
    }

    if (report.status !== "IN_PROGRESS") {
      return response(
        { error: "This interview has already been submitted." },
        409
      );
    }

    const turns = normalizeTurns(rawTurns);
    if (turns.length === 0) {
      return response({ error: "No turns provided" }, 400);
    }

    const progress = isValidProgress(rawProgress) ? rawProgress : initialProgress();

    const transcript = buildInterviewTranscript({
      reportId: report.id,
      userId: currentUser.id,
      typeSlug: report.typeSlug,
      interviewer: {
        avatarId: report.interviewerAvatarId,
        name: report.interviewerName,
      },
      startedAt: report.startedAt.getTime(),
      turns,
      progress,
    });

    const key = await s3Storage.saveInterviewTranscript(
      currentUser.id,
      report.id,
      transcript
    );

    await prisma.interviewReport.update({
      where: { id: report.id },
      data: { turnCount: turns.length, transcriptKey: key },
    });

    return response({ ok: true, turnCount: turns.length }, 200);
  } catch (error) {
    console.error("Interview session checkpoint failed:", error);
    return response({ error: "Checkpoint failed" }, 502);
  }
}
