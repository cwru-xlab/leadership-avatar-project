/**
 * Proves the problem-interview engine against the test fixture
 * (`lib/problem-interview/fixtures/`), with no network or database:
 *
 *   - marker parsing: nudge / exhibit / stage markers parsed and stripped,
 *     truncated markers stripped, malformed flagged;
 *   - progress tracking: stage moves, at-most-once nudges and reveals,
 *     unknown ids dropped, self-heal into the problem stage;
 *   - live prompt: session-constant system prompt (byte-identical across
 *     turns; no facts leak into the tail), progress block contents;
 *   - schema composition: process_rigor_score + outcome fields present,
 *     visual/vocal still required, evaluator keeps the interview rules;
 *   - outcome narrowing + ground truth: malformed → null, nudged hit →
 *     prompted, ids pinned, process_rigor ceiling, sanitizer;
 *   - question selection and the engine's parseEngineTurn branch.
 *
 * Run: npx tsx scripts/verify-problem-interview.ts
 */

export {};

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

async function main() {
  const { parseProblemTurn } = await import("../lib/problem-interview/turn-control");
  const {
    reduceProblemTurn,
    initialProblemState,
    buildProblemSessionSnapshot,
    asProblemSessionSnapshot,
    toProblemLiveView,
  } = await import("../lib/problem-interview/session-state");
  const {
    asProcessStepResults,
    finalizeProblemOutcome,
    buildProcessStepViews,
  } = await import("../lib/problem-interview/outcome");
  const { buildProblemProgressBlock } = await import("../lib/problem-interview/prompts");
  const { selectProblemQuestion, getProblemBank } = await import(
    "../lib/problem-interview/banks.server"
  );
  const { PROBLEM_FIXTURE_SLUG, PROBLEM_FIXTURE_FRAMEWORK } = await import(
    "../lib/problem-interview/fixtures/type"
  );
  const { PROBLEM_FIXTURE_BANK } = await import("../lib/problem-interview/fixtures/bank");
  const { deriveProcessRigorScore } = await import("../lib/problem-interview/types");
  const processRigorCeiling = (steps: Parameters<typeof deriveProcessRigorScore>[0] | null) =>
    steps ? deriveProcessRigorScore(steps) : null;
  const { getEngineType, listEngineTypes } = await import("../lib/engine/registry");
  const { resolveSessionConfig } = await import("../lib/engine/resolve");
  const { buildRubricJsonSchema } = await import("../lib/engine/rubric");
  const { buildTurnMessages } = await import("../lib/engine/prompts");
  const { parseEngineTurn } = await import("../lib/engine/turn-control");
  const { listInterviewTypes, getInterviewType } = await import("../lib/interview/types");
  const { INTERVIEW_EVALUATOR_PROMPT } = await import("../lib/interview/prompts");
  const { sanitizeOutcomeQuotes } = await import("../lib/report/quote-sanitizer");
  const { resolveAttemptLanguage } = await import("../lib/languages");

  const question = PROBLEM_FIXTURE_BANK[0]!;
  const framework = PROBLEM_FIXTURE_FRAMEWORK;
  const ctx = { question, framework, atSeconds: 100, turnIndex: 3 };

  // ---------------------------------------------------------------------------
  console.log("\nmarker parsing");
  {
    const reply =
      "Sure — I'm putting that on your screen now. What stands out to you?\n" +
      '<interview-turn kind="exhibit" exhibit="ex1" />\n<interview-turn kind="follow_up" />';
    const parsed = parseProblemTurn(reply);
    check("content has no marker", !/interview-turn/.test(parsed.content), parsed.content);
    check(
      "exhibit + follow_up actions parsed",
      JSON.stringify(parsed.actions) ===
        JSON.stringify([{ kind: "exhibit", exhibit: "ex1" }, { kind: "follow_up" }]),
      JSON.stringify(parsed.actions),
    );
    check("well-formed reply not malformed", parsed.malformed === false);

    const nudge = parseProblemTurn(
      'Who do you see using this?\n<interview-turn kind="nudge" step="identify_customer" />\n<interview-turn kind="follow_up" />',
    );
    check(
      "nudge action carries step",
      nudge.actions.some((a) => a.kind === "nudge" && a.step === "identify_customer"),
    );

    const truncated = parseProblemTurn('What would success look like?\n<interview-turn kind="fol');
    check("truncated marker stripped", truncated.content === "What would success look like?", truncated.content);
    check("truncated reply flagged malformed", truncated.malformed);

    const midText = parseProblemTurn(
      'Here is the data <interview-turn kind="exhibit" exhibit="ex1" /> on screen.\n<interview-turn kind="planned" />',
    );
    check("mid-text marker stripped", !/interview-turn/.test(midText.content), midText.content);

    const bogus = parseProblemTurn('Hello.\n<interview-turn kind="dance" />');
    check("unknown kind flagged malformed and stripped", bogus.malformed && bogus.content === "Hello.");
  }

  // ---------------------------------------------------------------------------
  console.log("\nprogress tracking");
  {
    let state = initialProblemState();
    let r = reduceProblemTurn(state, [{ kind: "planned" }], ctx);
    check("opening → fit on planned", r.state.stage === "fit");
    state = r.state;
    r = reduceProblemTurn(state, [{ kind: "follow_up" }], ctx);
    check("fit follow-up counted", r.state.fitFollowUpsUsed === 1);
    r = reduceProblemTurn(r.state, [{ kind: "follow_up" }], ctx);
    check("fit follow-up capped at 1", r.state.fitFollowUpsUsed === 1);
    r = reduceProblemTurn(r.state, [{ kind: "planned" }], ctx);
    check("fit → problem on planned, prompt posed", r.state.stage === "problem" && r.state.promptPosed);
    state = r.state;

    r = reduceProblemTurn(state, [{ kind: "exhibit", exhibit: "ex1" }, { kind: "follow_up" }], ctx);
    check("exhibit revealed", r.state.revealedExhibits.join() === "ex1");
    check(
      "exhibit event carries public data without keyInsight",
      r.events.some(
        (e) => e.kind === "exhibit" && e.exhibit.rows.length === 4 && !("keyInsight" in e.exhibit),
      ),
    );
    check("follow_up does not move problem stage", r.state.stage === "problem");
    const again = reduceProblemTurn(r.state, [{ kind: "exhibit", exhibit: "ex1" }], ctx);
    check("exhibit revealed at most once", again.events.length === 0 && again.state.revealedExhibits.length === 1);
    const unknownEx = reduceProblemTurn(r.state, [{ kind: "exhibit", exhibit: "ex9" }], ctx);
    check("unknown exhibit dropped", unknownEx.events.length === 0);

    let n = reduceProblemTurn(r.state, [{ kind: "nudge", step: "identify_customer" }], ctx);
    check("nudge recorded", n.state.nudgedSteps.join() === "identify_customer" && n.events.length === 1);
    n = reduceProblemTurn(n.state, [{ kind: "nudge", step: "identify_customer" }], ctx);
    check("nudge at most once per step", n.events.length === 0);
    const unknownStep = reduceProblemTurn(n.state, [{ kind: "nudge", step: "invent_a_step" }], ctx);
    check("unknown step dropped", unknownStep.events.length === 0);

    const healed = reduceProblemTurn(
      { ...initialProblemState(), stage: "fit" },
      [{ kind: "exhibit", exhibit: "ex1" }],
      ctx,
    );
    check("exhibit during fit self-heals into problem", healed.state.stage === "problem" && healed.state.promptPosed);

    const toQs = reduceProblemTurn(n.state, [{ kind: "planned" }], ctx);
    check("problem → candidate_questions", toQs.state.stage === "candidate_questions");
    const closed = reduceProblemTurn(toQs.state, [{ kind: "closing" }], ctx);
    check("closing", closed.state.stage === "closing");
    const back = reduceProblemTurn(closed.state, [{ kind: "planned" }], ctx);
    check("stage never moves backwards", back.state.stage === "closing");

    const timing = { elapsedMinutes: 12, targetMinutes: 15 };
    const block = buildProblemProgressBlock(n.state, timing, question, framework);
    check("progress block: stage", block.includes("Current stage: problem"));
    check("progress block: revealed exhibit", /already on the candidate's screen: ex1/.test(block));
    check("progress block: nudged step listed", /already nudged.*identify_customer/.test(block));
    check("progress block: nudged step not re-offered", !/may still nudge[^\n]*identify_customer/.test(block));
    check("progress block: time pressure asks for recommendation", /final recommendation/.test(block));
    check("progress block: no interviewer facts", !block.includes(question.interviewerFacts[0]!));
  }

  // ---------------------------------------------------------------------------
  console.log("\nregistration + live prompt");
  const type = getEngineType(PROBLEM_FIXTURE_SLUG);
  check("fixture type resolves by slug", Boolean(type?.problemInterview));
  check("fixture hidden from ENGINE_TYPES", !listEngineTypes().some((t) => t.slug === PROBLEM_FIXTURE_SLUG));
  check("fixture hidden from launcher", !listInterviewTypes().some((t) => t.slug === PROBLEM_FIXTURE_SLUG));
  check("fixture resolves as an interview", Boolean(getInterviewType(PROBLEM_FIXTURE_SLUG)));
  check("fixture bank is server-registered", getProblemBank(PROBLEM_FIXTURE_SLUG).length === 1);
  check("classic consulting is still not a problem interview", !getEngineType("consulting")?.problemInterview);

  const resolved = resolveSessionConfig(PROBLEM_FIXTURE_SLUG);
  if (!resolved.ok) throw new Error(resolved.reason);
  const config = resolved.config;
  const language = resolveAttemptLanguage(undefined);
  {
    const turnA = buildTurnMessages({
      config,
      messages: [{ role: "user", content: "I'm ready." }],
      turnState: {
        problem: { state: initialProblemState(), question, framework },
        timing: { elapsedMinutes: 0, targetMinutes: 15 },
      },
      language,
      resumeText: "",
      problem: { question, framework },
    });
    const turnB = buildTurnMessages({
      config,
      messages: [
        { role: "user", content: "I'm ready." },
        { role: "assistant", content: "Welcome." },
        { role: "user", content: "Who uses the app?" },
      ],
      turnState: {
        problem: {
          state: { ...initialProblemState(), stage: "problem", promptPosed: true, revealedExhibits: ["ex1"] },
          question,
          framework,
        },
        timing: { elapsedMinutes: 6, targetMinutes: 15 },
      },
      language,
      resumeText: "",
      problem: { question, framework },
    });
    check("system prompt byte-identical across turns", turnA.systemPrompt === turnB.systemPrompt);
    const sys = turnA.systemPrompt;
    check("system prompt poses the question", sys.includes(question.prompt));
    check("system prompt carries facts (ask-only)", sys.includes(question.interviewerFacts[0]!));
    check("system prompt carries nudge text", sys.includes(framework.steps[1]!.nudge));
    check("system prompt has exhibit marker grammar", sys.includes('kind="exhibit" exhibit="EXHIBIT_ID"'));
    check("system prompt never leaks strongAnswerNotes", !sys.includes(question.strongAnswerNotes));
    check("system prompt never leaks keyInsight", !sys.includes(question.exhibits![0]!.keyInsight));
    check("no five-stage interview marker list", !sys.includes("behavioral planned question"));
    const tail = turnB.messages.at(-1)!.content;
    check("tail carries CASE PROGRESS", tail.includes("[CASE PROGRESS"));
    check("tail does not carry the five-stage block", !tail.includes("[INTERVIEW PROGRESS"));

    let threw = false;
    try {
      buildTurnMessages({
        config,
        messages: [{ role: "user", content: "hi" }],
        turnState: {},
        language,
      });
    } catch {
      threw = true;
    }
    check("live prompt without a pinned question throws (no silent default)", threw);
  }

  // ---------------------------------------------------------------------------
  console.log("\nengine parse branch");
  {
    const parsed = parseEngineTurn(
      'Who do you see using this?\n<interview-turn kind="nudge" step="identify_customer" />\n<interview-turn kind="follow_up" />',
      config,
    );
    check("parseEngineTurn strips problem markers", parsed.cleanedText === "Who do you see using this?");
    check("parseEngineTurn returns problemActions", (parsed.problemActions ?? []).length === 2);
    check("parseEngineTurn leaves interview progress null", parsed.progress === null);
  }

  // ---------------------------------------------------------------------------
  console.log("\nschema composition");
  {
    const schema = buildRubricJsonSchema(config).schema;
    const required = schema.required;
    check("process_rigor_score required", required.includes("process_rigor_score"));
    check("visual_score still required", required.includes("visual_score"));
    check("vocal_score still required", required.includes("vocal_score"));
    check("outcome required", required.includes("outcome"));
    const outcome = schema.properties.outcome as { required: string[] };
    check(
      "outcome fields questionId/frameworkKey/processSteps",
      ["questionId", "frameworkKey", "processSteps"].every((k) => outcome.required.includes(k)),
      JSON.stringify(outcome.required),
    );
    const evaluator = type!.prompts.evaluatorPrompt;
    check("evaluator keeps the interview rules verbatim", evaluator.startsWith(INTERVIEW_EVALUATOR_PROMPT.trim()));
    check("evaluator carries the scoring guide", evaluator.includes("process_rigor_score follows the step results"));
    check("evaluator lists framework criteria", evaluator.includes(framework.steps[0]!.evidenceCriteria));
    check("evaluator explains ground truth", /never be "hit"/.test(evaluator));
  }

  // ---------------------------------------------------------------------------
  console.log("\noutcome narrowing + ground truth");
  {
    check("malformed string → null", asProcessStepResults("{not json") === null);
    check("non-array → null", asProcessStepResults('{"key":"x"}') === null);
    check("empty → null", asProcessStepResults("") === null);
    check("bad rows dropped", asProcessStepResults('[{"key":"a","status":"great"},{"key":"b","status":"hit"}]')?.length === 1);
    check("array accepted", asProcessStepResults([{ key: "a", status: "missed" }])?.[0]?.status === "missed");

    let snapshot = buildProblemSessionSnapshot(question, framework, "2026-11-06T00:00:00Z");
    const r = reduceProblemTurn(snapshot.state, [{ kind: "nudge", step: "identify_customer" }], ctx);
    snapshot = { ...snapshot, state: r.state, events: r.events };

    const produced = {
      questionId: "made-up",
      frameworkKey: "nope",
      processSteps: JSON.stringify([
        { key: "recommend", status: "hit", evidenceQuote: "I'd ship holds", timecodeSeconds: 600, note: "Good." },
        { key: "identify_customer", status: "hit", evidenceQuote: "55+ readers", timecodeSeconds: 200, note: "n" },
        { key: "clarify_goal", status: "hit", evidenceQuote: "double loans", timecodeSeconds: 90, note: "n" },
        { key: "invented", status: "hit", evidenceQuote: "", timecodeSeconds: null, note: "" },
        { key: "use_data", status: "missed", evidenceQuote: "", timecodeSeconds: null, note: "Ask for data." },
      ]),
    };
    const final = finalizeProblemOutcome(produced, snapshot);
    check("questionId pinned to snapshot", final.questionId === question.id);
    check("frameworkKey pinned to snapshot", final.frameworkKey === framework.key);
    const steps = asProcessStepResults(final.processSteps)!;
    check("steps in framework order, unknown dropped", steps.map((s) => s.key).join() === "clarify_goal,identify_customer,use_data,recommend");
    check("nudged hit → prompted", steps.find((s) => s.key === "identify_customer")?.status === "prompted");
    check("un-nudged hit stays hit", steps.find((s) => s.key === "clarify_goal")?.status === "hit");
    const malformed = finalizeProblemOutcome({ processSteps: "garbage" }, snapshot);
    check("malformed processSteps removed, ids still pinned", !("processSteps" in malformed) && malformed.questionId === question.id);
    check("null produced outcome still yields ids", finalizeProblemOutcome(null, snapshot).frameworkKey === framework.key);

    check("derive: all hit → 5", processRigorCeiling(steps.map((s) => ({ ...s, status: "hit" as const }))) === 5);
    check("derive: 1 prompted 1 missed → 3", processRigorCeiling(steps) === 3);
    const st = (statuses: string[]) => statuses.map((status, i) => ({ key: `k${i}`, status: status as "hit", evidenceQuote: "", timecodeSeconds: null, note: "" }));
    check("derive: 1 missed + 3 prompted → 2 (lower band)", processRigorCeiling(st(["missed", "prompted", "prompted", "prompted"])) === 2);
    check("derive: 3 missed → 1", processRigorCeiling(st(["missed", "missed", "missed", "hit"])) === 1);
    check("derive: n/a excluded", processRigorCeiling(st(["hit", "not_applicable"])) === 5);
    check("derive: none → null", processRigorCeiling(null) === null);

    check("factory declares no postProcessScores (rigor derived in the runner)", !type!.postProcessScores);
    check("derive: unparseable steps → no score", processRigorCeiling(asProcessStepResults("not json")) === null);
    check("derive: only n/a → null", processRigorCeiling(st(["not_applicable"])) === null);

    const views = buildProcessStepViews(snapshot.framework, final.processSteps);
    check("report views: one per framework step", views.length === framework.steps.length);
    check("report views: malformed → all ungraded", buildProcessStepViews(snapshot.framework, 42).every((v) => v.result === null));

    const sanitized = sanitizeOutcomeQuotes({ processSteps: JSON.stringify([{ key: "a", status: "hit", evidenceQuote: "x".repeat(500) }]) });
    check("sanitizer caps processSteps quotes", (asProcessStepResults(sanitized!.processSteps)?.[0]?.evidenceQuote.length ?? 999) <= 240);

    const roundTrip = asProblemSessionSnapshot(JSON.parse(JSON.stringify(snapshot)));
    check("snapshot round-trips through JSON", roundTrip?.state.nudgedSteps.join() === "identify_customer");
    check("garbage snapshot → null", asProblemSessionSnapshot({ questionId: 1 }) === null);
    const fresh = buildProblemSessionSnapshot(question, framework, "2026-11-06T00:00:00Z");
    check("live view hides prompt before it is posed", toProblemLiveView(fresh).question === null);
    check("live view shows prompt once posed (nudge self-heal)", toProblemLiveView(snapshot).question?.prompt === question.prompt);
  }

  // ---------------------------------------------------------------------------
  console.log("\nquestion selection");
  {
    const picked = selectProblemQuestion(PROBLEM_FIXTURE_BANK, [framework], {}, () => 0);
    check("selects a question with its framework", picked?.question.id === question.id && picked.framework.key === framework.key);
    check("unmatched family filter falls back to bank", selectProblemQuestion(PROBLEM_FIXTURE_BANK, [framework], { family: "guesstimate" })?.question.id === question.id);
    check("question whose framework is undeclared is unusable", selectProblemQuestion(PROBLEM_FIXTURE_BANK, []) === null);
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
