/**
 * Bulk version of the student-facing "Rebuild this path" action: deletes
 * every pre-Phase-23 path that its student never started, so each plan
 * regenerates in the current shape. The rule lives in
 * lib/study-plan/legacy-path.ts (`isRebuildablePath`).
 *
 * DRY RUN BY DEFAULT. Pass `--apply` to delete.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/reset-untouched-legacy-paths.ts
 *   npx tsx --env-file=.env.local scripts/reset-untouched-legacy-paths.ts --apply
 */
import { prisma } from "../lib/prisma";
import { isRebuildablePath } from "../lib/study-plan/legacy-path";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }

  const paths = await prisma.studyPlanPath.findMany({ select: { id: true, studyPlanId: true } });
  const resettable: string[] = [];
  for (const path of paths) {
    if (await isRebuildablePath(path.id)) {
      console.log(`  plan ${path.studyPlanId}: legacy and untouched → reset`);
      resettable.push(path.id);
    }
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
