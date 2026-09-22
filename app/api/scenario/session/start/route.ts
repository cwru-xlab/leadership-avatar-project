import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { resolveAttemptLanguage } from "@/lib/languages";
import type { InteractionLog } from "@/types";
import type { CameraMode } from "@/lib/metrics/types";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Start a cohort-free scenario run: playability-checked, snapshots the
 * scenario onto a new `ScenarioReport` row (REQ-33), and creates the S3
 * `InteractionLog` the client's existing `/api/interaction/save`
 * checkpointing keeps writing to unchanged.
 *
 * Deliberately routes around `/api/interaction/start`, which hard-requires a
 * cohort field a student scenario will never have. Does not call it over
 * HTTP and does not relax its check — this route builds its own cohort-free
 * log directly below.
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
      caseId,
      language,
      cameraMode: rawCameraMode,
    } = body as Record<string, unknown>;

    if (typeof caseId !== "string" || !caseId) {
      return response({ error: "Scenario not found" }, 404);
    }

    const scenario = await s3Storage.getCase(caseId);

    // Playable-scenario access, enforced server-side:
    // - the caller's own scenario (published or not), OR
    // - another student's PUBLISHED scenario.
    // An admin-authored case (no ownerId) is never playable through this
    // route — it keeps using the legacy /api/interaction/* path unchanged.
    // Every miss returns the identical 404, never a forbidden response.
    const isPlayable =
      !!scenario &&
      !!scenario.ownerId &&
      (scenario.ownerId === currentUser.id || scenario.published === true);

    if (!scenario || !isPlayable) {
      return response({ error: "Scenario not found" }, 404);
    }

    // REQ-35: never trust the client's string. Anything other than the two
    // literal CameraMode values falls back to "OFF", mirroring the
    // resolveInterviewType precedent of a hostile value silently falling
    // back rather than throwing.
    let cameraMode: CameraMode =
      rawCameraMode === "ON" || rawCameraMode === "OFF" ? rawCameraMode : "OFF";

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { videoAnalysisConsentAt: true },
    });
    const consentAt = user?.videoAnalysisConsentAt ?? null;

    // REQ-36 enforced in code, not only in UI: a client that skipped the
    // consent dialog must not be able to start a measured session. The
    // server is the last line of defence.
    if (cameraMode === "ON" && !consentAt) {
      console.info("Scenario session start: forcing camera OFF (no consent)", {
        userId: currentUser.id,
      });
      cameraMode = "OFF";
    }

    // REQ-33: snapshot taken from `scenario` right now, at run start — never
    // updated later even if the author edits or deletes the scenario.
    // cameraMode/metricsConsentAt extend the same run-time-snapshot principle
    // to Phase 10, written ONCE here at creation with no later update path.
    const report = await prisma.scenarioReport.create({
      data: {
        userId: currentUser.id,
        caseId,
        status: "IN_PROGRESS",
        caseName: scenario.name,
        backgroundSnapshot: scenario.backgroundInfo,
        avatarsSnapshot: scenario.avatars as unknown as object,
        criteriaSnapshot: scenario.evaluationPrompt ?? null,
        cameraMode,
        metricsConsentAt: consentAt,
      },
      select: { id: true },
    });

    const now = Date.now();
    const logId = `${now}_${Math.random().toString(36).substring(2, 9)}`;

    const log: InteractionLog = {
      id: logId,
      studentEmail: currentUser.email.toLowerCase(),
      studentName: currentUser.name || currentUser.email.split("@")[0],
      caseId,
      caseName: scenario.name,
      // A scenario has no cohort and none is invented here.
      cohortId: "",
      attemptNumber: await s3Storage.getNextAttemptNumber(
        currentUser.email.toLowerCase(),
        caseId
      ),
      mode: "assessed",
      language: resolveAttemptLanguage(
        typeof language === "string" ? language : undefined
      ).code,
      status: "in_progress",
      roleInteractions: {},
      events: [
        {
          type: "start_session",
          timestamp: now,
        },
      ],
      startedAt: now,
      lastSavedAt: now,
      totalMessages: 0,
      totalTimeSeconds: 0,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    try {
      await s3Storage.saveInteractionLog(log);
    } catch (error) {
      // Never leave an orphan IN_PROGRESS report row if the S3 log write
      // fails (Phase 6 no-orphan-row discipline).
      console.error("Scenario session start: interaction log save failed", error);
      await prisma.scenarioReport.delete({ where: { id: report.id } }).catch(() => {});
      return response(
        { error: "We could not start the scenario. Please try again." },
        500
      );
    }

    await prisma.scenarioReport.update({
      where: { id: report.id },
      data: {
        interactionLogId: log.id,
        studentEmail: currentUser.email.toLowerCase(),
      },
    });

    console.info("Scenario report created", {
      userId: currentUser.id,
      reportId: report.id,
      caseId,
      cameraMode,
    });

    return response({ success: true, reportId: report.id, log }, 201);
  } catch (error) {
    console.error("Scenario session start failed:", error);
    return response({ error: "Unable to start the scenario." }, 500);
  }
}
