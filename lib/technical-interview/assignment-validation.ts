import type { TechnicalAssignmentPrivate } from "./types";

export interface AssignmentCatalogValidation {
  ok: boolean;
  errors: string[];
}

/** Pure structural validation used during CI before a catalog reaches sessions. */
export function validateTechnicalAssignmentCatalog(
  catalog: readonly TechnicalAssignmentPrivate[],
): AssignmentCatalogValidation {
  const errors: string[] = [];
  const ids = new Set<string>();

  if (catalog.length !== 20) {
    errors.push(`expected exactly 20 assignments, received ${catalog.length}`);
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
    if (assignment.executionLimits.timeoutMs <= 0 || assignment.executionLimits.memoryMb <= 0 || assignment.executionLimits.maxOutputBytes <= 0) {
      errors.push(`${assignment.id}: execution limits must be positive`);
    }
  }

  return { ok: errors.length === 0, errors };
}
