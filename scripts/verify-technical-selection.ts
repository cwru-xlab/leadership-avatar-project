/**
 * Selection must honor a request when it can and widen when it cannot, but it
 * must never fail to produce a problem — an empty pool would strand a student
 * at the start of an interview.
 */

import assert from "node:assert/strict";

import { TECHNICAL_ASSIGNMENTS } from "../lib/technical-interview/assignments.server";
import {
  normalizeTechnicalSelectionRequest,
  selectTechnicalAssignment,
} from "../lib/technical-interview/selection";
import { TECHNICAL_DIFFICULTIES, TECHNICAL_TOPICS } from "../lib/technical-interview/types";

const first = () => 0;
const catalog = TECHNICAL_ASSIGNMENTS;

// An unknown topic or difficulty from the browser is dropped, not trusted.
const dirty = normalizeTechnicalSelectionRequest({
  topics: ["graphs", "quantum-tunnelling", "graphs"],
  difficulty: "impossible",
  biasTopics: ["trees"],
});
assert.deepEqual(dirty.topics, ["graphs"], "Unknown topics are dropped and duplicates collapsed");
assert.equal(dirty.difficulty, null, "An unknown difficulty becomes no constraint");
assert.deepEqual(dirty.biasTopics, ["trees"]);

// Every topic and difficulty a picker can offer must actually be satisfiable
// without widening, or the UI would advertise a request it cannot honor.
for (const topic of TECHNICAL_TOPICS) {
  const outcome = selectTechnicalAssignment(catalog, { topics: [topic] }, first);
  assert(outcome, `topic ${topic} produced no assignment`);
  assert.equal(outcome.widened, false, `topic ${topic} had to widen`);
  assert(outcome.assignment.topics.includes(topic), `topic ${topic} served a mismatched problem`);
}
for (const difficulty of TECHNICAL_DIFFICULTIES) {
  const outcome = selectTechnicalAssignment(catalog, { difficulty }, first);
  assert(outcome, `difficulty ${difficulty} produced no assignment`);
  assert.equal(outcome.widened, false, `difficulty ${difficulty} had to widen`);
  assert.equal(outcome.assignment.difficulty, difficulty);
}

// Both constraints together, when the pair exists.
const graphsHard = selectTechnicalAssignment(
  catalog,
  { topics: ["graphs"], difficulty: "hard" },
  first,
);
assert(graphsHard && !graphsHard.widened, "graphs+hard should be satisfiable exactly");
assert.equal(graphsHard.basis, "topic-and-difficulty");

// An unsatisfiable PAIR still yields a problem of the right topic, flagged as
// widened. Topic is kept over difficulty: the wrong kind of problem is worse
// than one a notch off the requested level.
const narrow = selectTechnicalAssignment(
  catalog,
  { topics: ["binary-search"], difficulty: "easy" },
  first,
);
assert(narrow, "an unsatisfiable pair must still produce a problem");
if (narrow.widened) {
  assert.equal(narrow.basis, "topic-only", "widening keeps the topic before the difficulty");
  assert(narrow.assignment.topics.includes("binary-search"));
}

// A bias is a tiebreak only: an explicit topic always wins.
const explicitWins = selectTechnicalAssignment(
  catalog,
  { topics: ["trees"], biasTopics: ["graphs"] },
  first,
);
assert(explicitWins?.assignment.topics.includes("trees"), "An explicit topic outranks a bias");
assert.equal(explicitWins?.basis, "topic-only");

const biasOnly = selectTechnicalAssignment(catalog, { biasTopics: ["graphs"] }, first);
assert.equal(biasOnly?.basis, "bias-topic", "A bias alone still narrows the pool");
assert(biasOnly?.assignment.topics.includes("graphs"));

// No request at all is the old uniform behavior, and is not "widened".
const any = selectTechnicalAssignment(catalog, {}, first);
assert.equal(any?.basis, "any");
assert.equal(any?.widened, false);
assert.equal(any?.poolSize, catalog.length);

// The random index is respected, so every problem in a pool is reachable.
const last = selectTechnicalAssignment(catalog, {}, (max) => max - 1);
assert.equal(last?.assignment.id, catalog[catalog.length - 1]?.id);

// An empty catalog is the one case with no answer; the caller must handle it.
assert.equal(selectTechnicalAssignment([], {}, first), null);

console.log(
  `Technical selection verified across ${TECHNICAL_TOPICS.length} topics and ` +
    `${TECHNICAL_DIFFICULTIES.length} difficulties over ${catalog.length} problems.`,
);
