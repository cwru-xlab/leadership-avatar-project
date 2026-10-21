/**
 * Battery for the per-plan interview selection added to
 * `app/api/study-plans/generate/route.ts` (quick-005).
 *
 * Section 1 (PURE SHAPE) runs with NO environment variables and no network
 * access: it proves `buildAnonymousReports`'s output carries only
 * `AnonymousBehavioralReport`'s four fields — no report id, no transcript
 * text, no student name — even when the input row carries extra fields.
 *
 * Section 2 (DATABASE, END TO END) needs a database and prints an explicit
 * SKIP — never a silent pass — when `DATABASE_URL` is unset. When it IS set,
 * it runs `selectReportsForPlan` against real `User` / `InteractionReport`
 * rows: ownership scoping, the over-cap refusal, the ineligible-selection
 * refusal, the recent-N default (with considered/eligible counts), and the
 * still-reachable MAX_SOURCE_REPORTS 413 on a direct (no-selection) call.
 *
 * Run: npx tsx scripts/verify-study-plan-selection.ts
 */
import { randomUUID } from "node:crypto";

import {
  buildAnonymousReports,
  MAX_REPORTS_PER_PLAN,
  selectReportsForPlan,
  type SelectedReportRow,
} from "../app/api/study-plans/generate/route";

let checks = 0;
let failures = 0;

function check(name: string, pass: boolean, detail?: unknown) {
  checks += 1;
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

function skip(name: string) {
  console.log(`  SKIP ${name}`);
}

// ---------------------------------------------------------------------------
// Section 1: PURE SHAPE (buildAnonymousReports — no DB, no network)
// ---------------------------------------------------------------------------

console.log("Section 1: pure shape (buildAnonymousReports)");

{
  // The input row deliberately carries fields beyond SelectedReportRow's
  // declared shape (id, studentName) to prove they do NOT leak through.
  const rows = [
    {
      id: "report-secret-id",
      scores: { content: 4, behavioral: 3 },
      reportMarkdown: "**Ownership:** Strong — took responsibility for the miss.",
      studentName: "Alice Johnson",
      transcript: "This is private transcript text that must never appear.",
    } as unknown as SelectedReportRow,
  ];

  const reports = buildAnonymousReports(rows);

  check("exactly one report produced", reports.length === 1, reports.length);

  const [report] = reports;
  const ownKeys = Object.keys(report).sort();
  check(
    "output's own keys are EXACTLY reportNumber, contentScore, behavioralScore, behavioralFeedbackSignals",
    JSON.stringify(ownKeys) ===
      JSON.stringify(
        ["behavioralFeedbackSignals", "behavioralScore", "contentScore", "reportNumber"].sort(),
      ),
    ownKeys,
  );

  const json = JSON.stringify(reports);
  check("report-secret-id (the row id) appears NOWHERE in the serialized output", !json.includes("report-secret-id"));
  check("the student's name appears NOWHERE in the serialized output", !json.includes("Alice Johnson"));
  check(
    "transcript text appears NOWHERE in the serialized output",
    !json.includes("This is private transcript text"),
  );

  // INVERTED ASSERTION — prove the "own keys" check actually bites by
  // constructing a deliberately widened object and confirming it fails the
  // same comparison this check relies on.
  const widened = { ...report, extra: "leak" };
  const widenedKeys = Object.keys(widened).sort();
  check(
    "INVERTED: a widened object (reportNumber/contentScore/behavioralScore/behavioralFeedbackSignals/extra) correctly FAILS the exact-four-keys comparison",
    JSON.stringify(widenedKeys) !==
      JSON.stringify(
        ["behavioralFeedbackSignals", "behavioralScore", "contentScore", "reportNumber"].sort(),
      ),
  );
}

{
  // Ordinal assignment: reportNumber follows array order, 1-indexed.
  const rows: SelectedReportRow[] = [
    { id: "r1", scores: { content: 1 }, reportMarkdown: "" },
    { id: "r2", scores: { content: 2 }, reportMarkdown: "" },
    { id: "r3", scores: { content: 3 }, reportMarkdown: "" },
  ];
  const reports = buildAnonymousReports(rows);
  check(
    "reportNumber follows input order, 1-indexed",
    reports.map((r) => r.reportNumber).join(",") === "1,2,3",
    reports.map((r) => r.reportNumber),
  );
}

check(`MAX_REPORTS_PER_PLAN is the declared cap of 10`, MAX_REPORTS_PER_PLAN === 10, MAX_REPORTS_PER_PLAN);

// ---------------------------------------------------------------------------
// Section 2: DATABASE, END TO END (selectReportsForPlan)
// ---------------------------------------------------------------------------

console.log("\nSection 2: database, end to end (selectReportsForPlan)");

async function runSection2() {
  if (!process.env.DATABASE_URL) {
    skip("ALL database-backed selection assertions (no DATABASE_URL set)");
    return;
  }

  const { prisma } = await import("../lib/prisma");

  const emailA = `plan-selection-verify-a-${randomUUID()}@example.com`;
  const emailB = `plan-selection-verify-b-${randomUUID()}@example.com`;
  let userAId = "";
  let userBId = "";
  const createdReportIds: string[] = [];

  async function makeReport(opts: {
    userId: string;
    status?: "READY" | "IN_PROGRESS" | "PENDING" | "FAILED";
    typeSlug?: string;
    reportMarkdown?: string | null;
    completedAt?: Date;
    content?: number;
    behavioral?: number;
  }) {
    const row = await prisma.interactionReport.create({
      data: {
        userId: opts.userId,
        typeSlug: opts.typeSlug ?? "general",
        status: opts.status ?? "READY",
        reportMarkdown: opts.reportMarkdown === undefined ? "**Ownership:** Strong." : opts.reportMarkdown,
        completedAt: opts.completedAt ?? new Date(),
        scores: { content: opts.content ?? 3, behavioral: opts.behavioral ?? 3 } as unknown as object,
      },
    });
    createdReportIds.push(row.id);
    return row;
  }

  try {
    const userA = await prisma.user.create({
      data: { email: emailA, name: "Plan Selection Verify A", role: "STUDENT" },
    });
    userAId = userA.id;
    const userB = await prisma.user.create({
      data: { email: emailB, name: "Plan Selection Verify B", role: "STUDENT" },
    });
    userBId = userB.id;

    // ---- 2a. Ownership: B's report id supplied directly by A is NOT included ----
    console.log("\n2a. Ownership — a foreign report id is refused, never silently dropped into the result");
    {
      const reportA = await makeReport({ userId: userAId });
      const reportB = await makeReport({ userId: userBId });

      const outcome = await selectReportsForPlan(userAId, [reportA.id, reportB.id]);

      check(
        "A requesting A's + B's report ids is REFUSED (not silently narrowed to just A's)",
        outcome.ok === false,
        outcome,
      );
      if (!outcome.ok) {
        check("refusal status is 400 (named ineligibility, not a 5xx)", outcome.status === 400, outcome.status);
        check("refusal message names a count of ineligible interviews", /not eligible/.test(outcome.error), outcome.error);
      }

      // INVERTED — prove the ownership check actually bites: A requesting
      // ONLY her own report succeeds and B's id is correctly absent from
      // what WOULD be a passing case, by constructing the comparison
      // directly.
      const onlyOwn = await selectReportsForPlan(userAId, [reportA.id]);
      check("A requesting ONLY her own report succeeds", onlyOwn.ok === true, onlyOwn);
      if (onlyOwn.ok) {
        check(
          "the returned row set contains exactly A's report, never B's",
          onlyOwn.eligibleRows.length === 1 && onlyOwn.eligibleRows[0].id === reportA.id,
          onlyOwn.eligibleRows.map((r) => r.id),
        );
      }
    }

    // ---- 2b. Over-cap selection refused, cap named ----
    console.log("\n2b. Over-cap selection refused, with the cap named in the message");
    {
      const reports = [];
      for (let i = 0; i < MAX_REPORTS_PER_PLAN + 1; i += 1) {
        reports.push(await makeReport({ userId: userAId }));
      }
      const outcome = await selectReportsForPlan(userAId, reports.map((r) => r.id));
      check("an (cap + 1)-length selection is refused", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check("refusal status is 400", outcome.status === 400, outcome.status);
        check(
          `refusal message names the cap (${MAX_REPORTS_PER_PLAN})`,
          outcome.error.includes(String(MAX_REPORTS_PER_PLAN)),
          outcome.error,
        );
      }

      // INVERTED — exactly at the cap is NOT refused, proving the boundary
      // is ">", not ">=".
      const atCap = await selectReportsForPlan(userAId, reports.slice(0, MAX_REPORTS_PER_PLAN).map((r) => r.id));
      check("INVERTED: a selection of EXACTLY the cap succeeds (boundary is '>', not '>=')", atCap.ok === true, atCap);
    }

    // ---- 2c. An ineligible selected id (wrong status) is refused, not silently dropped ----
    console.log("\n2c. A selected id that is not eligible (IN_PROGRESS) is refused, not silently dropped");
    {
      const eligible = await makeReport({ userId: userAId });
      const inProgress = await makeReport({ userId: userAId, status: "IN_PROGRESS" });

      const outcome = await selectReportsForPlan(userAId, [eligible.id, inProgress.id]);
      check("a selection including an IN_PROGRESS report is refused", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check("refusal status is 400", outcome.status === 400, outcome.status);
        check("refusal names exactly 1 ineligible interview", outcome.error.includes("1 of the selected"), outcome.error);
      }
    }

    // ---- 2d. No selection -> most recent MAX_REPORTS_PER_PLAN, counts correct ----
    console.log("\n2d. No selection yields the most recent MAX_REPORTS_PER_PLAN, with correct considered/eligible counts");
    {
      // Fresh user so this section's count isn't polluted by 2a-2c's rows.
      const emailC = `plan-selection-verify-c-${randomUUID()}@example.com`;
      const userC = await prisma.user.create({ data: { email: emailC, name: "Plan Selection Verify C", role: "STUDENT" } });

      try {
        const totalReports = MAX_REPORTS_PER_PLAN + 5;
        const rows = [];
        for (let i = 0; i < totalReports; i += 1) {
          // Strictly increasing completedAt — index i is the i-th OLDEST.
          rows.push(
            await makeReport({
              userId: userC.id,
              completedAt: new Date(2026, 0, i + 1),
              content: i,
            }),
          );
        }

        const outcome = await selectReportsForPlan(userC.id, null);
        check("no-selection succeeds when the total is still under MAX_SOURCE_REPORTS", outcome.ok === true, outcome);
        if (outcome.ok) {
          check(
            `consideredReportCount is exactly MAX_REPORTS_PER_PLAN (${MAX_REPORTS_PER_PLAN})`,
            outcome.consideredReportCount === MAX_REPORTS_PER_PLAN,
            outcome.consideredReportCount,
          );
          check(
            `eligibleReportCount is exactly the total created (${totalReports})`,
            outcome.eligibleReportCount === totalReports,
            outcome.eligibleReportCount,
          );
          // The most recent MAX_REPORTS_PER_PLAN are the LAST MAX_REPORTS_PER_PLAN
          // rows pushed (highest i, latest completedAt).
          const expectedIds = new Set(rows.slice(-MAX_REPORTS_PER_PLAN).map((r) => r.id));
          check(
            "every returned row is among the most-recent-by-completedAt set",
            outcome.eligibleRows.every((r) => expectedIds.has(r.id)),
            outcome.eligibleRows.map((r) => r.id),
          );
          check(
            "eligibleRows is ordered oldest-first (matches the ordinal convention)",
            outcome.eligibleRows[0].id === rows[totalReports - MAX_REPORTS_PER_PLAN].id,
            outcome.eligibleRows.map((r) => r.id),
          );
        }
      } finally {
        await prisma.interactionReport.deleteMany({ where: { userId: userC.id } });
        await prisma.user.deleteMany({ where: { id: userC.id } });
      }
    }

    // ---- 2e. MAX_SOURCE_REPORTS's 413 is still reachable on a direct (no-selection) call ----
    console.log("\n2e. MAX_SOURCE_REPORTS's 413 is still reachable on a direct, no-selection call");
    {
      const emailD = `plan-selection-verify-d-${randomUUID()}@example.com`;
      const userD = await prisma.user.create({ data: { email: emailD, name: "Plan Selection Verify D", role: "STUDENT" } });

      try {
        const MAX_SOURCE_REPORTS = 50; // mirrors the route's own constant; not exported (internal to the 413 guard only)
        const rows = [];
        for (let i = 0; i < MAX_SOURCE_REPORTS + 1; i += 1) {
          rows.push(await makeReport({ userId: userD.id, completedAt: new Date(2026, 0, i + 1) }));
        }

        const noSelectionOutcome = await selectReportsForPlan(userD.id, null);
        check(
          "a direct call with NO selection and 51 eligible reports is REFUSED with 413",
          noSelectionOutcome.ok === false && noSelectionOutcome.status === 413,
          noSelectionOutcome,
        );

        // Decision 2's whole point: the SAME account, WITH a selection, now
        // succeeds — the 413 is unreachable through the UI, which always
        // sends a selection.
        const withSelectionOutcome = await selectReportsForPlan(
          userD.id,
          rows.slice(0, MAX_REPORTS_PER_PLAN).map((r) => r.id),
        );
        check(
          "the SAME account, WITH an explicit selection, succeeds — the 413 is bypassed by selection, not by raising the guard",
          withSelectionOutcome.ok === true,
          withSelectionOutcome,
        );
      } finally {
        await prisma.interactionReport.deleteMany({ where: { userId: userD.id } });
        await prisma.user.deleteMany({ where: { id: userD.id } });
      }
    }
  } finally {
    if (createdReportIds.length > 0) {
      await prisma.interactionReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    if (userAId) await prisma.user.deleteMany({ where: { id: userAId } });
    if (userBId) await prisma.user.deleteMany({ where: { id: userBId } });
    await prisma.$disconnect();
  }
}

runSection2()
  .then(() => {
    console.log(`\n${checks} checks run, ${failures} failed.`);
    process.exit(failures > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
