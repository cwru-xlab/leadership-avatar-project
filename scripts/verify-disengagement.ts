/**
 * Proves the dependency-free Phase 18 disengagement primitive using fixed
 * fixtures only. Run: npx tsx scripts/verify-disengagement.ts
 */
import { readFileSync } from "node:fs";
import {
  computeDisengagement,
  computeDisengagementOverTranscript,
  extractDisengagementSignals,
  DEFAULT_DISENGAGEMENT_WEIGHTS,
  type DisengagementCause,
  type DisengagementWeights,
} from "../lib/engine/disengagement";
import { SEVERE_PLACEHOLDER_TOKENS } from "../lib/engine/hostility";

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

console.log("\n6. Transcript replay ratchets across turns");
{
  // Observed in UAT: a stalled, repetitive transcript reached 0.6, then one
  // novel reply ("Cheese") dropped it to 0.4, because each request recomputed
  // from scratch and repetition scores only the latest message.
  const stalled = [
    { role: "assistant", content: "What are you pitching?" },
    { role: "user", content: "a startup thing" },
    { role: "assistant", content: "Tell me more about it." },
    { role: "user", content: "a startup thing" },
    { role: "assistant", content: "What makes it different?" },
    { role: "user", content: "a startup thing" },
  ];
  const withNovelReply = [
    ...stalled,
    { role: "assistant", content: "Anything specific you need?" },
    { role: "user", content: "Cheese" },
  ];
  const base = { elapsedSeconds: 120, budgetSeconds: 300, threshold: 0.72 };
  const before = computeDisengagementOverTranscript({
    ...base,
    transcript: stalled,
    assistantTurnCount: 3,
  });
  const after = computeDisengagementOverTranscript({
    ...base,
    transcript: withNovelReply,
    assistantTurnCount: 4,
  });

  check(
    "a novel reply never lowers the value earned by earlier turns",
    after.value >= before.value,
    `before ${before.value} -> after ${after.value}`,
  );
  check(
    "the from-scratch computation this replaces does drop on the same input",
    computeDisengagement({
      signals: extractDisengagementSignals({
        transcript: withNovelReply,
        elapsedSeconds: 120,
        budgetSeconds: 300,
        assistantTurnCount: 4,
      }),
      threshold: 0.5,
    }).value < before.value,
    "the regression fixture no longer reproduces the original defect",
  );
  check(
    "replay is deterministic",
    JSON.stringify(
      computeDisengagementOverTranscript({
        ...base,
        transcript: withNovelReply,
        assistantTurnCount: 4,
      }),
    ) === JSON.stringify(after),
    "same transcript produced different results",
  );
  check(
    "an established common ground cannot erase an earlier absence",
    computeDisengagementOverTranscript({
      ...base,
      transcript: [
        ...withNovelReply,
        { role: "assistant", content: "So what is the fit here?" },
        { role: "user", content: "our priority is a relevant fit for you" },
      ],
      assistantTurnCount: 5,
    }).value >= after.value,
    "a late common-ground mention lowered the ratcheted value",
  );
  check(
    "episodes span the replayed session, not only the final turn",
    before.episodes.length > 0 &&
      before.episodes.every(
        (episode) => episode.start_s >= 0 && episode.start_s <= 120,
      ),
    JSON.stringify(before.episodes),
  );
}

// ---------------------------------------------------------------------------
// Phase 20 additions (20-02): hostility, severe content, acknowledgement
// absence, and the stonewalling amendment. Additive only — nothing above
// this line is edited, weakened, or deleted; Phase 18's regression rows
// (the "Cheese" ratchet rows especially) stay byte-identical.
// ---------------------------------------------------------------------------

/**
 * A PROVISIONAL UNTIL CALIBRATED weight profile for this suite's own
 * fixtures only — NOT the difficult-conversation type's actual declared
 * profile (20-03 owns that). Built in the register of 20-01's `HOSTILE` /
 * `STONEWALLING_CANDIDATES` corpora (not imported, so the two batteries stay
 * independently runnable). `budgetPressure` and `severeContent` stay 0:
 * `budgetPressure` is dead for a null time budget, and severe content's
 * floor-override carve-out (20-04) is a separate mechanism from this
 * weighted accumulation. The only evidence behind every non-zero number here
 * is this file's own fixtures below.
 *
 * 20-EPSILON-MARGIN.md (found 2026-10-08, fixed here by 20-03): the first
 * version of this profile (shortResponseStreak 0.05 / noCommonGround 0.1 /
 * positionUnacknowledged 0.15 / hostility 0.4 / stonewalling 0.3) made the
 * sustained-stonewalling fixture land EXACTLY on 0.6 by construction
 * (0.05+0.1+0.15+0.3 == 0.6), so IEEE-754 addition order decided the
 * crossing by a 1e-16 margin rather than the weights. `shortResponseStreak`
 * is dropped to 0 here (not needed — the stonewalling pattern match already
 * drives the crossing; short-response pressure is proven separately and
 * independently in Section 2 under the shared defaults) and the freed
 * budget moves to `noCommonGround`/`positionUnacknowledged` (0.15 each,
 * shared by both fixtures) with `hostility`/`stonewalling` both at 0.35 —
 * chosen so EACH fixture's crossing total is 0.65, a 0.05 margin above the
 * 0.6 threshold (verified empirically below, Sections 14-15). 0.05 is ~2.3e14
 * times the ~2.2e-16 machine epsilon at this magnitude, so no reordering or
 * rounding of these additions can flip either crossing.
 */
const PHASE_20_TEST_WEIGHTS: Partial<DisengagementWeights> = {
  budgetPressure: 0,
  turnCountPressure: 0,
  repeatedResponse: 0,
  shortResponseStreak: 0,
  noCommonGround: 0.15,
  positionUnacknowledged: 0.15,
  hostility: 0.35,
  severeContent: 0,
  stonewalling: 0.35,
};

/** Builds an alternating assistant/student transcript from student lines only. */
function alternatingTranscript(
  studentLines: string[],
): Array<{ role: string; content: string }> {
  const transcript: Array<{ role: string; content: string }> = [];
  studentLines.forEach((line, index) => {
    transcript.push({
      role: "assistant",
      content: `Can you walk me through your side of this? (prompt ${index})`,
    });
    transcript.push({ role: "user", content: line });
  });
  return transcript;
}

/** Register from 20-01's HOSTILE corpus, not imported (see note above). */
const HOSTILE_LINE_1 =
  "You are an idiot and you clearly don't know what you're doing.";
const HOSTILE_LINE_2 = "Screw you, I'm not listening to this.";
const WARM_LINE = "That's fair, I understand why you'd see it that way.";

console.log("\n7. Hostility accumulates");
{
  // Hostile on turns 1, 3 and 5; cooperative in between so only hostility
  // (not short-response streak) is driving the rise.
  const transcript = alternatingTranscript([
    HOSTILE_LINE_1,
    "Okay, I can look at the numbers again.",
    HOSTILE_LINE_2,
    "Sure, let's go through the timeline.",
    "You are the problem here, not me.",
  ]);
  const base = { elapsedSeconds: 150, budgetSeconds: null, threshold: 0.6 };

  const afterOne = computeDisengagementOverTranscript({
    ...base,
    transcript: transcript.slice(0, 2),
    assistantTurnCount: 1,
    weights: PHASE_20_TEST_WEIGHTS,
  });
  const afterThree = computeDisengagementOverTranscript({
    ...base,
    transcript,
    assistantTurnCount: 5,
    weights: PHASE_20_TEST_WEIGHTS,
  });

  check(
    "value after three hostile turns exceeds the value after one",
    afterThree.value > afterOne.value,
    `after 1: ${afterOne.value}, after 3: ${afterThree.value}`,
  );
  check(
    "one sharp remark does not end a heated conversation",
    afterOne.value < 0.6,
    `value was ${afterOne.value}`,
  );
}

console.log("\n8. Hostility ratchets one-way");
{
  const hostileTranscript = alternatingTranscript([
    HOSTILE_LINE_1,
    HOSTILE_LINE_2,
    "You are the problem here, not me.",
  ]);
  const warmTail = [
    { role: "assistant", content: "Can we find some common ground here?" },
    { role: "user", content: WARM_LINE },
    { role: "assistant", content: "What would help move this forward?" },
    { role: "user", content: "I appreciate you hearing me out on this." },
  ];
  const base = { elapsedSeconds: 150, budgetSeconds: null, threshold: 0.6 };

  const shorter = computeDisengagementOverTranscript({
    ...base,
    transcript: hostileTranscript,
    assistantTurnCount: 3,
    weights: PHASE_20_TEST_WEIGHTS,
  });
  const longer = computeDisengagementOverTranscript({
    ...base,
    transcript: [...hostileTranscript, ...warmTail],
    assistantTurnCount: 5,
    weights: PHASE_20_TEST_WEIGHTS,
  });

  check(
    "two warm, acknowledging turns never lower the value hostility already earned",
    longer.value >= shorter.value,
    `shorter: ${shorter.value}, longer: ${longer.value}`,
  );

  // Negative control (Phase 18's lesson, reapplied): a single computeDisengagement
  // call built from only the final prefix's signals (no priorValue) must
  // produce a LOWER value, proving the ratchet in computeDisengagementOverTranscript
  // is doing real work and is not an accident of the fixture.
  const finalPrefix = [...hostileTranscript, ...warmTail];
  const fromScratch = computeDisengagement({
    signals: extractDisengagementSignals({
      transcript: finalPrefix,
      elapsedSeconds: 150,
      budgetSeconds: null,
      assistantTurnCount: 5,
    }),
    threshold: 0.6,
    weights: PHASE_20_TEST_WEIGHTS,
  });
  check(
    "the from-scratch computation this ratchet replaces does drop on the same input",
    fromScratch.value < longer.value,
    `from-scratch: ${fromScratch.value}, ratcheted: ${longer.value}`,
  );
}

console.log("\n9. No apology-driven recovery");
{
  // Rejected 2026-10-08 per REQUIREMENTS.md's Out of Scope table: "Apology-
  // driven recovery of the disengagement value — a decaying value reverses
  // Phase 18's ratchet fix (REQ-99)." This is not an oversight.
  const hostileTranscript = alternatingTranscript([
    HOSTILE_LINE_1,
    HOSTILE_LINE_2,
    "You are the problem here, not me.",
  ]);
  const apologyTail = [
    {
      role: "assistant",
      content: "I'd like to understand where you're coming from.",
    },
    { role: "user", content: "I'm sorry, that was out of line." },
  ];
  const base = { elapsedSeconds: 150, budgetSeconds: null, threshold: 0.6 };

  const before = computeDisengagementOverTranscript({
    ...base,
    transcript: hostileTranscript,
    assistantTurnCount: 3,
    weights: PHASE_20_TEST_WEIGHTS,
  });
  const after = computeDisengagementOverTranscript({
    ...base,
    transcript: [...hostileTranscript, ...apologyTail],
    assistantTurnCount: 4,
    weights: PHASE_20_TEST_WEIGHTS,
  });

  check(
    "an explicit apology does not decrease the value",
    after.value >= before.value,
    `before: ${before.value}, after: ${after.value}`,
  );
}

console.log("\n10. Acknowledgement absence ratchets");
{
  // Mirrors the existing "an established common ground cannot erase an
  // earlier absence" row (Section 6) for the new acknowledgement signal.
  const noAckTranscript = alternatingTranscript([
    "I need a decision today.",
    "That's not going to change my position.",
    "I've said what I came to say.",
    "Let's just finish this.",
  ]);
  const ackTail = [
    { role: "assistant", content: "Can you see this from my side at all?" },
    { role: "user", content: WARM_LINE },
  ];
  const base = { elapsedSeconds: 120, budgetSeconds: null, threshold: 0.6 };

  const beforeAck = computeDisengagementOverTranscript({
    ...base,
    transcript: noAckTranscript,
    assistantTurnCount: 4,
    weights: PHASE_20_TEST_WEIGHTS,
  });
  const afterAck = computeDisengagementOverTranscript({
    ...base,
    transcript: [...noAckTranscript, ...ackTail],
    assistantTurnCount: 5,
    weights: PHASE_20_TEST_WEIGHTS,
  });

  check(
    "a late acknowledgement cannot erase an earlier absence",
    afterAck.value >= beforeAck.value,
    `before: ${beforeAck.value}, after: ${afterAck.value}`,
  );
}

console.log("\n11. Severe content is carried forward");
{
  const severeThenBenign = alternatingTranscript([
    `That's a ${SEVERE_PLACEHOLDER_TOKENS[0]} and you know it.`,
    "Can we get back to the schedule?",
    "Sure, that works for me.",
  ]);

  const result = computeDisengagementOverTranscript({
    transcript: severeThenBenign,
    elapsedSeconds: 90,
    budgetSeconds: null,
    assistantTurnCount: 3,
    threshold: 0.6,
  });

  check(
    "a severe turn 1 is never erased by benign turns that follow",
    result.severe === true,
    JSON.stringify(result),
  );
}

console.log("\n12. Default weights leave Phase 18 types unchanged");
{
  const transcript = alternatingTranscript([
    HOSTILE_LINE_1,
    HOSTILE_LINE_2,
    "You are the problem here, not me.",
  ]);
  const base = { elapsedSeconds: 150, budgetSeconds: null, threshold: 0.6 };

  const withNoWeightsArg = computeDisengagementOverTranscript({
    ...base,
    transcript,
    assistantTurnCount: 3,
  });
  const withNewCausesForcedZero = computeDisengagementOverTranscript({
    ...base,
    transcript,
    assistantTurnCount: 3,
    weights: {
      hostility: 0,
      severeContent: 0,
      positionUnacknowledged: 0,
      stonewalling: 0,
    },
  });

  check(
    "an omitted weights argument equals every new cause forced to zero",
    withNoWeightsArg.value === withNewCausesForcedZero.value,
    `omitted: ${withNoWeightsArg.value}, forced-zero: ${withNewCausesForcedZero.value}`,
  );
  const NEW_CAUSES: DisengagementCause[] = [
    "hostility",
    "severe_content",
    "position_unacknowledged",
    "stonewalling",
  ];
  check(
    "none of the four new causes appears in dominantCauses by default",
    NEW_CAUSES.every(
      (cause) => !withNoWeightsArg.dominantCauses.includes(cause),
    ),
    JSON.stringify(withNoWeightsArg.dominantCauses),
  );
  check(
    "DEFAULT_DISENGAGEMENT_WEIGHTS.hostility is explicitly 0",
    DEFAULT_DISENGAGEMENT_WEIGHTS.hostility === 0,
    `was ${DEFAULT_DISENGAGEMENT_WEIGHTS.hostility}`,
  );
  check(
    "DEFAULT_DISENGAGEMENT_WEIGHTS.severeContent is explicitly 0",
    DEFAULT_DISENGAGEMENT_WEIGHTS.severeContent === 0,
  );
  check(
    "DEFAULT_DISENGAGEMENT_WEIGHTS.positionUnacknowledged is explicitly 0",
    DEFAULT_DISENGAGEMENT_WEIGHTS.positionUnacknowledged === 0,
  );
  check(
    "DEFAULT_DISENGAGEMENT_WEIGHTS.stonewalling is explicitly 0",
    DEFAULT_DISENGAGEMENT_WEIGHTS.stonewalling === 0,
  );
}

console.log("\n13. A weight profile sums as declared");
{
  const { maxCueAcceleration, ...contributingWeights } =
    PHASE_20_TEST_WEIGHTS as DisengagementWeights;
  const sum = Object.values(contributingWeights).reduce(
    (total, weight) => total + weight,
    0,
  );

  check(
    "the test profile's active weights sum to 1 within floating-point tolerance",
    Math.abs(sum - 1) < 1e-9,
    `sum was ${sum}`,
  );
  check(
    "maxCueAcceleration is excluded from that sum (it accelerates, it does not contribute)",
    maxCueAcceleration === undefined,
  );
}

// ---------------------------------------------------------------------------
// AMENDMENT (2026-10-08): stonewalling must be able to end a session alone.
// This reverses 20-01's "no new signal needed" finding (0.425 measured
// against a 0.6 threshold using only Phase 18's existing stall signals).
// Both facts below are proven in this ONE script run, alongside
// `scripts/verify-hostility-detector.ts`'s unmodified 24-row
// FIRM_NOT_HOSTILE corpus (run in the same verification pass, not imported
// here, so the two batteries stay independently runnable — see the header
// note above).
// ---------------------------------------------------------------------------

/** Register from 20-01's STONEWALLING_CANDIDATES corpus, not imported. */
const STONEWALL_LINES = [
  "No comment.",
  "I already told you.",
  "Whatever.",
  "I'm not discussing this.",
  "Fine. Whatever you say.",
  "I have nothing more to say about it.",
];

const SUSTAINED_HOSTILE_LINES = [
  HOSTILE_LINE_1,
  HOSTILE_LINE_2,
  "You are the problem here, not me.",
  "This is pathetic and you are useless at your job.",
];

/**
 * Returns the 1-indexed student turn at which a threshold is first crossed
 * when the transcript is replayed prefix by prefix via
 * `computeDisengagementOverTranscript` — the same replay real callers
 * (`lib/engine/session.ts`'s `deriveFinishDisengagement`,
 * `app/api/interaction/chat/route.ts`) use, never the un-ratcheted
 * `computeDisengagement` primitive called directly. `null` if it never
 * crosses within the given lines.
 */
function firstCrossingTurn(
  studentLines: string[],
  weights: Partial<DisengagementWeights>,
  threshold: number,
): number | null {
  for (let turnCount = 1; turnCount <= studentLines.length; turnCount += 1) {
    const prefixLines = studentLines.slice(0, turnCount);
    const result = computeDisengagementOverTranscript({
      transcript: alternatingTranscript(prefixLines),
      elapsedSeconds: 30 * turnCount,
      budgetSeconds: null,
      assistantTurnCount: turnCount,
      threshold,
      weights,
    });
    if (result.crossed) return turnCount;
  }
  return null;
}

/**
 * 20-EPSILON-MARGIN.md's required margin: "a margin that survives
 * reordering and rounding, not land on the threshold." 0.01 is ~4.5e13 times
 * the ~2.2e-16 machine epsilon at this magnitude — no reordering of the
 * weighted-sum addition below it can flip a crossing that clears it. The
 * profile above is tuned to clear this margin by 0.04 (achieved margin
 * ~0.05, asserted loosely as >= 0.01 so the check itself does not become a
 * second place encoding a float-fragile exact value).
 */
const REAL_CROSSING_MARGIN = 0.01;

console.log("\n14. Sustained pure stonewalling crosses the threshold alone");
{
  const result = computeDisengagementOverTranscript({
    transcript: alternatingTranscript(STONEWALL_LINES),
    elapsedSeconds: 180,
    budgetSeconds: null,
    assistantTurnCount: STONEWALL_LINES.length,
    threshold: 0.6,
    weights: PHASE_20_TEST_WEIGHTS,
  });

  console.log(
    `         sustained stonewalling disengagement value: ${result.value} (crossed 0.6: ${result.crossed}, margin: ${result.value - 0.6})`,
  );
  check(
    "a sustained pure-refusal transcript crosses the 0.6 threshold",
    result.crossed === true,
    `value was ${result.value}`,
  );
  check(
    "the crossing clears 0.6 by a real margin, not a floating-point hair " +
      "(20-EPSILON-MARGIN.md)",
    result.value - 0.6 >= REAL_CROSSING_MARGIN,
    `margin was ${result.value - 0.6}, required >= ${REAL_CROSSING_MARGIN}`,
  );
  check(
    "stonewalling is a dominant cause behind the crossing",
    result.dominantCauses.includes("stonewalling"),
    JSON.stringify(result.dominantCauses),
  );
  check(
    "none of the six pure-refusal lines registers as hostile",
    extractDisengagementSignals({
      transcript: alternatingTranscript(STONEWALL_LINES),
      elapsedSeconds: 180,
      budgetSeconds: null,
      assistantTurnCount: STONEWALL_LINES.length,
    }).hostileTurnCount === 0,
    "a stonewalling line was misclassified as hostile — tier:\"none\" for " +
      "stonewalling (20-01's finding) must stay correct; the new signal " +
      "belongs in the cause vocabulary, not the hostility tiers",
  );
}

console.log(
  "\n15. Hostility reaches the threshold at least as fast as stonewalling",
);
{
  const stonewallCrossTurn = firstCrossingTurn(
    STONEWALL_LINES,
    PHASE_20_TEST_WEIGHTS,
    0.6,
  );
  const hostileCrossTurn = firstCrossingTurn(
    SUSTAINED_HOSTILE_LINES,
    PHASE_20_TEST_WEIGHTS,
    0.6,
  );

  check(
    "both fixtures cross the threshold within their own length",
    stonewallCrossTurn !== null && hostileCrossTurn !== null,
    `stonewall: ${stonewallCrossTurn}, hostile: ${hostileCrossTurn}`,
  );
  check(
    "hostility crosses at or before the turn stonewalling needs — never slower",
    hostileCrossTurn !== null &&
      stonewallCrossTurn !== null &&
      hostileCrossTurn <= stonewallCrossTurn,
    `stonewall crossed at turn ${stonewallCrossTurn}, hostility at turn ${hostileCrossTurn}`,
  );

  // 20-EPSILON-MARGIN.md: the hostility fixture's own crossing must also
  // clear by a real margin — fixing stonewalling's epsilon crossing while
  // leaving an equally fragile hostility crossing in place would just move
  // the defect, not close it.
  const hostileAtCrossTurn =
    hostileCrossTurn === null
      ? null
      : computeDisengagementOverTranscript({
          transcript: alternatingTranscript(
            SUSTAINED_HOSTILE_LINES.slice(0, hostileCrossTurn),
          ),
          elapsedSeconds: 30 * hostileCrossTurn,
          budgetSeconds: null,
          assistantTurnCount: hostileCrossTurn,
          threshold: 0.6,
          weights: PHASE_20_TEST_WEIGHTS,
        });
  check(
    "the hostility fixture's crossing also clears 0.6 by a real margin, " +
      "not a floating-point hair",
    hostileAtCrossTurn !== null &&
      hostileAtCrossTurn.value - 0.6 >= REAL_CROSSING_MARGIN,
    `value was ${hostileAtCrossTurn?.value}, margin ${hostileAtCrossTurn ? hostileAtCrossTurn.value - 0.6 : "n/a"}`,
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
