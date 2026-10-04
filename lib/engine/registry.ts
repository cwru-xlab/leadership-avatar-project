/**
 * The built-in engine TYPE records.
 *
 * Adding a sixth interaction type means adding one more entry to
 * `ENGINE_TYPES` below — nothing else in the repo changes (REQ-60). Lookup
 * goes through `getEngineType()` so that moving this catalog into a
 * different store later touches exactly one function, following
 * `lib/interview/types.ts`'s existing `getInterviewType()` shape.
 *
 * The four interview presets here are a field-for-field transcription of
 * `lib/interview/types.ts`'s `INTERVIEW_TYPES` — same slugs, same copy, same
 * `targetMinutes`/`targetQuestionCount`. `lib/interview/types.ts` itself is
 * untouched; this plan reads from it, never edits it. The fifth record,
 * `case-study`, wires the existing scenario evaluator without copying its
 * prompt text.
 */

import type { InteractionTypeConfig, ResolvedSessionConfig } from "./types";

import {
  INTERVIEW_TYPES,
  getInterviewType,
  type InterviewType,
} from "../interview/types";
import {
  buildInterviewSystemPrompt,
  INTERVIEW_EVALUATOR_PROMPT,
} from "../interview/prompts";
import { SCENARIO_EVALUATOR_PROMPT } from "../scenario/prompts";
import { resolveAttemptLanguage } from "../languages";

/**
 * Builds an interview preset's `InteractionTypeConfig` record. `base` is the
 * matching `lib/interview/types.ts` record, transcribed field-for-field.
 *
 * `liveSystemPrompt` delegates to the existing `buildInterviewSystemPrompt`
 * rather than reimplementing prompt assembly — plan 13-06 generalizes
 * assembly; this plan must not edit `lib/interview/prompts.ts`. The resolved
 * config's `customization` (when present, from a student-tuned session)
 * overlays onto `base` first, so a customized session's live prompt reflects
 * the same persona/difficulty/role the student picked — the exact shape
 * `resolveInterviewType` already produces for the legacy chat route.
 */
function makeInterviewTypeConfig(base: InterviewType): InteractionTypeConfig {
  return {
    slug: base.slug,
    name: base.label,
    description: base.description,
    extraRubricDimensions: [],
    prompts: {
      liveSystemPrompt: (config: ResolvedSessionConfig, extra) => {
        const resolvedBase: InterviewType = config.customization
          ? {
              ...base,
              defaultIndustry: config.customization.industry,
              defaultRoleTitle: config.customization.roleTitle,
              difficulty: config.customization
                .difficulty as InterviewType["difficulty"],
              targetMinutes: config.customization.targetMinutes,
              targetQuestionCount: config.customization.targetQuestionCount,
              interviewerPersona: config.customization.interviewerPersona,
            }
          : base;

        return buildInterviewSystemPrompt(resolvedBase, {
          resumeText: extra.resumeText ?? "",
          language: extra.language ?? resolveAttemptLanguage(undefined),
        });
      },
      evaluatorPrompt: INTERVIEW_EVALUATOR_PROMPT,
      buildEvaluationContext: (config: ResolvedSessionConfig) => ({
        kind: "interview",
        customization: config.customization,
      }),
    },
    limits: {
      targetMinutes: base.targetMinutes,
      targetQuestionCount: base.targetQuestionCount,
    },
    // Today nothing but the student can end an interview session.
    terminationPolicy: {
      studentMayEnd: true,
      avatarMayEnd: false,
      avatarEndReasons: [],
    },
    // The permissive default: the avatar sees everything the session knows.
    visibleContext: { visibleChannels: "*" },
    outcome: { fields: [] },
    timeBudget: {
      totalSeconds: base.targetMinutes * 60,
      // No warning exists today for any interview preset.
      warnAtRemainingSeconds: null,
    },
    instance: { required: false },
    // Interview clients fire ~9-15 fire-and-forget checkpoints per session.
    checkpointing: "client-driven",
    // Interview finish flips IN_PROGRESS → PENDING in the request path.
    finishPendingFlip: "request-path",
    // Interview report page offers "retry evaluation" on FAILED (REQ-69).
    supportsRetry: true,
    // Populated when plan 13-09 builds the generic wizard.
    setupSteps: [],
  };
}

const GENERAL: InteractionTypeConfig = makeInterviewTypeConfig(
  getInterviewType("general")!,
);
const TECHNICAL: InteractionTypeConfig = makeInterviewTypeConfig(
  getInterviewType("technical")!,
);
const CONSULTING: InteractionTypeConfig = makeInterviewTypeConfig(
  getInterviewType("consulting")!,
);
const EARLY_CAREER: InteractionTypeConfig = makeInterviewTypeConfig(
  getInterviewType("early-career")!,
);

/**
 * The scenario / case-play type. Slug is LOCKED to the literal `"case-study"`
 * — it becomes permanent, queryable history in `InteractionReport.typeSlug`.
 *
 * `liveSystemPrompt` below is a provisional, best-effort assembly mirroring
 * `app/api/interaction/chat/route.ts`'s existing inline case-study branch
 * (style guide + per-avatar role context + case background). No route is
 * wired to call it yet by this plan — plan 13-06 owns generalizing live
 * prompt assembly, including per-avatar role selection, which this
 * type-level record cannot express on its own because the chat route picks
 * ONE avatar per scene at request time, not at type-resolution time.
 */
const CASE_STUDY: InteractionTypeConfig = {
  slug: "case-study",
  name: "Case Studies",
  description:
    "A roleplay scenario grounded in a case you or your instructor authored, " +
    "evaluated against the scenario's own criteria plus the standard rubric.",
  extraRubricDimensions: [],
  prompts: {
    liveSystemPrompt: (config: ResolvedSessionConfig) => {
      const instance =
        config.instance.kind === "case-study" ? config.instance : null;
      const styleGuide = [
        "## Reply Style",
        "- Speak naturally and conversationally, like a real person in a meeting or interview",
        "- Keep responses short and to the point — 1 to 3 sentences unless more detail is truly needed",
        "- Avoid bullet points, formal headings, or structured lists in your replies",
      ].join("\n");

      if (!instance) {
        return styleGuide;
      }
      const characterLines = instance.avatars
        .map((a) => `- ${a.name} (${a.role})`)
        .join("\n");

      return [
        styleGuide,
        `You are playing a role in the scenario "${instance.caseName}".`,
        instance.background,
        characterLines ? `Characters in this scenario:\n${characterLines}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    },
    evaluatorPrompt: SCENARIO_EVALUATOR_PROMPT,
    buildEvaluationContext: (config: ResolvedSessionConfig) => {
      const instance =
        config.instance.kind === "case-study" ? config.instance : null;

      return {
        kind: "scenario",
        caseName: instance?.caseName ?? "",
        background: instance?.background ?? "",
        characters:
          instance?.avatars.map((a) => ({ name: a.name, role: a.role })) ?? [],
        authorCriteria: instance?.criteria ?? null,
      };
    },
  },
  limits: {
    // A scenario has no target today.
    targetMinutes: null,
    targetQuestionCount: null,
  },
  // Same student-only termination as the interview presets.
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: false,
    avatarEndReasons: [],
  },
  visibleContext: { visibleChannels: "*" },
  outcome: { fields: [] },
  timeBudget: { totalSeconds: null, warnAtRemainingSeconds: null },
  instance: { required: true },
  // Scenario has NO checkpoint — transcript durability is /api/interaction/save.
  // Rejecting a checkpoint here is what keeps case-study non-resumable (REQ-69).
  checkpointing: "none",
  // Scenario finish does NOT flip PENDING; the runner does (REQ-69).
  finishPendingFlip: "runner",
  // Scenario has no retry route today — do not invent one (REQ-69).
  supportsRetry: false,
  setupSteps: [],
};

export const ENGINE_TYPES: InteractionTypeConfig[] = [
  GENERAL,
  TECHNICAL,
  CONSULTING,
  EARLY_CAREER,
  CASE_STUDY,
];

const ENGINE_TYPES_BY_SLUG: Record<string, InteractionTypeConfig> =
  Object.fromEntries(ENGINE_TYPES.map((type) => [type.slug, type]));

/** Resolve a slug into its built-in TYPE record. Returns null on unknown. */
export function getEngineType(
  slug: string | undefined | null,
): InteractionTypeConfig | null {
  if (!slug) return null;

  return ENGINE_TYPES_BY_SLUG[slug.trim().toLowerCase()] ?? null;
}

/** For a future generic launcher. */
export function listEngineTypes(): InteractionTypeConfig[] {
  return ENGINE_TYPES;
}

// Sanity-check at module scope: every preset slug transcribed here must still
// exist in the legacy registry under the same slug, so a future edit to
// either registry that drops a slug fails loudly instead of silently
// diverging. Deliberately cheap — iterates a 4-entry map once at import time.
for (const slug of Object.keys(INTERVIEW_TYPES)) {
  if (!ENGINE_TYPES_BY_SLUG[slug]) {
    throw new Error(
      `lib/engine/registry.ts is missing a transcription of interview preset "${slug}"`,
    );
  }
}
