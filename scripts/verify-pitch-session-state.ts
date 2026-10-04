/**
 * Proves plan 14-05: server-authoritative slide high-water mark ratchet,
 * append-only reveal trail, checkpoint divergence, and clamped session budget.
 *
 * Run against LOCAL dev DB only:
 *   DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *     npx tsx scripts/verify-pitch-session-state.ts
 *
 * Sections 3 (backward navigation) and 5 (out-of-range clamp) are load-bearing.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma";
import {
  startSession,
  checkpointSession,
} from "../lib/engine/session";
import {
  getEngineType,
  registerEngineTypeForTests,
} from "../lib/engine/registry";
import type { InteractionTypeConfig, InstanceConfig } from "../lib/engine/types";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const LOCAL_URL = "postgresql://ajabreu79@localhost:5432/leadership_avatar_dev";

function assertLocalDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    console.error(
      "REFUSING TO RUN: DATABASE_URL is not the local dev DB.\n" +
        `Expected host localhost/127.0.0.1. Got: ${url.replace(/:[^:@/]+@/, ":***@")}\n` +
        `Use: DATABASE_URL="${LOCAL_URL}" npx tsx scripts/verify-pitch-session-state.ts`,
    );
    process.exit(2);
  }
}

const DECK_INSTANCE: InstanceConfig = {
  kind: "pitch-deck",
  deckId: "verify-deck-10",
  slideCount: 10,
  slideTexts: Array.from({ length: 10 }, (_, i) => `Slide ${i + 1}`),
  askPriceUsd: 1_000_000,
  askEquityPct: 10,
  fairValueBand: {
    priceUsdMin: 800_000,
    priceUsdMax: 1_200_000,
    equityPctMin: 8,
    equityPctMax: 12,
  },
  proposedSeconds: 1500,
};

/** Minimal stub so this script can run before plan 14-09 lands the real type. */
const PITCH_DECK_STUB: InteractionTypeConfig = {
  slug: "pitch-deck",
  name: "Investor Pitch Deck (14-05 verify stub)",
  description: "Temporary stub for 14-05 session-state verification only.",
  extraRubricDimensions: [],
  prompts: {
    liveSystemPrompt: () => "stub",
    evaluatorPrompt: "stub",
    buildEvaluationContext: () => ({}),
  },
  limits: { targetMinutes: null, targetQuestionCount: null },
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: false,
    avatarEndReasons: [],
  },
  visibleContext: { visibleChannels: "*" },
  outcome: { fields: [] },
  timeBudget: {
    totalSeconds: 1200,
    warnAtRemainingSeconds: 300,
    firstTurnWindowSeconds: null,
    adjustableRangeSeconds: [1200, 1800],
  },
  instance: { required: true, authoredInWizard: true },
  // Decided in 14-05: deck type gets client-driven checkpointing.
  checkpointing: "client-driven",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  setupSteps: [],
};

const TURNS = [
  {
    role: "assistant" as const,
    content: "Welcome.",
    timestamp: Date.now(),
  },
  {
    role: "user" as const,
    content: "Here is slide content.",
    timestamp: Date.now() + 1000,
  },
];

const testEmail = `pitch-session-verify-${randomUUID()}@example.com`;
let userId = "";
const reportIds: string[] = [];

async function cleanup() {
  if (reportIds.length > 0) {
    await prisma.interactionReport.deleteMany({
      where: { id: { in: reportIds } },
    });
  }
  if (userId) {
    await prisma.interactionReport.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
}

async function readMark(reportId: string) {
  return prisma.interactionReport.findUnique({
    where: { id: reportId },
    select: {
      slideHighWaterMark: true,
      slideReveals: true,
      timeBudgetSeconds: true,
    },
  });
}

async function main() {
  assertLocalDb();

  const unregister = registerEngineTypeForTests(PITCH_DECK_STUB);

  try {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: "Pitch Session Verify",
        role: "STUDENT",
      },
    });
    userId = user.id;

    // -------------------------------------------------------------------------
    console.log("\n1. Fresh deck session has slideHighWaterMark === null");
    {
      const started = await startSession({
        userId,
        userEmail: testEmail,
        typeSlug: "pitch-deck",
        instance: DECK_INSTANCE,
        timeBudgetOverrideSeconds: 1500,
      });
      check("startSession ok", started.ok === true, JSON.stringify(started));
      if (!started.ok) throw new Error("cannot continue without deck session");
      reportIds.push(started.reportId);

      const row = await readMark(started.reportId);
      check(
        "slideHighWaterMark === null",
        row?.slideHighWaterMark === null,
        JSON.stringify(row),
      );
    }

    const deckReportId = reportIds[0]!;

    // -------------------------------------------------------------------------
    // Sections 3 and 5 are the load-bearing cases — exercised immediately
    // after the fresh-session null check, then the remaining numbered
    // sections fill in.
    // -------------------------------------------------------------------------
    console.log("\n2. Checkpoint revealedSlideIndex: 3 → mark 3, trail length 1");
    {
      const forward = await checkpointSession({
        userId,
        reportId: deckReportId,
        turns: TURNS,
        revealedSlideIndex: 3,
      });
      check("checkpoint ok", forward.ok === true, JSON.stringify(forward));

      const afterForward = await readMark(deckReportId);
      check(
        "mark === 3",
        afterForward?.slideHighWaterMark === 3,
        JSON.stringify(afterForward),
      );
      check(
        "slideReveals length === 1",
        Array.isArray(afterForward?.slideReveals) &&
          afterForward!.slideReveals!.length === 1,
        JSON.stringify(afterForward?.slideReveals),
      );
    }

    console.log(
      "\n3. Backward navigation does NOT lower the mark (load-bearing)",
    );
    {
      const backward = await checkpointSession({
        userId,
        reportId: deckReportId,
        turns: TURNS,
        revealedSlideIndex: 1,
      });
      check(
        "backward checkpoint ok (not an error)",
        backward.ok === true,
        JSON.stringify(backward),
      );

      const afterBack = await readMark(deckReportId);
      check(
        "mark STAYS 3 after revealedSlideIndex: 1",
        afterBack?.slideHighWaterMark === 3,
        JSON.stringify(afterBack),
      );
      check(
        "trail still has 1 entry (no append on non-advance)",
        Array.isArray(afterBack?.slideReveals) &&
          afterBack!.slideReveals!.length === 1,
        JSON.stringify(afterBack?.slideReveals),
      );
    }

    console.log("\n4. Forward jump to 7 on a 10-slide deck advances mark + trail");
    {
      const toSeven = await checkpointSession({
        userId,
        reportId: deckReportId,
        turns: TURNS,
        revealedSlideIndex: 7,
      });
      check("checkpoint to 7 ok", toSeven.ok === true, JSON.stringify(toSeven));

      const afterSeven = await readMark(deckReportId);
      check(
        "mark === 7",
        afterSeven?.slideHighWaterMark === 7,
        JSON.stringify(afterSeven),
      );
      check(
        "trail has 2 entries",
        Array.isArray(afterSeven?.slideReveals) &&
          afterSeven!.slideReveals!.length === 2,
        JSON.stringify(afterSeven?.slideReveals),
      );
    }

    console.log(
      "\n5. Out-of-range client index is clamped, not accepted (load-bearing)",
    );
    {
      const overshoot = await checkpointSession({
        userId,
        reportId: deckReportId,
        turns: TURNS,
        revealedSlideIndex: 99,
      });
      check(
        "overshoot checkpoint ok (not an error)",
        overshoot.ok === true,
        JSON.stringify(overshoot),
      );

      const afterClamp = await readMark(deckReportId);
      check(
        "mark clamped to 9 (not 99)",
        afterClamp?.slideHighWaterMark === 9,
        JSON.stringify(afterClamp),
      );
      check(
        "trail gained one entry for the clamp advance",
        Array.isArray(afterClamp?.slideReveals) &&
          afterClamp!.slideReveals!.length === 3,
        JSON.stringify(afterClamp?.slideReveals),
      );
    }

    // -------------------------------------------------------------------------
    console.log("\n6. Non-finite / negative / string inputs leave mark unchanged");
    {
      const before = await readMark(deckReportId);
      const markBefore = before?.slideHighWaterMark;
      const trailBefore = Array.isArray(before?.slideReveals)
        ? before!.slideReveals!.length
        : 0;

      for (const bad of [-5, Number.NaN, "4" as unknown]) {
        const result = await checkpointSession({
          userId,
          reportId: deckReportId,
          turns: TURNS,
          revealedSlideIndex: bad,
        });
        check(
          `input ${String(bad)} does not throw (ok=${result.ok})`,
          result.ok === true,
          JSON.stringify(result),
        );
      }

      const after = await readMark(deckReportId);
      check(
        "mark unchanged after bad inputs",
        after?.slideHighWaterMark === markBefore,
        JSON.stringify({ markBefore, after }),
      );
      check(
        "trail unchanged after bad inputs",
        Array.isArray(after?.slideReveals) &&
          after!.slideReveals!.length === trailBefore,
        JSON.stringify(after?.slideReveals),
      );
    }

    // -------------------------------------------------------------------------
    console.log(
      "\n7. Interview session carrying revealedSlideIndex cannot create a cursor",
    );
    {
      const started = await startSession({
        userId,
        userEmail: testEmail,
        typeSlug: "general",
      });
      check("general start ok", started.ok === true, JSON.stringify(started));
      if (!started.ok) throw new Error("general start failed");
      reportIds.push(started.reportId);

      const cp = await checkpointSession({
        userId,
        reportId: started.reportId,
        turns: TURNS,
        revealedSlideIndex: 5,
      });
      check("interview checkpoint ok", cp.ok === true, JSON.stringify(cp));

      const row = await readMark(started.reportId);
      check(
        "slideHighWaterMark stays null",
        row?.slideHighWaterMark === null,
        JSON.stringify(row),
      );
    }

    // -------------------------------------------------------------------------
    console.log("\n8. case-study checkpoint still REJECTED (Phase 13 divergence)");
    {
      // Create a synthetic case-study IN_PROGRESS row without S3 — we only
      // need checkpointSession's type-level rejection.
      const row = await prisma.interactionReport.create({
        data: {
          userId,
          typeSlug: "case-study",
          status: "IN_PROGRESS",
          cameraMode: "OFF",
        },
        select: { id: true },
      });
      reportIds.push(row.id);

      const type = getEngineType("case-study");
      check(
        'case-study checkpointing === "none"',
        type?.checkpointing === "none",
        type?.checkpointing,
      );

      const cp = await checkpointSession({
        userId,
        reportId: row.id,
        turns: TURNS,
        revealedSlideIndex: 2,
      });
      check(
        "checkpoint rejected",
        cp.ok === false && cp.status === 400,
        JSON.stringify(cp),
      );
      check(
        "error names checkpointing",
        cp.ok === false &&
          typeof cp.error === "string" &&
          cp.error.includes("does not support checkpointing"),
        JSON.stringify(cp),
      );
    }

    // -------------------------------------------------------------------------
    console.log("\n9. startSession deck budget clamp (3600→1800, 900→1200, 1500→1500)");
    {
      for (const [override, expected] of [
        [3600, 1800],
        [900, 1200],
        [1500, 1500],
      ] as const) {
        const started = await startSession({
          userId,
          userEmail: testEmail,
          typeSlug: "pitch-deck",
          instance: DECK_INSTANCE,
          timeBudgetOverrideSeconds: override,
        });
        check(
          `start ok for override ${override}`,
          started.ok === true,
          JSON.stringify(started),
        );
        if (!started.ok) continue;
        reportIds.push(started.reportId);
        const row = await readMark(started.reportId);
        check(
          `timeBudgetSeconds === ${expected}`,
          row?.timeBudgetSeconds === expected,
          JSON.stringify(row),
        );
      }
    }

    // -------------------------------------------------------------------------
    console.log(
      "\n10. startSession general with override 3600 → interview budget unchanged",
    );
    {
      const general = getEngineType("general");
      const expected = general?.timeBudget.totalSeconds ?? null;

      const started = await startSession({
        userId,
        userEmail: testEmail,
        typeSlug: "general",
        timeBudgetOverrideSeconds: 3600,
      });
      check("general start ok", started.ok === true, JSON.stringify(started));
      if (started.ok) {
        reportIds.push(started.reportId);
        const row = await readMark(started.reportId);
        check(
          `timeBudgetSeconds === interview total (${expected})`,
          row?.timeBudgetSeconds === expected,
          JSON.stringify({ expected, row }),
        );
      }
    }

    console.log(
      failures === 0
        ? "\nALL PASS\n"
        : `\nFAILED: ${failures} assertion(s)\n`,
    );
  } finally {
    await cleanup().catch((err) => {
      console.error("cleanup error:", err);
    });
    unregister();
    await prisma.$disconnect();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
