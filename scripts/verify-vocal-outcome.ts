/**
 * Regression coverage for Defect F (12-08 Task 1 checkpoint): a real
 * session where the student spoke three real answers, but their total
 * `spoken_seconds` fell under `MIN_SPOKEN_SECONDS_TO_SCORE`, was reported as
 * `TYPED_ONLY` and rendered "You typed your answers, so there was no speech
 * to measure" — a specific false claim about what the student did, while
 * the SAME report showed real measured Voice bands (pace/filler/pauses/
 * volume) from the speech that was genuinely captured and analyzed.
 *
 * Run: npx tsx scripts/verify-vocal-outcome.ts
 */
import { resolveVocalOutcome } from "../lib/metrics/coverage";
import { resolveCardState } from "../components/interview/ReportScoreCards";
import type { VocalMetrics } from "../lib/metrics/types";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

function vocal(over: Partial<VocalMetrics["coverage"]> = {}): VocalMetrics {
  return {
    words_per_minute: 120,
    filler_word_count: 2,
    filler_word_list: ["um"],
    pause_count: 3,
    volume_consistency: 0.8,
    turns: [],
    coverage: {
      spoken_turns: 0,
      typed_turns: 0,
      analyzed_turns: 0,
      spoken_seconds: 0,
      analyzer_error: false,
      ...over,
    },
  };
}

console.log("1. resolveVocalOutcome — the three-way split");

check("spoken_turns === 0 is genuinely TYPED_ONLY",
  resolveVocalOutcome(vocal({ spoken_turns: 0, typed_turns: 3 })),
  { scored: false, reason: "TYPED_ONLY" });

{
  // The exact real-run shape: three real spoken answers (spoken_turns > 0,
  // all analyzed) totalling well under the 30s floor.
  const realRun = vocal({
    spoken_turns: 3,
    analyzed_turns: 3,
    spoken_seconds: 18,
  });
  check("spoken_turns > 0 but under the floor is SPEECH_TOO_SHORT, never TYPED_ONLY",
    resolveVocalOutcome(realRun),
    { scored: false, reason: "SPEECH_TOO_SHORT" });
}

check("spoken_turns > 0, zero analyzed, is a genuine technical failure",
  resolveVocalOutcome(vocal({ spoken_turns: 2, analyzed_turns: 0, spoken_seconds: 5 })),
  { scored: false, reason: "INSUFFICIENT_DATA" });

check("spoken_turns > 0 and over the floor scores",
  resolveVocalOutcome(vocal({ spoken_turns: 3, analyzed_turns: 3, spoken_seconds: 45 })),
  { scored: true, reason: null });

check("null vocal metrics is INSUFFICIENT_DATA", resolveVocalOutcome(null), {
  scored: false,
  reason: "INSUFFICIENT_DATA",
});

check("an explicit analyzer error outranks spoken_seconds",
  resolveVocalOutcome(vocal({ spoken_turns: 3, analyzed_turns: 3, spoken_seconds: 45, analyzer_error: true })),
  { scored: false, reason: "INSUFFICIENT_DATA" });

console.log("\n2. resolveCardState — the score card copy's own routing");

check("TYPED_ONLY routes to the typed_only card state",
  resolveCardState("ON", "TYPED_ONLY", null), "typed_only");

check("SPEECH_TOO_SHORT routes to its OWN state, never typed_only's false copy",
  resolveCardState("ON", "SPEECH_TOO_SHORT", null), "speech_too_short");

check("SPEECH_TOO_SHORT never collapses into camera_off either",
  resolveCardState("ON", "SPEECH_TOO_SHORT", null) === "camera_off", false);

check("INSUFFICIENT_DATA is unaffected by the split",
  resolveCardState("ON", "INSUFFICIENT_DATA", null), "insufficient_data");

check("a legacy row (null cameraMode) is unaffected regardless of reason",
  resolveCardState(null, "SPEECH_TOO_SHORT", null), "not_yet_measured");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
