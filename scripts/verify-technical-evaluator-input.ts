/**
 * Offline proof that the technical-coding evaluator SEES the work and cannot
 * claim tests ran (2026-11-15, G1/G5). No network, no database.
 *
 *   1. The user message carries the problem, the target complexity, the
 *      language, the final code, the visible tests, the hints (tier + turn)
 *      and the literal "Execution: NOT RUN" line — and none of the private
 *      material (reference solution, hidden tests) or the generic interview
 *      envelope (resume_text, role_context).
 *   2. The post-parse guard strips fabricated test-run claims and keeps
 *      legitimate readings, predictions and reports of what the candidate said.
 *   3. The codingSteps outcome: declared optional (old reports validate),
 *      named in the prompt with every framework step, finalized to framework
 *      order, its notes guarded and its quotes re-timed.
 *
 * Run: npx tsx scripts/verify-technical-evaluator-input.ts
 */

import assert from "node:assert/strict";

import { buildUserMessage, validateEvaluationResult } from "../lib/engine/evaluation";
import { validateOutcome } from "../lib/engine/outcome";
import { retimeOutcomeQuotes, studentTurnTexts } from "../lib/engine/quote-timecodes";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { getEngineType } from "../lib/engine/registry";
import { asProcessStepResults } from "../lib/problem-interview/outcome";
import type { StructuredReport } from "../lib/report/structured";
import { getTechnicalAssignment } from "../lib/technical-interview/assignments.server";
import { appendServerVisibleTurns, emptyTechnicalEvidence } from "../lib/technical-interview/evidence";
import {
  EXECUTION_NOT_RUN_LINE,
  finalizeCodingStepsOutcome,
  isExecutionClaim,
  locateHintTurns,
  stripExecutionClaims,
} from "../lib/technical-interview/grading";
import { CODING_STEPS_OUTCOME_KEY, TECHNICAL_CODING_FRAMEWORK } from "../lib/technical-interview/process-framework";
import { toPublicTechnicalAssignment } from "../lib/technical-interview/types";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const privateAssignment = getTechnicalAssignment("longest-unique-window");
assert(privateAssignment, "fixture assignment missing");
const assignment = toPublicTechnicalAssignment(privateAssignment);

const FINAL_SOURCE = `function longestUniqueWindow(text) {
  const lastSeen = new Map();
  let best = 0;
  let left = 0;
  for (let right = 0; right < text.length; right += 1) {
    if (lastSeen.has(text[right]) && lastSeen.get(text[right]) >= left) left = lastSeen.get(text[right]) + 1;
    lastSeen.set(text[right], right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}`;
const HINT_TEXT = `Hint 1 of 3: ${privateAssignment.hintLadder[0]}`;
const startedAt = 1_700_000_000_000;

let evidence = emptyTechnicalEvidence();
const script: Array<["user" | "assistant", string, number]> = [
  ["assistant", "Let's work through Longest Unique Window.", 2],
  ["user", "Can the string be empty, and is it case sensitive?", 40],
  ["assistant", "It can be empty and it is case sensitive.", 55],
  ["user", "Can I get a hint?", 300],
  ["assistant", HINT_TEXT, 301],
  ["user", "So I keep a window and move the left edge past the repeat.", 360],
];
for (const [role, content, seconds] of script) {
  evidence = appendServerVisibleTurns(evidence, [{ role, content }], startedAt + seconds * 1000);
}
const hints = locateHintTurns(
  [{ tier: 1, hintText: HINT_TEXT, issuedAt: new Date(startedAt + 301_000) }],
  evidence.visibleTurns,
  startedAt,
);

console.log("\n1. The evaluator's user message carries the work");
const message = buildUserMessage(
  "[0:02] Interviewer: Let's work through Longest Unique Window.",
  {
    kind: "technical-coding",
    technicalEvidence: { ...evidence, finalSource: FINAL_SOURCE },
    finalSource: FINAL_SOURCE,
    finalExecution: null,
    assignment,
    language: "javascript",
    hints,
    omittedVisibleTurns: 0,
  },
  { visualMetrics: null, vocalMetrics: null },
);
check("contains the final source code", message.includes(FINAL_SOURCE));
check("contains the problem statement", message.includes(assignment.statement));
check("contains the target complexity", message.includes(`Target complexity: ${assignment.expectedComplexity}`));
check("contains the language", /language: JavaScript \(solution\.js\)/.test(message));
check(
  "contains every visible test",
  assignment.publicTests.every((t) => message.includes(t.label) && message.includes(JSON.stringify(t.expected))),
);
check("contains the hint with its tier", message.includes("Tier 1") && message.includes(privateAssignment.hintLadder[0]));
check("locates the hint's turn and time", hints[0]?.turnNumber === 5 && hints[0]?.atSeconds === 301, JSON.stringify(hints));
check("contains the hint's turn and [m:ss]", message.includes("transcript turn 5") && message.includes("[5:01]"));
check("contains the NOT RUN line verbatim", message.includes(EXECUTION_NOT_RUN_LINE));
check(
  "NOT RUN line reads as briefed",
  EXECUTION_NOT_RUN_LINE === "Execution: NOT RUN — no test results exist; do not claim any test passed or failed.",
);
check("contains the transcript", message.includes("full_transcript:\n[0:02] Interviewer:"));
check("omits the reference solution", !message.includes(privateAssignment.referenceSolution.trim()));
check(
  "omits the hidden tests",
  privateAssignment.hiddenTests.every((t) => !message.includes(`"${t.id}"`) && !message.includes(t.id)),
);
check("omits the generic resume/role envelope", !message.includes("resume_text:") && !message.includes("role_context:"));

const noHints = buildUserMessage("t", { kind: "technical-coding", assignment, language: "python", finalSource: "def f(): pass", hints: [] }, { visualMetrics: null, vocalMetrics: null });
check("states when no hint was used", noHints.includes("hints_given: none (0 of 3 used)"));
const legacy = buildUserMessage("t", { kind: "technical-coding", finalSource: null }, { visualMetrics: null, vocalMetrics: null });
check("a legacy context without the new fields still renders the NOT RUN line", legacy.includes(EXECUTION_NOT_RUN_LINE) && legacy.includes("final_source: (not recorded)"));
const omitted = buildUserMessage("t", { kind: "technical-coding", omittedVisibleTurns: 7 }, { visualMetrics: null, vocalMetrics: null });
check("notes dropped middle turns", omitted.includes("7 turns from the middle"));
const interview = buildUserMessage("t", { kind: "interview" }, { visualMetrics: null, vocalMetrics: null });
check("other interview kinds keep their envelope", interview.startsWith("full_transcript:\nt\n\nresume_text:"));

console.log("\n2. The guard strips fabricated execution claims");
const MUST_STRIP = [
  "Solution was accepted by the system, passing visible and hidden tests.",
  "Coding met all requirements and passed execution.",
  "All visible tests passed.",
  "Both visible tests passed, and reasoning for hidden case uncertainty was sound.",
  "Their implementation was correct on visible test cases and passed the hidden tests.",
  "The code fails the hidden test for the empty string.",
  "Your solution passed 2/2 tests.",
  "The test suite is green.",
  "The program ran successfully on every input.",
  "The code passed both tests but would fail on the empty string.",
  "The solution works on the hidden tests.",
];
const MUST_KEEP = [
  "Tracing \"\" through your code returns 1, not 0, because best starts at 1.",
  "You said it passes the tests, but you never traced an input aloud.",
  "Your code would fail on 'abba' because left can move backwards.",
  "No tests were run in this session.",
  "Run the visible tests and predict the result before you change code.",
  "You failed to test any edge case before saying you were done.",
  "Consider initializing best to 0 so the empty string returns 0.",
  "The brute force checks every substring, which is O(n^3) time.",
  "Make sure your solution would pass the empty-string case.",
  "Walking through 'abcabcbb' by hand, the code returns 3 as expected.",
  "Write a test for 'abba' so you can confirm the window never moves backwards.",
];
for (const sentence of MUST_STRIP) check(`strips: ${sentence}`, isExecutionClaim(sentence));
for (const sentence of MUST_KEEP) check(`keeps:  ${sentence}`, !isExecutionClaim(sentence));

const fabricated: StructuredReport = {
  overall_summary:
    "The candidate provided a strong solution. Their implementation was correct on visible test cases. They explained the sliding window well.",
  strengths: [
    { title: "All tests passed", detail: "The solution passed all visible tests.", evidence: null },
    { title: "Clear approach", detail: "You stated the window invariant before coding. All visible tests passed.", evidence: "I keep a left pointer" },
  ],
  growth_areas: [
    {
      title: "Empty input",
      detail: "Tracing \"\" returns 1, not 0. The code fails the hidden test for empty input.",
      suggestion: "Start best at 0.",
      timecodes: ["3:10"],
    },
  ],
  category_notes: { visual: null, vocal: null, content: "Solution was accepted by the system.", behavioral: "Calm under pushback." },
  rubric_notes: [
    { item: "coding_quality", note: "Passed execution." },
    { item: "technical_communication", note: "Explained complexity clearly." },
  ],
  practice_next: "Trace edge cases aloud. Your code passed all tests, so focus on narration.",
};
const guarded = stripExecutionClaims(fabricated);
const flat = JSON.stringify(guarded.report);
check("guard removed every claim sentence", !/passed all|accepted by|passed execution|fails the hidden|correct on visible test/i.test(flat), flat);
check("guard kept the honest sentences", flat.includes("They explained the sliding window well.") && flat.includes("Tracing \\\"\\\" returns 1, not 0.") && flat.includes("Calm under pushback."));
check("a strength titled with a claim is dropped", guarded.report.strengths.length === 1 && guarded.report.strengths[0]!.title === "Clear approach");
check("an emptied rubric note is dropped", guarded.report.rubric_notes.map((n) => n.item).join() === "technical_communication");
check("an emptied category note becomes null", guarded.report.category_notes.content === null);
check("strip count reported", guarded.strippedCount >= 7, String(guarded.strippedCount));

// End to end through the engine's own validator, as runEvaluation calls it.
const resolved = resolveSessionConfig("technical-coding", {});
assert(resolved.ok, "technical-coding config must resolve");
const raw = {
  visual_score: null,
  vocal_score: null,
  content_score: 4,
  behavioral_score: 4,
  coding_correctness_score: null,
  coding_quality_score: 3,
  technical_communication_score: 4,
  ...fabricated,
  outcome: {},
};
const validated = validateEvaluationResult(raw, resolved.config, { hasVisualMetrics: false, hasVocalMetrics: false }, { kind: "technical-coding" });
check("validateEvaluationResult applies the guard for technical-coding", !/accepted by the system/i.test(validated.reportMarkdown));
const otherKind = validateEvaluationResult(raw, resolved.config, { hasVisualMetrics: false, hasVocalMetrics: false }, { kind: "interview" });
check("…and only for technical-coding", /accepted by the system/i.test(otherKind.reportMarkdown));
const labelled = validateEvaluationResult(
  { ...raw, rubric_notes: [{ item: "Coding Quality", note: "Clear names." }, { item: "technical communication score", note: "Explained." }, { item: "content", note: "Ok." }, { item: "Something else", note: "Kept." }] },
  resolved.config,
  { hasVisualMetrics: false, hasVocalMetrics: false },
  { kind: "technical-coding" },
);
check(
  "rubric_notes items are normalized to dimension keys",
  labelled.reportStructured.rubric_notes.map((n) => n.item).join() === "coding_quality,technical_communication,content,Something else",
  labelled.reportStructured.rubric_notes.map((n) => n.item).join(),
);

console.log("\n3. codingSteps outcome");
const outcomeConfig = resolved.config.outcome;
check(
  "codingSteps is declared, optional, a string",
  outcomeConfig.fields.some((f) => f.key === CODING_STEPS_OUTCOME_KEY && f.kind === "string" && f.required === false),
);
check("an old report with no outcome fields validates", validateOutcome(outcomeConfig, {}).ok);
const prompt = getEngineType("technical-coding")!.prompts.evaluatorPrompt;
check(
  "the prompt names every framework step, every status and the outcome key",
  TECHNICAL_CODING_FRAMEWORK.steps.every((s) => prompt.includes(`"${s.key}"`)) &&
    ["hit", "prompted", "partly", "missed", "not_applicable"].every((s) => prompt.includes(`"${s}"`)) &&
    prompt.includes(`${CODING_STEPS_OUTCOME_KEY}: a STRING`),
);
check("the prompt keeps correctness null and forbids test claims", /coding_correctness: return null/.test(prompt) && /No code was run and no test result exists/.test(prompt));
check("the prompt says hints never lower a score", /Using hints must NOT lower any score/.test(prompt));

const producedSteps = JSON.stringify([
  { key: "wrap_up", status: "missed", evidenceQuote: "", timecodeSeconds: null, note: "Close with a summary." },
  { key: "clarify", status: "hit", evidenceQuote: "Can the string be empty, and is it case sensitive?", timecodeSeconds: 999, note: "You asked about empty input up front." },
  { key: "approach_before_code", status: "prompted", evidenceQuote: "I keep a window and move the left edge past the repeat", timecodeSeconds: null, note: "You found the approach after the hint." },
  { key: "test_and_trace", status: "partly", evidenceQuote: "it passes the tests", timecodeSeconds: null, note: "All visible tests passed. Trace 'abba' aloud next time." },
  { key: "invented_step", status: "hit", evidenceQuote: "", timecodeSeconds: null, note: "" },
]);
const produced = { [CODING_STEPS_OUTCOME_KEY]: producedSteps };
check("a new report with codingSteps validates", validateOutcome(outcomeConfig, produced).ok);
const turns = evidence.visibleTurns.map((t) => ({ role: t.role, content: t.content, timestamp: t.timestamp! }));
const finalized = finalizeCodingStepsOutcome(retimeOutcomeQuotes(produced, studentTurnTexts(turns, startedAt)));
const rows = asProcessStepResults(finalized?.[CODING_STEPS_OUTCOME_KEY]) ?? [];
check("finalized steps follow framework order and drop unknown keys", rows.map((r) => r.key).join() === "clarify,approach_before_code,test_and_trace,wrap_up", rows.map((r) => r.key).join());
check("quotes are re-timed from the real per-turn timestamps", rows[0]?.timecodeSeconds === 40 && rows[1]?.timecodeSeconds === 360, JSON.stringify(rows.map((r) => r.timecodeSeconds)));
check("a coaching note's test claim is stripped, the rest kept", rows[2]?.note === "Trace 'abba' aloud next time.", rows[2]?.note);
check("the candidate's verbatim quote is left alone", rows[2]?.evidenceQuote === "it passes the tests");
check("finalize leaves an outcome without codingSteps untouched", finalizeCodingStepsOutcome({ other: 1 })?.other === 1 && finalizeCodingStepsOutcome(null) === null);
check("an unparseable codingSteps is removed, not stored broken", !(CODING_STEPS_OUTCOME_KEY in (finalizeCodingStepsOutcome({ [CODING_STEPS_OUTCOME_KEY]: "nonsense" }) ?? {})));

if (failures === 0) {
  console.log("\nverify-technical-evaluator-input: ALL CHECKS PASSED\n");
  process.exit(0);
}
console.log(`\nverify-technical-evaluator-input: FAILED (${failures} failure(s))\n`);
process.exit(1);
