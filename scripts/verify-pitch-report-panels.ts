/**
 * Fixture render checks for pitch report panels (plan 14-14 Task 2).
 * Run: npx tsx scripts/verify-pitch-report-panels.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PitchOutcomeBanner, {
  PITCH_EARLY_END_OUTCOME_NAMES,
} from "../components/practice/report/PitchOutcomeBanner";
import NegotiationTriplePanel from "../components/practice/report/NegotiationTriplePanel";
import DeckTimelinePanel from "../components/practice/report/DeckTimelinePanel";
import type { ReportDTO } from "../lib/report/dto";

let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "ok" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

function baseElevator(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    id: "rep-elev",
    typeSlug: "pitch-elevator",
    title: null,
    status: "READY",
    turnCount: 6,
    scores: {
      visual: 3,
      vocal: 3,
      content: 4,
      behavioral: 3,
      discovery_tailoring: 2,
      concision: 3,
    },
    metrics: {
      cameraMode: null,
      visual: null,
      vocal: null,
      visualUnscored: null,
      vocalUnscored: null,
    },
    input: {
      kind: "pitch",
      pitchKind: "elevator",
      pitchSubject: "Last-mile routing SaaS",
      listenerKnowledge: "name-role",
      deckId: null,
      slideCount: null,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: 60,
      budgetSeconds: null,
      listenerPersona: null,
    },
    terminationReason: "lost_interest",
    terminationAtSeconds: 108,
    outcome: {
      earlyEndReasons: "They kept circling without answering what she cared about.",
      commonGroundFound: false,
    },
    slideHighWaterMark: null,
    slideReveals: null,
    timeBudgetSeconds: null,
    elapsedSeconds: 120,
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: null,
    startedAt: "2026-10-04T12:00:00.000Z",
    completedAt: "2026-10-04T12:02:00.000Z",
    ...overrides,
  };
}

function baseDeck(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    id: "rep-deck",
    typeSlug: "pitch-deck",
    title: null,
    status: "READY",
    turnCount: 20,
    scores: {
      visual: 4,
      vocal: 3,
      content: 4,
      behavioral: 4,
      deck_structure: 4,
      deck_text_density: 3,
      deck_visual_quality: 4,
      slide_speech_correlation: 3,
      negotiation: 4,
    },
    metrics: {
      cameraMode: null,
      visual: null,
      vocal: null,
      visualUnscored: null,
      vocalUnscored: null,
    },
    input: {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-1",
      slideCount: 18,
      askPriceUsd: 500_000,
      askEquityPct: 10,
      fairValueBand: {
        priceUsdMin: 400_000,
        priceUsdMax: 600_000,
        equityPctMin: 8,
        equityPctMax: 12,
      },
      firstTurnWindowSeconds: null,
      budgetSeconds: 1500,
      listenerPersona: null,
    },
    terminationReason: null,
    terminationAtSeconds: null,
    outcome: {
      dealReached: true,
      settledPriceUsd: 450_000,
      settledEquityPct: 11,
      negotiationNotes: "Settled after two rounds.",
    },
    slideHighWaterMark: 13,
    slideReveals: [
      { index: 0, atTurnIndex: 1, atElapsedSeconds: 30 },
      { index: 7, atTurnIndex: 8, atElapsedSeconds: 492 },
      { index: 13, atTurnIndex: 15, atElapsedSeconds: 900 },
    ],
    timeBudgetSeconds: 1500,
    elapsedSeconds: 1900,
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: null,
    startedAt: "2026-10-04T12:00:00.000Z",
    completedAt: "2026-10-04T12:31:40.000Z",
    ...overrides,
  };
}

console.log("\n1. Early end with reasons");
{
  const html = renderToStaticMarkup(
    React.createElement(PitchOutcomeBanner, { report: baseElevator() }),
  );
  check("named headline", html.includes(PITCH_EARLY_END_OUTCOME_NAMES.lost_interest));
  check("specific reasons", html.includes("circling without answering"));
  check("timecode", html.includes("Interest dropped around 1:48"));
  check("limited-evidence line", html.includes("limited evidence for Listener discovery"));
  check("not error-framed", !/something went wrong|failed evaluation|crash/i.test(html));
}

console.log("\n2. Early end with null reasons");
{
  const html = renderToStaticMarkup(
    React.createElement(PitchOutcomeBanner, {
      report: baseElevator({
        outcome: { earlyEndReasons: null, commonGroundFound: false },
      }),
    }),
  );
  check(
    "fallback copy",
    html.includes("feedback below explains what led here"),
  );
}

console.log("\n3. Deal inside the band");
{
  const html = renderToStaticMarkup(
    React.createElement(NegotiationTriplePanel, { report: baseDeck() }),
  );
  check("ask present", html.includes("Your ask") && html.includes("$500k"));
  check("settled present", html.includes("Settled") && html.includes("$450k"));
  check("fair range", html.includes("$400k–$600k") && html.includes("8%–12%"));
  check("inside label", html.includes("inside the range"));
  check("hidden-during-meeting copy", html.includes("Hidden from you during the meeting"));
}

console.log("\n4. Deal outside the band");
{
  const html = renderToStaticMarkup(
    React.createElement(NegotiationTriplePanel, {
      report: baseDeck({
        outcome: {
          dealReached: true,
          settledPriceUsd: 250_000,
          settledEquityPct: 15,
          negotiationNotes: null,
        },
      }),
    }),
  );
  check("below price", html.includes("below the range"));
  check("above equity", html.includes("above the range"));
}

console.log("\n5. No deal");
{
  const html = renderToStaticMarkup(
    React.createElement(NegotiationTriplePanel, {
      report: baseDeck({
        outcome: {
          dealReached: false,
          settledPriceUsd: null,
          settledEquityPct: null,
          negotiationNotes: null,
        },
      }),
    }),
  );
  check("No deal reached", html.includes("No deal reached"));
  check("not a zero", !html.includes("$0") && !/>\s*0\s*</.test(html));
}

console.log("\n6. Null reveal trail");
{
  const html = renderToStaticMarkup(
    React.createElement(DeckTimelinePanel, {
      report: baseDeck({ slideReveals: null, slideHighWaterMark: 4 }),
    }),
  );
  check("coverage from high-water", html.includes("5 of 18"));
  check("no timeline", !html.includes("Reveal timeline"));
  check("unshown slides", html.includes("Slides 6–18 were never shown"));
}

console.log("\n7. Within budget");
{
  const html = renderToStaticMarkup(
    React.createElement(DeckTimelinePanel, {
      report: baseDeck({ elapsedSeconds: 1325, timeBudgetSeconds: 1500 }),
    }),
  );
  check("scheduled + ran", html.includes("Scheduled 25:00") && html.includes("Ran 22:05"));
  check("no overrun clause", !html.includes(" over"));
}

console.log("\n8. Over budget");
{
  const html = renderToStaticMarkup(
    React.createElement(DeckTimelinePanel, { report: baseDeck() }),
  );
  check("overrun noted", html.includes("6:40 over"));
  check("timeline entries", html.includes("Slide 8 at 8:12"));
}

console.log("\n9. Elevator panel silent on deck; deck silent on elevator");
{
  const elevOnDeck = renderToStaticMarkup(
    React.createElement(PitchOutcomeBanner, { report: baseDeck() }),
  );
  const negoOnElev = renderToStaticMarkup(
    React.createElement(NegotiationTriplePanel, { report: baseElevator() }),
  );
  check("banner skips deck", elevOnDeck === "");
  check("nego skips elevator", negoOnElev === "");
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll pitch report panel fixtures passed.");
process.exit(0);
