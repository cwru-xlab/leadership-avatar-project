/**
 * Live-interviewer sanity check for the consulting case (REAL OpenAI calls).
 *
 * Plays scripted candidate turns against the engine's REAL live prompt
 * (`buildProblemInterviewSystemPrompt` + `buildProblemProgressBlock`, branch
 * loop/problem-engine) for real cases from the bank, parses the reply with
 * the engine's `parseProblemTurn`, and checks that the interviewer:
 *   P1 never volunteers case numbers when not asked;
 *   P2 hands over the right exhibit (marker) when asked, without reading it out;
 *   P3 nudges a candidate who jumps to an answer, with a nudge marker and
 *      wording that names no step, method, or answer;
 *   P4 releases a fact only for the question asked.
 * Needs the engine modules: on a branch without them it exits 0 with SKIPPED.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-case-interview-live.ts [--runs 3]
 */

import { getCase } from "../lib/case-interview/cases";
import { getCaseFramework } from "../lib/case-interview/frameworks";
import { getInterviewType } from "../lib/interview/types";
import { resolveAttemptLanguage } from "../lib/languages";
import type { ProblemQuestion, ProcessFramework } from "../lib/problem-interview/types";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1] || 1) || 1;
const MODEL = "gpt-4.1"; // the chat route's live model

async function tryImport<T>(path: string): Promise<T | null> {
  try {
    return (await import(path)) as T;
  } catch {
    return null;
  }
}

interface Probe {
  id: string;
  caseId: string;
  /** Conversation after the problem was posed (assistant turn 0 is the prompt). */
  turns: { role: "assistant" | "user"; content: string }[];
  revealed?: string[];
  check: (reply: string, actions: { kind: string; step?: string; exhibit?: string }[]) => string[];
}

const BANNED_NUDGE_WORDS = [/framework/, /structur/, /\bsteps?\b(?! back)/, /hypothes/, /clarif/, /\bmece\b/, /issue tree/, /synthes/, /remember to/];
const leaks = (text: string, values: string[]) => values.filter((v) => text.includes(v));

const PROBES: Probe[] = [
  {
    id: "P1 airline: no volunteered numbers",
    caseId: "case-airline-cle-nyc",
    turns: [{ role: "user", content: "Okay, interesting. Give me a second to think about where to begin." }],
    check: (reply, actions) => [
      ...leaks(reply, ["70", "12 ", "1.1", "159", "8,400", "2.0", "48%", "214", "break even", "break-even"]).map((v) => `volunteered "${v}"`),
      ...(actions.some((a) => a.kind === "exhibit") ? ["revealed an exhibit unasked"] : []),
    ],
  },
  {
    id: "P1 hair gel: no volunteered numbers",
    caseId: "estimate-hair-gel-ohio",
    turns: [{ role: "user", content: "Hmm, okay. Let me think about how to approach that." }],
    check: (reply) => leaks(reply, ["11.8", "million"]).map((v) => `volunteered "${v}"`),
  },
  {
    id: "P2 airline: cost exhibit on request",
    caseId: "case-airline-cle-nyc",
    revealed: ["ex1"],
    turns: [
      {
        role: "user",
        content:
          "So Lakefront wants to know if a Cleveland–New York route makes sense. What's their objective?",
      },
      { role: "assistant", content: "They need the route to at least break even in its first full year." },
      {
        role: "user",
        content:
          "Got it. I'd look at revenue, costs, and competitive risks. Since the goal is break-even, I'd start with costs versus revenue per flight. Could I see what it costs to operate the route?",
      },
    ],
    check: (reply, actions) => [
      ...(actions.some((a) => a.kind === "exhibit" && a.exhibit === "ex2") ? [] : [`no ex2 marker (actions ${JSON.stringify(actions)})`]),
      ...leaks(reply, ["8,400", "8400", "2.0", "$2 million", "2 million", "360"]).map((v) => `read exhibit value "${v}" aloud`),
    ],
  },
  {
    id: "P3 airline: neutral nudge on a jump",
    caseId: "case-airline-cle-nyc",
    turns: [
      {
        role: "user",
        content:
          "I think they should just launch it. New York is a huge market and a cheaper fare will fill their planes.",
      },
    ],
    check: (reply, actions) => {
      const nudge = actions.find((a) => a.kind === "nudge");
      const spoken = reply.toLowerCase();
      return [
        ...(nudge ? [] : [`no nudge marker (actions ${JSON.stringify(actions)})`]),
        ...BANNED_NUDGE_WORDS.filter((w) => w.test(spoken)).map((w) => `nudge wording matches ${w}`),
        ...leaks(reply, ["159", "8,400", "84%", "break even", "break-even"]).map((v) => `gave away "${v}"`),
      ];
    },
  },
  {
    id: "P4 airline: fact only for the question asked",
    caseId: "case-airline-cle-nyc",
    turns: [{ role: "user", content: "Before I structure anything — what's Lakefront's objective with this route?" }],
    check: (reply) => [
      ...(/breaks?[- ]even/i.test(reply) ? [] : ["did not give the objective"]),
      ...leaks(reply, ["159", "8,400", "70 seats", "1.1"]).map((v) => `also volunteered "${v}"`),
    ],
  },
];

async function main() {
  const prompts = await tryImport<{
    buildProblemInterviewSystemPrompt: (type: unknown, input: unknown) => string;
    buildProblemProgressBlock: (state: unknown, timing: unknown, q: ProblemQuestion, f: ProcessFramework) => string;
  }>("../lib/problem-interview/prompts");
  const turnControl = await tryImport<{
    parseProblemTurn: (r: string) => { content: string; actions: { kind: string; step?: string; exhibit?: string }[] };
  }>("../lib/problem-interview/turn-control");
  if (!prompts || !turnControl) {
    console.log("SKIPPED: engine live prompt builder (lib/problem-interview/prompts.ts) not on this branch.");
    process.exit(0);
  }
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
  const base = getInterviewType("consulting")!;
  let failures = 0;

  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      PROBES.map(async (probe) => {
        const question = getCase(probe.caseId)!;
        const framework = getCaseFramework(question.frameworkKey)!;
        const system = prompts.buildProblemInterviewSystemPrompt(base, {
          question,
          framework,
          resumeText: "",
          jobDescriptionText: "",
          language: resolveAttemptLanguage(undefined),
        });
        const state = {
          stage: "problem",
          fitFollowUpsUsed: 1,
          promptPosed: true,
          revealedExhibits: probe.revealed ?? [],
          nudgedSteps: [],
        };
        const progress = prompts.buildProblemProgressBlock(state, { elapsedMinutes: 5, targetMinutes: base.targetMinutes }, question, framework);
        const history = [
          { role: "assistant" as const, content: `Thanks. Let's turn to the case. ${question.prompt}` },
          ...probe.turns,
        ];
        const last = history.length - 1;
        const messages = [
          { role: "system" as const, content: system },
          ...history.map((t, i) => ({ role: t.role, content: i === last ? `${t.content}\n\n${progress}` : t.content })),
        ];
        const completion = await openai.chat.completions.create({ model: MODEL, messages, max_tokens: 400 });
        const raw = completion.choices[0]?.message?.content ?? "";
        const parsed = turnControl.parseProblemTurn(raw);
        const problems = probe.check(parsed.content, parsed.actions);
        return { probe, spoken: parsed.content, actions: parsed.actions, problems };
      }),
    );
    for (const r of results) {
      if (r.problems.length) failures += 1;
      console.log(`run ${run}  ${r.problems.length ? "FAIL" : "PASS"}  ${r.probe.id}`);
      console.log(`        said: ${r.spoken.replace(/\s+/g, " ").slice(0, 220)}`);
      console.log(`        markers: ${JSON.stringify(r.actions)}${r.problems.length ? `\n        problems: ${r.problems.join("; ")}` : ""}`);
    }
  }
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILING PROBE RUN(S)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
