/**
 * Static report-grounding checks for Phase 18 walk-out evidence.
 * Run: npx tsx scripts/verify-disengagement-report.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DisengagementDeclinePanel,
  DISENGAGEMENT_CAUSE_LABELS,
} from "../components/practice/report/DisengagementDeclinePanel";
import PitchOutcomeBanner from "../components/practice/report/PitchOutcomeBanner";
import {
  asDisengagementDeclineRecord,
  type ReportDTO,
} from "../lib/report/dto";

let failures = 0;

function check(condition: unknown, description: string) {
  if (condition) {
    console.log(`PASS ${description}`);
    return;
  }

  failures += 1;
  console.error(`FAIL ${description}`);
}

function report(outcome: ReportDTO["outcome"]): ReportDTO {
  return {
    id: "walk-out-report",
    typeSlug: "pitch-elevator",
    title: null,
    status: "READY",
    turnCount: 5,
    scores: null,
    metrics: {
      cameraMode: null,
      visual: null,
      vocal: null,
      visualUnscored: null,
      vocalUnscored: null,
    },
    input: null,
    terminationReason: "lost_interest",
    terminationAtSeconds: 125,
    outcome,
    slideHighWaterMark: null,
    slideReveals: null,
    timeBudgetSeconds: null,
    elapsedSeconds: 130,
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: null,
    startedAt: "2026-10-06T12:00:00.000Z",
    completedAt: "2026-10-06T12:02:10.000Z",
  };
}

const fixtureOutcome = {
  disengagementDecline: {
    value: 0.8,
    episodes: [
      {
        kind: "disengagement_rise",
        start_s: 65,
        end_s: 78,
        causes: ["short_response_streak", "no_common_ground"],
      },
      {
        kind: "disengagement_cross",
        start_s: 125,
        end_s: 125,
        causes: ["budget_pressure", "repeated_response"],
      },
    ],
  },
};

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

console.log("\n1. Missing evidence remains silent");
check(
  renderToStaticMarkup(
    React.createElement(DisengagementDeclinePanel, { report: report(null) }),
  ) === "",
  "panel returns null without a decline record",
);

console.log("\n2. Stored episode evidence renders on the session clock");
const declineHtml = renderToStaticMarkup(
  React.createElement(DisengagementDeclinePanel, {
    report: report(fixtureOutcome),
  }),
);
check(declineHtml.includes("1:05–1:18"), "renders start and end timecodes");
check(declineHtml.includes("2:05–2:05"), "renders crossing timecode");
check(
  declineHtml.includes(DISENGAGEMENT_CAUSE_LABELS.short_response_streak) &&
    declineHtml.includes(DISENGAGEMENT_CAUSE_LABELS.repeated_response),
  "renders only mapped observable cause labels",
);

console.log("\n3. Malformed or unsupported cause records are excluded");
const malformed = asDisengagementDeclineRecord({
  value: 0.8,
  episodes: [
    {
      kind: "disengagement_cross",
      start_s: 10,
      end_s: 10,
      causes: ["invented_telepathy"],
    },
  ],
});
check(malformed === null, "unsupported causes do not produce panel evidence");
check(
  !declineHtml.includes("invented_telepathy"),
  "panel has no free-form cause rendering path",
);

console.log("\n4. Avatar ends remain notable outcomes, not evaluation errors");
const bannerHtml = renderToStaticMarkup(
  React.createElement(PitchOutcomeBanner, { report: report(fixtureOutcome) }),
);
check(
  bannerHtml.includes("listener disengaged and ended the conversation"),
  "banner retains the avatar-ended outcome headline",
);
check(
  !/failed evaluation|something went wrong|crash/i.test(bannerHtml),
  "banner is not error-framed",
);

console.log("\n5. Pitch graders are bound to supplied observable evidence");
const elevatorPrompt = read("lib/pitch/elevator-prompts.ts");
const deckPrompt = read("lib/pitch/deck-prompts.ts");
const runner = read("lib/engine/evaluation-runner.ts");
for (const [name, source] of [
  ["elevator", elevatorPrompt],
  ["deck", deckPrompt],
] as const) {
  check(
    source.includes("disengagementDecline") &&
      source.includes("only their provided session-clock timestamps") &&
      source.includes("Do not infer"),
    `${name} evaluator prompt requires supplied observable evidence only`,
  );
}
check(
  runner.includes("asDisengagementDeclineRecord") &&
    runner.includes("disengagementDecline"),
  "evaluation runner threads the protected decline record",
);

if (failures > 0) {
  console.error(`\n${failures} disengagement report check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS");
