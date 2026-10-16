/**
 * Regression battery for quick task 002 — feedback source attribution.
 *
 * Run: npx tsx scripts/verify-feedback-source-attribution.ts
 *
 * Covers: the closed-vocabulary parse/coercion, the pure enforcement
 * function, the real server exit (`validateEvaluationResult`), the
 * type-derived schema shape, the evaluator prompt text, and the component
 * labels. Section 3 is the one that matters most: it proves a resume
 * attribution cannot survive a no-resume session THROUGH THE REAL FUNCTION,
 * not a reimplementation of it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { validateEvaluationResult } from "../lib/engine/evaluation";
import {
  parseStructuredReport,
  type StructuredReport,
} from "../lib/report/structured";
import { enforceSourceAttribution } from "../lib/report/source-attribution";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import { INTERVIEW_EVALUATOR_PROMPT } from "../lib/interview/prompts";
import { SCENARIO_EVALUATOR_PROMPT } from "../lib/scenario/prompts";
import { CONVERSATION_EVALUATOR_PROMPT } from "../lib/difficult-conversation/conversation-prompts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

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

/** Resolve a general interview config, mirroring verify-report-structure.ts. */
function generalConfig() {
  const resolved = resolveSessionConfig("general", {});
  if (!resolved.ok) throw new Error(`resolve general failed: ${resolved.reason}`);
  return resolved.config;
}

function validateInterviewLike(
  raw: unknown,
  opts: { hasVisualMetrics: boolean; hasVocalMetrics: boolean },
  evaluationContext: Record<string, unknown>,
) {
  return validateEvaluationResult(raw, generalConfig(), opts, evaluationContext);
}

const FULL = {
  visual_score: 3,
  vocal_score: 2,
  content_score: 4,
  behavioral_score: 4,
  overall_summary: "A solid session with clear examples.",
  strengths: [
    {
      title: "Concrete examples",
      detail: "Described the Q3 launch in detail.",
      evidence: "I rebuilt the intake flow",
      source: "resume",
    },
    {
      title: "Active listening",
      detail: "Answered the follow-up directly.",
      evidence: null,
      source: "resume",
    },
  ],
  growth_areas: [
    {
      title: "Answer structure",
      detail: "Answers wandered.",
      suggestion: "Use STAR.",
      timecodes: ["1:59", "2:46"],
      source: "resume",
    },
  ],
  category_notes: {
    visual: "Centred 57% of the time.",
    vocal: "Pace climbed.",
    content: null,
    behavioral: "Good ownership.",
  },
  rubric_notes: [
    { item: "Ownership", note: "Strong — took responsibility for the missed deadline" },
    { item: "Empathy", note: "Developing — little acknowledgement of teammates" },
  ],
  practice_next: "Structure each answer end to end.",
};

console.log("\n1. Parse and vocabulary");
{
  const s = parseStructuredReport({
    ...FULL,
    strengths: [
      { ...FULL.strengths[0], source: "RESUME " },
      { ...FULL.strengths[1], source: "inferred" },
    ],
    growth_areas: [
      { ...FULL.growth_areas[0], source: 42 },
    ],
  }) as StructuredReport;
  check("whitespace/case-variant source coerces to resume", s.strengths[0].source, "resume");
  check("out-of-vocabulary string degrades to null", s.strengths[1].source, null);
  check("a number degrades to null", s.growth_areas[0].source, null);

  const objSource = parseStructuredReport({
    ...FULL,
    strengths: [{ ...FULL.strengths[0], source: { not: "a string" } }],
  }) as StructuredReport;
  check("an object degrades to null", objSource.strengths[0].source, null);

  const absentSource = parseStructuredReport({
    ...FULL,
    strengths: [
      { title: FULL.strengths[0].title, detail: FULL.strengths[0].detail, evidence: null },
    ],
  }) as StructuredReport;
  check("an absent key degrades to null", absentSource.strengths[0].source, null);

  const validValues = parseStructuredReport({
    ...FULL,
    strengths: [
      { ...FULL.strengths[0], source: "conversation" },
      { ...FULL.strengths[1], source: "both" },
    ],
  }) as StructuredReport;
  check("conversation survives parse unchanged", validValues.strengths[0].source, "conversation");
  check("both survives parse unchanged", validValues.strengths[1].source, "both");
}

console.log("\n2. Enforcement — enforceSourceAttribution");
{
  const parsed = parseStructuredReport(FULL) as StructuredReport;
  const withAllThree = {
    ...parsed,
    strengths: [
      { ...parsed.strengths[0], source: "resume" as const },
      { ...parsed.strengths[1], source: "both" as const },
    ],
    growth_areas: [
      { ...parsed.growth_areas[0], source: null },
    ],
  };

  const { report: enforced, downgradedCount } = enforceSourceAttribution(withAllThree, {
    hasResume: false,
  });
  check("resume becomes conversation when hasResume is false", enforced.strengths[0].source, "conversation");
  check("both becomes conversation when hasResume is false", enforced.strengths[1].source, "conversation");
  check("null stays null — absence is not a declaration", enforced.growth_areas[0].source, null);
  check("downgradedCount counts exactly the two rewrites", downgradedCount, 2);
  check(
    "the input object is not mutated",
    [withAllThree.strengths[0].source, withAllThree.strengths[1].source],
    ["resume", "both"],
  );

  const withConversation = {
    ...parsed,
    strengths: [{ ...parsed.strengths[0], source: "conversation" as const }],
    growth_areas: [],
  };
  const { report: unchangedWhenFalse, downgradedCount: zeroCount } = enforceSourceAttribution(
    withConversation,
    { hasResume: false },
  );
  check("conversation stays conversation when hasResume is false", unchangedWhenFalse.strengths[0].source, "conversation");
  check("downgradedCount is 0 when nothing needed rewriting", zeroCount, 0);

  const { report: unchangedWhenTrue, downgradedCount: trueCount } = enforceSourceAttribution(
    withAllThree,
    { hasResume: true },
  );
  check("nothing changes when hasResume is true", unchangedWhenTrue.strengths[0].source, "resume");
  check("downgradedCount is 0 when hasResume is true", trueCount, 0);
}

console.log("\n3. The real server exit — validateEvaluationResult");
{
  // Adversarial: every item claims resume, but resumeText is empty.
  const v = validateInterviewLike(
    FULL,
    { hasVisualMetrics: true, hasVocalMetrics: true },
    { kind: "interview", resumeText: "" },
  );
  check(
    "no resume/both source survives in reportStructured when resumeText is empty",
    [
      ...v.reportStructured.strengths.map((s) => s.source),
      ...v.reportStructured.growth_areas.map((g) => g.source),
    ].every((s) => s !== "resume" && s !== "both"),
    true,
  );
  check(
    "reportMarkdown contains no 'From your resume' string when resumeText is empty",
    v.reportMarkdown.includes("From your resume"),
    false,
  );

  // Same payload, non-empty resumeText this time — the guard must be narrow.
  const v2 = validateInterviewLike(
    FULL,
    { hasVisualMetrics: true, hasVocalMetrics: true },
    { kind: "interview", resumeText: "Experienced product manager." },
  );
  check(
    "a resume source DOES survive when resumeText is non-empty",
    v2.reportStructured.strengths.some((s) => s.source === "resume"),
    true,
  );
  check(
    "reportMarkdown DOES contain 'From your resume' when resumeText is non-empty",
    v2.reportMarkdown.includes("From your resume"),
    true,
  );

  // whitespace-only resumeText counts as no resume, same as evaluation.ts's hasResume derivation.
  const v3 = validateInterviewLike(
    FULL,
    { hasVisualMetrics: true, hasVocalMetrics: true },
    { kind: "interview", resumeText: "   " },
  );
  check(
    "whitespace-only resumeText is treated as no resume",
    v3.reportStructured.strengths.every((s) => s.source !== "resume" && s.source !== "both"),
    true,
  );
}

console.log("\n4. Schema shape");
{
  const resolved = resolveSessionConfig("general", {});
  if (!resolved.ok) {
    failures += 1;
    console.log(`  FAIL resolve general: ${resolved.reason}`);
  } else {
    const schema = buildRubricJsonSchema(resolved.config);
    const props = schema.schema.properties as Record<string, any>;
    check(
      "strengths item requires source",
      props.strengths.items.required.includes("source"),
      true,
    );
    check(
      "growth_areas item requires source",
      props.growth_areas.items.required.includes("source"),
      true,
    );
    check(
      "strengths.items.properties.source is [string, null]",
      props.strengths.items.properties.source,
      { type: ["string", "null"] },
    );
    check(
      "growth_areas.items.properties.source is [string, null]",
      props.growth_areas.items.properties.source,
      { type: ["string", "null"] },
    );
  }
}

console.log("\n5. Prompt text");
{
  check(
    "INTERVIEW_EVALUATOR_PROMPT names source",
    INTERVIEW_EVALUATOR_PROMPT.includes("source"),
    true,
  );
  for (const word of ["resume", "conversation", "both"]) {
    check(
      `INTERVIEW_EVALUATOR_PROMPT names vocabulary word "${word}"`,
      INTERVIEW_EVALUATOR_PROMPT.includes(word),
      true,
    );
  }
  check(
    "INTERVIEW_EVALUATOR_PROMPT states the no-resume rule",
    INTERVIEW_EVALUATOR_PROMPT.includes("No resume was provided"),
    true,
  );
  check(
    "SCENARIO_EVALUATOR_PROMPT was NOT taught a source attribution rule",
    SCENARIO_EVALUATOR_PROMPT.includes("RULE ON SOURCE ATTRIBUTION"),
    false,
  );
  check(
    "CONVERSATION_EVALUATOR_PROMPT was NOT taught a source attribution rule",
    CONVERSATION_EVALUATOR_PROMPT.includes("RULE ON SOURCE ATTRIBUTION"),
    false,
  );
}

console.log("\n6. Component labels");
{
  const text = source("components/report/ReportBody.tsx");
  check("component references .source", text.includes(".source"), true);
  check('component renders "From your resume"', text.includes("From your resume"), true);
  check(
    'component renders "From the conversation"',
    text.includes("From the conversation"),
    true,
  );
  check('component renders "Resume + conversation"', text.includes("Resume + conversation"), true);
  check(
    "strengths row passes s.source to SourceChip",
    text.includes("source={s.source}"),
    true,
  );
  check(
    "growth-area row passes g.source to SourceChip",
    text.includes("source={g.source}"),
    true,
  );
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);
