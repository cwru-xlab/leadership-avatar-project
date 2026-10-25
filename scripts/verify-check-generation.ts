/**
 * Adversarial battery for `generateChecksForCompetency` — the central proof
 * of 21-10's guardrail: a model stub that DELIBERATELY DISOBEYS the prompt
 * must still be discarded by the mechanical gate, never repaired into a
 * usable question. Precedent: 20-06's sanitizer battery used the same
 * technique (an evaluator payload that deliberately disobeys the prompt).
 *
 * Every non-OBEDIENT scenario below is a stub model MISBEHAVING on purpose.
 * A battery whose stub always behaves proves only that the happy path
 * compiles — it proves nothing about the gate.
 *
 * Runs with NO `OPENAI_API_KEY` — every scenario injects `callModel`.
 *
 * DB-gated: persistence assertions run against a live local database when
 * `DATABASE_URL` is set (per this plan's own notes, it is). If it is ever
 * unset, every write-assertion prints an explicit SKIP rather than silently
 * passing — this battery never lets an unavailable database turn a
 * write-assertion into a quiet pass.
 *
 * Run: npx tsx scripts/verify-check-generation.ts
 */
import { randomUUID } from "node:crypto";

import type { InterviewTranscript } from "../lib/interview/transcript";
import { initialProgress } from "../lib/interview/types";
import type { StructuredReport } from "../lib/report/structured";
import { extractSessionMoments, type SessionMoment } from "../lib/study-plan/moments";
import { validateVerbatimQuote } from "../lib/study-plan/verbatim";
import {
  generateChecksForCompetency,
  CONCEPT_CHECK_SYSTEM_PROMPT,
  type GenerationOutcome,
} from "../lib/study-plan/checks/generate";
import { gradeDeterministic } from "../lib/study-plan/checks/grade";
import type { AnswerKey, CheckPayload } from "../lib/study-plan/checks/types";
import {
  applyOrder,
  bestTechniqueFor,
  precedingAssistantTurn,
  sanitizeExplanation,
  shuffleOrder,
  writtenTechniquesFor,
} from "../lib/study-plan/checks/explain";
import { displayPrompt, FALLBACK_PROMPT } from "../lib/study-plan/checks/copy";
import { techniquesForCompetency } from "../lib/study-plan/coached/tips";
import { toKeylessCheckDTO } from "../app/api/study-plans/checks/[checkId]/attempt/route";

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
// Fixture transcript — several user turns, one distinctive line, plus
// seeded email/URL/phone/self-name turns for the boundary assertion, plus a
// splice pair for the SPLICE stub.
// ---------------------------------------------------------------------------

const REPORT_ID = "report-check-generation-battery";
const SELF_NAME = "Jordan";

const DISTINCT_LINE =
  "I disagreed with my manager about the launch timeline, and we eventually found common ground.";
const SECOND_LINE = "I would make sure to document decisions earlier next time.";
const ASSISTANT_DISTINCTIVE =
  "Strong candidates often say they would advocate for data-driven decisions before escalating.";
const SPLICE_EARLY = "I need more time to think it over";
const SPLICE_LATE = "over the next few days I will gather more information";

const CHECK_TRANSCRIPT: InterviewTranscript = {
  version: 1,
  reportId: REPORT_ID,
  userId: "fixture-owner",
  typeSlug: "interview",
  interviewer: { avatarId: "avatar-1", name: "Jordan the avatar" },
  startedAt: 0,
  updatedAt: 90000,
  progress: initialProgress(),
  turns: [
    { role: "assistant", content: "Tell me about a disagreement you handled on your team.", timestamp: 0 },
    { role: "user", content: DISTINCT_LINE, timestamp: 5000 }, // turn 1 — "0:05"
    { role: "assistant", content: "What did you learn from that?", timestamp: 10000 },
    { role: "user", content: SECOND_LINE, timestamp: 15000 }, // turn 3 — "0:15"
    { role: "assistant", content: ASSISTANT_DISTINCTIVE, timestamp: 20000 }, // turn 4 — avatar-only phrase
    {
      role: "user",
      content: "You can email me at student@example.com if you want more details.",
      timestamp: 25000,
    }, // turn 5 — email, must be dropped before reaching the model
    { role: "assistant", content: "Noted.", timestamp: 30000 },
    {
      role: "user",
      content: "Check out my site at https://example.com/profile for more info.",
      timestamp: 35000,
    }, // turn 7 — URL, must be dropped
    { role: "assistant", content: "Got it.", timestamp: 40000 },
    {
      role: "user",
      content: "Call me anytime at 555-123-4567 to discuss further.",
      timestamp: 45000,
    }, // turn 9 — phone, must be dropped
    { role: "assistant", content: "Sure thing.", timestamp: 50000 },
    {
      role: "user",
      content: "Jordan here, I think I handled that calmly under pressure.",
      timestamp: 55000,
    }, // turn 11 — self-name, must be dropped
    { role: "assistant", content: "Take your time, there's no rush.", timestamp: 60000 },
    { role: "user", content: SPLICE_EARLY, timestamp: 65000 }, // turn 13
    { role: "assistant", content: "That's fine.", timestamp: 70000 },
    { role: "user", content: SPLICE_LATE, timestamp: 75000 }, // turn 15
    { role: "assistant", content: "Thanks for sharing that.", timestamp: 80000 },
  ],
};

const CHECK_REPORT: StructuredReport = {
  overall_summary: "Handles disagreement reasonably, weaker on documenting decisions.",
  strengths: [],
  growth_areas: [
    {
      title: "Managing timeline disagreements",
      detail: "Resolved a disagreement but did not document the resolution.",
      suggestion: "Write down the agreed path forward immediately after.",
      timecodes: ["0:05"],
      source: "conversation",
    },
    {
      title: "Documenting decisions",
      detail: "Decisions were made verbally without a written record.",
      suggestion: "Capture decisions in a shared doc as they happen.",
      timecodes: ["0:15"],
      source: "conversation",
    },
  ],
  category_notes: { visual: null, vocal: null, content: null, behavioral: null },
  rubric_notes: [],
  practice_next: "Practice documenting decisions as they are made.",
};

const ALL_MOMENTS: SessionMoment[] = extractSessionMoments(
  CHECK_TRANSCRIPT,
  CHECK_REPORT,
  REPORT_ID,
);

const TRANSCRIPTS_BY_REPORT_ID = new Map<string, InterviewTranscript>([
  [REPORT_ID, CHECK_TRANSCRIPT],
]);

const COMPETENCY_KEY = "structure_and_clarity" as const;

// ---------------------------------------------------------------------------
// Payload builders — every field the strict schema requires, set null when
// unused for that format.
// ---------------------------------------------------------------------------

function blankPayload() {
  return {
    options: null,
    segments: null,
    blankCount: null,
    candidates: null,
    rationalePrompt: null,
    weakLine: null,
    techniqueHint: null,
    rubricCriteria: null,
  };
}

function blankAnswerKey() {
  return { correctIndex: null, accepted: null, betterIndex: null };
}

function mcCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "MULTIPLE_CHOICE",
    prompt: "Which response best handles a timeline disagreement?",
    payload: {
      ...blankPayload(),
      options: ["Escalate immediately", "Document the compromise", "Ignore it", "Delay the decision"],
    },
    answer_key: { ...blankAnswerKey(), correctIndex: 1 },
    quoted_text: DISTINCT_LINE,
    source_report_id: REPORT_ID,
    quoted_turn_index: 1,
    ...overrides,
  };
}

function fibCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "FILL_IN_BLANK",
    prompt: "Fill in what the student committed to doing differently.",
    payload: {
      ...blankPayload(),
      segments: ["I would make sure to ", " next time."],
      blankCount: 1,
    },
    answer_key: { ...blankAnswerKey(), accepted: [["document decisions earlier"]] },
    quoted_text: SECOND_LINE,
    source_report_id: REPORT_ID,
    quoted_turn_index: 3,
    ...overrides,
  };
}

const PBR_STRONG =
  "We agreed on a phased launch: I opened with that decision, then gave the two data points that got us there.";
const PBR_BURIED =
  "We looked at usage data, then support load, then the hiring plan, and in the end we agreed on a phased launch.";
const PBR_HEDGED = "I kind of went along with whatever my manager wanted, sort of, in the end.";

function pbrCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "PICK_BETTER_RESPONSE",
    prompt: "Which response handles the disagreement best?",
    payload: {
      ...blankPayload(),
      // Canonical order (K1): student line, strong target, distractors.
      candidates: [DISTINCT_LINE, PBR_STRONG, PBR_BURIED, PBR_HEDGED],
      rationalePrompt: null,
    },
    answer_key: { ...blankAnswerKey(), betterIndex: 1 },
    technique_id: "structure-headline-first",
    explanation: "Leading with the decision lets the listener follow the two supports that come after it.",
    option_explanations: [
      "Your line tells the story without ever stating the decision up front.",
      null,
      "The content is strong but the decision is buried at the very end.",
      "The hedges hide the position instead of stating it.",
    ],
    quoted_text: DISTINCT_LINE,
    source_report_id: REPORT_ID,
    quoted_turn_index: 1,
    ...overrides,
  };
}

function rwlCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "REWRITE_WEAK_LINE",
    prompt: "Rewrite this line to commit to a concrete follow-up action.",
    payload: {
      ...blankPayload(),
      weakLine: SECOND_LINE,
      techniqueHint: "Name the specific documentation step and when it happens.",
      rubricCriteria: ["Names a concrete action", "States a timeframe"],
    },
    answer_key: null,
    quoted_text: SECOND_LINE,
    source_report_id: REPORT_ID,
    quoted_turn_index: 3,
    ...overrides,
  };
}

function stub(candidates: unknown[]) {
  return async (_payload: unknown) => ({ candidates });
}

// ---------------------------------------------------------------------------
// DB setup — creates a real User + StudyPlan so prisma.knowledgeCheck's FK
// constraints are satisfied. Cleaned up in `finally`.
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    skip("ALL scenarios (no DATABASE_URL set) — see this script's own warning against letting that silently pass a write assertion");
    console.log(`\n${checks} checks run, ${failures} failed. (0 scenarios actually ran)`);
    process.exit(1);
  }

  const { prisma } = await import("../lib/prisma");

  const testEmail = `check-generation-verify-${randomUUID()}@example.com`;
  let userId = "";
  let studyPlanId = "";

  try {
    const user = await prisma.user.create({
      data: { email: testEmail, name: "Check Generation Verify", role: "STUDENT" },
    });
    userId = user.id;

    const studyPlan = await prisma.studyPlan.create({
      data: {
        userId,
        title: "Verify check generation",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [REPORT_ID] as unknown as object,
        sourceReportCount: 1,
        generationModel: "verify-check-generation-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanId = studyPlan.id;

    // Ownership is checked against the REAL created user id, not a fixture
    // placeholder — otherwise prepareMomentsForGeneration's ownership-first
    // guard would throw on every single call below.
    const momentOwnerUserIds = ALL_MOMENTS.map(() => userId);

    async function run(callModel: (payload: unknown) => Promise<unknown>): Promise<GenerationOutcome> {
      return generateChecksForCompetency({
        userId,
        studyPlanId,
        competencyKey: COMPETENCY_KEY,
        selfNames: [SELF_NAME],
        moments: ALL_MOMENTS,
        momentOwnerUserIds,
        transcriptsByReportId: TRANSCRIPTS_BY_REPORT_ID,
        desiredCount: 4,
        callModel,
      });
    }

    async function rowsForPlan() {
      return prisma.knowledgeCheck.findMany({ where: { studyPlanId } });
    }

    // -------------------------------------------------------------------
    // 1. OBEDIENT STUB
    // -------------------------------------------------------------------
    console.log("\n1. OBEDIENT STUB — one candidate per format, all quotes real");
    {
      const outcome = await run(stub([mcCandidate(), fibCandidate(), pbrCandidate(), rwlCandidate()]));
      check("ok: true", outcome.ok === true, outcome);
      if (outcome.ok) {
        check("created: 4", outcome.created === 4, outcome.created);
        check("discarded: []", outcome.discarded.length === 0, outcome.discarded);
      }
      const rows = await rowsForPlan();
      check("4 rows persisted", rows.length === 4, rows.length);
      check(
        "every persisted row's quotedText re-validates against the transcript",
        rows.every((row) => {
          if (!row.quotedText) return false;
          const result = validateVerbatimQuote(row.quotedText, CHECK_TRANSCRIPT, {
            expectedTurnIndex: row.quotedTurnIndex ?? undefined,
          });
          return result.ok === true;
        }),
        rows.map((r) => ({ quotedText: r.quotedText, turnIndex: r.quotedTurnIndex })),
      );
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });
    }

    // -------------------------------------------------------------------
    // 2. PARAPHRASE STUB — central assertion of the whole plan
    // -------------------------------------------------------------------
    console.log("\n2. PARAPHRASE STUB — one comma removed from the distinctive line");
    {
      const paraphrased = DISTINCT_LINE.replace(", and", " and");
      const outcome = await run(stub([mcCandidate({ quoted_text: paraphrased })]));
      check("ok: false (nothing survived)", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded with NOT_FOUND_IN_ANY_TURN",
          outcome.discarded.length === 1 && outcome.discarded[0].reason.startsWith("NOT_FOUND_IN_ANY_TURN"),
          outcome.discarded,
        );
      }
      const rows = await rowsForPlan();
      check("NO row written for this run", rows.length === 0, rows.length);
      check(
        "NO row anywhere carries the paraphrased text",
        (await prisma.knowledgeCheck.count({ where: { quotedText: paraphrased } })) === 0,
      );
    }

    // -------------------------------------------------------------------
    // 3. TIDIED-GRAMMAR STUB
    // -------------------------------------------------------------------
    console.log("\n3. TIDIED-GRAMMAR STUB — 'I would' for a stored contraction");
    {
      const tidied = "I would push back on that timeline"; // not present verbatim anywhere
      const outcome = await run(stub([rwlCandidate({ quoted_text: tidied, payload: { ...blankPayload(), weakLine: tidied, techniqueHint: "x", rubricCriteria: ["y"] } })]));
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded with NOT_FOUND_IN_ANY_TURN",
          outcome.discarded.some((d) => d.reason.startsWith("NOT_FOUND_IN_ANY_TURN")),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 4. ASSISTANT-QUOTE STUB
    // -------------------------------------------------------------------
    console.log("\n4. ASSISTANT-QUOTE STUB — quotes the avatar, attributes it to the student");
    {
      const outcome = await run(stub([mcCandidate({ quoted_text: ASSISTANT_DISTINCTIVE, quoted_turn_index: 4 })]));
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded with FOUND_ONLY_IN_ASSISTANT_TURN",
          outcome.discarded.some((d) => d.reason.startsWith("FOUND_ONLY_IN_ASSISTANT_TURN")),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 5. SPLICE STUB
    // -------------------------------------------------------------------
    console.log("\n5. SPLICE STUB — concatenation of two separate turns");
    {
      const spliced = `${SPLICE_EARLY}${SPLICE_LATE}`;
      const outcome = await run(stub([mcCandidate({ quoted_text: spliced, quoted_turn_index: 13 })]));
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded with SPANS_MULTIPLE_TURNS",
          outcome.discarded.some((d) => d.reason.startsWith("SPANS_MULTIPLE_TURNS")),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 6. WRONG-REPORT STUB
    // -------------------------------------------------------------------
    console.log("\n6. WRONG-REPORT STUB — source_report_id not in transcriptsByReportId");
    {
      const outcome = await run(stub([mcCandidate({ source_report_id: "some-other-report-id" })]));
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded before any transcript lookup (stage: quote, reason names fabricated provenance)",
          outcome.discarded.some((d) => d.stage === "quote" && /not supplied|fabricated/i.test(d.reason)),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 7. TURN-INDEX-LIE STUB
    // -------------------------------------------------------------------
    console.log("\n7. TURN-INDEX-LIE STUB — exact quote, wrong quoted_turn_index");
    {
      const outcome = await run(stub([mcCandidate({ quoted_turn_index: 3 })])); // DISTINCT_LINE is really turn 1
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded with TURN_INDEX_MISMATCH",
          outcome.discarded.some((d) => d.reason.startsWith("TURN_INDEX_MISMATCH")),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 8. DECORATION STUB — the subtle one: quote validates, weakLine lies
    // -------------------------------------------------------------------
    console.log("\n8. DECORATION STUB — real quote, but weakLine is a different invented sentence");
    {
      const outcome = await run(
        stub([
          rwlCandidate({
            payload: {
              ...blankPayload(),
              weakLine: "This invented sentence never appeared anywhere in the transcript.",
              techniqueHint: "x",
              rubricCriteria: ["y"],
            },
          }),
        ]),
      );
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded for weakLine/quote mismatch",
          outcome.discarded.some((d) => d.stage === "quote" && /weakLine must be exactly/.test(d.reason)),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 9. UNQUOTED-REWRITE STUB
    // -------------------------------------------------------------------
    console.log("\n9. UNQUOTED-REWRITE STUB — REWRITE_WEAK_LINE with quoted_text: null");
    {
      const outcome = await run(
        stub([rwlCandidate({ quoted_text: null, source_report_id: null, quoted_turn_index: null })]),
      );
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded for requiring a non-null quoted_text",
          outcome.discarded.some((d) => d.stage === "quote" && /requires a non-null quoted_text/.test(d.reason)),
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 10. MALFORMED-PAYLOAD STUB
    // -------------------------------------------------------------------
    console.log("\n10. MALFORMED-PAYLOAD STUB — MULTIPLE_CHOICE with three options");
    {
      const outcome = await run(
        stub([mcCandidate({ payload: { ...blankPayload(), options: ["a", "b", "c"] } })]),
      );
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check(
          "discarded[0].stage names the payload stage, distinguishable from the quote stage",
          outcome.discarded.length === 1 && outcome.discarded[0].stage === "payload",
          outcome.discarded,
        );
      }
      check("NO row written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 11. ALL-BAD STUB
    // -------------------------------------------------------------------
    console.log("\n11. ALL-BAD STUB — every candidate fails");
    {
      const paraphrased = DISTINCT_LINE.replace(", and", " and");
      const outcome = await run(
        stub([
          mcCandidate({ quoted_text: paraphrased }),
          mcCandidate({ source_report_id: "nope" }),
          mcCandidate({ payload: { ...blankPayload(), options: ["a", "b", "c"] } }),
        ]),
      );
      check("ok: false", outcome.ok === false, outcome);
      if (!outcome.ok) {
        check("discarded has one record per candidate (3)", outcome.discarded.length === 3, outcome.discarded);
      }
      check("zero rows written", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 12. THROWING STUB and INVALID-JSON STUB
    // -------------------------------------------------------------------
    console.log("\n12. THROWING STUB and INVALID-JSON STUB");
    {
      const throwingOutcome = await run(async () => {
        throw new Error("simulated model failure");
      });
      check("THROWING STUB: ok: false", throwingOutcome.ok === false, throwingOutcome);
      check("THROWING STUB: no partial write", (await rowsForPlan()).length === 0);

      const invalidJsonOutcome = await run(async () => "this is not json {");
      check("INVALID-JSON STUB: ok: false", invalidJsonOutcome.ok === false, invalidJsonOutcome);
      check("INVALID-JSON STUB: no partial write", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 13. BOUNDARY STUB — echoes back whatever it was SENT
    // -------------------------------------------------------------------
    console.log("\n13. BOUNDARY STUB — the sent payload carries no dropped-moment content");
    {
      let capturedUserMessage = "";
      await run(async (payload: unknown) => {
        const { user } = payload as { user: string };
        capturedUserMessage = user;
        return { candidates: [] };
      });

      check(
        "sent payload contains no email address",
        !capturedUserMessage.includes("student@example.com"),
      );
      check(
        "sent payload contains no URL",
        !capturedUserMessage.includes("https://example.com/profile"),
      );
      check(
        "sent payload contains no phone number",
        !capturedUserMessage.includes("555-123-4567"),
      );
      check(
        "sent payload contains no occurrence of the student's own self-name",
        !new RegExp(`\\b${SELF_NAME}\\b`).test(capturedUserMessage),
      );
      check("NO row written (empty candidates array)", (await rowsForPlan()).length === 0);
    }

    // -------------------------------------------------------------------
    // 14. CONCEPT MODE (Phase 23) — no student moment: quote nobody
    // -------------------------------------------------------------------
    console.log("\n14. CONCEPT MODE — a competency with no moment gets a check that quotes nobody");
    {
      const noQuote = { quoted_text: null, source_report_id: null, quoted_turn_index: null };
      const conceptPbr = pbrCandidate({
        ...noQuote,
        payload: {
          ...blankPayload(),
          candidates: [
            "I hear the deadline worry; here is the one change I propose and why.",
            "Let's just see how it goes and revisit later.",
            "There are many factors, and eventually maybe we change one thing.",
          ],
          rationalePrompt: null,
        },
        answer_key: { ...blankAnswerKey(), betterIndex: 0 },
      });
      let capturedSystem = "";
      let capturedUser = "";
      async function runConcept(candidates: unknown[], momentsOverride?: SessionMoment[]) {
        const moments = momentsOverride ?? [];
        return generateChecksForCompetency({
          userId,
          studyPlanId,
          competencyKey: COMPETENCY_KEY,
          selfNames: [SELF_NAME],
          moments,
          momentOwnerUserIds: moments.map(() => userId),
          transcriptsByReportId: new Map(),
          desiredCount: 2,
          concept: true,
          callModel: async (payload: unknown) => {
            const p = payload as { system: string; user: string };
            capturedSystem = p.system;
            capturedUser = p.user;
            return { candidates };
          },
        });
      }

      const ok = await runConcept([mcCandidate(noQuote), conceptPbr]);
      check("concept: unquoted MC + constructed PBR both persisted", ok.ok === true && ok.created === 2, ok);
      const rows = await rowsForPlan();
      check(
        "concept rows carry no quote and no provenance",
        rows.length === 2 && rows.every((r) => r.quotedText === null && r.sourceReportId === null && r.quotedTurnIndex === null),
        rows.map((r) => r.quotedText),
      );
      check("concept mode sends the concept system prompt", capturedSystem === CONCEPT_CHECK_SYSTEM_PROMPT);
      check(
        "concept mode sends no transcript text and marks the mode",
        capturedUser.includes('"mode":"CONCEPT"') && !capturedUser.includes(DISTINCT_LINE) && !capturedUser.includes(SECOND_LINE),
      );
      const pbrRow = rows.find((r) => r.format === "PICK_BETTER_RESPONSE");
      const strongConcept = "I hear the deadline worry; here is the one change I propose and why.";
      const graded = pbrRow
        ? gradeDeterministic("PICK_BETTER_RESPONSE", pbrRow.payload as unknown as CheckPayload, pbrRow.answerKey as unknown as AnswerKey, {
            betterIndex: (pbrRow.payload as unknown as { candidates: string[] }).candidates.indexOf(strongConcept),
          })
        : null;
      check("a concept PBR is graded by the existing deterministic grader", graded?.correct === true, graded);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });

      // BITE-PROOFS: the same quoted candidate that moment mode ACCEPTS
      // (scenario 1) is DISCARDED in concept mode — nothing to verify it against.
      const quoted = await runConcept([mcCandidate()]);
      check(
        "bite-proof: a quoted candidate is DISCARDED in concept mode (stage quote), 0 rows",
        quoted.ok === false && quoted.discarded.some((d) => d.stage === "quote") && (await rowsForPlan()).length === 0,
        quoted,
      );
      const provenanceOnly = await runConcept([mcCandidate({ quoted_text: null })]);
      check(
        "bite-proof: provenance without a quote is DISCARDED in concept mode",
        provenanceOnly.ok === false && provenanceOnly.discarded.some((d) => d.stage === "quote"),
      );
      const fib = await runConcept([fibCandidate(noQuote)]);
      check(
        "concept mode allows only MULTIPLE_CHOICE / PICK_BETTER_RESPONSE",
        fib.ok === false && fib.discarded.some((d) => d.stage === "shape"),
        fib,
      );
      const withMoments = await runConcept([mcCandidate(noQuote)], ALL_MOMENTS);
      check("concept mode refuses to run when moments exist", withMoments.ok === false);
      // Moment mode is unchanged: an unquoted PBR is still discarded there.
      const momentUnquotedPbr = await run(stub([conceptPbr]));
      check(
        "moment mode still DISCARDS an unquoted PICK_BETTER_RESPONSE (verbatim guardrail intact)",
        momentUnquotedPbr.ok === false && momentUnquotedPbr.discarded.some((d) => d.stage === "quote"),
        momentUnquotedPbr,
      );
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });
    }

    // -------------------------------------------------------------------
    // 15-18. PHASE 23 — checks that teach (K1, K2, K3, K5)
    // -------------------------------------------------------------------
    console.log("\n15. K1 — 3-4 pick-better options, shuffled deterministically per check");
    {
      const outcome = await run(stub([pbrCandidate()]));
      check("ok: a 4-option PBR persists", outcome.ok === true && outcome.created === 1, outcome);
      const [row] = await rowsForPlan();
      const payload = row?.payload as unknown as { candidates: string[]; rationalePrompt: string | null };
      const key = row?.answerKey as unknown as { betterIndex: number; explanation?: { options: (string | null)[] | null } };
      check(
        "persisted candidates are a permutation of the 4 inputs (student line included verbatim)",
        !!payload && payload.candidates.length === 4 &&
          [DISTINCT_LINE, PBR_STRONG, PBR_BURIED, PBR_HEDGED].every((c) => payload.candidates.includes(c)),
        payload?.candidates,
      );
      check("the stored key points at the strong target's TEXT after the shuffle", payload?.candidates[key?.betterIndex ?? -1] === PBR_STRONG, key);
      check(
        "the order is reproducible from the row id alone (shuffleOrder(id))",
        !!row && JSON.stringify(applyOrder([DISTINCT_LINE, PBR_STRONG, PBR_BURIED, PBR_HEDGED], shuffleOrder(row.id, 4))) === JSON.stringify(payload.candidates),
      );
      check("shuffleOrder is deterministic", JSON.stringify(shuffleOrder("seed-x", 4)) === JSON.stringify(shuffleOrder("seed-x", 4)));
      const orders = new Set(Array.from({ length: 40 }, (_, i) => shuffleOrder(`seed-${i}`, 4)[0]));
      check("bite-proof: across ids the first slot varies (the student line is not pinned to slot 0)", orders.size >= 3, [...orders]);
      check("new rows store rationalePrompt: null", payload?.rationalePrompt === null);
      const graded = row
        ? gradeDeterministic("PICK_BETTER_RESPONSE", row.payload as unknown as CheckPayload, row.answerKey as unknown as AnswerKey, { betterIndex: key.betterIndex })
        : null;
      check("grading stays deterministic on the shuffled row (strong target is correct)", graded?.correct === true, graded);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });

      const twoOption = await run(stub([pbrCandidate({ payload: { ...blankPayload(), candidates: [DISTINCT_LINE, PBR_STRONG], rationalePrompt: null } })]));
      check(
        "bite-proof: a NEW 2-option PBR is DISCARDED (stage payload)",
        twoOption.ok === false && twoOption.discarded.some((d) => d.stage === "payload"),
        twoOption,
      );
      const studentBest = await run(stub([pbrCandidate({ answer_key: { ...blankAnswerKey(), betterIndex: 0 } })]));
      check(
        "bite-proof: a PBR whose key marks the student's own line as better is DISCARDED",
        studentBest.ok === false && studentBest.discarded.some((d) => d.stage === "answer_key"),
        studentBest,
      );
      const outOfRange = await run(stub([pbrCandidate({ payload: { ...blankPayload(), candidates: [DISTINCT_LINE, PBR_STRONG, PBR_BURIED], rationalePrompt: null }, answer_key: { ...blankAnswerKey(), betterIndex: 3 } })]));
      check("bite-proof: a betterIndex past the candidates is DISCARDED", outOfRange.ok === false, outOfRange);
      const studentNotFirst = await run(stub([pbrCandidate({ payload: { ...blankPayload(), candidates: [PBR_STRONG, DISTINCT_LINE, PBR_BURIED], rationalePrompt: null }, answer_key: { ...blankAnswerKey(), betterIndex: 0 } })]));
      check(
        "bite-proof: the verbatim gate still requires the student's line in canonical slot 0 (pre-shuffle)",
        studentNotFirst.ok === false && studentNotFirst.discarded.some((d) => d.stage === "quote"),
        studentNotFirst,
      );
      check("no rows persisted by the bite-proof runs", (await rowsForPlan()).length === 0);
    }

    console.log("\n16. K2 — every format stores a library-technique explanation; never a misquote");
    {
      const outcome = await run(stub([
        mcCandidate({ technique_id: "structure-headline-first", explanation: "Documenting the compromise closes the loop on the disagreement.", option_explanations: ["Escalating skips the conversation.", null, "Ignoring it leaves it open.", "Delay leaves it open."] }),
        fibCandidate(),
        pbrCandidate(),
        rwlCandidate({ technique_id: "structure-close-the-loop" }),
      ]));
      check("ok: 4 rows", outcome.ok === true && outcome.created === 4, outcome);
      const rows = await rowsForPlan();
      const library = new Set(techniquesForCompetency(COMPETENCY_KEY).map((t) => t.id));
      for (const row of rows) {
        if (row.format === "REWRITE_WEAK_LINE") {
          const p = row.payload as unknown as { techniqueId?: string };
          check("REWRITE: payload.techniqueId is the model's valid library id", p.techniqueId === "structure-close-the-loop", p);
          continue;
        }
        const key = row.answerKey as unknown as { explanation?: { techniqueId: string; why: string; options: (string | null)[] | null } };
        check(
          `${row.format}: answer key carries an explanation whose technique is a library id or null (none fits)`,
          !!key.explanation && (key.explanation.techniqueId === null || library.has(key.explanation.techniqueId)),
          key.explanation,
        );
        const dto = JSON.stringify(toKeylessCheckDTO(row));
        check(`${row.format}: the keyless DTO carries no explanation (it would reveal the answer)`, !dto.includes(key.explanation?.why ?? "@@none@@") && !dto.includes("explanation"));
      }
      const mcRow = rows.find((r) => r.format === "MULTIPLE_CHOICE")!;
      const mcPayload = mcRow.payload as unknown as { options: string[] };
      const mcKey = mcRow.answerKey as unknown as { correctIndex: number; explanation: { options: (string | null)[] } };
      check("MC: options are shuffled with the key following the correct TEXT", mcPayload.options[mcKey.correctIndex] === "Document the compromise", mcPayload);
      check(
        "MC: per-option misses follow their option through the shuffle",
        mcKey.explanation.options[mcPayload.options.indexOf("Escalate immediately")] === "Escalating skips the conversation." &&
          mcKey.explanation.options[mcKey.correctIndex] === null,
        mcKey.explanation.options,
      );
      const pbrRow = rows.find((r) => r.format === "PICK_BETTER_RESPONSE")!;
      const pbrPayload = pbrRow.payload as unknown as { candidates: string[] };
      const pbrKey = pbrRow.answerKey as unknown as AnswerKey & { betterIndex: number };
      const buriedIdx = pbrPayload.candidates.indexOf(PBR_BURIED);
      const wrong = gradeDeterministic("PICK_BETTER_RESPONSE", pbrPayload as unknown as CheckPayload, pbrKey, { betterIndex: buriedIdx }, { competencyKey: COMPETENCY_KEY, prompt: pbrRow.prompt });
      check(
        "a wrong pick explains what THAT distractor got wrong, why the answer works, and names the technique",
        wrong.detail.includes("What your pick missed: The content is strong but the decision is buried") &&
          wrong.detail.includes("Why it works: Leading with the decision") &&
          wrong.detail.includes("Technique: Headline first"),
        wrong.detail,
      );
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });

      const bad = await run(stub([
        mcCandidate({ technique_id: "pressure-restate-the-ask", explanation: 'You said "we found common ground eventually" which is the key.', option_explanations: ["a", null] }),
      ]));
      check("ok: a bad explanation does not cost the check", bad.ok === true && bad.created === 1, bad);
      const [badRow] = await rowsForPlan();
      const badKey = badRow!.answerKey as unknown as { explanation: { techniqueId: string | null; why: string; options: (string | null)[] } };
      check(
        "bite-proof: a technique id from ANOTHER competency is never stored (dropped or replaced by a matching one)",
        badKey.explanation.techniqueId !== "pressure-restate-the-ask" &&
          (badKey.explanation.techniqueId === null || library.has(badKey.explanation.techniqueId)),
        badKey.explanation,
      );
      check("bite-proof: an explanation that misquotes the student is replaced by the template", !badKey.explanation.why.includes("common ground eventually") && badKey.explanation.why.startsWith("The stronger answer"), badKey.explanation.why);
      check("bite-proof: misaligned option misses become templates, correct option null", badKey.explanation.options.length === 4 && badKey.explanation.options.filter((o) => o === null).length === 1, badKey.explanation.options);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });

      const okQuote = await run(stub([pbrCandidate({ explanation: `It states the decision first, unlike "${PBR_BURIED}"` })]));
      const [okRow] = await rowsForPlan();
      const okKey = okRow?.answerKey as unknown as { explanation: { why: string } } | undefined;
      check("an explanation quoting an option EXACTLY is kept", okQuote.ok === true && !!okKey?.explanation.why.includes(PBR_BURIED), okKey);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });
    }

    console.log("\n16b. Q2 — no default technique; never a body/voice technique on a written check");
    {
      check("writtenTechniquesFor(delivery_presence) is empty (eyes/shoulders/pace/pause/room are spoken-only)", writtenTechniquesFor("delivery_presence").length === 0);
      check("the visible-breath pressure move is excluded too", !writtenTechniquesFor("holding_position_under_pressure").some((t) => t.id === "pressure-slow-your-response"));
      const delivery = sanitizeExplanation({
        competencyKey: "delivery_presence",
        proposed: { techniqueId: "delivery-eyes-up", why: "Eyes up shows presence.", options: null },
        optionCount: null, correctIndex: null, quotableSources: [], matchText: "eyes shoulders pace pause camera",
      });
      check(
        "bite-proof: a proposed delivery technique is dropped (techniqueId null) and its why replaced",
        delivery?.explanation.techniqueId === null && !/eyes|shoulder|pace/i.test(delivery.explanation.why),
        delivery,
      );
      const noMatch = sanitizeExplanation({
        competencyKey: COMPETENCY_KEY,
        proposed: { techniqueId: null, why: null, options: null },
        optionCount: null, correctIndex: null, quotableSources: [], matchText: "zzz qqq",
      });
      check(
        "bite-proof: nothing matches -> techniqueId null, NOT the competency's first technique",
        noMatch?.explanation.techniqueId === null && noMatch.explanation.techniqueId !== techniquesForCompetency(COMPETENCY_KEY)[0]!.id,
        noMatch,
      );
      check("bestTechniqueFor returns null with zero overlap", bestTechniqueFor(COMPETENCY_KEY, "zzz qqq") === null);
      check("bestTechniqueFor still matches on overlap", bestTechniqueFor(COMPETENCY_KEY, "lead with your conclusion")?.id === "structure-headline-first");
    }

    console.log("\n17. K3 — the prompt matches the interaction");
    {
      const explain = await run(stub([pbrCandidate({ prompt: "Explain which answer is more attuned to the audience and why." })]));
      check("bite-proof: an 'explain why' prompt is DISCARDED (stage prompt)", explain.ok === false && explain.discarded.some((d) => d.stage === "prompt"), explain);
      const restated = await run(stub([pbrCandidate({ prompt: `Which is stronger: 1. ${DISTINCT_LINE} 2. ${PBR_STRONG}?` })]));
      check("bite-proof: a prompt that restates the candidates is DISCARDED", restated.ok === false && restated.discarded.some((d) => d.stage === "prompt"), restated);
      const trailingWhy = await run(stub([mcCandidate({ prompt: "Which option is best? Why?" })]));
      check("bite-proof: a trailing 'Why?' is DISCARDED", trailingWhy.ok === false, trailingWhy);
      const leadingWhy = await run(stub([mcCandidate({ prompt: "Why does documenting the compromise help most?" })]));
      check("a leading 'Why does…' MC stem is a real question and is KEPT", leadingWhy.ok === true, leadingWhy);
      check("copy fallback: a legacy explain prompt displays fixed PBR copy", displayPrompt("Explain which answer is more attuned and why.", { format: "PICK_BETTER_RESPONSE", candidates: ["aaaa", "bbbb"], rationalePrompt: null }) === FALLBACK_PROMPT.PICK_BETTER_RESPONSE);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });
    }

    console.log("\n18. K5 — the rewrite carries the exact preceding assistant turn");
    {
      const outcome = await run(stub([rwlCandidate(), pbrCandidate()]));
      check("ok: 2 rows", outcome.ok === true && outcome.created === 2, outcome);
      const rows = await rowsForPlan();
      const rwl = rows.find((r) => r.format === "REWRITE_WEAK_LINE")!.payload as unknown as { contextLine?: string };
      const pbr = rows.find((r) => r.format === "PICK_BETTER_RESPONSE")!.payload as unknown as { contextLine?: string };
      check("REWRITE contextLine is byte-identical to transcript turn 2 (the assistant turn before turn 3)", rwl.contextLine === CHECK_TRANSCRIPT.turns[2]!.content, rwl.contextLine);
      check("PBR contextLine is byte-identical to transcript turn 0", pbr.contextLine === CHECK_TRANSCRIPT.turns[0]!.content, pbr.contextLine);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });

      const forged = await run(stub([rwlCandidate({ payload: { ...rwlCandidate().payload, contextLine: "The interviewer praised your answer warmly.", techniqueId: "pressure-restate-the-ask" } })]));
      const [forgedRow] = await rowsForPlan();
      const fp = forgedRow?.payload as unknown as { contextLine?: string; techniqueId?: string } | undefined;
      check(
        "bite-proof: a model-supplied contextLine is IGNORED — the transcript's turn is stored",
        forged.ok === true && fp?.contextLine === CHECK_TRANSCRIPT.turns[2]!.content,
        fp,
      );
      check("bite-proof: a model-supplied off-competency techniqueId is IGNORED", !!fp && fp.techniqueId !== "pressure-restate-the-ask" && techniquesForCompetency(COMPETENCY_KEY).some((t) => t.id === fp.techniqueId), fp);
      check("precedingAssistantTurn: null for an assistant turn index", precedingAssistantTurn(CHECK_TRANSCRIPT, 2) === null);
      check("precedingAssistantTurn: exact for turn 1", precedingAssistantTurn(CHECK_TRANSCRIPT, 1) === CHECK_TRANSCRIPT.turns[0]!.content);
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });
    }

    console.log(`\n${checks} checks run, ${failures} failed.`);
    if (failures > 0) {
      process.exit(1);
    }
  } finally {
    if (studyPlanId) {
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId } });
      await prisma.studyPlan.deleteMany({ where: { id: studyPlanId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
