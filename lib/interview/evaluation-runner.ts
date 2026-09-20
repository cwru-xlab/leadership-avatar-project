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

    const type = getInterviewType(report.typeSlug) ?? DEFAULT_INTERVIEW_TYPE;
    const roleContext = {
      roleTitle: type.defaultRoleTitle,
      industry: type.defaultIndustry,
      difficulty: type.difficulty,
    };

    const outcome = await runInterviewEvaluation({
      fullTranscript: formatTranscriptForEvaluator(transcript),
      resumeText: report.resumeText ?? "",
      roleContext,
    });

    if (outcome.ok) {
      await prisma.interviewReport.update({
        where: { id: reportId },
        data: {
          status: "READY",
          visualScore: null,
          vocalScore: null,
          contentScore: outcome.result.contentScore,
          behavioralScore: outcome.result.behavioralScore,
          reportMarkdown: outcome.result.reportMarkdown,
          failureReason: null,
          evalModel: outcome.model,
          completedAt: new Date(),
        },
      });
      console.info("Interview evaluation completed", {
        userId,
        reportId,
        status: "READY",
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
