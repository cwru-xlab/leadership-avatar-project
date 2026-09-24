/**
 * Shared background evaluation runner.
 *
 * `runAndPersistEvaluation` is the single place that turns a stored transcript
 * into a `READY` or `FAILED` `InterviewReport` row. Both the finish route and
 * the retry route call this so failure semantics — "always terminate in READY
 * or FAILED, never leave the row PENDING, never touch the stored transcript" —
 * exist in exactly one place.
 *
 * This module owns Prisma writes and the S3 transcript read; it is not a pure
 * library like `./evaluation`, which stays free of both.
 */

import { prisma } from "@/lib/prisma";
import { s3Storage } from "@/lib/s3-client";
import { formatTranscriptForEvaluator } from "./transcript";
import { runInterviewEvaluation } from "./evaluation";
import { getInterviewType, DEFAULT_INTERVIEW_TYPE } from "./types";
import { asVisualMetrics, asVocalMetrics } from "@/lib/metrics/ingest";
import { resolveVisualOutcome, resolveVocalOutcome } from "@/lib/metrics/coverage";
import type { CameraMode } from "@/lib/metrics/types";

const MAX_ERROR_MESSAGE_LENGTH = 500;

function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
}

/**
 * Load the stored transcript, run the evaluator, and persist the outcome.
 *
 * Never throws: every failure path (missing row, missing transcript,
 * evaluator failure, or an unexpected exception) is caught and, wherever
 * possible, recorded as a `FAILED` row with an operator-readable reason. The
 * stored S3 transcript is never deleted or overwritten here.
 */
export async function runAndPersistEvaluation(
  userId: string,
  reportId: string
): Promise<void> {
  console.info("Interview evaluation starting", { userId, reportId });

  try {
    const report = await prisma.interviewReport.findFirst({
      where: { id: reportId, userId },
    });

    if (!report) {
      console.warn("Interview evaluation: report not found, skipping", {
        userId,
        reportId,
      });
      return;
    }

    const transcript = await s3Storage.getInterviewTranscript(userId, reportId);

    if (!transcript) {
      await persistFailure(
        reportId,
        "Transcript could not be read from storage."
      );
      console.error("Interview evaluation failed: missing transcript", {
        userId,
        reportId,
        status: "FAILED",
      });
      return;
    }

    // A customized session must be graded against the role/industry/difficulty
    // the student actually experienced, not the preset's own defaults — the
    // slug alone can no longer identify that. The row's own stored columns win
    // when present; a pre-Phase-8 row (all six columns null) falls through to
    // the preset and then the default, reproducing today's exact behavior.
    const preset = getInterviewType(report.typeSlug) ?? DEFAULT_INTERVIEW_TYPE;
    const roleContext = {
      roleTitle: report.roleTitle ?? preset.defaultRoleTitle,
      industry: report.industry ?? preset.defaultIndustry,
      difficulty: report.difficulty ?? preset.difficulty,
    };

    // Parse the row's own stored Json? columns back into the shared types
    // through the SAME discriminator that validated them on the way in
    // (lib/metrics/ingest.ts) — never a third private copy.
    const visual = asVisualMetrics(report.visualMetrics);
    const vocal = asVocalMetrics(report.vocalMetrics);

    // The liveness-vs-performance discriminator (REQ-42, lib/metrics/coverage.ts).
    // A legacy row has a null cameraMode; treating it as camera-off would
    // resolve to CAMERA_OFF_OPTOUT here, but the report page must render a
    // legacy row as "Not yet measured" — so the unscored reason is only
    // ever written below when cameraMode is actually set (see the
    // report.cameraMode === null guard on the write itself).
    const cameraMode = (report.cameraMode as CameraMode | null) ?? "OFF";
    const visualOutcome = resolveVisualOutcome(cameraMode, visual);
    const vocalOutcome = resolveVocalOutcome(vocal);

    // Metrics are handed to the evaluator ONLY when the outcome says scored.
    // A technical failure must never send a metrics object the model would
    // then dutifully score (plan 10-06's prompt/type gate then also agrees,
    // since visualMetrics === null there forces the score null regardless
    // of what the model returns).
    const outcome = await runInterviewEvaluation({
      fullTranscript: formatTranscriptForEvaluator(transcript),
      resumeText: report.resumeText ?? "",
      roleContext,
      visualMetrics: visualOutcome.scored ? visual : null,
      vocalMetrics: vocalOutcome.scored ? vocal : null,
    });

    if (outcome.ok) {
      // A legacy row (report.cameraMode === null) keeps both reason columns
      // null — this is what keeps REQ-48 (legacy reports never change) and
      // REQ-45 (a stored, never-re-derived cause) from colliding.
      const visualUnscoredReason =
        report.cameraMode === null ? null : visualOutcome.reason;
      const vocalUnscoredReason =
        report.cameraMode === null ? null : vocalOutcome.reason;

      await prisma.interviewReport.update({
        where: { id: reportId },
        data: {
          status: "READY",
          visualScore: outcome.result.visualScore,
          vocalScore: outcome.result.vocalScore,
          contentScore: outcome.result.contentScore,
          behavioralScore: outcome.result.behavioralScore,
          reportMarkdown: outcome.result.reportMarkdown,
          failureReason: null,
          evalModel: outcome.model,
          completedAt: new Date(),
          visualUnscoredReason,
          vocalUnscoredReason,
        },
      });
      console.info("Interview evaluation completed", {
        userId,
        reportId,
        status: "READY",
        cameraMode: report.cameraMode,
        visualUnscoredReason,
        vocalUnscoredReason,
      });
      return;
    }

    await persistFailure(reportId, outcome.reason, outcome.model);
    console.error("Interview evaluation failed", {
      userId,
      reportId,
      status: "FAILED",
    });
  } catch (error) {
    // Best-effort FAILED write. A background job must never leave the row
    // stuck in PENDING because of an unhandled throw. Swallow any secondary
    // error from this write itself.
    const message =
      error instanceof Error ? error.message : String(error);
    try {
      await persistFailure(reportId, truncateErrorMessage(message));
    } catch (secondaryError) {
      console.error("Interview evaluation: secondary failure writing FAILED status", {
        userId,
        reportId,
        error:
          secondaryError instanceof Error
            ? secondaryError.message
            : String(secondaryError),
      });
    }
    console.error("Interview evaluation threw unexpectedly", {
      userId,
      reportId,
      status: "FAILED",
      error: message,
    });
  }
}

/**
 * Flip the row to FAILED. Never clears `transcriptKey`, `resumeText`, or
 * `turnCount` — the transcript remains available for a subsequent retry.
 */
async function persistFailure(
  reportId: string,
  reason: string,
  model?: string
): Promise<void> {
  // Ownership was already verified by the caller's findFirst({ id, userId })
  // lookup; `update` itself only accepts a unique field (id) in `where`.
  await prisma.interviewReport.update({
    where: { id: reportId },
    data: {
      status: "FAILED",
      failureReason: reason,
      evalModel: model,
      completedAt: new Date(),
    },
  });
}
