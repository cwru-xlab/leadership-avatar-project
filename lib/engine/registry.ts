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
import {
  NETWORKING_EVALUATOR_PROMPT,
  NETWORKING_OUTCOME,
  NETWORKING_RUBRIC_EXTRAS,
  buildNetworkingEvaluationContext,
  buildNetworkingSystemPrompt,
  resolveNetworkingLivePersona,
} from "../networking/prompts";
import { PITCH_ELEVATOR_TYPE } from "../pitch/elevator-type";
import { DIFFICULT_CONVERSATION_TYPE } from "../difficult-conversation/conversation-type";

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
    // Wizard steps declared here; CameraConsentStep is appended by SetupWizard
    // for every type (REQ-70) and is never listed in this array.
    setupSteps: [
      {
        id: "interviewer",
        label: "Interviewer",
        customComponent: "InterviewerStep",
      },
      {
        id: "resume",
        label: "Resume",
        customComponent: "ResumeStep",
        optional: true,
      },
    ],
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
  // Instance intro then the shared camera gate (appended by SetupWizard).
  // Plan 13-11 wires /practice/case-study/[instanceId] against these ids.
  setupSteps: [
    {
      id: "intro",
      label: "Intro",
      customComponent: "InstanceIntroStep",
    },
  ],
};

/**
 * Networking Practice. Slug is LOCKED to the literal `"networking"` — it
 * becomes permanent, queryable history in `InteractionReport.typeSlug` and
 * must never be renamed (same locking 13-01 applied to `"case-study"`).
 *
 * Description copy is reused verbatim from `lib/interactions/index.ts` so the
 * dashboard tile and this type do not drift. That file is a DIFFERENT
 * namespace with its own slugs; plan 16-11 owns flipping the tile live.
 */
const NETWORKING: InteractionTypeConfig = {
  slug: "networking",
  name: "Networking Practice",
  description:
    "Rehearse introducing yourself and building rapport with a stranger in a professional setting.",
  extraRubricDimensions: NETWORKING_RUBRIC_EXTRAS,
  prompts: {
    liveSystemPrompt: (config, extra) => {
      // characterId is wizard/session data — not yet on ResolveSessionConfigInput.
      // Until a typed customization path lands, the live route may pass it on
      // `extra` (same bag LiveSystemPromptExtra already is). Prefer a
      // networking-persona instance when present.
      const characterId =
        typeof (extra as { characterId?: unknown }).characterId === "string"
          ? (extra as { characterId: string }).characterId
          : null;
      const live = resolveNetworkingLivePersona(config, { characterId });

      if (!live) {
        throw new Error(
          "networking type: neither a networking-persona instance nor a resolvable characterId — no silent default",
        );
      }

      return buildNetworkingSystemPrompt(live);
    },
    evaluatorPrompt: NETWORKING_EVALUATOR_PROMPT,
    buildEvaluationContext: (config) =>
      buildNetworkingEvaluationContext(config),
  },
  limits: {
    // Matches lib/interactions/index.ts estimatedMinutes: 15. No question count.
    targetMinutes: 15,
    targetQuestionCount: null,
  },
  terminationPolicy: {
    studentMayEnd: true,
    avatarMayEnd: true,
    // Closed vocabulary — the model may not invent a reason.
    avatarEndReasons: ["disengaged", "not-worth-continuing", "out-of-time"],
    // Four assistant turns is roughly two real exchanges — enough that a
    // self-introduction has happened and Rapport and Self-Introduction are
    // gradeable. 16-CONTEXT.md: "a floor is required so disengagement cannot
    // fire in the opening seconds." This is the SAME engine knob
    // pitch-elevator uses (14-02), not a second mechanism. Enforcement is in
    // resolveTermination (confirmed by 16-03-SUMMARY).
    avatarEndFloor: { minAssistantTurns: 4 },
  },
  // ALLOW-LIST (not deny-list): a new channel added later is hidden by default
  // rather than leaked by default. `goal` is deliberately absent — the
  // avatar must never see the student's goal (16-CONTEXT.md).
  visibleContext: {
    visibleChannels: [
      "displayName",
      "characterId",
      "personaId",
      "personaSource",
      "persona",
      "interviewerAvatarId",
      "interviewerVoice",
      "budgetSeconds",
    ],
  },
  outcome: NETWORKING_OUTCOME,
  // 15 minutes matches the dashboard tile's existing promise
  // (lib/interactions/index.ts estimatedMinutes: 15). No adjustable range —
  // 16-CONTEXT.md asks for none on this type.
  timeBudget: {
    totalSeconds: 15 * 60,
    warnAtRemainingSeconds: 120,
  },
  // Built-in characters need no instance; brought-in persona is optional.
  // authoredInWizard omitted: a saved persona can exist before the wizard
  // (relaunch without re-pasting), so the 14-02 "created during setup" doc
  // does not fit cleanly.
  instance: { required: false },
  checkpointing: "client-driven",
  finishPendingFlip: "request-path",
  supportsRetry: true,
  // CameraConsentStep is appended by SetupWizard for EVERY type (13-09) and
  // must NOT appear here — a second copy would be the third hand-rolled
  // consent gate 13-09 exists to prevent. Plan 16-08 implements the custom
  // person/goal components against these declarations.
  setupSteps: [
    {
      id: "networking-person",
      label: "Who you're meeting",
      customComponent: "NetworkingPersonStep",
    },
    {
      id: "networking-goal",
      label: "Your goal",
      customComponent: "NetworkingGoalStep",
    },
    {
      // Reuse Phase 13's InterviewerStep declaration id — do NOT declare a
      // networking-specific avatar/voice picker (16-CONTEXT.md decision 10).
      id: "interviewer",
      label: "Avatar & voice",
      customComponent: "InterviewerStep",
    },
  ],
};

export const ENGINE_TYPES: InteractionTypeConfig[] = [
  GENERAL,
  TECHNICAL,
  CONSULTING,
  EARLY_CAREER,
  CASE_STUDY,
  NETWORKING,
  PITCH_ELEVATOR_TYPE,
  DIFFICULT_CONVERSATION_TYPE,
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

/**
 * Test-only registration for forward-referenced types (e.g. pitch-deck
 * before plan 14-09 lands the real record). Returns an unregister fn.
 * Never call from production request paths.
 */
export function registerEngineTypeForTests(
  type: InteractionTypeConfig,
): () => void {
  const key = type.slug.trim().toLowerCase();
  const previous = ENGINE_TYPES_BY_SLUG[key];
  ENGINE_TYPES_BY_SLUG[key] = type;
  return () => {
    if (previous) {
      ENGINE_TYPES_BY_SLUG[key] = previous;
    } else {
      delete ENGINE_TYPES_BY_SLUG[key];
    }
  };
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
