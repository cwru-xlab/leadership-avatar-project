/**
 * Focused source-level regression check for issue #66.
 * Run: npx tsx scripts/verify-study-plan-first-person.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = readFileSync(resolve(root, "lib/study-plan/generate.ts"), "utf8");
const firstPersonContract =
  "Write every learner-facing text field—including plan titles and summaries, strength and priority themes and explanations, exercises, readiness checks, resources, and next-practice focus—in first person from the learner's perspective (I/my); never refer to the learner as you, the learner, or the student.";

console.log("\n=== verify-study-plan-first-person ===\n");

if (generator.includes(firstPersonContract)) {
  console.log("  ok   study-plan prompt requires first-person learner voice for every generated field");
  console.log("\nAll checks passed.\n");
  process.exit(0);
}

console.log("  FAIL study-plan prompt requires first-person learner voice for every generated field");
console.log("\n1 check(s) FAILED.\n");
process.exit(1);
