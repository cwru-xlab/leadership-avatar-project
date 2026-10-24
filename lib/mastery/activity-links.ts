/**
 * Resolves the activities named in a mastery result's "what moved it" lists
 * into student-facing links: a live session to its report, a knowledge-check
 * attempt to its check page, a coached session to its study-plan step.
 *
 * Kept out of `compute.ts` (which stays pure — no database, no clock) and
 * out of `mastery-dto.ts` (which stays a synchronous mapper). The route calls
 * this, then hands the map to `toMasteryDTO`.
 *
 * Every lookup is scoped by `userId`, so a ledger row can never resolve to
 * another student's report or plan.
 */
import { prisma } from "@/lib/prisma";
import { typeLabelForReport } from "@/lib/report/title";
import type { MasteryResult } from "@/lib/mastery/compute";
import {
  activityKeyForDriver,
  type ActivityLink,
} from "@/lib/mastery/mastery-dto";

export async function resolveActivityLinks(
  userId: string,
  result: MasteryResult
): Promise<Map<string, ActivityLink>> {
  const reportIds = new Set<string>();
  const attemptIds = new Set<string>();
  const coachedIds = new Set<string>();

  for (const competency of result.competencies) {
    for (const driver of competency.windowDrivers) {
      if (driver.sourceReportId) reportIds.add(driver.sourceReportId);
      else if (driver.sourceAttemptId) attemptIds.add(driver.sourceAttemptId);
      else if (driver.sourceCoachedSessionId) coachedIds.add(driver.sourceCoachedSessionId);
    }
  }

  const [reports, attempts, coached] = await Promise.all([
    reportIds.size
      ? prisma.interactionReport.findMany({
          where: { id: { in: [...reportIds] }, userId },
          select: { id: true, typeSlug: true },
        })
      : [],
    attemptIds.size
      ? prisma.knowledgeCheckAttempt.findMany({
          where: { id: { in: [...attemptIds] }, userId },
          select: {
            id: true,
            knowledgeCheck: { select: { id: true, studyPlanId: true } },
          },
        })
      : [],
    coachedIds.size
      ? prisma.coachedSession.findMany({
          where: { id: { in: [...coachedIds] }, userId },
          select: {
            id: true,
            pathStepId: true,
            pathStep: { select: { path: { select: { studyPlanId: true } } } },
          },
        })
      : [],
  ]);

  const links = new Map<string, ActivityLink>();

  for (const report of reports) {
    const key = activityKeyForDriver({
      sourceReportId: report.id,
      sourceAttemptId: null,
      sourceCoachedSessionId: null,
    });
    if (key) {
      links.set(key, {
        href: `/practice/${report.typeSlug}/report/${report.id}`,
        label: `${typeLabelForReport(report.typeSlug)} session`,
      });
    }
  }

  for (const attempt of attempts) {
    const key = activityKeyForDriver({
      sourceReportId: null,
      sourceAttemptId: attempt.id,
      sourceCoachedSessionId: null,
    });
    if (key) {
      links.set(key, {
        href: `/study-plans/${attempt.knowledgeCheck.studyPlanId}/checks/${attempt.knowledgeCheck.id}`,
        label: "Knowledge check",
      });
    }
  }

  for (const session of coached) {
    const key = activityKeyForDriver({
      sourceReportId: null,
      sourceAttemptId: null,
      sourceCoachedSessionId: session.id,
    });
    if (key) {
      links.set(key, {
        href: `/study-plans/${session.pathStep.path.studyPlanId}/coached/${session.pathStepId}`,
        label: "Coached session",
      });
    }
  }

  return links;
}
