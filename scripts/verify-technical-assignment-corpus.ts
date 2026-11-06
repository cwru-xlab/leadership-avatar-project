import { TECHNICAL_ASSIGNMENTS } from "../lib/technical-interview/assignments.server";
import { validateTechnicalAssignmentCatalog } from "../lib/technical-interview/assignment-validation";
import { toPublicTechnicalAssignment } from "../lib/technical-interview/types";

const validation = validateTechnicalAssignmentCatalog(TECHNICAL_ASSIGNMENTS);
if (!validation.ok) {
  throw new Error(`Technical assignment catalog is invalid:\n${validation.errors.join("\n")}`);
}

for (const assignment of TECHNICAL_ASSIGNMENTS) {
  const publicAssignment = toPublicTechnicalAssignment(assignment);
  for (const forbidden of ["referenceSolution", "hiddenTests", "publicTestCases", "rubricAnchors", "executionLimits"]) {
    if (forbidden in publicAssignment) {
      throw new Error(`${assignment.id}: learner-safe assignment leaks ${forbidden}`);
    }
  }
}

console.log(`Verified ${TECHNICAL_ASSIGNMENTS.length} technical coding assignments.`);
