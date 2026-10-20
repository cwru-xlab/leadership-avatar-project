/**
 * Adversarial battery for `validateVerbatimQuote` and `extractSessionMoments`
 * — the mechanical half of 21-CONTEXT.md's first named guardrail: never
 * misquote the student.
 *
 * This battery runs with ZERO environment variables and performs NO network
 * or S3 access. Both functions under test are pure: they operate only on
 * hand-built fixtures constructed below.
 *
 * Run: npx tsx scripts/verify-verbatim-quote.ts
 */
import type { InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import type { StructuredReport } from "../lib/report/structured";
import {
  validateVerbatimQuote,
  MIN_QUOTABLE_LENGTH,
} from "../lib/study-plan/verbatim";
import { extractSessionMoments } from "../lib/study-plan/moments";

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

// ---------------------------------------------------------------------------
// Fixture 1: the validateVerbatimQuote battery transcript.
// ---------------------------------------------------------------------------

const QUOTE_TRANSCRIPT: InterviewTranscript = {
  version: 1,
  reportId: "report-quote-battery",
  userId: "user-1",
  typeSlug: "interview",
  interviewer: { avatarId: "avatar-1", name: "Jordan" },
  startedAt: 0,
  updatedAt: 1000,
  progress: initialProgress(),
  turns: [
    {
      role: "assistant",
      content: "Tell me about a time you disagreed with a stakeholder.",
      timestamp: 0,
    },
    {
      // turn index 1
      role: "user",
      content:
        "I once disagreed with my manager about the launch date, and after we talked it through we found a compromise.",
      timestamp: 5000,
    },
    {
      role: "assistant",
      content: "That's helpful context. What did you learn from that?",
      timestamp: 10000,
    },
    {
      // turn index 3
      role: "user",
      content: "um, I guess I'd push back on that timeline if I saw it again",
      timestamp: 15000,
    },
    {
      // turn index 4 — assistant turn containing a phrase a bad generation
      // might try to attribute to the student.
      role: "assistant",
      content:
        "Strong candidates often say they would advocate for data-driven decisions before escalating.",
      timestamp: 20000,
    },
    {
      // turn index 5 — tail used for the SPANS_MULTIPLE_TURNS test.
      role: "user",
      content: "I need more time to think it over",
      timestamp: 25000,
    },
    {
      role: "assistant",
      content: "Take your time, there's no rush.",
      timestamp: 30000,
    },
    {
      // turn index 7 — head used for the SPANS_MULTIPLE_TURNS test.
      role: "user",
      content: "over the next few days I will gather more information",
      timestamp: 35000,
    },
    {
      role: "assistant",
      content: "That sounds reasonable.",
      timestamp: 40000,
    },
    {
      // turn index 9 — first half of the duplicate-content pair.
      role: "user",
      content:
        "She mentioned the budget concerns affected the Q3 timeline directly.",
      timestamp: 45000,
    },
    {
      role: "assistant",
      content: "Good, thanks for sharing that.",
      timestamp: 50000,
    },
    {
      // turn index 11 — second half of the duplicate-content pair.
      role: "user",
      content:
        "She mentioned the budget concerns affected the Q3 timeline directly.",
      timestamp: 55000,
    },
    {
      role: "assistant",
      content: "Understood.",
      timestamp: 60000,
    },
    {
      // turn index 13 — used for the TURN_INDEX_MISMATCH test.
      role: "user",
      content: "The deadline moved up by two weeks unexpectedly.",
      timestamp: 65000,
    },
  ],
};

console.log("\n1. ACCEPT cases");
{
  const r1 = validateVerbatimQuote(
    "and after we talked it through we found a compromise",
    QUOTE_TRANSCRIPT,
  );
  check(
    "exact substring of a single user turn is accepted",
    r1.ok === true && r1.turnIndex === 1 && r1.turnRole === "user",
    r1,
  );

  const r2 = validateVerbatimQuote(
    "I once disagreed with my manager about the launch date, and after we talked it through we found a compromise.",
    QUOTE_TRANSCRIPT,
  );
  check(
    "entire content of a user turn is accepted",
    r2.ok === true && r2.turnIndex === 1,
    r2,
  );

  const r3 = validateVerbatimQuote(
    "um, I guess I'd push back on that timeline if I saw it again",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote with internal punctuation and filler words matches exactly",
    r3.ok === true && r3.turnIndex === 3,
    r3,
  );
}

console.log("\n2. REJECT — empty / too short");
{
  const r1 = validateVerbatimQuote("", QUOTE_TRANSCRIPT);
  check(
    "empty string is rejected as EMPTY_QUOTE",
    r1.ok === false && r1.reason === "EMPTY_QUOTE",
    r1,
  );

  const r2 = validateVerbatimQuote("   ", QUOTE_TRANSCRIPT);
  check(
    "whitespace-only string is rejected as EMPTY_QUOTE",
    r2.ok === false && r2.reason === "EMPTY_QUOTE",
    r2,
  );

  const r3 = validateVerbatimQuote("Yes I did", QUOTE_TRANSCRIPT);
  check(
    `quote shorter than MIN_QUOTABLE_LENGTH (${MIN_QUOTABLE_LENGTH}) is rejected as TOO_SHORT`,
    r3.ok === false && r3.reason === "TOO_SHORT",
    r3,
  );
}

console.log("\n3. REJECT — near-misses that must NOT be fuzzy-matched");
{
  const commaRemoved = validateVerbatimQuote(
    "I once disagreed with my manager about the launch date and after we talked it through we found a compromise.",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote missing one comma is rejected as NOT_FOUND_IN_ANY_TURN",
    commaRemoved.ok === false &&
      commaRemoved.reason === "NOT_FOUND_IN_ANY_TURN",
    commaRemoved,
  );

  const caseDiffers = validateVerbatimQuote(
    "i once disagreed with my manager about the launch date",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote differing only in case is rejected as NOT_FOUND_IN_ANY_TURN",
    caseDiffers.ok === false && caseDiffers.reason === "NOT_FOUND_IN_ANY_TURN",
    caseDiffers,
  );

  const trailingPeriod = validateVerbatimQuote(
    "about the launch date.",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote with a trailing period the turn lacks is rejected as NOT_FOUND_IN_ANY_TURN",
    trailingPeriod.ok === false &&
      trailingPeriod.reason === "NOT_FOUND_IN_ANY_TURN",
    trailingPeriod,
  );

  const tidied = validateVerbatimQuote(
    "I would push back on that timeline",
    QUOTE_TRANSCRIPT,
  );
  check(
    "grammatically tidied quote is rejected as NOT_FOUND_IN_ANY_TURN",
    tidied.ok === false && tidied.reason === "NOT_FOUND_IN_ANY_TURN",
    tidied,
  );
}

console.log("\n4. REJECT — SPANS_MULTIPLE_TURNS");
{
  const spanning = validateVerbatimQuote(
    "to think it overover the next few days",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote formed from the tail of one user turn and the head of a later one is rejected as SPANS_MULTIPLE_TURNS",
    spanning.ok === false && spanning.reason === "SPANS_MULTIPLE_TURNS",
    spanning,
  );
}

console.log("\n5. REJECT — role and ambiguity violations");
{
  const assistantOnly = validateVerbatimQuote(
    "advocate for data-driven decisions",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote present only in an assistant turn is rejected as FOUND_ONLY_IN_ASSISTANT_TURN",
    assistantOnly.ok === false &&
      assistantOnly.reason === "FOUND_ONLY_IN_ASSISTANT_TURN",
    assistantOnly,
  );

  const ambiguous = validateVerbatimQuote(
    "the budget concerns affected the Q3 timeline",
    QUOTE_TRANSCRIPT,
  );
  check(
    "quote identical across two different user turns is rejected as AMBIGUOUS_MULTIPLE_MATCHES",
    ambiguous.ok === false &&
      ambiguous.reason === "AMBIGUOUS_MULTIPLE_MATCHES",
    ambiguous,
  );
}

console.log("\n6. REJECT — TURN_INDEX_MISMATCH");
{
  const mismatch = validateVerbatimQuote(
    "The deadline moved up by two weeks unexpectedly.",
    QUOTE_TRANSCRIPT,
    { expectedTurnIndex: 99 },
  );
  check(
    "match at a different turn index than expected is rejected as TURN_INDEX_MISMATCH",
    mismatch.ok === false && mismatch.reason === "TURN_INDEX_MISMATCH",
    mismatch,
  );

  const matches = validateVerbatimQuote(
    "The deadline moved up by two weeks unexpectedly.",
    QUOTE_TRANSCRIPT,
    { expectedTurnIndex: 13 },
  );
  check(
    "correct expectedTurnIndex still accepts",
    matches.ok === true && matches.turnIndex === 13,
    matches,
  );
}

// ---------------------------------------------------------------------------
// Fixture 2: extractSessionMoments — deliberately free of duplicate student
// content so every emitted moment can pass validateVerbatimQuote without
// tripping AMBIGUOUS_MULTIPLE_MATCHES.
// ---------------------------------------------------------------------------

const MOMENTS_TRANSCRIPT: InterviewTranscript = {
  version: 1,
  reportId: "report-moments",
  userId: "user-1",
  typeSlug: "interview",
  interviewer: { avatarId: "avatar-1", name: "Jordan" },
  startedAt: 0,
  updatedAt: 150000,
  progress: initialProgress(),
  turns: [
    {
      role: "assistant",
      content: "Let's begin. Tell me about a conflict you navigated.",
      timestamp: 1000,
    },
    {
      // turn index 1 — 65s elapsed -> "1:05", no growth area matches.
      role: "user",
      content:
        "I had a disagreement with a peer over resource allocation and we resolved it through direct conversation.",
      timestamp: 65000,
    },
    {
      role: "assistant",
      content: "Good. What about prioritization under pressure?",
      timestamp: 70000,
    },
    {
      // turn index 3 — 125s elapsed -> "2:05", matches the growth area below.
      role: "user",
      content:
        "I prioritized the client deadline over internal reporting and it caused friction with my manager.",
      timestamp: 125000,
    },
    {
      role: "assistant",
      content: "Understood. Anything else?",
      timestamp: 130000,
    },
    {
      // turn index 5 — too short to be a quotable moment, must be excluded.
      role: "user",
      content: "ok",
      timestamp: 140000,
    },
    {
      role: "assistant",
      content: "Thanks, that's all for today.",
      timestamp: 150000,
    },
  ],
};

const MOMENTS_REPORT: StructuredReport = {
  overall_summary: "Solid handling of conflict, weaker under competing deadlines.",
  strengths: [],
  growth_areas: [
    {
      title: "Managing competing priorities",
      detail: "Deprioritized internal reporting without flagging the tradeoff.",
      suggestion: "Name the tradeoff out loud before making it.",
      timecodes: ["2:05"],
      source: "conversation",
    },
    {
      title: "No matching turn",
      detail: "A growth area whose timecode matches no stored turn.",
      suggestion: "n/a",
      timecodes: ["9:59"],
      source: "conversation",
    },
  ],
  category_notes: { visual: null, vocal: null, content: null, behavioral: null },
  rubric_notes: [],
  practice_next: "Practice naming tradeoffs explicitly.",
};

console.log("\n7. extractSessionMoments — emission rules");
{
  const moments = extractSessionMoments(
    MOMENTS_TRANSCRIPT,
    MOMENTS_REPORT,
    "report-moments",
  );

  check(
    "exactly two moments emitted (the two long-enough user turns)",
    moments.length === 2,
    moments,
  );

  check(
    "every emitted moment's turnIndex is a user turn in the source transcript",
    moments.every(
      (m) => MOMENTS_TRANSCRIPT.turns[m.turnIndex]?.role === "user",
    ),
    moments,
  );

  check(
    "the too-short turn ('ok') is excluded from emitted moments",
    !moments.some((m) => m.studentText === "ok"),
    moments,
  );

  check(
    "every emitted moment's studentText passes validateVerbatimQuote against the same transcript",
    moments.every(
      (m) => validateVerbatimQuote(m.studentText, MOMENTS_TRANSCRIPT).ok === true,
    ),
    moments,
  );

  const matched = moments.find((m) => m.turnIndex === 3);
  check(
    "the moment at the matching timecode links to its growth area",
    !!matched && matched.linkedGrowthAreaTitles.includes("Managing competing priorities"),
    matched,
  );

  const unmatched = moments.find((m) => m.turnIndex === 1);
  check(
    "a moment with no matching growth-area timecode links to nothing",
    !!unmatched && unmatched.linkedGrowthAreaTitles.length === 0,
    unmatched,
  );

  check(
    "the growth area whose timecode matches no turn is linked to nothing (not the nearest turn)",
    !moments.some((m) => m.linkedGrowthAreaTitles.includes("No matching turn")),
    moments,
  );
}

console.log(`\n${checks} checks run, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
