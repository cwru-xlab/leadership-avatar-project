/**
 * Regression coverage for the interview progress state machine.
 *
 * Run: npx tsx scripts/verify-turn-control.ts
 *
 * The bug this exists for: a session that sat at "1 of ~9 questions" for its
 * entire duration. Progress is purely model-driven, and an uncategorised
 * behavioral marker used to discard the whole update — which, because the
 * stage also never advanced, repeated every turn for the rest of the session.
 */
import {
  parseInterviewTurn,
  reduceInterviewProgress,
} from "../lib/interview/turn-control";
import { initialProgress, type InterviewProgress } from "../lib/interview/types";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

const OPTS = { hasResume: false, targetQuestionCount: 9 };
const marker = (attrs: string) => `Tell me about a conflict.\n<interview-turn ${attrs} />`;

console.log("\n1. Marker parsing");
check("categorised planned marker parses",
  parseInterviewTurn(marker('kind="planned" category="teamwork"')).action,
  { kind: "planned", category: "teamwork" });
check("bare planned marker parses (it is legal grammar)",
  parseInterviewTurn(marker('kind="planned"')).action, { kind: "planned" });
check("NO marker is now reported as malformed",
  parseInterviewTurn("Tell me about a conflict.").malformed, true);
check("unknown category is rejected",
  parseInterviewTurn(marker('kind="planned" category="vibes"')).action, null);
check("recovery without a category is rejected",
  parseInterviewTurn(marker('kind="recovery"')).action, null);
check("every marker is stripped, not just the trailing one",
  parseInterviewTurn(
    'A <interview-turn kind="planned" /> B\n<interview-turn kind="planned" />'
  ).content, "A  B");

console.log("\n2. The deadlock — uncategorised behavioral turns");
{
  // Reproduces the reported session exactly: no resume, so opening -> behavioral
  // immediately, then a model that emits the bare planned marker every turn.
  let p: InterviewProgress = initialProgress();
  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  check("opening question counts and moves to behavioral",
    [p.questionsAsked, p.stage], [1, "behavioral"]);

  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  check("an UNCATEGORISED behavioral question still counts", p.questionsAsked, 2);
  check("but covers no category", p.categoriesCovered, []);

  // Walk the rest of the interview with the SAME uncategorised marker. The
  // behavioral quota for a 9-question target is 3, so three behavioral turns
  // release the stage even though no category was ever supplied.
  const stages: string[] = [p.stage];
  for (let i = 0; i < 4; i++) {
    p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
    stages.push(p.stage);
  }
  check("the stage machine walks to the end on bare markers alone",
    stages, ["behavioral", "behavioral", "role_specific", "closing", "closing"]);
  check("and the counter reaches the closing turn instead of pinning at 1",
    p.questionsAsked, 5);
  check("no category was ever covered along the way", p.categoriesCovered, []);
}

console.log("\n3. Categorised path still behaves");
{
  let p: InterviewProgress = initialProgress();
  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  p = reduceInterviewProgress(p, { kind: "planned", category: "teamwork" }, OPTS);
  check("a valid category is still recorded", p.categoriesCovered, ["teamwork"]);
  p = reduceInterviewProgress(p, { kind: "planned", category: "teamwork" }, OPTS);
  check("and is not double-counted", p.categoriesCovered, ["teamwork"]);
  check("though the repeat question still counts", p.questionsAsked, 3);

  p = reduceInterviewProgress(p, { kind: "planned", category: "ambiguity" }, OPTS);
  check("quota reached advances the stage",
    [p.categoriesCovered.length, p.stage], [2, "role_specific"]);
}

console.log("\n4. Non-planned kinds are unchanged");
{
  let p: InterviewProgress = initialProgress();
  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  const before = p.questionsAsked;
  p = reduceInterviewProgress(p, { kind: "follow_up" }, OPTS);
  check("a follow-up never increments the counter", p.questionsAsked, before);
  check("and is capped at one", reduceInterviewProgress(p, { kind: "follow_up" }, OPTS).followUpsUsed, 1);
  check("a null action is inert", reduceInterviewProgress(p, null, OPTS), p);
  check("closing sets the closing stage",
    reduceInterviewProgress(p, { kind: "closing" }, OPTS).stage, "closing");
}

console.log("\n5. Legacy progress without the new counter");
{
  // A session checkpointed before `behavioralQuestionsAsked` existed.
  const legacy = {
    stage: "behavioral", questionsAsked: 1,
    categoriesCovered: [], dodgedCategories: [], followUpsUsed: 0,
  } as unknown as InterviewProgress;
  const next = reduceInterviewProgress(legacy, { kind: "planned" }, OPTS);
  check("resumes counting from the missing field without NaN",
    [next.questionsAsked, next.behavioralQuestionsAsked], [2, 1]);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
