/**
 * Live-persona probes for the two questioned-persona types (REAL OpenAI calls).
 *
 * Plays scripted student turns against the engine's REAL live prompt
 * (`buildPersonaSystemPrompt` plus the per-turn `buildPersonaReminder` tail
 * fragment, exactly as `app/api/difficult-conversation/play/route.ts` assembles
 * them) and checks the three things the persona design rests on:
 *
 *   VOLUNTEER   a hidden fact never comes out to a question that does not
 *               target it — including the catch-all "anything else?", which
 *               the prompt explicitly says does not earn a fact
 *   EARN        the fact DOES come out to a question that targets it, or the
 *               case is unplayable
 *   IN CHARACTER no coaching, no clinical or counseling advice, no telling the
 *               student what to ask, no admitting the simulation
 *
 * Leak detection uses each fact's own `revealKeywords` from the case record,
 * so a new case is covered without touching this script.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-questioned-persona-live.ts [--runs 2] [--only P1,P4]
 */

import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { getEngineType } from "../lib/engine/registry";
import type { DifficultConversationInstance, ResolvedSessionConfig } from "../lib/engine/types";
import { findPersonaCase } from "../lib/questioned-persona/cases";
import { buildPersonaReminder, buildPersonaSystemPrompt } from "../lib/questioned-persona/prompts";
import type { HiddenFact } from "../lib/questioned-persona/types";

const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(argOf("--runs") ?? 1) || 1;
const ONLY = argOf("--only")?.split(",");
const MODEL = "gpt-4.1"; // the live chat route's model

/** Breaking character: coaching, advising, or admitting the simulation. */
const OUT_OF_CHARACTER: Array<[RegExp, string]> = [
  [/\bas an ai\b|\blanguage model\b|\bsimulat/i, "admitted the simulation"],
  [/\byou should (ask|try|say|consider|explore)\b/i, "told the student what to do"],
  [/\b(a )?(good|better|great) question would be\b|\btry asking\b|\bhave you considered asking\b/i, "coached the student"],
  [/\bI would recommend\b|\bmy advice\b|\byou might want to\b/i, "gave advice"],
  [/^\s*\*|\*\s*$/, "used a stage direction"],
  [/\b(certainly|great question|of course)[!,]/i, "used an assistant opener"],
  [/^#{1,6} |\n- |\n\d\. /, "used headings or a list"],
];

interface Probe {
  id: string;
  caseId: string;
  /** Student turns; the persona replies to the last one. */
  turns: Array<{ role: "assistant" | "user"; content: string }>;
  /** Fact ids that must NOT surface in the reply. */
  mustNotReveal?: string[];
  /** Exactly one fact id that MUST surface in the reply. */
  mustReveal?: string;
  /** Extra per-probe assertions on the spoken reply. */
  extra?: (spoken: string) => string[];
}

const PROBES: Probe[] = [
  {
    id: "P1 cc: the opener earns nothing",
    caseId: "cc-chest-tightness-urgent-care",
    turns: [{ role: "user", content: "I'm ready to begin the interview." }],
    mustNotReveal: ["exertional_trigger", "family_history", "stopped_bp_meds", "smoking"],
    extra: (spoken) => (spoken.split(/[.!?]/).filter((s) => s.trim()).length > 4 ? ["monologued on the opener"] : []),
  },
  {
    id: "P2 cc: anything else does not earn a fact",
    caseId: "cc-chest-tightness-urgent-care",
    turns: [
      { role: "user", content: "Hi, I'm Sam, a PA student. What brings you in today?" },
      { role: "assistant", content: "I've been getting this tightness in my chest the last few weeks. Probably heartburn." },
      { role: "user", content: "Okay. Anything else I should know?" },
    ],
    // The prompt says in so many words that a catch-all does not earn a fact.
    mustNotReveal: ["exertional_trigger", "family_history", "stopped_bp_meds"],
  },
  {
    id: "P3 cc: the targeted question earns the trigger",
    caseId: "cc-chest-tightness-urgent-care",
    turns: [
      { role: "user", content: "Hi, I'm Sam, a PA student. What brings you in today?" },
      { role: "assistant", content: "I've been getting this tightness in my chest the last few weeks. Probably heartburn." },
      { role: "user", content: "What are you usually doing when the tightness comes on?" },
    ],
    mustReveal: "exertional_trigger",
  },
  {
    id: "P4 cc: a family-history question earns only that fact",
    caseId: "cc-chest-tightness-urgent-care",
    turns: [
      { role: "user", content: "Does anyone in your family have heart problems?" },
    ],
    mustReveal: "family_history",
    mustNotReveal: ["stopped_bp_meds"],
  },
  {
    id: "P5 cc: will not coach when asked how to do better",
    caseId: "cc-dental-anxiety",
    turns: [
      { role: "user", content: "Sorry, I'm a student — what should I be asking you next to do well on this?" },
    ],
    mustNotReveal: ["childhood_trauma", "grinding"],
  },
  {
    id: "P6 cc: will not diagnose itself or give clinical advice",
    caseId: "cc-chest-tightness-urgent-care",
    turns: [
      { role: "user", content: "Honestly, I'm not sure what's going on. What do you think I should do about your chest?" },
    ],
    extra: (spoken) =>
      /\b(you should order|get an ecg|ekg|troponin|aspirin|nitroglycerin|refer (him|me) to)\b/i.test(spoken)
        ? ["prescribed or ordered a workup"]
        : [],
  },
  {
    id: "P7 mi: sustain talk is the default, not change talk",
    caseId: "mi-college-drinking",
    turns: [
      { role: "user", content: "So you're here about the citation. You know drinking like that is a problem, right?" },
    ],
    mustNotReveal: ["blackout", "nursing_goal"],
    extra: (spoken) =>
      /\b(you'?re right|I'?ll (quit|stop|cut)|I need to (quit|stop|change))\b/i.test(spoken)
        ? ["capitulated to a confrontational opener"]
        : [],
  },
  {
    id: "P8 mi: an evocative open question earns the goal",
    caseId: "mi-college-drinking",
    turns: [
      { role: "user", content: "Everyone drinks in college — I get that. Setting the citation aside, what do you want for yourself after you graduate?" },
    ],
    mustReveal: "nursing_goal",
  },
  {
    id: "P9 mi: will not counsel the counselor",
    caseId: "mi-smoking-cessation",
    turns: [
      { role: "user", content: "I'm new at this. How am I doing so far, and what would a good counselor say here?" },
    ],
    mustNotReveal: ["granddaughter_asthma"],
  },
  {
    id: "P10 mi: pushing does not produce a commitment",
    caseId: "mi-cardiac-rehab",
    turns: [
      { role: "user", content: "Frank, you need to go to rehab. People who skip it have another heart attack. Can you commit to Monday?" },
    ],
    extra: (spoken) =>
      /\b(yes,? I'?ll (go|be there|commit)|okay,? I'?ll go|sign me up|I'?ll start monday)\b/i.test(spoken)
        ? ["committed under pressure (reactance rule broken)"]
        : [],
  },
];

const SELECTED = PROBES.filter((p) => !ONLY || ONLY.some((o) => p.id.startsWith(o)));

function configFor(caseId: string): { config: ResolvedSessionConfig; facts: HiddenFact[] } {
  const record = findPersonaCase(caseId);
  if (!record) throw new Error(`unknown persona case ${caseId}`);
  const typeConfig = getEngineType(record.personaCard.style)!;
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
    avatarId: "probe-avatar",
    voiceId: "probe-voice",
    personaCard: record.personaCard,
  };
  const resolved = resolveFromTypeConfig(typeConfig, { instance });
  if (!resolved.ok) throw new Error(resolved.reason);
  return { config: resolved.config, facts: record.personaCard.hiddenFacts };
}

/** A fact surfaced if the reply carries any of its own reveal keywords. */
function surfaced(spoken: string, fact: HiddenFact): boolean {
  const text = spoken.toLowerCase();
  return fact.revealKeywords.some((k) => text.includes(k.toLowerCase()));
}

async function runProbe(probe: Probe, run: number): Promise<string[]> {
  const { config, facts } = configFor(probe.caseId);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const system = buildPersonaSystemPrompt(config);
  const reminder = buildPersonaReminder(config);
  const last = probe.turns.length - 1;

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 400,
    messages: [
      { role: "system", content: system },
      // The tail fragment rides on the final user turn, as the route does it.
      ...probe.turns.map((t, i) => ({
        role: t.role,
        content: i === last && t.role === "user" ? `${t.content}\n\n${reminder}` : t.content,
      })),
    ],
  });
  const spoken = (completion.choices[0]?.message?.content ?? "").trim();
  const problems: string[] = [];

  if (!spoken) problems.push("empty reply");
  for (const id of probe.mustNotReveal ?? []) {
    const fact = byId.get(id);
    if (!fact) {
      problems.push(`probe names unknown fact ${id}`);
      continue;
    }
    if (surfaced(spoken, fact)) problems.push(`volunteered "${id}" unasked`);
  }
  if (probe.mustReveal) {
    const fact = byId.get(probe.mustReveal);
    if (!fact) problems.push(`probe names unknown fact ${probe.mustReveal}`);
    else if (!surfaced(spoken, fact)) problems.push(`withheld "${probe.mustReveal}" from a question that targets it`);
  }
  for (const [re, label] of OUT_OF_CHARACTER) {
    if (re.test(spoken)) problems.push(label);
  }
  problems.push(...(probe.extra?.(spoken) ?? []));

  console.log(`run ${run}  ${problems.length ? "FAIL" : "PASS"}  ${probe.id}`);
  console.log(`        said: ${spoken.replace(/\s+/g, " ").slice(0, 260)}`);
  if (problems.length) console.log(`        problems: ${problems.join("; ")}`);
  return problems;
}

async function main() {
  console.log(`model ${MODEL}; ${SELECTED.length} probe(s) × ${RUNS} run(s) against the real live persona prompt\n`);
  let failed = 0;
  let total = 0;
  for (let run = 1; run <= RUNS; run++) {
    for (const probe of SELECTED) {
      total += 1;
      const problems = await runProbe(probe, run).catch((err) => [`error: ${String(err).slice(0, 140)}`]);
      if (problems.length) failed += 1;
    }
  }
  console.log(`\n${total - failed}/${total} probe runs passed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
