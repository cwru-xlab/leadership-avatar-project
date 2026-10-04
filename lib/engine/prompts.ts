/**
 * Engine prompt assembly for the live chat turn.
 *
 * ## The cache-prefix contract (REQ-73)
 *
 * The chat route keeps `messages[0]` (the system prompt) byte-identical across
 * every turn of a session so OpenAI's automatic prefix cache hits.
 * `assembleSystemPrompt` therefore takes ONLY session-constant inputs — the
 * resolved TYPE+INSTANCE config, language, resume text, and (for case-study)
 * the client-chosen role context / system prompt. It must never receive a turn
 * counter, a timestamp, or elapsed time.
 *
 * Per-turn state — interview progress, time-budget remaining, visible-context
 * slice — lives in `buildTailBlock`, which `buildTurnMessages` appends to the
 * *latest user message* only. Only the tail of the message array changes, so
 * the system-prefix survives.
 *
 * This module WRAP and DELEGATES to `lib/interview/prompts.ts` for interview
 * types so today's assembled bytes stay identical. Do not edit that file from
 * here; the interview shell still imports it directly until plan 13-10.
 */

import type { AttemptLanguage } from "@/lib/languages";
import type { ResolvedSessionConfig } from "./types";

import {
  applyVisibleContext,
  type SessionContextState,
  type VisibleContextTurn,
} from "./visible-context";
import { buildTimeBudgetFragment, computeTimeBudgetState } from "./time-budget";

import {
  buildInterviewSystemPrompt,
  buildProgressBlock,
  type InterviewTiming,
} from "@/lib/interview/prompts";
import {
  getInterviewType,
  type InterviewProgress,
  type InterviewType,
} from "@/lib/interview/types";

/** Byte-identical to the style guide in today's chat-route `else` branch. */
export const CASE_STUDY_REPLY_STYLE_GUIDE = `## Reply Style
- Speak naturally and conversationally, like a real person in a meeting or interview
- Keep responses short and to the point — 1 to 3 sentences unless more detail is truly needed
- Avoid bullet points, formal headings, or structured lists in your replies
- Never start with filler phrases like "Certainly!", "Great question!", or "Of course!"
- If you don't know something, say so simply and move on`;

export interface CaseStudyRoleContext {
  roleName: string;
  additionalInfo?: string;
}

/**
 * Session-constant inputs for `assembleSystemPrompt`. Never a turn index or
 * a Date — those belong in `EngineTurnState` / the tail block.
 */
export interface AssembleSystemPromptOpts {
  language: AttemptLanguage;
  /** Interview types only. Empty string when the student skipped upload. */
  resumeText?: string;
  /**
   * Case-study / legacy client-supplied system prompt. Chosen per scene at
   * request time (per-avatar role selection), not at type-resolution time.
   */
  systemPrompt?: string;
  /** Case-study per-scene avatar role. Same request-time choice as above. */
  roleContext?: CaseStudyRoleContext | null;
}

/** Per-turn state that may only enter the tail block, never the system prompt. */
export interface EngineTurnState {
  /** Interview progress for interview-shaped types. */
  progress?: InterviewProgress;
  /** Timing inputs for `buildProgressBlock` (interview types). */
  timing?: InterviewTiming;
  /**
   * Session start + "now" for the engine time-budget fragment. Only consulted
   * for non-interview types that declare a budget — interview types already
   * carry elapsed/remaining minutes inside `buildProgressBlock`, and today's
   * five types must keep that byte-identical tail (Task 3 / REQ-73).
   */
  startedAt?: Date;
  now?: Date;
  /** Opaque session context channels for the visible-context slice. */
  sessionState?: SessionContextState;
  /** Optional per-channel cursors for progressive reveal. */
  visibleContextTurn?: VisibleContextTurn;
}

const PER_TURN_KEY =
  /^(turn(Index|Count|Number)?|elapsed|timestamp|now|startedAt)$/i;

/**
 * Cheap insurance against a future edit quietly killing the prefix cache:
 * in development, throw if any argument reaching `assembleSystemPrompt`
 * looks per-turn (a Date, or a number/key named like a turn index).
 */
function assertSessionConstantArgs(
  config: ResolvedSessionConfig,
  opts: AssembleSystemPromptOpts,
): void {
  if (process.env.NODE_ENV === "production") return;

  const scan = (value: unknown, path: string): void => {
    if (value instanceof Date) {
      throw new Error(
        `assembleSystemPrompt received a Date at ${path} — per-turn values ` +
          `belong in buildTailBlock (REQ-73)`,
      );
    }
    if (value === null || value === undefined) return;
    if (
      typeof value === "number" &&
      PER_TURN_KEY.test(path.split(".").pop() ?? "")
    ) {
      throw new Error(
        `assembleSystemPrompt received a per-turn number at ${path} (REQ-73)`,
      );
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (
          PER_TURN_KEY.test(key) &&
          (typeof child === "number" || child instanceof Date)
        ) {
          throw new Error(
            `assembleSystemPrompt received per-turn field "${key}" at ${path}.${key} (REQ-73)`,
          );
        }
        scan(child, path ? `${path}.${key}` : key);
      }
    }
  };

  scan(opts, "opts");
  // Config is session-constant by construction from resolveSessionConfig; still
  // reject any accidental Date that a future field might smuggle in.
  scan(config, "config");
}

/**
 * Builds the interview `InterviewType` shape `buildInterviewSystemPrompt`
 * expects, overlaying resolved customization the same way the registry's
 * `liveSystemPrompt` does — so the string is byte-identical to today's route.
 */
function interviewTypeFromConfig(
  config: ResolvedSessionConfig,
): InterviewType | null {
  const base = getInterviewType(config.typeSlug);

  if (!base) return null;

  if (!config.customization) return base;

  return {
    ...base,
    defaultIndustry: config.customization.industry,
    defaultRoleTitle: config.customization.roleTitle,
    difficulty: config.customization.difficulty as InterviewType["difficulty"],
    targetMinutes: config.customization.targetMinutes,
    targetQuestionCount: config.customization.targetQuestionCount,
    interviewerPersona: config.customization.interviewerPersona,
  };
}

/**
 * Case-study system prompt matching today's chat-route `else` branch
 * composition order exactly (frozen snapshot of pre-Phase-13 behavior):
 * style guide → language rule → role context → client systemPrompt.
 *
 * Per-avatar role selection stays at request time via `opts.roleContext` /
 * `opts.systemPrompt` — the type record cannot express the chosen scene role.
 */
function assembleCaseStudySystemPrompt(opts: AssembleSystemPromptOpts): string {
  const languageRule =
    `## Language\nConduct this conversation entirely in ${opts.language.name}. ` +
    `If a message appears to be in another language, treat it as a ` +
    `speech-to-text error and continue in ${opts.language.name}.`;

  const staticParts: string[] = [
    CASE_STUDY_REPLY_STYLE_GUIDE.trim(),
    languageRule,
  ];

  if (opts.roleContext) {
    staticParts.push(
      `You are playing the role of "${opts.roleContext.roleName}" in a case study simulation.`,
      opts.roleContext.additionalInfo || "",
    );
  }

  staticParts.push(opts.systemPrompt || "You are a helpful assistant.");

  return staticParts.filter(Boolean).join("\n\n");
}

/**
 * Session-constant system prompt. Takes ONLY session-constant inputs.
 * Interview types delegate to `buildInterviewSystemPrompt` for byte-identity.
 * Case-study reproduces the route's legacy `else`-branch assembly, with
 * per-avatar role selection supplied at request time via `opts`.
 */
export function assembleSystemPrompt(
  config: ResolvedSessionConfig,
  opts: AssembleSystemPromptOpts,
): string {
  assertSessionConstantArgs(config, opts);

  const interviewType = interviewTypeFromConfig(config);

  if (interviewType) {
    return buildInterviewSystemPrompt(interviewType, {
      resumeText: opts.resumeText ?? "",
      language: opts.language,
    });
  }

  if (config.typeSlug === "case-study") {
    return assembleCaseStudySystemPrompt(opts);
  }

  // Future engine types: fall through to the type record's own builder.
  // No built-in type reaches here today.
  throw new Error(
    `assembleSystemPrompt: no live prompt assembly for type "${config.typeSlug}"`,
  );
}

/**
 * Renders an admitted visible-context slice for the tail block. Empty when
 * there is nothing restricted to show (today: every built-in type uses `"*"`).
 */
function renderVisibleContextFragment(admitted: SessionContextState): string {
  const keys = Object.keys(admitted);

  if (keys.length === 0) return "";

  return [
    "[VISIBLE CONTEXT — not spoken aloud, do not reference this label]",
    JSON.stringify(admitted),
  ].join("\n");
}

/**
 * Per-turn tail block. Composed in a fixed order:
 *   1. interview progress block (interview types only)
 *   2. engine time-budget fragment (non-interview types that declare a budget)
 *   3. visible-context slice rendering (only when the type restricts channels)
 *
 * For today's five types this is byte-identical to `buildProgressBlock` alone
 * on interview turns, and the empty string on case-study turns — interview
 * timing already lives inside the progress block, case-study declares no
 * budget, and every type uses permissive `"*"` visible-context.
 */
export function buildTailBlock(
  config: ResolvedSessionConfig,
  turnState: EngineTurnState,
): string {
  const parts: string[] = [];

  const isInterview = Boolean(getInterviewType(config.typeSlug));

  if (isInterview && turnState.progress && turnState.timing) {
    parts.push(buildProgressBlock(turnState.progress, turnState.timing));
  }

  // Interview types already encode elapsed/remaining minutes inside
  // buildProgressBlock. Appending the engine fragment there would break the
  // REQ-73 byte-identity guard against today's interview tail. Non-interview
  // types that declare a budget get the fragment when startedAt/now are given.
  if (
    !isInterview &&
    config.timeBudget.totalSeconds !== null &&
    turnState.startedAt &&
    turnState.now
  ) {
    const fragment = buildTimeBudgetFragment(
      computeTimeBudgetState({
        config: config.timeBudget,
        startedAt: turnState.startedAt,
        now: turnState.now,
      }),
    );

    if (fragment) parts.push(fragment);
  }

  if (config.visibleContext.visibleChannels !== "*") {
    const admitted = applyVisibleContext(
      config.visibleContext,
      turnState.sessionState ?? {},
      turnState.visibleContextTurn,
    );
    const fragment = renderVisibleContextFragment(admitted);

    if (fragment) parts.push(fragment);
  }

  return parts.join("\n\n");
}

export interface BuildTurnMessagesInput {
  config: ResolvedSessionConfig;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  turnState: EngineTurnState;
  language: AttemptLanguage;
  resumeText?: string;
  systemPrompt?: string;
  roleContext?: CaseStudyRoleContext | null;
}

/**
 * One helper the chat route calls: session-constant system prompt + messages
 * with the tail block appended to the LATEST USER MESSAGE only.
 */
export function buildTurnMessages({
  config,
  messages,
  turnState,
  language,
  resumeText,
  systemPrompt,
  roleContext,
}: BuildTurnMessagesInput): {
  systemPrompt: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
} {
  const assembled = assembleSystemPrompt(config, {
    language,
    resumeText,
    systemPrompt,
    roleContext,
  });

  const transcript = messages.map((message) => ({ ...message }));
  const latestUser = [...transcript]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "user");

  if (!latestUser) {
    throw new Error("An engine turn must include a user message");
  }

  const tail = buildTailBlock(config, turnState);

  if (tail) {
    transcript[latestUser.index] = {
      ...latestUser.message,
      content: `${latestUser.message.content.trim()}\n\n${tail}`,
    };
  }

  return {
    systemPrompt: assembled,
    messages: [{ role: "system", content: assembled }, ...transcript],
  };
}
