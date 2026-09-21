import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kept local rather than importing `MAX_PERSONA_LENGTH` from
// `lib/interview/customization.ts` so this route stays independent of that
// plan. Must match its value.
const MAX_PERSONA_LENGTH = 600;
const MAX_PROFILE_TEXT_LENGTH = 4000;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const PERSONA_DISTILL_SYSTEM_PROMPT = `You turn a short pasted description of a real person into a single persona
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
  system-prompt sentence.`;

/**
 * One-shot persona distillation (REQ-22).
 *
 * Turns pasted "who is interviewing you" text into a short persona string the
 * client holds and later sends once, at session start, as part of assembling
 * a session-constant `InterviewType`-shaped object (REQ-23). This route never
 * runs per chat turn.
 *
 * RETENTION: the pasted text is a third party's personal information. It is
 * used for exactly one non-streaming model call and is never written to
 * Prisma, S3, or any cache, and never logged — only lengths are logged.
 *
 * This route accepts pasted TEXT only. It must never fetch a student-supplied
 * URL (LinkedIn or otherwise) — see 08-CONTEXT.md's Deferred Ideas.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response({ error: "Invalid JSON body" }, 400);
    }

    const profileText = (body as { profileText?: unknown } | null)?.profileText;

    if (typeof profileText !== "string" || !profileText.trim()) {
      return response({ error: "profileText is required" }, 400);
    }

    const truncatedInput = profileText.trim().slice(0, MAX_PROFILE_TEXT_LENGTH);

    let persona: string;
    try {
      persona = await distillPersona(truncatedInput);
    } catch (error) {
      console.error(
        "Interview persona distillation failed",
        error instanceof Error ? error.constructor.name : typeof error
      );
      return response(
        { error: "We could not process that description. Please try again." },
        502
      );
    }

    if (!persona) {
      console.error("Interview persona distillation returned empty output");
      return response(
        { error: "We could not process that description. Please try again." },
        502
      );
    }

    console.info("Interview persona distilled", {
      userId: currentUser.id,
      inputLength: truncatedInput.length,
      outputLength: persona.length,
    });

    return response({ persona }, 200);
  } catch (error) {
    console.error("Interview persona distillation request failed:", error);
    return response({ error: "Unable to process that description. Please try again." }, 500);
  }
}

async function distillPersona(profileText: string): Promise<string> {
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
    max_tokens: 300,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return "";
  }

  const trimmed = stripWrappingQuotes(content.trim());
  return trimmed.slice(0, MAX_PERSONA_LENGTH);
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
