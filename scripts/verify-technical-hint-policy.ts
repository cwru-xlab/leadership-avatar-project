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
} from "../lib/technical-interview/chat-policy";

const assignment = {
  title: "Merge Overlapping Windows",
  constraints: ["1 <= n <= 10^5", "Intervals may be unsorted"],
  expectedComplexity: "O(n log n) time, O(n) space",
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

// Hints cite only learner-visible fields. They must never name the thing that
// solves the problem, nor reference private catalog data.
const BANNED =
  /(reference solution|hidden test|hidden input|rubric|threshold|use a (hash|heap|stack|queue|trie)|binary search|dynamic programming|memoiz|two pointer|sort the intervals)/i;
for (const [index, hint] of hints.entries()) {
  assert(
    !BANNED.test(hint),
    `Tier ${index + 1} hint must not name an approach or private data`,
  );
}

// The published complexity target is learner-visible, so quoting it is fine;
// the title and constraints are too.
assert(
  hints[1].includes(assignment.expectedComplexity),
  "Tier 2 should hold the candidate against the published target",
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
  categorizeTechnicalChatRequest("Just write the code for me"),
  "solution_request",
  "A solution request must not be served a hint",
);

console.log(
  `Technical hint policy verified: ${MAX_TECHNICAL_HINTS} distinct tiers, learner-safe, with a refusal past the last.`,
);
