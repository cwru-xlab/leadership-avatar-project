/**
 * Unit-style checks for lib/engine/quote-timecodes.ts — server-side quote
 * timecodes. No network, no DB.
 *
 * Run: npx tsx scripts/verify-quote-timecodes.ts
 */

import {
  locateQuoteTurn,
  retimeOutcomeQuotes,
  retimeQuotedRows,
  studentTurnTexts,
} from "../lib/engine/quote-timecodes";

let failures = 0;
function check(name: string, pass: boolean, detail?: unknown) {
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}${!pass && detail !== undefined ? `\n         ${JSON.stringify(detail)}` : ""}`);
  if (!pass) failures += 1;
}

const T0 = 1_700_000_000_000;
const at = (s: number) => T0 + s * 1000;
const turns = studentTurnTexts(
  [
    { role: "user", content: "Thanks for meeting. We both want the platform team strong next year.", timestamp: at(10) },
    { role: "assistant", content: "Sure. Budgets are tight though — I hear you on the platform team.", timestamp: at(30) },
    { role: "user", content: "I led the service migration, which shipped on time last March.", timestamp: at(45) },
    { role: "user", content: "My concern is that my pay hasn't kept pace with the scope I'm carrying.", timestamp: at(85) },
    { role: "user", content: "Help me understand the constraint. What does the approval path look like on your side?", timestamp: at(125) },
    { role: "user", content: "Okay, thanks.", timestamp: at(150) },
    { role: "user", content: "Okay, thanks.", timestamp: at(300) },
  ],
  T0,
);

console.log("studentTurnTexts");
check("keeps only the student's turns", turns.length === 6, turns.length);
check("seconds from session start", turns[1].timecodeSeconds === 45, turns[1]);

console.log("\nexact match");
check(
  "verbatim span → its turn",
  locateQuoteTurn("My concern is that my pay hasn't kept pace", turns)?.timecodeSeconds === 85,
);
check(
  "case, punctuation and curly quotes ignored",
  locateQuoteTurn("“my CONCERN is that my pay hasn’t kept pace!”", turns)?.timecodeSeconds === 85,
);
check(
  "trimmed with an ellipsis → longest fragment matches",
  locateQuoteTurn("Help me understand the constraint… approval path", turns)?.timecodeSeconds === 125,
);
check(
  "avatar's turn is never matched (shared words with a student line)",
  locateQuoteTurn("I hear you on the platform team", turns) === null,
);
check(
  "repeated phrase → the turn nearest the model's time",
  locateQuoteTurn("Okay, thanks.", turns, 290)?.timecodeSeconds === 300 &&
    locateQuoteTurn("Okay, thanks.", turns, 140)?.timecodeSeconds === 150,
);

console.log("\nnear match");
check(
  "a dropped word still matches",
  locateQuoteTurn("I led the migration, which shipped on time last March", turns)?.timecodeSeconds === 45,
);
check(
  "light paraphrase (≥80% of words) matches",
  locateQuoteTurn("my pay has not kept pace with the scope I am carrying", turns)?.timecodeSeconds === 85,
);

console.log("\nno match");
check("unrelated words → null", locateQuoteTurn("Let's set up a meeting with HR next week", turns) === null);
check("one-word quote → null (too short to trust)", locateQuoteTurn("Okay", turns) === null);
check("empty quote → null", locateQuoteTurn("", turns) === null);

console.log("\nretimeQuotedRows / retimeOutcomeQuotes");
const steps = JSON.stringify([
  { key: "frame_concern", status: "hit", evidenceQuote: "My concern is that my pay hasn't kept pace", timecodeSeconds: 125, note: "" },
  { key: "next_step", status: "missed", evidenceQuote: "Let's set up a meeting with HR next week", timecodeSeconds: 210, note: "" },
  { key: "common_ground", status: "missed", evidenceQuote: "", timecodeSeconds: null, note: "" },
]);
const out = retimeOutcomeQuotes(
  {
    objectiveStatus: "met",
    conversationSteps: steps,
    reactionCauses: JSON.stringify([{ timecodeSeconds: 205, quote: "What does the approval path look like on your side?", effect: "x" }]),
    processSteps: [{ key: "a", status: "hit", evidenceQuote: "I led the service migration", timecodeSeconds: 999, note: "" }],
  },
  turns,
)!;
const parsed = JSON.parse(out.conversationSteps as string);
check("matched quote takes the turn's time (125 → 85)", parsed[0].timecodeSeconds === 85, parsed[0]);
check("unmatched quote keeps the model's time", parsed[1].timecodeSeconds === 210, parsed[1]);
check("empty quote untouched", parsed[2].timecodeSeconds === null, parsed[2]);
check("string field stays a string", typeof out.conversationSteps === "string");
check(
  "reaction causes re-timed on their `quote` key",
  JSON.parse(out.reactionCauses as string)[0].timecodeSeconds === 125,
);
check(
  "decoded array stays an array and is re-timed",
  Array.isArray(out.processSteps) && (out.processSteps as Array<{ timecodeSeconds: number }>)[0].timecodeSeconds === 45,
);
check("other outcome fields untouched", out.objectiveStatus === "met");
check("unparseable JSON returned as-is", retimeQuotedRows("[{bad", "quote", turns) === "[{bad");
check("no turns → value unchanged", retimeQuotedRows(steps, "evidenceQuote", []) === steps);

console.log(failures === 0 ? "\nALL PASS — verify-quote-timecodes.ts" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
