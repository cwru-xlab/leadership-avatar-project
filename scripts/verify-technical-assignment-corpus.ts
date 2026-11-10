import { TECHNICAL_ASSIGNMENTS } from "../lib/technical-interview/assignments.server";
import { validateTechnicalAssignmentCatalog } from "../lib/technical-interview/assignment-validation";
import { asInputSnapshot } from "../lib/report/snapshot";
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
  for (const forbidden of [
    "referenceSolution",
    "hintLadder",
    "hiddenTests",
    "publicTestCases",
    "rubricAnchors",
    "executionLimits",
  ]) {
    if (forbidden in publicAssignment) {
      throw new Error(`${assignment.id}: learner-safe assignment leaks ${forbidden}`);
    }
  }

  const pythonSignature = /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/m.exec(
    publicAssignment.starterCode,
  );
  const javaScriptSignature = /^\s*function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/m.exec(
    publicAssignment.starterCodeByLanguage.javascript,
  );
  if (
    !pythonSignature ||
    !javaScriptSignature ||
    pythonSignature[1] !== javaScriptSignature[1] ||
    pythonSignature[2] !== javaScriptSignature[2]
  ) {
    throw new Error(`${assignment.id}: JavaScript starter must preserve the Python entry signature`);
  }
  if (!publicAssignment.starterCodeByLanguage.python?.trim()) {
    throw new Error(`${assignment.id}: every assignment must provide a Python starter`);
  }
  if (!publicAssignment.starterCodeByLanguage.javascript?.trim()) {
    throw new Error(`${assignment.id}: every assignment must provide a JavaScript starter`);
  }
}

const sample = toPublicTechnicalAssignment(TECHNICAL_ASSIGNMENTS[0]);
const javascriptSnapshot = asInputSnapshot({
  kind: "technical-coding",
  assignmentId: sample.id,
  assignmentVersion: sample.version,
  assignmentHash: sample.contentHash,
  assignment: sample,
  language: "javascript",
  runtimePolicyVersion: "browser-wasm-runtime-v2",
  selectedAt: new Date().toISOString(),
});
if (javascriptSnapshot?.kind !== "technical-coding" || javascriptSnapshot.language !== "javascript") {
  throw new Error("A JavaScript technical-coding snapshot must remain readable in reports");
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
