import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { buildInterviewTranscript, normalizeTurns } from "@/lib/interview/transcript";
import { initialProgress, type InterviewProgress } from "@/lib/interview/types";
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
 * End an interview: store the final transcript, flip IN_PROGRESS -> PENDING,
 * and schedule evaluation in the background via `waitUntil`. The request path
 * contains zero LLM calls and targets ~200ms; evaluation itself can take
 * 15-40s and is never awaited here.
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
      // Idempotent-friendly: a double-submit from the client should let it
      // navigate to the report page rather than error out.
      return response(
        {
          error: "This interview has already been submitted.",
          reportId: report.id,
          status: report.status,
        },
        409
      );
    }

    const turns = normalizeTurns(rawTurns);
    if (turns.length === 0) {
      return response(
        { error: "There is no interview transcript to evaluate." },
        400
      );
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

    let transcriptKey: string;
    try {
      transcriptKey = await s3Storage.saveInterviewTranscript(
        currentUser.id,
        report.id,
        transcript
      );
    } catch (error) {
      // Never flip to PENDING without a stored transcript; leave IN_PROGRESS.
      console.error("Interview session finish: transcript save failed", error);
      return response(
        { error: "We could not save your interview. Please try again." },
        502
      );
    }

    await prisma.interviewReport.update({
      where: { id: report.id },
      data: {
        status: "PENDING",
        transcriptKey,
        turnCount: turns.length,
        failureReason: null,
      },
    });

    waitUntil(runAndPersistEvaluation(currentUser.id, report.id));

    return response({ reportId: report.id, status: "PENDING" }, 202);
  } catch (error) {
    console.error("Interview session finish failed:", error);
    return response({ error: "Unable to finish the interview." }, 500);
  }
}
