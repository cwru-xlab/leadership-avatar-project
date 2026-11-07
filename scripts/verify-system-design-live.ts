/**
 * Live-interviewer probe for the system-design preset (REAL OpenAI calls).
 *
 * Plays scripted candidate turns against the engine's REAL live prompt
 * (`buildProblemInterviewSystemPrompt` + `buildProblemProgressBlock`) with
 * questions from the SD bank, parses replies with `parseProblemTurn`, applies
 * the engine's marker fallback (`inferUnmarkedActions`) exactly as the chat
 * route does, and checks that the interviewer:
 *   P1 never volunteers usage numbers when not asked;
 *   P2 hands over the right exhibit when asked, without reading numbers aloud;
 *   P3 nudges a candidate who jumps straight to components, neutrally;
 *   P4 releases only the fact asked for (incident);
 *   P5 hands over the incident dashboard without interpreting it.
 * Marker drops repaired by the fallback are reported (explicit vs inferred).
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-system-design-live.ts [--runs 2]
 */

import { getInterviewType } from "../lib/interview/types";
import { resolveAttemptLanguage } from "../lib/languages";
import { findProblemQuestion } from "../lib/problem-interview/banks.server";
import { buildProblemInterviewSystemPrompt, buildProblemProgressBlock } from "../lib/problem-interview/prompts";
import { inferUnmarkedActions, type ProblemInterviewState, type ProblemTurnAction } from "../lib/problem-interview/session-state";
import { parseProblemTurn } from "../lib/problem-interview/turn-control";
import { getSdFramework } from "../lib/system-design-interview/frameworks";
import { SD_INTERVIEW_SLUG } from "../lib/system-design-interview/live";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1] || 1) || 1;
const MODEL = "gpt-4.1"; // the chat route's live model

type Action = ProblemTurnAction & { inferred?: boolean };

interface Probe {
  id: string;
  questionId: string;
  turns: { role: "assistant" | "user"; content: string }[];
  revealed?: string[];
  check: (spoken: string, actions: Action[]) => string[];
}

const BANNED_NUDGE = [/framework/i, /structur/i, /\bsteps?\b/i, /requirement/i, /estimat/i, /trade-?off/i, /bottleneck/i, /\bqps\b/i, /back.of.(the.)?envelope/i, /remember to/i];
const leaks = (text: string, values: string[]) => values.filter((v) => text.toLowerCase().includes(v.toLowerCase()));

const PROBES: Probe[] = [
  {
    id: "P1 url: no volunteered numbers",
    questionId: "sd-url-shortener",
    turns: [{ role: "user", content: "Okay, interesting. Give me a moment to think about where to start." }],
    check: (spoken, actions) => [
      ...leaks(spoken, ["40 million", "25", "500 bytes", "five years", "86,400", "3x", "3×"]).map((v) => `volunteered "${v}"`),
      ...(actions.some((a) => a.kind === "exhibit") ? ["revealed an exhibit unasked"] : []),
      ...(actions.some((a) => a.kind === "nudge") ? ["nudged a candidate who asked for time"] : []),
      ...BANNED_NUDGE.filter((re) => re.test(spoken)).map((re) => `hinted at the method: ${re}`),
    ],
  },
  {
    id: "P2 url: usage exhibit on request",
    questionId: "sd-url-shortener",
    turns: [
      { role: "user", content: "Before designing, the core features are create and redirect, right? And how long do links live?" },
      { role: "assistant", content: "Yes, create and redirect are the core. Links are kept at least five years." },
      { role: "user", content: "Got it. I'm assuming fast redirects and high availability. What kind of traffic and storage should I plan for?" },
    ],
    check: (spoken, actions) => [
      ...(actions.some((a) => a.kind === "exhibit" && a.exhibit === "ex1") ? [] : [`no ex1 reveal (actions ${JSON.stringify(actions)})`]),
      ...leaks(spoken, ["40 million", "25", "500 bytes", "3x", "3×"]).map((v) => `read exhibit value "${v}" aloud`),
    ],
  },
  {
    id: "P3 url: neutral nudge on a jump to boxes",
    questionId: "sd-url-shortener",
    turns: [
      {
        role: "user",
        content:
          "So I'd put a load balancer in front of some app servers, Redis for caching, and Cassandra as the database, all on Kubernetes so it autoscales. The app servers hash the URL and store it.",
      },
    ],
    check: (spoken, actions) => {
      const nudge = actions.find((a) => a.kind === "nudge");
      return [
        ...(nudge ? [] : [`no nudge (actions ${JSON.stringify(actions)})`]),
        ...BANNED_NUDGE.filter((re) => re.test(spoken)).map((re) => `nudge wording matches ${re}`),
        ...leaks(spoken, ["40 million", "500 bytes"]).map((v) => `gave away "${v}"`),
      ];
    },
  },
  {
    id: "P4 incident: only the fact asked for",
    questionId: "inc-checkout-latency",
    turns: [{ role: "user", content: "First, when did the slowdown start?" }],
    check: (spoken, actions) => [
      ...(/14:05|2:05/.test(spoken) ? [] : ["did not give the start time"]),
      ...leaks(spoken, ["4,200", "4200", "46", "N+1", "promotion", "feature flag", "43"]).map((v) => `also volunteered "${v}"`),
      ...(actions.some((a) => a.kind === "exhibit") ? ["revealed an exhibit unasked"] : []),
    ],
  },
  {
    id: "P5 incident: dashboard on request, not interpreted",
    questionId: "inc-checkout-latency",
    turns: [
      { role: "user", content: "How bad is it and who's affected — and did anything change recently?" },
      { role: "assistant", content: "It started around 14:05. A release went out at 14:05 that added promotion badges to cart items. Traffic is normal." },
      { role: "user", content: "Can I see latency broken down by endpoint?" },
    ],
    check: (spoken, actions) => [
      ...(actions.some((a) => a.kind === "exhibit" && a.exhibit === "ex1") ? [] : [`no ex1 reveal (actions ${JSON.stringify(actions)})`]),
      ...leaks(spoken, ["4,200", "4200", "380", "only checkout", "only the checkout"]).map((v) => `read or interpreted "${v}"`),
    ],
  },
];

async function main() {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
  const base = getInterviewType(SD_INTERVIEW_SLUG)!;
  let failures = 0;
  let inferredCount = 0;

  for (let run = 1; run <= RUNS; run++) {
    for (const probe of PROBES) {
      const question = findProblemQuestion(SD_INTERVIEW_SLUG, probe.questionId)!;
      const framework = getSdFramework(question.frameworkKey)!;
      const system = buildProblemInterviewSystemPrompt(base, {
        question,
        framework,
        resumeText: "",
        jobDescriptionText: "",
        language: resolveAttemptLanguage(undefined),
      });
      const state: ProblemInterviewState = {
        stage: "problem",
        fitFollowUpsUsed: 1,
        promptPosed: true,
        revealedExhibits: probe.revealed ?? [],
        nudgedSteps: [],
      };
      const progress = buildProblemProgressBlock(state, { elapsedMinutes: 6, targetMinutes: base.targetMinutes }, question, framework);
      const history = [{ role: "assistant" as const, content: `Thanks. Let's turn to the problem. ${question.prompt}` }, ...probe.turns];
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
      const inferred = inferUnmarkedActions(parsed.content, parsed.actions, state, question, framework).map((a) => ({ ...a, inferred: true }));
      inferredCount += inferred.length;
      const actions: Action[] = [...parsed.actions, ...inferred].filter((a) => a.kind === "nudge" || a.kind === "exhibit");
      const problems = probe.check(parsed.content, actions);
      if (problems.length) failures += 1;
      console.log(`run ${run}  ${problems.length ? "FAIL" : "PASS"}  ${probe.id}`);
      console.log(`        said: ${parsed.content.replace(/\s+/g, " ").slice(0, 240)}`);
      console.log(`        markers: ${JSON.stringify(actions)}${problems.length ? `\n        problems: ${problems.join("; ")}` : ""}`);
    }
  }
  console.log(`\nMarkers repaired by the verbatim fallback: ${inferredCount}`);
  console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILING PROBE RUN(S)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
