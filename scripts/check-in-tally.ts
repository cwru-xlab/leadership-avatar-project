/**
 * Calibration tally for the report check-in (`lib/report/check-in.ts`).
 *
 * Every visual flag the check-in asks about rests on an UNTUNED threshold.
 * This counts, per flag, how often students answered "Yes", "No" and each
 * "Something else" reason, so a later pass can see which detectors are
 * mostly wrong and tune them.
 *
 * READ-ONLY and ANONYMOUS: it selects only the `visualMetrics` column, never
 * a user id, email, report id, title or timestamp, and prints only counts.
 * Admin tooling: run it from a trusted shell, not a route.
 *
 * Run:
 *   npx tsx scripts/check-in-tally.ts           # table
 *   npx tsx scripts/check-in-tally.ts --json    # machine-readable
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

const BATCH = 200;

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { asStoredCheckIn, CHECK_IN_ANSWERS, CHECK_IN_FLAG_IDS, CHECK_IN_FLAGS, STORED_CHECK_IN_KEY } = await import(
    "../lib/report/check-in"
  );
  const prisma = new PrismaClient();

  type Row = { answered: number; yes: number; no: number; other: number; reasons: Record<string, number> };
  const tally = Object.fromEntries(
    CHECK_IN_FLAG_IDS.map((id) => [
      id,
      {
        answered: 0,
        yes: 0,
        no: 0,
        other: 0,
        reasons: Object.fromEntries(CHECK_IN_FLAGS[id].otherOptions.map((option) => [option.id, 0])),
      } satisfies Row,
    ]),
  ) as Record<(typeof CHECK_IN_FLAG_IDS)[number], Row>;

  let reportsWithAnswers = 0;
  let cursor: string | undefined;
  try {
    for (;;) {
      // Cursor on id for paging only; ids are never printed.
      const rows = await prisma.interactionReport.findMany({
        where: { status: "READY", cameraMode: "ON" },
        select: { id: true, visualMetrics: true },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;

      for (const row of rows) {
        const stored = row.visualMetrics;
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
        const answers = asStoredCheckIn((stored as Record<string, unknown>)[STORED_CHECK_IN_KEY]);
        const entries = Object.entries(answers);
        if (entries.length === 0) continue;
        reportsWithAnswers += 1;
        for (const [flag, entry] of entries) {
          if (!entry) continue;
          const bucket = tally[flag as keyof typeof tally];
          bucket.answered += 1;
          bucket[entry.answer] += 1;
          if (entry.answer === "other" && entry.reason) bucket.reasons[entry.reason] += 1;
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ reportsWithAnswers, flags: tally }, null, 2));
    return;
  }

  console.log(`Reports with at least one check-in answer: ${reportsWithAnswers}\n`);
  for (const id of CHECK_IN_FLAG_IDS) {
    const row = tally[id];
    const share = (n: number) => (row.answered ? ` (${Math.round((n / row.answered) * 100)}%)` : "");
    console.log(`${id}: ${row.answered} answered`);
    for (const answer of CHECK_IN_ANSWERS) {
      console.log(`  ${answer.padEnd(5)} ${String(row[answer]).padStart(5)}${share(row[answer])}`);
    }
    for (const option of CHECK_IN_FLAGS[id].otherOptions) {
      console.log(`    other: ${option.label.padEnd(42)} ${String(row.reasons[option.id]).padStart(5)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
