/**
 * Networking Practice — live avatar prompt, evaluator prompt, rubric extras,
 * outcome declaration, and evaluation-context builder.
 *
 * The hidden goal is the design centerpiece (16-CONTEXT.md Specific Ideas):
 * the goal is required so Goal Progress always scores, the avatar never sees
 * it so the student has to earn it, and the outcome record says plainly
 * whether the ask was ever made.
 */

import type {
  OutcomeRecordConfig,
  ResolvedSessionConfig,
  RubricDimension,
} from "@/lib/engine/types";
import type { NetworkingInputSnapshot } from "@/lib/report/snapshot";

import { getNetworkingCharacter } from "./characters";

/**
 * The three extras beyond the shared Visual / Vocal / Content / Behavioral
 * dimensions. Keys are kebab-case to match Phase 13's dimension-key style
 * (see SHARED_RUBRIC_DIMENSION_KEYS and pitch extras). Descriptions use the
 * same 1-vs-5 register as `category_notes` siblings in lib/report/structured.ts.
 */
export const NETWORKING_RUBRIC_EXTRAS: RubricDimension[] = [
  {
    key: "rapport",
    label: "Rapport",
    description:
      "Did a real two-way connection form. 1: a one-sided transaction — the other person stayed a stranger. 5: genuine mutual interest — the other person volunteered things they were not asked.",
  },
  {
    key: "self-introduction",
    label: "Self-Introduction",
    description:
      "Was who the student is, and what they do, clear and concise. 1: rambling or so vague the listener could not place them. 5: placed themselves in a sentence or two and gave the listener something to hook onto.",
  },
  {
    key: "goal-progress",
    label: "Goal Progress",
    /**
     * The avatar never saw the goal. This dimension grades the student's
     * steering, not the avatar's cooperation — a declined ask that was well
     * made can still score high, and a 5 on Rapport beside a 1 here is
     * exactly the feedback this type exists to give (16-CONTEXT.md Specific Ideas).
     */
    description:
      "How far the student got toward what they actually wanted. 1: never steered the conversation there at all. 5: made the ask clearly, at a moment the conversation had earned.",
  },
];

/** Closed vocabulary for askOutcome — instructed in the evaluator prompt. */
export const NETWORKING_ASK_OUTCOMES = [
  "agreed",
  "deflected",
  "declined",
  "never-asked",
] as const;

export type NetworkingAskOutcome = (typeof NETWORKING_ASK_OUTCOMES)[number];

/**
 * 16-CONTEXT.md decision 12 — concrete, pointable feedback distinct from the
 * 1-5 scores. askOutcome's four literals are closed in the evaluator prompt;
 * OutcomeFieldKind has no enum member today (extension handoff if runtime
 * validateOutcome must reject unknown literals).
 */
export const NETWORKING_OUTCOME: OutcomeRecordConfig = {
  fields: [
    { key: "askMade", label: "Ask made", kind: "boolean", required: true },
    {
      key: "askOutcome",
      label: "Ask outcome",
      kind: "string",
      required: true,
    },
    {
      key: "commonGround",
      label: "Common ground",
      kind: "string",
      required: false,
    },
  ],
};

export type NetworkingSystemPromptInput = {
  persona: string;
  displayName: string;
};

/**
 * This signature is deliberately narrow. The student's goal is withheld from
 * the avatar (16-CONTEXT.md) and the way that is guaranteed is that this
 * function cannot receive it. Do not widen this parameter to the resolved
 * config.
 */
export function buildNetworkingSystemPrompt(
  input: NetworkingSystemPromptInput,
): string {
  const { persona, displayName } = input;

  // A `setting` clause (conference reception, coffee chat, …) is DEFERRED per
  // 16-CONTEXT.md's Deferred Ideas. It would be inserted here, between the
  // persona clause and the manner clause, without restructuring anything. Do
  // not add it now.
  const clauses: string[] = [
    `You are playing the role of: ${persona}`,
    `Your name is ${displayName}. You are meeting this person for the first time in a professional context. You do not know them and have no prior relationship.`,
    "Behave like a real person being approached by a stranger: you are willing to talk, but you have your own time, your own interests and your own reasons to engage or disengage. You are not screening them for a role and you must not work through a list of questions.",
    "Speak in short conversational turns. Inquire about them when you are genuinely curious, and say so when you are not. Volunteer something about yourself when the conversation earns it.",
    "Do not coach, do not evaluate, do not narrate, and never break character to comment on the conversation.",
    // Walk-away: the engine's floor rejects an end that lands too early, and a
    // rejected end means the conversation simply continues with no
    // student-visible error. Marker syntax is from lib/engine/termination.ts.
    'If the conversation becomes genuinely unrewarding — the other person is not engaging you, is only talking about themselves, or is making you uncomfortable — you may end the conversation politely, the way a real person would. End your reply with a trailing marker exactly like: <engine-end reason="disengaged" /> using one of these reasons only: disengaged, not-worth-continuing, out-of-time. Do not invent other reasons. Do not explain that you are ending a practice session.',
  ];

  return clauses.join("\n\n");
}

const RUBRIC_EXTRAS_SCORING_BLOCK = NETWORKING_RUBRIC_EXTRAS.map(
  (d, i) => `${i + 1}. ${d.label} (${d.key}): ${d.description}`,
).join("\n");

/**
 * Type-specific evaluator system prompt. Judges rapport and self-introduction,
 * not hiring-screen answer quality (P16-SC4). The student's goal is supplied
 * in the evaluation context — never in the live avatar prompt.
 */
export const NETWORKING_EVALUATOR_PROMPT = `You are grading a NETWORKING conversation — a first meeting with a stranger in a professional setting. You are NOT grading how well someone answered questions on a hiring screen. Answer quality in that sense is explicitly not what is being judged.

Score EVERY dimension on the 1-5 scale. The shared four (Visual, Vocal, Content, Behavioral) use the usual delivery and substance criteria. The three networking-specific dimensions:

${RUBRIC_EXTRAS_SCORING_BLOCK}

The student had a GOAL that the other person in the conversation never saw. That goal text is supplied in the evaluation context under "goal". Grade Goal Progress on the student's steering toward it — a well-made ask that was declined can still score high; never having steered there scores low.

OUTCOME RECORD (factual, not a score — fill honestly after scoring):
- askMade (boolean): whether the student made a clear ask related to their goal.
- askOutcome: exactly one of "agreed" | "deflected" | "declined" | "never-asked". "never-asked" is a legitimate and common outcome and must be reported honestly rather than softened.
- commonGround (string or null): the most concrete shared interest, background, or hook that surfaced, or null if none.

If the session ended early on the other person's initiative, grade all seven dimensions anyway on what DID happen. Treat the early end as evidence about the conversation — not as a missing session, not as an error, and not as a reason to zero any dimension. (Phase 14 early-end report convention: every dimension still scored; the early end is a named outcome, never a crash.)`;

export type NetworkingEvaluationContext = {
  kind: "networking";
  displayName: string;
  persona: string;
  characterId: string | null;
  personaId: string | null;
  /** Present when a networking InputSnapshot (or equivalent) was supplied. */
  goal: string | null;
};

/**
 * This is the one and only place the goal is admitted. The live prompt builder
 * cannot receive it; the evaluator must. That asymmetry IS the feature.
 *
 * Signature drift from InteractionPromptsConfig.buildEvaluationContext (which
 * is `(config) => Record`): the second `snapshot` argument is optional so the
 * registry can delegate `(config) => buildNetworkingEvaluationContext(config)`
 * while verify scripts and the future evaluation-runner overlay can pass the
 * NetworkingInputSnapshot that actually carries `goal`.
 */
export function buildNetworkingEvaluationContext(
  config: ResolvedSessionConfig,
  snapshot?: NetworkingInputSnapshot | null,
): NetworkingEvaluationContext {
  const fromInstance =
    config.instance.kind === "networking-persona" ? config.instance : null;

  let displayName = fromInstance?.displayName ?? "";
  let persona = fromInstance?.persona ?? "";
  let characterId: string | null = null;
  let personaId: string | null = fromInstance?.personaId ?? null;

  if (snapshot?.kind === "networking") {
    if (!displayName && snapshot.displayName) {
      displayName = snapshot.displayName;
    }
    if (snapshot.characterId) {
      characterId = snapshot.characterId;
      const character = getNetworkingCharacter(snapshot.characterId);

      if (character && !persona) {
        persona = character.persona;
        displayName = displayName || character.displayName;
      }
    }

    if (snapshot.personaId) {
      personaId = snapshot.personaId;
    }
  }

  return {
    kind: "networking",
    displayName,
    persona,
    characterId,
    personaId,
    goal: snapshot?.kind === "networking" ? snapshot.goal : null,
  };
}

/**
 * Resolves the live avatar's persona + displayName from a networking session.
 * Prefers a brought-in networking-persona instance; otherwise looks up a
 * built-in character by id. Returns null when neither resolves — callers must
 * treat that as a resolution failure, not a silent default.
 *
 * `characterId` is not yet a field on ResolveSessionConfigInput (Phase 13
 * seam); session/wizard wiring passes it here until a typed customization
 * path lands.
 */
export function resolveNetworkingLivePersona(
  config: ResolvedSessionConfig,
  opts: {
    characterId?: string | null;
    persona?: string | null;
    displayName?: string | null;
  } = {},
): NetworkingSystemPromptInput | null {
  if (config.instance.kind === "networking-persona") {
    return {
      persona: config.instance.persona,
      displayName: config.instance.displayName,
    };
  }

  const character = getNetworkingCharacter(opts.characterId);

  if (character) {
    return {
      persona: character.persona,
      displayName: character.displayName,
    };
  }

  const persona = typeof opts.persona === "string" ? opts.persona.trim() : "";
  const displayName =
    typeof opts.displayName === "string" ? opts.displayName.trim() : "";

  if (persona && displayName) {
    return { persona, displayName };
  }

  return null;
}
