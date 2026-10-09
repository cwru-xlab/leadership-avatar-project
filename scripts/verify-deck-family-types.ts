/**
 * Plan 19-04: prove the per-mode TYPE records for every REGISTERED deck mode
 * resolve through the one shared engine, declare their own rubric and
 * outcome, and keep the negotiation concept absent except on `pitch-deck`.
 *
 * Iterates `listDeckModes()` and SKIPS modes not yet registered in
 * `ENGINE_TYPES`, so plan 19-05 extends this script's coverage simply by
 * registering `pitch-talk` and `pitch-general` — no edit to this file.
 *
 * Style mirrors scripts/verify-deck-mode-table.ts /
 * scripts/verify-pitch-surface-count.ts.
 *
 * Run: npx tsx scripts/verify-deck-family-types.ts
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getEngineType } from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import { SHARED_RUBRIC_DIMENSION_KEYS, type InstanceConfig } from "../lib/engine/types";
import { SHARED_DECK_DIMENSIONS } from "../lib/pitch/deck-rubric";
import { DECK_VISIBLE_CONTEXT } from "../lib/pitch/slides-channel";
import {
  type DeckMode,
  type DeckModeInputs,
  type DeckModeSlug,
  listDeckModes,
} from "../lib/pitch/deck-modes";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string): void {
  console.log(`  FAIL ${msg}`);
  failures += 1;
}

function ok(msg: string): void {
  console.log(`  ok   ${msg}`);
}

function check(name: string, pass: boolean, detail?: string): void {
  if (pass) {
    ok(name);
  } else {
    fail(`${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("verify-deck-family-types: checking every registered deck mode\n");

// The *-type.ts / *-prompts.ts file-prefix for each mode's source files.
const FILE_PREFIX: Record<DeckModeSlug, string> = {
  "pitch-deck": "deck",
  "pitch-funding": "funding",
  "pitch-product": "product",
  "pitch-talk": "talk",
  "pitch-general": "general",
};

/**
 * One synthetic modeInputs fixture per mode, NO negotiation fields anywhere
 * — only `pitch-deck` ever carries askPriceUsd/askEquityPct/fairValueBand,
 * and this script never sets them.
 */
function syntheticModeInputs(slug: DeckModeSlug): DeckModeInputs | undefined {
  if (slug === "pitch-funding") {
    return {
      mode: "pitch-funding",
      requestedAmountUsd: 50_000,
      useOfFunds: "Six months of runway for a pilot cohort.",
    };
  }
  if (slug === "pitch-product") {
    return { mode: "pitch-product", buyerProfile: "VP of Ops at a mid-market SaaS co" };
  }
  if (slug === "pitch-talk") {
    return {
      mode: "pitch-talk",
      talkAudience: "A campus sustainability conference",
      talkTakeaway: "Reuse beats recycling for carbon payback.",
    };
  }
  return undefined;
}

function syntheticInstance(mode: DeckMode): InstanceConfig {
  return {
    kind: "pitch-deck",
    deckId: `verify-deck-family-${mode.slug}`,
    slideCount: 5,
    slideTexts: ["S1", "S2", "S3", "S4", "S5"],
    proposedSeconds: mode.envelopeSeconds[0],
    modeInputs: syntheticModeInputs(mode.slug),
  };
}

const registeredModes = listDeckModes().filter(
  (mode) => getEngineType(mode.slug) !== null,
);

check(
  "at least pitch-deck, pitch-funding and pitch-product are registered",
  ["pitch-deck", "pitch-funding", "pitch-product"].every((slug) =>
    registeredModes.some((m) => m.slug === slug),
  ),
  `registered: ${registeredModes.map((m) => m.slug).join(", ")}`,
);

for (const mode of listDeckModes()) {
  const type = getEngineType(mode.slug);

  if (!type) {
    console.log(`\n(skipping ${mode.slug} — not yet registered)`);
    continue;
  }

  console.log(`\n${mode.slug}`);

  // 1. getEngineType resolves and the slug round-trips.
  check(`${mode.slug}: getEngineType resolves and type.slug matches`, type.slug === mode.slug);

  // 2. resolveSessionConfig succeeds; rubric dimensions are exactly
  //    [shared four, ...SHARED_DECK_DIMENSIONS keys, ...mode distinctive keys].
  const instance = syntheticInstance(mode);
  const result = resolveSessionConfig(mode.slug, { instance });

  check(`${mode.slug}: resolveSessionConfig succeeds`, result.ok, result.ok ? undefined : result.reason);

  const expectedDimensionKeys = [
    ...SHARED_RUBRIC_DIMENSION_KEYS,
    ...SHARED_DECK_DIMENSIONS.map((d) => d.key),
    ...mode.distinctiveDimensionKeys,
  ];

  if (result.ok) {
    const actualDimensionKeys = result.config.rubricDimensions.map((d) => d.key);
    check(
      `${mode.slug}: resolved rubricDimensions match [shared four, shared deck four, mode distinctive]`,
      JSON.stringify(actualDimensionKeys) === JSON.stringify(expectedDimensionKeys),
      `expected: ${expectedDimensionKeys.join(", ")}\n         got: ${actualDimensionKeys.join(", ")}`,
    );

    // 3. negotiation appears in dimension keys ONLY for pitch-deck.
    const hasNegotiation = actualDimensionKeys.includes("negotiation");
    check(
      `${mode.slug}: "negotiation" present iff pitch-deck`,
      hasNegotiation === (mode.slug === "pitch-deck"),
    );

    // 4. outcome.fields keys equal mode.outcomeFieldKeys; empty iff no outcome panel.
    const outcomeKeys = type.outcome.fields.map((f) => f.key);
    check(
      `${mode.slug}: outcome.fields keys equal mode.outcomeFieldKeys`,
      JSON.stringify(outcomeKeys) === JSON.stringify(mode.outcomeFieldKeys),
      `expected: ${mode.outcomeFieldKeys.join(", ")}\n         got: ${outcomeKeys.join(", ")}`,
    );
    check(
      `${mode.slug}: outcome.fields is empty iff hasOutcomePanel === false`,
      (outcomeKeys.length === 0) === (mode.hasOutcomePanel === false),
    );

    // 5. terminationPolicy: cannot walk out, dormant four-turn floor.
    check(
      `${mode.slug}: avatarMayEnd === false`,
      type.terminationPolicy.avatarMayEnd === false,
    );
    check(
      `${mode.slug}: avatarEndReasons is empty`,
      type.terminationPolicy.avatarEndReasons.length === 0,
    );
    check(
      `${mode.slug}: disengagementThreshold is null/omitted`,
      type.terminationPolicy.disengagementThreshold == null,
    );
    check(
      `${mode.slug}: avatarEndFloor.minAssistantTurns >= 4`,
      (type.terminationPolicy.avatarEndFloor?.minAssistantTurns ?? 0) >= 4,
    );

    // 6. timeBudget.adjustableRangeSeconds equals mode.envelopeSeconds;
    //    visibleContext is the shared DECK_VISIBLE_CONTEXT object identity.
    check(
      `${mode.slug}: timeBudget.adjustableRangeSeconds equals mode.envelopeSeconds`,
      JSON.stringify(type.timeBudget.adjustableRangeSeconds) ===
        JSON.stringify(mode.envelopeSeconds),
      `expected: ${JSON.stringify(mode.envelopeSeconds)}\n         got: ${JSON.stringify(type.timeBudget.adjustableRangeSeconds)}`,
    );
    check(
      `${mode.slug}: visibleContext is DECK_VISIBLE_CONTEXT (identity)`,
      type.visibleContext === DECK_VISIBLE_CONTEXT,
    );

    // 7. setupSteps: deck-upload, session-length, interviewer all present;
    //    mode's modeInputStepId present iff non-null; no camera step;
    //    negotiation-ask ONLY for pitch-deck.
    const stepIds = type.setupSteps.map((s) => s.id);
    check(
      `${mode.slug}: setupSteps contains deck-upload, session-length, interviewer`,
      ["deck-upload", "session-length", "interviewer"].every((id) =>
        stepIds.includes(id),
      ),
      `got: ${stepIds.join(", ")}`,
    );
    check(
      `${mode.slug}: setupSteps contains mode.modeInputStepId exactly when non-null`,
      mode.modeInputStepId == null
        ? !stepIds.includes(mode.modeInputStepId as unknown as string)
        : stepIds.includes(mode.modeInputStepId),
    );
    check(
      `${mode.slug}: setupSteps contains no "camera" step`,
      !stepIds.some((id) => id.toLowerCase().includes("camera")),
    );
    check(
      `${mode.slug}: setupSteps contains "negotiation-ask" iff pitch-deck`,
      stepIds.includes("negotiation-ask") === (mode.slug === "pitch-deck"),
    );

    // 8. instance + checkpointing shape.
    check(
      `${mode.slug}: instance is { required: true, authoredInWizard: true }`,
      type.instance.required === true && type.instance.authoredInWizard === true,
    );
    check(
      `${mode.slug}: checkpointing === "client-driven"`,
      type.checkpointing === "client-driven",
    );

    // 10. buildRubricJsonSchema produces a schema whose required score keys
    //     match the resolved dimensions.
    try {
      const schema = buildRubricJsonSchema(result.config);
      const expectedScoreKeys = actualDimensionKeys.map((k) => `${k}_score`);
      const requiredScoreKeys = schema.schema.required.filter((k: string) =>
        k.endsWith("_score"),
      );
      check(
        `${mode.slug}: buildRubricJsonSchema required score keys match resolved dimensions`,
        JSON.stringify(requiredScoreKeys.sort()) ===
          JSON.stringify(expectedScoreKeys.sort()),
        `expected: ${expectedScoreKeys.join(", ")}\n         got: ${requiredScoreKeys.join(", ")}`,
      );
    } catch (error) {
      fail(
        `${mode.slug}: buildRubricJsonSchema threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 9. Source-text check for negotiation absence — non-investor modes only.
  if (mode.slug !== "pitch-deck") {
    const prefix = FILE_PREFIX[mode.slug];
    const typeFile = join(ROOT, "lib", "pitch", `${prefix}-type.ts`);
    const promptsFile = join(ROOT, "lib", "pitch", `${prefix}-prompts.ts`);

    let sourceText = "";
    try {
      sourceText = [readFileSync(typeFile, "utf8"), readFileSync(promptsFile, "utf8")].join(
        "\n",
      );
    } catch (error) {
      fail(
        `${mode.slug}: could not read ${prefix}-type.ts / ${prefix}-prompts.ts: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    const forbidden = ["askPriceUsd", "askEquityPct", "fairValueBand"];
    for (const token of forbidden) {
      check(
        `${mode.slug}: source text contains no "${token}"`,
        !sourceText.includes(token),
      );
    }
    check(
      `${mode.slug}: source text contains no case-insensitive "equity"`,
      !/equity/i.test(sourceText),
    );
  }
}

console.log("");
if (failures === 0) {
  console.log("verify-deck-family-types: ALL PASS\n");
  process.exit(0);
} else {
  console.log(`verify-deck-family-types: FAILED (${failures} failure(s))\n`);
  process.exit(1);
}
