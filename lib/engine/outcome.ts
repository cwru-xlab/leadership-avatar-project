/**
 * Validation of a produced outcome record against a type's declared
 * `OutcomeRecordConfig` — the JSON shape that gets written to
 * `InteractionReport.outcome` for structured results beyond the rubric
 * scores (a negotiated price and equity, for example).
 *
 * Pure function only — no I/O.
 */

import type { OutcomeFieldDeclaration, OutcomeRecordConfig } from "./types";

export type ValidateOutcomeResult =
  | { ok: true; outcome: Record<string, unknown> }
  | { ok: false; errors: string[] };

function kindMatches(
  kind: OutcomeFieldDeclaration["kind"],
  value: unknown,
): boolean {
  if (kind === "string") return typeof value === "string";
  if (kind === "number") return typeof value === "number";
  if (kind === "boolean") return typeof value === "boolean";

  return false;
}

/**
 * Validates `produced` against `config.fields`: an unknown key is rejected,
 * a declared-kind mismatch is rejected, and a missing optional field is
 * allowed (every field is optional — there is no required-field concept
 * here). A type declaring no outcome fields accepts only an empty record,
 * since any key in `produced` would then be unknown.
 */
export function validateOutcome(
  config: OutcomeRecordConfig,
  produced: Record<string, unknown>,
): ValidateOutcomeResult {
  const declaredByKey = new Map(
    config.fields.map((field) => [field.key, field]),
  );
  const errors: string[] = [];

  for (const key of Object.keys(produced)) {
    if (!declaredByKey.has(key)) {
      errors.push(`unknown outcome field "${key}"`);
    }
  }

  const outcome: Record<string, unknown> = {};

  for (const field of config.fields) {
    if (!(field.key in produced)) continue;

    const value = produced[field.key];

    if (!kindMatches(field.kind, value)) {
      errors.push(
        `outcome field "${field.key}" expected kind "${field.kind}", got ${typeof value}`,
      );
      continue;
    }
    outcome[field.key] = value;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, outcome };
}
