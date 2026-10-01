/**
 * Round-trip coverage for the structured report body.
 *
 * Run: npx tsx scripts/verify-report-structure.ts
 *
 * The evaluator used to return one opaque markdown string; it now returns data,
 * and markdown is composed from it. The risks this guards: the FAILED path
 * losing its trigger, the metric-gating being broken while refactoring around
 * it, and the composed markdown drifting out of the shape the study-plan
 * consumer scans for.
 */
import { validateEvaluationResult } from "../lib/interview/evaluation";
import {
  composeReportMarkdown,
  parseStructuredReport,
  asStructuredReport,
  type StructuredReport,
} from "../lib/report/structured";
import {
  extractBehavioralSignals,
  extractBehavioralFeedback,
} from "../lib/study-plan/generate";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

function throws(name: string, fn: () => unknown) {
  try {
    fn();
    failures += 1;
    console.log(`  FAIL ${name}\n         expected a throw, got none`);
  } catch {
    console.log(`  ok   ${name}`);
  }
}

const FULL = {
  visual_score: 3,
  vocal_score: 2,
  content_score: 4,
  behavioral_score: 4,
  overall_summary: "A solid session with clear examples.",
  strengths: [
    { title: "Concrete examples", detail: "Described the Q3 launch in detail.", evidence: "I rebuilt the intake flow" },
    { title: "Active listening", detail: "Answered the follow-up directly.", evidence: null },
  ],
  growth_areas: [
    { title: "Answer structure", detail: "Answers wandered.", suggestion: "Use STAR.", timecodes: ["1:59", "2:46"] },
  ],
  category_notes: { visual: "Centred 57% of the time.", vocal: "Pace climbed.", content: null, behavioral: "Good ownership." },
  rubric_notes: [
    { item: "Ownership", note: "Strong — took responsibility for the missed deadline" },
    { item: "Empathy", note: "Developing — little acknowledgement of teammates" },
  ],
  practice_next: "Structure each answer end to end.",
};

const SCORES = { visual: 3, vocal: 2, content: 4, behavioral: 4 };

console.log("\n1. Parsing");
{
  const s = parseStructuredReport(FULL) as StructuredReport;
  check("summary survives", s.overall_summary, FULL.overall_summary);
  check("strengths parse", s.strengths.length, 2);
  check("null evidence stays null", s.strengths[1].evidence, null);
  check("timecodes survive", s.growth_areas[0].timecodes, ["1:59", "2:46"]);
  check("null category note stays null", s.category_notes.content, null);
  check("rubric notes parse", s.rubric_notes.length, 2);
}
check("a response with nothing in it is null", parseStructuredReport({}), null);
check("non-objects are null", parseStructuredReport("nope"), null);
check("arrays are not structured reports", asStructuredReport([1, 2]), null);
{
  // Thin is not broken: a summary with no bullets should still reach the student.
  const thin = parseStructuredReport({ overall_summary: "Too short to say much." });
  check("summary-only report is kept", thin?.overall_summary, "Too short to say much.");
  check("and its lists default to empty", [thin?.strengths, thin?.growth_areas], [[], []]);
}
{
  const junk = parseStructuredReport({
    overall_summary: "x",
    strengths: ["not an object", null, { title: "", detail: "" }],
    rubric_notes: [{ item: "Ownership" }],
  });
  check("malformed list entries are dropped", [junk?.strengths, junk?.rubric_notes], [[], []]);
}

console.log("\n2. Validation — the FAILED path and metric gating");
throws("an empty body still throws (FAILED, not a blank report)", () =>
  validateEvaluationResult({ content_score: 4 }, { hasVisualMetrics: true, hasVocalMetrics: true }));
{
  const v = validateEvaluationResult(FULL, { hasVisualMetrics: true, hasVocalMetrics: true });
  check("scores coerce", [v.visualScore, v.vocalScore, v.contentScore, v.behavioralScore], [3, 2, 4, 4]);
  check("markdown is composed, not returned by the model", v.reportMarkdown.startsWith("### Interview Performance Report"), true);
  check("structured body is carried through", v.reportStructured.strengths.length, 2);
}
{
  // The gating that must survive the refactor: no metrics supplied => null,
  // whatever the model claimed.
  const v = validateEvaluationResult(FULL, { hasVisualMetrics: false, hasVocalMetrics: false });
  check("visual/vocal forced null when metrics were absent", [v.visualScore, v.vocalScore], [null, null]);
  check("content/behavioral unaffected", [v.contentScore, v.behavioralScore], [4, 4]);
  check("and the composed table reflects the STORED scores",
    v.reportMarkdown.includes("Not available — requires video/audio analysis"), true);
}
{
  const v = validateEvaluationResult(
    { ...FULL, content_score: "4", behavioral_score: 9 },
    { hasVisualMetrics: true, hasVocalMetrics: true }
  );
  check("string and out-of-range scores become null", [v.contentScore, v.behavioralScore], [null, null]);
}

console.log("\n3. Markdown composition");
{
  const s = parseStructuredReport(FULL) as StructuredReport;
  const md = composeReportMarkdown(s, { title: "Interview Performance Report", scores: SCORES });
  for (const section of ["Overall Summary", "Strengths", "Growth Areas", "Category Breakdown", "Detailed Notes by Rubric Item", "One Thing to Practice Next Time"]) {
    check(`emits ${section}`, md.includes(section), true);
  }
  check("timecodes reach the prose", md.includes("1:59, 2:46"), true);
  check("category table carries the notes", md.includes("Centred 57% of the time."), true);
}
{
  // Empty lists must not emit dangling headers.
  const thin = parseStructuredReport({ overall_summary: "Short.", practice_next: "Say more." }) as StructuredReport;
  const md = composeReportMarkdown(thin, { title: "Interview Performance Report", scores: SCORES });
  check("no Strengths header when there are none", md.includes("**Strengths**"), false);
  check("no rubric header when there are none", md.includes("Detailed Notes"), false);
  check("but the table still renders", md.includes("Category Breakdown"), true);
}

console.log("\n4. Study-plan consumer");
{
  const s = parseStructuredReport(FULL) as StructuredReport;
  const md = composeReportMarkdown(s, { title: "Interview Performance Report", scores: SCORES });
  // The legacy regex path must still match the markdown we now generate —
  // otherwise old and new reports would yield different study-plan signals.
  check("legacy regex still matches composed markdown",
    extractBehavioralFeedback(md).sort(), ["Empathy: Developing", "Ownership: Strong"]);
  check("structured path agrees with it",
    extractBehavioralSignals({ reportStructured: FULL }).sort(), ["Empathy: Developing", "Ownership: Strong"]);
  check("and a pre-migration row still works off markdown alone",
    extractBehavioralSignals({ reportStructured: null, reportMarkdown: md }).sort(),
    ["Empathy: Developing", "Ownership: Strong"]);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
