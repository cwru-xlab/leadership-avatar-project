/**
 * Pre-Phase-23 paths that the student never started can be rebuilt in the
 * current learn → drill → rework → prove shape. A plan otherwise has exactly
 * one path and POST /path never replaces it, so without this a path that
 * degraded every check to an UNAIDED_SESSION stays a row of identical
 * practice sessions forever.
 *
 * Rebuildable = legacy AND untouched:
 *   - legacy: no VOICE_DRILL step, or more than one UNAIDED_SESSION step;
 *   - untouched: every step PENDING, no coached session, no drill attempt,
 *     and no attempt on any of its knowledge checks.
 * Nothing the student did is lost: no mastery row can point at such a path.
 */
import { prisma } from "@/lib/prisma";

export function isLegacyPathShape(kinds: ReadonlyArray<string>): boolean {
  return !kinds.includes("VOICE_DRILL") || kinds.filter((k) => k === "UNAIDED_SESSION").length > 1;
}

/** True when the path is legacy-shaped and the student has not started it. */
export async function isRebuildablePath(pathId: string): Promise<boolean> {
  const steps = await prisma.studyPlanPathStep.findMany({
    where: { pathId },
    select: {
      kind: true,
      status: true,
      knowledgeCheckId: true,
      coachedSession: { select: { id: true } },
      voiceDrill: { select: { _count: { select: { attempts: true } } } },
    },
  });
  if (steps.length === 0 || !isLegacyPathShape(steps.map((s) => s.kind))) return false;
  if (!steps.every((s) => s.status === "PENDING" && !s.coachedSession)) return false;
  if (!steps.every((s) => (s.voiceDrill?._count.attempts ?? 0) === 0)) return false;
  const checkIds = steps.flatMap((s) => (s.knowledgeCheckId ? [s.knowledgeCheckId] : []));
  if (checkIds.length === 0) return true;
  const attempts = await prisma.knowledgeCheckAttempt.count({
    where: { knowledgeCheckId: { in: checkIds } },
  });
  return attempts === 0;
}
