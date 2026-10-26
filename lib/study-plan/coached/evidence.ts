/**
 * Scored-evidence index for coached-step placement (22-04).
 *
 * WHY THIS EXISTS: `next-step.ts` once composed "has no scored evidence yet"
 * (NONE-tier base reason) with "This coached session reworks a moment where it
 * showed" in the same sentence, observed verbatim in the browser. The two
 * halves came from different sources: the availability guard tested whether
 * MOMENTS exist (historical reports), while the NONE tier comes from the
 * `MasteryContribution` ledger, which is empty for every historical report
 * (backfill is deferred).
 *
 * This module reads the evaluator's per-session scores (`InteractionReport.scores`)
 * on the plan's OWN source reports -- evidence that exists today even though the
 * ledger is empty -- so a coached step is only placed on a competency those
 * sessions actually scored. The dimension -> competency mapping is the single
 * REQ-124 mapping in `contributionInputsFromScoreMap`; it is never re-derived
 * here.
 */
import { prisma } from "@/lib/prisma";
import { asScoreMap } from "@/lib/report/snapshot";
import { contributionInputsFromScoreMap } from "@/lib/mastery/from-report";
import type { CompetencyKey } from "@/lib/mastery/competencies";

export interface CoachedEvidence {
  competencyKey: CompetencyKey;
  /** Lowest per-report score for the competency, as a whole percent. */
  lowestPercent: number;
  /** Ids of the source reports that scored this competency. */
  scoredReportIds: string[];
}

/** PURE: no database. Exercised directly by scripts/verify-next-step.ts. */
export function coachedEvidenceFromReports(
  reports: ReadonlyArray<{
    id: string;
    userId: string;
    scores: unknown;
    createdAt: Date;
  }>,
): Map<CompetencyKey, CoachedEvidence> {
  const out = new Map<CompetencyKey, CoachedEvidence>();

  for (const report of reports) {
    const scores = asScoreMap(report.scores);
    if (!scores) continue;

    const { inputs } = contributionInputsFromScoreMap({
      scores,
      userId: report.userId,
      // Placeholder source: this is a read-only computation that writes
      // nothing, exactly like runtime.ts's replay-target selection.
      source: "COACHED_SESSION",
      occurredAt: report.createdAt,
      sourceReportId: report.id,
    });

    for (const input of inputs) {
      const percent = Math.round(input.rawScore * 100);
      const existing = out.get(input.competencyKey);
      if (existing) {
        existing.lowestPercent = Math.min(existing.lowestPercent, percent);
        existing.scoredReportIds.push(report.id);
      } else {
        out.set(input.competencyKey, {
          competencyKey: input.competencyKey,
          lowestPercent: percent,
          scoredReportIds: [report.id],
        });
      }
    }
  }

  return out;
}

/** Ownership is enforced in the WHERE clause (userId), READY reports only. */
export async function loadCoachedEvidence(
  userId: string,
  reportIds: string[],
): Promise<Map<CompetencyKey, CoachedEvidence>> {
  if (reportIds.length === 0) return new Map();
  const reports = await prisma.interactionReport.findMany({
    where: { id: { in: reportIds }, userId, status: "READY" },
    select: { id: true, userId: true, scores: true, createdAt: true },
  });
  return coachedEvidenceFromReports(reports);
}
