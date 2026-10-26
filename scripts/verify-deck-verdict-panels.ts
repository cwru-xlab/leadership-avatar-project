/**
 * Proves the extras-slot contract for all five deck modes (plan 19-09).
 *
 * Modeled on `scripts/verify-pitch-report-panels.ts` — builds synthetic
 * `ReportDTO`s and renders chrome extras headlessly, reusing that harness's
 * fixture-and-check shape rather than inventing a second one.
 *
 * Run: npx tsx scripts/verify-deck-verdict-panels.ts
 */

import fs from "node:fs";
import path from "node:path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getReportChrome, renderReportExtras } from "../components/practice/ReportChrome";
import NegotiationTriplePanel from "../components/practice/report/NegotiationTriplePanel";
import type { ReportDTO } from "../lib/report/dto";
import type { DeckModeSlug } from "../lib/pitch/deck-modes";

let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "ok" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

const DECK_MODE_SLUGS: DeckModeSlug[] = [
  "pitch-deck",
  "pitch-funding",
  "pitch-product",
  "pitch-talk",
  "pitch-general",
];

function baseDeckReport(
  typeSlug: DeckModeSlug,
  overrides: Partial<ReportDTO> = {},
): ReportDTO {
  return {
    id: `rep-${typeSlug}`,
    typeSlug,
    title: null,
    status: "READY",
    turnCount: 14,
    scores: {
      visual: 4,
      vocal: 3,
      content: 4,
      behavioral: 4,
      deck_structure: 4,
      deck_text_density: 3,
      deck_visual_quality: 4,
      slide_speech_correlation: 3,
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
      slideCount: 12,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: null,
      budgetSeconds: 1200,
      listenerPersona: null,
      deckModeInputs: null,
    },
    terminationReason: null,
    terminationAtSeconds: null,
    outcome: null,
    slideHighWaterMark: 8,
    slideReveals: null,
    timeBudgetSeconds: 1200,
    elapsedSeconds: 1100,
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: null,
    startedAt: "2026-10-08T12:00:00.000Z",
    completedAt: "2026-10-08T12:18:20.000Z",
    ...overrides,
  };
}

function investorReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return baseDeckReport("pitch-deck", {
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
    input: {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-1",
      slideCount: 12,
      askPriceUsd: 500_000,
      askEquityPct: 10,
      fairValueBand: {
        priceUsdMin: 400_000,
        priceUsdMax: 600_000,
        equityPctMin: 8,
        equityPctMax: 12,
      },
      firstTurnWindowSeconds: null,
      budgetSeconds: 1200,
      listenerPersona: null,
      deckModeInputs: null,
    },
    outcome: {
      dealReached: true,
      settledPriceUsd: 450_000,
      settledEquityPct: 11,
      negotiationNotes: "Settled after two rounds.",
    },
    ...overrides,
  });
}

function fundingReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return baseDeckReport("pitch-funding", {
    scores: {
      visual: 4,
      vocal: 3,
      content: 4,
      behavioral: 4,
      deck_structure: 4,
      deck_text_density: 3,
      deck_visual_quality: 4,
      slide_speech_correlation: 3,
      use_of_funds_credibility: 4,
      ask_feasibility: 3,
    },
    input: {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-1",
      slideCount: 12,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: null,
      budgetSeconds: 1200,
      listenerPersona: null,
      deckModeInputs: {
        mode: "pitch-funding",
        requestedAmountUsd: 75_000,
        useOfFunds: "Six months of runway for a pilot cohort.",
      },
    },
    outcome: {
      fundedAmountUsd: 50_000,
      fundingPosition: "partial",
      fundingRationale: "The pilot scope justifies partial funding now.",
    },
    ...overrides,
  });
}

function productReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return baseDeckReport("pitch-product", {
    scores: {
      visual: 4,
      vocal: 3,
      content: 4,
      behavioral: 4,
      deck_structure: 4,
      deck_text_density: 3,
      deck_visual_quality: 4,
      slide_speech_correlation: 3,
      objection_handling: 3,
    },
    input: {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-1",
      slideCount: 12,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: null,
      budgetSeconds: 1200,
      listenerPersona: null,
      deckModeInputs: {
        mode: "pitch-product",
        buyerProfile: "Ops lead at a mid-size logistics company.",
      },
    },
    outcome: {
      buyerPosition: "needs-more",
      blockingObjection: "Wants a pricing commitment before rollout.",
    },
    ...overrides,
  });
}

function talkReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return baseDeckReport("pitch-talk", {
    scores: {
      visual: 4,
      vocal: 3,
      content: 4,
      behavioral: 4,
      deck_structure: 4,
      deck_text_density: 3,
      deck_visual_quality: 4,
      slide_speech_correlation: 3,
      audience_takeaway_clarity: 3,
      holding_the_room: 4,
    },
    input: {
      kind: "pitch",
      pitchKind: "deck",
      pitchSubject: null,
      listenerKnowledge: null,
      deckId: "deck-1",
      slideCount: 12,
      askPriceUsd: null,
      askEquityPct: null,
      fairValueBand: null,
      firstTurnWindowSeconds: null,
      budgetSeconds: 1200,
      listenerPersona: null,
      deckModeInputs: {
        mode: "pitch-talk",
        talkAudience: "Mid-career product managers at a conference.",
        talkTakeaway: "Ship the smallest version that proves the hypothesis.",
      },
    },
    outcome: {
      takeawayHeard: "Start small and validate before scaling.",
      matchedDeclaredTakeaway: true,
    },
    ...overrides,
  });
}

function generalReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return baseDeckReport("pitch-general", overrides);
}

console.log("Deck verdict panel extras-slot contract — all five deck modes\n");

console.log("1. getReportChrome resolves for every deck-mode slug");
for (const slug of DECK_MODE_SLUGS) {
  check(`getReportChrome("${slug}") is non-null`, getReportChrome(slug) !== null);
}

console.log("\n2. Extras render null when the report is not READY");
for (const slug of DECK_MODE_SLUGS) {
  const chrome = getReportChrome(slug);
  const notReady = baseDeckReport(slug, { status: "PENDING" });
  check(
    `"${slug}" above is null when PENDING`,
    renderReportExtras(chrome, "above", notReady) === null,
  );
  check(
    `"${slug}" below is null when PENDING`,
    renderReportExtras(chrome, "below", notReady) === null,
  );
}

console.log("\n3. Funding verdict — requested, funded, position, rationale");
{
  const chrome = getReportChrome("pitch-funding");
  const html = renderToStaticMarkup(
    renderReportExtras(chrome, "below", fundingReport()) as React.ReactElement,
  );
  check("requested amount", html.includes("$75k"));
  check("funded amount", html.includes("$50k"));
  check("position", html.includes("Partially funded"));
  check("rationale", html.includes("justifies partial funding"));
}

console.log("\n4. Product verdict — buyer position and blocking objection");
{
  const chrome = getReportChrome("pitch-product");
  const html = renderToStaticMarkup(
    renderReportExtras(chrome, "below", productReport()) as React.ReactElement,
  );
  check("buyer position", html.includes("Needs more"));
  check("blocking objection", html.includes("pricing commitment"));
}

console.log("\n5. Talk verdict — declared vs heard takeaway");
{
  const chrome = getReportChrome("pitch-talk");
  const html = renderToStaticMarkup(
    renderReportExtras(chrome, "below", talkReport()) as React.ReactElement,
  );
  check("declared takeaway", html.includes("Ship the smallest version"));
  check("heard takeaway", html.includes("Start small and validate"));
}

console.log("\n6. General mode has NO verdict panel, for any outcome JSON");
{
  const chrome = getReportChrome("pitch-general");
  const withGarbageOutcome = generalReport({
    outcome: { anything: "goes", fundedAmountUsd: 1, buyerPosition: "interested" },
  });
  const html = renderToStaticMarkup(
    renderReportExtras(chrome, "below", withGarbageOutcome) as React.ReactElement,
  );
  check(
    "no verdict-card markers in general output",
    !html.includes('data-testid="funding-verdict-panel"') &&
      !html.includes('data-testid="product-verdict-panel"') &&
      !html.includes('data-testid="talk-verdict-panel"') &&
      !html.includes("Verdict</p>"),
  );
}

console.log("\n7. Investor report keeps its negotiation triple, no duplicate verdict");
{
  const chrome = getReportChrome("pitch-deck");
  const html = renderToStaticMarkup(
    renderReportExtras(chrome, "below", investorReport()) as React.ReactElement,
  );
  check("ask present", html.includes("Your ask") && html.includes("$500k"));
  check("settled present", html.includes("Settled") && html.includes("$450k"));
  check("fair range present", html.includes("$400k") && html.includes("$600k"));
  check(
    "no duplicate verdict panel",
    !html.includes('data-testid="funding-verdict-panel"') &&
      !html.includes('data-testid="product-verdict-panel"') &&
      !html.includes('data-testid="talk-verdict-panel"'),
  );
}

console.log("\n8. Malformed outcome never throws, for every mode");
{
  const malformedValues: unknown[] = [
    "just a string",
    ["an", "array"],
    { fundedAmountUsd: "not-a-number", fundingPosition: 42, blockingObjection: {} },
  ];
  for (const slug of DECK_MODE_SLUGS) {
    const chrome = getReportChrome(slug);
    for (const malformed of malformedValues) {
      let threw = false;
      try {
        const report = baseDeckReport(slug, {
          outcome: malformed as ReportDTO["outcome"],
        });
        renderToStaticMarkup(
          React.createElement(
            React.Fragment,
            null,
            renderReportExtras(chrome, "above", report),
            renderReportExtras(chrome, "below", report),
          ),
        );
      } catch {
        threw = true;
      }
      check(
        `"${slug}" renders without throwing on malformed outcome (${typeof malformed === "object" ? JSON.stringify(malformed) : malformed})`,
        !threw,
      );
    }
  }
}

console.log("\n9. NegotiationTriplePanel text appears only for pitch-deck");
{
  for (const slug of DECK_MODE_SLUGS) {
    const chrome = getReportChrome(slug);
    const report =
      slug === "pitch-deck"
        ? investorReport()
        : slug === "pitch-funding"
          ? fundingReport()
          : slug === "pitch-product"
            ? productReport()
            : slug === "pitch-talk"
              ? talkReport()
              : generalReport();
    const html = renderToStaticMarkup(
      renderReportExtras(chrome, "below", report) as React.ReactElement,
    );
    const hasNegotiationPanel = html.includes('data-testid="negotiation-triple-panel"');
    check(
      `"${slug}" ${slug === "pitch-deck" ? "has" : "lacks"} the negotiation triple`,
      slug === "pitch-deck" ? hasNegotiationPanel : !hasNegotiationPanel,
    );
  }

  // Direct component check, independent of chrome wiring — an elevator
  // input (`pitchKind: "elevator"`) is not a deck-ask input at all.
  const onElevatorLikeInput = renderToStaticMarkup(
    React.createElement(NegotiationTriplePanel, {
      report: generalReport({
        input: {
          kind: "pitch",
          pitchKind: "elevator",
          pitchSubject: null,
          listenerKnowledge: null,
          deckId: null,
          slideCount: null,
          askPriceUsd: null,
          askEquityPct: null,
          fairValueBand: null,
          firstTurnWindowSeconds: 60,
          budgetSeconds: null,
          listenerPersona: null,
          deckModeInputs: null,
        },
      }),
    }),
  );
  check("NegotiationTriplePanel self-nulls on a non-deck-ask input", onElevatorLikeInput === "");
}

console.log("\n10. The shared report page carries no deck-mode slug literal");
{
  const reportPagePath = path.join(
    __dirname,
    "..",
    "app",
    "practice",
    "[type]",
    "report",
    "[reportId]",
    "page.tsx",
  );
  const source = fs.readFileSync(reportPagePath, "utf8");
  const slugLiteralPattern = /"pitch-(deck|funding|product|talk|general)"/;
  const typeSlugComparisonPattern = /typeSlug\s*===/;
  check("no deck-mode slug literal", !slugLiteralPattern.test(source));
  check("no `typeSlug ===` comparison", !typeSlugComparisonPattern.test(source));
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS — all ten deck verdict panel assertions passed.");
process.exit(0);
