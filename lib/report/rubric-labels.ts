/**
 * Display labels for `StructuredReport.rubric_notes[].item`.
 *
 * WHY THIS EXISTS: `item` is MODEL-PRODUCED free text, not a validated key.
 * It is unlike `growth_areas[].dimension`, which `rubricDimensionKey` narrows
 * against the registry on ingest. Every evaluator prompt names its dimensions
 * as "Opening & agenda (opening_agenda)", and models sometimes echo the
 * parenthesised key instead of the label — sometimes with the `_score` suffix
 * of the adjacent score field ("discovery_tailoring_score").
 *
 * FIXED AT DISPLAY, NOT INGEST: 10 of 106 structured reports already stored
 * carry a raw identifier. Those rows cannot be re-evaluated, so resolving on
 * the way out is the only fix that repairs existing reports as well as new
 * ones. Every raw identifier observed in the stored data resolves through
 * `rubricItemLabel` once the `_score` suffix is stripped.
 *
 * NOT applied to `composeReportMarkdown`: that text is regex-scanned by
 * `lib/study-plan/generate.ts`'s `extractBehavioralFeedback` for
 * `- Item: Note` pairs, and its rubric section is only ever RENDERED for
 * legacy reports, which were composed before this module existed. Rewriting
 * it would change a machine-read string for no display gain.
 */

import type { RubricDimension } from "@/lib/engine/types";

/** Key -> label, from the practice type's own declared dimensions. */
export function rubricLabelMap(dimensions: RubricDimension[] | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dim of dimensions ?? []) out[dim.key] = dim.label;
  return out;
}

/**
 * The label to show for one `rubric_notes[].item`.
 *
 * Conservative by design — the input may already be the prose label the
 * prompt asked for, and mangling good text is worse than leaving a rare
 * unknown key alone:
 *
 * - Anything containing whitespace is already prose. Returned untouched.
 * - A single word with no separator ("Clarity", "ICE") is looked up, then
 *   returned as written. It is never case-folded, so acronyms survive.
 * - A snake/kebab identifier is looked up (with `_score` stripped), and only
 *   humanized if the registry does not know it — which happens when a type
 *   has since renamed or dropped that dimension.
 */
export function rubricItemLabel(item: string, labels: Record<string, string>): string {
  const trimmed = item.trim();
  if (!trimmed) return trimmed;
  if (/\s/.test(trimmed)) return trimmed;

  const bare = trimmed.replace(/_score$/i, "");
  const normalized = bare.toLowerCase().replace(/-/g, "_");
  const known = labels[bare] ?? labels[normalized];
  if (known) return known;

  // No separator: assume the model wrote a real word, not a key.
  if (!/[_-]/.test(bare)) return trimmed;

  const words = normalized.split("_").filter(Boolean);
  if (!words.length) return trimmed;
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}
