/**
 * Live-interviewer probes for the data-analytics preset (REAL OpenAI calls).
 *
 * Plays scripted candidate turns against the REAL live prompt — the registered
 * type's `liveSystemPrompt` (engine `buildProblemInterviewSystemPrompt` with
 * the analytics persona) plus `buildProblemProgressBlock` — and parses each
 * reply with `parseProblemTurn`. Checks that the interviewer:
 *   P1 never volunteers numbers when not asked;
 *   P2 hands over the requested exhibit WITH its marker and does not read its
 *      numbers aloud;
 *   P3 answers a jump to a cause with a nudge marker and neutral wording;
 *   P4 releases only the fact that was asked for;
 *   P5 does not correct a wrong sample size or reveal the right one.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-analytics-interview-live.ts [--runs 2]
 */

import { ANALYTICS_INTERVIEW_SLUG } from "../lib/analytics-interview/live";
import { getAnalyticsFramework } from "../lib/analytics-interview/frameworks";
import { getAnalyticsQuestion } from "../lib/analytics-interview/questions";
import { getInterviewType } from "../lib/interview/types";
import { resolveAttemptLanguage } from "../lib/languages";
import { buildProblemInterviewSystemPrompt, buildProblemProgressBlock } from "../lib/problem-interview/prompts";
import type { ProblemInterviewState } from "../lib/problem-interview/session-state";
import { parseProblemTurn } from "../lib/problem-interview/turn-control";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1] || 1) || 1;
const MODEL = "gpt-4.1"; // the chat route's live model

type Action = { kind: string; step?: string; exhibit?: string };
interface Probe {
  id: string;
  questionId: string;
  turns: { role: "assistant" | "user"; content: string }[];
  revealed?: string[];
  check: (spoken: string, actions: Action[]) => string[];
}

const BANNED_NUDGE_WORDS = [/framework/, /\bsteps?\b/, /hypothes/, /segment/, /data integrity/, /logging/, /break (it|this) down/, /by platform/, /remember to/];
const leaks = (text: string, values: string[]) => values.filter((v) => text.includes(v));

const PROBES: Probe[] = [
  {
    id: "P1 DAU: no volunteered numbers",
    questionId: "da-diag-dau-drop",
    turns: [{ role: "user", content: "Okay. Give me a second to think about how I'd approach this." }],
    check: (spoken, actions) => [
      ...leaks(spoken, ["10.0", "9.2", "5.2", "Android", "4.50", "3.77", "server"]).map((v) => `volunteered "${v}"`),
      ...(actions.some((a) => a.kind === "exhibit") ? ["revealed an exhibit unasked"] : []),
    ],
  },
  {
    id: "P1 SRM readout: no volunteered numbers",
    questionId: "da-readout-onboarding-srm",
    turns: [{ role: "user", content: "Interesting. Let me think about where to start." }],
    check: (spoken, actions) => [
      ...leaks(spoken, ["48,600", "50,000", "Android", "crash", "63"]).map((v) => `volunteered "${v}"`),
      ...(actions.some((a) => a.kind === "exhibit") ? ["revealed an exhibit unasked"] : []),
    ],
  },
  {
    id: "P2 DAU: platform exhibit on request, not read aloud",
    questionId: "da-diag-dau-drop",
    turns: [
      { role: "user", content: "First, how is DAU defined, and how big is the drop exactly?" },
      {
        role: "assistant",
        content:
          "DAU counts distinct users with a foreground session that day, from a client-side event. Last week averaged 10.0 million, this week 9.2 million, starting Tuesday.",
      },
      { role: "user", content: "Thanks. Could I see DAU broken down by platform?" },
    ],
    check: (spoken, actions) => [
      ...(actions.some((a) => a.kind === "exhibit" && a.exhibit === "ex1") ? [] : [`no ex1 marker (actions ${JSON.stringify(actions)})`]),
      ...leaks(spoken, ["4.94", "3.77", "16.2", "16%", "0.49", "1.2%"]).map((v) => `read exhibit value "${v}" aloud`),
    ],
  },
  {
    id: "P2 checkout funnel: exhibit on request, not read aloud",
    questionId: "da-diag-checkout-funnel",
    turns: [{ role: "user", content: "Can I see the order funnel step by step, week over week?" }],
    check: (spoken, actions) => [
      ...(actions.some((a) => a.kind === "exhibit" && a.exhibit === "ex1") ? [] : [`no ex1 marker (actions ${JSON.stringify(actions)})`]),
      ...leaks(spoken, ["693,000", "700,000", "64.9", "71.4", "4,950,000"]).map((v) => `read exhibit value "${v}" aloud`),
    ],
  },
  {
    id: "P3 DAU: neutral nudge on a jump to a cause",
    questionId: "da-diag-dau-drop",
    turns: [
      {
        role: "user",
        content: "This is obviously the new Android release — users hate the redesign. I'd roll it back today.",
      },
    ],
    check: (spoken, actions) => {
      const lower = spoken.toLowerCase();
      return [
        ...(actions.some((a) => a.kind === "nudge") ? [] : [`no nudge marker (actions ${JSON.stringify(actions)})`]),
        ...BANNED_NUDGE_WORDS.filter((w) => w.test(lower)).map((w) => `nudge wording matches ${w}`),
        ...leaks(spoken, ["3.77", "4.94", "0.67", "75%", "server"]).map((v) => `gave away "${v}"`),
      ];
    },
  },
  {
    id: "P4 checkout: only the fact asked for",
    questionId: "da-ab-one-page-checkout",
    turns: [{ role: "user", content: "What share of users who reach the cart buy today?" }],
    check: (spoken) => [
      ...(/20\s?%|20 percent|twenty percent|one in five/i.test(spoken) ? [] : ["did not give the baseline"]),
      ...leaks(spoken, ["50,000", "1 percentage", "one percentage", "5%", "80%", "$60", "promo"]).map((v) => `also volunteered "${v}"`),
    ],
  },
  {
    id: "P5 push: no correcting a wrong sample size",
    questionId: "da-ab-morning-push",
    turns: [
      { role: "user", content: "What's day-7 retention today, and what lift matters?" },
      { role: "assistant", content: "40% of new users are active on day 7, and the team cares about 2 percentage points." },
      {
        role: "user",
        content:
          "Okay. The central limit theorem kicks in around 30 users, so 500 users per group is plenty. We'd have that in an hour.",
      },
    ],
    check: (spoken) => [
      ...leaks(spoken, ["9,600", "9600", "16 ", "19,200", "too small", "not enough", "underpowered"]).map((v) => `corrected/revealed "${v}"`),
    ],
  },
];

async function main() {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
  const base = getInterviewType(ANALYTICS_INTERVIEW_SLUG)!;
  let failures = 0;

  for (let run = 1; run <= RUNS; run++) {
    const results = await Promise.all(
      PROBES.map(async (probe) => {
        const question = getAnalyticsQuestion(probe.questionId)!;
        const framework = getAnalyticsFramework(question.frameworkKey)!;
        const system = buildProblemInterviewSystemPrompt(base, {
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
        } as unknown as ProblemInterviewState;
        const progress = buildProblemProgressBlock(state, { elapsedMinutes: 6, targetMinutes: base.targetMinutes }, question, framework);
        const history = [{ role: "assistant" as const, content: `Thanks. Let's turn to the problem. ${question.prompt}` }, ...probe.turns];
        const last = history.length - 1;
        const completion = await openai.chat.completions.create({
          model: MODEL,
          max_tokens: 400,
          messages: [
            { role: "system" as const, content: system },
            ...history.map((t, i) => ({ role: t.role, content: i === last ? `${t.content}\n\n${progress}` : t.content })),
          ],
        });
        const parsed = parseProblemTurn(completion.choices[0]?.message?.content ?? "");
        const actions = parsed.actions as Action[];
        return { probe, spoken: parsed.content, actions, problems: probe.check(parsed.content, actions) };
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
