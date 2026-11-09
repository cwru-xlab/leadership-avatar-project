/**
 * Guards `rubric_notes[].item` against leaking a raw dimension identifier
 * into the report UI.
 *
 * WHY: `item` is model-produced free text, NOT a key narrowed on ingest.
 * Evaluator prompts name dimensions as "Opening & agenda (opening_agenda)",
 * and models sometimes echo the parenthesised key, sometimes with the
 * `_score` suffix of the adjacent score field. A student then reads
 * "opening_agenda" and "explanation_planning" in the Content tab.
 *
 * The identifiers below are the ones ACTUALLY FOUND in stored reports
 * (10 of 106 structured rows carried one), not invented examples. Each must
 * resolve to prose through its type's declared dimensions.
 *
 * Run: npx tsx scripts/verify-rubric-item-labels.ts
 */

import { listRubricDimensionsForSlug } from "../lib/engine/resolve";
import { allRubricDimensionKeys } from "../lib/mastery/competencies";
import { rubricItemLabel, rubricLabelMap } from "../lib/report/rubric-labels";

let failed = 0;

function check(label: string, ok: boolean) {
  console.log(`  ${ok ? "ok" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}

function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(`${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`, ok);
}

const looksLikeIdentifier = (s: string) => /^[a-z0-9]+([_-][a-z0-9]+)+$/.test(s.trim());

console.log("Rubric item labels — no raw identifier reaches the report UI\n");

// 1. Every identifier observed in the stored data resolves to prose.
//    `slug: null` means "any type" — the shared four are in every map.
const OBSERVED: { slug: string; items: string[] }[] = [
  { slug: "clinical-communication", items: ["opening_agenda", "information_gathering", "empathy_clinical", "explanation_planning"] },
  { slug: "motivational-interviewing", items: ["cultivating_change_talk", "softening_sustain_talk", "empathy_mi"] },
  { slug: "difficult-conversation", items: ["holding_the_line", "objective_achieved", "clarity_score", "empathy_score", "holding_the_line_score", "objective_achieved_score"] },
  { slug: "pitch-elevator", items: ["discovery_tailoring", "discovery_tailoring_score", "concision_score"] },
  { slug: "general", items: ["visual_score", "vocal_score", "content_score", "behavioral_score"] },
];

for (const { slug, items } of OBSERVED) {
  const labels = rubricLabelMap(listRubricDimensionsForSlug(slug));
  for (const item of items) {
    const out = rubricItemLabel(item, labels);
    check(
      `${slug}: "${item}" -> "${out}"${looksLikeIdentifier(out) ? " (still an identifier)" : ""}`,
      !looksLikeIdentifier(out) && out.length > 0,
    );
  }
}

// 2. Every key of every type resolves, so a type added later is covered too
//    rather than only the keys that happen to be in the database today.
const unresolved: string[] = [];
for (const slug of ["clinical-communication", "motivational-interviewing", "difficult-conversation", "networking", "pitch-elevator", "pitch-deck", "consulting", "technical", "general"]) {
  const dims = listRubricDimensionsForSlug(slug);
  const labels = rubricLabelMap(dims);
  for (const dim of dims ?? []) {
    for (const variant of [dim.key, `${dim.key}_score`]) {
      const out = rubricItemLabel(variant, labels);
      if (looksLikeIdentifier(out)) unresolved.push(`${slug}:${variant}`);
    }
  }
}
check(
  `every declared dimension key and its _score variant resolves${unresolved.length ? ` — ${unresolved.join(", ")}` : ""}`,
  unresolved.length === 0,
);

// 3. Prose the model wrote correctly is NEVER touched. This is the risk of
//    the fix itself: mangling good labels to catch rare bad ones.
const labels = rubricLabelMap(listRubricDimensionsForSlug("clinical-communication"));
eq('prose is untouched: "Opening & agenda"', rubricItemLabel("Opening & agenda", labels), "Opening & agenda");
eq('prose is untouched: "Empathy & cues"', rubricItemLabel("Empathy & cues", labels), "Empathy & cues");
eq("multi-word prose is untouched", rubricItemLabel("Body language and camera presence", labels), "Body language and camera presence");
eq("a single capitalized word is untouched", rubricItemLabel("Clarity", labels), "Clarity");
eq("an acronym is not case-folded", rubricItemLabel("ICE", labels), "ICE");
eq("case is preserved on unknown single words", rubricItemLabel("Rapport", labels), "Rapport");

// 4. Known keys map to the type's OWN label, not a generic humanization.
eq('"opening_agenda" uses the declared label', rubricItemLabel("opening_agenda", labels), "Opening & agenda");
eq('"empathy_clinical" uses the declared label', rubricItemLabel("empathy_clinical", labels), "Empathy & cues");
eq('"explanation_planning" uses the declared label', rubricItemLabel("explanation_planning", labels), "Explanation & closing");
const mi = rubricLabelMap(listRubricDimensionsForSlug("motivational-interviewing"));
eq('"empathy_mi" reads as "Empathy", not "Empathy mi"', rubricItemLabel("empathy_mi", mi), "Empathy");

// 5. An unknown identifier still degrades to prose rather than rendering raw:
//    a dimension a type has since renamed or dropped.
eq("an unknown key is humanized", rubricItemLabel("some_removed_dimension", labels), "Some removed dimension");
eq("a kebab key is humanized", rubricItemLabel("goal-progress", {}), "Goal progress");
eq("an unknown _score key is humanized", rubricItemLabel("mystery_thing_score", {}), "Mystery thing");

// 6. Degenerate input does not throw or render junk.
eq("empty stays empty", rubricItemLabel("", labels), "");
eq("whitespace-only stays as-is", rubricItemLabel("   ", labels), "");
eq("underscores alone fall back to the input", rubricItemLabel("___", {}), "___");

// 7. The label map is non-vacuous — a resolver over an empty map would pass
//    every check above by doing nothing.
const clinicalDims = listRubricDimensionsForSlug("clinical-communication") ?? [];
check(`clinical-communication declares dimensions (${clinicalDims.length})`, clinicalDims.length >= 8);
check(
  `the registry knows every observed key`,
  OBSERVED.flatMap((o) => o.items)
    .map((i) => i.replace(/_score$/, ""))
    .every((k) => allRubricDimensionKeys().includes(k)),
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll rubric item labels resolve to prose.");
process.exit(0);
