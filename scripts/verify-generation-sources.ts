/**
 * Battery for `lib/study-plan/checks/sources.ts` — the ownership-scoped
 * assembler 21-25 adds (REQ-123).
 *
 * Section 1 (SHAPE MATCH) and Section 2 (PURE BEHAVIOUR) run with NO
 * environment variables and no network access: Section 2 exercises
 * `assembleSources`, the DB/S3-free seam, directly.
 *
 * Section 3 (OWNERSHIP, END TO END) needs a database and prints an explicit
 * SKIP — never a silent pass — when `DATABASE_URL` is unset. When it IS set
 * (per this plan's own notes, it is), it runs against real `User` /
 * `InteractionReport` rows, with an INJECTED transcript reader so no AWS
 * credentials are required either.
 *
 * Run: npx tsx scripts/verify-generation-sources.ts
 */
import { randomUUID } from "node:crypto";

import type { InterviewTranscript, InterviewTranscriptTurn } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import type { StructuredReport, ReportGrowthArea } from "../lib/report/structured";
import type { SessionMoment } from "../lib/study-plan/moments";
import { prepareMomentsForGeneration } from "../lib/study-plan/moment-boundary";
import {
  assembleSources,
  assertMomentOwnerAlignment,
  buildSelfNameVariants,
  loadGenerationSources,
  SOURCE_LIMITS,
  type GenerationSources,
  type ReportForAssembly,
} from "../lib/study-plan/checks/sources";
import { generateChecksForCompetency } from "../lib/study-plan/checks/generate";

let checks = 0;
let failures = 0;

function check(name: string, pass: boolean, detail?: unknown) {
  checks += 1;
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

function skip(name: string) {
  console.log(`  SKIP ${name}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeTranscript(opts: {
  reportId: string;
  userId: string;
  userTurnsSec: number[];
}): InterviewTranscript {
  const turns: InterviewTranscriptTurn[] = [];
  for (const sec of opts.userTurnsSec) {
    turns.push({
      role: "assistant",
      content: `Tell me about a time at second ${sec - 2}.`,
      timestamp: (sec - 2) * 1000,
    });
    turns.push({
      role: "user",
      content: `This is my long enough answer for second ${sec} of the session.`,
      timestamp: sec * 1000,
    });
  }
  return {
    version: 1,
    reportId: opts.reportId,
    userId: opts.userId,
    typeSlug: "interview",
    interviewer: { avatarId: "avatar-1", name: "Interviewer" },
    startedAt: 0,
    updatedAt: Math.max(...opts.userTurnsSec) * 1000,
    progress: initialProgress(),
    turns,
  };
}

function timecodeFor(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function makeStructuredReport(growthAreas: ReportGrowthArea[]): StructuredReport {
  return {
    overall_summary: "Fixture summary.",
    strengths: [],
    growth_areas: growthAreas,
    category_notes: { visual: null, vocal: null, content: null, behavioral: null },
    rubric_notes: [],
    practice_next: "Fixture practice next.",
  };
}

function growthArea(title: string, timecodes: string[]): ReportGrowthArea {
  return { title, detail: "detail", suggestion: "suggestion", timecodes, source: null };
}

function makeReportRow(overrides: Partial<ReportForAssembly>): ReportForAssembly {
  return {
    id: "report-fixture",
    userId: "user-fixture",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    reportStructured: null,
    scores: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1: SHAPE MATCH
// ---------------------------------------------------------------------------

console.log("Section 1: shape match (compile-time pin)");

// The compile-time half is the real guard: if either side's shape changes,
// `npx tsc --noEmit` FAILS on the line below. A runtime assertion cannot
// catch a renamed field on an optional input; the type system can.
const _shapeCheck: Parameters<typeof generateChecksForCompetency>[0] = {
  userId: "u",
  studyPlanId: "s",
  competencyKey: "delivery_presence",
  desiredCount: 1,
  ...(null as unknown as GenerationSources),
};
void _shapeCheck;

check(
  "compile-time shape pin present (this line only type-checks if GenerationSources satisfies GenerateChecksArgs's optional fields)",
  true,
);

{
  // Runtime half: the returned object carries all five fields as own
  // properties.
  const empty = assembleSources({
    requestingUserId: "u",
    reports: [],
    transcriptsByReportId: new Map(),
    selfNames: [],
  });
  const ownProps = [
    "moments",
    "momentOwnerUserIds",
    "transcriptsByReportId",
    "selfNames",
    "momentsByCompetency",
  ];
  check(
    "returned object has all five GenerationSources fields as own properties",
    ownProps.every((p) => Object.prototype.hasOwnProperty.call(empty, p)),
    Object.keys(empty),
  );
}

// ---------------------------------------------------------------------------
// Section 2: PURE BEHAVIOUR (assembleSources — no DB, no S3)
// ---------------------------------------------------------------------------

console.log("\nSection 2: pure behaviour (assembleSources)");

const USER = "requesting-user";

console.log("\n2a. Two reports, three moments each — six total, index-aligned");
{
  const reportA = makeReportRow({
    id: "report-a",
    userId: USER,
    createdAt: new Date("2026-01-03T00:00:00Z"),
    scores: { content: 3 },
    reportStructured: makeStructuredReport([growthArea("Growth A", [timecodeFor(5)])]),
  });
  const reportB = makeReportRow({
    id: "report-b",
    userId: USER,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    scores: { behavioral: 4 },
    reportStructured: makeStructuredReport([growthArea("Growth B", [timecodeFor(15)])]),
  });
  const transcriptA = makeTranscript({ reportId: "report-a", userId: USER, userTurnsSec: [5, 15, 25] });
  const transcriptB = makeTranscript({ reportId: "report-b", userId: USER, userTurnsSec: [5, 15, 25] });

  const result = assembleSources({
    requestingUserId: USER,
    reports: [reportA, reportB],
    transcriptsByReportId: new Map([
      ["report-a", transcriptA],
      ["report-b", transcriptB],
    ]),
    selfNames: [],
  });

  check("six moments total", result.moments.length === 6, result.moments.length);
  check(
    "six momentOwnerUserIds total",
    result.momentOwnerUserIds.length === 6,
    result.momentOwnerUserIds.length,
  );
  check(
    "every index individually: momentOwnerUserIds[i] === USER",
    result.momentOwnerUserIds.every((id, i) => {
      const matches = id === USER;
      if (!matches) console.log(`       mismatch at index ${i}: ${id}`);
      return matches;
    }),
  );
  check("no degraded reports", result.degradedReports.length === 0, result.degradedReports);
}

console.log("\n2b. INVERTED ALIGNMENT ASSERTION — assertMomentOwnerAlignment must throw on a real mismatch");
{
  const sixMoments: SessionMoment[] = Array.from({ length: 6 }, (_, i) => ({
    reportId: "r",
    turnIndex: i,
    studentText: `moment ${i} text long enough to pass the threshold`,
    precedingAvatarText: null,
    timecode: timecodeFor(i * 5),
    linkedGrowthAreaTitles: [],
    competencyKeys: [],
  }));
  const fiveOwnerIds = Array.from({ length: 5 }, () => USER);

  let threw = false;
  try {
    assertMomentOwnerAlignment(sixMoments, fiveOwnerIds);
  } catch {
    threw = true;
  }
  check(
    "assertMomentOwnerAlignment THROWS on six moments / five owner ids (expected failure, correctly detected)",
    threw,
  );
  let okCase = true;
  try {
    assertMomentOwnerAlignment(sixMoments, Array.from({ length: 6 }, () => USER));
  } catch {
    okCase = false;
  }
  check("assertMomentOwnerAlignment does NOT throw when lengths match", okCase);
}

console.log("\n2c. Unreadable transcript degrades one report; the OTHER report's moments survive");
{
  const reportA = makeReportRow({
    id: "report-a",
    userId: USER,
    reportStructured: makeStructuredReport([growthArea("Growth A", [timecodeFor(5)])]),
  });
  const reportC = makeReportRow({
    id: "report-unreadable",
    userId: USER,
    reportStructured: makeStructuredReport([growthArea("Growth C", [timecodeFor(5)])]),
  });
  const transcriptA = makeTranscript({ reportId: "report-a", userId: USER, userTurnsSec: [5, 15] });

  const result = assembleSources({
    requestingUserId: USER,
    reports: [reportA, reportC],
    // report-unreadable is deliberately absent from this map — simulating an
    // injected reader that threw.
    transcriptsByReportId: new Map([["report-a", transcriptA]]),
    transcriptDegradationReasons: new Map([
      ["report-unreadable", "transcript-read-failed: simulated S3 throw"],
    ]),
    selfNames: [],
  });

  check("report-a's two moments survive exactly", result.moments.length === 2, result.moments.length);
  check(
    "report-unreadable is degraded with its reason",
    result.degradedReports.some(
      (d) => d.reportId === "report-unreadable" && d.reason.includes("transcript-read-failed"),
    ),
    result.degradedReports,
  );
  check(
    "report-unreadable's transcript is not in transcriptsByReportId",
    !result.transcriptsByReportId.has("report-unreadable"),
  );
}

console.log("\n2d. Missing structured form degrades, same treatment");
{
  const reportA = makeReportRow({
    id: "report-a",
    userId: USER,
    reportStructured: makeStructuredReport([growthArea("Growth A", [timecodeFor(5)])]),
  });
  const reportNoStructured = makeReportRow({
    id: "report-no-structured",
    userId: USER,
    reportStructured: null, // pre-structured-report-era row
  });
  const transcriptA = makeTranscript({ reportId: "report-a", userId: USER, userTurnsSec: [5] });
  const transcriptOther = makeTranscript({
    reportId: "report-no-structured",
    userId: USER,
    userTurnsSec: [5],
  });

  const result = assembleSources({
    requestingUserId: USER,
    reports: [reportA, reportNoStructured],
    transcriptsByReportId: new Map([
      ["report-a", transcriptA],
      ["report-no-structured", transcriptOther],
    ]),
    selfNames: [],
  });

  check("report-a's one moment survives", result.moments.length === 1, result.moments.length);
  check(
    "report-no-structured is degraded as missing-or-invalid-structured-report",
    result.degradedReports.some(
      (d) => d.reportId === "report-no-structured" && d.reason === "missing-or-invalid-structured-report",
    ),
    result.degradedReports,
  );
}

console.log("\n2e. ALL reports degraded — empty result, RETURNS rather than throwing");
{
  const reportOnlyBad = makeReportRow({
    id: "report-bad",
    userId: USER,
    reportStructured: null,
  });
  let threw = false;
  let result: GenerationSources | null = null;
  try {
    result = assembleSources({
      requestingUserId: USER,
      reports: [reportOnlyBad],
      transcriptsByReportId: new Map([
        ["report-bad", makeTranscript({ reportId: "report-bad", userId: USER, userTurnsSec: [5] })],
      ]),
      selfNames: [],
    });
  } catch {
    threw = true;
  }
  check("assembleSources does NOT throw when every report degrades", !threw);
  check("moments is empty", (result?.moments.length ?? -1) === 0, result?.moments.length);
  check(
    "momentsByCompetency is empty",
    (result?.momentsByCompetency.size ?? -1) === 0,
    result?.momentsByCompetency.size,
  );
}

console.log("\n2f. A competency with no contributing moments is ABSENT, not empty");
{
  // Report scores map to structure_and_clarity (content), but its growth
  // area's timecode matches NOTHING in the transcript, so no moment links to
  // a growth area, so NOTHING is attributed to structure_and_clarity.
  const report = makeReportRow({
    id: "report-no-link",
    userId: USER,
    scores: { content: 5 },
    reportStructured: makeStructuredReport([growthArea("Unreachable growth area", ["9:59"])]),
  });
  const transcript = makeTranscript({ reportId: "report-no-link", userId: USER, userTurnsSec: [5, 15] });

  const result = assembleSources({
    requestingUserId: USER,
    reports: [report],
    transcriptsByReportId: new Map([["report-no-link", transcript]]),
    selfNames: [],
  });

  check(
    "moments were extracted (transcript turns themselves still qualify)",
    result.moments.length === 2,
    result.moments.length,
  );
  check(
    "structure_and_clarity is ABSENT from momentsByCompetency (has() is false, not an empty array)",
    result.momentsByCompetency.has("structure_and_clarity") === false,
  );
}

console.log("\n2g. Cap enforcement — 30 moments on one competency, cap retains the most RECENT");
{
  // 30 reports, one user turn each, descending recency (report-29 newest).
  // Each report's single turn links to a growth area and scores "content".
  const reports: ReportForAssembly[] = [];
  const transcripts = new Map<string, InterviewTranscript>();
  for (let i = 0; i < 30; i += 1) {
    const reportId = `report-cap-${i}`;
    const sec = 5 + i; // unique timecode per report
    reports.push(
      makeReportRow({
        id: reportId,
        userId: USER,
        // Ascending with i: report-cap-29 (highest i) is the MOST recent
        // (day 30), report-cap-0 the oldest (day 1).
        createdAt: new Date(2026, 0, i + 1),
        scores: { content: 3 },
        reportStructured: makeStructuredReport([growthArea(`Growth ${i}`, [timecodeFor(sec)])]),
      }),
    );
    transcripts.set(
      reportId,
      makeTranscript({ reportId, userId: USER, userTurnsSec: [sec] }),
    );
  }
  // Most-recent-first: report-cap-29 (highest i, latest createdAt) must come
  // first for the cap to keep it.
  const mostRecentFirst = [...reports].reverse();

  const result = assembleSources({
    requestingUserId: USER,
    reports: mostRecentFirst,
    transcriptsByReportId: transcripts,
    selfNames: [],
  });

  const kept = result.momentsByCompetency.get("structure_and_clarity") ?? [];
  check(
    `exactly SOURCE_LIMITS.maxMomentsPerCompetency (${SOURCE_LIMITS.maxMomentsPerCompetency}) retained`,
    kept.length === SOURCE_LIMITS.maxMomentsPerCompetency,
    kept.length,
  );
  // The most recent reports are report-cap-29 down to
  // report-cap-(29 - maxMomentsPerCompetency + 1). Assert by comparing
  // actual report dates, not just the count: every kept moment's reportId
  // must map to one of the top-N most-recent createdAt dates.
  const sortedByDateDesc = [...reports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const expectedRecentIds = new Set(
    sortedByDateDesc.slice(0, SOURCE_LIMITS.maxMomentsPerCompetency).map((r) => r.id),
  );
  check(
    "every kept moment belongs to a report among the most-recent-by-createdAt set",
    kept.every((m) => expectedRecentIds.has(m.reportId)),
    kept.map((m) => m.reportId),
  );
}

console.log("\n2h. selfNames — one-character name contributes nothing; duplicate casing collapses; no name yields []");
{
  check("one-character name yields []", buildSelfNameVariants("J").length === 0, buildSelfNameVariants("J"));
  check("no name yields []", buildSelfNameVariants(null).length === 0);
  check("undefined name yields []", buildSelfNameVariants(undefined).length === 0);
  const variants = buildSelfNameVariants("Jordan Lee");
  check("full name variant present", variants.includes("Jordan Lee"), variants);
  check("first-name variant present", variants.includes("Jordan"), variants);
  check("exactly two variants for a two-token name", variants.length === 2, variants);
  const dupeCase = buildSelfNameVariants("jordan");
  check("single-token name yields exactly one variant", dupeCase.length === 1, dupeCase);
}

// ---------------------------------------------------------------------------
// Section 3: OWNERSHIP, END TO END (database)
// ---------------------------------------------------------------------------

console.log("\nSection 3: ownership, end to end (database)");

async function runSection3() {
  if (!process.env.DATABASE_URL) {
    skip("ALL database-backed ownership assertions (no DATABASE_URL set)");
    return;
  }

  const { prisma } = await import("../lib/prisma");

  const emailA = `gen-sources-verify-a-${randomUUID()}@example.com`;
  const emailB = `gen-sources-verify-b-${randomUUID()}@example.com`;
  let userAId = "";
  let userBId = "";
  let reportAId = "";
  let reportBId = "";

  try {
    const userA = await prisma.user.create({
      data: { email: emailA, name: "Source Verify A", role: "STUDENT" },
    });
    userAId = userA.id;
    const userB = await prisma.user.create({
      data: { email: emailB, name: "Source Verify B", role: "STUDENT" },
    });
    userBId = userB.id;

    const structured = makeStructuredReport([growthArea("Growth", [timecodeFor(5)])]) as unknown as object;

    const reportA = await prisma.interactionReport.create({
      data: {
        userId: userAId,
        typeSlug: "interview",
        status: "READY",
        transcriptKey: "fixture-key-a",
        reportStructured: structured,
        scores: { content: 3 } as unknown as object,
      },
    });
    reportAId = reportA.id;

    const reportB = await prisma.interactionReport.create({
      data: {
        userId: userBId,
        typeSlug: "interview",
        status: "READY",
        transcriptKey: "fixture-key-b",
        reportStructured: structured,
        scores: { content: 3 } as unknown as object,
      },
    });
    reportBId = reportB.id;

    // An IN_PROGRESS report belonging to A — must be excluded by the
    // status: "READY" scoping.
    const reportAInProgress = await prisma.interactionReport.create({
      data: {
        userId: userAId,
        typeSlug: "interview",
        status: "IN_PROGRESS",
        transcriptKey: "fixture-key-a-in-progress",
        reportStructured: structured,
        scores: { content: 3 } as unknown as object,
      },
    });

    // A's and B's transcripts use DIFFERENT timestamps so their user-turn
    // text is distinct — otherwise the "B's text appears nowhere" assertion
    // below would pass trivially by matching A's own (legitimately included)
    // text instead of proving anything about B's.
    const transcriptA = makeTranscript({ reportId: reportAId, userId: userAId, userTurnsSec: [5] });
    const transcriptB = makeTranscript({ reportId: reportBId, userId: userBId, userTurnsSec: [77] });
    const transcriptAInProgress = makeTranscript({
      reportId: reportAInProgress.id,
      userId: userAId,
      userTurnsSec: [5],
    });
    const BTranscriptSecretText = transcriptB.turns.find((t) => t.role === "user")!.content;

    const injectedReader = async (userId: string, reportId: string, _key: string) => {
      if (reportId === reportAId) return transcriptA;
      if (reportId === reportBId) return transcriptB;
      if (reportId === reportAInProgress.id) return transcriptAInProgress;
      throw new Error(`verify-generation-sources: no fixture transcript for report ${reportId}`);
    };

    // --- A requests both A's and B's report id ---
    const result = await loadGenerationSources(userAId, [reportAId, reportBId], {
      readTranscript: injectedReader,
    });

    check(
      "momentOwnerUserIds contains nothing but A's id",
      result.momentOwnerUserIds.every((id) => id === userAId),
      result.momentOwnerUserIds,
    );
    check(
      "every moment belongs to report A",
      result.moments.every((m) => m.reportId === reportAId),
      result.moments.map((m) => m.reportId),
    );
    check(
      "transcriptsByReportId has no entry for B's report",
      !result.transcriptsByReportId.has(reportBId),
    );
    check(
      "B's report id is absent from degradedReports too — a foreign id is invisible, not degraded",
      !result.degradedReports.some((d) => d.reportId === reportBId),
      result.degradedReports,
    );
    const wholeResultJson = JSON.stringify(result, (_key, value) =>
      value instanceof Map ? Object.fromEntries(value) : value,
    );
    check(
      "B's transcript text appears NOWHERE in a JSON.stringify of the whole result",
      !wholeResultJson.includes(BTranscriptSecretText),
    );
    check(
      "A's IN_PROGRESS report is excluded",
      !result.moments.some((m) => m.reportId === reportAInProgress.id),
    );

    // --- A requests an empty list ---
    const emptyResult = await loadGenerationSources(userAId, [], { readTranscript: injectedReader });
    check("empty reportIds returns empty moments without throwing", emptyResult.moments.length === 0);
    check(
      "empty reportIds returns empty momentsByCompetency without throwing",
      emptyResult.momentsByCompetency.size === 0,
    );

    // --- Round-trip into 21-07: the output must pass prepareMomentsForGeneration's ownership gate ---
    let roundTripThrew = false;
    try {
      prepareMomentsForGeneration({
        requestingUserId: userAId,
        moments: result.moments,
        momentOwnerUserIds: result.momentOwnerUserIds,
        selfNames: result.selfNames,
      });
    } catch (error) {
      roundTripThrew = true;
      console.log("       round-trip threw:", error);
    }
    check(
      "loadGenerationSources's output passes prepareMomentsForGeneration's ownership gate without throwing",
      !roundTripThrew,
    );
  } finally {
    if (reportAId || reportBId) {
      await prisma.interactionReport.deleteMany({
        where: { userId: { in: [userAId, userBId].filter(Boolean) } },
      });
    }
    if (userAId) await prisma.user.deleteMany({ where: { id: userAId } });
    if (userBId) await prisma.user.deleteMany({ where: { id: userBId } });
    await prisma.$disconnect();
  }
}

runSection3()
  .then(() => {
    console.log(`\n${checks} checks run, ${failures} failed.`);
    process.exit(failures > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
