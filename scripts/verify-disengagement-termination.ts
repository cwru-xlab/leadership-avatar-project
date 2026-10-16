/**
 * Proves Phase 18's cue parsing and threshold/floor termination contract with
 * fixed fixtures only. Run: npx tsx scripts/verify-disengagement-termination.ts
 *
 * AMENDED 2026-10-08 (Phase 19 plan 19-03): 19-CONTEXT.md reverses the deck
 * half of Phase 18's REQ-84 — no deck mode opts into the walk-out anymore.
 * Section 4's deck assertions were INVERTED (never deleted) to assert the
 * new intent, and the section 3 `belowFloor` fixture was re-pointed at a
 * synthetic policy since it can no longer borrow `PITCH_DECK_TYPE` to prove
 * the floor gate. `pitch-elevator` is untouched and is now the ONLY type
 * that opts into disengagement.
 */
import {
  computeDisengagement,
  cueAcceleration,
  extractDisengagementSignals,
  parseDisengagementCue,
} from "../lib/engine/disengagement";
import { getEngineType } from "../lib/engine/registry";
import { parseEngineTurn } from "../lib/engine/turn-control";
import {
  resolveTermination,
  resolveWalkOutReason,
} from "../lib/engine/termination";
import type {
  ResolvedSessionConfig,
  TerminationPolicyConfig,
} from "../lib/engine/types";
import { listDeckModes } from "../lib/pitch/deck-modes";
import { PITCH_DECK_TYPE } from "../lib/pitch/deck-type";
import {
  ELEVATOR_DISENGAGEMENT_THRESHOLD,
  PITCH_ELEVATOR_TYPE,
} from "../lib/pitch/elevator-type";
import {
  CONVERSATION_DISENGAGEMENT_THRESHOLD,
  DIFFICULT_CONVERSATION_TYPE,
} from "../lib/difficult-conversation/conversation-type";

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
  // A locally-declared synthetic policy, NOT PITCH_DECK_TYPE's — the deck no
  // longer opts in (avatarMayEnd: false), so borrowing its policy here would
  // be rejected by gate 1 before the floor gate is ever reached. This
  // fixture exists purely to keep proving the floor-before-threshold gate
  // order; it makes no claim about any real type.
  const syntheticFloorPolicy: TerminationPolicyConfig = {
    studentMayEnd: true,
    avatarMayEnd: true,
    avatarEndReasons: ["lost_interest"],
    avatarEndFloor: { minAssistantTurns: 4 },
    disengagementThreshold: 0.5,
  };
  const belowFloor = resolveTermination({
    policy: syntheticFloorPolicy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 3,
    disengagementValue: 1,
  });
  // Direct proof that a maximally disengaged investor still cannot walk out:
  // avatarMayEnd: false rejects at gate 1, before the floor or threshold
  // gates are even consulted.
  const maximallyDisengagedInvestor = resolveTermination({
    policy: PITCH_DECK_TYPE.terminationPolicy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 12,
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
    "synthetic policy's floor rejects before four assistant turns even at maximum disengagement",
    belowFloor.ok === false && belowFloor.reason === "floor-not-met",
    JSON.stringify(belowFloor),
  );
  check(
    "a maximally disengaged investor still cannot walk out (avatarMayEnd: false)",
    maximallyDisengagedInvestor.ok === false &&
      maximallyDisengagedInvestor.recordedReason === null,
    JSON.stringify(maximallyDisengagedInvestor),
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
  // Only resolve modes actually registered yet — 19-04/19-05 add the other
  // four deck modes to the registry; written this way, these two checks
  // automatically cover them as soon as they land, and fail the moment any
  // deck mode re-adds a threshold or re-opts in.
  const resolvedDeckTypes = listDeckModes()
    .map((mode) => getEngineType(mode.slug))
    .filter((type): type is NonNullable<typeof type> => type !== null);

  check(
    "at least one deck mode is registered to check (pitch-deck)",
    resolvedDeckTypes.length >= 1,
    JSON.stringify(resolvedDeckTypes.map((t) => t.slug)),
  );
  check(
    "no deck mode opts into disengagement",
    resolvedDeckTypes.every(
      (type) =>
        type.terminationPolicy.disengagementThreshold == null &&
        type.terminationPolicy.avatarMayEnd === false &&
        type.terminationPolicy.avatarEndReasons.length === 0,
    ),
    JSON.stringify(resolvedDeckTypes.map((t) => t.terminationPolicy)),
  );
  check(
    "every deck mode keeps a dormant four-turn floor (19-CONTEXT.md walk-out decision)",
    resolvedDeckTypes.every(
      (type) =>
        (type.terminationPolicy.avatarEndFloor?.minAssistantTurns ?? 0) >= 4,
    ),
    JSON.stringify(resolvedDeckTypes.map((t) => t.terminationPolicy.avatarEndFloor)),
  );
  // INVERTED 2026-10-15 (user decision). This row previously asserted
  // `minAssistantTurns === 2`. The elevator now declares NO floor, so a
  // crossed threshold can end the session on any turn — the listener walking
  // away early is the lesson. The opt-in half of the row is unchanged, and
  // the deck family's dormant four-turn floors above are untouched.
  check(
    "pitch-elevator declares NO floor and still opts into disengagement",
    PITCH_ELEVATOR_TYPE.terminationPolicy.avatarEndFloor == null &&
      PITCH_ELEVATOR_TYPE.terminationPolicy.disengagementThreshold ===
        ELEVATOR_DISENGAGEMENT_THRESHOLD,
    JSON.stringify(PITCH_ELEVATOR_TYPE.terminationPolicy),
  );
  // The floor's removal must not have reached the gate itself: a synthetic
  // policy that DOES declare a floor still rejects below it, at maximum
  // disengagement. Proves the change is per-type config, not a gate change.
  const floorStillBites = resolveTermination({
    policy: {
      ...PITCH_ELEVATOR_TYPE.terminationPolicy,
      avatarEndFloor: { minAssistantTurns: 3 },
    },
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 2,
    disengagementValue: 1,
  });
  check(
    "floor gate itself still bites for a type that declares one",
    floorStillBites.ok === false && floorStillBites.reason === "floor-not-met",
    JSON.stringify(floorStillBites),
  );
}

console.log(
  "\n5. Difficult-conversation floor, severe carve-out and reason mapping",
);
{
  // AMENDMENT TO PHASE 18 SUCCESS CRITERION 5 (Phase 20 / REQ-100).
  // SC5 read: "a walk-out can never fire before a type's avatarEndFloor minimum
  // turns." It now reads: "...except for the named severe-content carve-out in
  // resolveTermination." The assertion below is INVERTED to state the new
  // intent, not deleted and not loosened. The floor-holds assertion that
  // precedes it is the half of SC5 that is unchanged, and it is re-stated here
  // against difficult-conversation so this phase's proof stands on its own type.
  const policy = DIFFICULT_CONVERSATION_TYPE.terminationPolicy;

  // (a) The floor still holds, for this type, for an ordinary trigger — the
  // unchanged half of SC5, re-proven on a type Phase 19 does not touch.
  for (const turnCount of [0, 1, 2, 3]) {
    const belowFloor = resolveTermination({
      policy,
      source: "avatar",
      reason: "escalated",
      assistantTurnCount: turnCount,
      disengagementValue: 1,
    });

    check(
      `floor rejects an ordinary trigger at ${turnCount} assistant turn(s)`,
      belowFloor.ok === false && belowFloor.reason === "floor-not-met",
      JSON.stringify(belowFloor),
    );
  }

  const atFloor = resolveTermination({
    policy,
    source: "avatar",
    reason: "escalated",
    assistantTurnCount: 4,
    disengagementValue: 1,
  });

  check(
    "floor accepts an ordinary trigger at exactly 4 assistant turns",
    atFloor.ok === true,
    JSON.stringify(atFloor),
  );

  // (b) The carve-out fires, and ONLY for severe content. INVERTED assertion:
  // SC5's "never before the floor" now has a named exception.
  const carveOutFires = resolveTermination({
    policy,
    source: "avatar",
    reason: "offensive_content",
    assistantTurnCount: 0,
    disengagementValue: 1,
    severeContent: true,
  });

  check(
    "INVERTED SC5: severe content ends the session at turn 0, below the floor",
    carveOutFires.ok === true &&
      carveOutFires.recordedReason === "offensive_content",
    JSON.stringify(carveOutFires),
  );

  const sameCallWithoutSevere = resolveTermination({
    policy,
    source: "avatar",
    reason: "offensive_content",
    assistantTurnCount: 0,
    disengagementValue: 1,
    severeContent: false,
  });

  check(
    "the same call without severeContent still hits the ordinary floor",
    sameCallWithoutSevere.ok === false &&
      sameCallWithoutSevere.reason === "floor-not-met",
    JSON.stringify(sameCallWithoutSevere),
  );

  // (c) The carve-out skips the floor and nothing else — narrow, not a bypass.
  const severeWithBadReason = resolveTermination({
    policy,
    source: "avatar",
    reason: "not_a_declared_reason",
    assistantTurnCount: 0,
    disengagementValue: 1,
    severeContent: true,
  });

  check(
    "severeContent does not bypass the closed reason vocabulary (gate 2)",
    severeWithBadReason.ok === false &&
      severeWithBadReason.recordedReason === null,
    JSON.stringify(severeWithBadReason),
  );

  const severeBelowOwnThreshold = resolveTermination({
    policy,
    source: "avatar",
    reason: "offensive_content",
    assistantTurnCount: 0,
    disengagementValue: CONVERSATION_DISENGAGEMENT_THRESHOLD - 0.01,
    severeContent: true,
  });

  check(
    "severeContent does not bypass the disengagement-threshold gate (gate 4)",
    severeBelowOwnThreshold.ok === false &&
      severeBelowOwnThreshold.reason === "disengagement-below-threshold",
    JSON.stringify(severeBelowOwnThreshold),
  );

  const severeButMayNotEnd = resolveTermination({
    policy: { ...policy, avatarMayEnd: false },
    source: "avatar",
    reason: "offensive_content",
    assistantTurnCount: 0,
    disengagementValue: 1,
    severeContent: true,
  });

  check(
    "severeContent does not bypass avatarMayEnd (gate 1)",
    severeButMayNotEnd.ok === false &&
      severeButMayNotEnd.recordedReason === null,
    JSON.stringify(severeButMayNotEnd),
  );

  // (d) Other types are unaffected by the new argument — the elevator
  // declares no severe mapping and this phase changes nothing for it.
  // PITCH_DECK_TYPE is deliberately not referenced here (Phase 19 owns it).
  //
  // The carve-out at gate 3 is a GATE-LEVEL skip, not a per-type opt-in, so
  // `severeContent: true` DOES skip the elevator's own floor the moment a
  // caller sets it — the narrowness guarantee is that no real elevator call
  // site ever sets it (only the difficult-conversation signal path does;
  // 20-05/20-06), not that resolveTermination special-cases the slug. What
  // IS unaffected is everything severeContent does NOT touch: gate 2's
  // closed reason vocabulary (an elevator reason it never declared is still
  // rejected regardless of severeContent) and the ordinary passing path
  // (when the floor and threshold already hold without help, the flag is a
  // no-op). Both are asserted below instead of a floor-level deep-equal,
  // which this gate's own documented design makes untrue for ANY type.
  const elevatorPolicy = PITCH_ELEVATOR_TYPE.terminationPolicy;
  const elevatorUndeclaredReasonWithoutSevere = resolveTermination({
    policy: elevatorPolicy,
    source: "avatar",
    reason: "offensive_content", // declared for DC, not for the elevator
    assistantTurnCount: 0,
    disengagementValue: 1,
  });
  const elevatorUndeclaredReasonWithSevere = resolveTermination({
    policy: elevatorPolicy,
    source: "avatar",
    reason: "offensive_content",
    assistantTurnCount: 0,
    disengagementValue: 1,
    severeContent: true,
  });

  check(
    "severeContent cannot rescue a reason the elevator never declared (gate 2 unaffected)",
    JSON.stringify(elevatorUndeclaredReasonWithoutSevere) ===
      JSON.stringify(elevatorUndeclaredReasonWithSevere) &&
      elevatorUndeclaredReasonWithSevere.ok === false,
    `${JSON.stringify(elevatorUndeclaredReasonWithoutSevere)} != ${JSON.stringify(elevatorUndeclaredReasonWithSevere)}`,
  );

  const elevatorOrdinaryPassWithoutSevere = resolveTermination({
    policy: elevatorPolicy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: elevatorPolicy.avatarEndFloor?.minAssistantTurns ?? 0,
    disengagementValue: ELEVATOR_DISENGAGEMENT_THRESHOLD,
  });
  const elevatorOrdinaryPassWithSevere = resolveTermination({
    policy: elevatorPolicy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: elevatorPolicy.avatarEndFloor?.minAssistantTurns ?? 0,
    disengagementValue: ELEVATOR_DISENGAGEMENT_THRESHOLD,
    severeContent: true,
  });

  check(
    "severeContent is a no-op once the elevator's own floor and threshold already pass",
    JSON.stringify(elevatorOrdinaryPassWithoutSevere) ===
      JSON.stringify(elevatorOrdinaryPassWithSevere) &&
      elevatorOrdinaryPassWithSevere.ok === true,
    `${JSON.stringify(elevatorOrdinaryPassWithoutSevere)} != ${JSON.stringify(elevatorOrdinaryPassWithSevere)}`,
  );

  // (e) Reason mapping — derived deterministically from the dominant
  // observable cause, from the type's own closed vocabulary.
  const severeReason = resolveWalkOutReason({
    policy,
    dominantCauses: [],
    severe: true,
  });
  const hostilityReason = resolveWalkOutReason({
    policy,
    dominantCauses: ["hostility"],
    severe: false,
  });
  const repeatedResponseReason = resolveWalkOutReason({
    policy,
    dominantCauses: ["repeated_response"],
    severe: false,
  });
  const shortResponseStreakReason = resolveWalkOutReason({
    policy,
    dominantCauses: ["short_response_streak"],
    severe: false,
  });
  const elevatorReason = resolveWalkOutReason({
    policy: elevatorPolicy,
    dominantCauses: ["repeated_response"],
    severe: false,
  });
  const uncoveredCauseReason = resolveWalkOutReason({
    policy: { ...policy, avatarEndReasonByCause: {} },
    dominantCauses: ["hostility"],
    severe: false,
  });

  check(
    "resolveWalkOutReason returns offensive_content for severe content",
    severeReason === "offensive_content",
    String(severeReason),
  );
  check(
    "resolveWalkOutReason returns escalated for a dominant hostility cause",
    hostilityReason === "escalated",
    String(hostilityReason),
  );
  check(
    "resolveWalkOutReason returns nothing_left_to_discuss for repeated_response",
    repeatedResponseReason === "nothing_left_to_discuss",
    String(repeatedResponseReason),
  );
  check(
    "resolveWalkOutReason returns nothing_left_to_discuss for short_response_streak",
    shortResponseStreakReason === "nothing_left_to_discuss",
    String(shortResponseStreakReason),
  );
  check(
    "resolveWalkOutReason returns null for a policy with no avatarEndReasonByCause (elevator)",
    elevatorReason === null,
    String(elevatorReason),
  );
  check(
    "resolveWalkOutReason returns null for a cause the map does not cover",
    uncoveredCauseReason === null,
    String(uncoveredCauseReason),
  );

  const reasonMapEntries = Object.entries(
    policy.avatarEndReasonByCause ?? {},
  );

  check(
    "every avatarEndReasonByCause value is a member of avatarEndReasons (future-edit guard)",
    reasonMapEntries.every(([, value]) =>
      policy.avatarEndReasons.includes(value as string),
    ),
    JSON.stringify(reasonMapEntries),
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
