/**
 * Proves Practice Pitch type records resolve correctly and cannot violate
 * locked CONTEXT.md decisions.
 *
 * Plan 14-08 owns the elevator section. Plan 14-09 will ADD a deck section
 * below — keep the elevator block intact and append, do not merge.
 *
 * Run: npx tsx scripts/verify-pitch-types.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveSessionConfig } from "../lib/engine/resolve";
import { ENGINE_TYPES, getEngineType } from "../lib/engine/registry";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import { resolveTermination } from "../lib/engine/termination";
import {
  clampAdjustableBudget,
  computeTimeBudgetState,
} from "../lib/engine/time-budget";
import type { InstanceConfig } from "../lib/engine/types";
import { applyVisibleContext } from "../lib/engine/visible-context";
import {
  buildDeckEvaluationImages,
  buildDeckSystemPrompt,
} from "../lib/pitch/deck-prompts";
import { PITCH_DECK_TYPE } from "../lib/pitch/deck-type";
import {
  ELEVATOR_LISTENER_PERSONA,
  buildElevatorSystemPrompt,
} from "../lib/pitch/elevator-prompts";
import { proposeDeckSeconds } from "../lib/pitch/session-length";
import {
  SLIDES_CHANNEL_KEY,
  buildSlidesChannel,
} from "../lib/pitch/slides-channel";
import type { ScoreMap } from "../lib/report/snapshot";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const ROOT = resolve(__dirname, "..");

// =============================================================================
// ELEVATOR (plan 14-08) — plan 14-09 appends a DECK section after this block
// =============================================================================

console.log("\n=== Elevator (pitch-elevator) ===\n");

const elevatorInstance = {
  kind: "pitch-elevator" as const,
  pitchSubject: "a reusable coffee cup subscription",
  listenerKnowledge: "blind" as const,
};

console.log("1. resolveSessionConfig with instance");
{
  const result = resolveSessionConfig("pitch-elevator", {
    instance: elevatorInstance,
  });
  check("ok === true", result.ok === true, JSON.stringify(result));
}

console.log("\n2. instance.required is honored");
{
  const result = resolveSessionConfig("pitch-elevator", undefined);
  check(
    "ok === false without instance",
    result.ok === false,
    JSON.stringify(result),
  );
}

console.log("\n3. Six rubric dimensions in locked order (REQ-72)");
{
  const result = resolveSessionConfig("pitch-elevator", {
    instance: elevatorInstance,
  });
  if (!result.ok) {
    check("resolve succeeded for rubric check", false, JSON.stringify(result));
  } else {
    const keys = result.config.rubricDimensions.map((d) => d.key);
    check(
      'keys === ["visual","vocal","content","behavioral","discovery_tailoring","concision"]',
      JSON.stringify(keys) ===
        JSON.stringify([
          "visual",
          "vocal",
          "content",
          "behavioral",
          "discovery_tailoring",
          "concision",
        ]),
      JSON.stringify(keys),
    );
    check("visual present", keys.includes("visual"));
    check("vocal present", keys.includes("vocal"));
  }
}

console.log("\n4. buildRubricJsonSchema includes extras, visual/vocal, outcome");
{
  const result = resolveSessionConfig("pitch-elevator", {
    instance: elevatorInstance,
  });
  if (!result.ok) {
    check("resolve for schema", false);
  } else {
    const schema = buildRubricJsonSchema(result.config);
    const required = schema.schema.required;
    check(
      "discovery_tailoring_score in required[]",
      required.includes("discovery_tailoring_score"),
    );
    check("concision_score in required[]", required.includes("concision_score"));
    check("visual_score in required[]", required.includes("visual_score"));
    check("vocal_score in required[]", required.includes("vocal_score"));
    check("outcome in required[]", required.includes("outcome"));
    const outcome = schema.schema.properties.outcome as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    check(
      "outcome has earlyEndReasons",
      Boolean(outcome?.properties?.earlyEndReasons),
    );
    check(
      "outcome has commonGroundFound",
      Boolean(outcome?.properties?.commonGroundFound),
    );
  }
}

console.log("\n5. System prompt is session-constant; persona always present");
{
  const levels = ["blind", "name-role", "full-profile"] as const;
  const prompts: string[] = [];

  for (const level of levels) {
    const result = resolveSessionConfig("pitch-elevator", {
      instance: { ...elevatorInstance, listenerKnowledge: level },
    });
    if (!result.ok) {
      check(`resolve for ${level}`, false);
      continue;
    }
    const a = buildElevatorSystemPrompt(result.config);
    const b = buildElevatorSystemPrompt(result.config);
    check(`${level}: byte-identical across two builds`, a === b);
    prompts.push(a);

    const personaText = ELEVATOR_LISTENER_PERSONA.name;
    check(
      `${level}: persona name present`,
      a.includes(personaText),
      `missing ${personaText}`,
    );
    check(
      `${level}: persona role present`,
      a.includes(ELEVATOR_LISTENER_PERSONA.role),
    );
  }

  check(
    "disclosure instruction differs across knowledge levels",
    prompts.length === 3 &&
      prompts[0] !== prompts[1] &&
      prompts[1] !== prompts[2] &&
      prompts[0] !== prompts[2],
  );
  check(
    "blind disclosure present",
    prompts[0]?.includes("The student knows nothing about you") === true,
  );
  check(
    "name-role disclosure present",
    prompts[1]?.includes("name and role only") === true,
  );
  check(
    "full-profile disclosure present",
    prompts[2]?.includes("read your profile") === true,
  );
}

console.log("\n6. Avatar-end floor");
{
  const type = getEngineType("pitch-elevator");
  const policy = type!.terminationPolicy;

  const below = resolveTermination({
    policy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 1,
  });
  check(
    "assistantTurnCount:1 + lost_interest REJECTED",
    below.ok === false && below.recordedReason === null,
    JSON.stringify(below),
  );

  const atFloor = resolveTermination({
    policy,
    source: "avatar",
    reason: "lost_interest",
    assistantTurnCount: 2,
  });
  check(
    "assistantTurnCount:2 + lost_interest ACCEPTED",
    atFloor.ok === true && atFloor.recordedReason === "lost_interest",
    JSON.stringify(atFloor),
  );

  const badReason = resolveTermination({
    policy,
    source: "avatar",
    reason: "bored",
    assistantTurnCount: 2,
  });
  check(
    'assistantTurnCount:2 + "bored" REJECTED',
    badReason.ok === false && badReason.recordedReason === null,
    JSON.stringify(badReason),
  );
}

console.log("\n7. No fixed follow-up count");
{
  const result = resolveSessionConfig("pitch-elevator", {
    instance: elevatorInstance,
  });
  if (!result.ok) {
    check("resolve for limits", false);
  } else {
    check(
      "targetQuestionCount === null",
      result.config.limits.targetQuestionCount === null,
    );
    check(
      "targetMinutes === null",
      result.config.limits.targetMinutes === null,
    );
  }
}

console.log("\n8. No hard cutoff; soft 60s window");
{
  const result = resolveSessionConfig("pitch-elevator", {
    instance: elevatorInstance,
  });
  if (!result.ok) {
    check("resolve for timeBudget", false);
  } else {
    check(
      "totalSeconds === null",
      result.config.timeBudget.totalSeconds === null,
    );
    check(
      "firstTurnWindowSeconds === 60",
      result.config.timeBudget.firstTurnWindowSeconds === 60,
    );

    const startedAt = new Date("2026-01-01T00:00:00Z");
    const state = computeTimeBudgetState({
      config: result.config.timeBudget,
      startedAt,
      now: new Date("2026-01-01T00:02:00Z"), // 120s
    });
    check(
      "120s elapsed → remainingSeconds === null",
      state.remainingSeconds === null,
      JSON.stringify(state),
    );
    check(
      "120s elapsed → expired === false",
      state.expired === false,
      JSON.stringify(state),
    );
  }
}

console.log("\n9. Cap wiring (postProcessScores on type record)");
{
  // Adaptation (14-04): postProcessScores lives on InteractionTypeConfig via
  // getEngineType, not on ResolvedSessionConfig.
  const type = getEngineType("pitch-elevator");
  check("postProcessScores is defined", typeof type?.postProcessScores === "function");

  const scores: ScoreMap = {
    visual: 5,
    vocal: 5,
    content: 5,
    behavioral: 5,
    discovery_tailoring: 5,
    concision: 5,
  };
  const capped = type!.postProcessScores!(scores, {
    terminationReason: "lost_interest",
    outcome: null,
  });
  check(
    "discovery_tailoring capped to 2",
    capped.discovery_tailoring === 2,
    JSON.stringify(capped),
  );
  check(
    "other dimensions still 5",
    capped.visual === 5 &&
      capped.vocal === 5 &&
      capped.content === 5 &&
      capped.behavioral === 5 &&
      capped.concision === 5,
    JSON.stringify(capped),
  );
}

console.log("\n10. Locked-decision text guards");
{
  const typeSrc = readFileSync(
    resolve(ROOT, "lib/pitch/elevator-type.ts"),
    "utf8",
  );
  const promptsSrc = readFileSync(
    resolve(ROOT, "lib/pitch/elevator-prompts.ts"),
    "utf8",
  );
  const combined = typeSrc + "\n" + promptsSrc;

  check("no difficulty", !/\bdifficulty\b/.test(combined));
  check("no engagementScore", !/engagementScore/.test(combined));
  check("no engagement_meter", !/engagement_meter/.test(combined));
  // "gauge" may appear only in the prompt line that FORBIDS a gauge (Task 1);
  // it must not appear as a mechanism on the type record.
  check("no gauge on type record", !/\bgauge\b/i.test(typeSrc));
  const gaugeLines = promptsSrc
    .split("\n")
    .filter((line) => /\bgauge\b/i.test(line));
  check(
    "gauge in prompts only on forbid lines",
    gaugeLines.length > 0 &&
      gaugeLines.every(
        (line) =>
          /no gauge/i.test(line) ||
          /do not.*gauge/i.test(line) ||
          /there is no.*gauge/i.test(line),
      ),
    JSON.stringify(gaugeLines),
  );
  const type = getEngineType("pitch-elevator")!;
  check("no pitchSubjects field on record", !("pitchSubjects" in type));
  check("no subjectOptions field on record", !("subjectOptions" in type));
  check(
    "no pitchSubjects/subjectOptions in source",
    !/pitchSubjects|subjectOptions/.test(combined),
  );
}

// =============================================================================
// DECK (plan 14-09) — append below; do not merge into the elevator block
// =============================================================================

console.log("\n=== Deck (pitch-deck) ===\n");

const deckSlideTexts = Array.from({ length: 10 }, (_, i) =>
  `UNIQUE_SLIDE_TEXT_${i}_ZZZ`,
);

const deckInstance: InstanceConfig = {
  kind: "pitch-deck",
  deckId: "verify-deck-id",
  slideCount: 10,
  slideTexts: deckSlideTexts,
  askPriceUsd: 2_500_000,
  askEquityPct: 12,
  fairValueBand: {
    priceUsdMin: 1_800_000,
    priceUsdMax: 2_200_000,
    equityPctMin: 10,
    equityPctMax: 15,
  },
  proposedSeconds: 1500,
};

console.log("1. resolveSessionConfig with / without instance");
{
  const withInstance = resolveSessionConfig("pitch-deck", {
    instance: deckInstance,
  });
  check("ok === true with instance", withInstance.ok === true, JSON.stringify(withInstance));

  const without = resolveSessionConfig("pitch-deck", undefined);
  check(
    "ok === false without instance",
    without.ok === false,
    JSON.stringify(without),
  );
}

console.log("\n2. Nine rubric dimensions in locked order (REQ-72)");
{
  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for rubric", false, JSON.stringify(result));
  } else {
    const keys = result.config.rubricDimensions.map((d) => d.key);
    const expected = [
      "visual",
      "vocal",
      "content",
      "behavioral",
      "deck_structure",
      "deck_text_density",
      "deck_visual_quality",
      "slide_speech_correlation",
      "negotiation",
    ];
    check(
      `keys === ${JSON.stringify(expected)}`,
      JSON.stringify(keys) === JSON.stringify(expected),
      JSON.stringify(keys),
    );
    check("visual present", keys.includes("visual"));
    check("vocal present", keys.includes("vocal"));
  }
}

console.log("\n3. buildRubricJsonSchema — extras + settled-only outcome");
{
  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for schema", false);
  } else {
    const schema = buildRubricJsonSchema(result.config);
    const required = schema.schema.required;
    for (const key of [
      "deck_structure_score",
      "deck_text_density_score",
      "deck_visual_quality_score",
      "slide_speech_correlation_score",
      "negotiation_score",
    ]) {
      check(`${key} in required[]`, required.includes(key));
    }
    check("outcome in required[]", required.includes("outcome"));

    const outcome = schema.schema.properties.outcome as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
      required?: string[];
    };
    const outcomeKeys = Object.keys(outcome?.properties ?? {}).sort();
    check(
      "outcome keys exactly settled terms",
      JSON.stringify(outcomeKeys) ===
        JSON.stringify(
          [
            "dealReached",
            "negotiationNotes",
            "settledEquityPct",
            "settledPriceUsd",
          ].sort(),
        ),
      JSON.stringify(outcomeKeys),
    );
    check(
      "outcome.additionalProperties === false",
      outcome?.additionalProperties === false,
    );
    check(
      "schema does NOT contain askPriceUsd",
      !("askPriceUsd" in (outcome?.properties ?? {})) &&
        !("askPriceUsd" in schema.schema.properties),
    );
    check(
      "schema does NOT contain askEquityPct",
      !("askEquityPct" in (outcome?.properties ?? {})) &&
        !("askEquityPct" in schema.schema.properties),
    );
    const schemaJson = JSON.stringify(schema);
    check(
      "schema does NOT contain any fair* field",
      !/"fair[^"]*"\s*:/.test(schemaJson) && !schemaJson.includes("fairValue"),
      schemaJson.slice(0, 200),
    );
  }
}

console.log("\n4. Avatar cannot end the meeting");
{
  const policy = PITCH_DECK_TYPE.terminationPolicy;
  const attempts = [
    { reason: "out_of_time", turns: 0 },
    { reason: "out_of_time", turns: 99 },
    { reason: "lost_interest", turns: 5 },
    { reason: "deal_done", turns: 10 },
  ];
  for (const a of attempts) {
    const result = resolveTermination({
      policy,
      source: "avatar",
      reason: a.reason,
      assistantTurnCount: a.turns,
    });
    check(
      `avatar end reason="${a.reason}" turns=${a.turns} REJECTED`,
      result.ok === false && result.recordedReason === null,
      JSON.stringify(result),
    );
  }
  check("avatarMayEnd === false", policy.avatarMayEnd === false);
}

console.log("\n5. System prompt is session-constant; ask+fair present; no slide text");
{
  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for prompt", false);
  } else {
    const a = buildDeckSystemPrompt(result.config);
    const b = buildDeckSystemPrompt(result.config);
    check("byte-identical across two builds", a === b);
    check("contains ask price", a.includes("2500000") || a.includes("2,500,000") || a.includes("$2500000"));
    check("contains ask equity", a.includes("12%"));
    check(
      "contains fair band prices",
      a.includes("1800000") && a.includes("2200000"),
    );
    check(
      "contains fair band equity",
      a.includes("10-15%") || (a.includes("10") && a.includes("15%")),
    );
    for (const text of deckSlideTexts) {
      check(`no slide text "${text}"`, !a.includes(text));
    }
  }
}

console.log("\n6. High-water-mark gating through applyVisibleContext");
{
  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for visible context", false);
  } else {
    const channel = buildSlidesChannel(deckSlideTexts);
    const sessionState = { [SLIDES_CHANNEL_KEY]: channel };
    const first = applyVisibleContext(
      result.config.visibleContext,
      sessionState,
      { cursors: { [SLIDES_CHANNEL_KEY]: 3 } },
    );
    const admitted = first[SLIDES_CHANNEL_KEY] as { index: number; text: string }[];
    check(
      "cursor 3 admits slides 0-3",
      Array.isArray(admitted) &&
        admitted.length === 4 &&
        admitted.every((e, i) => e.index === i && e.text === deckSlideTexts[i]),
      JSON.stringify(admitted?.map((e) => e.index)),
    );
    for (let i = 4; i < 10; i += 1) {
      check(
        `slide ${i} text ABSENT at cursor 3`,
        !JSON.stringify(first).includes(deckSlideTexts[i]!),
      );
    }
    // Notional backward navigation — same cursor 3 again; identical result.
    const second = applyVisibleContext(
      result.config.visibleContext,
      sessionState,
      { cursors: { [SLIDES_CHANNEL_KEY]: 3 } },
    );
    check(
      "second call with cursor 3 is identical (no current-slide regression)",
      JSON.stringify(first) === JSON.stringify(second),
    );
  }
}

console.log("\n7. No parallel gating mechanism in lib/pitch/");
{
  const pitchDir = resolve(ROOT, "lib/pitch");
  const files = readdirSync(pitchDir).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    // slides-channel: channel adapter only. slide-reveal (14-11): the one
    // live ratchet + applyVisibleContext call site — not a parallel filter.
    if (file === "slides-channel.ts" || file === "slide-reveal.ts") continue;
    const src = readFileSync(join(pitchDir, file), "utf8");
    // deck-prompts may name slideHighWaterMark / "high-water" for post-session
    // eval bounding only — not a live gate. elevator-type's 14-08 comment
    // ("no cursor to persist") is grandfathered.
    if (file === "deck-prompts.ts") {
      check(
        `${file}: no turn.cursors / highWaterMark live-gate API`,
        !/\bcursors?\s*:/.test(src) && !/\bhighWaterMark\b/.test(src),
      );
      continue;
    }
    if (file === "elevator-type.ts") continue;
    check(
      `${file}: no cursor/high-water gating concept`,
      !/\bcursors?\b/.test(src) &&
        !/\bhighWaterMark\b/.test(src) &&
        !/\bhigh-water\b/i.test(src) &&
        !/slideHighWaterMark/.test(src),
    );
  }

  const slidesSrc = readFileSync(join(pitchDir, "slides-channel.ts"), "utf8");
  check(
    "slides-channel.ts has no .filter( on channel",
    !/\.filter\s*\(/.test(slidesSrc),
  );
  check(
    "slides-channel.ts has no .slice( on channel",
    !/\.slice\s*\(/.test(slidesSrc),
  );
}

console.log("\n8. Session-length proposal and clamp");
{
  check("proposeDeckSeconds(5) === 1200", proposeDeckSeconds(5) === 1200);
  check("proposeDeckSeconds(8) === 1200", proposeDeckSeconds(8) === 1200);
  check("proposeDeckSeconds(25) === 1800", proposeDeckSeconds(25) === 1800);
  check("proposeDeckSeconds(60) === 1800", proposeDeckSeconds(60) === 1800);
  const mid = proposeDeckSeconds(16);
  check(
    "proposeDeckSeconds(16) between on 60s boundary",
    mid > 1200 && mid < 1800 && mid % 60 === 0,
    String(mid),
  );

  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for clamp", false);
  } else {
    const tb = result.config.timeBudget;
    check(
      "clampAdjustableBudget(600).seconds === 1200",
      clampAdjustableBudget(tb, 600).seconds === 1200,
    );
    check(
      "clampAdjustableBudget(2400).seconds === 1800",
      clampAdjustableBudget(tb, 2400).seconds === 1800,
    );
    check(
      "clampAdjustableBudget(1500).seconds === 1500",
      clampAdjustableBudget(tb, 1500).seconds === 1500,
    );
  }
}

console.log("\n9. Soft envelope — expired does not instruct a stop");
{
  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for soft envelope", false);
  } else {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const state = computeTimeBudgetState({
      config: { ...result.config.timeBudget, totalSeconds: 1800 },
      startedAt,
      now: new Date(startedAt.getTime() + 2400 * 1000),
    });
    check(
      "2400s vs 1800 budget → remainingSeconds === 0",
      state.remainingSeconds === 0,
      JSON.stringify(state),
    );
    check("expired === true", state.expired === true, JSON.stringify(state));
    check(
      "PITCH_DECK_TYPE.terminationPolicy.avatarMayEnd === false",
      PITCH_DECK_TYPE.terminationPolicy.avatarMayEnd === false,
    );
    // Nothing in the returned state instructs a stop.
    check(
      "TimeBudgetState has no hardStop / shouldEnd / forceEnd",
      !("hardStop" in state) &&
        !("shouldEnd" in state) &&
        !("forceEnd" in state),
    );
  }
}

console.log("\n10. Images from thumb variant, bounded by high-water mark");

async function verifyDeckImages(): Promise<void> {
  const result = resolveSessionConfig("pitch-deck", { instance: deckInstance });
  if (!result.ok) {
    check("resolve for images", false);
    return;
  }
  const calls: Array<{
    userId: string;
    deckId: string;
    index: number;
    variant: string;
  }> = [];
  const images = await buildDeckEvaluationImages({
    config: result.config,
    userId: "user-verify",
    slideHighWaterMark: 4,
    loadSlideImage: async (userId, deckId, index, variant) => {
      calls.push({ userId, deckId, index, variant });
      return {
        body: Buffer.from(`png-${index}`),
        contentType: "image/png",
      };
    },
  });
  check("exactly 5 images requested", calls.length === 5, JSON.stringify(calls));
  check(
    'all variant "thumb"',
    calls.every((c) => c.variant === "thumb"),
    JSON.stringify(calls.map((c) => c.variant)),
  );
  check(
    'labels "slide 1".."slide 5"',
    images.length === 5 &&
      images.every((img, i) => img.label === `slide ${i + 1}`),
    JSON.stringify(images.map((i) => i.label)),
  );
  check(
    "indices 0..4",
    JSON.stringify(calls.map((c) => c.index)) === JSON.stringify([0, 1, 2, 3, 4]),
  );
}

void verifyDeckImages().then(() => {
  console.log("\n11. All ENGINE_TYPES still resolve with visual+vocal");
  {
    function instanceFor(typeSlug: string): InstanceConfig | undefined {
      const type = getEngineType(typeSlug);
      if (!type?.instance.required) return { kind: "none" };
      if (typeSlug === "case-study") {
        return {
          kind: "case-study",
          caseId: "v",
          caseName: "V",
          background: "bg",
          avatars: [{ name: "A", role: "R" }],
          criteria: null,
        };
      }
      if (typeSlug === "pitch-elevator") {
        return {
          kind: "pitch-elevator",
          pitchSubject: "x",
          listenerKnowledge: "blind",
        };
      }
      if (typeSlug === "pitch-deck") return deckInstance;
      if (typeSlug === "difficult-conversation") {
        return {
          kind: "difficult-conversation",
          conversationId: "v",
          source: "seeded",
          role: "R",
          studentRole: "S",
          situation: "sit",
          sharedBackstory: "shared",
          hiddenPosition: "hidden",
          studentObjective: "obj",
          stakes: "stakes",
          difficulty: "guarded",
          avatarId: "a",
          voiceId: "v",
        };
      }
      return { kind: "none" };
    }

    for (const type of ENGINE_TYPES) {
      const resolved = resolveSessionConfig(type.slug, {
        instance: instanceFor(type.slug),
      });
      check(
        `${type.slug} resolves ok`,
        resolved.ok === true,
        JSON.stringify(resolved),
      );
      if (resolved.ok) {
        const keys = resolved.config.rubricDimensions.map((d) => d.key);
        check(`${type.slug} has visual`, keys.includes("visual"));
        check(`${type.slug} has vocal`, keys.includes("vocal"));
      }
    }
  }

  console.log(
    `\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} (elevator + deck)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
});

