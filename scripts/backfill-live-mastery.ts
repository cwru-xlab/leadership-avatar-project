/**
 * Backfill LIVE_SESSION mastery contributions for every READY
 * `InteractionReport` that predates the Phase 21 ingestion hook.
 *
 * Why: `lib/engine/evaluation-runner.ts` only ingests a report at the moment
 * it turns READY. Every report evaluated before that hook existed has no
 * ledger rows, so /mastery reads "Not yet measured" for students whose
 * practice is all historical.
 *
 * This script adds NO second ingestion path. It calls the one live writer,
 * `recordLiveSessionContributions` (lib/mastery/from-report.ts), for each
 * READY report. That writer already:
 *   - skips coached-session reports (the locked LIVE > COACHED ordering);
 *   - skips reports that already have LIVE_SESSION rows (idempotent — this
 *     script is safe to re-run);
 *   - stamps `occurredAt` from the report's `startedAt`, so a backfilled
 *     session lands in the window it actually happened in;
 *   - snapshots the weight at write time.
 *
 * DRY RUN BY DEFAULT. Pass `--apply` to write.
 *
 * Run (local only):
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-live-mastery.ts          # dry run
 *   npx tsx scripts/backfill-live-mastery.ts --apply  # write
 */
import { prisma } from "../lib/prisma";
import { recordLiveSessionContributions } from "../lib/mastery/from-report";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }

  const before = await prisma.masteryContribution.count({
    where: { source: "LIVE_SESSION" },
  });

  const reports = await prisma.interactionReport.findMany({
    where: { status: "READY" },
    select: { id: true, typeSlug: true },
    orderBy: { startedAt: "asc" },
  });

  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"}: ${reports.length} READY report(s); ` +
      `${before} LIVE_SESSION contribution row(s) before.`,
  );

  const totals = {
    ingested: 0,
    rows: 0,
    alreadyIngested: 0,
    coached: 0,
    noScores: 0,
    failed: 0,
  };
  const byType = new Map<string, { reports: number; rows: number }>();
  const unmapped = new Map<string, number>();

  // Silence the writer's per-report console.info; this script prints totals.
  const originalInfo = console.info;
  console.info = () => {};

  try {
    for (const report of reports) {
      try {
        const result = await recordLiveSessionContributions({
          reportId: report.id,
          dryRun: !APPLY,
        });

        if (result.skipped === "already-ingested") {
          totals.alreadyIngested += 1;
          continue;
        }
        if (result.skipped === "coached-session") {
          totals.coached += 1;
          continue;
        }

        for (const key of result.unmappedDimensions ?? []) {
          const tag = `${report.typeSlug}:${key}`;
          unmapped.set(tag, (unmapped.get(tag) ?? 0) + 1);
        }

        const rows = APPLY ? result.written : (result.mappedInputCount ?? 0);
        if (rows === 0) {
          totals.noScores += 1;
          continue;
        }

        totals.ingested += 1;
        totals.rows += rows;
        const entry = byType.get(report.typeSlug) ?? { reports: 0, rows: 0 };
        entry.reports += 1;
        entry.rows += rows;
        byType.set(report.typeSlug, entry);
      } catch (error) {
        totals.failed += 1;
        console.error(`  report ${report.id} failed:`, error);
      }
    }
  } finally {
    console.info = originalInfo;
  }

  const verb = APPLY ? "wrote" : "would write";
  console.log(`\nReports ingested: ${totals.ingested} (${verb} ${totals.rows} row(s))`);
  for (const [type, entry] of [...byType].sort()) {
    console.log(`  ${type.padEnd(24)} ${entry.reports} report(s), ${entry.rows} row(s)`);
  }
  console.log(`Skipped — already ingested: ${totals.alreadyIngested}`);
  console.log(`Skipped — coached session:  ${totals.coached}`);
  console.log(`Skipped — no mappable scores: ${totals.noScores}`);
  console.log(`Failed: ${totals.failed}`);

  if (unmapped.size > 0) {
    console.log("\nUNMAPPED rubric dimensions (scored but no competency — NOT counted):");
    for (const [tag, count] of [...unmapped].sort()) {
      console.log(`  ${tag} x${count}`);
    }
  } else {
    console.log("\nUnmapped rubric dimensions: none");
  }

  const after = await prisma.masteryContribution.count({
    where: { source: "LIVE_SESSION" },
  });
  console.log(`\nLIVE_SESSION contribution rows: before ${before}, after ${after}.`);
  if (!APPLY) console.log("Dry run — nothing written. Re-run with --apply to write.");

  if (totals.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
