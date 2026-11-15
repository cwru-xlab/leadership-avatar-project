/**
 * Technical-coding grading PROBE (REAL OpenAI calls). Research only.
 *
 * Grades four scripted sessions of ONE catalog problem (longest-unique-window,
 * Python) through the real `technical-coding` evaluator, exactly as
 * `runAndPersistEvaluation` would after `/api/practice/session/finish`:
 *
 *   - transcript   = the server's visibleTurns, each with its own server
 *                    timestamp (G4, 2026-11-15), formatted by
 *                    formatTranscriptForEvaluator;
 *   - context      = the runner's buildEvaluationContextForReport technical
 *                    branch (copied here because it is not exported): evidence,
 *                    finalSource, finalExecution: null, the public assignment,
 *                    the language and the issued hints located by
 *                    locateHintTurns;
 *   - runEvaluation (real prompt, real schema, real model — the execution-
 *                    claim guard runs inside it);
 *   - the runner's post-process: codingSteps re-timed and finalized,
 *     coding_correctness forced to null.
 *
 * Before 2026-11-15 the code never reached the model; the "Before" table in
 * docs/technical-coding/grading-probe.md was taken with the earlier version
 * of this script (git history).
 *
 * The OpenAI client is wrapped so the exact user message the model received
 * is captured and saved — that is how we show what the evaluator can and
 * cannot see.
 *
 * Control (--with-code): one extra run per session that ALSO puts the final
 * source and the visible/hidden test outcomes into `evaluatorBrief` (which
 * buildUserMessage does render). This is NOT what production does; it shows
 * what grading would look like if the code reached the model.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/research/technical-coding-grading-probe.ts \
 *     [--runs 2] [--with-code] [--out dir] [--seed-report student@case.edu] [--dump-messages]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Role = "user" | "assistant";
interface Turn { role: Role; content: string }

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 2);
const WITH_CODE = args.includes("--with-code");
const OUT = argOf("--out") ?? "scripts/research/out/technical-coding-probe";
const SEED_EMAIL = argOf("--seed-report") ?? null;
/** Capture the evaluator's user message for each session without calling the model. */
const DUMP_ONLY = args.includes("--dump-messages");
const ASSIGNMENT_ID = "longest-unique-window";

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

const CORRECT = `def longest_unique_window(text):
    last_seen = {}
    best = 0
    left = 0
    for right, ch in enumerate(text):
        if ch in last_seen and last_seen[ch] >= left:
            left = last_seen[ch] + 1
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best
`;

/** The classic bug: the left edge can jump BACKWARDS on a stale index ("abba" -> 3). */
const STALE_LEFT = `def longest_unique_window(text):
    last_seen = {}
    best = 0
    left = 0
    for right, ch in enumerate(text):
        if ch in last_seen:
            left = last_seen[ch] + 1
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best
`;

/** (c)'s final: stale-left bug AND best starts at 1, so "" returns 1. */
const WRONG_FINAL = `def longest_unique_window(text):
    last_seen = {}
    best = 1
    left = 0
    for right, ch in enumerate(text):
        if ch in last_seen:
            left = last_seen[ch] + 1
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best
`;

const BRUTE = `def longest_unique_window(text):
    best = 0
    for i in range(len(text)):
        for j in range(i, len(text)):
            window = text[i:j + 1]
            if len(set(window)) == len(window):
                best = max(best, len(window))
    return best
`;

/** What the browser runner / a real executor would report. Never reaches the evaluator in production. */
const TEST_FACTS: Record<string, string> = {
  CORRECT:
    'Visible tests: 2/2 passed ("abcabcbb" -> 3, "bbbbb" -> 1). Hidden tests: 3/3 passed ("" -> 0, "pwwkew" -> 3, "abcdef" -> 6). Extra check "abba" -> 2 (correct).',
  WRONG_FINAL:
    'Visible tests: 2/2 passed ("abcabcbb" -> 3, "bbbbb" -> 1). Hidden tests: 2/3 passed — FAILED "" (expected 0, got 1). Extra check "abba": expected 2, got 3 (left edge moves backwards on a stale index).',
  BRUTE:
    'Visible tests: 2/2 passed. Hidden tests: 3/3 passed. Actual complexity O(n^3) time (n^2 windows, each copied and hashed), O(n) space — not the O(n) target.',
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

interface Session {
  id: "a-strong-correct" | "b-silent-correct" | "c-strong-wrong" | "d-weak-brute";
  label: string;
  turns: Turn[];
  checkpoints: string[];
  finalSource: string;
  tests: string;
  /** Turn indexes that are system-issued hints, with their tier. */
  hintTurns?: Record<number, number>;
}

const I = (content: string): Turn => ({ role: "assistant", content });
const C = (content: string): Turn => ({ role: "user", content });

function sessions(opening: string, hint1: string): Session[] {
  // hint1 is the full server reply, "Hint 1 of 3: …" (buildTechnicalHint).
  return [
    {
      id: "a-strong-correct",
      label: "(a) Strong process, correct code",
      checkpoints: [STALE_LEFT, CORRECT],
      finalSource: CORRECT,
      tests: TEST_FACTS.CORRECT,
      turns: [
        I(opening),
        C("Yes, I can see it. So I get a string and return the length of the longest contiguous substring with no repeated characters — just the length, not the substring itself. A couple of questions: is the input ASCII or any Unicode? Is it case sensitive, so 'a' and 'A' are different? And for an empty string I'd return 0 — is that right?"),
        I("Treat it as any characters, case sensitive, and yes, empty returns 0. What's your approach?"),
        C("Let me do examples first. 'abcabcbb': 'abc' is 3, then every later window hits a repeat, so 3. 'bbbbb' is 1. 'pwwkew' is 3 for 'wke' — and note 'pwke' isn't valid because it's not contiguous. Edge cases I want to keep in mind: empty string, a single character, all the same character, all distinct, and something like 'abba' where a repeat shows up that's already outside my current window."),
        I("Good. What's your plan?"),
        C("Brute force would be checking every substring for uniqueness — that's O(n^2) substrings and O(n) each to check, so O(n^3), or O(n^2) if I grow each window with a set. Better: a sliding window. I keep a left pointer and move a right pointer forward. I store the last index where I saw each character in a dictionary. When the character at right was seen inside the current window, I jump left to one past that last index. Then the window from left to right is always duplicate-free and I update best with right minus left plus one."),
        I("What's the time and space complexity, and why?"),
        C("Time is O(n): right visits each index once and left only ever moves forward, so total pointer movement is at most 2n, and each step is a constant-time dictionary lookup. Space is O(k) where k is the number of distinct characters, since the dictionary holds at most one entry per distinct character — bounded by the alphabet, so O(min(n, k))."),
        I("Okay, go ahead and code it."),
        C("I'm writing it now. Dictionary last_seen, best equals 0, left equals 0, loop over right and ch with enumerate. If ch is in last_seen, set left to last_seen[ch] plus 1. Store the index, update best."),
        C("Let me trace 'abba' before I run. a at 0, b at 1, best 2. b at 2: seen at 1, left becomes 2. a at 3: seen at 0, so left becomes 1 — that's wrong, it moved backwards and the window 'bba' has a duplicate. That would return 3. The bug is I need to only move left if the last occurrence is inside the window. I'll change the condition to 'ch in last_seen and last_seen[ch] >= left'."),
        I("Good catch. What does it return now for 'abba'?"),
        C("a at 3: last seen 0, which is less than left 2, so left stays 2. Window is 'ba', length 2, best stays 2. Correct. Empty string: the loop never runs, returns 0. Single character returns 1. I ran the visible tests and both pass — 'abcabcbb' gives 3 and 'bbbbb' gives 1."),
        I("What would break at a much larger input size, and what would you change with more time?"),
        C("Nothing breaks algorithmically — it's linear and the dictionary is bounded by the alphabet. For a huge stream I'd make it process characters incrementally instead of needing the whole string. With more time I'd add tests for 'abba', 'dvdf', and a long all-distinct string, and maybe use a fixed-size array if the alphabet were known to be ASCII."),
        I("Thanks, that's all I had."),
      ],
    },
    {
      id: "b-silent-correct",
      label: "(b) Silent coder, correct code",
      checkpoints: [CORRECT],
      finalSource: CORRECT,
      tests: TEST_FACTS.CORRECT,
      turns: [
        I(opening),
        C("ok"),
        I("Can you restate the problem and tell me your approach before you start coding?"),
        C("sliding window"),
        I("Can you say a bit more — what data structure, and what's the time and space complexity?"),
        C("dict. I'll just code it"),
        I("Okay. Let me know when you're ready to walk me through it."),
        C("done"),
        I("Can you walk me through it on a small input, and tell me the complexity?"),
        C("it passes the tests"),
        I("What edge cases did you consider?"),
        C("empty works"),
      ],
    },
    {
      id: "c-strong-wrong",
      label: "(c) Strong process, wrong final code",
      checkpoints: [WRONG_FINAL],
      finalSource: WRONG_FINAL,
      tests: TEST_FACTS.WRONG_FINAL,
      turns: [
        I(opening),
        C("Yes. I take a string and return the length of the longest contiguous substring with all distinct characters. Is it case sensitive, and can the string be empty? And it's only the length I return, right?"),
        I("Case sensitive, it can be empty, and yes, only the length."),
        C("Examples: 'abcabcbb' gives 3 from 'abc'. 'bbbbb' gives 1. 'pwwkew' gives 3 from 'wke' — 'pwke' doesn't count because it's a subsequence, not a substring. Edge cases: empty string should be 0, a single character is 1, all the same character is 1."),
        I("What's your approach?"),
        C("The brute force is every substring with a uniqueness check, which is cubic. Instead I'll use a sliding window with two pointers and a dictionary from character to the last index I saw it. As right moves forward, if the character was seen before, I move left to one past that index. The window between left and right then has no repeats, and I track the best length."),
        I("Complexity?"),
        C("O(n) time, because each pointer only moves forward through the string once, and each dictionary operation is O(1) on average. O(k) space for the dictionary, where k is the alphabet size."),
        I("Go ahead."),
        C("Coding it now. I'll start best at 1 since any non-empty string has at least a window of one. Then the loop with enumerate, update left on a repeat, store the index, update best."),
        C("Let me trace 'abcabcbb'. a, b, c: best 3. a at 3: last seen 0, left goes to 1, window 'bca', still 3. b at 4: left 2, 'cab'. c at 5: left 3, 'abc'. b at 6: last seen 4, left 5, 'cb'. b at 7: left 7, 'b'. Returns 3. Both visible tests pass."),
        I("What about a string like 'abba'?"),
        C("Hmm. a, b, then b again moves left to 2, then a — last seen at 0 so left goes to 1. That gives window 'bba'... I think that's still fine because best was already 2. Actually I'm not completely sure — I think I'd want to check that left doesn't move backwards, but I'm running out of time so I'll leave it."),
        I("And the empty string?"),
        C("That should return 0 — the loop doesn't run. I'm comfortable with the approach; with more time I'd write more tests around repeats that fall outside the window."),
        I("Okay, thanks. That's time."),
      ],
    },
    {
      id: "d-weak-brute",
      label: "(d) Weak: brute force, wrong complexity, ignores hint",
      checkpoints: [BRUTE],
      finalSource: BRUTE,
      tests: TEST_FACTS.BRUTE,
      hintTurns: { 9: 1 },
      turns: [
        I(opening),
        C("yeah I'll just check all the substrings"),
        I("Before you code, can you restate the problem and tell me what you'd check about each substring?"),
        C("whether it has duplicates. I'll use a set"),
        I("What's the time complexity of that?"),
        C("O(n), it's just loops"),
        I("How many substrings are there, and how much work is it to check each one?"),
        C("it's fine, sets are fast. I'll code it"),
        C("Can I get a hint?"),
        I(hint1),
        C("ok I'll keep mine, it works"),
        I("Your solution checks every substring. Can you do better than that, and can you re-derive the time complexity?"),
        C("it's O(n). it passed the tests"),
        I("What edge cases did you consider?"),
        C("not really any, it should handle them"),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

interface Graded {
  session: string;
  run: string;
  model: string;
  scores: Record<string, number | null>;
  rawCodingCorrectness: number | null;
  outcome: Record<string, unknown> | null;
  guardStripped: number;
  reportStructured: unknown;
  reportMarkdown: string;
  userMessage: string;
  ok: boolean;
  reason?: string;
}

async function main() {
  const { requireEnv } = await import("../guard-env");
  requireEnv("technical-coding-grading-probe", ["OPENAI_API_KEY"]);

  // Capture the exact request the evaluator sends.
  const OpenAI = (await import("openai")).default;
  const captured: string[] = [];
  const proto = (OpenAI as unknown as { Chat: { Completions: { prototype: { create: (...a: unknown[]) => unknown } } } }).Chat.Completions.prototype;
  const realCreate = proto.create;
  proto.create = function (this: unknown, ...a: unknown[]) {
    const body = a[0] as { messages: Array<{ role: string; content: unknown }> };
    const user = body.messages.find((m) => m.role === "user");
    captured.push(typeof user?.content === "string" ? user.content : JSON.stringify(user?.content));
    if (DUMP_ONLY) throw new Error("dump-only: request captured, model not called");
    return realCreate.apply(this, a);
  };

  const { getTechnicalAssignment } = await import("../../lib/technical-interview/assignments.server");
  const { buildTechnicalOpening } = await import("../../lib/technical-interview/opening");
  const { toPublicTechnicalAssignment, TECHNICAL_RUNTIME_POLICY_VERSION } = await import("../../lib/technical-interview/types");
  const { resolveSessionConfig } = await import("../../lib/engine/resolve");
  const { runEvaluation } = await import("../../lib/engine/evaluation");
  const { buildRubricJsonSchema } = await import("../../lib/engine/rubric");
  const { getEngineType } = await import("../../lib/engine/registry");
  const { buildInterviewTranscript, formatTranscriptForEvaluator } = await import("../../lib/interview/transcript");
  const { initialProgress } = await import("../../lib/interview/types");
  const { buildTechnicalHint } = await import("../../lib/technical-interview/chat-policy");
  const { locateHintTurns, finalizeCodingStepsOutcome } = await import("../../lib/technical-interview/grading");
  const { retimeOutcomeQuotes, studentTurnTexts } = await import("../../lib/engine/quote-timecodes");

  // Count the execution-claim guard's strips (it logs a warning per report).
  let guardStrips = 0;
  const realWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].includes("execution-claim")) {
      guardStrips += Number((a[1] as { strippedCount?: number })?.strippedCount ?? 0);
      return;
    }
    realWarn(...a);
  };

  const assignment = getTechnicalAssignment(ASSIGNMENT_ID);
  if (!assignment) throw new Error(`no assignment ${ASSIGNMENT_ID}`);
  const opening = buildTechnicalOpening(toPublicTechnicalAssignment(assignment));
  const all = sessions(opening, buildTechnicalHint(assignment, 1));

  const resolved = resolveSessionConfig("technical-coding", {});
  if (!resolved.ok) throw new Error(`resolveSessionConfig: ${JSON.stringify(resolved)}`);
  const config = resolved.config;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "schema.json"), JSON.stringify(buildRubricJsonSchema(config), null, 2));
  writeFileSync(join(OUT, "system-prompt.txt"), getEngineType("technical-coding")!.prompts.evaluatorPrompt);
  console.log(`rubric dimensions: ${config.rubricDimensions.map((d) => d.key).join(", ")}`);

  const startedAt = Date.now() - 28 * 60_000;
  /** Server time per turn (G4): spread over the session, never all equal. */
  const timed = (st: Session) =>
    st.turns.map((t, i) => ({ ...t, timestamp: startedAt + 5_000 + Math.round((i * 26 * 60_000) / st.turns.length) + (i % 3) * 7_000 }));
  const transcriptOf = (st: Session) =>
    formatTranscriptForEvaluator(
      buildInterviewTranscript({
        reportId: `probe-${st.id}`,
        userId: "probe",
        typeSlug: "technical-coding",
        interviewer: { avatarId: null, name: null },
        startedAt,
        turns: timed(st),
        progress: initialProgress(),
      }),
    );

  const evidenceOf = (st: Session) => ({
    version: 1 as const,
    checkpoints: st.checkpoints.map((source) => ({ source })),
    visibleTurns: timed(st),
    finalSource: st.finalSource,
    finalExecution: null,
  });

  const hintRowsOf = (st: Session) =>
    Object.entries(st.hintTurns ?? {}).map(([index, tier]) => ({
      tier,
      hintText: st.turns[Number(index)]!.content,
      issuedAt: new Date(timed(st)[Number(index)]!.timestamp),
    }));

  async function grade(s: Session, run: string, withCode: boolean): Promise<Graded> {
    const evidence = evidenceOf(s);
    // == buildEvaluationContextForReport, technical-coding branch ==
    const evaluationContext: Record<string, unknown> = {
      kind: "technical-coding",
      technicalEvidence: evidence,
      finalSource: evidence.finalSource,
      finalExecution: null,
      assignment: toPublicTechnicalAssignment(assignment!),
      language: "python",
      hints: locateHintTurns(hintRowsOf(s), evidence.visibleTurns, startedAt),
      omittedVisibleTurns: 0,
    };
    if (withCode) {
      evaluationContext.evaluatorBrief = [
        `Problem: ${assignment!.title} — ${assignment!.statement} Target: ${assignment!.expectedComplexity}.`,
        `Candidate's final source (Python):\n${s.finalSource}`,
        `Execution outcome: ${s.tests}`,
      ].join("\n\n");
    }
    const marker = `Candidate: ${s.turns.find((t) => t.role === "user")!.content}`;
    const before = guardStrips;
    const out = await runEvaluation({
      config,
      transcript: transcriptOf(s),
      evaluationContext,
      metricsOutcome: { visualMetrics: null, vocalMetrics: null },
    });
    // Two sessions grade in parallel, so pick this session's request by content, not by order.
    const userMessage = [...captured].reverse().find((m) => m.includes(marker) && m.includes("case_context:") === withCode) ?? "";
    if (!userMessage) console.warn("  (request not captured)");
    if (!out.ok) {
      return { session: s.id, run, model: out.model, scores: {}, rawCodingCorrectness: null, outcome: null, guardStripped: 0, reportStructured: null, reportMarkdown: "", userMessage, ok: false, reason: out.reason };
    }
    const raw = out.result.scores.coding_correctness ?? null;
    // == runner post-process: no executor, so correctness is withheld ==
    const scores = { ...out.result.scores, coding_correctness: null };
    // == runner post-process: re-time quotes from the real turn times, finalize codingSteps ==
    const outcome = finalizeCodingStepsOutcome(
      retimeOutcomeQuotes(out.producedOutcome, studentTurnTexts(timed(s), startedAt)),
    );
    return { session: s.id, run, model: out.model, scores, rawCodingCorrectness: raw, outcome, guardStripped: guardStrips - before, reportStructured: out.result.reportStructured, reportMarkdown: out.result.reportMarkdown, userMessage, ok: true };
  }

  if (DUMP_ONLY) {
    for (const s of all) {
      for (const withCode of [false, true]) {
        const g = await grade(s, withCode ? "with-code" : "production", withCode);
        writeFileSync(join(OUT, `user-message.${s.id}.${withCode ? "with-code" : "production"}.txt`), g.userMessage);
      }
    }
    console.log(`user messages written to ${OUT}`);
    return;
  }

  const results: Graded[] = [];
  const plan: Array<[Session, string, boolean]> = [];
  for (let r = 1; r <= RUNS; r++) for (const s of all) plan.push([s, `run${r}`, false]);
  if (WITH_CODE) for (const s of all) plan.push([s, "with-code", true]);

  for (let i = 0; i < plan.length; i += 2) {
    const batch = await Promise.all(plan.slice(i, i + 2).map(([s, run, wc]) => grade(s, run, wc)));
    for (const g of batch) {
      results.push(g);
      const sc = (k: string) => String(g.scores[k] ?? "–");
      const steps = (() => {
        try {
          const rows = JSON.parse(String(g.outcome?.codingSteps ?? "[]")) as Array<{ key: string; status: string }>;
          return rows.map((r) => `${r.key}:${r.status}`).join(" ");
        } catch {
          return "(unparsed)";
        }
      })();
      console.log(
        `${g.session.padEnd(18)} ${g.run.padEnd(9)} ${g.ok ? "" : `FAILED ${g.reason}`}content ${sc("content")} behav ${sc("behavioral")} quality ${sc("coding_quality")} comm ${sc("technical_communication")} correctness(raw model) ${g.rawCodingCorrectness ?? "–"} visual ${sc("visual")} vocal ${sc("vocal")} guard-stripped ${g.guardStripped}\n    steps: ${steps}`,
      );
      writeFileSync(join(OUT, `${g.session}.${g.run}.json`), JSON.stringify(g, null, 2));
    }
  }
  writeFileSync(join(OUT, "all.json"), JSON.stringify(results, null, 2));

  // What the model saw, and what it said.
  const claim = /\b(?:tests?|test cases?)\b[^.!?]{0,60}\b(?:pass(?:es|ed)?|fail(?:s|ed)?)\b|\baccepted by\b|\bpassed execution\b/i;
  for (const r of results) {
    const text = `${r.reportMarkdown}\n${String(r.outcome?.codingSteps ?? "")}`;
    const stamps = [...r.userMessage.matchAll(/^\[(\d+:\d\d)\]/gm)].map((m) => m[1]);
    console.log(
      `${r.session} ${r.run}: request has final source ${r.userMessage.includes("def longest_unique_window")}, NOT RUN line ${r.userMessage.includes("Execution: NOT RUN")}, target complexity ${r.userMessage.includes(assignment.expectedComplexity)}, hints ${/hints_given \(/.test(r.userMessage)}; distinct transcript stamps ${new Set(stamps).size}/${stamps.length}; growth timecodes ${JSON.stringify((r.reportStructured as { growth_areas?: Array<{ timecodes: string[] }> } | null)?.growth_areas?.flatMap((g) => g.timecodes) ?? [])}; residual test-claim match ${claim.test(text) ? `YES: ${text.match(claim)?.[0]}` : "none"}; mentions empty string ${/empty|""|''/i.test(r.reportMarkdown)}; mentions O(n³) ${/O\(n\s*(?:\^\s*3|³)\)|cubic/i.test(r.reportMarkdown)}`,
    );
  }

  if (SEED_EMAIL) {
    const { prisma } = await import("../../lib/prisma");
    const user = await prisma.user.findUnique({ where: { email: SEED_EMAIL } });
    if (!user) throw new Error(`no user ${SEED_EMAIL}`);
    const seeded: string[] = [];
    for (const s of all) {
      const g = results.find((r) => r.session === s.id && r.run === "run1" && r.ok);
      if (!g) continue;
      const now = new Date();
      const row = await prisma.interactionReport.create({
        data: {
          userId: user.id,
          typeSlug: "technical-coding",
          status: "READY",
          inputSnapshot: {
            kind: "technical-coding",
            assignmentId: assignment.id,
            assignmentVersion: assignment.version,
            assignmentHash: assignment.contentHash,
            assignment: toPublicTechnicalAssignment(assignment),
            language: "python",
            runtimePolicyVersion: TECHNICAL_RUNTIME_POLICY_VERSION,
            selectedAt: new Date(now.getTime() - 30 * 60_000).toISOString(),
            requested: { topics: [], difficulty: null },
          } as object,
          technicalEvidence: evidenceOf(s) as object,
          scores: g.scores as object,
          ...(g.outcome ? { outcome: g.outcome as object } : {}),
          reportStructured: g.reportStructured as object,
          reportMarkdown: g.reportMarkdown,
          evalModel: g.model,
          turnCount: s.turns.length,
          cameraMode: "OFF",
          title: `Grading probe (after) — ${s.label}`,
          startedAt: new Date(startedAt),
          completedAt: now,
        },
      });
      for (const hint of hintRowsOf(s)) {
        await prisma.technicalInterviewHint.create({
          data: { reportId: row.id, requestKey: `probe:${hint.tier}`, tier: hint.tier, hintText: hint.hintText, issuedAt: hint.issuedAt },
        });
      }
      seeded.push(`${s.id}=${row.id}`);
    }
    console.log(`\nseeded for ${SEED_EMAIL}: ${seeded.join(" ")}`);
    writeFileSync(join(OUT, "seeded.txt"), seeded.join("\n") + "\n");
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
