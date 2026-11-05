import assert from "node:assert/strict";

import {
  MAX_TECHNICAL_CHECKPOINTS,
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
if (!finalSource.ok) throw new Error("Unreachable final source validation failure");
const complete = setFinalSource(preserved, finalSource.value);
assert.equal(asTechnicalEvidence(complete)?.finalSource, finalSource.value);
assert.equal(asTechnicalEvidence({ version: 1, checkpoints: [], visibleTurns: [], finalSource: "pass" })?.finalExecution, null, "Legacy evidence normalizes execution to null");
assert(!validateTechnicalFinalSource("   ").ok);

console.log("Technical evidence validation verified.");
