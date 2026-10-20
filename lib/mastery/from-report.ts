/**
 * The SINGLE report-to-competency mapper (REQ-124).
 *
 * This module is the ONLY place a report's scored rubric dimensions become
 * mastery contributions. Two consumers exist by design:
 *   - `recordLiveSessionContributions` below (the LIVE_SESSION writer, hooked
 *     onto `lib/engine/evaluation-runner.ts`'s READY transition).
 *   - `recordCoachedContribution` in `lib/study-plan/coached/contribution.ts`
 *     (21-16), which DELEGATES to `contributionsFromReport` rather than
 *     reimplementing the mapping.
 * A third consumer is fine. A second COPY of this mapping logic is a REQ-124
 * failure — see `scripts/verify-live-session-ingestion.ts` section 3's
 * no-second-copy guard.
 */

import { prisma } from "@/lib/prisma";
import { asScoreMap } from "@/lib/report/snapshot";
import { competencyForDimension, type CompetencyKey } from "@/lib/mastery/competencies";
import { normalizeRubricScore } from "@/lib/mastery/weights";
import {
  recordContributions,
  type ContributionInput,
} from "@/lib/mastery/ledger";
import type { ContributionSource } from "@/lib/mastery/weights";

export interface ReportMappingResult {
  inputs: ContributionInput[];
  /** Dimensions skipped because the score was null. Reported, never zeroed. */
  nullDimensions: string[];
  /** Dimension keys with no competency in the catalog. Non-empty = a data bug. */
  unmappedDimensions: string[];
}

/**
 * Pure step: a score map -> grouped-by-competency `ContributionInput[]`,
 * with no database involved. Extracted so
 * `scripts/verify-live-session-ingestion.ts` section 2 can exercise the
 * mapping rules (null-skip, unmapped-skip, per-competency mean) with no
 * `DATABASE_URL` reachable.
 */
export function contributionInputsFromScoreMap(args: {
  scores: Record<string, number | null>;
  userId: string;
  source: ContributionSource;
  occurredAt: Date;
  sourceReportId: string;
}): Omit<ReportMappingResult, "inputs"> & { inputs: ContributionInput[] } {
  const { scores, userId, source, occurredAt, sourceReportId } = args;

  const nullDimensions: string[] = [];
  const unmappedDimensions: string[] = [];

  // Group normalized dimension scores by the competency they evidence.
  // A competency whose every mapped dimension is null gets NO entry here at
  // all — not a zero-filled one. That is what lets step 4 below emit no
  // input for it, rather than an input carrying a false zero.
  const byCompetency = new Map<CompetencyKey, number[]>();

  for (const [dimensionKey, rawValue] of Object.entries(scores)) {
    if (rawValue === null) {
      // A null score means camera off / insufficient data / not applicable
      // (Phase 10's unscored-reason columns) — NOT a failing score. Zeroing
      // it would punish a student for not having a camera. Record it as
      // skipped and move on; it contributes nothing, not a zero.
      nullDimensions.push(dimensionKey);
      continue;
    }

    const competencyKey = competencyForDimension(dimensionKey);
    if (!competencyKey) {
      // No catalog entry for this dimension key. Skipped, never defaulted
      // into some other competency — a wrong attribution is worse than a
      // missing one (21-09 already surfaces unmappedRowCount).
      unmappedDimensions.push(dimensionKey);
      continue;
    }

    const normalized = normalizeRubricScore(rawValue);
    const existing = byCompetency.get(competencyKey);
    if (existing) {
      existing.push(normalized);
    } else {
      byCompetency.set(competencyKey, [normalized]);
    }
  }

  const inputs: ContributionInput[] = [];
  for (const [competencyKey, normalizedScores] of byCompetency) {
    // Mean is over NORMALIZED values (e.g. raw 2 and 4 -> normalized 0.25 and
    // 0.75 -> mean 0.5), not normalized after meaning. Pinned here, and in
    // the verifier's section 2, so the two cannot silently diverge later.
    const rawScore =
      normalizedScores.reduce((sum, v) => sum + v, 0) / normalizedScores.length;

    inputs.push({
      userId,
      competencyKey,
      source,
      rawScore,
      occurredAt,
      sourceReportId,
      sourceAttemptId: null,
    });
  }

  return { inputs, nullDimensions, unmappedDimensions };
}

/**
 * Loads an `InteractionReport` (scoped by BOTH `id` and `userId`), reads its
 * `scores` through `asScoreMap` (the existing accessor — not a fresh JSON
 * cast), and maps every scored rubric dimension up into a competency via
 * `competencyForDimension`.
 *
 * `occurredAt` comes from the ARGUMENT, never from the clock and never from
 * the row-write timestamp — 21-05's `readContributions` windows on
 * `occurredAt`, so a session evaluated late must still land in the window it
 * actually happened in. The live caller below passes the report's
 * `startedAt`; the coached caller (21-16) passes `completedAt`.
 */
export async function contributionsFromReport(args: {
  userId: string;
  reportId: string;
  source: ContributionSource;
  occurredAt: Date;
}): Promise<ReportMappingResult> {
  const { userId, reportId, source, occurredAt } = args;

  const report = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId },
    select: { scores: true },
  });

  if (!report) {
    throw new Error(
      `contributionsFromReport: no InteractionReport "${reportId}" found for user "${userId}"`
    );
  }

  const scoreMap = asScoreMap(report.scores);
  if (!scoreMap) {
    // No scores at all (report not yet READY, or a malformed/legacy row).
    // Nothing to map; return an empty result rather than throwing — a
    // report with no scores yet is not a data bug.
    return { inputs: [], nullDimensions: [], unmappedDimensions: [] };
  }

  return contributionInputsFromScoreMap({
    scores: scoreMap,
    userId,
    source,
    occurredAt,
    sourceReportId: reportId,
  });
}

/**
 * The LIVE_SESSION writer. Hooked onto `evaluation-runner.ts`'s READY
 * transition — the hook site knows only a report id.
 */
type LiveIngestionSkipReason = "coached-session" | "already-ingested" | null;

export async function recordLiveSessionContributions(args: {
  reportId: string;
}): Promise<{
  written: number;
  skipped: LiveIngestionSkipReason;
}> {
  const { reportId } = args;

  const report = await prisma.interactionReport.findUnique({
    where: { id: reportId },
    select: { userId: true, startedAt: true },
  });

  if (!report) {
    console.warn("Mastery live ingestion: report not found, skipping", {
      reportId,
    });
    return { written: 0, skipped: null };
  }

  // Phase 21 / LOCKED ORDERING: 21-CONTEXT.md locks "coached sessions DO move
  // mastery, weighted below unaided practice" (21-05's
  // WEIGHT_ORDERING_CONSTRAINTS: LIVE_SESSION 1.00 > COACHED_SESSION 0.40).
  //
  // A coached session's report goes through evaluation-runner's READY+scores
  // update exactly like an unaided one, so this hook WILL fire on it. 21-16
  // already writes that report's COACHED_SESSION row at 0.40. Without this skip
  // the same session contributes 1.00 + 0.40 = 1.40 and OUTWEIGHS an unaided
  // session's 1.00 — inverting the locked ordering in /mastery, the phase's
  // headline output.
  //
  // The idempotence guard below does NOT cover this: it keys on
  // sourceReportId AND source "LIVE_SESSION", so a pre-existing COACHED_SESSION
  // row for the same report does not suppress it. This is a separate, earlier,
  // UNCONDITIONAL check, not a fallback.
  const coached = await prisma.coachedSession.findFirst({
    where: { reportId },
    select: { id: true },
  });
  if (coached) {
    console.info("Mastery live ingestion skipped: coached session", {
      reportId,
      coachedSessionId: coached.id,
    });
    return { written: 0, skipped: "coached-session" };
  }

  // IDEMPOTENCE SECOND, still before any mapping work: `runAndPersistEvaluation`
  // is retryable (`lib/report/handlers.ts` calls it again on retry), so a
  // second pass WILL happen in production, and 21-03 added no unique
  // constraint for it. The guard lives here.
  const existing = await prisma.masteryContribution.findFirst({
    where: { sourceReportId: reportId, source: "LIVE_SESSION" },
    select: { id: true },
  });
  if (existing) {
    console.info("Mastery live ingestion skipped: already ingested", {
      reportId,
    });
    return { written: 0, skipped: "already-ingested" };
  }

  const mapped = await contributionsFromReport({
    userId: report.userId,
    reportId,
    source: "LIVE_SESSION",
    occurredAt: report.startedAt,
  });

  console.info("Mastery live ingestion mapping", {
    reportId,
    nullDimensionCount: mapped.nullDimensions.length,
    unmappedDimensionCount: mapped.unmappedDimensions.length,
    unmappedDimensions: mapped.unmappedDimensions,
  });

  const written = await recordContributions(mapped.inputs);

  return { written, skipped: null };
}
