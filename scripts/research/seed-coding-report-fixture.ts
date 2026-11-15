/**
 * DEV-ONLY: seed technical-coding report fixtures for the coding report UI.
 *
 * Inserts two READY `technical-coding` reports for one account (default
 * student@case.edu), in the shapes the real pipeline stores:
 *
 * - "graded": a `codingSteps` outcome (JSON-encoded `ProcessStepResult[]`,
 *   `lib/technical-interview/process-framework.ts`), the coding rubric scores
 *   with `coding_correctness: null` (as `evaluation-runner.ts` forces),
 *   `technicalEvidence` with checkpoints, visible turns and `finalSource`
 *   (`lib/technical-interview/evidence.ts`), and two `TechnicalInterviewHint`
 *   rows whose text is `buildTechnicalHint`'s.
 * - "old": what a report from before this work looks like — no `codingSteps`,
 *   no `finalSource`, no hints, and a "resume"-sourced strength (the coding
 *   chrome must not show the attribution chip).
 *
 * It also writes MOCK post-session material for the problem to
 * `scripts/research/fixtures/coding-post-session.mock.json`. The app reads it
 * ONLY outside production and ONLY when started with
 * `TECHNICAL_POST_SESSION_FIXTURE=<that path>` (see
 * `lib/technical-interview/report-material.server.ts`). It is never shipped as
 * real material: loop/coding-corpus authors that in `post-session.server.ts`.
 *
 * Idempotent: earlier fixtures (titles starting "Coding report fixture") for
 * the account are deleted first. Writes the ids to
 * `scripts/research/out/coding-report-fixture.json` for the e2e spec.
 *
 *   npx tsx --env-file=.env.local scripts/research/seed-coding-report-fixture.ts [email]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { prisma } from "../../lib/prisma";
import { getTechnicalAssignment } from "../../lib/technical-interview/assignments.server";
import { buildTechnicalHint } from "../../lib/technical-interview/chat-policy";
import { CODING_STEPS_OUTCOME_KEY } from "../../lib/technical-interview/process-framework";
import type { PostSessionMaterial } from "../../lib/technical-interview/post-session.server";
import type { ProcessStepResult } from "../../lib/problem-interview/types";
import type { StructuredReport } from "../../lib/report/structured";
import {
  TECHNICAL_EVIDENCE_VERSION,
  type TechnicalEvidence,
} from "../../lib/technical-interview/evidence";
import {
  TECHNICAL_RUNTIME_POLICY_VERSION,
  toPublicTechnicalAssignment,
  type TechnicalHintTier,
} from "../../lib/technical-interview/types";

if (process.env.NODE_ENV === "production") {
  throw new Error("seed-coding-report-fixture is dev-only");
}

const EMAIL = process.argv[2] ?? "student@case.edu";
const TITLE_PREFIX = "Coding report fixture";
const ASSIGNMENT_ID = "longest-unique-window";
const HERE = dirname(new URL(import.meta.url).pathname);
const MOCK_PATH = resolve(HERE, "fixtures/coding-post-session.mock.json");
const OUT_PATH = resolve(HERE, "out/coding-report-fixture.json");

const FINAL_SOURCE = `def longest_unique_window(s):
    last_seen = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        # Only jump forward: a repeat left of the window is stale.
        if ch in last_seen and last_seen[ch] >= left:
            left = last_seen[ch] + 1
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best
`;

/** Distinctive markers the e2e asserts are absent until the reveal click. */
export const MOCK_SOLUTION_MARKER = "MOCK_MODEL_SOLUTION_MARKER";

const MOCK_MATERIAL: Record<string, PostSessionMaterial> = {
  [ASSIGNMENT_ID]: {
    approach:
      "MOCK (dev fixture). Grow a window over the string one character at a time and keep it free of repeats. Remember the last index where each character appeared.\n\nWhen the next character already appears inside the window, move the left edge to just past that earlier position. Never move the left edge backwards: an index left of the window is stale.\n\nThe answer is the widest window seen.",
    complexity: "O(n) time, O(k) space for k distinct characters",
    pitfalls: [
      "Moving the left edge backwards when a repeat sits outside the current window (try \"abba\").",
      "Starting the best length at 1, which is wrong for the empty string.",
      "Rebuilding a set for every start index, which is O(n²) or worse.",
    ],
    modelSolutions: {
      python: `# ${MOCK_SOLUTION_MARKER} (python)\ndef longest_unique_window(s):\n    last_seen = {}\n    left = best = 0\n    for right, ch in enumerate(s):\n        if last_seen.get(ch, -1) >= left:\n            left = last_seen[ch] + 1\n        last_seen[ch] = right\n        best = max(best, right - left + 1)\n    return best\n`,
      javascript: `// ${MOCK_SOLUTION_MARKER} (javascript)\nfunction longest_unique_window(s) {\n  const lastSeen = new Map();\n  let left = 0;\n  let best = 0;\n  for (let right = 0; right < s.length; right += 1) {\n    const ch = s[right];\n    if ((lastSeen.get(ch) ?? -1) >= left) left = lastSeen.get(ch) + 1;\n    lastSeen.set(ch, right);\n    best = Math.max(best, right - left + 1);\n  }\n  return best;\n}\n`,
    },
  },
};

const STEPS: ProcessStepResult[] = [
  { key: "clarify", status: "hit", evidenceQuote: "Is the input only lowercase letters, and should an empty string return zero?", timecodeSeconds: 42, note: "You pinned down the empty case before solving, which saved you later." },
  { key: "examples_edge_cases", status: "hit", evidenceQuote: "For abcabcbb the window grows to abc, then the second a forces it to slide.", timecodeSeconds: 95, note: "A worked example plus the empty string covered the main edges." },
  { key: "approach_before_code", status: "hit", evidenceQuote: "Brute force checks every substring; a sliding window with a last-seen map gets it to one pass.", timecodeSeconds: 160, note: "Comparing brute force with the window made the plan easy to follow." },
  { key: "complexity", status: "partly", evidenceQuote: "It's linear time.", timecodeSeconds: 210, note: "You gave time but not space; name the map's size as well." },
  { key: "narrate_implementation", status: "prompted", evidenceQuote: "So here I only move left forward if the last index is inside the window.", timecodeSeconds: 520, note: "You started narrating after the second hint; try talking from the first line." },
  { key: "test_and_trace", status: "hit", evidenceQuote: "Tracing abba: at the second a, last seen is zero, which is left of the window, so left stays.", timecodeSeconds: 760, note: "Tracing abba is exactly the case that catches the stale-left bug." },
  { key: "wrap_up", status: "missed", evidenceQuote: "", timecodeSeconds: null, note: "Close with the solution's cost and one thing you would improve." },
];

function structured(old: boolean): StructuredReport {
  return {
    overall_summary: old
      ? "You reached a working idea and explained the window clearly, though the final code was not captured for this older session."
      : "You clarified the problem, compared brute force with a sliding window, and traced a tricky case to fix a bug. Space complexity and a closing summary were the gaps.",
    strengths: [
      {
        title: "Clear plan before coding",
        detail: "You explained the sliding window and why the last-seen map keeps it to one pass.",
        evidence: "a sliding window with a last-seen map gets it to one pass",
        source: old ? "resume" : "conversation",
      },
      {
        title: "Tested the tricky case",
        detail: "Tracing \"abba\" by hand found the stale left-edge bug before you finished.",
        evidence: "Tracing abba: at the second a, last seen is zero",
        source: "conversation",
      },
    ],
    growth_areas: [
      {
        title: "State space complexity too",
        detail: "You gave linear time but not the space used by the map.",
        suggestion: "Say both: O(n) time, O(k) space for k distinct characters.",
        timecodes: ["3:30"],
        source: "conversation",
        dimension: "technical_communication",
      },
    ],
    category_notes: {
      visual: null,
      vocal: null,
      content: "The approach was well structured from clarification to testing.",
      behavioral: "You took the hint well and kept reasoning out loud afterwards.",
    },
    rubric_notes: [
      { item: "Coding Quality", note: "Clean single-pass window with a clear invariant." },
      { item: "Technical Communication", note: "Strong plan and trace; space complexity was left out." },
      { item: "Coding Correctness", note: "Not run on the server." },
      { item: "Solution approach", note: "Compared brute force with the window before coding." },
    ],
    practice_next: "Close every solution by stating its time and space cost in one sentence.",
  };
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`no user ${EMAIL}`);
  const assignment = getTechnicalAssignment(ASSIGNMENT_ID);
  if (!assignment) throw new Error(`no assignment ${ASSIGNMENT_ID}`);

  mkdirSync(dirname(MOCK_PATH), { recursive: true });
  writeFileSync(MOCK_PATH, JSON.stringify(MOCK_MATERIAL, null, 2) + "\n");

  await prisma.interactionReport.deleteMany({
    where: { userId: user.id, title: { startsWith: TITLE_PREFIX } },
  });

  const now = Date.now();
  const inputSnapshot = (language: "python" | "javascript") => ({
    kind: "technical-coding",
    assignmentId: assignment.id,
    assignmentVersion: assignment.version,
    assignmentHash: assignment.contentHash,
    assignment: toPublicTechnicalAssignment(assignment),
    language,
    runtimePolicyVersion: TECHNICAL_RUNTIME_POLICY_VERSION,
    selectedAt: new Date(now - 32 * 60_000).toISOString(),
    requested: { topics: [], difficulty: null },
  });

  const evidence: TechnicalEvidence = {
    version: TECHNICAL_EVIDENCE_VERSION,
    checkpoints: [{ source: FINAL_SOURCE }],
    visibleTurns: [
      { role: "assistant", content: `Today's problem is ${assignment.title}. Target: ${assignment.expectedComplexity}.` },
      { role: "user", content: "Is the input only lowercase letters, and should an empty string return zero?" },
      { role: "assistant", content: "Yes to both." },
      { role: "user", content: "Brute force checks every substring; a sliding window with a last-seen map gets it to one pass." },
    ],
    finalSource: FINAL_SOURCE,
    finalExecution: null,
  };

  const graded = await prisma.interactionReport.create({
    data: {
      userId: user.id,
      typeSlug: "technical-coding",
      status: "READY",
      title: `${TITLE_PREFIX} — graded with steps`,
      inputSnapshot: inputSnapshot("python") as object,
      technicalEvidence: evidence as object,
      scores: { visual: null, vocal: null, content: 4, behavioral: 4, coding_quality: 4, technical_communication: 3, coding_correctness: null },
      outcome: { [CODING_STEPS_OUTCOME_KEY]: JSON.stringify(STEPS) },
      reportStructured: structured(false) as object,
      reportMarkdown: "Fixture report.",
      evalModel: "fixture",
      turnCount: evidence.visibleTurns.length,
      cameraMode: "OFF",
      startedAt: new Date(now - 30 * 60_000),
      completedAt: new Date(now - 60_000),
    },
  });
  for (const tier of [1, 2] as TechnicalHintTier[]) {
    await prisma.technicalInterviewHint.create({
      data: { reportId: graded.id, requestKey: `fixture-${tier}`, tier, hintText: buildTechnicalHint(assignment, tier) },
    });
  }

  const old = await prisma.interactionReport.create({
    data: {
      userId: user.id,
      typeSlug: "technical-coding",
      status: "READY",
      title: `${TITLE_PREFIX} — old, no steps or code`,
      inputSnapshot: inputSnapshot("javascript") as object,
      technicalEvidence: { ...evidence, finalSource: undefined, checkpoints: [] } as object,
      scores: { visual: null, vocal: null, content: 3, behavioral: 3, coding_quality: 3, technical_communication: 3, coding_correctness: null },
      reportStructured: structured(true) as object,
      reportMarkdown: "Fixture report.",
      evalModel: "fixture",
      turnCount: 4,
      cameraMode: "OFF",
      startedAt: new Date(now - 90 * 60_000),
      completedAt: new Date(now - 60 * 60_000),
    },
  });

  const out = { email: EMAIL, graded: graded.id, old: old.id, mockMaterial: MOCK_PATH, marker: MOCK_SOLUTION_MARKER };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nStart the dev server with TECHNICAL_POST_SESSION_FIXTURE=${join(MOCK_PATH)} to see mock material.`);
  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
