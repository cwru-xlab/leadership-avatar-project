/**
 * Sales-discovery SEPARATION study (REAL OpenAI calls).
 *
 * Grades two scripted transcripts of the same sales case — one that pitches
 * from the first turn, one that listens first — with the REAL registered
 * `sales-discovery` type: the supplementary behavior-coding pass first (as
 * the evaluation runner runs it), then the rubric evaluator with the coding
 * note appended. Asserts the rubric separates them: every listening-first
 * dimension and the listening metrics come out higher for the listen-first
 * transcript.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-sales-discovery-grading.ts [--json out.json]
 * Exits 1 when the transcripts are not separated.
 */

import { writeFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { requireEnv } from "./guard-env";

requireEnv(__filename.split("/").pop()!.replace(/\.ts$/, ""), ["OPENAI_API_KEY"]);

import { validateEvaluationResult } from "../lib/engine/evaluation";
import { getEngineType } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import type { DifficultConversationInstance } from "../lib/engine/types";
import { evaluatorNoteFor, runPersonaAnalysis } from "../lib/questioned-persona/analysis";
import { findPersonaCase } from "../lib/questioned-persona/cases";
import { REPORT_SPELLING_RULE } from "../lib/report/structured";

const CASE_ID = "sales-saas-hospital-ops";
const STARTED_AT = 1_700_000_000_000;
const MODEL = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1";
const JSON_OUT = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

type Line = { s: string } | { b: string };

const PITCH_FIRST: Line[] = [
  { s: "Hi Dana, thanks for the time. I'm Alex from FlowBoard Health. Let me jump right in and show you what we do." },
  { b: "Thanks for coming in. I've got about twenty minutes. Your email said something about patient flow?" },
  { s: "Yes! FlowBoard is a cloud bed-management platform. It reads your EHR orders, shows every bed in real time, uses AI to predict discharges, and alerts transport and pharmacy automatically. We work with over forty hospitals and they see a 30% improvement in throughput." },
  { b: "Mm-hm. We have a bed board in the EHR already." },
  { s: "Ours is much better than the EHR board. It has a mobile app, customizable dashboards, predictive analytics, and it integrates with Epic and Cerner out of the box. Pricing starts at about eighty thousand a year for a hospital your size." },
  { b: "Honestly, every vendor who walks in here has a dashboard." },
  { s: "I understand, but we're different because our AI is trained on millions of patient stays. Wouldn't it be great to know discharges hours ahead?" },
  { b: "I suppose. We tried something like this before and the nurses wouldn't use it." },
  { s: "That won't happen with FlowBoard, our interface is really intuitive and nurses love it. We also offer free training. And if you sign this quarter I can take 15% off." },
  { b: "Okay. I've got about ten minutes left, so." },
  { s: "Sure. I'll send you our deck and a case study, and maybe you can share it with your team. Does that sound good?" },
  { b: "Sure, send me something and I'll take a look." },
];

const LISTEN_FIRST: Line[] = [
  { s: "Hi Dana, I'm Alex from FlowBoard Health. Thanks for making the time. Before I say anything about us, would it be okay if I asked a few questions about how things work here, so I don't waste your twenty minutes?" },
  { b: "Sure, that works. I've got about twenty minutes." },
  { s: "How does a patient get from the ER to an inpatient bed here today, walk me through it?" },
  { b: "The ER calls the bed office, they look at the EHR bed board and the whiteboard, and then it's a lot of phone calls to the units to find out who's actually leaving." },
  { s: "What's the hardest part of that for you right now?" },
  { b: "Honestly, ER boarding. Admitted patients are sitting in the ER six to nine hours waiting for a bed. The ER director brings it up at every leadership meeting." },
  { s: "Six to nine hours, and it's landing on you in front of leadership. That sounds like a lot of pressure. What do you think is driving it?" },
  { b: "Discharges. The orders get written in the morning, but transport, pharmacy and paperwork stall them, so most patients don't actually leave until after three." },
  { s: "When that happens, what does it cost the hospital?" },
  { b: "We went on ambulance diversion eleven times last quarter. Finance says every diversion hour is about eight thousand dollars in lost admissions." },
  { s: "Have you tried anything to fix the afternoon discharge problem before?" },
  { b: "Every vendor who walks in here has a dashboard. Three years ago we bought a command center thing and the nurses never used it because it meant double data entry." },
  { s: "So it wasn't the idea that failed, it was the extra work it put on nurses. Let me check I've got this right: boarding in the ER is the pain, late discharges are the cause, diversions are costing real money, and anything new can't add data entry for nurses. Did I miss anything?" },
  { b: "No, that's it exactly. And it has to get past IT." },
  { s: "Can I share how we might fit that? You said discharges stall on transport and pharmacy after the order is written. FlowBoard reads the discharge order straight from the EHR, so nurses enter nothing new, and it pings transport and pharmacy the moment the order lands." },
  { b: "No double entry at all? That's what killed the last one." },
  { s: "That's a fair worry given what happened. What would you need to see to believe that?" },
  { b: "I'd want my bed-management lead to see it with our own workflow, and IT would have to sign off on the integration." },
  { s: "Who else would be involved in a decision like this, and how does the budget side work?" },
  { b: "Anything over a hundred thousand goes to the CFO, and capital requests are due in March for July." },
  { s: "Then how about a 45-minute working session next Tuesday with your bed-management lead and someone from IT, where we map your discharge workflow and the EHR integration, so you'd have what you need before the March deadline?" },
  { b: "Tuesday works. I'll bring Karen from the bed office and someone from IT." },
];

function turnsOf(lines: Line[]) {
  return [
    { role: "user" as const, content: "I'm ready to begin the interview.", timestamp: STARTED_AT },
    ...lines.map((l, i) => ({
      role: ("s" in l ? "user" : "assistant") as "user" | "assistant",
      content: "s" in l ? l.s : l.b,
      timestamp: STARTED_AT + (i + 1) * 30_000,
    })),
  ];
}

function resolve() {
  const record = findPersonaCase(CASE_ID);
  if (!record) throw new Error(`unknown case ${CASE_ID}`);
  const typeConfig = getEngineType("sales-discovery");
  if (!typeConfig?.supplementaryAnalysis) throw new Error("sales-discovery not registered");
  const instance: DifficultConversationInstance = {
    kind: "difficult-conversation",
    conversationId: record.id,
    source: "seeded",
    role: record.avatarRole,
    studentRole: record.studentRole,
    situation: record.situation,
    sharedBackstory: record.sharedBackstory,
    hiddenPosition: record.hiddenPosition,
    studentObjective: record.studentObjective,
    stakes: record.stakes,
    difficulty: record.difficulty,
    avatarId: "golden-avatar",
    voiceId: "golden-voice",
    personaCard: record.personaCard,
  };
  const resolved = resolveFromTypeConfig(typeConfig, { instance });
  if (!resolved.ok) throw new Error(resolved.reason);
  return { typeConfig, config: resolved.config, card: record.personaCard };
}

async function grade(label: string, lines: Line[]) {
  const { typeConfig, config, card } = resolve();
  const turns = turnsOf(lines);
  const analysis = await runPersonaAnalysis({ style: "sales-discovery", card, turns, startedAt: STARTED_AT });
  const { buildPersonaEvaluationContext } = await import("../lib/questioned-persona/prompts");
  const base = buildPersonaEvaluationContext(config);
  const brief = `${base.evaluatorBrief}\n\nBehavior coding:\n${evaluatorNoteFor(analysis)}`;
  const transcript = turns
    .slice(1)
    .map((t) => `${t.role === "user" ? "Seller" : "Buyer"}: ${t.content}`)
    .join("\n");
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `${typeConfig.prompts.evaluatorPrompt}\n\n${REPORT_SPELLING_RULE}` },
      {
        role: "user",
        content: `case_context:\n${brief}\n\nfull_transcript:\n${transcript}\n\nresume_text:\n(No resume was provided.)\n\nrole_context:\n${JSON.stringify({ role_title: "", industry: "", difficulty: "" })}\n\nvisual_metrics: null\nvocal_metrics: null`,
      },
    ],
    max_tokens: 4000,
    response_format: { type: "json_schema", json_schema: buildRubricJsonSchema(config) },
  });
  const raw = JSON.parse(completion.choices[0]!.message.content!);
  const validated = validateEvaluationResult(raw, config, { hasVisualMetrics: false, hasVocalMetrics: false }, { ...base });
  const scores: Record<string, number | null> = {};
  for (const d of typeConfig.extraRubricDimensions) scores[d.key] = validated?.scores[d.key] ?? null;
  const metrics = Object.fromEntries(analysis.metrics.map((m) => [m.key, { value: m.value, band: m.band ?? null }]));
  const steps = Object.fromEntries(analysis.steps.map((s) => [s.key, s.status]));
  const facts = analysis.facts.filter((f) => f.elicited).map((f) => f.id);
  return { label, scores, metrics, steps, facts, counts: analysis.counts };
}

async function main() {
  const [pitch, listen] = await Promise.all([grade("pitch-first", PITCH_FIRST), grade("listen-first", LISTEN_FIRST)]);
  const failures: string[] = [];

  console.log("\nRubric scores (1-5)        pitch-first  listen-first");
  for (const key of Object.keys(listen.scores)) {
    const p = pitch.scores[key];
    const l = listen.scores[key];
    console.log(`  ${key.padEnd(26)} ${String(p).padStart(6)} ${String(l).padStart(12)}`);
    if (p === null || l === null || l <= p) failures.push(`${key}: listen-first ${l} not above pitch-first ${p}`);
  }
  console.log("\nDerived metrics            pitch-first        listen-first");
  for (const key of Object.keys(listen.metrics)) {
    const p = pitch.metrics[key]!;
    const l = listen.metrics[key]!;
    console.log(`  ${key.padEnd(28)} ${`${p.value} (${p.band ?? "-"})`.padEnd(18)} ${l.value} (${l.band ?? "-"})`);
  }
  for (const key of ["questions_before_first_pitch", "buyer_talk_share"]) {
    const p = pitch.metrics[key]!.value ?? -1;
    const l = listen.metrics[key]!.value ?? -1;
    if (l <= p) failures.push(`metric ${key}: listen-first ${l} not above pitch-first ${p}`);
  }
  const hits = (s: Record<string, string>) => Object.values(s).filter((v) => v === "hit").length;
  console.log(`\nChecklist hits: pitch-first ${hits(pitch.steps)}/10, listen-first ${hits(listen.steps)}/10`);
  console.log(`  hold_the_pitch: pitch-first ${pitch.steps.hold_the_pitch}, listen-first ${listen.steps.hold_the_pitch}`);
  console.log(`Needs uncovered: pitch-first ${pitch.facts.length}/5 [${pitch.facts.join(", ")}], listen-first ${listen.facts.length}/5 [${listen.facts.join(", ")}]`);
  if (hits(listen.steps) <= hits(pitch.steps)) failures.push("checklist hits not separated");
  if (pitch.steps.hold_the_pitch !== "missed") failures.push(`pitch-first hold_the_pitch=${pitch.steps.hold_the_pitch}`);
  if (listen.steps.hold_the_pitch !== "hit") failures.push(`listen-first hold_the_pitch=${listen.steps.hold_the_pitch}`);

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ pitch, listen }, null, 2));
  if (failures.length) {
    console.log(`\nNOT SEPARATED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\nSEPARATED: listen-first beats pitch-first on every listening dimension and metric.");
}

void main();
