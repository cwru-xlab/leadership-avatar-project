/**
 * Shared report-read / retry / list handlers backing
 * `/api/practice/report/*` and the thin legacy delegations.
 *
 * Reads come from `InteractionReport` only — no legacy-table fallback
 * (CONTEXT.md rejected "legacy read path forever"). Ownership is always
 * in the findFirst where-clause so another user's report is a 404, never
 * a 403 (Phase 6 criterion, still binding).
 */

import { waitUntil } from "@vercel/functions";

import { getEngineType } from "@/lib/engine/registry";
import { runAndPersistEvaluation } from "@/lib/engine/evaluation-runner";
import { prisma } from "@/lib/prisma";
import { toReportDto, type ReportDTO } from "@/lib/report/dto";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportHandlerError = {
  ok: false;
  status: number;
  error: string;
  /** Present on 409 retry responses so the client can show current status. */
  reportStatus?: string;
};

export type GetReportResult =
  | { ok: true; report: ReportDTO }
  | ReportHandlerError;

export type RetryReportResult =
  | { ok: true; reportId: string; status: "PENDING" }
  | ReportHandlerError;

export type ListReportsResult =
  | { ok: true; reports: ReportDTO[] }
  | ReportHandlerError;

/**
 * Owner-scoped single-report read. Malformed id, missing row, and
 * not-owned all collapse to the same 404 body.
 */
export async function getReportForUser(
  userId: string,
  reportId: string,
): Promise<GetReportResult> {
  if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  const row = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
  });

  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  return { ok: true, report: toReportDto(row) };
}

/**
 * Re-run evaluation for a FAILED report. Gated on the resolved type
 * declaring `supportsRetry` — case-study returns 404 (REQ-69: the path
 * genuinely does not exist for that type today).
 */
export async function retryReportForUser(
  userId: string,
  reportId: string,
): Promise<RetryReportResult> {
  if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) {
    return { ok: false, status: 400, error: "Invalid reportId" };
  }

  const report = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
    select: {
      id: true,
      status: true,
      typeSlug: true,
      transcriptKey: true,
      interactionLogId: true,
    },
  });

  if (!report) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const type = getEngineType(report.typeSlug);
  // REQ-69: retry exists for interview presets only. A case-study report
  // must look like the path does not exist — same 404 a client would have
  // received before the engine existed.
  if (!type?.supportsRetry) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (report.status !== "FAILED") {
    return {
      ok: false,
      status: 409,
      error: "Only a failed report can be re-run.",
      reportStatus: report.status,
    };
  }

  // Interview retries need the S3 transcript pointer; scenario would use
  // interactionLogId if it ever gained retry, but supportsRetry gates that.
  if (report.transcriptKey === null) {
    return {
      ok: false,
      status: 409,
      error: "This interview has no stored transcript to re-run.",
    };
  }

  await prisma.interactionReport.update({
    where: { id: report.id },
    data: { status: "PENDING", failureReason: null },
  });

  waitUntil(runAndPersistEvaluation({ reportId: report.id }));

  return { ok: true, reportId: report.id, status: "PENDING" };
}

/**
 * Owner-scoped list. Always excludes `IN_PROGRESS` (abandoned sessions),
 * matching today's `/api/interview/reports` behaviour. Optional `types`
 * filters by `typeSlug`; when omitted, every type is returned.
 *
 * `app/reports/page.tsx` will pass the four interview preset slugs
 * explicitly (plan 13-13), so that page keeps rendering exactly what it
 * renders today. Making scenario runs visible in the list for the first
 * time is a deliberate NON-goal of Phase 13 (REQ-69).
 */
export async function listReportsForUser(
  userId: string,
  types?: string[] | null,
): Promise<ListReportsResult> {
  const typeFilter =
    types && types.length > 0
      ? { typeSlug: { in: types } }
      : {};

  const rows = await prisma.interactionReport.findMany({
    where: {
      userId,
      status: { not: "IN_PROGRESS" },
      ...typeFilter,
    },
    orderBy: { createdAt: "desc" },
  });

  return { ok: true, reports: rows.map(toReportDto) };
}
