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
import { validateEvaluationResult, EVALUATION_JSON_SCHEMA } from "../lib/interview/evaluation";
import {
  validateScenarioEvaluationResult,
  SCENARIO_EVALUATION_JSON_SCHEMA,
} from "../lib/scenario/evaluation";
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
import {
  findBodySignalWordingViolations,
  sanitizeBodySignalWording,
} from "../lib/report/body-signal-validator";
import { ENGINE_TYPES } from "../lib/engine/registry";
import {
  resolveFromTypeConfig,
  resolveSessionConfig,
} from "../lib/engine/resolve";
import {
  buildRubricJsonSchema,
  parseRubricScores,
} from "../lib/engine/rubric";
import type { InteractionTypeConfig } from "../lib/engine/types";

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

console.log("\n5. Body-signal wording validator (12-08 Task 3 pre-sign-off, Defect C)");
{
  // The exact real-run failure: no question mark, and an effect-on-viewer
  // claim, in the same sentence.
  const realFailure = asStructuredReport({
    ...FULL,
    category_notes: {
      ...FULL.category_notes,
      visual:
        "Remained very still throughout the session, with no visible hand movement or gesturing, which can seem flat over video.",
    },
  }) as StructuredReport;
  const violations = findBodySignalWordingViolations(realFailure);
  check("detects both the missing question mark and the forbidden phrase",
    violations.length > 0, true);
  check("flags category_notes.visual specifically",
    violations.some((v) => v.field === "category_notes.visual"), true);

  const { report: sanitized, strippedCount } = sanitizeBodySignalWording(realFailure);
  check("stripping removes the violating sentence", strippedCount > 0, true);
  check("the forbidden phrase never survives sanitization",
    (sanitized.category_notes.visual ?? "").includes("can seem flat over video"), false);
  check("sanitizing never mutates the input report",
    realFailure.category_notes.visual?.includes("can seem flat over video"), true);
}
{
  // The other two real-run failures from commit 0ae1f40's own fix: an
  // effect-on-viewer claim and an internal-state inference, each its own
  // sentence this time.
  const growthAreaFailure = asStructuredReport({
    ...FULL,
    growth_areas: [
      {
        title: "Hand position",
        detail:
          "Your hand covered part of your mouth for a stretch around 1:30, which can obscure facial expressions. It also happened again near 2:10, or signal uncertainty.",
        suggestion: "Notice when your hand moves toward your face.",
        timecodes: ["1:30", "2:10"],
      },
    ],
  }) as StructuredReport;
  const violations = findBodySignalWordingViolations(growthAreaFailure);
  check("catches both forbidden phrases in growth_areas[].detail",
    violations.filter((v) => v.reason === "forbidden-phrase").length, 2);

  const { report: sanitized, strippedCount } = sanitizeBodySignalWording(growthAreaFailure);
  check("both violating sentences are stripped", strippedCount, 2);
  check("neither forbidden phrase survives",
    /can obscure|signal uncertainty/i.test(sanitized.growth_areas[0]?.detail ?? ""), false);
}
{
  // A compliant body finding (ends in "?", no forbidden phrase) must pass
  // through completely unchanged — the validator must not false-positive
  // on ordinary describe-then-ask wording.
  const compliant = asStructuredReport({
    ...FULL,
    category_notes: {
      ...FULL.category_notes,
      visual:
        "Gestured broadly from 2:10 to 2:45 — was that intentional emphasis?",
    },
  }) as StructuredReport;
  check("a compliant body finding has no violations",
    findBodySignalWordingViolations(compliant).length, 0);
  const { report: sanitized, strippedCount } = sanitizeBodySignalWording(compliant);
  check("and sanitization leaves it byte-identical",
    sanitized.category_notes.visual, compliant.category_notes.visual);
  check("with nothing stripped", strippedCount, 0);
}
{
  // Non-body-signal narrative text must never trip the question-mark rule —
  // only sentences that actually mention a body-signal keyword are subject
  // to it.
  const nonBodyFinding = asStructuredReport({
    ...FULL,
    category_notes: {
      ...FULL.category_notes,
      content: "Answers were well structured and concrete throughout.",
    },
  }) as StructuredReport;
  check("non-body narrative without a question mark is not flagged",
    findBodySignalWordingViolations(nonBodyFinding).length, 0);
}
{
  // Both evaluator modules' own validate* functions must apply the
  // sanitizer, not just the pure function in isolation — this is the actual
  // enforcement path a live evaluation runs through.
  const withViolation = {
    ...FULL,
    category_notes: {
      ...FULL.category_notes,
      visual: "Remained still, which can seem flat over video.",
    },
  };
  const interviewResult = validateEvaluationResult(withViolation, {
    hasVisualMetrics: true,
    hasVocalMetrics: true,
  });
  check("validateEvaluationResult strips the violation before returning it",
    (interviewResult.reportStructured.category_notes.visual ?? "").includes("can seem flat over video"),
    false);

  const scenarioResult = validateScenarioEvaluationResult(withViolation, {
    hasVisualMetrics: true,
    hasVocalMetrics: true,
  });
  check("validateScenarioEvaluationResult strips the violation before returning it",
    (scenarioResult.reportStructured.category_notes.visual ?? "").includes("can seem flat over video"),
    false);
}

{
  // 12-08 Task 1 checkpoint, Defect G: the EXACT real-run failure — a
  // HEDGED effect claim ("may have distracted from") in `overall_summary`,
  // a field the first version of this validator never scanned at all.
  const defectG = asStructuredReport({
    ...FULL,
    overall_summary:
      "Gesture use was at times excessive — was that intentional? Hand movements near his face may have distracted from his responses.",
  }) as StructuredReport;
  const violations = findBodySignalWordingViolations(defectG);
  check("overall_summary is scanned at all",
    violations.some((v) => v.field === "overall_summary"), true);
  check("the hedged effect claim is caught by the structural stem rule, not an exact phrase",
    violations.some((v) => v.reason === "effect-claim-stem"), true);

  const { report: sanitized, strippedCount } = sanitizeBodySignalWording(defectG);
  check("the hedged clause is stripped", strippedCount > 0, true);
  check("the measurement half survives — only the effect claim is removed",
    (sanitized.overall_summary ?? "").includes("Gesture use was at times excessive"), true);
  check("the hedged effect claim never survives",
    (sanitized.overall_summary ?? "").includes("distracted"), false);
}
{
  // Other hedged phrasings of the same claim, never on the exact-phrase
  // list, must all be caught by the same structural rule.
  for (const hedge of [
    "Hand movements near his face might have distracted the interviewer.",
    "His posture could obscure how engaged he seemed.",
    "His posture may undermine how confident he came across.",
  ]) {
    const report = asStructuredReport({
      ...FULL,
      category_notes: { ...FULL.category_notes, visual: hedge },
    }) as StructuredReport;
    check(`structural rule catches: "${hedge}"`,
      findBodySignalWordingViolations(report).some((v) => v.reason === "effect-claim-stem"),
      true);
  }
}
{
  // A legitimate, unrelated use of an effect-claim stem word must NOT be
  // flagged when the sentence mentions no body signal at all.
  const benign = asStructuredReport({
    ...FULL,
    overall_summary: "The concrete examples reinforced the overall narrative well.",
  }) as StructuredReport;
  check("an unrelated 'reinforce' with no body-signal keyword is not flagged",
    findBodySignalWordingViolations(benign).length, 0);
}
{
  // 12-09 Task 2 investigation of the 12-08 Task 3 sign-off's "Excessive
  // gesturing at times" / "Try this:" / no-question observation. Reproduced
  // directly: a growth area whose ENTIRE `detail` is one non-conforming
  // sentence (no question mark, mentions a body signal) gets that sentence
  // stripped to an empty string by the question-mark rule — `title` is
  // never validated, so pre-fix this left a hollow entry (title +
  // unconditional "Try this:" suggestion, no question anywhere) that
  // reproduces the describe-then-ask violation one level up. The whole
  // entry must be dropped, not left half-populated.
  const hollowDetail = asStructuredReport({
    ...FULL,
    growth_areas: [
      {
        title: "Excessive gesturing at times",
        detail: "Excessive gesturing at times",
        suggestion: "Keep your hands relaxed at your sides when not actively gesturing.",
        timecodes: ["1:26"],
      },
      {
        title: "Hand-to-face movement",
        detail: "Frequent hand-to-face movement — did you notice yourself doing this?",
        suggestion: "Try keeping your hands in your lap when not gesturing.",
        timecodes: ["2:10"],
      },
    ],
  }) as StructuredReport;
  const { report: sanitized } = sanitizeBodySignalWording(hollowDetail);
  check(
    "a growth area stripped down to an empty detail is dropped entirely, not left hollow",
    sanitized.growth_areas.map((g) => g.title),
    ["Hand-to-face movement"]
  );
  check(
    "the compliant sibling entry survives untouched",
    sanitized.growth_areas[0]?.detail,
    "Frequent hand-to-face movement — did you notice yourself doing this?"
  );
}
{
  // growth_areas[].suggestion is advisory, not a finding — it must NOT be
  // held to the question-mark rule, even though it mentions a body signal.
  const withAdvisorySuggestion = asStructuredReport({
    ...FULL,
    growth_areas: [
      {
        title: "Hand position",
        detail: "Your hand moved toward your face a few times — was that intentional?",
        suggestion: "Notice when your hand moves toward your face.",
        timecodes: ["1:30"],
      },
    ],
  }) as StructuredReport;
  check("an advisory suggestion without a question mark is not flagged",
    findBodySignalWordingViolations(withAdvisorySuggestion).length, 0);
}

// ---------------------------------------------------------------------------
// 6. Type-derived rubric schema (plan 13-05 / REQ-71 / REQ-72)
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log("\n6. Type-derived rubric schema (13-05)");
{
  // 6.1 — every built-in type always requires visual_score and vocal_score.
  for (const type of ENGINE_TYPES) {
    const instance =
      type.slug === "case-study"
        ? {
            kind: "case-study" as const,
            caseId: "verify-case",
            caseName: "Verify",
            background: "bg",
            avatars: [{ name: "A", role: "R" }],
            criteria: null,
          }
        : { kind: "none" as const };
    const resolved = resolveSessionConfig(type.slug, { instance });
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve ${type.slug}: ${resolved.reason}`);
      continue;
    }
    const schema = buildRubricJsonSchema(resolved.config);
    check(
      `"${type.slug}" required[] includes visual_score and vocal_score`,
      [
        schema.schema.required.includes("visual_score"),
        schema.schema.required.includes("vocal_score"),
      ],
      [true, true],
    );
  }

  // 6.2 — deep equality with today's hardcoded schemas (regression until 13-13).
  for (const slug of ["general", "technical", "consulting", "early-career"]) {
    const resolved = resolveSessionConfig(slug, {});
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve ${slug}: ${resolved.reason}`);
      continue;
    }
    check(
      `"${slug}" schema deeply equals EVALUATION_JSON_SCHEMA`,
      deepEqual(buildRubricJsonSchema(resolved.config), EVALUATION_JSON_SCHEMA),
      true,
    );
  }
  {
    const resolved = resolveSessionConfig("case-study", {
      instance: {
        kind: "case-study",
        caseId: "verify-case",
        caseName: "Verify",
        background: "bg",
        avatars: [{ name: "A", role: "R" }],
        criteria: null,
      },
    });
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve case-study: ${resolved.reason}`);
    } else {
      check(
        `case-study schema deeply equals SCENARIO_EVALUATION_JSON_SCHEMA`,
        deepEqual(
          buildRubricJsonSchema(resolved.config),
          SCENARIO_EVALUATION_JSON_SCHEMA,
        ),
        true,
      );
    }
  }

  // 6.3 — extras append in order; colliding "visual" extra is rejected.
  const withExtras: InteractionTypeConfig = {
    ...ENGINE_TYPES[0],
    slug: "synthetic-extras",
    extraRubricDimensions: [
      { key: "extraA", label: "Extra A", description: "A" },
      { key: "extraB", label: "Extra B", description: "B" },
    ],
  };
  const extrasResolved = resolveFromTypeConfig(withExtras, {});
  if (!extrasResolved.ok) {
    failures += 1;
    console.log(`  FAIL resolve synthetic extras: ${extrasResolved.reason}`);
  } else {
    const schema = buildRubricJsonSchema(extrasResolved.config);
    const scoreRequired = schema.schema.required.filter((k) =>
      k.endsWith("_score"),
    );
    check(
      "synthetic extras required score keys in order",
      scoreRequired,
      [
        "visual_score",
        "vocal_score",
        "content_score",
        "behavioral_score",
        "extraA_score",
        "extraB_score",
      ],
    );
  }

  const collidingVisual: InteractionTypeConfig = {
    ...ENGINE_TYPES[0],
    slug: "synthetic-collide-visual",
    extraRubricDimensions: [
      { key: "visual", label: "Shadow Visual", description: "must reject" },
    ],
  };
  const collideResult = resolveFromTypeConfig(collidingVisual, {});
  check(
    "extra key colluding with visual is rejected at config resolve",
    collideResult.ok,
    false,
  );

  // 6.4 — parseRubricScores maps to ScoreMap; nulls stay null, not 0.
  {
    const resolved = resolveSessionConfig("general", {});
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve general for parseRubricScores: ${resolved.reason}`);
    } else {
      const scores = parseRubricScores(
        {
          visual_score: null,
          vocal_score: 2,
          content_score: 4,
          behavioral_score: null,
        },
        resolved.config,
      );
      check(
        "parseRubricScores keeps all four shared keys",
        ["visual", "vocal", "content", "behavioral"].every((k) => k in scores),
        true,
      );
      check(
        "parseRubricScores preserves nulls (not 0)",
        [scores.visual, scores.behavioral, scores.vocal, scores.content],
        [null, null, 2, 4],
      );
    }
  }
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
