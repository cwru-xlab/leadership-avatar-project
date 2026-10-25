/**
 * Focused source-level regression checks for feedback issues #53 and #59.
 * Run: npx tsx scripts/verify-feedback-copy.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function check(name: string, pass: boolean) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`);
  }
}

console.log("\n=== verify-feedback-copy ===\n");

for (const path of [
  "lib/interactions/index.ts",
  "app/conversations/page.tsx",
  "app/reports/page.tsx",
  "lib/report/title.ts",
  "lib/difficult-conversation/conversation-type.ts",
  "app/practice/[type]/[instanceId]/page.tsx",
]) {
  const text = source(path);
  check(
    `${path} uses Courageous Conversation display copy`,
    text.toLowerCase().includes("courageous conversation"),
  );
}

const guidance = source("components/practice/InterviewPaceGuidance.tsx");
check("pace guidance states the existing 100–159 WPM range", guidance.includes("100–159 words per minute"));

const interviewPrompts = source("lib/interview/prompts.ts");
check(
  "interview vocal feedback compares measured pace to the 100–159 WPM target",
  interviewPrompts.includes("state the measured pace in words per minute") &&
    interviewPrompts.includes("100–159 WPM interview target"),
);

const reportBody = source("components/report/ReportBody.tsx");
const reportPage = source("app/practice/[type]/report/[reportId]/page.tsx");
check(
  "interview reports display assessed pace with the 100–159 WPM target",
  reportBody.includes("Assessed pace:") &&
    reportBody.includes("Interview target: 100–159 WPM.") &&
    reportPage.includes('showInterviewPaceTarget={report.input?.kind === "interview"}'),
);

const practicePage = source("app/practice/[type]/page.tsx");
check("only the interview composition mounts pace guidance", practicePage.includes("isInterview ? <InterviewPaceGuidance variant=\"setup\" /> : undefined") && practicePage.includes("isInterview ? <InterviewPaceGuidance variant=\"live\" /> : undefined"));

const setupWizard = source("components/practice/SetupWizard.tsx");
const sessionShell = source("components/practice/PracticeSessionShell.tsx");
check("shared setup wizard has no interview slug branch", !setupWizard.includes('typeSlug === "general"') && !setupWizard.includes('typeSlug === "technical"'));
check("shared session shell has no interview slug branch", !sessionShell.includes('typeSlug === "general"') && !sessionShell.includes('typeSlug === "technical"'));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
