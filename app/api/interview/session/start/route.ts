import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { getInterviewType } from "@/lib/interview/types";

export const runtime = "nodejs";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_RESUME_TEXT_LENGTH = 60000;
const MAX_NAME_LENGTH = 200;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Create the IN_PROGRESS InterviewReport row.
 *
 * Called by the client after the first real turn lands, not on entering the
 * session step — no row is created for a session where the avatar never
 * connected or the student bailed instantly.
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

    const {
      typeSlug,
      interviewerAvatarId: rawInterviewerAvatarId,
      interviewerName: rawInterviewerName,
      resumeId: rawResumeId,
      resumeText: rawResumeText,
    } = body as Record<string, unknown>;

    const type = getInterviewType(typeof typeSlug === "string" ? typeSlug : null);
    if (!type) {
      return response({ error: "Unknown interview type" }, 400);
    }

    const interviewerAvatarId =
      typeof rawInterviewerAvatarId === "string"
        ? truncate(rawInterviewerAvatarId, MAX_NAME_LENGTH)
        : null;

    const interviewerName =
      typeof rawInterviewerName === "string"
        ? truncate(rawInterviewerName, MAX_NAME_LENGTH)
        : null;

    // Client-supplied resumeId is never allowed to shape an S3 key downstream;
    // a malformed value is silently dropped rather than rejected.
    const resumeId =
      typeof rawResumeId === "string" && UUID_V4_REGEX.test(rawResumeId)
        ? rawResumeId
        : null;

    const resumeText =
      typeof rawResumeText === "string"
        ? truncate(rawResumeText, MAX_RESUME_TEXT_LENGTH)
        : null;

    const report = await prisma.interviewReport.create({
      data: {
        userId: currentUser.id,
        typeSlug: type.slug,
        interviewerAvatarId,
        interviewerName,
        resumeId,
        resumeText,
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });

    console.info("Interview report created", {
      userId: currentUser.id,
      reportId: report.id,
      typeSlug: type.slug,
    });

    return response({ reportId: report.id }, 201);
  } catch (error) {
    console.error("Interview session start failed:", error);
    return response({ error: "Unable to start the interview session." }, 500);
  }
}
