/**
 * Proves Phase 16 plan 16-10: seven dimensions reach the report DTO, the
 * shared four keep four-state handling, all four askOutcome renderings are
 * distinct (never-asked unmarked as error), common-ground null case, early-end
 * reason mapping, null outcome invisible, no interview vocabulary, exactly one
 * report page, and the goal is shown without a raw-paste field.
 *
 * Run: npx tsx scripts/verify-networking-report-surfaces.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InteractionReport, Prisma } from "@prisma/client";

import NetworkingOutcomePanel, {
  ASK_OUTCOME_PHRASES,
  COMMON_GROUND_NONE_LINE,
  EARLY_END_STILL_SCORED_LINE,
  GOAL_PRIVACY_LINE,
  NETWORKING_AVATAR_END_PHRASES,
  NETWORKING_AVATAR_END_REASONS,
  formatAskOutcome,
  formatAvatarEndReason,
  formatCommonGround,
} from "../components/practice/panels/NetworkingOutcomePanel";
import {
  getReportChrome,
  renderReportExtras,
} from "../components/practice/ReportChrome";
import { listRubricDimensionsForSlug } from "../lib/engine/resolve";
import { SHARED_RUBRIC_DIMENSION_KEYS } from "../lib/engine/types";
import { resolveVisualOutcome } from "../lib/metrics/coverage";
import { NETWORKING_ASK_OUTCOMES } from "../lib/networking/prompts";
import { toReportDto, type ReportDTO } from "../lib/report/dto";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

/** Decode common HTML entities so copy assertions survive renderToStaticMarkup. */
function htmlText(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const ROOT = resolve(__dirname, "..");

const SEVEN_DIMENSION_KEYS = [
  "visual",
  "vocal",
  "content",
  "behavioral",
  "rapport",
  "self-introduction",
  "goal-progress",
] as const;

const SENTINEL_GOAL = "SENTINEL-GOAL-a warm intro to their hiring manager";

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function syntheticRow(
  overrides: Partial<InteractionReport> = {},
): InteractionReport {
  const now = new Date("2026-10-04T00:00:00.000Z");
  return {
    id: "rep-net-verify",
    userId: "user-verify",
    typeSlug: "networking",
    title: null,
    status: "READY",
    inputSnapshot: {
      kind: "networking",
      personaSource: "character",
      characterId: "priya-malhotra",
      personaId: null,
      displayName: "Priya Malhotra",
      goal: SENTINEL_GOAL,
      interviewerAvatarId: "avatar-1",
      interviewerVoice: "voice-1",
      budgetSeconds: 900,
    } as unknown as Prisma.JsonValue,
    scores: {
      visual: 3,
      vocal: 4,
      content: 4,
      behavioral: 3,
      rapport: 4,
      "self-introduction": 5,
      "goal-progress": 2,
    } as unknown as Prisma.JsonValue,
    transcriptKey: null,
    interactionLogId: null,
    studentEmail: null,
    turnCount: 10,
    cameraMode: "ON",
    visualMetrics: null,
    vocalMetrics: null,
    visualUnscoredReason: null,
    vocalUnscoredReason: null,
    metricsConsentAt: null,
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: "verify-model",
    terminationReason: null,
    outcome: {
      askMade: false,
      askOutcome: "never-asked",
      commonGround: null,
    } as unknown as Prisma.JsonValue,
    slideHighWaterMark: null,
    slideReveals: null,
    timeBudgetSeconds: 900,
    terminationAtSeconds: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    ...toReportDto(syntheticRow()),
    ...overrides,
  };
}

function renderPanel(report: ReportDTO): string {
  return htmlText(
    renderToStaticMarkup(
      React.createElement(NetworkingOutcomePanel, { report }),
    ),
  );
}

// ---------------------------------------------------------------------------
console.log("\n1. Seven dimensions reach the report DTO");
{
  const dto = toReportDto(syntheticRow());
  const scoreKeys = dto.scores ? Object.keys(dto.scores) : [];
  console.log(`  keys: ${scoreKeys.join(", ")}`);

  check(
    "all seven score keys present",
    SEVEN_DIMENSION_KEYS.every((k) => scoreKeys.includes(k)),
    `got: ${scoreKeys.join(", ")}`,
  );

  const sharedFirst = SEVEN_DIMENSION_KEYS.slice(0, 4);
  check(
    "shared four listed first in type declaration order",
    sharedFirst.every((k, i) => SHARED_RUBRIC_DIMENSION_KEYS[i] === k),
  );

  const dims = listRubricDimensionsForSlug("networking");
  const dimKeys = dims?.map((d) => d.key) ?? [];
  console.log(`  rubric: ${dimKeys.join(", ")}`);
  check(
    "listRubricDimensionsForSlug returns seven in shared-four-first order",
    dimKeys.length === 7 &&
      dimKeys.every((k, i) => k === SEVEN_DIMENSION_KEYS[i]),
    `got: ${dimKeys.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. Shared four keep four-state handling (CAMERA_OFF_OPTOUT)");
{
  const outcome = resolveVisualOutcome("OFF", null);
  check(
    "camera OFF resolves to CAMERA_OFF_OPTOUT",
    outcome.scored === false && outcome.reason === "CAMERA_OFF_OPTOUT",
    JSON.stringify(outcome),
  );
  check(
    "CAMERA_OFF_OPTOUT is not a number",
    typeof (outcome as { score?: unknown }).score !== "number",
  );

  const dto = toReportDto(
    syntheticRow({
      cameraMode: "OFF",
      visualUnscoredReason: "CAMERA_OFF_OPTOUT",
      visualMetrics: null,
      scores: {
        visual: null,
        vocal: 3,
        content: 4,
        behavioral: 3,
        rapport: 4,
        "self-introduction": 4,
        "goal-progress": 2,
      } as unknown as Prisma.JsonValue,
    }),
  );
  check(
    "DTO preserves visualUnscored CAMERA_OFF_OPTOUT",
    dto.metrics.visualUnscored === "CAMERA_OFF_OPTOUT",
  );
  check(
    "DTO visual score stays null (not invented)",
    dto.scores?.visual === null,
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. Four outcome renderings");
{
  const renderings: string[] = [];
  for (const askOutcome of NETWORKING_ASK_OUTCOMES) {
    const phrase = formatAskOutcome(askOutcome);
    renderings.push(`${askOutcome}: ${phrase}`);
    const html = renderPanel(
      baseReport({
        outcome: {
          askMade: askOutcome !== "never-asked",
          askOutcome,
          commonGround:
            askOutcome === "never-asked" ? null : "Shared interest in product ops",
        },
      }),
    );
    check(
      `${askOutcome} produces distinct non-empty text`,
      phrase.length > 0 && html.includes(phrase),
    );
  }
  console.log("  renderings:");
  for (const line of renderings) console.log(`    ${line}`);

  const neverAsked = ASK_OUTCOME_PHRASES["never-asked"];
  check(
    "never-asked rendering has no error/fail/warning/incomplete",
    !/error|fail|warning|incomplete/i.test(neverAsked),
  );

  const neverHtml = renderPanel(
    baseReport({
      outcome: {
        askMade: false,
        askOutcome: "never-asked",
        commonGround: null,
      },
    }),
  );
  check(
    "never-asked panel has no error/warning class",
    !/error|fail|warning|incomplete/i.test(neverHtml),
  );

  const unique = new Set(Object.values(ASK_OUTCOME_PHRASES));
  check("four askOutcome phrases are distinct", unique.size === 4);
}

// ---------------------------------------------------------------------------
console.log("\n4. Common ground null case");
{
  check(
    "formatCommonGround(null) is none-identified line",
    formatCommonGround(null) === COMMON_GROUND_NONE_LINE,
  );
  const html = renderPanel(
    baseReport({
      outcome: {
        askMade: false,
        askOutcome: "never-asked",
        commonGround: null,
      },
    }),
  );
  check("panel shows none-identified line", html.includes(COMMON_GROUND_NONE_LINE));
  check("panel does not render string null", !html.includes(">null<") && !/\bnull\b/.test(html.replace(COMMON_GROUND_NONE_LINE, "")));
  check("panel does not render string undefined", !html.includes("undefined"));
}

// ---------------------------------------------------------------------------
console.log("\n5. Early end — reason mapping + seven dimensions still present");
{
  console.log("  early-end mapping:");
  for (const reason of NETWORKING_AVATAR_END_REASONS) {
    const phrase = formatAvatarEndReason(reason);
    console.log(`    ${reason} -> ${phrase}`);
    check(
      `${reason} maps to student-facing phrase`,
      typeof phrase === "string" && phrase.length > 0 && phrase !== reason,
    );
    check(
      `${reason} phrase is not raw enum`,
      phrase !== null && !phrase.includes(reason),
    );

    const row = syntheticRow({
      terminationReason: reason,
      terminationAtSeconds: 240,
      outcome: {
        askMade: false,
        askOutcome: "never-asked",
        commonGround: null,
      } as unknown as Prisma.JsonValue,
    });
    const dto = toReportDto(row);
    const scoreKeys = dto.scores ? Object.keys(dto.scores) : [];
    check(
      `${reason}: seven dimensions still in DTO`,
      SEVEN_DIMENSION_KEYS.every((k) => scoreKeys.includes(k)),
    );

    const html = renderPanel(dto);
    // data-outcome may carry the enum for tests (Phase 15 banner idiom);
    // student-visible copy must not.
    const visible = html.replace(/data-outcome="[^"]*"/g, "");
    check(
      `${reason}: panel states other person ended`,
      html.includes("The other person ended the conversation."),
    );
    check(
      `${reason}: panel shows mapped phrase`,
      phrase !== null && html.includes(phrase),
    );
    check(
      `${reason}: still-scored line present`,
      html.includes(EARLY_END_STILL_SCORED_LINE),
    );
    check(
      `${reason}: raw enum absent from visible copy`,
      !visible.includes(reason),
    );
  }
  check(
    "NETWORKING_AVATAR_END_PHRASES covers all three 16-07 reasons",
    NETWORKING_AVATAR_END_REASONS.length === 3 &&
      ["disengaged", "not-worth-continuing", "out-of-time"].every((r) =>
        NETWORKING_AVATAR_END_REASONS.includes(r),
      ),
  );
}

// ---------------------------------------------------------------------------
console.log("\n6. Null outcome is invisible");
{
  const html = renderPanel(baseReport({ outcome: null }));
  check("null outcome renders empty string", html === "");
  check("null outcome has no Outcome record scaffold", !html.includes("Outcome record"));
}

// ---------------------------------------------------------------------------
console.log("\n7. No interview vocabulary in rendered output");
{
  const interviewRe = /answer|STAR|candidate|interview/i;
  for (const askOutcome of NETWORKING_ASK_OUTCOMES) {
    const html = renderPanel(
      baseReport({
        outcome: {
          askMade: askOutcome !== "never-asked",
          askOutcome,
          commonGround: "Both worked in ops",
        },
        terminationReason: "disengaged",
      }),
    );
    check(
      `${askOutcome} HTML has no interview vocabulary`,
      !interviewRe.test(html),
    );
  }
  const panelSrc = readFileSync(
    join(ROOT, "components/practice/panels/NetworkingOutcomePanel.tsx"),
    "utf8",
  );
  check(
    "panel source has no interview vocabulary",
    !interviewRe.test(panelSrc),
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. One report page, still");
{
  const appFiles = walkFiles(join(ROOT, "app"));
  const reportPages = appFiles.filter((f) =>
    /[/\\]practice[/\\][^/\\]+[/\\]report[/\\][^/\\]+[/\\]page\.tsx$/.test(f),
  );
  check(
    "exactly one app/practice/*/report/*/page.tsx",
    reportPages.length === 1,
    reportPages.map((f) => f.replace(ROOT + "/", "")).join(", "),
  );

  const networkingAndReport = appFiles.filter((f) => {
    const rel = f.replace(ROOT + "/", "").toLowerCase();
    return rel.includes("networking") && rel.includes("report");
  });
  check(
    "no app path contains both networking and report",
    networkingAndReport.length === 0,
    networkingAndReport.map((f) => f.replace(ROOT + "/", "")).join(", "),
  );

  const chrome = getReportChrome("networking");
  check("getReportChrome resolves networking", chrome !== null);
  check("extras.below declared", typeof chrome?.extras?.below === "function");

  const ready = baseReport({
    outcome: {
      askMade: true,
      askOutcome: "agreed",
      commonGround: "Shared alumni network",
    },
  });
  const below = htmlText(
    renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderReportExtras(chrome, "below", ready),
      ),
    ),
  );
  check(
    "below slot renders ask landing",
    below.includes(ASK_OUTCOME_PHRASES.agreed),
  );
}

// ---------------------------------------------------------------------------
console.log("\n9. Goal is shown; paste field absent from snapshot");
{
  const html = renderPanel(
    baseReport({
      outcome: {
        askMade: false,
        askOutcome: "never-asked",
        commonGround: null,
      },
    }),
  );
  check("panel includes goal text", html.includes(SENTINEL_GOAL));
  check("panel includes goal privacy line", html.includes(GOAL_PRIVACY_LINE));

  const snapshotSrc = readFileSync(join(ROOT, "lib/report/snapshot.ts"), "utf8");
  check(
    "snapshot.ts has no profileText field",
    !/profileText/.test(snapshotSrc),
  );
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\nverify-networking-report-surfaces: FAILED (${failures} failure(s))\n`);
  process.exit(1);
}
console.log("\nverify-networking-report-surfaces: PASSED (9 sections)\n");
