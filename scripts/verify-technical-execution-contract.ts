import assert from "node:assert/strict";

import { getTechnicalAssignment } from "../lib/technical-interview/assignments.server";
import {
  buildPublicHarness,
  toPublicExecutionResult,
  validateTechnicalExecutionRequest,
} from "../lib/technical-interview/execution";

const assignment = getTechnicalAssignment("pair-sum");
assert(assignment, "Expected fixture assignment");

const accepted = validateTechnicalExecutionRequest({
  source: "def pair_sum(numbers, target):\n    return []\n",
  requestedTestIds: ["public-1"],
  idempotencyKey: "visible-tests-0001",
});
assert(accepted.ok, "Expected valid execution request");

for (const invalid of [
  {},
  { source: "", requestedTestIds: ["public-1"], idempotencyKey: "visible-tests-0001" },
  { source: "pass", requestedTestIds: [], idempotencyKey: "visible-tests-0001" },
  { source: "pass", requestedTestIds: ["public-1", "public-1"], idempotencyKey: "visible-tests-0001" },
  { source: "pass", requestedTestIds: ["public-1"], idempotencyKey: "short" },
]) {
  assert(!validateTechnicalExecutionRequest(invalid).ok, "Expected invalid execution request to be rejected");
}

const harness = buildPublicHarness(assignment, ["public-1"]);
assert(harness, "Expected public harness");
assert.equal(harness.publicTests.length, 1);
assert.equal(buildPublicHarness(assignment, ["hidden-1"]), null);
assert(!("hiddenTests" in harness), "Harness must never carry hidden cases");
assert(!("referenceSolution" in harness), "Harness must never carry reference code");

const safe = toPublicExecutionResult({
  status: "failed",
  errorCategory: "runtime_error",
  output: "x".repeat(5_000),
  publicResults: [{ id: "public-1", passed: false, message: "m".repeat(600) }],
  // These fields model accidental provider metadata and must not escape.
  ...({ providerExecutionId: "private", hiddenResult: true } as object),
});
assert.equal(safe.output?.length, 4_000);
assert.equal(safe.publicResults?.[0]?.message?.length, 500);
assert(!("providerExecutionId" in safe), "Provider metadata leaked to public result");
assert(!("hiddenResult" in safe), "Hidden result leaked to public result");

console.log("Technical execution contract verified.");
