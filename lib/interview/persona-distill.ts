/**
 * RETENTION: the pasted text is a third party's personal information. It is
 * used for exactly one non-streaming model call and is never written to
 * Prisma, S3, or any cache, and never logged — only lengths are logged.
 *
 * This module accepts pasted TEXT only. It must never fetch a student-supplied
 * URL (LinkedIn or otherwise) — see 08-CONTEXT.md's Deferred Ideas.
 *
 * Two routes import this module — the Phase 8 interview route and the
 * attestation-gated networking route. There is exactly one distillation
 * prompt and one distillation model call in this repo (16-CONTEXT.md
 * decision 1).
 */

import { MAX_PERSONA_LENGTH as CUSTOMIZATION_MAX_PERSONA_LENGTH } from "@/lib/interview/customization";

/**
 * Single source for the distiller's length limits. Previously kept local on
 * the Phase 8 route so that plan stayed independent of customization.ts; the
 * duplication is now resolved in one direction — this module owns the
 * distiller's limits, and `lib/interview/customization.ts`'s exported
 * `MAX_PERSONA_LENGTH` must still equal it.
 */
export const MAX_PERSONA_LENGTH = 600;
export const MAX_PROFILE_TEXT_LENGTH = 4000;
/** Display-only; long enough for a real name, short enough not to break the header. */
export const MAX_DISPLAY_NAME_LENGTH = 60;

// Compile-time equality: customization.ts must stay in lockstep with the
// distiller's persona cap. Bidirectional assignability fails if either drifts.
const _personaLengthLockA: typeof CUSTOMIZATION_MAX_PERSONA_LENGTH =
  MAX_PERSONA_LENGTH;
const _personaLengthLockB: typeof MAX_PERSONA_LENGTH =
  CUSTOMIZATION_MAX_PERSONA_LENGTH;

void _personaLengthLockA;
void _personaLengthLockB;

export const PERSONA_DISTILL_SYSTEM_PROMPT = `You turn a short pasted description of a real person into a single persona
sentence for a role-play simulation. The output slots directly after the
phrase "You are playing the role of: " in another system prompt, so it must
read as a grammatical, second-person-implied noun-phrase continuation of
that sentence — the same way you would complete "a warm but rigorous hiring
manager with fifteen years of experience...".

Take the person's name, role, and background from the pasted text and write
the interviewer as that named person, in character, using ONLY detail that is
actually present in the pasted text. Do not invent biography, employer
history, or achievements beyond what was pasted. If the paste is thin, keep
the persona short rather than padding it with invented detail.

Output rules:
- Plain prose only. No markdown, no bullet points, no headings.
- No preamble ("Here is...", "Sure,", etc.) and no wrapping quotes.
- Do not begin with "You are" — the sentence this continues already supplies
  that. Begin directly with the descriptive noun phrase (e.g. "Maria Chen, a
  director of engineering who...").
- One to three sentences, concise enough to read naturally inside a single
  system-prompt sentence.
- End the persona with an explicit in-character directive naming the person,
  so the interviewer actually inhabits them rather than treating the
  description as background colour. For example: "You introduce yourself as
  Maria Chen when the interview opens, and you stay recognisably her —
  her seniority, her domain, her manner — for the whole conversation."

Return JSON with exactly two keys:
- "persona": the sentence described above.
- "displayName": the person's name exactly as it appears in the pasted text
  (e.g. "Maria Chen"). If the text names no person, return an empty string.`;

type DistillResult = { persona: string; displayName: string };

/**
 * Used only by scripts/verify-networking-distill-gate.ts to stub the model
 * call. Never set in production request paths.
 */
let distillPersonaVerifyOverride:
  | ((profileText: string) => Promise<DistillResult>)
  | null = null;

/** @internal verify-script hook — pass null to clear. */
export function __setDistillPersonaForVerify(
  fn: ((profileText: string) => Promise<DistillResult>) | null,
): void {
  distillPersonaVerifyOverride = fn;
}

export async function distillPersona(
  profileText: string,
): Promise<DistillResult> {
  if (distillPersonaVerifyOverride) {
    return distillPersonaVerifyOverride(profileText);
  }

  return distillPersonaUnmocked(profileText);
}

async function distillPersonaUnmocked(
  profileText: string,
): Promise<DistillResult> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20_000,
    maxRetries: 0,
  });

  const model = process.env.INTERVIEW_PERSONA_MODEL || "gpt-4.1";

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: PERSONA_DISTILL_SYSTEM_PROMPT },
      { role: "user", content: profileText },
    ],
    max_tokens: 400,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    return { persona: "", displayName: "" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { persona: "", displayName: "" };
  }

  const record = parsed as { persona?: unknown; displayName?: unknown } | null;
  const persona =
    typeof record?.persona === "string"
      ? stripWrappingQuotes(record.persona.trim()).slice(0, MAX_PERSONA_LENGTH)
      : "";
  const displayName =
    typeof record?.displayName === "string"
      ? stripWrappingQuotes(record.displayName.trim()).slice(
          0,
          MAX_DISPLAY_NAME_LENGTH,
        )
      : "";

  return { persona, displayName };
}

function stripWrappingQuotes(text: string): string {
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1).trim();
  }

  return text;
}
