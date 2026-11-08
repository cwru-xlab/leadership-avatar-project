/**
 * Shared report-read / retry / list handlers backing
 * `/api/practice/report/*` and the thin legacy delegations.
 *
 * Reads come from `InteractionReport` only — no legacy-table fallback
 * (CONTEXT.md rejected "legacy read path forever"). Ownership is always
 * in the findFirst where-clause so another user's report is a 404, never
 * a 403 (Phase 6 criterion, still binding).
 */

import { Prisma } from "@prisma/client";
import { waitUntil } from "@vercel/functions";

import { getEngineType } from "@/lib/engine/registry";
import { runAndPersistEvaluation } from "@/lib/engine/evaluation-runner";
import { prisma } from "@/lib/prisma";
import { REPORT_DTO_SELECT, toReportDto, type ReportDTO } from "@/lib/report/dto";
import { loadReportMoments, REPORT_MOMENTS_SELECT } from "@/lib/report/moments-loader";
import { asVisualMetrics } from "@/lib/metrics/ingest";
import {
  asStoredCheckIn,
  CHECK_IN_VERSION,
  eligibleCheckIns,
  parseCheckInInput,
  STORED_CHECK_IN_KEY,
  type CheckInAnswers,
  type StoredCheckIn,
} from "@/lib/report/check-in";

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

  // Explicit select (REPORT_DTO_SELECT): only DTO-serialized columns reach
  // the query, so a private column added ahead of its migration cannot
  // break this read with Prisma P2022. The Moments loader's storage keys
  // ride along under the same rule.
  const row = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
    select: { ...REPORT_DTO_SELECT, ...REPORT_MOMENTS_SELECT },
  });

  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  const report = toReportDto(row);
  report.moments = await loadReportMoments(row, report.metrics);
  return { ok: true, report };
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
 * matching today's `/api/interview/reports` behavior. Optional `types`
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
    select: REPORT_DTO_SELECT,
  });

  return { ok: true, reports: rows.map(toReportDto) };
}

/** Report ids used by any of this user's saved study plans. Owner-scoped. */
export async function listPlannedReportIds(userId: string): Promise<string[]> {
  const plans = await prisma.studyPlan.findMany({
    where: { userId },
    select: { sourceReportIds: true },
  });
  const ids = new Set<string>();
  for (const plan of plans) {
    if (!Array.isArray(plan.sourceReportIds)) continue;
    for (const id of plan.sourceReportIds) {
      if (typeof id === "string") ids.add(id);
    }
  }
  return [...ids];
}

export type SaveCheckInResult =
  | { ok: true; checkIn: CheckInAnswers }
  /**
   * The flag was well-formed, but this report no longer asks it. Nothing was
   * stored and there is nothing for the student to fix or retry. Kept as its
   * own member so the client can DROP the question instead of reporting a
   * failed save (see the eligibility check in `saveCheckInForUser`).
   */
  | { ok: false; status: number; error: string; retired: true }
  | ReportHandlerError;

/** Attempts before a write that keeps losing a concurrent-update race gives up. */
const CHECK_IN_WRITE_ATTEMPTS = 3;

/**
 * Owner-scoped write of one check-in answer (see `lib/report/check-in.ts`).
 *
 * Malformed id, missing row and not-owned are the same 404 as the read. The
 * flag must be one this report actually asks about, recomputed here from the
 * stored metrics rather than trusted from the client. A flag that is valid
 * but no longer asked comes back as `retired` rather than an error, because
 * the student did nothing wrong and has nothing to retry.
 *
 * The answer is merged under `STORED_CHECK_IN_KEY` on `visualMetrics`; every
 * other key in that JSON is written back exactly as read. Nothing here
 * touches a score, the report body or the evaluator. The update is
 * conditional on `updatedAt`, so two answers saved at once cannot drop each
 * other.
 */
export async function saveCheckInForUser(
  userId: string,
  reportId: string,
  body: unknown,
): Promise<SaveCheckInResult> {
  if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  for (let attempt = 0; attempt < CHECK_IN_WRITE_ATTEMPTS; attempt += 1) {
    const row = await prisma.interactionReport.findFirst({
      where: { id: reportId, userId },
      select: { id: true, status: true, cameraMode: true, visualMetrics: true, updatedAt: true },
    });

    if (!row) {
      return { ok: false, status: 404, error: "Report not found" };
    }

    // Checked after ownership so a stranger learns nothing from a 400.
    const input = parseCheckInInput(body);
    if (!input) {
      return { ok: false, status: 400, error: "Invalid check-in answer" };
    }

    if (row.status !== "READY") {
      return { ok: false, status: 409, error: "This report isn't ready yet.", reportStatus: row.status };
    }

    const stored = row.visualMetrics;
    const visual = asVisualMetrics(stored);
    // RETIRED, NOT REJECTED. `parseCheckInInput` has already established that
    // the flag is one of this module's own ids, so reaching here means the
    // page asked a question that eligibility no longer returns: it rendered
    // before a threshold moved, and every tuning pass recorded in
    // `12-TUNING.md` can move one. The question has been withdrawn, so the
    // student has nothing to fix and nothing to retry — the client is told to
    // drop it rather than shown a red error it cannot clear. A 400 here would
    // be a dead end on a question the student never chose to see.
    if (!eligibleCheckIns(row.cameraMode, visual).some((question) => question.id === input.flag)) {
      return {
        ok: false,
        status: 409,
        error: "That question no longer applies to this report.",
        retired: true,
      };
    }

    const raw = stored as Record<string, unknown>;
    const answers: CheckInAnswers = {
      ...asStoredCheckIn(raw[STORED_CHECK_IN_KEY]),
      [input.flag]: {
        answer: input.answer,
        ...(input.reason ? { reason: input.reason } : {}),
        at: new Date().toISOString(),
      },
    };
    const checkIn: StoredCheckIn = { version: CHECK_IN_VERSION, answers };

    const { count } = await prisma.interactionReport.updateMany({
      where: { id: row.id, userId, status: "READY", updatedAt: row.updatedAt },
      data: {
        visualMetrics: { ...raw, [STORED_CHECK_IN_KEY]: checkIn } as unknown as Prisma.InputJsonValue,
      },
    });

    if (count === 1) {
      return { ok: true, checkIn: answers };
    }
  }

  return { ok: false, status: 409, error: "Your answer couldn't be saved. Please try again." };
}
