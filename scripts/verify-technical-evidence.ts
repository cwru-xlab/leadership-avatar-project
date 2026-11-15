import assert from "node:assert/strict";

import {
  KEEP_FIRST_TECHNICAL_VISIBLE_TURNS,
  MAX_TECHNICAL_CHECKPOINTS,
  MAX_TECHNICAL_VISIBLE_TURNS,
  parseStoredTechnicalEvidence,
  appendServerVisibleTurns,
  asTechnicalEvidence,
  emptyTechnicalEvidence,
  replaceCandidateCheckpoints,
  setFinalSource,
  validateTechnicalCheckpoints,
  validateTechnicalFinalSource,
} from "../lib/technical-interview/evidence";

const checkpoints = validateTechnicalCheckpoints({
  version: 1,
  checkpoints: [{ source: "def solve():\n    pass\n" }],
});
assert(checkpoints.ok, "Expected bounded source checkpoint payload to validate");
assert(!validateTechnicalCheckpoints({ version: 1, checkpoints: [], visibleTurns: [] }).ok, "Browser must not write transcript evidence");
assert(!validateTechnicalCheckpoints({ version: 1, checkpoints: [], issuedHints: [] }).ok, "Browser must not write hints");
assert(!validateTechnicalCheckpoints({ version: 1, checkpoints: [], finalExecution: { status: "completed" } }).ok, "Browser must not write execution evidence");
assert(!validateTechnicalCheckpoints({ version: 1, checkpoints: Array(MAX_TECHNICAL_CHECKPOINTS + 1).fill({ source: "pass" }) }).ok);
assert(!validateTechnicalCheckpoints({ version: 2, checkpoints: [] }).ok);
assert(!validateTechnicalCheckpoints({ version: 1, checkpoints: [{ source: 42 }] }).ok);

if (!checkpoints.ok) throw new Error("Unreachable validation failure");
const withSource = replaceCandidateCheckpoints(emptyTechnicalEvidence(), checkpoints.value);
const withTranscript = appendServerVisibleTurns(withSource, [{ role: "user", content: "I would first clarify the input contract." }, { role: "assistant", content: "What boundary case would you test?" }]);
const preserved = replaceCandidateCheckpoints(withTranscript, { version: 1, checkpoints: [{ source: "def solve():\n    return 1\n" }] });
assert.equal(preserved.visibleTurns.length, 2, "Checkpoint updates must preserve server transcript");
assert.equal(preserved.finalExecution, null, "No executor means deterministic correctness is unavailable");

const finalSource = validateTechnicalFinalSource("def solve():\n    return 1\n");
assert(finalSource.ok, "Expected final source to validate");
const javascriptFinalSource = validateTechnicalFinalSource("function solve() { return 1; }");
assert(javascriptFinalSource.ok, "Expected JavaScript final source to validate");
if (!finalSource.ok) throw new Error("Unreachable final source validation failure");
const complete = setFinalSource(preserved, finalSource.value);
assert.equal(asTechnicalEvidence(complete)?.finalSource, finalSource.value);
assert.equal(asTechnicalEvidence({ version: 1, checkpoints: [], visibleTurns: [], finalSource: "pass" })?.finalExecution, null, "Legacy evidence normalizes execution to null");
const missingFinalSource = validateTechnicalFinalSource("   ");
assert(!missingFinalSource.ok);
if (!missingFinalSource.ok) {
  assert.equal(missingFinalSource.error, "Final source code is required");
  assert(!/python/i.test(missingFinalSource.error), "Final source error must support every language");
}

// G4 (2026-11-15): every server turn carries its own server time.
const t1 = appendServerVisibleTurns(emptyTechnicalEvidence(), [{ role: "assistant", content: "Opening" }], 1_000);
const t2 = appendServerVisibleTurns(t1, [{ role: "user", content: "I'd clarify first." }], 61_000);
assert.deepEqual(t2.visibleTurns.map((turn) => turn.timestamp), [1_000, 61_000], "Each turn keeps the time it was recorded");
assert.deepEqual(parseStoredTechnicalEvidence(JSON.parse(JSON.stringify(t2)))?.visibleTurns.map((turn) => turn.timestamp), [1_000, 61_000], "Timestamps survive a JSON round trip");
// Records written before per-turn stamps still parse, with no timestamp.
const legacy = parseStoredTechnicalEvidence({ version: 1, checkpoints: [], visibleTurns: [{ role: "user", content: "hi" }], finalExecution: null });
assert(legacy && legacy.visibleTurns[0]!.timestamp === undefined, "Legacy turns without timestamps still parse");
assert(parseStoredTechnicalEvidence({ version: 1, checkpoints: [], visibleTurns: [{ role: "user", content: "hi", timestamp: "x" }] }), "A malformed timestamp is dropped, not fatal");
// A caller cannot smuggle extra fields (or a client-chosen time) into the record.
const smuggled = appendServerVisibleTurns(emptyTechnicalEvidence(), [{ role: "user", content: "x", timestamp: 5, extra: 1 } as never], 9_000);
assert.deepEqual(Object.keys(smuggled.visibleTurns[0]!).sort(), ["content", "role", "timestamp"]);
assert.equal(smuggled.visibleTurns[0]!.timestamp, 9_000);

// G13: first-N plus last-M cap keeps the opening clarification.
let long = emptyTechnicalEvidence();
for (let i = 0; i < MAX_TECHNICAL_VISIBLE_TURNS + 20; i += 1) {
  long = appendServerVisibleTurns(long, [{ role: i % 2 ? "user" : "assistant", content: `turn ${i}` }], 1_000 + i);
}
assert.equal(long.visibleTurns.length, MAX_TECHNICAL_VISIBLE_TURNS);
assert.equal(long.visibleTurns[0]!.content, "turn 0", "The opening survives the cap");
assert.equal(long.visibleTurns[KEEP_FIRST_TECHNICAL_VISIBLE_TURNS - 1]!.content, `turn ${KEEP_FIRST_TECHNICAL_VISIBLE_TURNS - 1}`);
assert.equal(long.visibleTurns.at(-1)!.content, `turn ${MAX_TECHNICAL_VISIBLE_TURNS + 19}`, "The latest turn is kept");
assert.equal(long.omittedVisibleTurns, 20, "The dropped middle is counted");
assert(parseStoredTechnicalEvidence(JSON.parse(JSON.stringify(long))), "A capped record still parses");

console.log("Technical evidence validation verified.");
