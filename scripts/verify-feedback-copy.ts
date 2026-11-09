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
 * The growth-area suggestion must open with "Consider trying this", not the
 * bare imperative "Try this". The report is advice a student may decline, and
 * the shorter form reads as an instruction; this is the same
 * autonomy-supportive rule the generator prompts already enforce on the
 * suggestion TEXT (`lib/interview/prompts.ts`, `lib/study-plan/generate.ts`,
 * which name "Try this" explicitly as a directive to avoid). The LABEL in
 * front of that text has to hold the same line or the prompt rule is undone
 * at render.
 *
 * ONE SITE, not two: the Takeaways tab's "Work on next" column was the second,
 * and it was dropped along with the tab — it re-rendered the growth areas the
 * Overview tab already lists in full. The count is asserted so that a second
 * site cannot reappear unguarded.
 *
 * Guarded at source because `verify-report-structure.ts`'s own
 * "collaborative display terminology" check reads only the composed MARKDOWN
 * (`lib/report/structured.ts`), so it passes while the on-screen component
 * says something else — which is exactly how the Takeaways column was
 * shortened to "Try this:" without any check failing.
 */
check(
  "the growth suggestion offers rather than instructs, at exactly one site",
  reportBody.split("Consider trying this").length - 1 === 1 &&
    !reportBody.includes("Try this"),
);

const practicePage = source("components/practice/routes/PracticeTypePage.tsx");
check("only the interview composition mounts pace guidance", practicePage.includes("isInterview ? <InterviewPaceGuidance variant=\"setup\" /> : undefined") && practicePage.includes("isInterview ? <InterviewPaceGuidance variant=\"live\" /> : undefined"));

const setupWizard = source("components/practice/SetupWizard.tsx");
const sessionShell = source("components/practice/PracticeSessionShell.tsx");
check("shared setup wizard has no interview slug branch", !setupWizard.includes('typeSlug === "general"') && !setupWizard.includes('typeSlug === "technical"'));
check("shared session shell has no interview slug branch", !sessionShell.includes('typeSlug === "general"') && !sessionShell.includes('typeSlug === "technical"'));

/**
 * NO VALUE IN THE REPORT BODY IS RIGHT-ALIGNED.
 *
 * Right-aligning a value that WRAPS starts every line after the first at a
 * different x, so the block has no edge to read down. It is safe only for
 * values guaranteed to be one short word, and this file has twice been proved
 * wrong about that: observation values are sentences quoting episode times,
 * and the Content tab's rubric notes are whole sentences ("Meets all
 * criteria: no. Student gathered…") — measured in the browser at 1440px, all
 * four wrapped to two lines with two distinct left edges.
 *
 * Asserted across the WHOLE file rather than per site. The narrower check
 * this replaces ("the observation list uses the left variant") passed happily
 * while the rubric list a few hundred lines below was ragged.
 *
 * Label-above-value, or label and value on one row with the text set flush
 * left, reads at any length and needs no alignment bargain.
 */
check(
  "no value is right-aligned, so wrapped sentences cannot ragged",
  !/text-right/.test(reportBody),
);

/**
 * Scored and descriptive rows still LOOK different — the variant carries
 * emphasis, not alignment: scored rows are ink and semibold, descriptive rows
 * stay muted so a measurement cannot be read as a verdict. The variant must
 * follow the row's SOURCE, never its length, or a card's treatment would
 * change with the session's data.
 */
check(
  "the observation list renders with the descriptive variant",
  /rows=\{observationRows\}/.test(reportBody) && /variant="descriptive"/.test(reportBody),
);
check(
  "BandList still distinguishes scored from descriptive rows",
  reportBody.includes('variant === "descriptive" ? "text-muted" : "font-semibold text-ink"'),
);
check(
  "the variant is chosen by row source, never by measuring value length",
  !/variant\s*=\s*\{?[^}\n]*\.(length|value\.length)\s*[><]/.test(reportBody),
);

/**
 * OFF-TARGET MARKS ARE NEVER COLOUR ALONE, AND NEVER INVENTED AT RENDER.
 *
 * The mark reads "Worth attention" next to the dot, so it survives greyscale
 * and a screen reader. And it is driven by the row's own `offTarget` flag from
 * `lib/metrics/bands.ts` — never by the component testing value words, which
 * would let the tab call "Fast" a miss while the Moments level counted it as
 * fine, and would silently flag the "not visible enough to read" rows.
 */
check(
  "the off-target mark carries a word, not just a colour",
  reportBody.includes("Worth attention"),
);
check(
  "the mark is driven by the row flag, not by the component matching words",
  /row\.offTarget/.test(reportBody) &&
    !/(Fast|Frequent|Uneven)"\s*(===|\.includes|\.has)/.test(reportBody),
);
const bands = source("lib/metrics/bands.ts");
check(
  "the Moments level counts the rows' own marks, so it cannot drift from them",
  bands.includes("notes.filter((note) => note.offTarget).length"),
);
check(
  "middle bands are left unmarked (Developing, Intermittent, Slightly fast)",
  !/"(Developing|Intermittent|Slightly fast|Inconsistent|Occasional)"/.test(
    bands.slice(
      bands.indexOf("const OFF_TARGET = {"),
      bands.indexOf("};", bands.indexOf("const OFF_TARGET = {")),
    ),
  ),
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
