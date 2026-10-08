/**
 * Proves the Phase 19 plan 19-02 shared-plumbing widening with fixed
 * fixtures only — no Prisma, no network. Run:
 *   npx tsx scripts/verify-deck-family-plumbing.ts
 *
 * Asserts:
 *   1. Absence, not zero — a non-negotiating instance's ask/equity/band are
 *      MISSING from `pitchSnapshotFromInstance`'s output and from the
 *      instance itself (`Object.hasOwn`), not present-and-zero.
 *   2. `resolveDeckFairValueBand` returns a band for the one negotiating
 *      mode and `null` for every non-negotiating mode.
 *   3. Reconstruction without an ask — a deck snapshot with no ask/equity
 *      still reconstructs into an instance carrying `modeInputs`.
 *   4. Back-compatibility — a snapshot shaped exactly like a pre-Phase-19
 *      stored row (no `deckModeInputs` key at all) still narrows through
 *      `asInputSnapshot`.
 *   5. A malformed `deckModeInputs` (string / array / unknown mode) still
 *      narrows, degraded to `null`.
 *   6. The investor path is unchanged end-to-end.
 *   7. No new `InstanceConfig` kind literal exists in `lib/engine/types.ts`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { pitchSnapshotFromInstance } from "../lib/engine/session";
import { instanceFromPitchSnapshot } from "../lib/engine/evaluation-runner";
import { resolveDeckFairValueBand } from "../lib/pitch/fair-value-band";
import { asInputSnapshot, type PitchInputSnapshot } from "../lib/report/snapshot";
import type { InstanceConfig } from "../lib/engine/types";
import type { DeckManifest } from "../lib/deck/store";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type PitchDeckInstance = Extract<InstanceConfig, { kind: "pitch-deck" }>;

function nonNegotiatingDeckInstance(): PitchDeckInstance {
  return {
    kind: "pitch-deck",
    deckId: "deck-fixture-1",
    slideCount: 5,
    slideTexts: ["s0", "s1", "s2", "s3", "s4"],
    proposedSeconds: 900,
    modeInputs: { mode: "pitch-product", buyerProfile: "VP of Ops at a mid-market SaaS co" },
  };
}

function investorDeckInstance(): PitchDeckInstance {
  return {
    kind: "pitch-deck",
    deckId: "deck-fixture-2",
    slideCount: 8,
    slideTexts: Array.from({ length: 8 }, (_, i) => `slide-${i}`),
    askPriceUsd: 1_000_000,
    askEquityPct: 10,
    fairValueBand: {
      priceUsdMin: 800_000,
      priceUsdMax: 1_200_000,
      equityPctMin: 8,
      equityPctMax: 12,
    },
    proposedSeconds: 1500,
  };
}

const stubManifestLoader = async (
  _userId: string,
  _deckId: string,
): Promise<DeckManifest | null> => null;

// ---------------------------------------------------------------------------
// 1. Absence, not zero
// ---------------------------------------------------------------------------

console.log("\n1. Absence, not zero");
{
  const instance = nonNegotiatingDeckInstance();
  check(
    "fixture instance has no own askPriceUsd",
    Object.hasOwn(instance, "askPriceUsd") === false,
  );
  check(
    "fixture instance has no own askEquityPct",
    Object.hasOwn(instance, "askEquityPct") === false,
  );
  check(
    "fixture instance has no own fairValueBand",
    Object.hasOwn(instance, "fairValueBand") === false,
  );

  const snapshot = pitchSnapshotFromInstance(instance, 900);
  check("snapshot is non-null", snapshot !== null);
  check("snapshot.askPriceUsd === null", snapshot?.askPriceUsd === null);
  check("snapshot.askEquityPct === null", snapshot?.askEquityPct === null);
  check("snapshot.fairValueBand === null", snapshot?.fairValueBand === null);
}

// ---------------------------------------------------------------------------
// 2. Mode-aware band resolution
// ---------------------------------------------------------------------------

console.log("\n2. Mode-aware band resolution");
{
  check(
    "resolveDeckFairValueBand('pitch-deck') returns a band",
    resolveDeckFairValueBand("pitch-deck") !== null,
  );
  for (const slug of ["pitch-funding", "pitch-product", "pitch-talk", "pitch-general"]) {
    check(
      `resolveDeckFairValueBand('${slug}') returns null`,
      resolveDeckFairValueBand(slug) === null,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Reconstruction without an ask
// ---------------------------------------------------------------------------

console.log("\n3. Reconstruction without an ask");
{
  const snapshot: PitchInputSnapshot = {
    kind: "pitch",
    pitchKind: "deck",
    pitchSubject: null,
    listenerKnowledge: null,
    deckId: "deck-fixture-1",
    slideCount: 5,
    askPriceUsd: null,
    askEquityPct: null,
    fairValueBand: null,
    firstTurnWindowSeconds: null,
    budgetSeconds: 900,
    listenerPersona: null,
    deckModeInputs: { mode: "pitch-product", buyerProfile: "VP of Ops" },
  };

  instanceFromPitchSnapshot(
    snapshot,
    "user-fixture",
    "pitch-product",
    stubManifestLoader,
  ).then((instance) => {
    check("instance reconstructs (not null)", instance !== null);
    check(
      "instance carries modeInputs",
      instance !== null &&
        "modeInputs" in instance &&
        (instance as { modeInputs?: unknown }).modeInputs !== undefined &&
        JSON.stringify((instance as { modeInputs?: unknown }).modeInputs) ===
          JSON.stringify(snapshot.deckModeInputs),
    );
    check(
      "instance has no own askPriceUsd",
      instance !== null && Object.hasOwn(instance, "askPriceUsd") === false,
    );
    check(
      "instance has no own fairValueBand (non-negotiating mode)",
      instance !== null && Object.hasOwn(instance, "fairValueBand") === false,
    );

    runRemainingSections();
  });
}

// ---------------------------------------------------------------------------
// Sections 4-7 run after the async section 3 resolves.
// ---------------------------------------------------------------------------

function runRemainingSections() {
  // -------------------------------------------------------------------------
  // 4. Back-compatibility — exactly today's PITCH_INPUT_KEYS, no deckModeInputs
  // -------------------------------------------------------------------------
  console.log("\n4. Back-compatibility (pre-Phase-19 stored-row shape)");
  {
    const preExistingRow = {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-legacy",
      slideCount: 6,
      askPriceUsd: 500_000,
      askEquityPct: 5,
      fairValueBand: {
        priceUsdMin: 400_000,
        priceUsdMax: 600_000,
        equityPctMin: 4,
        equityPctMax: 6,
      },
      firstTurnWindowSeconds: null,
      budgetSeconds: 1200,
      listenerPersona: null,
      // Deliberately NO deckModeInputs key — this is the pre-Phase-19 shape.
    };

    check(
      "pre-existing row has no deckModeInputs key",
      !("deckModeInputs" in preExistingRow),
    );

    const narrowed = asInputSnapshot(preExistingRow);
    check("pre-existing row still narrows (not null)", narrowed !== null);
    check(
      "narrowed snapshot preserves deckId",
      narrowed !== null &&
        narrowed.kind === "pitch" &&
        narrowed.deckId === "deck-legacy",
    );
  }

  // -------------------------------------------------------------------------
  // 5. Malformed deckModeInputs degrades to null
  // -------------------------------------------------------------------------
  console.log("\n5. Malformed deckModeInputs degrades to null");
  {
    const base = {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-malformed",
      slideCount: 4,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: null,
      budgetSeconds: 600,
      listenerPersona: null,
    };

    for (const [label, badValue] of [
      ["a string", "not-an-object"],
      ["an array", ["a", "b"]],
      ["an object with an unknown mode", { mode: "pitch-unknown-slug" }],
    ] as const) {
      const row = { ...base, deckModeInputs: badValue };
      const narrowed = asInputSnapshot(row);
      check(`${label} still narrows (not null)`, narrowed !== null);
      check(
        `${label} degrades deckModeInputs to null`,
        narrowed !== null &&
          narrowed.kind === "pitch" &&
          (narrowed as PitchInputSnapshot).deckModeInputs === null,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 6. Investor path unchanged
  // -------------------------------------------------------------------------
  console.log("\n6. Investor path unchanged");
  {
    const investorInstance = investorDeckInstance();
    const snapshot = pitchSnapshotFromInstance(investorInstance, 1500);
    check("investor snapshot non-null", snapshot !== null);
    check(
      "investor snapshot carries askPriceUsd",
      snapshot?.askPriceUsd === 1_000_000,
    );
    check(
      "investor snapshot carries askEquityPct",
      snapshot?.askEquityPct === 10,
    );
    check(
      "investor snapshot carries fairValueBand",
      JSON.stringify(snapshot?.fairValueBand) ===
        JSON.stringify(investorInstance.fairValueBand),
    );

    instanceFromPitchSnapshot(
      { ...snapshot!, kind: "pitch" },
      "user-fixture",
      "pitch-deck",
      stubManifestLoader,
    ).then((reconstructed) => {
      check("investor instance reconstructs", reconstructed !== null);
      check(
        "investor instance carries same askPriceUsd",
        reconstructed !== null &&
          "askPriceUsd" in reconstructed &&
          (reconstructed as { askPriceUsd?: number }).askPriceUsd === 1_000_000,
      );
      check(
        "investor instance carries same askEquityPct",
        reconstructed !== null &&
          "askEquityPct" in reconstructed &&
          (reconstructed as { askEquityPct?: number }).askEquityPct === 10,
      );
      check(
        "investor instance carries a band",
        reconstructed !== null &&
          reconstructed.kind === "pitch-deck" &&
          "fairValueBand" in reconstructed &&
          reconstructed.fairValueBand !== undefined,
      );

      runSection7AndFinish();
    });
  }
}

// ---------------------------------------------------------------------------
// 7. No new InstanceConfig kind exists
// ---------------------------------------------------------------------------

function runSection7AndFinish() {
  console.log("\n7. No new InstanceConfig kind");
  {
    const typesSource = fs.readFileSync(
      path.join(__dirname, "..", "lib", "engine", "types.ts"),
      "utf8",
    );
    for (const slug of ["pitch-funding", "pitch-product", "pitch-talk", "pitch-general"]) {
      check(
        `no 'kind: "${slug}"' literal in lib/engine/types.ts`,
        !typesSource.includes(`kind: "${slug}"`),
      );
    }
  }

  console.log(`\n=== RESULT ===`);
  if (failures === 0) {
    console.log("ALL PASS");
    process.exit(0);
  } else {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
}
