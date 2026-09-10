import { NextRequest, NextResponse } from "next/server";
import { createLLMStream, createSSEHeaders } from "../../llm/common";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, systemPrompt, roleContext } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const styleGuide = `## Reply Style
- Speak naturally and conversationally, like a real person in a meeting or interview
- Keep responses short and to the point — 1 to 3 sentences unless more detail is truly needed
- Avoid bullet points, formal headings, or structured lists in your replies
- Never start with filler phrases like "Certainly!", "Great question!", or "Of course!"
- If you don't know something, say so simply and move on`;

    // ── CACHE PREFIX ──────────────────────────────────────────────────────
    // Everything below must be byte-identical across every turn of a given
    // (case, role) pair, or OpenAI's automatic prefix cache will miss.
    // NEVER interpolate per-turn values (timestamps, turn counts, user names).
    const staticParts: string[] = [styleGuide.trim()];
    if (roleContext) {
      staticParts.push(
        `You are playing the role of "${roleContext.roleName}" in a case study simulation.`,
        roleContext.additionalInfo || ""
      );
    }
    staticParts.push(systemPrompt || "You are a helpful assistant.");
    const fullSystemPrompt = staticParts.filter(Boolean).join("\n\n");
    // ── END CACHE PREFIX ──────────────────────────────────────────────────

    const fullMessages = [
      { role: "system" as const, content: fullSystemPrompt }, // Must stay at index 0 for caching
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const stream = createLLMStream(fullMessages, "gpt-4.1", { maxTokens: 1000 });
    return new Response(stream, { headers: createSSEHeaders() });
  } catch (error) {
    console.error("Error in interaction chat:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
