/**
 * Delete pre-Phase-23 study-plan paths that the student never started, so
 * the plan shows up again in the /paths picker and regenerates in the
 * current learn → drill → rework → prove shape.
 *
 * Why: a plan has exactly one path and POST /path never replaces it. Paths
 * generated before Phase 23 degraded a failed check to an UNAIDED_SESSION,
 * so some read as a row of identical practice sessions with no drills.
 *
 * A path is reset ONLY when it is BOTH:
 *   - legacy: no VOICE_DRILL step, or more than one UNAIDED_SESSION step;
 *   - untouched: every step PENDING, no coached session, no drill attempt,
 *     and no attempt on any of its knowledge checks.
 * Nothing the student did is lost: no mastery row can point at such a path.
 *
 * DRY RUN BY DEFAULT. Pass `--apply` to delete.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/reset-untouched-legacy-paths.ts
 *   npx tsx --env-file=.env.local scripts/reset-untouched-legacy-paths.ts --apply
 */
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }

  const paths = await prisma.studyPlanPath.findMany({
    select: {
      id: true,
      studyPlanId: true,
      userId: true,
      steps: {
        select: {
          kind: true,
          status: true,
          knowledgeCheckId: true,
          coachedSession: { select: { id: true } },
          voiceDrill: { select: { _count: { select: { attempts: true } } } },
        },
      },
    },
  });

  const resettable: string[] = [];
  for (const path of paths) {
    const kinds = path.steps.map((s) => s.kind);
    const legacy =
      !kinds.includes("VOICE_DRILL") || kinds.filter((k) => k === "UNAIDED_SESSION").length > 1;
    if (!legacy) continue;

    const checkIds = path.steps.flatMap((s) => (s.knowledgeCheckId ? [s.knowledgeCheckId] : []));
    const checkAttempts = checkIds.length
      ? await prisma.knowledgeCheckAttempt.count({ where: { knowledgeCheckId: { in: checkIds } } })
      : 0;
    const untouched =
      path.steps.every((s) => s.status === "PENDING" && !s.coachedSession) &&
      path.steps.every((s) => (s.voiceDrill?._count.attempts ?? 0) === 0) &&
      checkAttempts === 0;

    console.log(
      `  plan ${path.studyPlanId} [${kinds.map((k) => k[0]).join("")}] ` +
        (untouched ? "untouched → reset" : "has progress → kept"),
    );
    if (untouched) resettable.push(path.id);
  }

  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"}: ${resettable.length} of ${paths.length} path(s) resettable.`);
  if (APPLY && resettable.length) {
    const { count } = await prisma.studyPlanPath.deleteMany({ where: { id: { in: resettable } } });
    console.log(`Deleted ${count} path(s); their plans can now generate a fresh path.`);
  } else if (!APPLY) {
    console.log("Dry run — nothing deleted. Re-run with --apply to delete.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
