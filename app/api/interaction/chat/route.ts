import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import type { InstanceConfig, ResolvedSessionConfig } from "@/lib/engine/types";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createLLMStream, createSSEHeaders } from "../../llm/common";

import { resolveAttemptLanguage } from "@/lib/languages";
import {
  getInterviewType,
  initialProgress,
  type BehavioralCategory,
  type InterviewProgress,
} from "@/lib/interview/types";
import { resolveSessionConfig } from "@/lib/engine/resolve";
import { buildTurnMessages } from "@/lib/engine/prompts";
import {
  isInterviewIntegrityRequest,
  parseEngineTurn,
} from "@/lib/engine/turn-control";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { loadDeckManifest } from "@/lib/deck/store";
import { resolveDeckFairValueBand } from "@/lib/pitch/fair-value-band";
import {
  ratchetHighWaterMark,
  resolveRevealedSlides,
} from "@/lib/pitch/slide-reveal";

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

/**
 * Optional engine descriptor (plans 13-10 / 13-11 clients send this).
 * While those clients are pending, the legacy `interview` payload still
 * identifies an engine type for backward compatibility.
 */
interface EngineRequestInput {
  typeSlug?: unknown;
  instance?: unknown;
  customization?: unknown;
  /** Session-constant resume text (mirrors interview.resumeText). */
  resumeText?: unknown;
  /**
   * Per-turn state for the tail block. Clients send `{ progress, startedAt }`;
   * the route maps that into EngineTurnState (timing + optional time-budget
   * dates). Falls back to the legacy `interview` fields when absent.
   */
  turnState?: unknown;
}

interface EngineTurnStateInput {
  progress?: unknown;
  startedAt?: unknown;
  /** Epoch ms when the student's opening turn began (soft first-turn window). */
  firstTurnStartedAt?: unknown;
  /** True once the opening turn has been delivered (follow-up phase). */
  firstTurnDelivered?: unknown;
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
  const stages = [
    "opening",
    "resume",
    "behavioral",
    "role_specific",
    "closing",
  ] as const;
  const categories = [
    "conflict/disagreement",
    "failure/setback",
    "leadership without authority",
    "feedback received",
    "ambiguity",
    "teamwork",
  ] as const;

  const isCategory = (category: unknown): category is BehavioralCategory =>
    typeof category === "string" &&
    categories.includes(category as BehavioralCategory);
  const uniqueCategories = (items: unknown): BehavioralCategory[] =>
    Array.isArray(items) ? [...new Set(items.filter(isCategory))] : [];

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
    // Absent on any session that started before this field existed, and on
    // every resumed checkpoint written before it — defaults to 0, which is
    // the safe direction: the stage advances a little later rather than
    // skipping ahead on a value that was never tracked.
    behavioralQuestionsAsked:
      typeof progress.behavioralQuestionsAsked === "number" &&
      Number.isFinite(progress.behavioralQuestionsAsked)
        ? Math.max(
            0,
            Math.min(20, Math.floor(progress.behavioralQuestionsAsked)),
          )
        : fallback.behavioralQuestionsAsked,
  };
}

function elapsedMinutes(startedAt: unknown): number {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return 0;

  return Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
}

function isInstanceConfig(value: unknown): value is InstanceConfig {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;

  return (
    kind === "none" ||
    kind === "case-study" ||
    kind === "pitch-elevator" ||
    kind === "pitch-deck" ||
    kind === "networking-persona" ||
    kind === "difficult-conversation"
  );
}

/**
 * Identify an engine type slug from either the new `engine` descriptor or the
 * legacy `interview` payload. Returns null when neither identifies a type —
 * that is the LEGACY ADMIN CASE path (client-supplied systemPrompt/roleContext).
 */
function extractTypeSlug(
  interview: InterviewRequestInput | undefined,
  engine: EngineRequestInput | undefined,
): string | undefined {
  if (engine && typeof engine.typeSlug === "string") return engine.typeSlug;
  if (interview && typeof interview.typeSlug === "string")
    return interview.typeSlug;

  return undefined;
}

/**
 * Wrap an LLM SSE stream so the final `end` event carries an optional
 * `termination` field derived via `parseEngineTurn`. Content deltas are
 * unchanged — today's clients still parse markers themselves. With
 * `avatarMayEnd: false` on every built-in type, `termination` is always null.
 * This route never ends a session.
 */
function attachTerminationToStream(
  stream: ReadableStream<Uint8Array>,
  config: ResolvedSessionConfig,
  parseOpts: {
    previousProgress?: InterviewProgress;
    hasResume?: boolean;
    targetQuestionCount?: number;
    assistantTurnCount?: number;
  },
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let accumulated = "";

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();

      try {
        for (;;) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          buffer += chunk;
          const lines = buffer.split("\n");

          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6)) as {
                  type?: string;
                  delta?: string;
                  metadata?: Record<string, unknown>;
                };

                if (event.type === "content" && event.delta) {
                  accumulated += event.delta;
                }
                if (event.type === "end") {
                  const parsed = parseEngineTurn(
                    accumulated,
                    config,
                    parseOpts,
                  );

                  event.metadata = {
                    ...(event.metadata ?? {}),
                    termination: parsed.termination,
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                  );
                  continue;
                }
              } catch {
                // Pass through malformed frames unchanged.
              }
            }
            controller.enqueue(encoder.encode(`${line}\n`));
          }
        }

        if (buffer) {
          controller.enqueue(encoder.encode(buffer));
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

/** Legacy case-study / admin-case assembly — byte-identical to pre-Phase-13. */
function assembleLegacyCaseStudyPrompt(
  systemPrompt: unknown,
  roleContext:
    | { roleName?: string; additionalInfo?: string }
    | null
    | undefined,
  languageName: string,
): string {
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
    `## Language\nConduct this conversation entirely in ${languageName}. ` +
    `If a message appears to be in another language, treat it as a ` +
    `speech-to-text error and continue in ${languageName}.`;

  const staticParts: string[] = [styleGuide.trim(), languageRule];

  if (roleContext) {
    staticParts.push(
      `You are playing the role of "${roleContext.roleName}" in a case study simulation.`,
      roleContext.additionalInfo || "",
    );
  }
  staticParts.push(
    (typeof systemPrompt === "string" ? systemPrompt : "") ||
      "You are a helpful assistant.",
  );

  return staticParts.filter(Boolean).join("\n\n");
  // ── END CACHE PREFIX ──────────────────────────────────────────────────
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      systemPrompt,
      roleContext,
      language,
      interview,
      engine,
      revealedSlideIndex,
      reportId: rawReportId,
    } = body;
    const attemptLanguage = resolveAttemptLanguage(language);

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      !messages.every(isChatMessage)
    ) {
      return NextResponse.json(
        { error: "Messages must be a non-empty array of valid chat messages" },
        { status: 400 },
      );
    }

    const interviewInput = interview as InterviewRequestInput | undefined;
    const engineInput = engine as EngineRequestInput | undefined;
    const typeSlug = extractTypeSlug(interviewInput, engineInput);

    // A client that sends neither `interview` nor `engine` takes today's
    // generic path with its own systemPrompt/roleContext — the LEGACY ADMIN
    // CASE path. Do not require an engine type.
    const wantsEngineType =
      Boolean(interview) || Boolean(engineInput?.typeSlug);

    let sessionConfig: ResolvedSessionConfig | null = null;

    if (wantsEngineType) {
      // `resolveSessionConfig` is re-run every turn and is pure — that is
      // deliberate and is what keeps the OpenAI prefix cache safe under
      // customization. The customization is resolved once on the picker page,
      // the client resends the identical payload every turn, and the resolver
      // is pure — so the assembled prefix is byte-identical for the whole
      // session. Any field not found in the curated lists silently falls back
      // to the preset default, which is what keeps a hostile or stale payload
      // from both poisoning the prompt AND from varying turn-to-turn.
      // (Same intent as the former resolveInterviewType comment on this route.)
      const customization =
        (engineInput?.customization as
          | InterviewCustomizationInput
          | undefined) ??
        (interviewInput?.customization as
          | InterviewCustomizationInput
          | undefined);
      const instance = isInstanceConfig(engineInput?.instance)
        ? engineInput!.instance
        : undefined;

      const resolved = resolveSessionConfig(typeSlug, {
        customization,
        instance,
      });

      if (!resolved.ok) {
        // Keep the existing status and message so no client's error handling changes.
        return NextResponse.json(
          { error: "Unknown interview type" },
          { status: 400 },
        );
      }
      sessionConfig = resolved.config;
    }

    let fullMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    let interviewStyleTurnControl = false;
    let parseOpts: {
      previousProgress?: InterviewProgress;
      hasResume?: boolean;
      targetQuestionCount?: number;
      assistantTurnCount?: number;
    } = {};

    if (sessionConfig) {
      // Prefer engine-descriptor fields (13-10+ clients); fall back to the
      // legacy interview payload so InterviewSessionShell stays byte-stable
      // until 13-13 deletes it.
      const engineTurn =
        engineInput?.turnState && typeof engineInput.turnState === "object"
          ? (engineInput.turnState as EngineTurnStateInput)
          : undefined;
      const rawResume =
        typeof engineInput?.resumeText === "string"
          ? engineInput.resumeText
          : typeof interviewInput?.resumeText === "string"
            ? interviewInput.resumeText
            : "";
      const resumeText = rawResume.slice(0, MAX_RESUME_TEXT_LENGTH);
      const progress = normalizeProgress(
        engineTurn?.progress ?? interviewInput?.progress,
      );
      const startedAt = engineTurn?.startedAt ?? interviewInput?.startedAt;
      const isInterview = Boolean(getInterviewType(sessionConfig.typeSlug));

      interviewStyleTurnControl = isInterview;

      if (isInterview) {
        const hasUser = messages.some((m) => m.role === "user");

        if (!hasUser) {
          return NextResponse.json(
            { error: "An interview turn must include a candidate message" },
            { status: 400 },
          );
        }
      }

      const targetMinutes =
        sessionConfig.limits.targetMinutes ??
        getInterviewType(sessionConfig.typeSlug)?.targetMinutes ??
        0;

      const startedAtDate =
        typeof startedAt === "number" && Number.isFinite(startedAt)
          ? new Date(startedAt)
          : undefined;

      const firstTurnStartedAtRaw = engineTurn?.firstTurnStartedAt;
      const firstTurnStartedAtDate =
        typeof firstTurnStartedAtRaw === "number" &&
        Number.isFinite(firstTurnStartedAtRaw)
          ? new Date(firstTurnStartedAtRaw)
          : undefined;
      const firstTurnDelivered = engineTurn?.firstTurnDelivered === true;

      // Networking (16-07/16-08): characterId and brought-in persona text travel
      // in the wizard customization bag — not on InterviewCustomizationInput —
      // and are threaded into liveSystemPrompt via AssembleSystemPromptOpts.
      const rawCustomizationBag =
        engineInput?.customization &&
        typeof engineInput.customization === "object"
          ? (engineInput.customization as Record<string, unknown>)
          : interviewInput?.customization &&
              typeof interviewInput.customization === "object"
            ? (interviewInput.customization as Record<string, unknown>)
            : null;
      const networkingCharacterId =
        typeof rawCustomizationBag?.characterId === "string"
          ? rawCustomizationBag.characterId
          : null;
      const networkingPersonaText =
        typeof rawCustomizationBag?.distilledPersona === "string"
          ? rawCustomizationBag.distilledPersona
          : null;
      const networkingDisplayName =
        typeof rawCustomizationBag?.personaDisplayName === "string"
          ? rawCustomizationBag.personaDisplayName
          : null;

      // Pitch-deck only: hydrate slide text from private storage, then ratchet
      // the high-water mark into the tail. The live shell intentionally sends
      // `slideTexts: []` (14-12) — never trust client texts for admission.
      // Interview / case-study / elevator paths are untouched below.
      let revealedSlides: { index: number; text: string }[] | undefined;
      let slideCountForTail: number | undefined;

      if (sessionConfig.instance.kind === "pitch-deck") {
        let stored: number | null = null;
        let reportStartedAt: Date | null = null;
        let priorReveals: unknown = null;
        let ownedReportId: string | null = null;
        let deckOwnerId: string | null = null;
        // The `kind === "pitch-deck"` narrowing above is lost at the
        // `sessionConfig` reassignment below, so carry the slide count in a
        // local the compiler can still see. Hydration updates both.
        let deckSlideCount = sessionConfig.instance.slideCount;

        const reportId =
          typeof rawReportId === "string" && rawReportId.length > 0
            ? rawReportId
            : null;

        try {
          const token = request.cookies.get(
            siteConfig.auth.cookie.name,
          )?.value;
          const currentUser = await getCurrentUser(token || "");
          if (currentUser) {
            deckOwnerId = currentUser.id;

            if (reportId) {
              const report = await prisma.interactionReport.findFirst({
                where: { id: reportId, userId: currentUser.id },
                select: {
                  id: true,
                  slideHighWaterMark: true,
                  slideReveals: true,
                  startedAt: true,
                },
              });

              if (report) {
                ownedReportId = report.id;
                stored = report.slideHighWaterMark;
                priorReveals = report.slideReveals;
                reportStartedAt = report.startedAt;
              }
            }
          }
        } catch (err) {
          console.error(
            "pitch-deck slide mark load failed; proceeding in-memory",
            err,
          );
        }

        // 14-11: read slide text from private deck storage, not the client.
        // Also inject the server-only fair-value band so the cache prefix is
        // the real band every turn (client omits it on purpose).
        if (deckOwnerId) {
          try {
            const manifest = await loadDeckManifest(
              deckOwnerId,
              sessionConfig.instance.deckId,
            );
            if (manifest && manifest.slideCount > 0) {
              const slideTexts = manifest.slides.map((slide) =>
                typeof slide.text === "string" ? slide.text : "",
              );
              sessionConfig = {
                ...sessionConfig,
                instance: {
                  ...sessionConfig.instance,
                  slideCount: manifest.slideCount,
                  slideTexts,
                  fairValueBand: resolveDeckFairValueBand({
                    slideCount: manifest.slideCount,
                  }),
                },
              };
              deckSlideCount = manifest.slideCount;
            }
          } catch (err) {
            console.error(
              "pitch-deck slide text hydrate failed; continuing without texts",
              err,
            );
          }
        }

        const slideCount = deckSlideCount;

        // revealedSlideIndex is an INPUT to the ratchet only — never used raw.
        const { mark, advanced } = ratchetHighWaterMark({
          stored,
          requested: revealedSlideIndex,
          slideCount,
        });

        if (advanced && mark !== null && ownedReportId) {
          try {
            const prior = Array.isArray(priorReveals)
              ? (priorReveals as Array<{
                  index: number;
                  atTurnIndex: number;
                  atElapsedSeconds: number;
                }>)
              : [];
            const atTurnIndex = messages.filter(
              (m: { role: string }) => m.role === "user",
            ).length;
            const atElapsedSeconds = reportStartedAt
              ? Math.round((Date.now() - reportStartedAt.getTime()) / 1000)
              : 0;

            await prisma.interactionReport.update({
              where: { id: ownedReportId },
              data: {
                slideHighWaterMark: mark,
                slideReveals: [
                  ...prior,
                  { index: mark, atTurnIndex, atElapsedSeconds },
                ] as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (err) {
            // Transient DB error must not drop the student's turn — checkpoint
            // (14-05) is the durability backstop.
            console.error(
              "pitch-deck slide mark persist failed; using in-memory mark",
              err,
            );
          }
        }

        revealedSlides = resolveRevealedSlides({
          config: sessionConfig,
          mark,
        });
        slideCountForTail = slideCount;
      }

      const built = buildTurnMessages({
        config: sessionConfig,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        turnState: {
          progress,
          timing: {
            elapsedMinutes: elapsedMinutes(startedAt),
            targetMinutes,
            redirectMetaRequest: (() => {
              const latestUser = [...messages]
                .reverse()
                .find((m) => m.role === "user");

              return latestUser
                ? isInterviewIntegrityRequest(latestUser.content)
                : false;
            })(),
          },
          // Non-interview types that declare a time budget / first-turn window
          // read these in buildTailBlock; interview types ignore them (timing
          // lives in buildProgressBlock).
          startedAt: startedAtDate,
          now: startedAtDate ? new Date() : undefined,
          firstTurn: firstTurnStartedAtDate
            ? {
                startedAt: firstTurnStartedAtDate,
                deliveredAt: firstTurnDelivered
                  ? (startedAtDate ?? new Date())
                  : undefined,
              }
            : undefined,
          ...(revealedSlides !== undefined
            ? { revealedSlides, slideCount: slideCountForTail }
            : {}),
        },
        language: attemptLanguage,
        resumeText,
        systemPrompt:
          typeof systemPrompt === "string" ? systemPrompt : undefined,
        roleContext: roleContext ?? null,
        characterId: networkingCharacterId,
        networkingPersona: networkingPersonaText,
        networkingDisplayName,
      });

      fullMessages = built.messages;
      // Include the assistant turn currently being produced (floor counts this reply).
      const assistantTurnCount =
        messages.filter((m) => m.role === "assistant").length + 1;

      parseOpts = {
        previousProgress: progress,
        hasResume: Boolean(resumeText.trim()),
        targetQuestionCount:
          sessionConfig.limits.targetQuestionCount ??
          getInterviewType(sessionConfig.typeSlug)?.targetQuestionCount ??
          9,
        assistantTurnCount,
      };
    } else {
      // Legacy admin/cohort case path — client-supplied strings, no engine type.
      const fullSystemPrompt = assembleLegacyCaseStudyPrompt(
        systemPrompt,
        roleContext,
        attemptLanguage.name,
      );

      fullMessages = [
        { role: "system", content: fullSystemPrompt }, // Must stay at index 0 for caching
        ...messages,
      ];
    }

    const stream = createLLMStream(fullMessages, "gpt-4.1", {
      // 320 was tight for an interviewer question PLUS the mandatory
      // turn-control marker line. A reply that hit the cap lost the marker,
      // and a missing marker stops progress advancing — so the cap was
      // silently breaking the interview state machine. 520 leaves real
      // headroom; the prompt still constrains the model to short turns.
      maxTokens: interviewStyleTurnControl ? 520 : 1000,
    });

    const responseStream = sessionConfig
      ? attachTerminationToStream(stream, sessionConfig, parseOpts)
      : stream;

    return new Response(responseStream, { headers: createSSEHeaders() });
  } catch (error) {
    console.error("Error in interaction chat:", error);

    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
