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
  "lib/report/title.ts",
  "lib/difficult-conversation/conversation-type.ts",
  // The practice launcher moved out of `app/practice/[type]/[instanceId]/page.tsx`,
  // which is now a two-line wrapper around this component.
  "components/practice/routes/PracticeInstancePage.tsx",
]) {
  const text = source(path);
  check(
    `${path} uses Courageous Conversation display copy`,
    text.toLowerCase().includes("courageous conversation"),
  );
}

/**
 * The reports list must not carry its own copy of the label. It renders titles
 * through `lib/report/title.ts` (guarded above), so asserting a literal string
 * here would reward exactly the drift we want to prevent: a page that
 * hardcodes "Courageous Conversation" instead of asking the shared module.
 */
check(
  "the reports list delegates its type label instead of hardcoding one",
  source("app/reports/page.tsx").includes("typeLabelForReport") &&
    !source("app/reports/page.tsx").toLowerCase().includes("difficult conversation"),
);

const guidance = source("components/practice/InterviewPaceGuidance.tsx");
check("pace guidance states the existing 100–159 WPM range", guidance.includes("100–159 words per minute"));

const interviewPrompts = source("lib/interview/prompts.ts");
check(
  "interview vocal feedback compares measured pace to the 100–159 WPM target",
  interviewPrompts.includes("state the measured pace in words per minute") &&
    interviewPrompts.includes("100–159 WPM interview target"),
);

const reportBody = source("components/report/ReportBody.tsx");
const reportPage = source("components/practice/routes/PracticeReportPage.tsx");
check(
  "interview reports display assessed pace with the 100–159 WPM target",
  reportBody.includes("Assessed pace:") &&
    reportBody.includes("Interview target: 100–159 WPM.") &&
    reportPage.includes('showInterviewPaceTarget={report.input?.kind === "interview"}'),
);

/**
 * SUGGESTIONS ARE OFFERED, NEVER ISSUED.
 *
 * Both growth-area suggestion sites — the expanded row and the Takeaways
 * column — must open with "Consider trying this", not the bare imperative
 * "Try this". The report is advice a student may decline, and the shorter form
 * reads as an instruction; this is the same autonomy-supportive rule the
 * generator prompts already enforce on the suggestion TEXT
 * (`lib/interview/prompts.ts`, `lib/study-plan/generate.ts`, which name
 * "Try this" explicitly as a directive to avoid). The LABEL in front of that
 * text has to hold the same line or the prompt rule is undone at render.
 *
 * Guarded at source because `verify-report-structure.ts`'s own
 * "collaborative display terminology" check reads only the composed MARKDOWN
 * (`lib/report/structured.ts`), so it passes while the on-screen component
 * says something else — which is exactly how the Takeaways column was
 * shortened to "Try this:" without any check failing.
 */
check(
  "both growth suggestion sites offer rather than instruct",
  reportBody.split("Consider trying this").length - 1 === 2 &&
    !reportBody.includes("Try this"),
);

const practicePage = source("components/practice/routes/PracticeTypePage.tsx");
check("only the interview composition mounts pace guidance", practicePage.includes("isInterview ? <InterviewPaceGuidance variant=\"setup\" /> : undefined") && practicePage.includes("isInterview ? <InterviewPaceGuidance variant=\"live\" /> : undefined"));

const setupWizard = source("components/practice/SetupWizard.tsx");
const sessionShell = source("components/practice/PracticeSessionShell.tsx");
check("shared setup wizard has no interview slug branch", !setupWizard.includes('typeSlug === "general"') && !setupWizard.includes('typeSlug === "technical"'));
check("shared session shell has no interview slug branch", !sessionShell.includes('typeSlug === "general"') && !sessionShell.includes('typeSlug === "technical"'));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
