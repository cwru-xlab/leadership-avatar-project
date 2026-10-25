/**
 * Phase 23 drill iteration — pure battery (no database, no model).
 *
 * D1: the result points at the student's actual words. Quotes are exact
 *     excerpts of the attempt transcript or they are dropped; the technique
 *     comes from the closed library; "what worked" only for a strong attempt.
 * D4: drill prompts are specific to the student. Source sessions supply the
 *     type, role/industry and real interviewer questions (redacted; a question
 *     the redactor would alter is dropped); the generic scenario is the last
 *     resort; a model prompt that ignores the sessions is discarded.
 *
 * Every rule has a bite-proof.
 * Run: npx tsx scripts/verify-drill-feedback-and-prompts.ts
 */
import {
  decodeGraderRecord,
  encodeGraderRecord,
  exactExcerpt,
  parseDrillGrade,
  parseDrillPointers,
} from "../lib/study-plan/drill/grade";
import {
  buildDrillSessionContexts,
  groundedInSessions,
  questionFromInterviewerLine,
  SCENARIO_TEMPLATES,
  templateBrief,
  validateCandidate,
  type DrillSessionContext,
} from "../lib/study-plan/drill/brief";
import { techniquesForCompetency } from "../lib/study-plan/coached/tips";
import type { InterviewTranscript } from "../lib/interview/transcript";

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passes += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const KEY = "structure_and_clarity" as const;
const LIB = techniquesForCompetency(KEY);
const TRANSCRIPT =
  "So, um, I think I chose computer science and business because, well, there were a lot of reasons. " +
  "At my internship I saw great software fail because nobody understood the customer.";

console.log("\n1. D1 — exact excerpts");
{
  check("an exact excerpt is accepted", exactExcerpt("there were a lot of reasons", TRANSCRIPT) === "there were a lot of reasons");
  check(
    "case/whitespace/curly quotes/wrapping marks are tolerated, and the STUDENT'S text is returned",
    exactExcerpt("“At my  INTERNSHIP I saw great software fail…”", TRANSCRIPT) === "At my internship I saw great software fail",
  );
  check("bite-proof: a tidied-up paraphrase is rejected", exactExcerpt("there were many reasons", TRANSCRIPT) === null);
  check("bite-proof: an invented quote is rejected", exactExcerpt("I always lead with my conclusion", TRANSCRIPT) === null);
  check("a 2-word excerpt is too short to point at", exactExcerpt("my internship", TRANSCRIPT) === null);
}

console.log("\n2. D1 — pointers");
{
  const techniqueId = LIB[2]?.id ?? LIB[0].id;
  const base = {
    miss_quote: "there were a lot of reasons",
    miss_technique_id: techniqueId,
    worked_quote: "At my internship I saw great software fail",
    worked_note: "You grounded your point in a concrete experience.",
  };
  const strong = parseDrillPointers(base, { competencyKey: KEY, transcript: TRANSCRIPT, score: 5 });
  check(
    "a valid miss pointer keeps the quote and the library technique name",
    strong.miss?.quote === "there were a lot of reasons" && strong.miss?.techniqueName === LIB.find((t) => t.id === techniqueId)?.name,
  );
  check("a strong attempt keeps one what-worked line with its quote", strong.worked?.quote === base.worked_quote);
  const weak = parseDrillPointers(base, { competencyKey: KEY, transcript: TRANSCRIPT, score: 3 });
  check("bite-proof: a 3/5 attempt gets NO what-worked line", weak.worked === null && weak.miss !== null);
  const fabricated = parseDrillPointers({ ...base, miss_quote: "I led with my conclusion" }, { competencyKey: KEY, transcript: TRANSCRIPT, score: 3 });
  check("bite-proof: a fabricated miss quote drops the pointer", fabricated.miss === null);
  const offLibrary = parseDrillPointers(
    { ...base, miss_technique_id: "made-up" },
    { competencyKey: KEY, transcript: TRANSCRIPT, score: 3, drillTechniqueId: LIB[0].id },
  );
  check("an off-library technique falls back to the drill's own technique", offLibrary.miss?.techniqueId === LIB[0].id);
  const noFallback = parseDrillPointers({ ...base, miss_technique_id: "made-up" }, { competencyKey: KEY, transcript: TRANSCRIPT, score: 3 });
  check("bite-proof: an off-library technique with no fallback drops the pointer", noFallback.miss === null);
  const scriptedNote = parseDrillPointers(
    { ...base, worked_note: 'Next time say "I chose this because I love customers" first.' },
    { competencyKey: KEY, transcript: TRANSCRIPT, score: 5 },
  );
  check("bite-proof: a what-worked note that scripts words is dropped", scriptedNote.worked === null);

  const grade = parseDrillGrade(
    JSON.stringify({ score: 4, feedback: "Put your main point in your first sentence next time.", rationale: "ok", ...base }),
    { competencyKey: KEY, transcript: TRANSCRIPT, model: "test" },
  );
  check("parseDrillGrade carries the validated pointers", grade.pointers.miss !== null && grade.pointers.worked !== null);
  const legacy = parseDrillGrade(JSON.stringify({ score: 2, feedback: "Put your main point first.", rationale: "x" }), {
    competencyKey: KEY,
    transcript: TRANSCRIPT,
    model: "test",
  });
  check("a response without pointer fields still grades (pointers empty)", legacy.pointers.miss === null && legacy.pointers.worked === null);

  const stored = encodeGraderRecord("why", strong);
  const back = decodeGraderRecord(stored);
  check("the grader record round-trips through the rationale column", back.rationale === "why" && back.pointers?.miss?.quote === strong.miss?.quote);
  const old = decodeGraderRecord("A plain legacy rationale.");
  check("a legacy plain-text rationale reads back with no pointers", old.pointers === null && old.rationale === "A plain legacy rationale.");
}

console.log("\n3. D4 — source-session context");
const transcript = (id: string, lines: string[]): InterviewTranscript =>
  ({
    version: 1,
    reportId: id,
    userId: "u",
    typeSlug: "general",
    interviewer: { avatarId: null, name: null },
    startedAt: 0,
    updatedAt: 0,
    turns: lines.map((content, i) => ({ role: i % 2 === 0 ? "assistant" : "user", content, timestamp: i })),
    progress: {} as InterviewTranscript["progress"],
  }) as InterviewTranscript;
{
  check(
    "the last question sentence of an interviewer line is kept",
    questionFromInterviewerLine("Thanks for that. Why did you pursue both computer science and business management?", []) ===
      "Why did you pursue both computer science and business management?",
  );
  check(
    "bite-proof: a question naming the student is dropped (redaction would alter it)",
    questionFromInterviewerLine("Alice, why did you pursue both computer science and business management?", ["Alice"]) === null,
  );
  check("a short pleasantry is not a drill question", questionFromInterviewerLine("How are you today?", []) === null);
  const ctxs = buildDrillSessionContexts(
    [{ id: "r1", typeName: "General Interview", roleTitle: "Product Manager", industry: "Healthcare" }],
    new Map([
      [
        "r1",
        transcript("r1", [
          "Welcome. Tell me about a time you had to influence a team without formal authority?",
          "Sure, at my internship...",
          "Alice, what would your last manager say is your biggest weakness?",
          "Hmm...",
        ]),
      ],
    ]),
    ["Alice"],
  );
  check(
    "contexts keep type, role, industry and only the safe questions",
    ctxs[0].roleTitle === "Product Manager" &&
      ctxs[0].industry === "Healthcare" &&
      ctxs[0].questions.length === 1 &&
      ctxs[0].questions[0].startsWith("Tell me about a time"),
    JSON.stringify(ctxs),
  );
  check("student turns are never mined for questions", !ctxs[0].questions.some((q) => q.includes("internship")));
}

console.log("\n4. D4 — templates are specific first, generic last");
const SESSIONS: DrillSessionContext[] = [
  {
    reportId: "r1",
    typeName: "General Interview",
    roleTitle: "Product Manager",
    industry: "Healthcare",
    questions: ["Tell me about a time you had to influence a team without formal authority?"],
  },
];
{
  const request = { position: 2, competencyKey: KEY, variant: 0, theme: "Organization" };
  const session = templateBrief(request, [], { sessions: SESSIONS });
  check(
    "with a source session, the template is SESSION-based and names the role and the real question",
    session.promptBasis === "SESSION" &&
      session.scenarioPrompt.includes("Product Manager") &&
      session.scenarioPrompt.includes("influence a team without formal authority"),
    session.scenarioPrompt,
  );
  const roleOnly = templateBrief(request, [], { sessions: [{ ...SESSIONS[0], questions: [] }] });
  check("with role/industry but no question, still SESSION-based", roleOnly.promptBasis === "SESSION" && roleOnly.scenarioPrompt.includes("Healthcare"));
  const theme = templateBrief(request, [], { sessions: [] });
  check("with no sessions, the theme template applies", theme.promptBasis === "THEME");
  const generic = templateBrief({ ...request, theme: null }, []);
  check(
    "the generic scenario is only the last resort",
    generic.promptBasis === "COMPETENCY" && generic.scenarioPrompt.startsWith(SCENARIO_TEMPLATES[KEY]),
  );
  const moment = templateBrief(request, [
    { linkedGrowthAreaTitles: ["Organization"], precedingAvatarText: "Great. Why did you choose to study both computer science and business?" },
  ]);
  check(
    "a moment template now names the real question that was asked",
    moment.promptBasis === "MOMENT" && moment.scenarioPrompt.includes("Why did you choose to study both computer science and business?"),
    moment.scenarioPrompt,
  );
}

console.log("\n5. D4 — the model gate discards generic prompts");
{
  const request = { position: 1, competencyKey: KEY, variant: 0, theme: null };
  const ctx = {
    requestByPosition: new Map([[1, request]]),
    used: new Set<number>(),
    preparedByCompetency: new Map(),
    transcriptsByReportId: new Map(),
    sessions: SESSIONS,
    model: "test",
  };
  const base = { position: 1, technique_id: LIB[0].id, quoted_text: null, source_report_id: null, quoted_turn_index: null };
  const generic = validateCandidate(
    { ...base, scenario_prompt: "Imagine you are speaking to a room about what motivates you. Keep your main point clear and up front." },
    ctx,
  );
  check("bite-proof: a generic 'speaking to a room' prompt is discarded", !generic.ok && /generic/.test(generic.reason), JSON.stringify(generic));
  const grounded = validateCandidate(
    {
      ...base,
      scenario_prompt:
        "In your product manager interview, you were asked how you influenced a team without formal authority. Answer again, putting your main point first.",
    },
    ctx,
  );
  check("a prompt grounded in the student's session is accepted as SESSION", grounded.ok && grounded.brief.promptBasis === "SESSION", JSON.stringify(grounded));
  check("groundedInSessions matches on shared question words", groundedInSessions("Talk about how you influence a team without authority.", SESSIONS));
  check("bite-proof: groundedInSessions rejects an unrelated prompt", !groundedInSessions("Describe your favourite holiday destination.", SESSIONS));
  const noSessions = validateCandidate(
    { ...base, scenario_prompt: "Imagine you are speaking to a room about what motivates you. Keep your main point clear and up front." },
    { ...ctx, sessions: [] },
  );
  check("with no sessions supplied, the gate does not demand grounding", noSessions.ok);
}

console.log(failures === 0 ? `\nALL PASS (${passes} checks)\n` : `\nFAILED: ${failures} assertion(s), ${passes} passed\n`);
process.exit(failures === 0 ? 0 : 1);
