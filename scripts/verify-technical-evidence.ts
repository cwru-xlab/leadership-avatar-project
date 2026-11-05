import assert from "node:assert/strict";

import {
  MAX_TECHNICAL_CHECKPOINTS,
  asTechnicalEvidence,
  finalizeTechnicalEvidence,
  validateTechnicalEvidence,
  validateTechnicalFinalSource,
} from "../lib/technical-interview/evidence";

const draft = validateTechnicalEvidence({
  version: 1,
  checkpoints: [{ source: "def solve():\n    pass\n" }],
});
assert(draft.ok, "Expected bounded source checkpoint evidence to validate");

const finalSource = validateTechnicalFinalSource("def solve():\n    return 1\n");
assert(finalSource.ok, "Expected final source to validate");
if (!draft.ok || !finalSource.ok) throw new Error("Unreachable validation failure");

const evidence = finalizeTechnicalEvidence(draft.value, finalSource.value);
assert.equal(asTechnicalEvidence(evidence)?.finalSource, finalSource.value);
assert(!validateTechnicalEvidence({ version: 1, checkpoints: Array(MAX_TECHNICAL_CHECKPOINTS + 1).fill({ source: "pass" }) }).ok);
assert(!validateTechnicalEvidence({ version: 2, checkpoints: [] }).ok);
assert(!validateTechnicalEvidence({ version: 1, checkpoints: [{ source: 42 }] }).ok);
assert(!validateTechnicalFinalSource("   ").ok);
assert.equal(asTechnicalEvidence({ version: 1, checkpoints: [], finalSource: "" }), null);

console.log("Technical evidence validation verified.");
