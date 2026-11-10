/**
 * The two questioned-persona InteractionTypeConfig records. They extend the
 * difficult-conversation engine: same instance kind (with `personaCard`),
 * same seeded resolver, same session room and finish path. What differs is
 * declared here — the persona prompts, the rubric extras, and the
 * supplementary behavior-coding pass.
 */

import type {
  InteractionTypeConfig,
  RubricDimension,
} from "@/lib/engine/types";

import { evaluatorNoteFor, runPersonaAnalysis } from "./analysis";
import {
  buildPersonaEvaluationContext,
  buildPersonaReminder,
  buildPersonaSystemPrompt,
  CLINICAL_EVALUATOR_PROMPT,
  MI_EVALUATOR_PROMPT,
} from "./prompts";
import type { PersonaStyle } from "./types";

export const PERSONA_ANALYSIS_OUTCOME_KEY = "personaAnalysis";

const CLINICAL_EXTRAS: RubricDimension[] = [
  {
    key: "opening_agenda",
    label: "Opening & agenda",
    description:
      "Greeting, introducing yourself and your role, an open first question, and checking for every concern before going into detail (Calgary–Cambridge: initiating the session).",
  },
  {
    key: "information_gathering",
    label: "Information gathering",
    description:
      "Letting the patient tell the story, moving from open to closed questions, clarifying the problem, and eliciting their ideas, concerns and expectations.",
  },
  {
    // SPLIT from a shared `empathy` key (2026-11-07). Calgary-Cambridge
    // empathy, MITI's empathy global, and Courageous Conversations' empathy
    // were all keyed `empathy`, so `DIMENSION_TO_COMPETENCY` pooled three
    // materially different constructs — "noticed a cue and did not reassure
    // too early", "reflected the client's frame accurately", and "did not
    // steamroll a colleague" — into one `audience_attunement` number. All
    // three still roll up to that competency (see lib/mastery/competencies.ts)
    // but as distinct dimensions, so a student's clinical cue-handling is no
    // longer averaged with their workplace conversation style.
    //
    // Safe to rename outright: at the time of the split every persona report
    // in the database was IN_PROGRESS with an empty `scores` object, so no
    // stored row carried this key, and MasteryContribution is keyed by
    // competencyKey rather than by dimension. `difficult-conversation` keeps
    // the bare `empathy` key precisely so its already-graded reports need no
    // migration.
    key: "empathy_clinical",
    label: "Empathy & cues",
    description:
      "Noticing the patient's emotional cues and responding with empathy before moving on, without premature reassurance.",
  },
  {
    key: "explanation_planning",
    label: "Explanation & closing",
    description:
      "Plain language, chunked information, a shared plan, teach-back, and a clear close with safety-netting.",
  },
];

const MI_EXTRAS: RubricDimension[] = [
  {
    key: "cultivating_change_talk",
    label: "Cultivating change talk",
    description:
      "MITI 4 global: how actively you evoked and deepened the client's own reasons for change.",
  },
  {
    key: "softening_sustain_talk",
    label: "Softening sustain talk",
    description:
      "MITI 4 global: how well you avoided arguing with or amplifying the client's reasons against change.",
  },
  {
    key: "partnership",
    label: "Partnership",
    description:
      "MITI 4 global: how much you treated the client as an equal partner and the expert on their own life.",
  },
  {
    // SPLIT from a shared `empathy` key (2026-11-07) — see the note on
    // `empathy_clinical` above. MITI 4's empathy global is a specific
    // construct (depth of reflected understanding) that must not be averaged
    // with clinical cue-handling or workplace conversation style, even though
    // all three evidence `audience_attunement`.
    key: "empathy_mi",
    label: "Empathy",
    description:
      "MITI 4 global: how deeply you understood and reflected the client's perspective.",
  },
];

function makePersonaType(style: PersonaStyle): InteractionTypeConfig {
  const clinical = style === "clinical-communication";
  return {
    slug: style,
    name: clinical ? "Clinical Communication" : "Motivational Interviewing",
    description: clinical
      ? "Take a history from a standardized patient who holds back facts until you ask well, graded on a Calgary–Cambridge checklist plus behavior counts."
      : "Counsel an ambivalent client, graded with MITI 4 global scores and coded behavior counts.",
    extraRubricDimensions: clinical ? CLINICAL_EXTRAS : MI_EXTRAS,
    prompts: {
      liveSystemPrompt: (config) => buildPersonaSystemPrompt(config),
      evaluatorPrompt: clinical ? CLINICAL_EVALUATOR_PROMPT : MI_EVALUATOR_PROMPT,
      buildEvaluationContext: (config) => ({ ...buildPersonaEvaluationContext(config) }),
      buildTailFragment: buildPersonaReminder,
    },
    // A patient or client does not walk out; the student ends the session.
    terminationPolicy: {
      studentMayEnd: true,
      avatarMayEnd: false,
      avatarEndReasons: [],
    },
    // No model-produced outcome fields: the structured result is the
    // engine-owned `personaAnalysis`, written by the supplementary pass.
    outcome: { fields: [] },
    supplementaryAnalysis: {
      outcomeKey: PERSONA_ANALYSIS_OUTCOME_KEY,
      run: async ({ config, turns, startedAt }) => {
        const card =
          config.instance.kind === "difficult-conversation"
            ? config.instance.personaCard
            : undefined;
        if (!card || card.style !== style) return null;
        const analysis = await runPersonaAnalysis({ style, card, turns, startedAt });
        return { outcomeValue: analysis, evaluatorNote: evaluatorNoteFor(analysis) };
      },
    },
    timeBudget: {
      // OSCE stations run 8–15 minutes; a soft target, no hard cutoff.
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: null,
      adjustableRangeSeconds: null,
    },
    limits: { targetMinutes: clinical ? 12 : 15, targetQuestionCount: null },
    instance: { required: true },
    // Same transcript durability as difficult-conversation: the finish call
    // carries the turns.
    checkpointing: "none",
    finishPendingFlip: "request-path",
    supportsRetry: true,
    visibleContext: { visibleChannels: "*" },
    setupSteps: [
      {
        id: "persona-briefing",
        label: "Briefing",
        customComponent: "ConversationBriefingStep",
      },
    ],
  };
}

export const CLINICAL_COMMUNICATION_TYPE = makePersonaType("clinical-communication");
export const MOTIVATIONAL_INTERVIEWING_TYPE = makePersonaType("motivational-interviewing");
