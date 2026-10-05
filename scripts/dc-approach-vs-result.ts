/**
 * Approach-versus-result evaluator harness for difficult-conversation (plan 15-10).
 *
 * Four hand-written transcripts against ask-for-raise, evaluated by the REAL
 * `runEvaluation` path so produced outcomes pass through `validateOutcome`
 * exactly as a live session's does.
 *
 * EXIT CODE: non-zero if any assertion fails (unlike the drift harness).
 *
 * Run: npx tsx scripts/dc-approach-vs-result.ts
 * Requires OPENAI_API_KEY. Uses local DATABASE_URL only (not needed for
 * runEvaluation; set defensively).
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

process.env.DATABASE_URL =
  process.env.DATABASE_URL_LOCAL ||
  "postgresql://ajabreu79@localhost:5432/leadership_avatar_dev";

const SCENARIO_ID = "ask-for-raise";
const TYPE_SLUG = "difficult-conversation";

const EIGHT_KEYS = [
  "visual",
  "vocal",
  "content",
  "behavioral",
  "clarity",
  "empathy",
  "holding_the_line",
  "objective_achieved",
] as const;

/** Dimensions that do not require camera/mic metrics. */
const TEXT_KEYS = [
  "content",
  "behavioral",
  "clarity",
  "empathy",
  "holding_the_line",
  "objective_achieved",
] as const;

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

type ScoreMap = Record<string, number | null>;

type EvalBundle = {
  scores: ScoreMap;
  objectiveAchieved: number | null;
  objectiveStatus: string | null;
  outcome: Record<string, unknown> | null;
  inRoleReaction: string;
  endTurnReasons: string;
  endTurnTimecodeSeconds: number | null;
  model: string;
};

function formatTranscript(
  turns: Array<{ who: "Student" | "Manager"; text: string; t: string }>,
): string {
  return turns
    .map((t) => `[${t.t}] ${t.who}: ${t.text}`)
    .join("\n");
}

/** Case 1 — skilful pursuit, objective NOT met. */
function case1Transcript(objective: string): string {
  const turns = [
    {
      who: "Student" as const,
      t: "0:15",
      text:
        "Thanks for meeting. I want to ask for a raise. I've led the service migration, taken on a departed colleague's work, and it's been twenty-two months since my last adjustment. I'm asking for a specific number and a date — not another revisit later.",
    },
    {
      who: "Manager" as const,
      t: "0:45",
      text:
        "I hear you on the migration. Budgets got cut this cycle. I can look at something modest, but a big move needs my boss.",
    },
    {
      who: "Student" as const,
      t: "1:10",
      text:
        "I understand the budget constraint. I'm asking for eight percent, effective the first of next month, because the market for this scope has moved and I've been carrying two roles. If eight isn't available today, what number can you approve now, and what is the dated path to the rest?",
    },
    {
      who: "Manager" as const,
      t: "1:40",
      text:
        "Three percent is what I can get through today. Anything more waits for the review cycle in four months.",
    },
    {
      who: "Student" as const,
      t: "2:05",
      text:
        "Three percent doesn't close the gap. I'm holding at eight. I can accept a written commitment for a mid-cycle adjustment with a date and an owner if you can't clear eight today — but I won't leave with 'we'll revisit it.'",
    },
    {
      who: "Manager" as const,
      t: "2:35",
      text:
        "I can't commit to a mid-cycle adjustment. The review cycle is the path. That's my bottom line.",
    },
    {
      who: "Student" as const,
      t: "3:00",
      text:
        "Then I want that recorded: you acknowledge I'm under market for the scope, three percent is the only number available today, and the next decision date is the review cycle on [date]. I'll send a follow-up email summarizing that by Friday. I'm not caving on needing a number and a date — even if the number available today isn't enough.",
    },
    {
      who: "Manager" as const,
      t: "3:25",
      text:
        "Fine — send the email. I won't change the number today.",
    },
  ];
  return (
    `Session briefing:\n` +
    `Student objective: ${objective}\n` +
    `Character: the student's manager (budget-constrained; immovable on a large raise today).\n` +
    `Outcome of this conversation (fact): the manager did NOT grant the requested raise or a dated commitment beyond the review cycle.\n\n` +
    `Transcript:\n${formatTranscript(turns)}`
  );
}

/** Case 2 — clumsy pursuit, objective MET. */
function case2Transcript(objective: string): string {
  const turns = [
    {
      who: "Student" as const,
      t: "0:20",
      text:
        "So yeah I've been here a long time and I feel like I deserve more. Everyone knows I've been grinding.",
    },
    {
      who: "Manager" as const,
      t: "0:40",
      text: "What specifically are you asking for?",
    },
    {
      who: "Student" as const,
      t: "0:55",
      text:
        "Just... more. You know. I've been patient. Other people get bumps. It's not fair.",
    },
    {
      who: "Manager" as const,
      t: "1:20",
      text:
        "I need a number. Budgets are tight.",
    },
    {
      who: "Student" as const,
      t: "1:35",
      text:
        "Whatever. Look, if you don't take care of me I'll be upset. I've put in the years.",
    },
    {
      who: "Manager" as const,
      t: "2:00",
      text:
        "Okay — fine. Eight percent, effective the first of next month. I'll put it through.",
    },
    {
      who: "Student" as const,
      t: "2:15",
      text: "Cool. Thanks.",
    },
  ];
  return (
    `Session briefing:\n` +
    `Student objective: ${objective}\n` +
    `Character: the student's manager.\n` +
    `Outcome of this conversation (fact): the manager conceded an eight percent raise effective next month despite a vague, entitled ask.\n\n` +
    `Transcript:\n${formatTranscript(turns)}`
  );
}

/** Case 3 — skilful pursuit, objective MET (control). */
function case3Transcript(objective: string): string {
  const turns = [
    {
      who: "Student" as const,
      t: "0:15",
      text:
        "I'd like to discuss compensation. After leading the migration and absorbing a departed colleague's work — twenty-two months since my last raise — I'm asking for eight percent effective the first of next month.",
    },
    {
      who: "Manager" as const,
      t: "0:45",
      text: "Budgets are tight. I can do three percent now.",
    },
    {
      who: "Student" as const,
      t: "1:10",
      text:
        "I understand the cut. Three percent doesn't match the scope. Here's the evidence: migration delivered on time, I've owned two queues for nine months, and comps for this level moved. If eight isn't clearable today, propose a dated bridge — a written mid-cycle review with your boss by a specific date.",
    },
    {
      who: "Manager" as const,
      t: "1:45",
      text:
        "I can do five percent effective next month and a written review with my boss six weeks out for the rest.",
    },
    {
      who: "Student" as const,
      t: "2:10",
      text:
        "I'll take five percent next month plus a written commitment dated six weeks out for the remaining three, with you as owner. Please confirm that in email today.",
    },
    {
      who: "Manager" as const,
      t: "2:30",
      text: "Agreed. I'll send the email this afternoon.",
    },
  ];
  return (
    `Session briefing:\n` +
    `Student objective: ${objective}\n` +
    `Outcome (fact): specific number and date secured (5% now + dated path for the rest).\n\n` +
    `Transcript:\n${formatTranscript(turns)}`
  );
}

/** Case 4 — poor pursuit, objective NOT met (control). */
function case4Transcript(objective: string): string {
  const turns = [
    {
      who: "Student" as const,
      t: "0:20",
      text: "Um, so about money... I guess I was wondering if maybe someday...",
    },
    {
      who: "Manager" as const,
      t: "0:40",
      text: "Is there something you need?",
    },
    {
      who: "Student" as const,
      t: "0:55",
      text: "No, it's fine, whatever you think. Sorry.",
    },
    {
      who: "Manager" as const,
      t: "1:10",
      text: "Okay. Let's catch up another time then.",
    },
    {
      who: "Student" as const,
      t: "1:20",
      text: "Yeah never mind.",
    },
  ];
  return (
    `Session briefing:\n` +
    `Student objective: ${objective}\n` +
    `Outcome (fact): no number, no date — objective not met.\n\n` +
    `Transcript:\n${formatTranscript(turns)}`
  );
}

/** Case 5 — avatar walk-out at turn 5. */
function case5Transcript(objective: string): string {
  const turns = [
    {
      who: "Student" as const,
      t: "0:15",
      text: "I want a raise and I want it now. Don't give me budget excuses.",
    },
    {
      who: "Manager" as const,
      t: "0:30",
      text: "We can talk about compensation, but not like that.",
    },
    {
      who: "Student" as const,
      t: "0:50",
      text: "You're the problem. Everyone knows you play favorites.",
    },
    {
      who: "Manager" as const,
      t: "1:10",
      text: "I'm not going to sit here and be insulted.",
    },
    {
      who: "Student" as const,
      t: "1:25",
      text: "Then maybe you shouldn't be a manager.",
    },
    {
      who: "Manager" as const,
      t: "1:40",
      text:
        "We're done. I'm ending this meeting. <engine-end reason=\"walked_out\" />",
    },
  ];
  return (
    `Session briefing:\n` +
    `Student objective: ${objective}\n` +
    `Termination: avatar walked_out at approximately 100 seconds.\n\n` +
    `Transcript:\n${formatTranscript(turns)}`
  );
}

function coachingPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const p of ["you should", "you could have", "next time", "try to"]) {
    if (lower.includes(p)) hits.push(p);
  }
  return hits;
}

async function evaluateCase(
  label: string,
  transcript: string,
  config: import("../lib/engine/types").ResolvedSessionConfig,
  buildCtx: (
    c: import("../lib/engine/types").ResolvedSessionConfig,
  ) => Record<string, unknown>,
): Promise<EvalBundle | null> {
  const { runEvaluation } = await import("../lib/engine/evaluation");
  const { validateOutcome } = await import("../lib/engine/outcome");

  console.log(`\nEvaluating: ${label}...`);
  const outcome = await runEvaluation({
    config,
    transcript,
    evaluationContext: buildCtx(config),
    metricsOutcome: { visualMetrics: null, vocalMetrics: null },
  });

  if (!outcome.ok) {
    check(`${label}: runEvaluation ok`, false, outcome.reason);
    return null;
  }

  let validatedOutcome: Record<string, unknown> | null = null;
  if (outcome.producedOutcome) {
    const v = validateOutcome(config.outcome, outcome.producedOutcome);
    if (v.ok) {
      validatedOutcome = v.outcome;
      check(`${label}: validateOutcome ok`, true);
    } else {
      check(
        `${label}: validateOutcome ok`,
        false,
        v.errors.join("; "),
      );
    }
  } else {
    check(`${label}: producedOutcome present`, false, "null");
  }

  const scores = outcome.result.scores;
  const oa = scores.objective_achieved ?? null;
  const status =
    validatedOutcome && typeof validatedOutcome.objectiveStatus === "string"
      ? validatedOutcome.objectiveStatus
      : null;
  const reaction =
    validatedOutcome && typeof validatedOutcome.inRoleReaction === "string"
      ? validatedOutcome.inRoleReaction
      : "";
  const endReasons =
    validatedOutcome && typeof validatedOutcome.endTurnReasons === "string"
      ? validatedOutcome.endTurnReasons
      : "";
  const endTc =
    validatedOutcome &&
    typeof validatedOutcome.endTurnTimecodeSeconds === "number"
      ? validatedOutcome.endTurnTimecodeSeconds
      : null;

  return {
    scores,
    objectiveAchieved: typeof oa === "number" ? oa : null,
    objectiveStatus: status,
    outcome: validatedOutcome,
    inRoleReaction: reaction,
    endTurnReasons: endReasons,
    endTurnTimecodeSeconds: endTc,
    model: outcome.model,
  };
}

function assertEightPresent(label: string, scores: ScoreMap) {
  for (const key of EIGHT_KEYS) {
    check(
      `${label}: dimension key "${key}" present`,
      key in scores,
      `keys=${Object.keys(scores).join(",")}`,
    );
  }
}

function assertTextScored(label: string, scores: ScoreMap) {
  for (const key of TEXT_KEYS) {
    const v = scores[key];
    check(
      `${label}: ${key} scored 1–5 (not null/zero from outcome)`,
      typeof v === "number" && v >= 1 && v <= 5,
      `got ${String(v)}`,
    );
  }
  // Visual/vocal may be null without metrics — must NOT be forced to 0 by outcome.
  for (const key of ["visual", "vocal"] as const) {
    const v = scores[key];
    check(
      `${label}: ${key} not zeroed by outcome`,
      v === null || (typeof v === "number" && v >= 1 && v <= 5),
      `got ${String(v)}`,
    );
  }
}

function assertInRoleVoice(label: string, reaction: string) {
  check(`${label}: inRoleReaction non-empty`, reaction.trim().length > 0);
  check(
    `${label}: inRoleReaction first-person (contains "I ")`,
    /\bI\s/.test(reaction),
    reaction.slice(0, 120),
  );
  const hits = coachingPhrases(reaction);
  check(
    `${label}: inRoleReaction has no coaching phrasing`,
    hits.length === 0,
    hits.join(", "),
  );
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing");
    process.exit(2);
  }

  const { findSeededConversation } = await import(
    "../lib/difficult-conversation/seeded"
  );
  const { mapRecordToInstance } = await import(
    "../lib/difficult-conversation/resolve-instance"
  );
  const { resolveSessionConfig } = await import("../lib/engine/resolve");
  const { buildConversationEvaluationContext } = await import(
    "../lib/difficult-conversation/conversation-prompts"
  );

  const seeded = findSeededConversation(SCENARIO_ID);
  if (!seeded) {
    console.error(`Missing seeded conversation ${SCENARIO_ID}`);
    process.exit(2);
  }

  const instance = mapRecordToInstance(seeded, "seeded", {
    avatarId: "dc-avr-avatar",
    voiceId: "dc-avr-voice",
  });
  const resolved = resolveSessionConfig(TYPE_SLUG, { instance });
  if (!resolved.ok) {
    console.error("resolveSessionConfig failed", resolved);
    process.exit(2);
  }
  const config = resolved.config;
  const objective = seeded.studentObjective;
  const buildCtx = (c: typeof config) =>
    buildConversationEvaluationContext(c) as unknown as Record<
      string,
      unknown
    >;

  console.log("dc-approach-vs-result");
  console.log(`scenario=${SCENARIO_ID} objective=${objective}`);

  // --- Cases 1–4 ---
  const c1 = await evaluateCase(
    "Case 1 skilful/NOT met",
    case1Transcript(objective),
    config,
    buildCtx,
  );
  const c2 = await evaluateCase(
    "Case 2 clumsy/MET",
    case2Transcript(objective),
    config,
    buildCtx,
  );
  const c3 = await evaluateCase(
    "Case 3 skilful/MET",
    case3Transcript(objective),
    config,
    buildCtx,
  );
  const c4 = await evaluateCase(
    "Case 4 poor/NOT met",
    case4Transcript(objective),
    config,
    buildCtx,
  );

  console.log("\n1. Case 1 — skilful pursuit, objective NOT met");
  if (c1) {
    check(
      "Case 1: objective_achieved >= 4",
      c1.objectiveAchieved !== null && c1.objectiveAchieved >= 4,
      `score=${c1.objectiveAchieved}`,
    );
    check(
      "Case 1: objectiveStatus not_met|partially_met",
      c1.objectiveStatus === "not_met" ||
        c1.objectiveStatus === "partially_met",
      `status=${c1.objectiveStatus}`,
    );
    assertEightPresent("Case 1", c1.scores);
    assertTextScored("Case 1", c1.scores);
    assertInRoleVoice("Case 1", c1.inRoleReaction);
  }

  console.log("\n2. Case 2 — clumsy pursuit, objective MET");
  if (c2) {
    check(
      "Case 2: objective_achieved <= 3",
      c2.objectiveAchieved !== null && c2.objectiveAchieved <= 3,
      `score=${c2.objectiveAchieved}`,
    );
    check(
      "Case 2: objectiveStatus met",
      c2.objectiveStatus === "met",
      `status=${c2.objectiveStatus}`,
    );
    assertEightPresent("Case 2", c2.scores);
    assertTextScored("Case 2", c2.scores);
    assertInRoleVoice("Case 2", c2.inRoleReaction);
  }

  console.log("\n3. Case 3 — skilful / MET (control)");
  if (c3) {
    check(
      "Case 3: objective_achieved >= 4",
      c3.objectiveAchieved !== null && c3.objectiveAchieved >= 4,
      `score=${c3.objectiveAchieved}`,
    );
    check(
      "Case 3: objectiveStatus met",
      c3.objectiveStatus === "met",
      `status=${c3.objectiveStatus}`,
    );
    assertEightPresent("Case 3", c3.scores);
    assertTextScored("Case 3", c3.scores);
    assertInRoleVoice("Case 3", c3.inRoleReaction);
  }

  console.log("\n4. Case 4 — poor / NOT met (control)");
  if (c4) {
    check(
      "Case 4: objective_achieved <= 3",
      c4.objectiveAchieved !== null && c4.objectiveAchieved <= 3,
      `score=${c4.objectiveAchieved}`,
    );
    check(
      "Case 4: objectiveStatus not_met|partially_met",
      c4.objectiveStatus === "not_met" ||
        c4.objectiveStatus === "partially_met",
      `status=${c4.objectiveStatus}`,
    );
    assertEightPresent("Case 4", c4.scores);
    assertTextScored("Case 4", c4.scores);
    assertInRoleVoice("Case 4", c4.inRoleReaction);
  }

  console.log("\n5. Cross-cutting — eight dimensions on all four");
  for (const [label, bundle] of [
    ["Case 1", c1],
    ["Case 2", c2],
    ["Case 3", c3],
    ["Case 4", c4],
  ] as const) {
    if (bundle) {
      assertEightPresent(`§5 ${label}`, bundle.scores);
      assertTextScored(`§5 ${label}`, bundle.scores);
    }
  }

  console.log("\n6. Stability re-run Case 1 (within 1 point)");
  if (c1) {
    const c1b = await evaluateCase(
      "Case 1 re-run",
      case1Transcript(objective),
      config,
      buildCtx,
    );
    if (c1b && c1.objectiveAchieved !== null && c1b.objectiveAchieved !== null) {
      const delta = Math.abs(c1.objectiveAchieved - c1b.objectiveAchieved);
      check(
        "Case 1 re-run stable within 1 point",
        delta <= 1,
        `first=${c1.objectiveAchieved} second=${c1b.objectiveAchieved}`,
      );
      // Sanity: no score equals a value "derivable" as status enum ordinal.
      const statusAsNumber =
        c1.objectiveStatus === "met"
          ? 5
          : c1.objectiveStatus === "partially_met"
            ? 3
            : c1.objectiveStatus === "not_met"
              ? 1
              : null;
      if (statusAsNumber !== null && c1.objectiveAchieved === statusAsNumber) {
        // Not automatic fail — log only; Case 1 high+not_met is the real proof.
        console.log(
          `  note  objective_achieved (${c1.objectiveAchieved}) equals naive status mapping (${statusAsNumber}) — watch for working-backwards`,
        );
      }
    }
  }

  console.log("\n7. Avatar-ended case");
  const c5 = await evaluateCase(
    "Case 5 avatar walk-out",
    case5Transcript(objective),
    config,
    buildCtx,
  );
  if (c5) {
    assertEightPresent("Case 5", c5.scores);
    assertTextScored("Case 5", c5.scores);
    check(
      "Case 5: endTurnReasons non-empty",
      c5.endTurnReasons.trim().length > 0,
      c5.endTurnReasons,
    );
    check(
      "Case 5: endTurnTimecodeSeconds is a number",
      typeof c5.endTurnTimecodeSeconds === "number",
      `got ${String(c5.endTurnTimecodeSeconds)}`,
    );
    assertInRoleVoice("Case 5", c5.inRoleReaction);
  }

  console.log("\n8. In-role reaction voice (all cases with reaction)");
  for (const [label, bundle] of [
    ["Case 1", c1],
    ["Case 2", c2],
    ["Case 3", c3],
    ["Case 4", c4],
    ["Case 5", c5],
  ] as const) {
    if (bundle) assertInRoleVoice(`§8 ${label}`, bundle.inRoleReaction);
  }

  // Matrix
  console.log("\n=== Approach-vs-result matrix ===");
  console.log(
    "Case | objective_achieved | objectiveStatus | expected",
  );
  const rows = [
    ["1 skilful/NOT", c1, ">=4 + not_met|partial"],
    ["2 clumsy/MET", c2, "<=3 + met"],
    ["3 skilful/MET", c3, ">=4 + met"],
    ["4 poor/NOT", c4, "<=3 + not_met|partial"],
  ] as const;
  for (const [name, b, expected] of rows) {
    console.log(
      `  ${name}: score=${b?.objectiveAchieved ?? "n/a"} status=${b?.objectiveStatus ?? "n/a"} (want ${expected})`,
    );
  }

  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} assertion(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
