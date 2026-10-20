/**
 * The ONLY place `generateChecksForCompetency`'s (21-10, `./generate.ts`)
 * four inputs — `moments`, `momentOwnerUserIds`, `transcriptsByReportId`,
 * `selfNames` — are assembled, plus the pre-check index 21-19's POST route
 * uses instead of generating-and-discarding.
 *
 * WHY THIS MODULE EXISTS (REQ-123): 21-04's `extractSessionMoments`
 * deliberately keeps S3 out of its adversarial battery so it runs
 * credential-free. 21-07's moment-boundary redaction entry point
 * deliberately takes `momentOwnerUserIds` as an ARGUMENT, not a query it
 * runs itself, so the privacy boundary stays checkable by construction.
 * Both choices are right, and both mean something else has to do the
 * report query, the S3 transcript fetch, the `StructuredReport` read, and
 * the `selfNames` lookup. Before this plan, nothing did — 21-19 named only
 * "pre-checking which competencies have usable moments" with no mechanism,
 * which would have left the ownership scoping that redaction boundary's
 * whole privacy contract rests on to be improvised per-caller inside a
 * route with a 60s `maxDuration`. `loadGenerationSources` below is that
 * assembler, extracted deliberately, and its output satisfies that
 * boundary's ownership contract BY CONSTRUCTION — every query here scopes
 * by the requesting user in its WHERE clause, never by a post-filter.
 *
 * IMPORT DIRECTION: this file lives under `lib/study-plan/checks/`, where
 * 21-06's engine-import guard (`scripts/verify-knowledge-check-surface.ts`)
 * is ABSOLUTE with no carve-out for this directory. Nothing here imports
 * from the engine module tree. The S3 transcript accessor
 * (`s3Storage.getInterviewTranscript`, `lib/s3-client.ts`) and the
 * `StructuredReport` parser (`asStructuredReport`, `lib/report/structured.ts`)
 * are the EXISTING accessors `lib/report/handlers.ts` / `lib/report/dto.ts`
 * already use — neither lives under the engine tree, so no conflict arose
 * and none needed recording.
 *
 * THIS MODULE DOES NOT invoke 21-07's redaction entry point and does NOT
 * call a model. 21-10's `generateChecksForCompetency` owns both. Keeping
 * that boundary here means this module is fully testable with no API key
 * and no route, and it keeps 21-07's redaction as the single point it is
 * applied — never twice, never with different arguments.
 */
import type { CompetencyKey } from "../../mastery/competencies";
import { competencyForDimension } from "../../mastery/competencies";
import { prisma } from "../../prisma";
import { asScoreMap } from "../../report/snapshot";
import { asStructuredReport, type StructuredReport } from "../../report/structured";
import { s3Storage } from "../../s3-client";
import type { InterviewTranscript } from "../../interview/transcript";
import { extractSessionMoments, type SessionMoment } from "../moments";

export const SOURCE_LIMITS = {
  /** Reports read per assembly. PROVISIONAL UNTIL CALIBRATED. */
  maxReports: 8,
  /** Moments kept per competency. PROVISIONAL UNTIL CALIBRATED. */
  maxMomentsPerCompetency: 12,
} as const;

export interface GenerationSources {
  /** Exactly 21-10's `moments` input. */
  moments: SessionMoment[];
  /** Exactly 21-10's `momentOwnerUserIds`, index-aligned with `moments`. */
  momentOwnerUserIds: string[];
  /** Exactly 21-10's `transcriptsByReportId`. */
  transcriptsByReportId: ReadonlyMap<string, InterviewTranscript>;
  /** Exactly 21-10's `selfNames`. */
  selfNames: string[];
  /**
   * The pre-check index 21-19's POST route uses INSTEAD of generating and
   * discarding. A competency ABSENT from this map has no usable moment — an
   * empty-array entry would read as "available" and must never appear.
   */
  momentsByCompetency: ReadonlyMap<CompetencyKey, SessionMoment[]>;
  /** Reports dropped, with the reason. Reported, never silent. */
  degradedReports: Array<{ reportId: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Bounded-concurrency helper
// ---------------------------------------------------------------------------

/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Neither a
 * serial loop (eight S3 round trips serially is the difference between a
 * fast request and a blown 60s route budget) nor an unbounded `Promise.all`
 * (unbounded fan-out is how a larger `SOURCE_LIMITS.maxReports` later takes
 * the request down) is acceptable here.
 */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) return;
      await fn(items[current]);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

// ---------------------------------------------------------------------------
// selfNames
// ---------------------------------------------------------------------------

/**
 * Builds the distinct, non-empty, case-insensitively-deduplicated name
 * variants redaction needs. `User` carries a single `name` field (read from
 * `prisma/schema.prisma` — there is no separate first/preferred-name column
 * today), so the "every distinct non-empty variant" the plan asks for is:
 * the full name, and its first whitespace-delimited token when that differs.
 * A one-character token is dropped — it would redact every occurrence of
 * that letter and destroy the transcript. A user with no name set yields
 * `[]`; 21-07's redaction is required to handle that, not special-cased here.
 */
export function buildSelfNameVariants(fullNameRaw: string | null | undefined): string[] {
  const fullName = fullNameRaw?.trim() ?? "";
  const candidates: string[] = [];
  if (fullName) {
    candidates.push(fullName);
    const firstToken = fullName.split(/\s+/)[0] ?? "";
    if (firstToken && firstToken !== fullName) candidates.push(firstToken);
  }

  const seen = new Set<string>();
  const selfNames: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.length < 2) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    selfNames.push(trimmed);
  }
  return selfNames;
}

async function loadSelfNames(requestingUserId: string): Promise<string[]> {
  // selfNames query is scoped by `id: requestingUserId` — User's primary key
  // is `id`, not `userId`, so this is the second ownership-equivalent touch
  // point alongside the report query's `userId: requestingUserId` above:
  // every per-user read in this module is scoped to the requesting user.
  const user = await prisma.user.findUnique({
    where: { id: requestingUserId },
    select: { name: true },
  });
  return buildSelfNameVariants(user?.name);
}

// ---------------------------------------------------------------------------
// Pure assembly (DB/S3-free — the seam the verifier's Section 2 tests)
// ---------------------------------------------------------------------------

export interface ReportForAssembly {
  id: string;
  userId: string;
  createdAt: Date;
  /** Raw `InteractionReport.reportStructured` — parsed here via
   * `asStructuredReport`, never trusted directly. */
  reportStructured: unknown;
  /** Raw `InteractionReport.scores`. */
  scores: unknown;
}

export interface AssembleSourcesArgs {
  requestingUserId: string;
  /** Most-recent-first — recency ordering is load-bearing for both the
   * per-competency cap below and for "most recent survives" generally. */
  reports: ReportForAssembly[];
  transcriptsByReportId: ReadonlyMap<string, InterviewTranscript>;
  /** Reason strings for reports already known to have failed a transcript
   * fetch (missing key / S3 read threw) before reaching this function. A
   * report absent from BOTH this map and `transcriptsByReportId` degrades
   * with a generic reason instead. */
  transcriptDegradationReasons?: ReadonlyMap<string, string>;
  selfNames: string[];
}

/**
 * Throws if `moments` and `momentOwnerUserIds` are not the same length.
 * Exported on its own so the battery can prove this invariant actually
 * fires, by constructing a deliberately misaligned pair directly — the
 * construction loop above never produces a misaligned pair, so there is no
 * organic way to exercise this path end-to-end.
 */
export function assertMomentOwnerAlignment(
  moments: readonly SessionMoment[],
  momentOwnerUserIds: readonly string[],
): void {
  if (moments.length !== momentOwnerUserIds.length) {
    throw new Error(
      "loadGenerationSources: moments/momentOwnerUserIds length mismatch — alignment invariant violated",
    );
  }
}

/**
 * Pure assembly step: reports plus already-resolved transcripts/structured
 * sources in, `GenerationSources` out. No Prisma, no S3, no model call —
 * which is what lets the battery (`scripts/verify-generation-sources.ts`)
 * exercise every degradation/alignment/cap rule with no credentials.
 */
export function assembleSources(args: AssembleSourcesArgs): GenerationSources {
  const { requestingUserId, reports, transcriptsByReportId, transcriptDegradationReasons, selfNames } =
    args;

  const degradedReports: Array<{ reportId: string; reason: string }> = [];
  const moments: SessionMoment[] = [];
  const momentOwnerUserIds: string[] = [];
  const momentsByReportId = new Map<string, SessionMoment[]>();
  const usedTranscriptsByReportId = new Map<string, InterviewTranscript>();

  for (const report of reports) {
    const transcript = transcriptsByReportId.get(report.id);
    if (!transcript) {
      const reason = transcriptDegradationReasons?.get(report.id) ?? "transcript-unavailable";
      degradedReports.push({ reportId: report.id, reason });
      continue;
    }

    const structured: StructuredReport | null = asStructuredReport(report.reportStructured);
    if (!structured) {
      // Excluded from moments AND from transcriptsByReportId — a report
      // this module cannot derive moments from must not leave its transcript
      // reachable through the output either.
      degradedReports.push({
        reportId: report.id,
        reason: "missing-or-invalid-structured-report",
      });
      continue;
    }

    // STEP 5 (per-report): build `moments` and `momentOwnerUserIds` in the
    // SAME loop so index alignment is structural, not coincidental. Do NOT
    // build momentOwnerUserIds afterwards with a `.map()` over a possibly
    // reordered array.
    const reportMoments = extractSessionMoments(transcript, structured, report.id);
    momentsByReportId.set(report.id, reportMoments);
    usedTranscriptsByReportId.set(report.id, transcript);
    for (const moment of reportMoments) {
      moments.push(moment);
      momentOwnerUserIds.push(requestingUserId);
    }
  }

  // Alignment is guaranteed by construction above; assert it anyway and
  // THROW on violation — 21-07 compares these index-wise, and a
  // misalignment would make its ownership check pass while attributing the
  // wrong owner. Extracted as its own exported function so the battery can
  // prove the invariant actually fires (an invariant never seen to throw is
  // not an invariant) without needing to break the construction above.
  assertMomentOwnerAlignment(moments, momentOwnerUserIds);

  // STEP 6. Group moments by the competency their report's SCORED
  // DIMENSIONS implicate (via 21-02's `competencyForDimension`), restricted
  // to moments that actually link to a growth area — a moment with no
  // linked growth area documents nothing a report flagged as a gap, so it
  // contributes to no competency's queue. A competency with zero
  // contributing moments across every supplied report is left ABSENT from
  // the map, never present with an empty array.
  const momentsByCompetencyBuilder = new Map<CompetencyKey, SessionMoment[]>();

  for (const report of reports) {
    const reportMoments = momentsByReportId.get(report.id);
    if (!reportMoments || reportMoments.length === 0) continue;

    const scoreMap = asScoreMap(report.scores) ?? {};
    const reportCompetencies = new Set<CompetencyKey>();
    for (const [dimensionKey, value] of Object.entries(scoreMap)) {
      if (value === null) continue;
      const competencyKey = competencyForDimension(dimensionKey);
      if (competencyKey) reportCompetencies.add(competencyKey);
    }
    if (reportCompetencies.size === 0) continue;

    for (const moment of reportMoments) {
      if (moment.linkedGrowthAreaTitles.length === 0) continue;
      for (const competencyKey of reportCompetencies) {
        const existing = momentsByCompetencyBuilder.get(competencyKey);
        if (existing) {
          existing.push(moment);
        } else {
          momentsByCompetencyBuilder.set(competencyKey, [moment]);
        }
      }
    }
  }

  // Cap each competency's list, keeping the most RECENT. `reports` arrives
  // most-recent-first, so each builder list is already in that order —
  // slicing the front keeps the most recent and drops the oldest, never the
  // reverse.
  const momentsByCompetency = new Map<CompetencyKey, SessionMoment[]>();
  for (const [key, list] of momentsByCompetencyBuilder) {
    momentsByCompetency.set(key, list.slice(0, SOURCE_LIMITS.maxMomentsPerCompetency));
  }

  return {
    moments,
    momentOwnerUserIds,
    transcriptsByReportId: usedTranscriptsByReportId,
    selfNames,
    momentsByCompetency,
    degradedReports,
  };
}

// ---------------------------------------------------------------------------
// The real transcript accessor
// ---------------------------------------------------------------------------

async function defaultReadTranscript(
  userId: string,
  reportId: string,
  _transcriptKey: string,
): Promise<InterviewTranscript> {
  const transcript = await s3Storage.getInterviewTranscript(userId, reportId);
  if (!transcript) {
    throw new Error(`No transcript found in storage for report ${reportId}`);
  }
  return transcript;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface LoadGenerationSourcesOpts {
  /** Injected for testing. Defaults to the real transcript accessor
   * (`s3Storage.getInterviewTranscript`), so the battery needs no S3
   * credentials. */
  readTranscript?: (
    userId: string,
    reportId: string,
    key: string,
  ) => Promise<InterviewTranscript>;
}

/**
 * Turns a requesting user and a set of report ids into
 * `generateChecksForCompetency`'s four inputs, ownership-scoped by
 * construction, plus the pre-check index 21-19's POST route needs.
 *
 * Ids in `reportIds` that do not come back from the ownership-scoped query
 * are silently absent — never reported as degraded, never erroring — so a
 * student passing someone else's report id gets nothing, not an error that
 * confirms the id exists.
 */
export async function loadGenerationSources(
  requestingUserId: string,
  reportIds: string[],
  opts?: LoadGenerationSourcesOpts,
): Promise<GenerationSources> {
  const readTranscript = opts?.readTranscript ?? defaultReadTranscript;

  // 1. OWNERSHIP IN THE WHERE CLAUSE, not after. `userId: requestingUserId`
  // is what makes it IMPOSSIBLE for a foreign report to reach the result;
  // `status: "READY"` keeps an unscored/failed report from contributing
  // moments with no growth areas behind them.
  const reports = await prisma.interactionReport.findMany({
    where: {
      id: { in: reportIds },
      userId: requestingUserId,
      status: "READY",
    },
    orderBy: { createdAt: "desc" },
    take: SOURCE_LIMITS.maxReports,
    select: {
      id: true,
      userId: true,
      transcriptKey: true,
      reportStructured: true,
      scores: true,
      createdAt: true,
    },
  });

  // Belt-and-braces: a POST-FILTER here would hide a query bug. This is an
  // ASSERTION instead — it surfaces one by throwing, rather than quietly
  // trimming a foreign row the WHERE clause should already have excluded.
  for (const row of reports) {
    if (row.userId !== requestingUserId) {
      throw new Error(
        "loadGenerationSources: ownership assertion failed — a non-owned report reached the result set",
      );
    }
  }

  // 2. selfNames.
  const selfNames = await loadSelfNames(requestingUserId);

  // 3. TRANSCRIPTS, bounded concurrency 4. A report whose transcript is
  // missing, unreadable, or whose read throws is excluded from the result
  // entirely and costs only that report's moments — never the whole
  // assembly.
  const transcriptsByReportId = new Map<string, InterviewTranscript>();
  const transcriptDegradationReasons = new Map<string, string>();

  await mapWithConcurrency(reports, 4, async (report) => {
    if (!report.transcriptKey) {
      transcriptDegradationReasons.set(report.id, "no-transcript-key");
      return;
    }
    try {
      const transcript = await readTranscript(requestingUserId, report.id, report.transcriptKey);
      transcriptsByReportId.set(report.id, transcript);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      transcriptDegradationReasons.set(report.id, `transcript-read-failed: ${detail}`.slice(0, 300));
    }
  });

  // 4-7. STRUCTURED REPORTS, MOMENTS, ALIGNMENT, GROUPING — all pure, in
  // `assembleSources`.
  return assembleSources({
    requestingUserId,
    reports: reports.map((r) => ({
      id: r.id,
      userId: r.userId,
      createdAt: r.createdAt,
      reportStructured: r.reportStructured,
      scores: r.scores,
    })),
    transcriptsByReportId,
    transcriptDegradationReasons,
    selfNames,
  });
}
