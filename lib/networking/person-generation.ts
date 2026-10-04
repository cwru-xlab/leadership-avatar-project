/**
 * AI person-generation for networking practice (Phase 16).
 *
 * SEPARATE model call from Phase 8's persona distiller
 * (`app/api/interview/persona/distill/route.ts`). Deliberately does NOT share
 * that route's prompt (16-CONTEXT.md decision 2). This module produces
 * DESCRIPTION TEXT — free third-person narrative a student edits — not a
 * persona sentence. The Phase 8 distiller still does the persona shaping
 * downstream from the edited description.
 *
 * RETENTION: the hint and the generated description are used for exactly one
 * non-streaming model call and are never written to Prisma, S3, or any cache,
 * and never logged — only lengths are logged.
 *
 * Output is description text, NOT a persona sentence. The Phase 8 distiller
 * still does the persona shaping.
 *
 * Attestation: this path invents a FICTIONAL person by construction, so the
 * third-party paste attestation gate (16-CONTEXT.md decision 8) does not
 * apply. The gate is for PASTED third-party text only; it was not forgotten.
 */

/** One free-text hint box — not structured fields. */
export const MAX_HINT_LENGTH = 300;

/**
 * Sized to sit far inside the distill route's `MAX_PROFILE_TEXT_LENGTH = 4000`
 * and to stay comfortably editable in a textarea. Target 2–4 sentences /
 * roughly 300–500 characters with headroom.
 */
export const MAX_GENERATED_DESCRIPTION_LENGTH = 700;

// This text will be EDITED BY A HUMAN before it is distilled. Being slightly
// wrong is recoverable; refusing to commit to specifics (name, employer,
// seniority, manner) is not — invent concrete details the student can tweak.
export const PERSON_GENERATION_SYSTEM_PROMPT = `You invent ONE plausible, fictional professional person for a networking role-play practice session, consistent with the student's rough hint.

Give them:
- a full name
- an employer described generically (an invented company name is fine; a real, recognisable company name is not)
- a seniority / title
- a field or domain
- a few years-in detail
- a manner or conversational style

Write 2–4 sentences of third-person narrative prose in the register of a LinkedIn "About" blurb. Output PROSE ONLY: no markdown, no bullet lists, no headings, no preamble such as "Here is" or "Sure". Never claim to describe a real, identifiable individual. Never produce a second-person role-play instruction (that is a different system downstream). Never begin with "You are".

Return only the prose description.`;

/**
 * Strip model preamble / wrapping quotes so the student sees clean editable
 * prose. Deterministic; safe to call on already-clean text.
 */
export function cleanGeneratedDescription(raw: string): string {
  let text = raw.trim();

  // Drop a leading "Here is..." / "Sure,..." / "Certainly,..." style preamble
  // up through the first colon or newline if present.
  text = text.replace(
    /^(?:here(?:'s| is| are)|sure|certainly|of course|absolutely)[,!]?\s*(?:(?:a|the)\s+)?(?:description|person|profile|blurb)?\s*:?\s*/i,
    "",
  );

  // If a preamble left a newline, take the body after the first blank line
  // or the remainder after the first line when the first line looks like a label.
  if (/^(?:description|person|profile)\b/i.test(text.split("\n")[0] ?? "")) {
    const rest = text.split(/\n+/).slice(1).join("\n").trim();

    if (rest) text = rest;
  }

  text = text.trim();

  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

/**
 * One-shot hint → fictional person description. Non-streaming text completion.
 * Throws on empty output after cleanup (caller maps to 502).
 */
export async function generatePersonDescription(
  hint: string,
): Promise<{ description: string }> {
  const truncatedHint = hint.trim().slice(0, MAX_HINT_LENGTH);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20_000,
    maxRetries: 0,
  });

  const model = process.env.NETWORKING_PERSON_GENERATION_MODEL || "gpt-4.1";

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: PERSON_GENERATION_SYSTEM_PROMPT },
      { role: "user", content: truncatedHint },
    ],
    max_tokens: 400,
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Person generation returned empty content");
  }

  const description = cleanGeneratedDescription(content).slice(
    0,
    MAX_GENERATED_DESCRIPTION_LENGTH,
  );

  if (!description) {
    throw new Error(
      "Person generation returned empty description after cleanup",
    );
  }

  return { description };
}
