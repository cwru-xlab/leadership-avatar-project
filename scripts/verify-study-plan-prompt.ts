/**
 * Prompt-contract guard for autonomy-supportive study-plan language (#68).
 *
 * Run: npx tsx scripts/verify-study-plan-prompt.ts
 */
import { STUDY_PLAN_SYSTEM_PROMPT } from "../lib/study-plan/generate";

let failures = 0;

function check(name: string, pass: boolean) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`);
  }
}

console.log("\nStudy-plan autonomy-supportive prompt contract");

for (const requirement of [
  "encouraging, autonomy-supportive language",
  "every learner-facing recommendation",
  "exercise titles and instructions",
  "successCriteria",
  "readinessChecks",
  "nextPracticeFocus",
  "I might try...",
  "I could experiment with...",
  "I can...",
  "Avoid hard directives",
  "Try this",
  "You must",
]) {
  check(
    `prompt includes contract language: ${requirement}`,
    STUDY_PLAN_SYSTEM_PROMPT.includes(requirement),
  );
}

console.log(
  failures === 0
    ? "\nALL PASS — verify-study-plan-prompt.ts\n"
    : `\n${failures} FAILURE(S) — verify-study-plan-prompt.ts\n`,
);
process.exit(failures === 0 ? 0 : 1);
