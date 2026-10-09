/**
 * The sanitizer's own battery (Phase 20 plan 06 / REQ-102).
 *
 * Proves, against `toReportDto` (not just the pure function in isolation),
 * that a slur or comparably explicit remark is never recited back to the
 * student — including when the evaluator payload deliberately disobeys the
 * prompt's "describe it, don't quote it" courtesy instruction — while
 * `timecodeSeconds` and `effect` survive, ordinary hostility is still shown
 * verbatim, and no rubric dimension is capped.
 *
 * Run: npx tsx scripts/verify-dc-walkout-report.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InteractionReport, Prisma } from "@prisma/client";

import { SEVERE_PLACEHOLDER_TOKENS } from "../lib/engine/hostility";
import {
  asConversationOutcome,
  asOutcomeRecord,
  toReportDto,
  type ReportDTO,
} from "../lib/report/dto";
import { sanitizeOutcomeQuotes } from "../lib/report/quote-sanitizer";
import InRoleReactionPanel from "../components/practice/report/InRoleReactionPanel";
import { DisengagementDeclinePanel } from "../components/practice/report/DisengagementDeclinePanel";
import { DIFFICULT_CONVERSATION_TYPE } from "../lib/difficult-conversation/conversation-type";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

// The real severe placeholder token this fixture never needs to commit a
// real slur for — sourced from lib/engine/hostility.ts's own export, NOT
// hand-copied, so a drift between the detector and this battery's fixture
// would fail loudly rather than silently diverge.
const TOKEN = SEVERE_PLACEHOLDER_TOKENS[0];

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

function syntheticRow(overrides: Partial<InteractionReport> = {}): InteractionReport {
  const now = new Date("2026-10-08T00:00:00.000Z");
  return {
    id: "rep-dc-walkout-verify",
    userId: "user-verify",
    typeSlug: "difficult-conversation",
    title: null,
    status: "READY",
    inputSnapshot: {
      kind: "difficult-conversation",
      conversationId: "ask-for-raise",
      conversationTitle: "Ask for a raise",
      source: "seeded",
      role: "Manager",
      studentRole: "Direct report",
      situation: "Annual review",
      sharedBackstory: "Shared history",
      studentObjective: "Secure a raise",
      stakes: "High",
      difficulty: "hostile",
      avatarId: "avatar-1",
    } as unknown as Prisma.JsonValue,
    scores: {
      visual: 4,
      vocal: 4,
      content: 4,
      behavioral: 4,
      clarity: 5,
      empathy: 5,
      holding_the_line: 5,
      objective_achieved: 4,
    } as unknown as Prisma.JsonValue,
    transcriptKey: null,
    interactionLogId: null,
    studentEmail: null,
    turnCount: 9,
    cameraMode: null,
    visualMetrics: null,
    vocalMetrics: null,
    visualUnscoredReason: null,
    vocalUnscoredReason: null,
    metricsConsentAt: null,
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: "verify-model",
    terminationReason: "escalated",
    outcome: null,
    slideHighWaterMark: null,
    slideReveals: null,
    timeBudgetSeconds: null,
    terminationAtSeconds: 180,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as InteractionReport;
}

function outcomeJson(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    objectiveStatus: "avatar_ended",
    objectiveNote: "The manager ended the conversation.",
    inRoleReaction: "I had heard enough. I was not going to keep going.",
    reactionCauses: JSON.stringify([
      {
        timecodeSeconds: 92,
        quote: "This is a complete waste of my time.",
        effect: "That was the moment I decided to shut it down.",
      },
    ]),
    endTurnReasons: "The student became hostile and would not back off.",
    endTurnTimecodeSeconds: 180,
    ...overrides,
  };
}

/** Narrow cast at the Prisma boundary only — keeps outcomeJson()'s return spreadable. */
function asOutcomeJsonValue(outcome: Record<string, unknown>): Prisma.JsonValue {
  return outcome as unknown as Prisma.JsonValue;
}

function main() {
  // -------------------------------------------------------------------------
  console.log("\n1. A severe quote never survives");
  {
    const row = syntheticRow({
      outcome: asOutcomeJsonValue(outcomeJson({
        reactionCauses: JSON.stringify([
          {
            timecodeSeconds: 64,
            quote: `You ${TOKEN}, get out of my office.`,
            effect: "That was the moment everything changed.",
          },
        ]),
      })),
    });

    const dto = toReportDto(row);
    const serialized = JSON.stringify(dto.outcome);

    check("DTO outcome does not contain the severe token", !serialized.includes(TOKEN));

    const view = asConversationOutcome(dto.outcome);
    const cause = view?.reactionCauses?.[0];
    check("reactionCauses[0] narrows", !!cause);
    check(
      "timecodeSeconds survives unchanged",
      cause?.timecodeSeconds === 64,
      String(cause?.timecodeSeconds),
    );
    check(
      "effect survives unchanged",
      cause?.effect === "That was the moment everything changed.",
      cause?.effect,
    );
    check(
      "quote is non-empty and reads as a characterization",
      !!cause?.quote && cause.quote.length > 0 && !cause.quote.includes(TOKEN),
      cause?.quote,
    );
  }

  // -------------------------------------------------------------------------
  console.log(
    "\n2. An adversarial evaluator payload (deliberately disobeys the prompt) — proves the sanitizer, not the prompt, is the mechanism",
  );
  {
    const adversarialReactionCauses = JSON.stringify([
      {
        timecodeSeconds: 10,
        quote: `Right before that he called me a ${TOKEN}, and he said it again: a ${TOKEN}.`,
        effect: "First strike.",
      },
      {
        timecodeSeconds: 200,
        quote: "An ordinary hostile remark with no slur in it at all.",
        effect: "Second, non-explicit, moment.",
      },
    ]);

    const row = syntheticRow({
      outcome: asOutcomeJsonValue(outcomeJson({
        reactionCauses: adversarialReactionCauses,
        inRoleReaction: `I kept hearing it — ${TOKEN} — over and over, and I could not continue.`,
        endTurnReasons: `He called me a ${TOKEN} directly to my face.`,
      })),
    });

    const dto = toReportDto(row);
    const serialized = JSON.stringify(dto.outcome);

    check(
      "token embedded mid-sentence, repeated twice, in reactionCauses: never survives",
      !serialized.includes(TOKEN),
    );

    const view = asConversationOutcome(dto.outcome);
    check(
      "the non-explicit second cause still survives verbatim",
      view?.reactionCauses?.[1]?.quote ===
        "An ordinary hostile remark with no slur in it at all.",
    );
    check(
      "inRoleReaction containing the token: never survives",
      typeof dto.outcome?.inRoleReaction === "string" &&
        !(dto.outcome.inRoleReaction as string).includes(TOKEN),
    );
    check(
      "endTurnReasons containing the token: never survives",
      typeof dto.outcome?.endTurnReasons === "string" &&
        !(dto.outcome.endTurnReasons as string).includes(TOKEN),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n3. Ordinary hostility IS shown — the report still shows what was said");
  {
    const quote = "You keep saying the same thing and it doesn't help.";
    const row = syntheticRow({
      outcome: asOutcomeJsonValue(outcomeJson({
        reactionCauses: JSON.stringify([
          { timecodeSeconds: 30, quote, effect: "It landed, but it was fair." },
        ]),
      })),
    });

    const dto = toReportDto(row);
    const view = asConversationOutcome(dto.outcome);

    check(
      "hostile-but-not-explicit quote round-trips byte-identically",
      view?.reactionCauses?.[0]?.quote === quote,
      view?.reactionCauses?.[0]?.quote,
    );

    // Direct function-level confirmation of sanitized === false for this case.
    const direct = sanitizeOutcomeQuotes(
      asOutcomeRecord(row.outcome as unknown as Prisma.JsonValue),
    );
    check(
      "sanitizeOutcomeQuotes leaves the non-explicit quote untouched too",
      JSON.parse(String(direct?.reactionCauses))[0].quote === quote,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n4. The render path cannot bypass the sanitizer");
  {
    const row = syntheticRow({
      outcome: asOutcomeJsonValue(outcomeJson({
        reactionCauses: JSON.stringify([
          {
            timecodeSeconds: 64,
            quote: `You ${TOKEN}.`,
            effect: "That was the end of it.",
          },
        ]),
        inRoleReaction: `I could not keep going after he called me a ${TOKEN}.`,
      })),
    });
    const dto = toReportDto(row);

    const html = renderToStaticMarkup(
      React.createElement(InRoleReactionPanel, { report: dto }),
    );
    check("rendered markup does not contain the severe token", !html.includes(TOKEN));

    const panelSrc = readFileSync(
      resolve(ROOT, "components/practice/report/InRoleReactionPanel.tsx"),
      "utf8",
    );
    check(
      "panel reads causes only via asConversationOutcome(report.outcome)",
      /asConversationOutcome\(report\.outcome\)/.test(panelSrc),
    );
    check(
      "panel never parses JSON itself (no second source of causes)",
      !/JSON\.parse/.test(panelSrc),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n5. No dimension is capped");
  {
    check(
      "DIFFICULT_CONVERSATION_TYPE has no postProcessScores key",
      !("postProcessScores" in DIFFICULT_CONVERSATION_TYPE),
    );

    const fullScores = {
      visual: 5,
      vocal: 5,
      content: 5,
      behavioral: 5,
      clarity: 5,
      empathy: 5,
      holding_the_line: 5,
      objective_achieved: 5,
    };
    const row = syntheticRow({
      scores: fullScores as unknown as Prisma.JsonValue,
      terminationReason: "escalated",
      outcome: asOutcomeJsonValue(outcomeJson({ objectiveStatus: "avatar_ended" })),
    });
    const dto = toReportDto(row);

    check(
      "full scores survive unchanged on an avatar-ended, hostility-terminated row",
      JSON.stringify(dto.scores) === JSON.stringify(fullScores),
      JSON.stringify(dto.scores),
    );
    // Phase 15's deliberate omission of postProcessScores and Phase 14's
    // explicitly-not-reused early-end cap are both preserved: nothing above
    // reads dto.outcome or dto.terminationReason and writes a score.
  }

  // -------------------------------------------------------------------------
  console.log("\n6. The decline panel renders the new causes, never student text");
  {
    const row = syntheticRow({
      outcome: {
        ...outcomeJson(),
        disengagementDecline: {
          value: 0.72,
          episodes: [
            {
              kind: "disengagement_cross",
              start_s: 40,
              end_s: 130,
              causes: ["hostility", "position_unacknowledged", "severe_content"],
            },
          ],
        },
      } as unknown as Prisma.JsonValue,
    });
    const dto = toReportDto(row);

    const html = htmlText(
      renderToStaticMarkup(
        React.createElement(DisengagementDeclinePanel, { report: dto }),
      ),
    );
    check("decline panel renders", html.includes("disengagement-decline-panel"));
    check("hostility label present", html.includes("the exchange turned personal"));
    check(
      "position_unacknowledged label present",
      html.includes("the other person's position was never acknowledged"),
    );
    check(
      "severe_content label present",
      html.includes("a remark crossed a line the character would not continue past"),
    );
    check("no episode label quotes student text", !html.includes(TOKEN));
  }

  // -------------------------------------------------------------------------
  if (failures > 0) {
    console.log(`\nFAILED: ${failures} check(s)`);
    process.exit(1);
  }
  console.log("\nALL PASS — verify-dc-walkout-report.ts");
}

main();
