/**
 * Proves Phase 14's engine-config extensions (plan 14-02): the avatar-end
 * floor, the soft first-turn window (tail-block only), adjustable budget
 * clamping, and PitchInputSnapshot narrowing — including every negative
 * case. Phase 13's five type records must still reject every avatar end.
 *
 * Run: npx tsx scripts/verify-pitch-engine-extensions.ts
 */
import { resolveTermination } from "../lib/engine/termination";
import {
  computeTimeBudgetState,
  buildTimeBudgetFragment,
  clampAdjustableBudget,
} from "../lib/engine/time-budget";
import { ENGINE_TYPES } from "../lib/engine/registry";
import type { TerminationPolicyConfig, TimeBudgetConfig } from "../lib/engine/types";
import { asInputSnapshot } from "../lib/report/snapshot";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const flooredPolicy: TerminationPolicyConfig = {
  studentMayEnd: true,
  avatarMayEnd: true,
  avatarEndReasons: ["tedious_pitch", "hostile_student"],
  avatarEndFloor: { minAssistantTurns: 2 },
};

console.log("\n1. Floor rejects — assistantTurnCount below minAssistantTurns");
{
  const result = resolveTermination({
    policy: flooredPolicy,
    source: "avatar",
    reason: "tedious_pitch",
    assistantTurnCount: 1,
  });
  check(
    "ok === false and recordedReason === null",
    result.ok === false && result.recordedReason === null,
    JSON.stringify(result),
  );
}

console.log("\n2. Floor admits — assistantTurnCount meets the floor");
{
  const result = resolveTermination({
    policy: flooredPolicy,
    source: "avatar",
    reason: "tedious_pitch",
    assistantTurnCount: 2,
  });
  check(
    "ok === true and recordedReason equals the reason",
    result.ok === true && result.recordedReason === "tedious_pitch",
    JSON.stringify(result),
  );
}

console.log("\n3. Floor fails closed — assistantTurnCount omitted");
{
  const result = resolveTermination({
    policy: flooredPolicy,
    source: "avatar",
    reason: "tedious_pitch",
  });
  check(
    "ok === false when turn count is missing",
    result.ok === false,
    JSON.stringify(result),
  );
}

console.log("\n4. Floor does not loosen the reason vocabulary");
{
  const result = resolveTermination({
    policy: flooredPolicy,
    source: "avatar",
    reason: "made_up_reason",
    assistantTurnCount: 10,
  });
  check(
    "reason outside avatarEndReasons is still rejected",
    result.ok === false && result.recordedReason === null,
    JSON.stringify(result),
  );
}

console.log(
  "\n5. Phase 13 regression — original five types still reject avatar ends",
);
// Phase 14/16 types (pitch-elevator, networking, …) intentionally set
// avatarMayEnd: true. Scope this regression to the five Phase 13 records.
const PHASE_13_SLUGS = new Set([
  "general",
  "technical",
  "consulting",
  "early-career",
  "case-study",
]);
for (const type of ENGINE_TYPES.filter((t) => PHASE_13_SLUGS.has(t.slug))) {
  check(
    `"${type.slug}" ships avatarMayEnd: false`,
    type.terminationPolicy.avatarMayEnd === false,
    JSON.stringify(type.terminationPolicy),
  );
  const result = resolveTermination({
    policy: type.terminationPolicy,
    source: "avatar",
    reason: "tedious_pitch",
    assistantTurnCount: 99,
  });
  check(
    `"${type.slug}" rejects an avatar termination at any turn count`,
    result.ok === false && result.recordedReason === null,
    JSON.stringify(result),
  );
}

console.log("\n6. Soft window math");
{
  const startedAt = new Date("2026-01-01T00:00:00Z");
  const firstTurnStarted = new Date("2026-01-01T00:00:00Z");

  const over = computeTimeBudgetState({
    config: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: 60,
    },
    startedAt,
    now: new Date("2026-01-01T00:01:24Z"), // 84s
    firstTurn: { startedAt: firstTurnStarted },
  });
  check(
    "84s elapsed against a 60s window → overBy === 24",
    over.firstTurnWindow?.overBy === 24 &&
      over.firstTurnWindow.elapsedSeconds === 84,
    JSON.stringify(over.firstTurnWindow),
  );

  const within = computeTimeBudgetState({
    config: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: 60,
    },
    startedAt,
    now: new Date("2026-01-01T00:00:40Z"), // 40s
    firstTurn: { startedAt: firstTurnStarted },
  });
  check(
    "40s elapsed → overBy === 0",
    within.firstTurnWindow?.overBy === 0,
    JSON.stringify(within.firstTurnWindow),
  );

  const none = computeTimeBudgetState({
    config: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: null,
    },
    startedAt,
    now: new Date("2026-01-01T00:01:24Z"),
    firstTurn: { startedAt: firstTurnStarted },
  });
  check(
    "firstTurnWindowSeconds: null → firstTurnWindow === null",
    none.firstTurnWindow === null,
    JSON.stringify(none.firstTurnWindow),
  );
}

console.log("\n7. Soft window is tail-only and never a stop");
{
  // CONTEXT.md: nothing hard-stops the student's turn. The window has no
  // expired flag by design — exceeding it only changes the tail fragment.
  const state = computeTimeBudgetState({
    config: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: 60,
    },
    startedAt: new Date("2026-01-01T00:00:00Z"),
    now: new Date("2026-01-01T00:01:24Z"),
    firstTurn: { startedAt: new Date("2026-01-01T00:00:00Z") },
  });
  const fragment = buildTimeBudgetFragment(state);
  check(
    "84-second case returns a non-empty tail fragment",
    fragment.length > 0,
    fragment,
  );
  check(
    'state has no "hardStop" field a caller could read as stop-the-turn',
    !("hardStop" in state),
    JSON.stringify(state),
  );
  check(
    "firstTurnWindow has no expired flag (soft by construction)",
    state.firstTurnWindow !== null &&
      state.firstTurnWindow !== undefined &&
      !("expired" in state.firstTurnWindow),
    JSON.stringify(state.firstTurnWindow),
  );
}

console.log("\n8. Budget clamping");
{
  const adjustable: TimeBudgetConfig = {
    totalSeconds: 1500,
    warnAtRemainingSeconds: 120,
    adjustableRangeSeconds: [1200, 1800],
  };

  const low = clampAdjustableBudget(adjustable, 900);
  check(
    "900 → 1200 clamped: true",
    low.seconds === 1200 && low.clamped === true,
    JSON.stringify(low),
  );

  const mid = clampAdjustableBudget(adjustable, 1500);
  check(
    "1500 → 1500 clamped: false",
    mid.seconds === 1500 && mid.clamped === false,
    JSON.stringify(mid),
  );

  const high = clampAdjustableBudget(adjustable, 3600);
  check(
    "3600 → 1800 clamped: true",
    high.seconds === 1800 && high.clamped === true,
    JSON.stringify(high),
  );

  const fixed: TimeBudgetConfig = {
    totalSeconds: 600,
    warnAtRemainingSeconds: 60,
  };
  const ignored = clampAdjustableBudget(fixed, 9999);
  check(
    "range absent → type totalSeconds returned, request ignored",
    ignored.seconds === 600 && ignored.clamped === false,
    JSON.stringify(ignored),
  );
}

console.log("\n9. Snapshot narrowing");
{
  const wellFormed = {
    kind: "pitch" as const,
    pitchKind: "elevator" as const,
    pitchSubject: "AI tutoring for rural schools",
    listenerKnowledge: "name-role" as const,
    deckId: null,
    slideCount: null,
    askPriceUsd: null,
    askEquityPct: null,
    fairValueBand: null,
    firstTurnWindowSeconds: 60,
    budgetSeconds: null,
    listenerPersona: "Skeptical angel investor",
  };
  const narrowed = asInputSnapshot(wellFormed);
  check(
    "well-formed pitch snapshot round-trips through asInputSnapshot",
    narrowed !== null &&
      narrowed.kind === "pitch" &&
      narrowed.pitchKind === "elevator" &&
      narrowed.pitchSubject === wellFormed.pitchSubject,
    JSON.stringify(narrowed),
  );

  const incomplete = asInputSnapshot({ kind: "pitch" });
  check(
    '{ kind: "pitch" } with missing required fields returns null',
    incomplete === null,
    JSON.stringify(incomplete),
  );

  const interview = asInputSnapshot({
    kind: "interview",
    interviewerAvatarId: null,
    interviewerName: null,
    resumeId: null,
    resumeText: null,
    industry: null,
    roleTitle: null,
    difficulty: null,
    targetMinutes: null,
    targetQuestionCount: null,
    interviewerPersona: null,
  });
  check(
    "an interview snapshot still narrows to the interview member",
    interview !== null && interview.kind === "interview",
    JSON.stringify(interview),
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
