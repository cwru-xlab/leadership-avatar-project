import { answerDeliveryLevel } from "../lib/metrics/bands";
import type { VocalTurnMetrics } from "../lib/metrics/types";

let failures = 0;

function check(condition: unknown, description: string) {
  if (condition) {
    console.log(`PASS ${description}`);
    return;
  }

  failures += 1;
  console.error(`FAIL ${description}`);
}

function turn(overrides: Partial<VocalTurnMetrics>): VocalTurnMetrics {
  return {
    turn_index: 0,
    start_s: 0,
    duration_s: 60,
    words_per_minute: 140,
    filler_count: 0,
    pause_count: 1,
    volume_consistency: 0.9,
    ...overrides,
  };
}

console.log("\nPer-answer delivery level (display only)");
check(answerDeliveryLevel(turn({})).word === "Strong", "nothing off target reads Strong");
check(
  answerDeliveryLevel(turn({ words_per_minute: 90 })).word === "Steady",
  "a slow pace alone reads Steady",
);
check(
  answerDeliveryLevel(turn({ words_per_minute: 170 })).word === "Strong",
  "Slightly fast is not off target",
);
check(
  answerDeliveryLevel(turn({ words_per_minute: 200, volume_consistency: 0.6 })).word === "Uneven",
  "fast pace plus variable volume reads Uneven",
);
check(
  answerDeliveryLevel(
    turn({ words_per_minute: 90, filler_count: 10, pause_count: 8, volume_consistency: 0.4 }),
  ).word === "Off",
  "three or more off-target measures read Off",
);
check(
  answerDeliveryLevel(turn({})).notes.map((n) => n.label).join(",") ===
    "Pace,Filler words,Pauses,Volume",
  "notes carry the four band words in a fixed order",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
