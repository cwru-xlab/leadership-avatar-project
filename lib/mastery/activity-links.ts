/**
 * Resolves the activities named in a mastery result's "what moved it" lists
 * into student-facing links: a live session to its report, a knowledge-check
 * attempt to its check page, a coached session to its study-plan step, a
 * voice-drill attempt to its drill step.
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
import { routes } from "@/lib/routes";

import type { MasteryResult, WindowDriver } from "@/lib/mastery/compute";
import {
  activityKeyForDriver,
  type ActivityLink,
} from "@/lib/mastery/mastery-dto";

export async function resolveActivityLinks(
  userId: string,
  result: MasteryResult
): Promise<Map<string, ActivityLink>> {
  return resolveDriverLinks(
    userId,
    result.competencies.flatMap((c) => c.windowDrivers)
  );
}

export async function resolveDriverLinks(
  userId: string,
  drivers: ReadonlyArray<WindowDriver>
): Promise<Map<string, ActivityLink>> {
  const reportIds = new Set<string>();
  const attemptIds = new Set<string>();
  const coachedIds = new Set<string>();
  const drillAttemptIds = new Set<string>();

  for (const driver of drivers) {
    if (driver.sourceReportId) reportIds.add(driver.sourceReportId);
    else if (driver.sourceAttemptId) attemptIds.add(driver.sourceAttemptId);
    else if (driver.sourceCoachedSessionId) coachedIds.add(driver.sourceCoachedSessionId);
    else if (driver.sourceVoiceDrillAttemptId) drillAttemptIds.add(driver.sourceVoiceDrillAttemptId);
  }

  const [reports, attempts, coached, drillAttempts] = await Promise.all([
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
    drillAttemptIds.size
      ? prisma.voiceDrillAttempt.findMany({
          where: { id: { in: [...drillAttemptIds] }, userId },
          select: {
            id: true,
            voiceDrill: {
              select: {
                pathStepId: true,
                pathStep: { select: { path: { select: { studyPlanId: true } } } },
              },
            },
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
        href: routes.report(report.id),
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

  for (const attempt of drillAttempts) {
    const key = activityKeyForDriver({
      sourceReportId: null,
      sourceAttemptId: null,
      sourceCoachedSessionId: null,
      sourceVoiceDrillAttemptId: attempt.id,
    });
    if (key) {
      links.set(key, {
        href: `/study-plans/${attempt.voiceDrill.pathStep.path.studyPlanId}/drills/${attempt.voiceDrill.pathStepId}`,
        label: "Voice drill",
      });
    }
  }

  return links;
}
