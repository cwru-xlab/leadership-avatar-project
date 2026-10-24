/**
 * Proves the Phase 23 VOICE_DRILL backend's pure contracts: the deterministic
 * brief, the model-candidate gates (closed technique library, coach-speech
 * rules, verbatim quote), the end-only grade parser (1..5, tip rules on the
 * "what to try next time" note), the VOICE_DRILL contribution input, and the
 * no-score-while-open DTO rule. Every gate has a bite-proof.
 *
 * Run: npx tsx scripts/verify-voice-drill.ts
 * Needs NO DATABASE_URL and NO OPENAI_API_KEY (models are stubbed).
 */
import { COMPETENCIES, type CompetencyKey } from "../lib/mastery/competencies";
import { CONTRIBUTION_WEIGHTS, weightForSource } from "../lib/mastery/weights";
import { validateContributionInputs } from "../lib/mastery/ledger";
import type { InterviewTranscript } from "../lib/interview/transcript";
import type { SessionMoment } from "../lib/study-plan/moments";
import {
  techniquesForCompetency,
  validateTip,
  validateCoachSpeech,
} from "../lib/study-plan/coached/tips";
import {
  templateBrief,
  generateDrillBriefs,
  validateCandidate,
  SCENARIO_TEMPLATES,
} from "../lib/study-plan/drill/brief";
import {
  parseDrillGrade,
  contributionInputFromDrillAttempt,
  deliverySummary,
  DrillGradingFailedError,
} from "../lib/study-plan/drill/grade";
import { attemptDTO, parseCompleteBody } from "../lib/study-plan/drill/service";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const KEYS = COMPETENCIES.map((c) => c.key) as CompetencyKey[];
const USER = "user-1";
const REPORT = "report-1";
const STUDENT_LINE = "I think we should probably just wait and see what the team decides later on.";
const transcript: InterviewTranscript = {
  version: 1,
  reportId: REPORT,
  userId: USER,
  typeSlug: "general",
  interviewer: { avatarId: null, name: null },
  startedAt: 0,
  updatedAt: 0,
  turns: [
    { role: "assistant", content: "How would you handle a disagreement on your team?", timestamp: 1000 },
    { role: "user", content: STUDENT_LINE, timestamp: 5000 },
  ],
  progress: {} as InterviewTranscript["progress"],
};
const moment: SessionMoment = {
  reportId: REPORT,
  turnIndex: 1,
  studentText: STUDENT_LINE,
  precedingAvatarText: "How would you handle a disagreement on your team?",
  timecode: "0:05",
  linkedGrowthAreaTitles: ["Taking a clear position"],
  competencyKeys: [],
};

console.log("1. DETERMINISTIC BRIEF");
{
  for (const key of KEYS) {
    const b = templateBrief({ position: 1, competencyKey: key, variant: 0, theme: null }, []);
    const lib = techniquesForCompetency(key);
    check(`${key}: tip is a library reminder verbatim`, lib.some((t) => t.reminder === b.tipText && t.id === b.techniqueId));
    check(`${key}: tip passes validateTip`, validateTip(b.tipText, { studentLine: "" }).ok);
    const speech = validateCoachSpeech(b.scenarioPrompt, { studentLine: "", counterpartLine: null, studentAttempts: [] });
    check(`${key}: scenario passes validateCoachSpeech`, speech.ok, JSON.stringify(speech));
    check(`${key}: scenario names the 60-90 second rep`, b.scenarioPrompt.includes("60-90 seconds"));
    check(`${key}: template quotes nobody`, b.quotedText === null && b.generationModel === "template");
  }
  const key: CompetencyKey = "structure_and_clarity";
  const v0 = templateBrief({ position: 1, competencyKey: key, variant: 0, theme: null }, []);
  const v1 = templateBrief({ position: 2, competencyKey: key, variant: 1, theme: null }, []);
  check("a second drill on the same competency gets a different technique", v0.techniqueId !== v1.techniqueId);
  const withMoment = templateBrief({ position: 1, competencyKey: key, variant: 0, theme: "Organization" }, [moment]);
  check(
    "basis MOMENT when a titled moment exists; uses the growth-area title, not transcript text",
    withMoment.promptBasis === "MOMENT" &&
      withMoment.scenarioPrompt.includes("Taking a clear position") &&
      !withMoment.scenarioPrompt.includes(STUDENT_LINE)
  );
  const withTheme = templateBrief({ position: 1, competencyKey: key, variant: 0, theme: "Organization of Responses" }, []);
  check("basis THEME quotes the plan theme", withTheme.promptBasis === "THEME" && withTheme.scenarioPrompt.includes('"Organization of Responses"'));
  check("basis COMPETENCY falls back to the hand-written scenario", v0.promptBasis === "COMPETENCY" && v0.scenarioPrompt.startsWith(SCENARIO_TEMPLATES[key]));
}

console.log("\n2. MODEL CANDIDATE GATES (generation proposes, validation disposes)");
{
  const key: CompetencyKey = "holding_position_under_pressure";
  const technique = techniquesForCompetency(key)[0];
  const ctx = {
    requestByPosition: new Map([[3, { position: 3, competencyKey: key, variant: 0, theme: null }]]),
    used: new Set<number>(),
    preparedByCompetency: new Map([[key, [{ reportId: REPORT, turnIndex: 1 }]]]),
    transcriptsByReportId: new Map([[REPORT, transcript]]),
    model: "stub-model",
  };
  const good = {
    position: 3,
    scenario_prompt: `Last time you said "${STUDENT_LINE}" when your team disagreed. Take the same situation again and keep a clear position for about a minute.`,
    technique_id: technique.id,
    quoted_text: STUDENT_LINE,
    source_report_id: REPORT,
    quoted_turn_index: 1,
  };
  const r = validateCandidate(good, ctx);
  check("a well-formed verbatim candidate is accepted", r.ok, JSON.stringify(r));
  check("accepted tip is the library reminder, never model text", r.ok && r.brief.tipText === technique.reminder);
  check("accepted quote keeps provenance", r.ok && r.brief.quotedText === STUDENT_LINE && r.brief.sourceReportId === REPORT && r.brief.promptBasis === "MOMENT");

  const misquote = STUDENT_LINE.replace("probably", "maybe");
  const bad = (overrides: Record<string, unknown>) => validateCandidate({ ...good, ...overrides }, ctx);
  check("bite-proof: a one-word misquote is DISCARDED", !bad({ quoted_text: misquote, scenario_prompt: good.scenario_prompt.replace(STUDENT_LINE, misquote) }).ok);
  check("bite-proof: a technique outside the competency library is DISCARDED", !bad({ technique_id: techniquesForCompetency("delivery_presence")[0].id }).ok);
  check("bite-proof: a scripted prompt (script cue) is DISCARDED", !bad({ quoted_text: null, source_report_id: null, quoted_turn_index: null, scenario_prompt: "Your manager pushes back on cost. Try saying that the savings pay it back within a year, then stop." }).ok);
  check("bite-proof: quoted words that are not the student's are DISCARDED", !bad({ quoted_text: null, source_report_id: null, quoted_turn_index: null, scenario_prompt: 'Your manager pushes back on cost. Open with "the savings pay it back within a single year" and hold.' }).ok);
  check("bite-proof: a quote from a moment not supplied for this competency is DISCARDED", !bad({ quoted_turn_index: 0 }).ok);
  check("bite-proof: a quote missing from the prompt is DISCARDED", !bad({ scenario_prompt: "Take your team disagreement again and keep a clear position for about a minute, out loud." }).ok);
  check("an unrequested position is DISCARDED", !bad({ position: 9 }).ok);
  check("a too-short prompt is DISCARDED", !bad({ quoted_text: null, source_report_id: null, quoted_turn_index: null, scenario_prompt: "Speak." }).ok);
}

async function section3() {
  console.log("\n3. generateDrillBriefs never leaves a drill without a brief");
  const requests = [
    { position: 2, competencyKey: "structure_and_clarity" as CompetencyKey, variant: 0, theme: null },
    { position: 3, competencyKey: "structure_and_clarity" as CompetencyKey, variant: 1, theme: null },
  ];
  const base = {
    userId: USER,
    requests,
    momentsByCompetency: new Map([["structure_and_clarity" as CompetencyKey, [moment]]]),
    transcriptsByReportId: new Map([[REPORT, transcript]]),
    selfNames: [],
  };
  const thrown = await generateDrillBriefs({ ...base, callModel: async () => { throw new Error("boom"); } });
  check("model throws -> every position keeps its template brief", thrown.briefs.size === 2 && [...thrown.briefs.values()].every((b) => b.generationModel === "template") && thrown.discarded.length === 1);
  const skipped = await generateDrillBriefs({ ...base, callModel: null });
  check("callModel null -> templates only, no discards", skipped.briefs.size === 2 && skipped.discarded.length === 0 && skipped.model === null);
  const tid = techniquesForCompetency("structure_and_clarity")[1].id;
  const mixed = await generateDrillBriefs({
    ...base,
    callModel: async () =>
      JSON.stringify({
        drills: [
          { position: 2, scenario_prompt: "Walk through the decision you described in that session again, leading with your conclusion, for about a minute.", technique_id: tid, quoted_text: null, source_report_id: null, quoted_turn_index: null },
          { position: 3, scenario_prompt: "Try saying the conclusion first and then two reasons, out loud, for a minute.", technique_id: tid, quoted_text: null, source_report_id: null, quoted_turn_index: null },
        ],
      }),
  });
  check("a valid candidate overrides its template", mixed.briefs.get(2)?.generationModel !== "template");
  check("an invalid candidate is discarded and its template stands", mixed.briefs.get(3)?.generationModel === "template" && mixed.discarded.some((d) => d.position === 3));
}

console.log("\n4. END-ONLY GRADE PARSER");
{
  const key: CompetencyKey = "concision_and_focus";
  const ctx = { competencyKey: key, transcript: STUDENT_LINE, model: "stub", excludeTechniqueReminder: techniquesForCompetency(key)[0].reminder };
  const ok = parseDrillGrade(JSON.stringify({ score: 4, feedback: "Drop your opening warm-up and start on the point next time.", rationale: "Tight." }), ctx);
  check("valid grade parsed, note kept", ok.score === 4 && !ok.feedbackReplaced);
  for (const bad of [0, 6, 2.5, "3", null]) {
    let threw = false;
    try {
      parseDrillGrade(JSON.stringify({ score: bad, feedback: "x", rationale: "" }), ctx);
    } catch (e) {
      threw = e instanceof DrillGradingFailedError;
    }
    check(`score ${JSON.stringify(bad)} fails the grade (never fabricated)`, threw);
  }
  const scripted = parseDrillGrade(JSON.stringify({ score: 2, feedback: "Next time try saying that you would wait for the data first.", rationale: "" }), ctx);
  check("bite-proof: a scripted note is REPLACED by a library reminder", scripted.feedbackReplaced && techniquesForCompetency(key).some((t) => t.reminder === scripted.feedback));
  check("the replacement differs from the drill's own live tip", scripted.feedback !== ctx.excludeTechniqueReminder);
  const echo = parseDrillGrade(JSON.stringify({ score: 2, feedback: "Avoid we should probably just wait and see what the team decides.", rationale: "" }), ctx);
  check("bite-proof: a note echoing the student's own words is REPLACED", echo.feedbackReplaced);
}

console.log("\n5. CONTRIBUTION + DELIVERY");
{
  const input = contributionInputFromDrillAttempt({ userId: USER, attemptId: "att-1", competencyKey: "delivery_presence", score: 3, completedAt: new Date(Date.now() - 1000) });
  check("source VOICE_DRILL, rawScore normalized (3 -> 0.5), attempt pointer set", input.source === "VOICE_DRILL" && input.rawScore === 0.5 && input.sourceVoiceDrillAttemptId === "att-1");
  let threw = false;
  try {
    validateContributionInputs([input]);
  } catch {
    threw = true;
  }
  check("the ledger's validator accepts it", !threw);
  check("it is written at the coached weight", weightForSource(input.source) === CONTRIBUTION_WEIGHTS.COACHED_SESSION);
  const summary = deliverySummary(null, null, 75_400);
  check("delivery summary tolerates missing metrics", summary.wordsPerMinute === null && summary.spokenSeconds === 75);
}

console.log("\n6. NO SCORE WHILE OPEN + body parsing");
{
  const row = {
    id: "a1", voiceDrillId: "d1", userId: USER, cameraMode: "ON", transcript: null, spokenDurationMs: null,
    visualMetrics: null, vocalMetrics: null, score: 4, feedback: "x", graderRationale: null, graderModel: null,
    startedAt: new Date(), completedAt: null,
  };
  const open = attemptDTO(row);
  check("bite-proof: an open attempt with a stored score still exposes score: null", open.score === null && open.feedback === null && open.delivery === null);
  const done = attemptDTO({ ...row, completedAt: new Date() });
  check("a completed attempt exposes its score and note", done.score === 4 && done.feedback === "x");
  check("parseCompleteBody rejects a bad cameraMode", parseCompleteBody({ transcript: "a", spokenDurationMs: 1, cameraMode: "MAYBE", metrics: null }) === null);
  const media = parseCompleteBody({ transcript: "a", spokenDurationMs: 1, cameraMode: "ON", metrics: { visual: { frame: "data:image/png;base64,AAAA" }, vocal: null } });
  check("parseCompleteBody strips media-shaped metrics (REQ-38)", media !== null && media.metrics?.visual === null);
}

section3().then(() => {
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
});
