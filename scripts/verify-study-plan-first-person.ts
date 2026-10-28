/**
 * Focused source-level regression check for issue #66.
 * Run: npx tsx scripts/verify-study-plan-first-person.ts
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

console.log("\nStudy-plan coach voice prompt contract");

check("addresses the learner as you", STUDY_PLAN_SYSTEM_PROMPT.includes("Address the learner as “you.”"));
check(
  "attributes statements as you said",
  STUDY_PLAN_SYSTEM_PROMPT.includes("“you said…” rather than using their name"),
);
check(
  "frames recommendations in the coach's first person",
  STUDY_PLAN_SYSTEM_PROMPT.includes("“I would recommend focusing on…”"),
);
check(
  "rejects direct you should recommendations",
  STUDY_PLAN_SYSTEM_PROMPT.includes("“you should…”"),
);
check(
  "does not make the learner speak in first person",
  !STUDY_PLAN_SYSTEM_PROMPT.includes("in first person from the learner's perspective"),
);

console.log(
  failures === 0
    ? "\nALL PASS — verify-study-plan-first-person.ts\n"
    : `\n${failures} FAILURE(S) — verify-study-plan-first-person.ts\n`,
);
process.exit(failures === 0 ? 0 : 1);
