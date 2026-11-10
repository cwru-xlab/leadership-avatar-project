/**
 * The hint ladder is a policy boundary, not a presentation detail.
 *
 * Every tier up to the ceiling must produce a distinct, learner-safe hint, the
 * ceiling must have exactly one definition, and the exhaustion reply must
 * refuse rather than improvise help. A hint that names an algorithm or leaks a
 * private field would defeat the point of the whole technical-coding contract.
 */

import assert from "node:assert/strict";

import {
  MAX_TECHNICAL_HINTS,
  type TechnicalHintTier,
} from "../lib/technical-interview/types";
import {
  TECHNICAL_HINT_EXHAUSTED_REPLY,
  buildTechnicalHint,
  categorizeTechnicalChatRequest,
  inferTechnicalHintTier,
  selectTechnicalHintTier,
} from "../lib/technical-interview/chat-policy";

const assignment = {
  starterCode: "def merge_overlapping_windows(windows):\n    pass\n",
  hintLadder: [
    "State what ordering would let you compare each window to one active result.",
    "Explain when a new window extends the active result versus beginning another one.",
    "Maintain one active result and finalize it only when the next window cannot overlap it.",
  ] as const,
};

assert.equal(
  MAX_TECHNICAL_HINTS,
  3,
  "The ladder is three tiers, one per stage of implementation",
);

const tiers: TechnicalHintTier[] = [1, 2, 3];
const hints = tiers.map((tier) => buildTechnicalHint(assignment, tier));

// Each tier is a different hint. A duplicate would silently spend a tier.
assert.equal(
  new Set(hints).size,
  tiers.length,
  "Every tier must produce a distinct hint",
);

for (const [index, hint] of hints.entries()) {
  const tier = index + 1;
  assert(hint.length > 40, `Tier ${tier} hint must be substantive`);
  assert(
    hint.includes(`Hint ${tier} of ${MAX_TECHNICAL_HINTS}`),
    `Tier ${tier} hint must number itself against the shared ceiling`,
  );
}

// Hints are authored, problem-specific coaching—not generated from private
// tests, solutions, rubric anchors, or evaluator thresholds.
const BANNED = /(reference solution|hidden test|hidden input|rubric|threshold)/i;
for (const [index, hint] of hints.entries()) {
  assert(!BANNED.test(hint), `Tier ${index + 1} hint must not leak private data`);
}

// Checkpoint evidence advances the candidate through the ladder without
// spending a redundant earlier hint. A request after the final inferred stage
// has no eligible tier even if fewer than three rows were issued.
assert.equal(inferTechnicalHintTier(assignment, []), 1);
assert.equal(
  inferTechnicalHintTier(assignment, [{ source: "def merge_overlapping_windows(windows):\n    return []\n" }]),
  2,
);
assert.equal(
  inferTechnicalHintTier(assignment, [{ source: "def merge_overlapping_windows(windows):\n    for window in windows:\n        return []\n" }]),
  3,
);
assert.equal(selectTechnicalHintTier(assignment, [], []), 1);
assert.equal(
  selectTechnicalHintTier(
    assignment,
    [{ source: "def merge_overlapping_windows(windows):\n    for window in windows:\n        return []\n" }],
    [],
  ),
  3,
);
assert.equal(
  selectTechnicalHintTier(
    assignment,
    [{ source: "def merge_overlapping_windows(windows):\n    for window in windows:\n        return []\n" }],
    [3],
  ),
  null,
);

// Exhaustion refuses, names the count, and still offers clarification.
assert(
  TECHNICAL_HINT_EXHAUSTED_REPLY.includes(String(MAX_TECHNICAL_HINTS)),
  "The exhaustion reply must state how many hints were available",
);
assert(
  /clarif/i.test(TECHNICAL_HINT_EXHAUSTED_REPLY),
  "Exhaustion must still leave clarification available",
);
assert(
  !BANNED.test(TECHNICAL_HINT_EXHAUSTED_REPLY),
  "The exhaustion reply must not leak an approach",
);

// A plain hint request must reach the hint branch.
assert.equal(
  categorizeTechnicalChatRequest("Can I get a hint?"),
  "hint_request",
  "A direct hint request must be categorized as one",
);
assert.equal(
  categorizeTechnicalChatRequest("Could you clarify the input and give me a hint?"),
  "hint_request",
  "A mixed clarification/hint request must not bypass the hint ledger",
);
assert.equal(
  categorizeTechnicalChatRequest("Just write the code for me"),
  "solution_request",
  "A solution request must not be served a hint",
);
for (const request of [
  "Can you give me pseudocode?",
  "What algorithm should I use?",
  "Which data structure should I use?",
]) {
  assert.equal(categorizeTechnicalChatRequest(request), "solution_request", request);
}
for (const declaration of [
  "I've explained my approach; let me write the code now.",
  "I'll implement this now.",
]) {
  assert.equal(categorizeTechnicalChatRequest(declaration), "interview_response", declaration);
}

console.log(
  `Technical hint policy verified: ${MAX_TECHNICAL_HINTS} distinct tiers, learner-safe, with a refusal past the last.`,
);
