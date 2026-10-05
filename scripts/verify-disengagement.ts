/**
 * Proves the dependency-free Phase 18 disengagement primitive using fixed
 * fixtures only. Run: npx tsx scripts/verify-disengagement.ts
 */
import { readFileSync } from "node:fs";
import {
  computeDisengagement,
  extractDisengagementSignals,
} from "../lib/engine/disengagement";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function signals({
  elapsedSeconds = 30,
  budgetSeconds = 600,
  assistantTurnCount = 2,
  studentMessages = [
    "I want to learn how to make this proposal more concrete.",
  ],
  priorValue = 0,
  commonGroundAbsent = false,
}: Partial<{
  elapsedSeconds: number;
  budgetSeconds: number | null;
  assistantTurnCount: number;
  studentMessages: string[];
  priorValue: number;
  commonGroundAbsent: boolean;
}> = {}) {
  return extractDisengagementSignals({
    transcript: studentMessages.map((content) => ({ role: "user", content })),
    elapsedSeconds,
    budgetSeconds,
    assistantTurnCount,
    priorValue,
    commonGroundAbsent,
  });
}

const healthySignals = signals();
const healthy = computeDisengagement({
  signals: healthySignals,
  threshold: 0.5,
});
const extremeSignals = signals({
  elapsedSeconds: 1_200,
  budgetSeconds: 600,
  assistantTurnCount: 12,
  studentMessages: ["no", "no", "no"],
  commonGroundAbsent: true,
});
const extreme = computeDisengagement({
  signals: extremeSignals,
  threshold: 0.5,
});

console.log("\n1. Opt-out threshold behavior");
{
  const optedOut = computeDisengagement({
    signals: extremeSignals,
    threshold: null,
  });
  check(
    "a null threshold never crosses under extreme observable pressure",
    optedOut.crossed === false,
    JSON.stringify(optedOut),
  );

  const omitted = computeDisengagement({ signals: extremeSignals });
  check(
    "an omitted threshold never crosses under extreme observable pressure",
    omitted.crossed === false,
    JSON.stringify(omitted),
  );
}

console.log("\n2. Observable pressure signals");
{
  const budgetOverrun = computeDisengagement({
    signals: signals({ elapsedSeconds: 900 }),
    threshold: 0.5,
  });
  const longExchange = computeDisengagement({
    signals: signals({ assistantTurnCount: 12 }),
    threshold: 0.5,
  });
  const repeated = computeDisengagement({
    signals: signals({
      studentMessages: [
        "I need funding for a student leadership program this semester.",
        "I need funding for a student leadership program this semester.",
      ],
    }),
    threshold: 0.5,
  });
  const stalled = computeDisengagement({
    signals: signals({ studentMessages: ["no", "idk", "whatever"] }),
    threshold: 0.5,
  });
  const noCommonGround = computeDisengagement({
    signals: signals({ commonGroundAbsent: true }),
    threshold: 0.5,
  });

  check(
    "budget overrun raises value above a healthy fixture",
    budgetOverrun.value > healthy.value,
  );
  check(
    "assistant-turn pressure raises value above a healthy fixture",
    longExchange.value > healthy.value,
  );
  check(
    "near-duplicate student responses raise value above a healthy fixture",
    repeated.value > healthy.value,
  );
  check(
    "short-response streak raises value above a healthy fixture",
    stalled.value > healthy.value,
  );
  check(
    "known absence of common ground raises value above a healthy fixture",
    noCommonGround.value > healthy.value,
  );
}

console.log("\n3. Determinism and one-way ratchet");
{
  const repeated = computeDisengagement({
    signals: extremeSignals,
    threshold: 0.5,
  });
  check(
    "same input produces byte-identical output",
    JSON.stringify(extreme) === JSON.stringify(repeated),
    `${JSON.stringify(extreme)} != ${JSON.stringify(repeated)}`,
  );

  const ratcheted = computeDisengagement({
    signals: signals({ priorValue: 0.4 }),
    threshold: 0.5,
  });
  check(
    "prior value prevents disengagement from decreasing",
    ratcheted.value >= 0.4,
    JSON.stringify(ratcheted),
  );
}

console.log("\n4. Threshold and episode contract");
{
  const crossing = computeDisengagement({
    signals: extremeSignals,
    threshold: 0.5,
  });
  const crossEpisode = crossing.episodes.find(
    (episode) => episode.kind === "disengagement_cross",
  );
  check(
    "high observable pressure crosses an enabled threshold",
    crossing.crossed === true,
    JSON.stringify(crossing),
  );
  check(
    "a newly crossed threshold emits a session-clock cross episode",
    crossEpisode !== undefined &&
      crossEpisode.start_s === extremeSignals.elapsedSeconds &&
      crossEpisode.end_s === extremeSignals.elapsedSeconds &&
      crossEpisode.causes.length > 0,
    JSON.stringify(crossEpisode),
  );
  check(
    "all episode causes remain in the closed vocabulary",
    crossing.episodes.every((episode) =>
      episode.causes.every((cause) =>
        [
          "budget_pressure",
          "turn_count_pressure",
          "repeated_response",
          "short_response_streak",
          "no_common_ground",
        ].includes(cause),
      ),
    ),
    JSON.stringify(crossing.episodes),
  );
  check(
    "this plan does not apply cue-shaped acceleration in its fixtures",
    computeDisengagement({ signals: extremeSignals, threshold: 0.5 }).value ===
      crossing.value,
    JSON.stringify(crossing),
  );
}

console.log("\n5. Dependency boundary");
{
  const source = readFileSync(
    new URL("../lib/engine/disengagement.ts", import.meta.url),
    "utf8",
  );
  check(
    "the primitive contains no model, network, or database dependency markers",
    !/\b(?:fetch|OpenAI|prisma)\b/i.test(source),
    "found a forbidden dependency marker",
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
