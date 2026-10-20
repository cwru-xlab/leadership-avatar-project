/**
 * Proves two things about the moment-generation privacy boundary opened by
 * 21-07:
 *
 * 1. `lib/study-plan/generate.ts`'s existing closed-vocabulary filter is
 *    UNCHANGED and does not import the new path.
 * 2. `prepareMomentsForGeneration` enforces ownership-first, drop-not-redact,
 *    and both caps, exactly as `21-PRIVACY-BOUNDARY.md` records.
 *
 * Run: npx tsx scripts/verify-moment-boundary.ts
 * Runs with ZERO environment variables and NO network access.
 */
import fs from "node:fs";
import path from "node:path";

import {
  prepareMomentsForGeneration,
  MOMENT_BOUNDARY_POLICY,
  MAX_MOMENTS,
  MAX_TOTAL_CHARACTERS,
} from "../lib/study-plan/moment-boundary";
import type { SessionMoment } from "../lib/study-plan/moments";

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

function makeMoment(overrides: Partial<SessionMoment>): SessionMoment {
  return {
    reportId: "report-1",
    turnIndex: 0,
    studentText: "I handled the disagreement by listening first.",
    precedingAvatarText: "Tell me about a disagreement you had.",
    timecode: "0:05",
    linkedGrowthAreaTitles: [],
    competencyKeys: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1: FROZEN-OLD-PATH GUARD
// ---------------------------------------------------------------------------

console.log("Section 1: frozen-old-path guard");

const GENERATE_PATH = path.join(__dirname, "..", "lib", "study-plan", "generate.ts");
const generateSource = fs.readFileSync(GENERATE_PATH, "utf8");

function missingMarkers(source: string): string[] {
  const required = [
    "SAFE_RUBRIC_LABELS",
    "SAFE_RATINGS",
    "Never infer, request, or mention a student's identity",
  ];
  return required.filter((marker) => !source.includes(marker));
}

check(
  "generate.ts still contains SAFE_RUBRIC_LABELS, SAFE_RATINGS, and the exact prompt instruction",
  missingMarkers(generateSource).length === 0,
  missingMarkers(generateSource),
);

check(
  "generate.ts imports none of ./moments, ./moment-boundary, or @/lib/study-plan/moment-boundary",
  !/from\s+["'](\.\/moments|\.\/moment-boundary|@\/lib\/study-plan\/moment-boundary)["']/.test(
    generateSource,
  ),
);

const anonymousReportFieldMatch = generateSource.match(
  /export interface AnonymousBehavioralReport \{([\s\S]*?)\}/,
);
const anonymousReportFields = anonymousReportFieldMatch
  ? anonymousReportFieldMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(":")[0].trim())
  : [];

check(
  "AnonymousBehavioralReport's field set is exactly reportNumber, contentScore, behavioralScore, behavioralFeedbackSignals",
  JSON.stringify(anonymousReportFields.sort()) ===
    JSON.stringify(
      ["reportNumber", "contentScore", "behavioralScore", "behavioralFeedbackSignals"].sort(),
    ),
  anonymousReportFields,
);

const strippedSource = generateSource
  .replaceAll("SAFE_RUBRIC_LABELS", "")
  .replaceAll("SAFE_RATINGS", "")
  .replaceAll("Never infer, request, or mention a student's identity", "");

const inverted = missingMarkers(strippedSource);
check(
  "the guard itself bites: a synthetic source with the markers removed is correctly detected as missing them",
  inverted.length === 3,
  inverted,
);

// ---------------------------------------------------------------------------
// Section 2: OWNERSHIP
// ---------------------------------------------------------------------------

console.log("Section 2: ownership");

const REQUESTING_USER = "user-a";
const OTHER_USER = "user-b";

let ownershipThrew = false;
let ownershipMessage = "";
try {
  prepareMomentsForGeneration({
    requestingUserId: REQUESTING_USER,
    moments: [makeMoment({})],
    momentOwnerUserIds: [OTHER_USER],
    selfNames: [],
  });
} catch (error) {
  ownershipThrew = true;
  ownershipMessage = error instanceof Error ? error.message : String(error);
}

check("a cross-user momentOwnerUserIds entry throws", ownershipThrew);
check(
  "the thrown message does not contain either user id",
  !ownershipMessage.includes(REQUESTING_USER) && !ownershipMessage.includes(OTHER_USER),
  ownershipMessage,
);

let emptyMomentsOwnershipThrew = false;
try {
  prepareMomentsForGeneration({
    requestingUserId: REQUESTING_USER,
    moments: [],
    momentOwnerUserIds: [OTHER_USER],
    selfNames: [],
  });
} catch {
  emptyMomentsOwnershipThrew = true;
}

check(
  "ownership check throws even when the moments array is empty (not skippable by passing no text)",
  emptyMomentsOwnershipThrew,
);

// ---------------------------------------------------------------------------
// Section 3: REDACTION AND DROPS
// ---------------------------------------------------------------------------

console.log("Section 3: redaction and drops");

const emailMoment = makeMoment({
  turnIndex: 1,
  studentText: "You can reach me at student@example.com if needed.",
});
const urlMoment = makeMoment({
  turnIndex: 2,
  studentText: "I posted it at https://example.com/my-profile for reference.",
});
const phoneMoment = makeMoment({
  turnIndex: 3,
  studentText: "Call me at 555-123-4567 whenever works.",
});
const selfNameMoment = makeMoment({
  turnIndex: 4,
  studentText: "Jordan here, I think I handled that calmly.",
});
const cleanMoment = makeMoment({
  turnIndex: 5,
  studentText: "I asked a clarifying question before responding to the pushback.",
});

const redactionBatch = [emailMoment, urlMoment, phoneMoment, selfNameMoment, cleanMoment];
const redactionResult = prepareMomentsForGeneration({
  requestingUserId: REQUESTING_USER,
  moments: redactionBatch,
  momentOwnerUserIds: redactionBatch.map(() => REQUESTING_USER),
  selfNames: ["Jordan"],
});

check(
  "the email-bearing moment is dropped, not emitted redacted",
  !redactionResult.moments.some((m) => m.turnIndex === 1),
);
check(
  "the URL-bearing moment is dropped, not emitted redacted",
  !redactionResult.moments.some((m) => m.turnIndex === 2),
);
check(
  "the phone-bearing moment is dropped, not emitted redacted",
  !redactionResult.moments.some((m) => m.turnIndex === 3),
);
check(
  "the self-name-bearing moment is dropped, not emitted redacted",
  !redactionResult.moments.some((m) => m.turnIndex === 4),
);
check(
  "droppedForRedaction equals the number of affected moments (4)",
  redactionResult.droppedForRedaction === 4,
  redactionResult.droppedForRedaction,
);
check(
  "every emitted moment's studentText is byte-identical to its input",
  redactionResult.moments.every((m) => {
    const original = redactionBatch.find((orig) => orig.turnIndex === m.turnIndex);
    return !!original && original.studentText === m.studentText;
  }),
  redactionResult.moments,
);
check(
  "the clean moment survives",
  redactionResult.moments.some((m) => m.turnIndex === 5),
);

// ---------------------------------------------------------------------------
// Section 4: CAPS
// ---------------------------------------------------------------------------

console.log("Section 4: caps");

const twentyMoments: SessionMoment[] = Array.from({ length: 20 }, (_, i) =>
  makeMoment({
    turnIndex: i,
    studentText: `Moment number ${i} describing a distinct practice turn in detail.`,
    precedingAvatarText: null,
  }),
);

const countCapResult = prepareMomentsForGeneration({
  requestingUserId: REQUESTING_USER,
  moments: twentyMoments,
  momentOwnerUserIds: twentyMoments.map(() => REQUESTING_USER),
  selfNames: [],
});

check(
  `at most ${MAX_MOMENTS} moments survive the moment-count cap`,
  countCapResult.moments.length <= MAX_MOMENTS,
  countCapResult.moments.length,
);
check(
  "the count-cap survivors are the most recent by turnIndex",
  countCapResult.moments.every((m) => m.turnIndex >= 20 - MAX_MOMENTS),
  countCapResult.moments.map((m) => m.turnIndex),
);
check(
  "droppedForCap reports the count-cap drops",
  countCapResult.droppedForCap === 20 - countCapResult.moments.length,
  countCapResult.droppedForCap,
);

const bigChunk = "x".repeat(4_000);
const threeBigMoments: SessionMoment[] = [
  makeMoment({ turnIndex: 1, studentText: bigChunk, precedingAvatarText: null }),
  makeMoment({ turnIndex: 2, studentText: bigChunk, precedingAvatarText: null }),
  makeMoment({ turnIndex: 3, studentText: bigChunk, precedingAvatarText: null }),
];

const charCapResult = prepareMomentsForGeneration({
  requestingUserId: REQUESTING_USER,
  moments: threeBigMoments,
  momentOwnerUserIds: threeBigMoments.map(() => REQUESTING_USER),
  selfNames: [],
});

check(
  `the ${MAX_TOTAL_CHARACTERS}-character cap binds before all 3 moments (12,000 chars) survive`,
  charCapResult.moments.length < 3,
  charCapResult.moments.length,
);
check(
  "droppedForCap reports the character-cap drops",
  charCapResult.droppedForCap === 3 - charCapResult.moments.length,
  charCapResult.droppedForCap,
);
check(
  `totalCharacters stays within the ${MAX_TOTAL_CHARACTERS} cap`,
  charCapResult.totalCharacters <= MAX_TOTAL_CHARACTERS,
  charCapResult.totalCharacters,
);

// ---------------------------------------------------------------------------
// Section 5: POLICY SHAPE
// ---------------------------------------------------------------------------

console.log("Section 5: policy shape");

check(
  "MOMENT_BOUNDARY_POLICY.forbids is non-empty",
  MOMENT_BOUNDARY_POLICY.forbids.length > 0,
);
check(
  "MOMENT_BOUNDARY_POLICY.scope explicitly excludes study-plan synthesis rather than permitting it",
  MOMENT_BOUNDARY_POLICY.scope.includes("NOT study-plan synthesis"),
  MOMENT_BOUNDARY_POLICY.scope,
);

console.log(`\n${checks} checks run, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
