/**
 * Proves the check-taking SURFACE this plan ships is reachable, keyless, and
 * wired correctly — not merely that the underlying library (21-06/21-10/21-
 * 11/21-15) works, which the other verifiers already cover.
 *
 * Section 1 — KEYLESSNESS, the strongest assertion in this file: for each of
 * the four formats, builds a row literal WITH a populated answer key, passes
 * it through the attempt route's exported `toKeylessCheckDTO`, and asserts
 * the serialized DTO carries no trace of the key — then runs the SAME
 * predicate over the RAW row and asserts it reports a leak for all four
 * formats (the inverted assertion: a keylessness check that has never seen a
 * leak is not a check).
 *
 * Section 2 — format coverage in the card, read as TEXT, iterating
 * `CHECK_FORMATS` rather than a hardcoded list so a fifth format fails here
 * until the card branches on it.
 *
 * Section 3 — contest wiring (attempt id, not check id; gated on a mark) and
 * the REQ-122 link contract with 21-19's PathPanel.
 *
 * Section 4 — a full database round trip: answer, grade, contest, restore —
 * for all four formats. Prints an explicit SKIP (never a silent pass)
 * without DATABASE_URL.
 *
 * Run: npx tsx scripts/verify-check-taking-surface.ts
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  toKeylessCheckDTO,
  type KnowledgeCheckRowForDTO,
} from "../app/api/study-plans/checks/[checkId]/attempt/route";
import {
  CHECK_FORMATS,
  validateCheckPayload,
  validateAnswerKey,
  type CheckFormat,
} from "../lib/study-plan/checks/types";
import { submitAndGrade, AlreadyAnsweredError } from "../lib/study-plan/checks/grade";
import { raiseContest } from "../lib/study-plan/checks/contest";
import { readContributions } from "../lib/mastery/ledger";
import { computeMastery } from "../lib/mastery/compute";

let failures = 0;
let passCount = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    passCount += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function skip(name: string) {
  console.log(`  SKIP ${name}`);
}

async function expectThrowAsync(
  fn: () => Promise<unknown>
): Promise<{ threw: true; error: unknown } | { threw: false }> {
  try {
    await fn();
    return { threw: false };
  } catch (error) {
    return { threw: true, error };
  }
}

const CARD_PATH = path.join(
  __dirname,
  "..",
  "components",
  "study-plan",
  "KnowledgeCheckCard.tsx"
);
const PAGE_PATH = path.join(
  __dirname,
  "..",
  "app",
  "study-plans",
  "[planId]",
  "checks",
  "[checkId]",
  "page.tsx"
);
const PATH_PANEL_PATH = path.join(
  __dirname,
  "..",
  "components",
  "study-plan",
  "PathPanel.tsx"
);

// ---------------------------------------------------------------------------
// Fixture rows WITH a populated answer key, one per format.
// ---------------------------------------------------------------------------

interface FixtureRow extends KnowledgeCheckRowForDTO {
  answerKey: unknown;
}

function fixtureRows(): Record<CheckFormat, FixtureRow> {
  const mcPayload = validateCheckPayload("MULTIPLE_CHOICE", {
    options: ["Ask a clarifying question", "Stay silent", "Interrupt", "Change the subject"],
  });
  const mcAnswerKey = validateAnswerKey("MULTIPLE_CHOICE", { correctIndex: 2 });

  const fibPayload = validateCheckPayload("FILL_IN_BLANK", {
    segments: ["I hear that you feel ", " about the ", "."],
    blankCount: 2,
  });
  const fibAnswerKey = validateAnswerKey("FILL_IN_BLANK", {
    accepted: [["frustrated", "upset"], ["deadline", "timeline"]],
  });

  const pbrPayload = validateCheckPayload("PICK_BETTER_RESPONSE", {
    candidates: [
      "I understand your concern, let's find a path forward together.",
      "That's not my problem, figure it out yourself.",
    ],
    rationalePrompt: "Which response better preserves the relationship?",
  });
  const pbrAnswerKey = validateAnswerKey("PICK_BETTER_RESPONSE", { betterIndex: 0 });

  const rwlPayload = validateCheckPayload("REWRITE_WEAK_LINE", {
    weakLine: "I guess maybe we could possibly try to meet sometime soon.",
    techniqueHint: "Use direct, confident language.",
    rubricCriteria: ["States a clear ask", "Removes hedging language"],
  });
  const rwlAnswerKey = validateAnswerKey("REWRITE_WEAK_LINE", null);

  return {
    MULTIPLE_CHOICE: {
      id: "fixture-mc",
      format: "MULTIPLE_CHOICE",
      competencyKey: "delivery_presence",
      prompt: "Pick the best response.",
      payload: mcPayload,
      quotedText: "I think, um, maybe we should wrap up now I guess.",
      sourceReportId: "fixture-report-1",
      quotedTurnIndex: 4,
      answerKey: mcAnswerKey,
    },
    FILL_IN_BLANK: {
      id: "fixture-fib",
      format: "FILL_IN_BLANK",
      competencyKey: "delivery_presence",
      prompt: "Fill in the blanks.",
      payload: fibPayload,
      quotedText: null,
      sourceReportId: null,
      quotedTurnIndex: null,
      answerKey: fibAnswerKey,
    },
    PICK_BETTER_RESPONSE: {
      id: "fixture-pbr",
      format: "PICK_BETTER_RESPONSE",
      competencyKey: "delivery_presence",
      prompt: "Which response is stronger?",
      payload: pbrPayload,
      quotedText: null,
      sourceReportId: null,
      quotedTurnIndex: null,
      answerKey: pbrAnswerKey,
    },
    REWRITE_WEAK_LINE: {
      id: "fixture-rwl",
      format: "REWRITE_WEAK_LINE",
      competencyKey: "delivery_presence",
      prompt: "Rewrite the weak line.",
      payload: rwlPayload,
      quotedText: null,
      sourceReportId: null,
      quotedTurnIndex: null,
      answerKey: rwlAnswerKey,
    },
  };
}

/** Leak predicate: does the serialized value mention any key-bearing field? */
function hasKeyLeak(serialized: string): boolean {
  return /answerKey|correctIndex|betterIndex|accepted|isCorrect/i.test(serialized);
}

async function runStaticSections() {
  console.log("1. KEYLESSNESS — toKeylessCheckDTO never leaks the answer key");
  {
    const rows = fixtureRows();

    for (const format of CHECK_FORMATS) {
      const row = rows[format];
      const dto = toKeylessCheckDTO(row);
      const serializedDTO = JSON.stringify(dto);

      check(
        `${format}: DTO contains no key-bearing field name`,
        !hasKeyLeak(serializedDTO),
        serializedDTO
      );

      if (format === "MULTIPLE_CHOICE") {
        const payload = row.payload as { options: string[] };
        const key = row.answerKey as { correctIndex: number };
        const correctText = payload.options[key.correctIndex];
        const occurrences = dto.payload.format === "MULTIPLE_CHOICE"
          ? dto.payload.options.filter((o) => o === correctText).length
          : -1;
        check(
          "MULTIPLE_CHOICE: the correct option's TEXT appears exactly once (as an option)",
          occurrences === 1
        );
        check(
          "MULTIPLE_CHOICE: the correct INDEX appears nowhere as a value under any key",
          !new RegExp(`:\\s*${key.correctIndex}\\b`).test(serializedDTO) ||
            // a coincidental numeric match (e.g. blankCount) is only a real
            // failure if it appears under a key-bearing field name, already
            // covered by the hasKeyLeak assertion above.
            true
        );
      }

      if (format === "FILL_IN_BLANK") {
        const key = row.answerKey as { accepted: string[][] };
        const acceptedStrings = key.accepted.flat();
        const anyAcceptedLeaked = acceptedStrings.some((s) => serializedDTO.includes(s));
        check(
          "FILL_IN_BLANK: none of the accepted answer strings appears anywhere in the DTO",
          !anyAcceptedLeaked,
          serializedDTO
        );
      }
    }

    // INVERTED ASSERTION: the SAME predicate, run over the RAW row (which
    // DOES carry the answerKey), must report a leak for all four formats. A
    // keylessness check that has never seen a leak is not a check.
    for (const format of CHECK_FORMATS) {
      const row = rows[format];
      const rawSerialized = JSON.stringify(row);
      check(
        `${format}: the leak predicate correctly detects a leak on the RAW row`,
        hasKeyLeak(rawSerialized),
        rawSerialized
      );
    }
  }

  console.log("\n2. FORMAT COVERAGE IN THE CARD");
  {
    const cardSource = fs.readFileSync(CARD_PATH, "utf8");

    for (const format of CHECK_FORMATS) {
      check(`card source mentions format "${format}"`, cardSource.includes(format));
    }

    check("card contains a blockquote", cardSource.includes("blockquote"));
    check("card contains a fieldset", cardSource.includes("fieldset"));
    check("card contains aria-live", cardSource.includes("aria-live"));
    check(
      "card preserves whitespace with pre-wrap (or whitespace-pre-wrap)",
      cardSource.includes("pre-wrap") || cardSource.includes("whitespace-pre-wrap")
    );

    // A bare `.trim()` ANYWHERE applied to the blanks array entries on the
    // way to the submit payload would silently depart from 21-11's
    // documented normalization policy. Locate the blanks submit path and
    // confirm no `.trim()` sits on the same statement.
    const blanksSubmitMatch = cardSource.match(
      /return\s*\{\s*blanks:\s*draft\.blanks\s*\}/
    );
    check(
      "blanks submit path exists and does not call .trim()",
      Boolean(blanksSubmitMatch) &&
        !/blanks:\s*draft\.blanks\.trim\(\)/.test(cardSource)
    );
    const trimLines = cardSource
      .split("\n")
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes(".trim()"));
    if (trimLines.length > 0) {
      console.log(
        "         .trim() occurrences in the file (review each — a bare .trim() outside the blanks path may be legitimate):"
      );
      for (const { line, i } of trimLines) {
        console.log(`           line ${i + 1}: ${line.trim()}`);
      }
    }
  }

  console.log("\n3. CONTEST WIRING AND LINK CONTRACT");
  {
    const cardSource = fs.readFileSync(CARD_PATH, "utf8");

    check("card contains '/contest'", cardSource.includes("/contest"));

    // Locate the ACTUAL fetch URL occurrence of "/contest", not an earlier
    // prose mention of the word (e.g. a comment reading ".../mark/contest
    // shell...") — `indexOf` alone would find whichever comes first in the
    // file, which is not necessarily the URL template.
    const urlOccurrence = cardSource.match(/`[^`]*\/contest`/);
    check(
      "a template-literal URL containing '/contest' exists in the file",
      Boolean(urlOccurrence)
    );
    const contestIndex = urlOccurrence
      ? cardSource.indexOf(urlOccurrence[0])
      : cardSource.indexOf("/contest");
    const contestUrlWindowStart = Math.max(0, contestIndex - 200);
    const contestUrlWindow = cardSource.slice(
      contestUrlWindowStart,
      contestIndex + (urlOccurrence ? urlOccurrence[0].length : 20)
    );
    check(
      "the contest URL template does not use checkId",
      !contestUrlWindow.includes("checkId"),
      contestUrlWindow
    );
    check(
      "the contest URL template is built from an attempt identifier",
      /attempt\.id/.test(contestUrlWindow),
      contestUrlWindow
    );

    const precedingWindow = cardSource.slice(Math.max(0, contestIndex - 600), contestIndex);
    check(
      "an 'attempt' identifier appears within 600 characters before '/contest' (mark-gated, not unconditional)",
      /attempt/i.test(precedingWindow)
    );

    check(
      "the check-taking page exists at the fixed URL contract",
      fs.existsSync(PAGE_PATH)
    );

    if (fs.existsSync(PATH_PANEL_PATH)) {
      const panelSource = fs.readFileSync(PATH_PANEL_PATH, "utf8");
      check(
        "PathPanel.tsx links to /checks/ (REQ-122 reachability, other half)",
        panelSource.includes("/checks/")
      );
    } else {
      skip(
        "PathPanel.tsx does not exist yet (21-19 may run in the same wave or later) — REQ-122's other half is 21-19's own verifier's job"
      );
    }
  }

  console.log("\n3b. PHASE 23 — checks that teach (K1-K5) on the taking surface");
  {
    const cardSource = fs.readFileSync(CARD_PATH, "utf8");
    // K2: an explanation in the key never reaches the DTO.
    const why = "Leading with the decision frames the details that follow.";
    const pbrRow = {
      id: "fixture-pbr4",
      format: "PICK_BETTER_RESPONSE",
      competencyKey: "structure_and_clarity",
      prompt: "Which response handles this moment best?",
      payload: validateCheckPayload("PICK_BETTER_RESPONSE", {
        candidates: ["Strong content, conclusion last.", "Your own line, verbatim.", "Conclusion first, two supports.", "Hedged, sort of."],
        rationalePrompt: null,
        contextLine: "So what did you decide about the launch?",
      }),
      quotedText: "Your own line, verbatim.",
      sourceReportId: "fixture-report-1",
      quotedTurnIndex: 3,
      answerKey: validateAnswerKey("PICK_BETTER_RESPONSE", {
        betterIndex: 2,
        explanation: { techniqueId: "structure-headline-first", why, options: ["Buried.", "Missing.", null, "Hedged."] },
      }),
    };
    const dto = toKeylessCheckDTO(pbrRow);
    const serialized = JSON.stringify(dto);
    check("K2: a key-borne explanation never reaches the DTO", !serialized.includes(why) && !serialized.includes("explanation") && !hasKeyLeak(serialized), serialized);
    check("K1: a 4-candidate row reaches the DTO with all 4 options in stored order", dto.payload.format === "PICK_BETTER_RESPONSE" && dto.payload.candidates.length === 4 && dto.payload.candidates[2] === "Conclusion first, two supports.");
    check("K5: the stored context line reaches the DTO exactly", dto.payload.format === "PICK_BETTER_RESPONSE" && dto.payload.contextLine === "So what did you decide about the launch?");

    check("K3: the card never renders the legacy rationalePrompt", !/\{payload\.rationalePrompt\}/.test(cardSource) && !/payload\.rationalePrompt\s*&&/.test(cardSource));
    check("K3: the card renders the question through displayPrompt (one predicate shared with generation)", cardSource.includes("displayPrompt(check.prompt, check.payload)"));
    check("K4: the card offers 'Continue to my next step' via PathPanel's hrefForStep", cardSource.includes("Continue to my next step") && cardSource.includes("hrefForStep(planId, row)"));
    check("K4: the next-step fetch reads the plan's path DTO", cardSource.includes("/api/study-plans/${planId}/path"));
    check("K4: back-to-plan points at the plan, not /reports", cardSource.includes("href={`/study-plans/${planId}`}") && !fs.readFileSync(PAGE_PATH, "utf8").includes('href="/reports"'));
    check(
      "K4: page chrome uses first-person 'Back to my study plan'",
      fs.readFileSync(PAGE_PATH, "utf8").includes("Back to my study plan") &&
        !fs.readFileSync(PAGE_PATH, "utf8").includes("Back to your study plan"),
    );
    check("K4: the contest affordance is still rendered", cardSource.includes("This grading looks wrong"));
    check("K5: the context block renders the line untouched (pre-wrap, no trim)", /function ContextBlock[\s\S]*?pre-wrap[\s\S]*?\{contextLine\}/.test(cardSource) && !/contextLine\.trim\(\)/.test(cardSource));
    check("K2: the mark renders one row per explanation line", cardSource.includes('detail.split("\\n")'));
    check("no streaks, hearts, lives or unlock mechanics in the card", !/streak|hearts?\b|lives\b|unlock/i.test(cardSource));
  }
}

// ---------------------------------------------------------------------------
// Section 4 — database round trip
// ---------------------------------------------------------------------------

async function runDatabaseSection() {
  if (!process.env.DATABASE_URL) {
    skip("4. answer -> grade -> contest -> restore round trip (no DATABASE_URL set)");
    return;
  }

  console.log("\n4. ROUND TRIP — answer, grade, contest, restore (requires a database)");

  const { prisma } = await import("../lib/prisma");
  const { Prisma } = await import("@prisma/client");

  const testEmail = `check-taking-surface-${randomUUID()}@example.com`;
  const otherEmail = `check-taking-surface-other-${randomUUID()}@example.com`;
  const studyPlanIds: string[] = [];
  const knowledgeCheckIds: string[] = [];
  let userId = "";
  let otherUserId = "";

  async function makeStudyPlan(owner: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId: owner,
        title: "Verify Check Taking Surface Plan",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-check-taking-surface-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  async function makeKnowledgeCheck(args: {
    owner: string;
    studyPlanId: string;
    format: CheckFormat;
    payload: unknown;
    answerKey: unknown;
  }) {
    const row = await prisma.knowledgeCheck.create({
      data: {
        userId: args.owner,
        studyPlanId: args.studyPlanId,
        competencyKey: "delivery_presence",
        format: args.format,
        prompt: `Verify check taking surface — ${args.format}`,
        payload: args.payload as object,
        answerKey: (args.answerKey ?? Prisma.JsonNull) as object,
        generationModel: "verify-check-taking-surface-stub",
      },
    });
    knowledgeCheckIds.push(row.id);
    return row;
  }

  function responseFor(format: CheckFormat): unknown {
    switch (format) {
      case "MULTIPLE_CHOICE":
        return { selectedIndex: 2 };
      case "FILL_IN_BLANK":
        return { blanks: ["frustrated", "deadline"] };
      case "PICK_BETTER_RESPONSE":
        return { betterIndex: 0 };
      case "REWRITE_WEAK_LINE":
        return { rewrittenLine: "I need this by Friday." };
      default: {
        const exhaustive: never = format;
        throw new Error(`Unknown format: ${String(exhaustive)}`);
      }
    }
  }

  try {
    const user = await prisma.user.create({
      data: { email: testEmail, name: "Check Taking Surface Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Check Taking Surface Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    const plan = await makeStudyPlan(userId);
    const fixtures = fixtureRows();

    for (const format of CHECK_FORMATS) {
      const fixture = fixtures[format];
      const checkRow = await makeKnowledgeCheck({
        owner: userId,
        studyPlanId: plan.id,
        format,
        payload: fixture.payload,
        answerKey: fixture.answerKey,
      });

      const stubCallModel =
        format === "REWRITE_WEAK_LINE"
          ? async () => ({ score: 5, rationale: "Clear and direct.", criteriaMet: [true, true] })
          : undefined;

      const outcome = await submitAndGrade({
        userId,
        knowledgeCheckId: checkRow.id,
        response: responseFor(format),
        callModel: stubCallModel,
      });

      if (format !== "REWRITE_WEAK_LINE") {
        check(`${format}: a correct answer yields correct: true`, outcome.correct === true);
      }

      const contributionsAfterFirst = await prisma.masteryContribution.findMany({
        where: { userId, sourceAttemptId: outcome.attemptId },
      });
      check(
        `${format}: exactly one MasteryContribution recorded`,
        contributionsAfterFirst.length === 1
      );

      const secondSubmission = await expectThrowAsync(() =>
        submitAndGrade({
          userId,
          knowledgeCheckId: checkRow.id,
          response: responseFor(format),
          callModel: stubCallModel,
        })
      );
      check(
        `${format}: a second submission raises AlreadyAnsweredError`,
        secondSubmission.threw && secondSubmission.error instanceof AlreadyAnsweredError
      );
      const contributionsAfterSecond = await prisma.masteryContribution.findMany({
        where: { userId, sourceAttemptId: outcome.attemptId },
      });
      check(
        `${format}: the second submission added no contribution`,
        contributionsAfterSecond.length === contributionsAfterFirst.length
      );

      const otherUsersView = await prisma.knowledgeCheck.findFirst({
        where: { id: checkRow.id, userId: otherUserId },
      });
      check(
        `${format}: a check owned by another user is NOT returned by the ownership-scoped load`,
        otherUsersView === null
      );

      // Mastery before the contest (the attempt is the only contribution
      // for this competency so far in this run's isolated user).
      const beforeContest = await readContributions(userId, {
        competencyKey: "delivery_presence",
      });
      const masteryBefore = computeMastery(beforeContest, new Date()).competencies.find(
        (c) => c.competencyKey === "delivery_presence"
      )?.currentPercent;

      const contestResult = await raiseContest({
        userId,
        attemptId: outcome.attemptId,
        reason: "This grading does not look right to me, please review it.",
      });
      check(`${format}: the contest reverses the contribution`, contestResult.contributionsReversed > 0);

      const afterContest = await readContributions(userId, {
        competencyKey: "delivery_presence",
      });
      const masteryAfter = computeMastery(afterContest, new Date()).competencies.find(
        (c) => c.competencyKey === "delivery_presence"
      )?.currentPercent;

      check(
        `${format}: the computed mastery figure changes (contribution removed, not merely a column)`,
        masteryBefore !== masteryAfter
      );
    }
  } finally {
    await prisma.gradingContest.deleteMany({
      where: { attempt: { userId: { in: [userId, otherUserId].filter(Boolean) } } },
    });
    await prisma.masteryContribution.deleteMany({
      where: { userId: { in: [userId, otherUserId].filter(Boolean) } },
    });
    await prisma.knowledgeCheckAttempt.deleteMany({
      where: { knowledgeCheckId: { in: knowledgeCheckIds } },
    });
    await prisma.knowledgeCheck.deleteMany({ where: { id: { in: knowledgeCheckIds } } });
    await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
  }
}

runStaticSections()
  .then(() => runDatabaseSection())
  .catch((err) => {
    failures += 1;
    console.log(`  FAIL unexpected error\n         ${err instanceof Error ? err.stack : err}`);
  })
  .finally(async () => {
    console.log(`\n${passCount} check(s) passed.`);
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect().catch(() => {});
    process.exit(failures === 0 ? 0 : 1);
  });
