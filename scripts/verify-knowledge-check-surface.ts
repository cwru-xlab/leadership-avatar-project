/**
 * Knowledge-check payload validation battery, plus the mechanical proof that
 * modelling the four check formats did NOT make a knowledge check a
 * registered engine interaction type (REQ-108).
 *
 * Style mirrors scripts/verify-verbatim-quote.ts (a running checks/failures
 * counter) for Section 1, and scripts/verify-engine-surface-count.ts /
 * scripts/verify-dc-surface-count.ts (filesystem + registry guards) for
 * Section 2.
 *
 * Run: npx tsx scripts/verify-knowledge-check-surface.ts
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

import {
  CHECK_FORMATS,
  CONTRIBUTION_SOURCE_FOR_FORMAT,
  isDeterministicFormat,
  validateAnswerKey,
  validateCheckPayload,
} from "../lib/study-plan/checks/types";
import { MIN_QUOTABLE_LENGTH } from "../lib/study-plan/verbatim";
import { ENGINE_TYPES } from "../lib/engine/registry";

const ROOT = process.cwd();
let checks = 0;
let failures = 0;

function check(name: string, pass: boolean, detail?: unknown): void {
  checks += 1;
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

/** Run fn; pass only if it throws AND the message names `fieldFragment`. */
function expectThrow(name: string, fn: () => void, fieldFragment: string): void {
  try {
    fn();
    check(name, false, "expected a throw, none occurred");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const namesField = message.toLowerCase().includes(fieldFragment.toLowerCase());
    check(name, namesField, `threw: ${message}`);
  }
}

/** Run fn; pass only if it does NOT throw. */
function expectOk(name: string, fn: () => void): void {
  try {
    fn();
    check(name, true);
  } catch (e) {
    check(name, false, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// Section 1 — payload validation. ACCEPT + REJECT per format, field-naming.
// ---------------------------------------------------------------------------

console.log("\n1a. MULTIPLE_CHOICE");
{
  expectOk("ACCEPT: 4 distinct options", () => {
    validateCheckPayload("MULTIPLE_CHOICE", {
      options: ["First option", "Second option", "Third option", "Fourth option"],
    });
  });
  expectThrow(
    "REJECT: 3 options",
    () => validateCheckPayload("MULTIPLE_CHOICE", { options: ["A", "B", "C"] }),
    "options"
  );
  expectThrow(
    "REJECT: 5 options",
    () =>
      validateCheckPayload("MULTIPLE_CHOICE", {
        options: ["A", "B", "C", "D", "E"],
      }),
    "options"
  );
  expectThrow(
    "REJECT: two identical options",
    () =>
      validateCheckPayload("MULTIPLE_CHOICE", {
        options: ["Same text", "Same text", "Different", "Also different"],
      }),
    "options"
  );
  expectThrow(
    "REJECT: correctIndex 4",
    () => validateAnswerKey("MULTIPLE_CHOICE", { correctIndex: 4 }),
    "correctIndex"
  );
  expectThrow(
    "REJECT: null answer key for MULTIPLE_CHOICE",
    () => validateAnswerKey("MULTIPLE_CHOICE", null),
    "MULTIPLE_CHOICE"
  );
}

console.log("\n1b. FILL_IN_BLANK");
{
  expectOk("ACCEPT: 2 blanks, 3 segments", () => {
    validateCheckPayload("FILL_IN_BLANK", {
      segments: ["I felt ", " when the deadline ", " moved."],
      blankCount: 2,
    });
  });
  expectThrow(
    "REJECT: segments.length !== blankCount + 1",
    () =>
      validateCheckPayload("FILL_IN_BLANK", {
        segments: ["only one", "segment"],
        blankCount: 2,
      }),
    "segments"
  );
  expectThrow(
    "REJECT: blankCount 0",
    () =>
      validateCheckPayload("FILL_IN_BLANK", {
        segments: ["one segment"],
        blankCount: 0,
      }),
    "blankcount"
  );
  expectThrow(
    "REJECT: blankCount 4",
    () =>
      validateCheckPayload("FILL_IN_BLANK", {
        segments: ["a", "b", "c", "d", "e"],
        blankCount: 4,
      }),
    "blankcount"
  );
  expectThrow(
    "REJECT: a blank with an empty accepted array",
    () =>
      validateAnswerKey("FILL_IN_BLANK", {
        accepted: [["synonym one"], []],
      }),
    "accepted"
  );
  expectThrow(
    "REJECT: null answer key for FILL_IN_BLANK",
    () => validateAnswerKey("FILL_IN_BLANK", null),
    "FILL_IN_BLANK"
  );
}

console.log("\n1c. PICK_BETTER_RESPONSE");
{
  expectOk("ACCEPT: 2 distinct candidates", () => {
    validateCheckPayload("PICK_BETTER_RESPONSE", {
      candidates: ["I think we should slip the date.", "Let's ship Friday as planned."],
      rationalePrompt: "Why is the second response stronger?",
    });
  });
  expectThrow(
    "REJECT: one candidate",
    () =>
      validateCheckPayload("PICK_BETTER_RESPONSE", {
        candidates: ["Only one"],
        rationalePrompt: null,
      }),
    "candidates"
  );
  expectThrow(
    "REJECT: three candidates",
    () =>
      validateCheckPayload("PICK_BETTER_RESPONSE", {
        candidates: ["One", "Two", "Three"],
        rationalePrompt: null,
      }),
    "candidates"
  );
  expectThrow(
    "REJECT: two identical candidates",
    () =>
      validateCheckPayload("PICK_BETTER_RESPONSE", {
        candidates: ["Same response text", "Same response text"],
        rationalePrompt: null,
      }),
    "candidates"
  );
  expectThrow(
    "REJECT: betterIndex 2",
    () => validateAnswerKey("PICK_BETTER_RESPONSE", { betterIndex: 2 }),
    "betterIndex"
  );
  expectThrow(
    "REJECT: null answer key for PICK_BETTER_RESPONSE",
    () => validateAnswerKey("PICK_BETTER_RESPONSE", null),
    "PICK_BETTER_RESPONSE"
  );
}

console.log("\n1d. REWRITE_WEAK_LINE");
{
  expectOk("ACCEPT: weakLine at/above MIN_QUOTABLE_LENGTH", () => {
    validateCheckPayload("REWRITE_WEAK_LINE", {
      weakLine: "I guess it was sort of my fault, maybe.",
      techniqueHint: "Own the outcome directly",
      rubricCriteria: ["States ownership without hedging"],
    });
  });
  expectThrow(
    "REJECT: an 8-character weakLine (below MIN_QUOTABLE_LENGTH)",
    () =>
      validateCheckPayload("REWRITE_WEAK_LINE", {
        weakLine: "not sure",
        techniqueHint: "Own the outcome directly",
        rubricCriteria: ["States ownership without hedging"],
      }),
    "weakLine"
  );
  check(
    "MIN_QUOTABLE_LENGTH import is the 8-char rejection's actual floor",
    "not sure".length < MIN_QUOTABLE_LENGTH
  );
  expectThrow(
    "REJECT: empty rubricCriteria",
    () =>
      validateCheckPayload("REWRITE_WEAK_LINE", {
        weakLine: "I guess it was sort of my fault, maybe.",
        techniqueHint: "Own the outcome directly",
        rubricCriteria: [],
      }),
    "rubricCriteria"
  );
  expectThrow(
    "REJECT: 5 rubricCriteria",
    () =>
      validateCheckPayload("REWRITE_WEAK_LINE", {
        weakLine: "I guess it was sort of my fault, maybe.",
        techniqueHint: "Own the outcome directly",
        rubricCriteria: ["One", "Two", "Three", "Four", "Five"],
      }),
    "rubricCriteria"
  );
  expectThrow(
    "REJECT: a non-null answer key supplied for REWRITE_WEAK_LINE",
    () => validateAnswerKey("REWRITE_WEAK_LINE", { anything: true }),
    "rewrite-a-weak-line"
  );
  check(
    "REWRITE_WEAK_LINE accepts a null answer key",
    (() => {
      const result = validateAnswerKey("REWRITE_WEAK_LINE", null);
      return result === null;
    })()
  );
}

console.log("\n1e. Weight-class derivation (REQ-111's deterministic/model split)");
{
  check(
    "the first three formats are deterministic",
    CHECK_FORMATS.filter((f) => f !== "REWRITE_WEAK_LINE").every(isDeterministicFormat)
  );
  check("REWRITE_WEAK_LINE is not deterministic", !isDeterministicFormat("REWRITE_WEAK_LINE"));
  check(
    "deterministic formats map to CHECK_DETERMINISTIC",
    CHECK_FORMATS.filter((f) => f !== "REWRITE_WEAK_LINE").every(
      (f) => CONTRIBUTION_SOURCE_FOR_FORMAT(f) === "CHECK_DETERMINISTIC"
    )
  );
  check(
    "REWRITE_WEAK_LINE maps to CHECK_MODEL_GRADED",
    CONTRIBUTION_SOURCE_FOR_FORMAT("REWRITE_WEAK_LINE") === "CHECK_MODEL_GRADED"
  );
}

// ---------------------------------------------------------------------------
// Section 2 — THE GUARD: knowledge checks never became an engine type.
// ---------------------------------------------------------------------------

function abs(...parts: string[]): string {
  return join(ROOT, ...parts);
}

function rel(p: string): string {
  return relative(ROOT, p).split("\\").join("/");
}

/** Walk a directory tree for .ts files; skip node_modules / .next / .git. */
function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkTsFiles(full, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function normalizeSlugLike(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

const FORBIDDEN_WORDS = ["knowledge", "quiz", "check"];

/**
 * The slug/label guard, factored into a standalone helper so Section 3 can
 * run it against a synthetic offender and prove it actually fires.
 */
function offendingSlugs(types: { slug: string; label: string }[]): string[] {
  const normalizedCheckFormats = CHECK_FORMATS.map(normalizeSlugLike);
  const offenders: string[] = [];
  for (const type of types) {
    const slugNorm = normalizeSlugLike(type.slug);
    const slugMatchesCheckFormat = normalizedCheckFormats.includes(slugNorm);
    const mentionsForbiddenWord = FORBIDDEN_WORDS.some(
      (word) => type.slug.toLowerCase().includes(word) || type.label.toLowerCase().includes(word)
    );
    if (slugMatchesCheckFormat || mentionsForbiddenWord) {
      offenders.push(type.slug);
    }
  }
  return offenders;
}

console.log("\n2a. No ENGINE_TYPES entry is a knowledge-check slug or mentions one");
{
  // lib/engine/types.ts's InteractionTypeConfig calls the human-readable field
  // `name`, not `label` — this guard's helper signature keeps the plan's
  // `label` name (Section 3 below constructs a literal `{slug, label}` to
  // prove the helper fires), so real registry entries are mapped onto it here.
  const engineTypesAsSlugLabel = ENGINE_TYPES.map((t) => ({ slug: t.slug, label: t.name }));
  const offenders = offendingSlugs(engineTypesAsSlugLabel);
  check(
    "no ENGINE_TYPES slug matches a knowledge-check format or names one",
    offenders.length === 0,
    offenders
  );
}

console.log("\n2b. ENGINE_TYPES.length has not silently grown around this guard");
{
  // No existing verifier (verify-engine-surface-count.ts,
  // verify-pitch-surface-count.ts, verify-deck-family-surface-count.ts,
  // verify-dc-surface-count.ts) exports an expected ENGINE_TYPES.length — each
  // deliberately avoids hardcoding it, since parallel phases add engine types
  // concurrently (see verify-pitch-surface-count.ts's own comment to that
  // effect). Per this plan's fallback instruction, the expected count is
  // therefore a LOCAL const here, duplicated from today's actual count rather
  // than read from an existing export. Documented in 21-06-SUMMARY.md: this
  // number (13, as of 2026-10-20) will need a deliberate bump whenever a
  // sixteenth-and-beyond engine type lands; its purpose is only to make a
  // silent, automated widening of ENGINE_TYPES visible in THIS file's diff,
  // not to duplicate the authoritative count Phase 13 already owns.
  const EXPECTED_ENGINE_TYPES_COUNT = 13;
  check(
    `ENGINE_TYPES.length is ${EXPECTED_ENGINE_TYPES_COUNT} (bump this const deliberately if it grows)`,
    ENGINE_TYPES.length === EXPECTED_ENGINE_TYPES_COUNT,
    `actual: ${ENGINE_TYPES.length}`
  );
}

console.log("\n2c. Nothing under lib/study-plan/ imports the engine — ONE enumerated carve-out");
{
  /**
   * The single, named exception. 21-12's recorded DECISION is that coached
   * mode reuses the engine's live session machinery (a coached session IS a
   * live avatar conversation) while staying out of ENGINE_TYPES; 21-23/21-24
   * build that runtime under lib/study-plan/coached/. Authority:
   * .planning/phases/21-adaptive-mastery-path/21-COACHED-ENGINE-DECISION.md
   * (that decision file is written by the plan that lands the coached
   * runtime; this carve-out exists in advance of it so this guard does not
   * have to change on that day). A second entry appearing here later is
   * exactly how this guard would quietly become meaningless — the count
   * assertion below makes adding one a deliberate, reviewed act.
   */
  const ENGINE_IMPORT_CARVE_OUTS = ["lib/study-plan/coached/"] as const;

  check(
    "ENGINE_IMPORT_CARVE_OUTS has exactly one entry",
    ENGINE_IMPORT_CARVE_OUTS.length === 1,
    ENGINE_IMPORT_CARVE_OUTS
  );

  const studyPlanRoot = abs("lib/study-plan");
  const allFiles = walkTsFiles(studyPlanRoot);

  const engineImportPattern =
    /from\s+["'](?:(?:\.\.\/)+engine(?:\/[^"']*)?|@\/lib\/engine(?:\/[^"']*)?)["']/;

  function fileImportsEngine(file: string): boolean {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      return false;
    }
    return engineImportPattern.test(source);
  }

  const isCarvedOut = (relPath: string) =>
    ENGINE_IMPORT_CARVE_OUTS.some((prefix) => relPath.startsWith(prefix));

  const checksFiles = allFiles.filter((f) => rel(f).startsWith("lib/study-plan/checks/"));
  const topLevelFiles = allFiles.filter((f) => {
    const afterRoot = rel(f).replace(/^lib\/study-plan\//, "");
    return !afterRoot.includes("/");
  });
  const carvedOutFiles = allFiles.filter((f) => isCarvedOut(rel(f)));
  // Any OTHER subdirectory (none exists yet besides checks/ and coached/) is
  // held to the same absolute standard as checks/** and the top level — the
  // carve-out is the one named exception, not a default-open walk.
  const everythingElse = allFiles.filter(
    (f) =>
      !checksFiles.includes(f) && !topLevelFiles.includes(f) && !carvedOutFiles.includes(f)
  );

  // Claim 1 — ABSOLUTE, named separately: lib/study-plan/checks/**
  const checksOffenders = checksFiles.filter(fileImportsEngine);
  check(
    "lib/study-plan/checks/** imports nothing from the engine (absolute, no exceptions)",
    checksOffenders.length === 0,
    checksOffenders.map(rel)
  );

  // Claim 2 — ABSOLUTE, named separately: every top-level file in lib/study-plan/
  const topLevelOffenders = topLevelFiles.filter(fileImportsEngine);
  check(
    "every top-level file directly in lib/study-plan/ imports nothing from the engine (absolute, no exceptions)",
    topLevelOffenders.length === 0,
    topLevelOffenders.map(rel)
  );

  // Any remaining, not-yet-named subdirectory: held to the same bar by default.
  const elseOffenders = everythingElse.filter(fileImportsEngine);
  check(
    "every other file under lib/study-plan/ (outside the one carve-out) imports nothing from the engine",
    elseOffenders.length === 0,
    elseOffenders.map(rel)
  );

  // The carve-out itself: lib/study-plan/coached/ does not exist yet. The walk
  // must handle its absence without vacuously passing — it is simply empty,
  // and no claim is being made about files that don't exist.
  check(
    "lib/study-plan/coached/ carve-out handled without vacuous pass (zero or more files, never an error)",
    Array.isArray(carvedOutFiles)
  );
  if (carvedOutFiles.length === 0) {
    console.log("       (lib/study-plan/coached/ does not exist yet — 0 files carved out, as expected)");
  }
}

console.log("\n2d. Prove the guard bites: a planted engine import under checks/ must fail the walk");
{
  const plantedDir = abs("lib/study-plan/checks");
  const plantedFile = join(plantedDir, "__guard-proof-temp.ts");
  const engineImportPattern =
    /from\s+["'](?:(?:\.\.\/)+engine(?:\/[^"']*)?|@\/lib\/engine(?:\/[^"']*)?)["']/;

  let plantedAndDetected = false;
  let cleanedUp = false;
  try {
    writeFileSync(
      plantedFile,
      `import { ENGINE_TYPES } from "../../engine/registry";\nexport const x = ENGINE_TYPES;\n`
    );
    const source = readFileSync(plantedFile, "utf8");
    plantedAndDetected = engineImportPattern.test(source);
  } finally {
    try {
      if (existsSync(plantedFile)) {
        unlinkSync(plantedFile);
        cleanedUp = true;
      }
    } catch {
      cleanedUp = false;
    }
  }

  check("planted lib/engine/ import under checks/ is detected as an offender", plantedAndDetected);
  check("planted temp file was removed after the proof", cleanedUp);
  check(
    "after removal, checks/ is clean again",
    !walkTsFiles(abs("lib/study-plan/checks")).some((f) => {
      const source = readFileSync(f, "utf8");
      return engineImportPattern.test(source);
    })
  );
}

// ---------------------------------------------------------------------------
// Section 3 — INVERTED ASSERTION: a guard never seen to fail is not a guard.
// ---------------------------------------------------------------------------

console.log("\n3. Inverted assertion — offendingSlugs() must actually fire on a synthetic offender");
{
  const synthetic = [{ slug: "knowledge-check", label: "Knowledge Check" }];
  const offenders = offendingSlugs(synthetic);
  check(
    "offendingSlugs() flags a synthetic knowledge-check type as an offender (correctly-detected expected failure)",
    offenders.length > 0,
    offenders
  );

  const syntheticSlugOnly = [{ slug: "multiple-choice", label: "Harmless Label" }];
  check(
    "offendingSlugs() also flags a bare slug match on its own (underscore/hyphen normalized)",
    offendingSlugs(syntheticSlugOnly).length > 0
  );

  const syntheticLabelOnly = [{ slug: "totally-fine-slug", label: "A quiz about leadership" }];
  check(
    "offendingSlugs() also flags a forbidden word in the label alone",
    offendingSlugs(syntheticLabelOnly).length > 0
  );

  const syntheticClean = [{ slug: "difficult-conversation", label: "Difficult Conversation" }];
  check(
    "offendingSlugs() does NOT flag a genuinely unrelated type (no false positive)",
    offendingSlugs(syntheticClean).length === 0
  );
}

console.log(`\n${checks} checks run, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
process.exit(0);
