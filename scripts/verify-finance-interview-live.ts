/**
 * Live-interviewer probe for the finance interview (REAL OpenAI calls).
 *
 * Plays scripted candidate turns against the engine's REAL live prompt
 * (`buildProblemInterviewSystemPrompt` with the registered finance persona,
 * plus `buildProblemProgressBlock`) on bank questions, parses the reply with
 * `parseProblemTurn`, and checks that the interviewer:
 *   P1 never volunteers LBO numbers while the candidate sets up;
 *   P2 hands over the projections exhibit (marker) when asked, without
 *      reading the numbers aloud;
 *   P3 nudges a candidate who jumps to an IRR, with a nudge marker and
 *      wording that names no step, method or answer;
 *   P4 releases only the fact asked for (tax rate);
 *   P5 on a candidate-choice pitch, supplies no facts, numbers or thesis
 *      about the candidate's company.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-finance-interview-live.ts [--runs 2]
 */

import { getInterviewType } from "../lib/interview/types";
import { resolveAttemptLanguage } from "../lib/languages";
import { FINANCE_INTERVIEW_SLUG } from "../lib/finance-interview/live";
import { getFinanceFramework } from "../lib/finance-interview/frameworks";
import { getFinanceQuestion } from "../lib/finance-interview/questions";
import { buildProblemInterviewSystemPrompt, buildProblemProgressBlock } from "../lib/problem-interview/prompts";
import { initialProblemState } from "../lib/problem-interview/session-state";
import { parseProblemTurn } from "../lib/problem-interview/turn-control";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1] || 1) || 1;
const MODEL = "gpt-4.1"; // the chat route's live model

type Action = { kind: string; step?: string; exhibit?: string };
interface Probe {
  id: string;
  questionId: string;
  turns: { role: "assistant" | "user"; content: string }[];
  revealed: string[];
  check: (reply: string, actions: Action[]) => string[];
  /** Soft observations, reported but not failing. */
  observe?: (reply: string, actions: Action[]) => string[];
}

const BANNED_NUDGE = [/framework/, /\bsteps?\b/, /\birr\b/, /\bmoic\b/, /assum/, /sources and uses/, /remember to/, /you should/, /thesis/, /catalyst/];
const leaks = (text: string, values: string[]) => values.filter((v) => text.includes(v));

const HARBOR = "fin-lbo-harbor-foods";
const PROBES: Probe[] = [
  {
    id: "P1 Harbor: no volunteered numbers while setting up",
    questionId: HARBOR,
    revealed: ["ex1"],
    turns: [{ role: "user", content: "Okay, give me a second to set up my page." }],
    check: (reply, actions) => [
      ...leaks(reply, ["25%", "48", "110", "150", "270", "1,170", "2.9", "24%"]).map((v) => `volunteered "${v}"`),
      ...(actions.some((a) => a.kind === "exhibit") ? ["revealed an exhibit unasked"] : []),
    ],
    observe: (_r, actions) => (actions.some((a) => a.kind === "nudge") ? ["nudged while the candidate was setting up"] : []),
  },
  {
    id: "P2 Harbor: projections exhibit on request, not read aloud",
    questionId: HARBOR,
    revealed: ["ex1"],
    turns: [
      { role: "user", content: "So 10x on $100M is a billion, 6 turns of debt is 600, equity 400. Interest at 8% is 48 a year. How does EBITDA grow over the five years?" },
    ],
    check: (reply, actions) => [
      ...(actions.some((a) => a.kind === "exhibit" && a.exhibit === "ex2") ? [] : [`no ex2 marker (actions ${JSON.stringify(actions)})`]),
      ...leaks(reply, ["110", "120", "130", "140", "150"]).map((v) => `read exhibit value "${v}" aloud`),
    ],
  },
  {
    id: "P3 Harbor: neutral nudge on a jump to the answer",
    questionId: HARBOR,
    revealed: ["ex1"],
    turns: [{ role: "user", content: "It's basically a 3x, so about 25% IRR. I'd do it." }],
    check: (reply, actions) => {
      const spoken = reply.toLowerCase();
      return [
        ...(actions.some((a) => a.kind === "nudge") ? [] : [`no nudge marker (actions ${JSON.stringify(actions)})`]),
        ...BANNED_NUDGE.filter((w) => w.test(spoken)).map((w) => `nudge wording matches ${w}`),
        ...leaks(reply, ["2.9", "24%", "1,170", "270", "330"]).map((v) => `gave away "${v}"`),
      ];
    },
  },
  {
    id: "P4 Harbor: only the fact asked for",
    questionId: HARBOR,
    revealed: ["ex1"],
    turns: [{ role: "user", content: "Before I start — what tax rate should I use?" }],
    check: (reply) => [
      ...(/25/.test(reply) ? [] : ["did not give the tax rate"]),
      ...leaks(reply, ["starting", "$10", "10 million", "working capital", "20%"]).map((v) => `also volunteered "${v}"`),
    ],
  },
  {
    id: "P5 Pitch your choice: no facts or thesis supplied",
    questionId: "fin-pitch-your-choice-long",
    revealed: [],
    turns: [{ role: "user", content: "I'd like to pitch Costco as a long." }],
    check: (reply) => [
      ...(/\d/.test(reply) ? [`reply contains a number: "${reply.match(/[^.]*\d[^.]*/)?.[0]}"`] : []),
      ...leaks(reply.toLowerCase(), ["membership", "renewal", "warehouse", "kirkland"]).map((v) => `supplied company detail "${v}"`),
    ],
  },
];

async function main() {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
  const base = getInterviewType(FINANCE_INTERVIEW_SLUG)!;
  let failures = 0;
  const softs: string[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      PROBES.map(async (probe) => {
        const question = getFinanceQuestion(probe.questionId)!;
        const framework = getFinanceFramework(question.frameworkKey)!;
        const system = buildProblemInterviewSystemPrompt(base, {
          question,
          framework,
          resumeText: "",
          jobDescriptionText: "",
          language: resolveAttemptLanguage(undefined),
        });
        const state = { ...initialProblemState(), stage: "problem" as const, fitFollowUpsUsed: 1, promptPosed: true, revealedExhibits: probe.revealed };
        const progress = buildProblemProgressBlock(state, { elapsedMinutes: 5, targetMinutes: base.targetMinutes }, question, framework);
        const history = [{ role: "assistant" as const, content: `Thanks. ${question.prompt}` }, ...probe.turns];
        const last = history.length - 1;
        const completion = await openai.chat.completions.create({
          model: MODEL,
          max_tokens: 400,
          messages: [
            { role: "system", content: system },
            ...history.map((t, i) => ({ role: t.role, content: i === last ? `${t.content}\n\n${progress}` : t.content })),
          ],
        });
        const parsed = parseProblemTurn(completion.choices[0]?.message?.content ?? "");
        const actions = parsed.actions as Action[];
        return { probe, spoken: parsed.content, actions, problems: probe.check(parsed.content, actions), soft: probe.observe?.(parsed.content, actions) ?? [] };
      }),
    );
    for (const r of results) {
      if (r.problems.length) failures += 1;
      softs.push(...r.soft.map((s) => `run ${run} ${r.probe.id.slice(0, 2)}: ${s}`));
      console.log(`run ${run}  ${r.problems.length ? "FAIL" : "PASS"}  ${r.probe.id}`);
      console.log(`        said: ${r.spoken.replace(/\s+/g, " ").slice(0, 220)}`);
      console.log(`        markers: ${JSON.stringify(r.actions)}${r.problems.length ? `\n        problems: ${r.problems.join("; ")}` : ""}`);
    }
  }
  if (softs.length) console.log(`\nObservations:\n  ${softs.join("\n  ")}`);
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILING PROBE RUN(S)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
