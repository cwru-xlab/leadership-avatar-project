import { TECHNICAL_ASSIGNMENTS } from "../lib/technical-interview/assignments.server";
import { validateTechnicalAssignmentCatalog } from "../lib/technical-interview/assignment-validation";
import {
  TECHNICAL_DIFFICULTIES,
  TECHNICAL_TOPICS,
  toPublicTechnicalAssignment,
} from "../lib/technical-interview/types";

const validation = validateTechnicalAssignmentCatalog(TECHNICAL_ASSIGNMENTS);
if (!validation.ok) {
  throw new Error(`Technical assignment catalog is invalid:\n${validation.errors.join("\n")}`);
}

for (const assignment of TECHNICAL_ASSIGNMENTS) {
  const publicAssignment = toPublicTechnicalAssignment(assignment);
  for (const forbidden of ["referenceSolution", "hintLadder", "hiddenTests", "publicTestCases", "rubricAnchors", "executionLimits"]) {
    if (forbidden in publicAssignment) {
      throw new Error(`${assignment.id}: learner-safe assignment leaks ${forbidden}`);
    }
  }
}

// Topic and difficulty are only useful if a filter can still find something.
// A topic claimed by the picker but held by no problem would strand a request.
const byTopic = new Map<string, number>();
const byDifficulty = new Map<string, number>();
for (const assignment of TECHNICAL_ASSIGNMENTS) {
  for (const topic of assignment.topics) byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
  byDifficulty.set(assignment.difficulty, (byDifficulty.get(assignment.difficulty) ?? 0) + 1);
}
for (const difficulty of TECHNICAL_DIFFICULTIES) {
  if (!byDifficulty.get(difficulty)) {
    throw new Error(`No assignment is tagged "${difficulty}"; that request would find nothing`);
  }
}
const emptyTopics = TECHNICAL_TOPICS.filter((topic) => !byTopic.get(topic));

console.log(
  `Verified ${TECHNICAL_ASSIGNMENTS.length} technical coding assignments ` +
    `(${[...byDifficulty].map(([k, v]) => `${k} ${v}`).join(", ")}; ` +
    `${byTopic.size}/${TECHNICAL_TOPICS.length} topics covered).`,
);
if (emptyTopics.length) {
  console.warn(`Topics with no problem yet: ${emptyTopics.join(", ")}`);
}
