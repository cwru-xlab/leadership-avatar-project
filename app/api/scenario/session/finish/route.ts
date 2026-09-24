import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { runAndPersistScenarioEvaluation } from "@/lib/scenario/evaluation-runner";
import { parseMetricsPayload, toMetricsJsonInput } from "@/lib/metrics/ingest";
import type { InteractionLog } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * End a scenario run: complete and persist the S3 interaction log, flip the
 * report row to a state the background evaluator will pick up, and schedule
 * evaluation via `waitUntil`. The request path contains zero LLM calls and
 * targets well under a second; evaluation itself is never awaited here.
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

    const { reportId, log: rawLog, metrics: rawMetrics } = body as Record<string, unknown>;

    if (typeof reportId !== "string" || !reportId) {
      return response({ error: "Report not found" }, 404);
    }

    const report = await prisma.scenarioReport.findFirst({
      where: { id: reportId, userId: currentUser.id },
    });

    if (!report) {
      return response({ error: "Report not found" }, 404);
    }

    if (report.status !== "IN_PROGRESS") {
      return response(
        { error: "This run has already been submitted." },
        409
      );
    }

    if (!rawLog || typeof rawLog !== "object") {
      return response({ error: "Missing required interaction log data" }, 400);
    }

    const log = rawLog as InteractionLog;
    if (!log.id || !log.caseId) {
      return response({ error: "Missing required interaction log data" }, 400);
    }

    // Students can only finish their own logs; force the verified identity
    // regardless of what the client sent.
    log.studentEmail = currentUser.email.toLowerCase();

    const now = Date.now();

    log.events.push({
      type: "end_session",
      timestamp: now,
    });

    log.status = "completed";
    log.completedAt = now;
    log.lastSavedAt = now;
    log.totalTimeSeconds = Math.round((now - log.startedAt) / 1000);
    log.updatedAt = new Date(now).toISOString();

    let totalMessages = 0;
    for (const roleInteraction of Object.values(log.roleInteractions)) {
      totalMessages += roleInteraction.messages.length;
    }
    log.totalMessages = totalMessages;

    try {
      await s3Storage.saveInteractionLog(log);
    } catch (error) {
      console.error("Scenario session finish: interaction log save failed", error);
      return response(
        { error: "We could not save your run. Please try again." },
        502
      );
    }

    // Strict server-side validation: an absent, malformed, or media-shaped
    // metrics block degrades to null (never a throw, never a 400) — a
    // client that fails to send metrics must still be able to finish its
    // run. The student's locked capture mode is deliberately NOT read from
    // this payload; it is already fixed on the row from session start
    // (plan 10-05) and there is no second write path for it here. Unlike the
    // interview route, this route has no pre-existing PENDING-transition
    // update (that status flip happens inside the runner itself), so the
    // metrics are persisted in their own update, awaited here before
    // `waitUntil` schedules evaluation — guaranteeing the runner's own row
    // read always sees them.
    const { visual: visualMetrics, vocal: vocalMetrics } = parseMetricsPayload(rawMetrics);
    await prisma.scenarioReport.update({
      where: { id: report.id },
      data: {
        visualMetrics: toMetricsJsonInput(visualMetrics),
        vocalMetrics: toMetricsJsonInput(vocalMetrics),
      },
    });

    waitUntil(runAndPersistScenarioEvaluation(currentUser.id, report.id));

    return response({ success: true, reportId: report.id }, 202);
  } catch (error) {
    console.error("Scenario session finish failed:", error);
    return response({ error: "Unable to finish the scenario run." }, 500);
  }
}
