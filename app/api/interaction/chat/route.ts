import { NextRequest, NextResponse } from "next/server";
import { createLLMStream, createSSEHeaders } from "../../llm/common";
import { resolveAttemptLanguage } from "@/lib/languages";
import {
  initialProgress,
  type BehavioralCategory,
  type InterviewProgress,
} from "@/lib/interview/types";
import {
  resolveInterviewType,
  type InterviewCustomizationInput,
} from "@/lib/interview/customization";
import {
  buildInterviewSystemPrompt,
  buildProgressBlock,
} from "@/lib/interview/prompts";

export const maxDuration = 60;

interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

interface InterviewRequestInput {
  typeSlug?: unknown;
  resumeText?: unknown;
  progress?: unknown;
  startedAt?: unknown;
  customization?: unknown;
}

const MAX_MESSAGE_LENGTH = 20_000;
const MAX_RESUME_TEXT_LENGTH = 60_000;

function isChatMessage(value: unknown): value is ChatMessageInput {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

function normalizeProgress(value: unknown): InterviewProgress {
  const fallback = initialProgress();
  if (!value || typeof value !== "object") return fallback;

  const progress = value as Partial<InterviewProgress>;
  const stages = ["opening", "resume", "behavioral", "role_specific", "closing"] as const;
  const categories = [
    "conflict/disagreement",
    "failure/setback",
    "leadership without authority",
    "feedback received",
    "ambiguity",
    "teamwork",
  ] as const;

  const isCategory = (category: unknown): category is BehavioralCategory =>
    typeof category === "string" && categories.includes(category as BehavioralCategory);
  const uniqueCategories = (items: unknown): BehavioralCategory[] =>
    Array.isArray(items)
      ? [...new Set(items.filter(isCategory))]
      : [];

  return {
    stage:
      typeof progress.stage === "string" &&
      stages.includes(progress.stage as (typeof stages)[number])
        ? (progress.stage as InterviewProgress["stage"])
        : fallback.stage,
    questionsAsked:
      typeof progress.questionsAsked === "number" &&
      Number.isFinite(progress.questionsAsked)
        ? Math.max(0, Math.min(20, Math.floor(progress.questionsAsked)))
        : fallback.questionsAsked,
    categoriesCovered: uniqueCategories(progress.categoriesCovered),
    dodgedCategories: uniqueCategories(progress.dodgedCategories),
    followUpsUsed:
      typeof progress.followUpsUsed === "number" &&
      Number.isFinite(progress.followUpsUsed)
        ? Math.max(0, Math.min(1, Math.floor(progress.followUpsUsed)))
        : fallback.followUpsUsed,
  };
}

function elapsedMinutes(startedAt: unknown): number {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, systemPrompt, roleContext, language, interview } = body;
    const attemptLanguage = resolveAttemptLanguage(language);

    if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
      return NextResponse.json(
        { error: "Messages must be a non-empty array of valid chat messages" },
        { status: 400 }
      );
    }

    const interviewInput = interview as InterviewRequestInput | undefined;
    const typeSlug =
      interviewInput && typeof interviewInput.typeSlug === "string"
        ? interviewInput.typeSlug
        : undefined;
    const interviewType = interview
      ? resolveInterviewType(
          typeSlug,
          interviewInput?.customization as InterviewCustomizationInput | undefined
        )
      : null;
    if (interview && !interviewType) {
      return NextResponse.json({ error: "Unknown interview type" }, { status: 400 });
    }

    let fullSystemPrompt: string;
    let fullMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;

    if (interview && interviewType && interviewInput) {
      const resumeText =
        typeof interviewInput.resumeText === "string"
          ? interviewInput.resumeText.slice(0, MAX_RESUME_TEXT_LENGTH)
          : "";
      const progress = normalizeProgress(interviewInput.progress);
      const transcript = messages.map((message) => ({ ...message }));
      const latestUserMessage = [...transcript]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === "user");

      if (!latestUserMessage) {
        return NextResponse.json(
          { error: "An interview turn must include a candidate message" },
          { status: 400 }
        );
      }

      // `fullSystemPrompt` takes only session-constant inputs. The live progress
      // and clock deliberately ride on the latest user turn so OpenAI can reuse
      // the system-prefix cache across the entire interview. This stays
      // cache-safe under customization because the customization is resolved
      // once on the picker page, the client resends the identical payload
      // every turn, and `resolveInterviewType` is pure — so the assembled
      // prefix is byte-identical for the whole session. Any field not found
      // in the curated lists silently falls back to the preset default, which
      // is what keeps a hostile or stale payload from both poisoning the
      // prompt AND from varying turn-to-turn.
      fullSystemPrompt = buildInterviewSystemPrompt(interviewType, {
        resumeText,
        language: attemptLanguage,
      });
      transcript[latestUserMessage.index] = {
        ...latestUserMessage.message,
        content: `${latestUserMessage.message.content.trim()}\n\n${buildProgressBlock(progress, {
          elapsedMinutes: elapsedMinutes(interviewInput.startedAt),
          targetMinutes: interviewType.targetMinutes,
        })}`,
      };
      fullMessages = [{ role: "system", content: fullSystemPrompt }, ...transcript];
    } else {
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
      // Stating the language explicitly keeps a misrecognized turn from pulling
      // the reply into another language. It is constant for an attempt, so it is
      // safe inside the cache prefix.
      const languageRule =
        `## Language\nConduct this conversation entirely in ${attemptLanguage.name}. ` +
        `If a message appears to be in another language, treat it as a ` +
        `speech-to-text error and continue in ${attemptLanguage.name}.`;

      const staticParts: string[] = [styleGuide.trim(), languageRule];
      if (roleContext) {
        staticParts.push(
          `You are playing the role of "${roleContext.roleName}" in a case study simulation.`,
          roleContext.additionalInfo || ""
        );
      }
      staticParts.push(systemPrompt || "You are a helpful assistant.");
      fullSystemPrompt = staticParts.filter(Boolean).join("\n\n");
      // ── END CACHE PREFIX ──────────────────────────────────────────────────

      fullMessages = [
        { role: "system", content: fullSystemPrompt }, // Must stay at index 0 for caching
        ...messages,
      ];
    }

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
