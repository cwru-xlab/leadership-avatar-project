import assert from "node:assert/strict";

import {
  TECHNICAL_ASSIGNMENTS,
  listHistoricalTechnicalAssignmentTuples,
  resolveTechnicalAssignment,
} from "../lib/technical-interview/assignments.server";
import { TECHNICAL_HISTORICAL_V1_HINT_UNAVAILABLE_REPLY } from "../lib/technical-interview/chat-policy";

const historical = listHistoricalTechnicalAssignmentTuples();
assert(
  historical.length > TECHNICAL_ASSIGNMENTS.length,
  "Expected multiple historical v1 catalog generations",
);

for (const tuple of historical) {
  const resolved = resolveTechnicalAssignment(
    tuple.assignmentId,
    tuple.assignmentVersion,
    tuple.assignmentHash,
  );
  assert(
    resolved,
    `Historical tuple must resolve: ${tuple.assignmentId}/${tuple.generation}`,
  );
  assert.equal(
    resolved.historicalV1,
    true,
    "Historical tuple must not be treated as current v2",
  );
  assert.equal(
    resolved.assignment.id,
    tuple.assignmentId,
    "Resolver must preserve assignment identity",
  );

  assert.equal(
    resolveTechnicalAssignment(
      tuple.assignmentId,
      tuple.assignmentVersion,
      `${tuple.assignmentHash}x`,
    ),
    null,
    "A near-match hash must not resolve",
  );
}

for (const assignment of TECHNICAL_ASSIGNMENTS) {
  const resolved = resolveTechnicalAssignment(
    assignment.id,
    assignment.version,
    assignment.contentHash,
  );
  assert(resolved, `Current tuple must resolve: ${assignment.id}`);
  assert.equal(
    resolved.historicalV1,
    false,
    "Current v2 tuple must remain current",
  );
}

assert.match(
  TECHNICAL_HISTORICAL_V1_HINT_UNAVAILABLE_REPLY,
  /Hints are unavailable/i,
);
assert.match(TECHNICAL_HISTORICAL_V1_HINT_UNAVAILABLE_REPLY, /clarify/i);

console.log(
  `Technical revision compatibility verified: ${historical.length} exact v1 tuples and ${TECHNICAL_ASSIGNMENTS.length} current v2 tuples.`,
);
