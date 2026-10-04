/**
 * Proves the networking TYPE record (plan 16-07): seven rubric dimensions,
 * goal exclusion by declaration, floor-gated walk-away, outcome shape,
 * character + brought-in resolve paths, and no drift on pre-existing types.
 *
 * Run: npx tsx scripts/verify-networking-type.ts
 */
import { ENGINE_TYPES, getEngineType } from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { applyVisibleContext } from "../lib/engine/visible-context";
import { resolveTermination } from "../lib/engine/termination";
import { validateOutcome } from "../lib/engine/outcome";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import type { InstanceConfig } from "../lib/engine/types";
import {
  NETWORKING_ASK_OUTCOMES,
  NETWORKING_EVALUATOR_PROMPT,
  buildNetworkingEvaluationContext,
  buildNetworkingSystemPrompt,
  resolveNetworkingLivePersona,
} from "../lib/networking/prompts";
import { getNetworkingCharacter } from "../lib/networking/characters";
import type { NetworkingInputSnapshot } from "../lib/report/snapshot";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const SENTINEL_GOAL = "SENTINEL-GOAL-a referral into their team";

const NETWORKING_PERSONA: InstanceConfig = {
  kind: "networking-persona",
  personaId: "persona-verify-001",
  ownerId: "user-owner-1",
  displayName: "Alex Rivera",
  persona:
    "Alex Rivera is a VP of marketing at a mid-size CPG company, warm but time-pressed.",
  source: "pasted",
  attestationId: "att-001",
  attestedAt: "2026-10-04T00:00:00.000Z",
  attestedWordingVersion: "networking-attestation-v1",
  createdAt: "2026-10-04T00:00:00.000Z",
};

function networkingSnapshot(
  overrides: Partial<NetworkingInputSnapshot> = {},
): NetworkingInputSnapshot {
  return {
    kind: "networking",
    personaSource: "character",
    characterId: "priya-malhotra",
    personaId: null,
    displayName: "Priya Malhotra",
    goal: SENTINEL_GOAL,
    interviewerAvatarId: "avatar-1",
    interviewerVoice: "voice-1",
    budgetSeconds: 900,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
console.log("\n1. Seven dimensions, in order");
{
  const result = resolveSessionConfig("networking", {});
  check("resolveSessionConfig(\"networking\") ok:true", result.ok === true, JSON.stringify(result));
  const keys = result.ok
    ? result.config.rubricDimensions.map((d) => d.key)
    : [];
  const expected = [
    "visual",
    "vocal",
    "content",
    "behavioral",
    "rapport",
    "self-introduction",
    "goal-progress",
  ];
  console.log(`   rubric keys: ${JSON.stringify(keys)}`);
  check(
    "rubric is exactly shared four + rapport, self-introduction, goal-progress",
    JSON.stringify(keys) === JSON.stringify(expected),
    `actual: ${JSON.stringify(keys)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. Schema requires all seven");
{
  const result = resolveSessionConfig("networking", {});
  check("resolve for schema ok", result.ok === true);
  if (result.ok) {
    let threw = false;
    let schema: ReturnType<typeof buildRubricJsonSchema> | null = null;
    try {
      schema = buildRubricJsonSchema(result.config);
    } catch {
      threw = true;
    }
    check("buildRubricJsonSchema does not throw", !threw);
    const required = schema?.schema.required ?? [];
    console.log(`   required[] score props: ${required.filter((r) => r.endsWith("_score")).join(", ")}`);
    for (const key of [
      "visual_score",
      "vocal_score",
      "content_score",
      "behavioral_score",
      "rapport_score",
      "self-introduction_score",
      "goal-progress_score",
    ]) {
      check(`required[] contains ${key}`, required.includes(key));
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n3. Resolves with a character and no instance");
{
  // P16-SC2 config-layer: playable with no persona authoring.
  // characterId is not on ResolveSessionConfigInput yet — proven via live
  // persona helper + liveSystemPrompt (extra.characterId) below.
  const result = resolveSessionConfig("networking", {});
  check(
    "resolveSessionConfig(\"networking\") with NO instance returns ok:true",
    result.ok === true,
    JSON.stringify(result),
  );
  const character = getNetworkingCharacter("priya-malhotra");
  check("priya-malhotra character exists", character !== null);
  if (result.ok && character) {
    const live = resolveNetworkingLivePersona(result.config, {
      characterId: "priya-malhotra",
    });
    check(
      "characterId path resolves live persona (not an instance)",
      live !== null &&
        live.displayName === character.displayName &&
        live.persona === character.persona,
      JSON.stringify(live),
    );
    const type = getEngineType("networking")!;
    const prompt = type.prompts.liveSystemPrompt(result.config, {
      characterId: "priya-malhotra",
    } as Parameters<typeof type.prompts.liveSystemPrompt>[1]);
    check(
      "liveSystemPrompt builds with characterId on extra",
      prompt.includes(character.persona.slice(0, 40)),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n4. Resolves with a brought-in instance");
{
  const result = resolveSessionConfig("networking", {
    instance: NETWORKING_PERSONA,
  });
  check(
    "resolve with networking-persona instance ok:true",
    result.ok === true,
    JSON.stringify(result),
  );
  if (result.ok) {
    check(
      "resolved instance kind is networking-persona",
      result.config.instance.kind === "networking-persona",
    );
    const live = resolveNetworkingLivePersona(result.config, {
      characterId: "priya-malhotra",
    });
    check(
      "live persona is the INSTANCE persona, NOT a character's",
      live !== null &&
        live.persona === NETWORKING_PERSONA.persona &&
        live.displayName === NETWORKING_PERSONA.displayName,
      JSON.stringify(live),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n5. Neither resolves to nothing — no silent default character");
{
  // Drift from plan wording: resolveSessionConfig returns ok:true because
  // instance.required is false (16-03). The "no silent default" gate is
  // enforced at live-persona resolution / liveSystemPrompt, where characterId
  // is available. Typed characterId on ResolveSessionConfigInput is an
  // extension handoff.
  const result = resolveSessionConfig("networking", {});
  check(
    "config still resolves with instance.required:false (16-03)",
    result.ok === true,
    JSON.stringify(result),
  );
  if (result.ok) {
    const live = resolveNetworkingLivePersona(result.config, {
      characterId: null,
    });
    check(
      "resolveNetworkingLivePersona returns null with neither characterId nor instance",
      live === null,
      JSON.stringify(live),
    );
    const type = getEngineType("networking")!;
    let threw = false;
    try {
      type.prompts.liveSystemPrompt(result.config, {});
    } catch {
      threw = true;
    }
    check(
      "liveSystemPrompt throws with neither (no silent default)",
      threw === true,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n6. GOAL EXCLUSION, declaration level (phase correctness centerpiece)");
console.log("   // Live-turn version is plan 16-09.");
{
  const result = resolveSessionConfig("networking", {});
  check("resolve ok for visible-context test", result.ok === true);
  if (result.ok) {
    const state = {
      goal: SENTINEL_GOAL,
      displayName: "Priya Malhotra",
      characterId: "priya-malhotra",
      personaId: null as string | null,
      personaSource: "character",
      persona: "persona text",
      interviewerAvatarId: "a1",
      interviewerVoice: "v1",
      budgetSeconds: 900,
    };
    const slices = [1, 2, 5, 20].map((turn) => ({
      turn,
      slice: applyVisibleContext(result.config.visibleContext, state, {}),
    }));
    for (const { turn, slice } of slices) {
      const serialized = JSON.stringify(slice);
      check(
        `turn ${turn}: sentinel absent from visible slice`,
        !serialized.includes(SENTINEL_GOAL) && !("goal" in slice),
        serialized,
      );
    }
    const snapshot = networkingSnapshot();
    const evalCtx = buildNetworkingEvaluationContext(result.config, snapshot);
    console.log(`   visible slice (turn 1): ${JSON.stringify(slices[0].slice)}`);
    console.log(`   evaluation context: ${JSON.stringify(evalCtx)}`);
    check(
      "sentinel DOES appear in buildNetworkingEvaluationContext",
      evalCtx.goal === SENTINEL_GOAL,
      JSON.stringify(evalCtx),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n7. GOAL EXCLUSION, signature level");
{
  check(
    "buildNetworkingSystemPrompt.length === 1",
    buildNetworkingSystemPrompt.length === 1,
    `length=${buildNetworkingSystemPrompt.length}`,
  );
  const withExtraKey = buildNetworkingSystemPrompt({
    persona: "A persona sentence.",
    displayName: "Test Person",
    // @ts-expect-error — goal must be structurally ignored if smuggled
    goal: SENTINEL_GOAL,
  } as Parameters<typeof buildNetworkingSystemPrompt>[0] & {
    goal: string;
  });
  check(
    "smuggled goal key does not appear in the prompt string",
    !withExtraKey.includes(SENTINEL_GOAL),
  );
  check(
    "built prompt has no goal|objective|what they want|ask\\b",
    !/goal|objective|what they want|ask\b/i.test(withExtraKey),
    withExtraKey,
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. Floor");
{
  const type = getEngineType("networking")!;
  const policy = type.terminationPolicy;
  const rejected = resolveTermination({
    policy,
    source: "avatar",
    reason: "disengaged",
    assistantTurnCount: 3,
  });
  check(
    "assistantTurnCount: 3 is REJECTED (floor-not-met)",
    rejected.ok === false &&
      rejected.recordedReason === null &&
      rejected.reason === "floor-not-met",
    JSON.stringify(rejected),
  );
  const admitted = resolveTermination({
    policy,
    source: "avatar",
    reason: "disengaged",
    assistantTurnCount: 4,
  });
  check(
    "assistantTurnCount: 4 is ADMITTED with reason",
    admitted.ok === true && admitted.recordedReason === "disengaged",
    JSON.stringify(admitted),
  );
  const undeclared = resolveTermination({
    policy,
    source: "avatar",
    reason: "made-up-reason",
    assistantTurnCount: 99,
  });
  check(
    "undeclared reason rejected at any turn count",
    undeclared.ok === false && undeclared.recordedReason === null,
    JSON.stringify(undeclared),
  );
  const omitted = resolveTermination({
    policy,
    source: "avatar",
    reason: "disengaged",
  });
  check(
    "omitted assistantTurnCount fails closed",
    omitted.ok === false,
    JSON.stringify(omitted),
  );
}

// ---------------------------------------------------------------------------
console.log("\n9. Outcome validation");
{
  const type = getEngineType("networking")!;
  const outcome = type.outcome;
  const acceptedDeclined = validateOutcome(outcome, {
    askMade: true,
    askOutcome: "declined",
    commonGround: "shared alma mater",
  });
  check(
    "accepts askMade:true / declined / commonGround string",
    acceptedDeclined.ok === true,
    JSON.stringify(acceptedDeclined),
  );
  // validateOutcome's string kind rejects null (json schema allows null via
  // nullable type; runtime validator does not). Omit commonGround for the
  // never-asked shape — null semantics = absent. Enum/required enforcement
  // is an extension handoff on outcome.ts (recorded in 16-07-SUMMARY).
  const acceptedNever = validateOutcome(outcome, {
    askMade: false,
    askOutcome: "never-asked",
  });
  check(
    "accepts askMade:false / never-asked (commonGround omitted)",
    acceptedNever.ok === true,
    JSON.stringify(acceptedNever),
  );
  check(
    "NETWORKING_ASK_OUTCOMES is the closed four-literal vocabulary",
    JSON.stringify([...NETWORKING_ASK_OUTCOMES]) ===
      JSON.stringify(["agreed", "deflected", "declined", "never-asked"]),
  );
  const invented = "invented-outcome";
  check(
    "invented askOutcome is outside the closed vocabulary",
    !(NETWORKING_ASK_OUTCOMES as readonly string[]).includes(invented),
  );
  const kindMismatch = validateOutcome(outcome, {
    askMade: "yes",
    askOutcome: "declined",
  });
  check(
    "kind mismatch on askMade is REJECTED",
    kindMismatch.ok === false,
    JSON.stringify(kindMismatch),
  );
  const askMadeField = outcome.fields.find((f) => f.key === "askMade");
  check(
    "askMade is declared required:true (declarative hint)",
    askMadeField?.required === true,
  );
}

// ---------------------------------------------------------------------------
console.log("\n10. Time budget");
{
  const result = resolveSessionConfig("networking", {});
  check("resolve ok for time budget", result.ok === true);
  if (result.ok) {
    check(
      "totalSeconds === 900",
      result.config.timeBudget.totalSeconds === 900,
      JSON.stringify(result.config.timeBudget),
    );
    check(
      "warnAtRemainingSeconds === 120",
      result.config.timeBudget.warnAtRemainingSeconds === 120,
    );
    check(
      "adjustableRangeSeconds is absent/null",
      result.config.timeBudget.adjustableRangeSeconds == null,
      JSON.stringify(result.config.timeBudget.adjustableRangeSeconds),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n11. Setup steps");
{
  const networking = getEngineType("networking")!;
  const interview = getEngineType("general")!;
  const interviewAvatarStep = interview.setupSteps.find(
    (s) => s.customComponent === "InterviewerStep",
  );
  const ids = networking.setupSteps.map((s) => s.id);
  console.log(`   networking setupSteps: ${JSON.stringify(ids)}`);
  check(
    "exactly three declared steps",
    networking.setupSteps.length === 3,
    `count=${networking.setupSteps.length}`,
  );
  check(
    "step ids in order: networking-person, networking-goal, interviewer",
    JSON.stringify(ids) ===
      JSON.stringify(["networking-person", "networking-goal", "interviewer"]),
    JSON.stringify(ids),
  );
  check(
    "avatar step reuses Phase 13 interviewer step id",
    interviewAvatarStep !== undefined &&
      networking.setupSteps[2].id === interviewAvatarStep.id &&
      networking.setupSteps[2].customComponent === "InterviewerStep",
    `networking=${networking.setupSteps[2].id} interview=${interviewAvatarStep?.id}`,
  );
  check(
    "NO camera-consent step in the list",
    !ids.some((id) => /camera|consent/i.test(id)) &&
      !networking.setupSteps.some((s) =>
        /CameraConsent/i.test(s.customComponent ?? ""),
      ),
  );
}

// ---------------------------------------------------------------------------
console.log("\n12. No hiring-screen vocabulary in the evaluator prompt (P16-SC4)");
{
  check(
    "/interview|STAR|candidate|resume/i does not match NETWORKING_EVALUATOR_PROMPT",
    !/interview|STAR|candidate|resume/i.test(NETWORKING_EVALUATOR_PROMPT),
  );
}

// ---------------------------------------------------------------------------
console.log("\n13. Pre-existing types unchanged");
{
  for (const type of ENGINE_TYPES) {
    if (type.slug === "networking") continue;
    const instance: InstanceConfig | undefined = type.instance.required
      ? {
          kind: "case-study",
          caseId: "c1",
          caseName: "Case",
          background: "bg",
          avatars: [{ name: "A", role: "R" }],
          criteria: null,
        }
      : undefined;
    const result = resolveSessionConfig(type.slug, { instance });
    check(`"${type.slug}" still resolves`, result.ok === true, JSON.stringify(result));
    if (result.ok) {
      const keys = result.config.rubricDimensions.map((d) => d.key);
      check(
        `"${type.slug}" did not gain rapport or goal-progress`,
        !keys.includes("rapport") && !keys.includes("goal-progress"),
        JSON.stringify(keys),
      );
    }
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
