/**
 * Proves Phase 15 plan 15-09: eight dimensions on the one report, outcome
 * never touches a score, pairing line, avatar-end banners, student-end
 * copy, graceful degradation, no slug branch on the report page, and no
 * hiddenPosition leakage.
 *
 * Run: npx tsx scripts/verify-dc-report.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AVATAR_END_OUTCOME_NAMES,
  AVATAR_END_REASONS,
  STILL_SCORED_LINE,
  STUDENT_CLOSED_LINE,
  STUDENT_LEFT_LINE,
  default as ConversationEndBanner,
} from "../components/practice/report/ConversationEndBanner";
import ConversationOutcomePanel, {
  OBJECTIVE_APPROACH_PAIRING_LINE,
  OUTCOME_NOT_A_SCORE_CAPTION,
  shouldShowPairingLine,
} from "../components/practice/report/ConversationOutcomePanel";
import InRoleReactionPanel from "../components/practice/report/InRoleReactionPanel";
import {
  getReportChrome,
  renderReportExtras,
} from "../components/practice/ReportChrome";
import { listRubricDimensionsForSlug } from "../lib/engine/resolve";
import { getEngineType } from "../lib/engine/registry";
import {
  asConversationOutcome,
  type ReportDTO,
} from "../lib/report/dto";

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

const EIGHT_DIMENSION_KEYS = [
  "visual",
  "vocal",
  "content",
  "behavioral",
  "clarity",
  "empathy",
  "holding_the_line",
  "objective_achieved",
] as const;

const HIDDEN_POSITION =
  "I will never give a raise this cycle no matter how well they argue the case.";

function baseReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    id: "rep-dc-verify",
    typeSlug: "difficult-conversation",
    status: "READY",
    turnCount: 12,
    scores: {
      visual: 3,
      vocal: 3,
      content: 4,
      behavioral: 4,
      clarity: 4,
      empathy: 5,
      holding_the_line: 4,
      objective_achieved: 5,
    },
    metrics: {
      cameraMode: null,
      visual: null,
      vocal: null,
      visualUnscored: null,
      vocalUnscored: null,
    },
    input: {
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
    },
    terminationReason: null,
    terminationAtSeconds: null,
    outcome: {
      objectiveStatus: "not_met",
      objectiveNote: "The manager refused the raise.",
      inRoleReaction:
        "I kept waiting for them to soften. They never did — and somehow I respected that.",
      reactionCauses: JSON.stringify([
        {
          timecodeSeconds: 92,
          quote: "I understand the budget is tight.",
          effect: "It made me pause before repeating the refusal.",
        },
      ]),
      endTurnReasons: null,
      endTurnTimecodeSeconds: null,
    },
    reportStructured: null,
    reportMarkdown: null,
    failureReason: null,
    evalModel: null,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

function main() {
  // ---------------------------------------------------------------------------
  console.log("\n1. Eight dimensions render through ReportScoreCards' input");
  {
    const dims = listRubricDimensionsForSlug("difficult-conversation");
    check("listRubricDimensionsForSlug returns dimensions", dims !== null);
    const keys = (dims ?? []).map((d) => d.key);
    check(
      "exactly eight dimension keys in order",
      JSON.stringify(keys) === JSON.stringify([...EIGHT_DIMENSION_KEYS]),
      JSON.stringify(keys),
    );

    const report = baseReport();
    const scoreInput: Record<string, number | null> = {};
    for (const dim of dims ?? []) {
      scoreInput[dim.key] = report.scores?.[dim.key] ?? null;
    }
    check(
      "score-card input carries all eight keys",
      EIGHT_DIMENSION_KEYS.every((k) => k in scoreInput),
      JSON.stringify(Object.keys(scoreInput)),
    );
    check(
      "all eight scores non-null in fixture",
      EIGHT_DIMENSION_KEYS.every((k) => typeof scoreInput[k] === "number"),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n2. No outcome-to-score path; postProcessScores still absent");
  {
    const type = getEngineType("difficult-conversation");
    check("type resolves", !!type);
    check(
      "postProcessScores is undefined",
      type?.postProcessScores === undefined,
    );

    const roots = [
      join(ROOT, "lib/report"),
      join(ROOT, "components/practice/report"),
      join(ROOT, "lib/difficult-conversation"),
    ];
    const offenders: string[] = [];
    const pattern =
      /(?:scores?\s*[\[(=].*outcome|outcome\s*[.[].*(?:score|scores)\s*=)/i;
    for (const root of roots) {
      for (const file of walkFiles(root)) {
        const text = readFileSync(file, "utf8");
        // Allow the doc comment that forbids the pattern.
        const stripped = text
          .split("\n")
          .filter((line) => !/never applied|writes a score|cap or lift/i.test(line))
          .join("\n");
        if (pattern.test(stripped) && /outcome/.test(stripped) && /score/.test(stripped)) {
          // Narrower: assignment that reads outcome into a score.
          if (/score\w*\s*=\s*[^;\n]*outcome/i.test(stripped)) {
            offenders.push(file.replace(ROOT + "/", ""));
          }
        }
      }
    }
    check(
      "no expression reads outcome and writes a score",
      offenders.length === 0,
      offenders.join(", "),
    );

    const dtoSrc = readFileSync(join(ROOT, "lib/report/dto.ts"), "utf8");
    check(
      "DTO documents outcome never touches scores",
      /never applied[\s\S]{0,40}to a score/i.test(dtoSrc),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n3. The pairing renders");
  {
    check(
      "shouldShowPairingLine true for not_met + 5",
      shouldShowPairingLine("not_met", 5) === true,
    );
    check(
      "shouldShowPairingLine true for partially_met + 4",
      shouldShowPairingLine("partially_met", 4) === true,
    );
    check(
      "shouldShowPairingLine false for met + 5",
      shouldShowPairingLine("met", 5) === false,
    );

    const pairingReport = baseReport({
      scores: {
        ...baseReport().scores!,
        objective_achieved: 5,
      },
      outcome: {
        objectiveStatus: "not_met",
        objectiveNote: "No raise.",
        inRoleReaction: null,
        reactionCauses: null,
        endTurnReasons: null,
        endTurnTimecodeSeconds: null,
      },
    });
    const pairingHtml = htmlText(
      renderToStaticMarkup(
        React.createElement(ConversationOutcomePanel, { report: pairingReport }),
      ),
    );
    check(
      "pairing line present for high approach + not_met",
      pairingHtml.includes(OBJECTIVE_APPROACH_PAIRING_LINE),
    );
    check(
      "not-a-score caption present",
      pairingHtml.includes(OUTCOME_NOT_A_SCORE_CAPTION),
    );

    const metReport = baseReport({
      outcome: {
        objectiveStatus: "met",
        objectiveNote: "Raise agreed.",
        inRoleReaction: null,
        reactionCauses: null,
        endTurnReasons: null,
        endTurnTimecodeSeconds: null,
      },
    });
    const metHtml = htmlText(
      renderToStaticMarkup(
        React.createElement(ConversationOutcomePanel, { report: metReport }),
      ),
    );
    check(
      "pairing line absent when objective met",
      !metHtml.includes(OBJECTIVE_APPROACH_PAIRING_LINE),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n4. Four avatar-end banners");
  {
    for (const reason of AVATAR_END_REASONS) {
      const report = baseReport({
        terminationReason: reason,
        terminationAtSeconds: 148,
        outcome: {
          objectiveStatus: "avatar_ended",
          objectiveNote: "The character ended it.",
          inRoleReaction: "I had to leave.",
          reactionCauses: null,
          endTurnReasons: "They kept pushing after I said no twice.",
          endTurnTimecodeSeconds: 148,
        },
      });
      const html = renderToStaticMarkup(
        React.createElement(ConversationEndBanner, { report }),
      );
      check(
        `${reason}: named outcome`,
        html.includes(AVATAR_END_OUTCOME_NAMES[reason]),
      );
      check(
        `${reason}: specific reasons`,
        html.includes("They kept pushing after I said no twice."),
      );
      check(`${reason}: timecode`, html.includes("2:28"));
      check(`${reason}: still-scored line`, html.includes(STILL_SCORED_LINE));
      check(
        `${reason}: all eight scores non-zero on same DTO`,
        EIGHT_DIMENSION_KEYS.every((k) => (report.scores?.[k] ?? 0) > 0),
      );
      check(
        `${reason}: not error-styled copy`,
        !/failed|incomplete|warning|crash/i.test(html),
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n5. Student-end copy");
  {
    const closed = renderToStaticMarkup(
      React.createElement(ConversationEndBanner, {
        report: baseReport({ terminationReason: "student_closed_in_character" }),
      }),
    );
    check("student_closed_in_character → You closed it", closed.includes(STUDENT_CLOSED_LINE));
    check("student_closed: no error framing", !/error|failed|incomplete/i.test(closed));

    const left = renderToStaticMarkup(
      React.createElement(ConversationEndBanner, {
        report: baseReport({ terminationReason: "student_left_session" }),
      }),
    );
    check("student_left_session → Session ended early", left.includes(STUDENT_LEFT_LINE));
    check("student_left: no error framing", !/error|failed|incomplete/i.test(left));
  }

  // ---------------------------------------------------------------------------
  console.log("\n6. Graceful degradation");
  {
    const noReaction = baseReport({
      outcome: {
        objectiveStatus: "not_met",
        objectiveNote: "No raise.",
        inRoleReaction: null,
        reactionCauses: null,
        endTurnReasons: null,
        endTurnTimecodeSeconds: null,
      },
    });
    const emptyReaction = renderToStaticMarkup(
      React.createElement(InRoleReactionPanel, { report: noReaction }),
    );
    check("missing inRoleReaction → no panel", emptyReaction === "");
    check(
      "scores still present on DTO",
      EIGHT_DIMENSION_KEYS.every((k) => typeof noReaction.scores?.[k] === "number"),
    );

    const malformed = baseReport({
      outcome: {
        objectiveStatus: "not_met",
        objectiveNote: "No raise.",
        inRoleReaction: "I left thinking about their calm ask.",
        reactionCauses: "not-json{{{",
        endTurnReasons: null,
        endTurnTimecodeSeconds: null,
      },
    });
    const view = asConversationOutcome(malformed.outcome);
    check("malformed reactionCauses → absent on view", view?.reactionCauses === null);
    check("inRoleReaction intact", view?.inRoleReaction?.includes("calm ask") === true);

    const malformedHtml = renderToStaticMarkup(
      React.createElement(InRoleReactionPanel, { report: malformed }),
    );
    check("passage still renders", malformedHtml.includes("calm ask"));
    check("no causes list", !malformedHtml.includes('data-testid="reaction-causes"'));
  }

  // ---------------------------------------------------------------------------
  console.log("\n7. No slug branch; extras slot owns the panels");
  {
    const reportDir = join(ROOT, "app/practice/[type]/report");
    const pageFiles = walkFiles(reportDir);
    const slugHits: string[] = [];
    for (const file of pageFiles) {
      const text = readFileSync(file, "utf8");
      if (text.includes("difficult-conversation")) {
        slugHits.push(file.replace(ROOT + "/", ""));
      }
    }
    check(
      "app/practice/[type]/report/ has no difficult-conversation",
      slugHits.length === 0,
      slugHits.join(", "),
    );

    const chrome = getReportChrome("difficult-conversation");
    check("getReportChrome resolves difficult-conversation", chrome !== null);
    check("extras.above declared", typeof chrome?.extras?.above === "function");
    check("extras.below declared", typeof chrome?.extras?.below === "function");

    const ready = baseReport({
      terminationReason: "walked_out",
      terminationAtSeconds: 100,
      outcome: {
        objectiveStatus: "avatar_ended",
        objectiveNote: "Walked out.",
        inRoleReaction: "I could not stay.",
        reactionCauses: JSON.stringify([
          {
            timecodeSeconds: 80,
            quote: "We need to finish this tonight.",
            effect: "That was the moment I decided to leave.",
          },
        ]),
        endTurnReasons: "Repeated pressure after a clear no.",
        endTurnTimecodeSeconds: 100,
      },
    });
    const above = htmlText(
      renderToStaticMarkup(
        React.createElement(React.Fragment, null, renderReportExtras(chrome, "above", ready)),
      ),
    );
    const below = htmlText(
      renderToStaticMarkup(
        React.createElement(React.Fragment, null, renderReportExtras(chrome, "below", ready)),
      ),
    );
    check("above slot renders end banner", above.includes(AVATAR_END_OUTCOME_NAMES.walked_out));
    check("below slot renders outcome caption", below.includes(OUTCOME_NOT_A_SCORE_CAPTION));
    check("below slot renders in-role reaction", below.includes("I could not stay."));
    check("below slot names avatar role", below.includes("Manager, afterwards"));

    // Among the report page + ReportChrome surface, only ReportChrome may name
    // the slug (panel files under components/practice/report/ may also name it
    // for input narrowing). Parallel Phase 15 UI elsewhere is out of scope.
    const reportSurface = [
      ...pageFiles,
      join(ROOT, "components/practice/ReportChrome.tsx"),
    ];
    const surfaceHits = reportSurface.filter((file) =>
      readFileSync(file, "utf8").includes("difficult-conversation"),
    );
    check(
      "only ReportChrome on the report surface names the slug",
      surfaceHits.length === 1 &&
        surfaceHits[0].endsWith("components/practice/ReportChrome.tsx"),
      surfaceHits.map((f) => f.replace(ROOT + "/", "")).join(", "),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n8. No hidden position");
  {
    const leaked = baseReport({
      outcome: {
        objectiveStatus: "not_met",
        objectiveNote: "Manager held firm.",
        inRoleReaction: "I stuck to my position without naming the real constraint.",
        reactionCauses: JSON.stringify([
          {
            timecodeSeconds: 40,
            quote: "Can we revisit compensation?",
            effect: "I stayed composed.",
          },
        ]),
        endTurnReasons: null,
        endTurnTimecodeSeconds: null,
      },
    });
    // Ensure fixture does not contain the secret; then render all panels.
    const fragment = HIDDEN_POSITION.slice(0, 24);
    check(
      "hiddenPosition sample is 20+ chars",
      fragment.length >= 20,
    );

    const chrome = getReportChrome("difficult-conversation");
    const html =
      renderToStaticMarkup(
        React.createElement(React.Fragment, null, renderReportExtras(chrome, "above", leaked)),
      ) +
      renderToStaticMarkup(
        React.createElement(React.Fragment, null, renderReportExtras(chrome, "below", leaked)),
      );
    check(
      "rendered panels omit hiddenPosition substring",
      !html.includes(fragment),
    );

    const panelSrc = [
      "ConversationEndBanner.tsx",
      "ConversationOutcomePanel.tsx",
      "InRoleReactionPanel.tsx",
    ]
      .map((name) =>
        readFileSync(join(ROOT, "components/practice/report", name), "utf8"),
      )
      .join("\n");
    check("panel sources never mention hiddenPosition", !panelSrc.includes("hiddenPosition"));
  }

  // ---------------------------------------------------------------------------
  if (failures > 0) {
    console.log(`\nFAILED: ${failures} check(s)`);
    process.exit(1);
  }
  console.log("\nAll eight sections passed.");
}

main();
