import {
  isTechnicalDifficulty,
  isTechnicalTopic,
  type TechnicalAssignmentPrivate,
} from "./types";

export interface AssignmentCatalogValidation {
  ok: boolean;
  errors: string[];
}

/** Pure structural validation used during CI before a catalog reaches sessions. */
/** Enough problems that topic and difficulty filters still have something to pick. */
export const MIN_CATALOG_SIZE = 20;

export function validateTechnicalAssignmentCatalog(
  catalog: readonly TechnicalAssignmentPrivate[],
): AssignmentCatalogValidation {
  const errors: string[] = [];
  const ids = new Set<string>();

  // A floor, not an exact count: the catalog grows, and pinning the number
  // meant every import blocked on editing this file. The shape checks below
  // are what actually protect a session.
  if (catalog.length < MIN_CATALOG_SIZE) {
    errors.push(`expected at least ${MIN_CATALOG_SIZE} assignments, received ${catalog.length}`);
  }

  for (const assignment of catalog) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assignment.id)) {
      errors.push(`${assignment.id}: id must be kebab-case`);
    }
    if (ids.has(assignment.id)) errors.push(`${assignment.id}: duplicate id`);
    ids.add(assignment.id);

    if (!assignment.version || !assignment.contentHash) {
      errors.push(`${assignment.id}: version and content hash are required`);
    }
    if (!assignment.statement.trim() || !assignment.starterCode.trim()) {
      errors.push(`${assignment.id}: statement and starter code are required`);
    }
    if (assignment.publicTestCases.length === 0 || assignment.hiddenTests.length === 0) {
      errors.push(`${assignment.id}: needs public and hidden tests`);
    }
    if (assignment.publicTests.length !== assignment.publicTestCases.length) {
      errors.push(`${assignment.id}: public test metadata does not match public cases`);
    }
    const testIds = new Set<string>();
    for (const test of [...assignment.publicTestCases, ...assignment.hiddenTests]) {
      if (!test.id || testIds.has(test.id)) {
        errors.push(`${assignment.id}: test ids must be non-empty and unique`);
      }
      testIds.add(test.id);
    }
    // The browser harness calls `target(*test["input"])`, so `input` is the
    // ARGUMENT LIST, not the first argument. Two entries shipped a bare
    // operations list, which spread into one argument per operation and made
    // the problem unsolvable. A non-array input is almost always that mistake.
    for (const test of [...assignment.publicTestCases, ...assignment.hiddenTests]) {
      if (!Array.isArray(test.input)) {
        errors.push(
          `${assignment.id}/${test.id}: test input must be the argument list (wrap it in an array)`,
        );
      }
    }

    if (assignment.topics.length === 0) {
      errors.push(`${assignment.id}: needs at least one topic`);
    }
    for (const topic of assignment.topics) {
      if (!isTechnicalTopic(topic)) errors.push(`${assignment.id}: unknown topic "${topic}"`);
    }
    if (new Set(assignment.topics).size !== assignment.topics.length) {
      errors.push(`${assignment.id}: duplicate topic`);
    }
    if (!isTechnicalDifficulty(assignment.difficulty)) {
      errors.push(`${assignment.id}: unknown difficulty "${assignment.difficulty}"`);
    }
    if (assignment.executionLimits.timeoutMs <= 0 || assignment.executionLimits.memoryMb <= 0 || assignment.executionLimits.maxOutputBytes <= 0) {
      errors.push(`${assignment.id}: execution limits must be positive`);
    }
  }

  return { ok: errors.length === 0, errors };
}
