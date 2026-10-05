/**
 * Proves Phase 18's cue parsing and threshold/floor termination contract with
 * fixed fixtures only. Run: npx tsx scripts/verify-disengagement-termination.ts
 */
import {
  computeDisengagement,
  cueAcceleration,
  extractDisengagementSignals,
  parseDisengagementCue,
} from "../lib/engine/disengagement";
import { parseEngineTurn } from "../lib/engine/turn-control";
import { resolveTermination } from "../lib/engine/termination";
import type {
  ResolvedSessionConfig,
  TerminationPolicyConfig,
} from "../lib/engine/types";
import {
  DECK_DISENGAGEMENT_THRESHOLD,
  PITCH_DECK_TYPE,
} from "../lib/pitch/deck-type";
import {
  ELEVATOR_DISENGAGEMENT_THRESHOLD,
  PITCH_ELEVATOR_TYPE,
} from "../lib/pitch/elevator-type";

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
    "I want to connect this proposal to the listener's stated priorities.",
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

function turnConfig(policy: TerminationPolicyConfig): ResolvedSessionConfig {
  return {
    typeSlug: "pitch-elevator",
    typeName: "Test pitch",
    rubricDimensions: [],
    limits: { targetMinutes: null, targetQuestionCount: null },
    terminationPolicy: policy,
    visibleContext: { visibleChannels: "*" },
    outcome: { fields: [] },
    timeBudget: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: null,
      adjustableRangeSeconds: null,
    },
    instance: { kind: "none" },
    customization: null,
  };
}

console.log("\n1. Cue parsing and acceleration");
{
  const text =
    'I need to head to my next meeting. <engine-cue disengagement="high" /> <engine-end reason="lost_interest" />';
  const parsedCue = parseDisengagementCue(text);
  const parsedTurn = parseEngineTurn(
    text,
    turnConfig(PITCH_ELEVATOR_TYPE.terminationPolicy),
    {
      assistantTurnCount: 2,
      disengagementValue: 1,
    },
  );
  const coldWithCue = computeDisengagement({
    signals: signals(),
    threshold: ELEVATOR_DISENGAGEMENT_THRESHOLD,
    cueAccel: cueAcceleration("high"),
  });

  check(
    "cue parser strips a valid cue before the trailing engine-end marker",
    parsedCue.cue === "high" &&
      parsedCue.cleanedText.includes('<engine-end reason="lost_interest" />') &&
      !parsedCue.cleanedText.includes("engine-cue"),
    JSON.stringify(parsedCue),
  );
  check(
    "turn parser strips both markers and returns a cue separately",
    parsedTurn.disengagementCue === "high" &&
      parsedTurn.termination?.reason === "lost_interest" &&
      parsedTurn.cleanedText === "I need to head to my next meeting.",
    JSON.stringify(parsedTurn),
  );
  check(
    "a high cue from a cold start stays below the elevator threshold",
    coldWithCue.value < ELEVATOR_DISENGAGEMENT_THRESHOLD &&
      coldWithCue.crossed === false,
    JSON.stringify(coldWithCue),
  );
}

console.log("\n2. Signals remain the termination authority");
{
  const mildSignals = signals({
    studentMessages: [
      "I need funding for a campus leadership program this semester.",
      "I need funding for a campus leadership program this semester.",
    ],
  });
  const withoutCue = computeDisengagement({
    signals: mildSignals,
    threshold: 0.4,
  });
  const withCue = computeDisengagement({
    signals: mildSignals,
    threshold: 0.4,
    cueAccel: cueAcceleration("high"),
  });
  const severeSignals = signals({
    elapsedSeconds: 1_200,
    assistantTurnCount: 12,
    studentMessages: ["no", "no", "no"],
    commonGroundAbsent: true,
  });
  const severe = computeDisengagement({
    signals: severeSignals,
    threshold: 0.5,
  });

  check(
    "a cue accelerates an already-derived signal value",
    withCue.value > withoutCue.value,
    `${withoutCue.value} -> ${withCue.value}`,
  );
  check(
    "signals alone can cross an enabled threshold",
    severe.crossed === true,
    JSON.stringify(severe),
  );
  check(
    "signals plus cue cross earlier than the same signals without one",
    withoutCue.crossed === false && withCue.crossed === true,
    `${JSON.stringify(withoutCue)} != ${JSON.stringify(withCue)}`,
  );
}

console.log("\n3. Threshold and floor gates");
{
  const policy = PITCH_ELEVATOR_TYPE.terminationPolicy;
  const belowThreshold = resolveTermination({
    policy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 2,
    disengagementValue: ELEVATOR_DISENGAGEMENT_THRESHOLD - 0.01,
  });
  const accepted = resolveTermination({
    policy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 2,
    disengagementValue: ELEVATOR_DISENGAGEMENT_THRESHOLD,
  });
  const belowFloor = resolveTermination({
    policy: PITCH_DECK_TYPE.terminationPolicy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 3,
    disengagementValue: 1,
  });
  const nullThresholdPolicy: TerminationPolicyConfig = {
    studentMayEnd: true,
    avatarMayEnd: true,
    avatarEndReasons: ["lost_interest"],
    avatarEndFloor: { minAssistantTurns: 1 },
    disengagementThreshold: null,
  };
  const nullThresholdAccepted = resolveTermination({
    policy: nullThresholdPolicy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 1,
  });

  check(
    "threshold policy rejects a valid avatar end below the derived value gate",
    belowThreshold.ok === false &&
      belowThreshold.reason === "disengagement-below-threshold",
    JSON.stringify(belowThreshold),
  );
  check(
    "threshold policy accepts a valid reason at floor and threshold",
    accepted.ok === true && accepted.recordedReason === "lost_interest",
    JSON.stringify(accepted),
  );
  check(
    "deck floor rejects before four assistant turns even at maximum disengagement",
    belowFloor.ok === false && belowFloor.reason === "floor-not-met",
    JSON.stringify(belowFloor),
  );
  check(
    "null threshold preserves the existing avatar-end path without a value",
    nullThresholdAccepted.ok === true &&
      nullThresholdAccepted.recordedReason === "lost_interest",
    JSON.stringify(nullThresholdAccepted),
  );
}

console.log("\n4. Pitch policy opt-ins");
{
  check(
    "pitch-deck has a real four-turn avatar floor",
    PITCH_DECK_TYPE.terminationPolicy.avatarEndFloor?.minAssistantTurns === 4,
    JSON.stringify(PITCH_DECK_TYPE.terminationPolicy.avatarEndFloor),
  );
  check(
    "pitch-deck has a numeric disengagement threshold",
    PITCH_DECK_TYPE.terminationPolicy.disengagementThreshold ===
      DECK_DISENGAGEMENT_THRESHOLD,
    JSON.stringify(PITCH_DECK_TYPE.terminationPolicy),
  );
  check(
    "pitch-elevator retains its existing floor and opts into disengagement",
    PITCH_ELEVATOR_TYPE.terminationPolicy.avatarEndFloor?.minAssistantTurns ===
      2 &&
      PITCH_ELEVATOR_TYPE.terminationPolicy.disengagementThreshold ===
        ELEVATOR_DISENGAGEMENT_THRESHOLD,
    JSON.stringify(PITCH_ELEVATOR_TYPE.terminationPolicy),
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
