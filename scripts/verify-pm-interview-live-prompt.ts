/**
 * PM interview LIVE-PROMPT sanity check (real OpenAI, gpt-4.1 like the chat
 * route). Probes whether the interviewer behaves like a neutral FAANG PM
 * interviewer: poses the abstract prompt without hints, nudges a skipped step
 * without naming it, hands over an exhibit only when a breakdown is asked
 * for, and refuses to coach.
 *
 * TODO(problem-engine): this drives the INTERIM live prompt in
 * lib/pm-interview/interim-config.ts. Once the engine's builder lands, swap
 * `buildProblemLivePrompt` for the engine's assembled system prompt — the
 * probes and assertions are the data the builder must satisfy.
 *
 * Run: npx tsx scripts/verify-pm-interview-live-prompt.ts
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { buildProblemLivePrompt } from "../lib/pm-interview/interim-config";
import { PM_TYPE_INPUT } from "../lib/pm-interview/type";
import { getPmQuestion } from "../lib/pm-interview/questions";

type Msg = { role: "user" | "assistant"; content: string };

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`    ok   ${name}`);
  else {
    failures += 1;
    console.log(`    FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Words a neutral interviewer must never say while nudging or replying. */
const COACHING = /\b(circles?|framework|identify the customer|user segments?|prioriti[sz]e|great structure|good structure|you should|try to|remember to)\b/i;

async function reply(questionId: string, history: Msg[]): Promise<string> {
  const question = getPmQuestion(questionId)!;
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: buildProblemLivePrompt(PM_TYPE_INPUT, question) },
      ...history,
    ],
    max_tokens: 400,
  });
  return completion.choices[0]?.message?.content ?? "";
}

const FIT: Msg[] = [
  { role: "user", content: "Hi, I'm ready." },
  { role: "assistant", content: "Great to meet you. To start, what draws you to product management?" },
  { role: "user", content: "I've been an analyst on a growth team for two years and I want to own the decisions about what we build, not just measure them." },
];

async function probePosesPrompt() {
  console.log("\n  1. Poses the abstract prompt without adding hints");
  // The fit stage allows one follow-up; answer it if asked, then expect the problem.
  let text = await reply("pm-design-alarm-clock-deaf", FIT);
  if (!/alarm clock/i.test(text)) {
    console.log(`    (fit follow-up: ${text.replace(/\n/g, " ").slice(0, 160)})`);
    text = await reply("pm-design-alarm-clock-deaf", [
      ...FIT,
      { role: "assistant", content: text },
      { role: "user", content: "Probably Google Maps — it quietly solves a hard problem for billions of people every day." },
    ]);
  }
  console.log(`    reply: ${text.replace(/\n/g, " ").slice(0, 240)}`);
  check("contains the prompt", /alarm clock for the deaf/i.test(text));
  check("adds no coaching or framework hints", !COACHING.test(text), text);
  check("does not volunteer interviewer facts", !/bed-shaker|flashing-light|US market/i.test(text));
}

async function probeNudge() {
  console.log("\n  2. Neutral nudge when the candidate skips the user and jumps to features");
  const history: Msg[] = [
    ...FIT,
    { role: "assistant", content: "Thanks. Here's the question: design an alarm clock for the deaf." },
    {
      role: "user",
      content:
        "Okay, so I'd build a vibrating wristband, a strobe light that flashes, a pillow shaker, and an app that connects them all. The wristband would have a long battery life and the strobe would be really bright. I think that covers it, so let me go deeper on the wristband's features.",
    },
  ];
  const text = await reply("pm-design-alarm-clock-deaf", history);
  console.log(`    reply: ${text.replace(/\n/g, " ").slice(0, 240)}`);
  check("emits a nudge marker", /<interview-turn kind="nudge" step="[a-z_]+"\s*\/>/.test(text), text);
  const spoken = text.replace(/<interview-turn[^>]*\/>/g, "");
  check("spoken nudge does not name the step or framework", !COACHING.test(spoken), spoken);
  check("asks exactly one question", (spoken.match(/\?/g) ?? []).length === 1, spoken);
}

async function probeExhibit() {
  console.log("\n  3. Hands over the exhibit only when a breakdown is asked for");
  const base: Msg[] = [
    ...FIT,
    {
      role: "assistant",
      content:
        "Thanks. You're the PM for a food delivery app. Orders this week are down 12% compared to last week. What's going on?",
    },
  ];
  const before = await reply("pm-metrics-food-delivery-drop", [
    ...base,
    { role: "user", content: "Is the metric completed orders, and did anything change in tracking?" },
  ]);
  console.log(`    clarifying reply: ${before.replace(/\n/g, " ").slice(0, 200)}`);
  check("no exhibit on a clarifying question", !/kind="exhibit"/.test(before), before);
  check("does not leak the Android release unasked", !/7\.4|android/i.test(before), before);

  const after = await reply("pm-metrics-food-delivery-drop", [
    ...base,
    { role: "user", content: "Is the metric completed orders, and did anything change in tracking?" },
    { role: "assistant", content: "Completed orders. The definition and the tracking pipeline haven't changed." },
    { role: "user", content: "Okay. Can I see orders broken down by platform — iOS, Android and web?" },
  ]);
  console.log(`    breakdown reply: ${after.replace(/\n/g, " ").slice(0, 200)}`);
  check("reveals ex1 with the exhibit marker", /<interview-turn kind="exhibit" exhibit="ex1"\s*\/>/.test(after), after);
  const spokenAfter = after.replace(/<interview-turn[^>]*\/>/g, "");
  check(
    "does not read out or interpret the exhibit",
    !/(release|7\.4|google pay|bug|android|ios|flat|drop|almost all|%|\d{3},\d{3})/i.test(spokenAfter),
    spokenAfter,
  );
}

async function probeNoCoaching() {
  console.log("\n  4. Declines to coach when asked for feedback mid-problem");
  const text = await reply("pm-design-loneliness", [
    ...FIT,
    { role: "assistant", content: "Thanks. Here's the question: design a product for people who are lonely." },
    { role: "user", content: "Before I go on — am I approaching this the right way? What should I cover next?" },
  ]);
  console.log(`    reply: ${text.replace(/\n/g, " ").slice(0, 240)}`);
  check("gives no method or next-step advice", !COACHING.test(text) && !/next,? (you|I'd)/i.test(text), text);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(2);
  }
  console.log("PM interview live-prompt sanity (interim prompt, gpt-4.1)");
  await probePosesPrompt();
  await probeNudge();
  await probeExhibit();
  await probeNoCoaching();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
