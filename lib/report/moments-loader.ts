/**
 * Reads the transcript behind a report's Moments section.
 *
 * Takes the row, never a user id from the request: the caller has already
 * ownership-checked it, and both storage keys are built from the row itself.
 * Only the student's own lines leave this module, and only as short excerpts.
 * The interviewer's text and the rest of the transcript stay on the server.
 *
 * Quoting a student back runs through `sanitizeQuote` first, the same guarantee
 * `toReportDto` gives outcome quotes: an explicit remark is characterized, never
 * recited. A storage failure costs the excerpts, never the report.
 */
import type { InteractionReport } from "@prisma/client";

import type { VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import { buildReportMoments, type ReportMoments } from "@/lib/report/moments";
import { sanitizeQuote } from "@/lib/report/quote-sanitizer";
import { asInputSnapshot } from "@/lib/report/snapshot";
import { s3Storage } from "@/lib/s3-client";

function screenQuote(content: string) {
  const { quote, sanitized } = sanitizeQuote(content);
  return { text: quote, replaced: sanitized };
}

export async function loadReportMoments(
  row: InteractionReport,
  metrics: { vocal: VocalMetrics | null; visual: VisualMetrics | null },
): Promise<ReportMoments | null> {
  const hasMoments = (metrics.vocal?.turns?.length ?? 0) > 0 || (metrics.visual?.episodes?.length ?? 0) > 0;
  if (row.status !== "READY" || !hasMoments) return null;

  try {
    if (row.transcriptKey) {
      const transcript = await s3Storage.getInterviewTranscript(row.userId, row.id);
      if (!transcript || transcript.userId !== row.userId || transcript.reportId !== row.id) return null;
      return buildReportMoments({
        ...metrics,
        transcriptStartedAtMs: transcript.startedAt,
        studentTurns: transcript.turns.filter((turn) => turn.role === "user"),
        offsetIsFromTranscriptStart: false,
        sanitize: screenQuote,
      });
    }

    const snapshot = asInputSnapshot(row.inputSnapshot);
    if (row.interactionLogId && row.studentEmail && snapshot?.kind === "scenario" && snapshot.caseId) {
      const log = await s3Storage.getInteractionLog(row.studentEmail, snapshot.caseId, row.interactionLogId);
      if (!log) return null;
      const studentTurns = Object.values(log.roleInteractions ?? {})
        .flatMap((role) => role.messages ?? [])
        .filter((message) => message.role === "user")
        .sort((a, b) => a.timestamp - b.timestamp);
      return buildReportMoments({
        ...metrics,
        transcriptStartedAtMs: log.startedAt,
        studentTurns,
        offsetIsFromTranscriptStart: true,
        sanitize: screenQuote,
      });
    }
  } catch (error) {
    console.error("Report moments unavailable:", { reportId: row.id, error });
  }
  return null;
}
