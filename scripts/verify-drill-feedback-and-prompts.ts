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
import { gradeDrillAttempt, noteMatchesTechnique, reconcileNote, retryFocusFor, DRILL_RUBRIC_ANCHORS, DRILL_GRADING_SYSTEM_PROMPT, DRILL_NOTE_SYSTEM_PROMPT } from "../lib/study-plan/drill/grade";
import { gradingSampling, GRADING_SEED } from "../lib/study-plan/grading-determinism";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowedDrillTechniques, rankDrillTechniques } from "../lib/study-plan/drill/brief";
import { isWrittenTechnique } from "../lib/study-plan/checks/explain";
import { COMPETENCIES } from "../lib/mastery/competencies";
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
  const long = exactExcerpt(TRANSCRIPT, TRANSCRIPT);
  check(
    "an over-long exact excerpt is shortened to its opening sentence (still the student's words)",
    long !== null && TRANSCRIPT.startsWith(long) && long.split(/\s+/).length <= 30,
    String(long),
  );
  check("bite-proof: an over-long INVENTED excerpt is still rejected", exactExcerpt("Invented words " + TRANSCRIPT, TRANSCRIPT) === null);
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
        "In my product manager interview, I was asked how I influenced a team without formal authority. I answer again, putting my main point first.",
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
  check(
    "grader feedback instructions require first-person I/my invitations",
    DRILL_GRADING_SYSTEM_PROMPT.includes("first person from the learner's perspective (I/my)") &&
      DRILL_GRADING_SYSTEM_PROMPT.includes("Never refer to the learner as you") &&
      !/in the second person/.test(DRILL_GRADING_SYSTEM_PROMPT.split('"rationale"')[0]),
  );
  check(
    "note regeneration prompt requires first-person I/my invitations",
    DRILL_NOTE_SYSTEM_PROMPT.includes("first person from the learner's perspective (I/my)") &&
      !DRILL_NOTE_SYSTEM_PROMPT.includes("second person"),
  );
}

async function qSections() {
  console.log("\n6. Q2 — technique chosen to fit, never by position, never spoken-only on content");
  for (const c of COMPETENCIES) {
    const allowed = allowedDrillTechniques(c.key);
    const ok = c.key === "delivery_presence" ? allowed.length === techniquesForCompetency(c.key).length : allowed.every(isWrittenTechnique);
    check(`${c.key}: allowed techniques respect the spoken-only exclusion`, ok && allowed.length > 0);
  }
  const transitions = rankDrillTechniques(KEY, "Walk through the steps of your project and signpost each transition clearly.", []);
  check("the best fit for a transitions prompt is 'Signpost your transitions'", transitions[0]?.name === "Signpost your transitions", transitions[0]?.name);
  const flagged = rankDrillTechniques(KEY, "Tell me about your project.", ["Closing the loop on your answer"]);
  check("the weak-moment flag steers the pick", flagged[0]?.name === "Close the loop", flagged[0]?.name);
  const pressureContent = rankDrillTechniques("holding_position_under_pressure", "Your manager pushes back hard on your plan; slow down and hold your case.", []);
  check(
    "bite-proof: a content prompt that says 'slow down' still never gets the spoken-only pressure move",
    !pressureContent.some((t) => t.id === "pressure-slow-your-response"),
  );
  const a = templateBrief({ position: 1, competencyKey: KEY, variant: 0, theme: null }, [], { sessions: SESSIONS });
  const b = templateBrief({ position: 7, competencyKey: KEY, variant: 0, theme: null }, [], { sessions: SESSIONS });
  check(
    "the same prompt gets the same technique wherever it sits in the path (no position pick)",
    a.scenarioPrompt !== b.scenarioPrompt || a.techniqueId === b.techniqueId,
  );
  const topFit = rankDrillTechniques(KEY, a.scenarioPrompt, [])[0];
  check("a template's technique is the top fit for its own prompt", a.techniqueId === topFit?.id, `${a.techniqueId} vs ${topFit?.id}`);

  console.log("\n7. Q1 — the note matches the quoted technique");
  const oneIdea = LIB.find((t) => t.name === "One idea per sentence")!;
  check("a note about splitting sentences matches 'One idea per sentence'", noteMatchesTechnique("Try splitting sentences so each has just one idea for clarity.", oneIdea.id, KEY));
  check(
    "bite-proof: a note about pausing between steps does NOT match it",
    !noteMatchesTechnique("Experiment with pausing slightly between each step to help ideas land more distinctly.", oneIdea.id, KEY),
  );
  const graded = {
    score: 4, feedback: "Pause between steps.", feedbackReplaced: false, rationale: "", model: "t",
    pointers: { miss: { quote: "there were a lot of reasons", techniqueId: oneIdea.id, techniqueName: oneIdea.name, reminder: oneIdea.reminder }, worked: null },
  };
  check("a matching regenerated note is kept", reconcileNote(graded, "Split your longest sentence so each carries one idea.", KEY, TRANSCRIPT).feedback.startsWith("Split your longest"));
  check("a mismatched regenerated note falls back to the technique's reminder", reconcileNote(graded, "Pause more.", KEY, TRANSCRIPT).feedback === oneIdea.reminder);
  check("no regeneration (model failure) falls back to the reminder", reconcileNote(graded, null, KEY, TRANSCRIPT).feedback === oneIdea.reminder);

  const firstRaw = JSON.stringify({
    score: 3, feedback: "Experiment with pausing slightly between each step.", rationale: "r",
    miss_quote: "there were a lot of reasons", miss_technique_id: oneIdea.id, worked_quote: "", worked_note: "",
  });
  let noteCalls = 0;
  const regen = await gradeDrillAttempt({
    competencyKey: KEY, scenarioPrompt: "s", tipText: LIB[0].reminder, transcript: TRANSCRIPT,
    delivery: { wordsPerMinute: null, fillerWordCount: null, pauseCount: null, eyeContactPct: null, spokenSeconds: 20 },
    callModel: async () => firstRaw,
    callNoteModel: async () => { noteCalls += 1; return JSON.stringify({ feedback: "Split your longest sentence so each one carries a single idea." }); },
  });
  check("a mismatched note triggers exactly ONE regeneration, and the matching one is used", noteCalls === 1 && regen.feedback.startsWith("Split your longest"), regen.feedback);
  noteCalls = 0;
  const fallback = await gradeDrillAttempt({
    competencyKey: KEY, scenarioPrompt: "s", tipText: LIB[0].reminder, transcript: TRANSCRIPT,
    delivery: { wordsPerMinute: null, fillerWordCount: null, pauseCount: null, eyeContactPct: null, spokenSeconds: 20 },
    callModel: async () => firstRaw,
    callNoteModel: async () => { noteCalls += 1; return JSON.stringify({ feedback: "Slow down and breathe." }); },
  });
  check("a second mismatch uses the technique's reminder (no further calls)", noteCalls === 1 && fallback.feedback === oneIdea.reminder);
  noteCalls = 0;
  const matching = await gradeDrillAttempt({
    competencyKey: KEY, scenarioPrompt: "s", tipText: LIB[0].reminder, transcript: TRANSCRIPT,
    delivery: { wordsPerMinute: null, fillerWordCount: null, pauseCount: null, eyeContactPct: null, spokenSeconds: 20 },
    callModel: async () => firstRaw.replace("Experiment with pausing slightly between each step.", "Split any long sentence so each carries one idea."),
    callNoteModel: async () => { noteCalls += 1; return "{}"; },
  });
  check("a note that already matches makes no regeneration call", noteCalls === 0 && matching.feedback.startsWith("Split any long"));
}

function rSections() {
  console.log("\n8. Retry focus from the note when there is no quote");
  const closeLoop = LIB.find((t) => t.name === "Close the loop")!;
  const fromNote = retryFocusFor({ miss: null, worked: null }, "Try closing the loop by restating the question at the end to reinforce clarity.", KEY);
  check("a 5/5 note about closing the loop focuses the retry on 'Close the loop'", fromNote?.techniqueId === closeLoop.id, JSON.stringify(fromNote));
  const fromMiss = retryFocusFor(
    { miss: { quote: "q q q", techniqueId: LIB[0].id, techniqueName: LIB[0].name, reminder: LIB[0].reminder }, worked: null },
    "Try closing the loop by restating the question.",
    KEY,
  );
  check("a quoted miss still wins over the note", fromMiss?.techniqueId === LIB[0].id);
  check("bite-proof: an unrelated note yields no focus (falls back to the drill's technique)", retryFocusFor(null, "Keep going.", KEY) === null);

  console.log("\n9. Deterministic grading");
  const g = gradingSampling("gpt-4.1");
  check("gpt-4.1 graders use temperature 0 and the fixed seed", g.temperature === 0 && g.seed === GRADING_SEED);
  const r = gradingSampling("o3-mini");
  check("a reasoning model gets the seed only (it rejects temperature)", r.temperature === undefined && r.seed === GRADING_SEED);
  const root = join(__dirname, "..");
  const graders = [
    "lib/study-plan/drill/grade.ts",
    "lib/study-plan/coached/grade-attempt.ts",
    "lib/study-plan/checks/grade.ts",
    "lib/study-plan/coached/moment-scoring.ts",
    "lib/study-plan/coached/reply-classifier.ts",
  ];
  const callsWithoutSampling = (src: string) => {
    const calls = src.split("chat.completions.create(").slice(1).map((c) => c.slice(0, c.indexOf("});")));
    return calls.length === 0 ? -1 : calls.filter((c) => !c.includes("...gradingSampling(")).length;
  };
  for (const f of graders) {
    const n = callsWithoutSampling(readFileSync(join(root, f), "utf8"));
    check(`${f}: every model call uses gradingSampling`, n === 0, String(n));
  }
  for (const f of ["lib/study-plan/coached/coach.ts", "lib/study-plan/drill/brief.ts", "lib/study-plan/checks/generate.ts"]) {
    check(`${f}: generation keeps its own sampling`, !readFileSync(join(root, f), "utf8").includes("gradingSampling"));
  }
  const drillSrc = readFileSync(join(root, graders[0]), "utf8");
  check("bite-proof: dropping gradingSampling from a grader call is caught", callsWithoutSampling(drillSrc.replace("...gradingSampling(payload.model),", "")) > 0);
  check(
    "the drill grader sends 1/3/5 rubric anchors for every competency",
    COMPETENCIES.every((c) => DRILL_RUBRIC_ANCHORS[c.key]?.[1] && DRILL_RUBRIC_ANCHORS[c.key]?.[3] && DRILL_RUBRIC_ANCHORS[c.key]?.[5]) &&
      drillSrc.includes("rubric_anchors: DRILL_RUBRIC_ANCHORS[args.competencyKey]"),
  );
  const coachedSrc = readFileSync(join(root, "lib/study-plan/coached/grade-attempt.ts"), "utf8");
  const anchorCopyIssue = (src: string) =>
    !/rubricAnchors: RUBRIC_ANCHORS\[/.test(src) ||
    COMPETENCIES.some((c) => [1, 3, 5].some((n) => src.includes(DRILL_RUBRIC_ANCHORS[c.key][n as 1 | 3 | 5])));
  check("the coached grader sends the SAME shared anchors (imported, not copied)", !anchorCopyIssue(coachedSrc));
  check(
    "bite-proof: a pasted copy of an anchor in the coached grader is caught",
    anchorCopyIssue(coachedSrc + `\n// ${DRILL_RUBRIC_ANCHORS.structure_and_clarity[3]}`),
  );
}

qSections().then(() => {
  rSections();
  console.log(failures === 0 ? `\nALL PASS (${passes} checks)\n` : `\nFAILED: ${failures} assertion(s), ${passes} passed\n`);
  process.exit(failures === 0 ? 0 : 1);
});
