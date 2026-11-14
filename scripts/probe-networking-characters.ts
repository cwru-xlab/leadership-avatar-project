/**
 * Text-only persona-fidelity probe for built-in networking characters (REAL
 * OpenAI calls). Plays a short scripted student against the real live prompt
 * (`buildNetworkingSystemPrompt`, gpt-4.1 as in the chat route) and prints the
 * transcript for a human read: does the character sound like their field,
 * hold their manner, and respond to a field-appropriate ask?
 *
 * Run: npx tsx scripts/probe-networking-characters.ts [--only rosa-delgado,tomasz-kowalski]
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import OpenAI from "openai";

import { getNetworkingCharacter } from "../lib/networking/characters";
import { buildNetworkingSystemPrompt } from "../lib/networking/prompts";

const SCRIPTS: Record<string, string[]> = {
  "rosa-delgado": [
    "Hi, I'm Maya. I'm a second-year nursing student at Case. Do you have a minute?",
    "I keep hearing people say NP is basically the fast way to practice like a doctor. Is that how you see it?",
    "Fair. Honestly I want to work in primary care with families who don't usually get continuity. That's why I came to you.",
    "Would it be possible to shadow you for a clinic day sometime this spring? I'm happy to go through whatever approval the clinic needs.",
  ],
  "samuel-adeyemi": [
    "Dr. Adeyemi? Hi, I'm Jordan, a pre-med junior at Case. Can I pick your brain about medicine?",
    "Sorry, more specifically: I've been doing research on heart-failure readmissions and I'm trying to decide if cardiology is where I'd want to end up.",
    "What surprised you most about going from residency to running the department?",
    "Would you be open to me observing in your clinic? Or is there a formal process I should go through?",
  ],
  "tomasz-kowalski": [
    "Hi, I'm Sam, a mechanical engineering senior at Case. I'm really passionate about innovation and disruptive solutions.",
    "Concretely: my capstone is a test rig for a small centrifugal pump. Our first impeller cavitated badly and we had to redesign the inlet.",
    "We lowered the inlet velocity with a bigger suction pipe and moved the pump below the reservoir. NPSH margin went from negative to about two meters.",
    "Would you be willing to look at our test data for twenty minutes, or point me to whoever runs the co-op program?",
  ],
};

const only = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? new Set(process.argv[i + 1]!.split(",")) : null;
})();

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const [id, turns] of Object.entries(SCRIPTS)) {
    if (only && !only.has(id)) continue;
    const character = getNetworkingCharacter(id);
    if (!character) throw new Error(`unknown character ${id}`);
    const system = buildNetworkingSystemPrompt({
      persona: character.persona,
      displayName: character.displayName,
    });
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
    ];

    console.log(`\n=== ${character.displayName} — ${character.headline} ===`);
    for (const turn of turns) {
      messages.push({ role: "user", content: turn });
      const res = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        max_tokens: 220,
        temperature: 0.7,
      });
      const reply = res.choices[0]?.message?.content?.trim() ?? "";
      messages.push({ role: "assistant", content: reply });
      console.log(`\nSTUDENT: ${turn}\n${character.displayName.toUpperCase()}: ${reply}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
