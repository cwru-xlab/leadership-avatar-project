/**
 * POST /api/study-plans/path-steps/{stepId}/drill/attempts/{attemptId}/complete
 *
 * Body: `{ transcript, spokenDurationMs, cameraMode, metrics }` — metrics is
 * the same derived-scalars payload practice finish routes accept (validated
 * by parseMetricsPayload; no media). Grades the attempt (end-only grading),
 * writes ONE VOICE_DRILL mastery contribution, and completes the path step on
 * the first completed attempt. 200 with the graded attempt DTO.
 *
 * 422 when there is too little speech to grade (the attempt stays open; the
 * student can try again). 502 when grading fails (nothing is written; retry).
 */
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  completeAttempt,
  parseCompleteBody,
  DrillStepNotFoundError,
  DrillAttemptNotFoundError,
  DrillAttemptAlreadyCompleteError,
  DrillTooShortError,
} from "@/lib/study-plan/drill/service";
import { DrillGradingFailedError } from "@/lib/study-plan/drill/grade";

export const runtime = "nodejs";
export const maxDuration = 60; // one grading model call

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string; attemptId: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");
    if (!currentUser) return response({ error: "Unauthorized" }, 401);

    const { stepId, attemptId } = await params;
    const body = parseCompleteBody(await request.json().catch(() => null));
    if (!body) return response({ error: "Invalid drill completion payload." }, 400);

    const attempt = await completeAttempt(currentUser.id, stepId, attemptId, body);
    return response({ attempt }, 200);
  } catch (error) {
    if (error instanceof DrillStepNotFoundError || error instanceof DrillAttemptNotFoundError) {
      return response({ error: "Voice drill attempt not found" }, 404);
    }
    if (error instanceof DrillAttemptAlreadyCompleteError) {
      return response({ error: error.message }, 409);
    }
    if (error instanceof DrillTooShortError) {
      return response({ error: error.message, code: "TOO_SHORT" }, 422);
    }
    if (error instanceof DrillGradingFailedError) {
      console.error("Voice drill grading failed:", error.message);
      return response({ error: "Grading failed — please submit again.", code: "GRADING_FAILED" }, 502);
    }
    console.error("Voice drill completion failed:", error);
    return response({ error: "Unable to complete this voice drill." }, 500);
  }
}
