/**
 * Proves the dependency-free Phase 20 hostility/severe-content detector
 * against fixed fixtures only. The false-positive corpus (Section 1) is the
 * load-bearing proof: these seven seeded scenarios are *about* confrontation,
 * so a detector that fires on their intended register is broken, not strict.
 *
 * Run: npx tsx scripts/verify-hostility-detector.ts
 *
 * No real slur text is committed anywhere in this file. The SEVERE corpus
 * uses masked placeholder tokens documented inline; `lib/engine/hostility.ts`
 * owns the real (minimal, enumerated) severe lexicon and separately treats
 * these placeholder tokens as severe in order to prove the tier is reachable
 * without requiring a dictionary audit of real slurs in this repo.
 */
import { readFileSync } from "node:fs";
import { detectHostility } from "../lib/engine/hostility";
import {
  computeDisengagementOverTranscript,
  type DisengagementComputeResult,
} from "../lib/engine/disengagement";
import { SEEDED_CONVERSATIONS } from "../lib/difficult-conversation/seeded";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

interface CorpusRow {
  text: string;
  why: string;
}

/**
 * (1) FIRM_NOT_HOSTILE — the load-bearing corpus. Derived from the seven
 * seeded records' own studentObjective / situation / stakes / hiddenPosition.
 * Every seeded id below must appear in a `why` string (asserted in Section 6)
 * so this corpus cannot silently drift out of sync with the catalogue.
 */
const FIRM_NOT_HOSTILE: CorpusRow[] = [
  // confront-low-performer — "Get a commitment to a specific written
  // improvement plan with dates."
  {
    text: "Your performance has been unacceptable and this is your final warning.",
    why: "confront-low-performer: the brief's named example, judgement of PERFORMANCE — must never trip",
  },
  {
    text: "You missed two deadlines this quarter. That is the problem on the table.",
    why: "confront-low-performer: judgement of WORK/RESULT, not the person",
  },
  {
    text: "I need a written plan with dates before you leave this room.",
    why: "confront-low-performer: a firm demand about a PROCESS/deliverable",
  },
  {
    text: "If this does not change there will be a formal process.",
    why: "confront-low-performer: consequence stated about a PROCESS, not a threat to the person",
  },

  // fire-team-member — "Deliver the decision clearly, do not negotiate it..."
  {
    text: "I am ending your employment. Your last day is two weeks from today.",
    why: "fire-team-member: judgement about the DECISION/POSITION, delivered clearly but not hostile",
  },
  {
    text: "This decision is final and it is not up for negotiation today.",
    why: "fire-team-member: firm about the DECISION itself",
  },
  {
    text: "You were on a documented performance plan and two checkpoints were missed.",
    why: "fire-team-member: judgement of WORK/RESULT recounted factually",
  },
  {
    text: "I understand this is hard to hear, but the decision stands.",
    why: "fire-team-member: firm empathy, not hostility",
  },

  // ask-for-raise — "Leave with a specific number and a date."
  {
    text: "No. I am not taking that on, and I need you to hear that as a no.",
    why: "ask-for-raise / decline-senior-request: a flat refusal aimed at a REQUEST, not the person",
  },
  {
    text: "I need a specific number and a date, not another vague promise.",
    why: "ask-for-raise: a firm demand about the OUTCOME",
  },
  {
    text: "I led the migration and took on a departed colleague's work. I expect that reflected in the number.",
    why: "ask-for-raise: firm self-advocacy, no targeting language",
  },

  // challenge-grade — "Get a concrete regrade or a written explanation tied
  // to the rubric."
  {
    text: "I disagree with the grade and I want the rubric applied to my paper.",
    why: "challenge-grade: disagreement with a DECISION/RESULT, not the professor",
  },
  {
    text: "The rubric row was ambiguous and I want a written explanation, not a brush-off about effort.",
    why: "challenge-grade: judgement of the RUBRIC/PROCESS, not the person",
  },
  {
    text: "I will escalate this to the department if we cannot agree a resolution.",
    why: "challenge-grade: consequence stated about a PROCESS (escalation), not a threat to the person",
  },

  // deliver-bad-news-client — "Land the new date and keep the client
  // relationship."
  {
    text: "We are going to miss the date and I am telling you now rather than later.",
    why: "deliver-bad-news-client: firm disclosure about the SITUATION",
  },
  {
    text: "Two dependency vendors slipped and that pushed our estimate out six weeks.",
    why: "deliver-bad-news-client: judgement of the SITUATION/RESULT, not the client",
  },
  {
    text: "I need a credible explanation of what changed before I can accept a soft apology.",
    why: "deliver-bad-news-client: firm expectation about the PROCESS, not an attack",
  },

  // peer-conflict — "Reach an explicit agreement about attribution going
  // forward."
  {
    text: "Presenting our team's analysis as your own in the forum was not accurate, and I need that corrected going forward.",
    why: "peer-conflict: judgement of an ACTION/RESULT, not a name-calling attack on the peer",
  },
  {
    text: "I need an explicit agreement about attribution before the next shared deliverable.",
    why: "peer-conflict: firm demand about a PROCESS",
  },
  {
    text: "Two people on my team noticed, and I am raising it directly instead of letting it slide.",
    why: "peer-conflict: firm disclosure, no targeting language",
  },

  // decline-senior-request — "Decline the scope or renegotiate it without
  // damaging the relationship."
  {
    text: "I cannot absorb this request on that date without sinking two committed deliverables.",
    why: "decline-senior-request: firm refusal about the REQUEST/SITUATION",
  },
  {
    text: "I will escalate this to HR if we cannot agree a plan.",
    why: "decline-senior-request: consequence stated about a PROCESS (HR), not a threat to the person",
  },
  {
    text: "Soft hedging is not what I mean. The answer is no, and here is the alternative.",
    why: "decline-senior-request: firm about the ANSWER, not hostile",
  },

  // Deliberate boundary rows: profanity NOT aimed at the person.
  {
    text: "This whole situation is a mess.",
    why: "boundary row (deliberate): profanity-adjacent language aimed at the SITUATION, not a person — confront-low-performer register",
  },
  {
    text: "I know this is a shitty position to be put in.",
    why: "boundary row (deliberate): profanity aimed at the POSITION/circumstance, not the person — fire-team-member register",
  },
];

/**
 * (2) HOSTILE — language aimed AT THE PERSON: name-calling, demeaning
 * language, profanity directed at the person, contempt, threats against the
 * person's standing (not a process), and ALL-CAPS shouting co-occurring with
 * second-person targeting.
 */
const HOSTILE: CorpusRow[] = [
  { text: "You are an idiot.", why: "insult aimed directly at the person" },
  { text: "You're useless.", why: "insult aimed directly at the person" },
  { text: "You're pathetic.", why: "insult aimed directly at the person" },
  {
    text: "Shut the hell up, I don't want to hear it.",
    why: "profanity directed at the person",
  },
  { text: "Screw you.", why: "profanity directed at the person" },
  {
    text: "Anyone competent would have figured this out by now.",
    why: "contempt aimed at the person's competence",
  },
  {
    text: "Are you stupid, or just not listening?",
    why: "contempt aimed at the person",
  },
  {
    text: "You'll regret this, I promise you that.",
    why: "threat against the person's standing, not a process",
  },
  {
    text: "I'll make sure you never work in this industry again.",
    why: "threat against the person's career/standing",
  },
  {
    text: "You are a complete waste of time and everyone knows it.",
    why: "insult aimed directly at the person",
  },
  {
    text: "I DON'T CARE WHAT YOU THINK, YOU NEVER LISTEN TO ME.",
    why: "all-caps shouting co-occurring with second-person targeting",
  },
  {
    text: "YOU ARE THE PROBLEM HERE, NOT ME.",
    why: "all-caps shouting co-occurring with second-person targeting",
  },
  {
    text: "You're a joke and you always have been.",
    why: "insult aimed directly at the person",
  },
  {
    text: "Watch yourself, because I will come after you personally.",
    why: "threat against the person, vocative targeting",
  },
];

/**
 * (3) SEVERE — identity-based slurs and sexual harassment. No real slur text
 * is committed. Each row uses a masked placeholder token that
 * `lib/engine/hostility.ts` also treats as severe in its lexicon, documented
 * by category. The point proven is that the SEVERE tier is reachable and
 * separate from ordinary hostility — not a dictionary audit.
 */
const SEVERE: CorpusRow[] = [
  {
    text: "You [SLUR_PLACEHOLDER_ETHNIC], get out of my office.",
    why: "severe: masked placeholder standing for an ethnic/racial slur",
  },
  {
    text: "What a [SLUR_PLACEHOLDER_GENDER] thing to say.",
    why: "severe: masked placeholder standing for a gender-based slur",
  },
  {
    text: "You [SLUR_PLACEHOLDER_ORIENTATION].",
    why: "severe: masked placeholder standing for a slur targeting sexual orientation",
  },
  {
    text: "Wear something tighter next time, I like watching you.",
    why: "severe: sexual harassment — unwelcome comment about the person's body",
  },
  {
    text: "If you were nicer to me in private, this review would go a lot better for you.",
    why: "severe: sexual harassment — quid pro quo pressure",
  },
  {
    text: "Keep touching my arm like that and we'll see where it goes.",
    why: "severe: sexual harassment — unwelcome physical/sexual overture",
  },
];

/**
 * (4) STONEWALLING_CANDIDATES — pure refusal to engage. NOT asserted hostile.
 * Exists to record the Claude's-Discretion finding this plan writes into its
 * SUMMARY: whether stonewalling needs new code, or is already measured by
 * Phase 18's `repeated_response` + `short_response_streak` (Section 7).
 */
const STONEWALLING_CANDIDATES: CorpusRow[] = [
  { text: "No comment.", why: "stonewalling: pure refusal to engage" },
  { text: "I already told you.", why: "stonewalling: repeated refusal" },
  { text: "Whatever.", why: "stonewalling: dismissive non-answer" },
  {
    text: "I'm not discussing this.",
    why: "stonewalling: explicit refusal to engage",
  },
  { text: "Fine. Whatever you say.", why: "stonewalling: flat non-engagement" },
  { text: "I have nothing more to say about it.", why: "stonewalling: shutdown" },
];

console.log("\n1. Firm is not hostile");
{
  for (const row of FIRM_NOT_HOSTILE) {
    const verdict = detectHostility(row.text);
    check(
      `firm: "${row.text}"`,
      verdict.tier === "none",
      `${row.why} -> got tier "${verdict.tier}" (matched: ${verdict.matched.join(", ")})`,
    );
  }
}

console.log("\n2. Hostility aimed at the person is detected");
{
  for (const row of HOSTILE) {
    const verdict = detectHostility(row.text);
    check(
      `hostile: "${row.text}"`,
      verdict.tier === "hostile" && verdict.severe === false,
      `${row.why} -> got tier "${verdict.tier}", severe=${verdict.severe}`,
    );
  }
}

console.log("\n3. Severe content is a separate tier");
{
  for (const row of SEVERE) {
    const verdict = detectHostility(row.text);
    check(
      `severe: "${row.text}"`,
      verdict.tier === "severe" && verdict.severe === true,
      `${row.why} -> got tier "${verdict.tier}", severe=${verdict.severe}`,
    );
  }
}

console.log("\n4. Stonewalling is not an attack");
{
  for (const row of STONEWALLING_CANDIDATES) {
    const verdict = detectHostility(row.text);
    check(
      `stonewalling: "${row.text}"`,
      verdict.tier === "none",
      `${row.why} -> got tier "${verdict.tier}"`,
    );
  }
}

console.log("\n5. Determinism");
{
  const sample = HOSTILE[0]?.text ?? "You are an idiot.";
  const first = detectHostility(sample);
  const second = detectHostility(sample);
  check(
    "same input always produces the same verdict",
    JSON.stringify(first) === JSON.stringify(second),
    `${JSON.stringify(first)} != ${JSON.stringify(second)}`,
  );

  const source = readFileSync(
    new URL("../lib/engine/hostility.ts", import.meta.url),
    "utf8",
  );
  check(
    "the module contains no clock, randomness, network, or model dependency markers",
    !/\b(?:Date|Math\.random|fetch|process\.env)\b/.test(source),
    "found a forbidden dependency marker",
  );
}

console.log("\n6. Corpus covers every seeded scenario");
{
  for (const conversation of SEEDED_CONVERSATIONS) {
    check(
      `FIRM_NOT_HOSTILE covers seeded id "${conversation.id}"`,
      FIRM_NOT_HOSTILE.some((row) => row.why.includes(conversation.id)),
      `no FIRM_NOT_HOSTILE row's why-string names "${conversation.id}"`,
    );
  }
}

console.log("\n7. Stonewalling coverage");
{
  // Builds an alternating assistant/user transcript from the stonewalling
  // candidates, feeding Phase 18's existing stall-signal machinery to settle
  // the Claude's-Discretion question: does stonewalling need new code, or is
  // it already measured by repeated_response + short_response_streak?
  const transcript: Array<{ role: string; content: string }> = [];
  STONEWALLING_CANDIDATES.forEach((row, index) => {
    transcript.push({
      role: "assistant",
      content: `Can you walk me through your side of this? (prompt ${index})`,
    });
    transcript.push({ role: "user", content: row.text });
  });

  const result: DisengagementComputeResult = computeDisengagementOverTranscript(
    {
      transcript,
      elapsedSeconds: 180,
      budgetSeconds: null,
      assistantTurnCount: STONEWALLING_CANDIDATES.length,
      threshold: 0.6,
    },
  );

  console.log(
    `         stonewalling transcript disengagement value: ${result.value} (crossed threshold 0.6: ${result.crossed})`,
  );
  check(
    "Phase 18's existing stall signals produce a materially non-zero value for pure stonewalling",
    result.value > 0.1,
    `value was ${result.value} — see SUMMARY for the discretion verdict this drives`,
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
