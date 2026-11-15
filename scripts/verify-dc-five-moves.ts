/**
 * Five-moves checklist harness for difficult-conversation.
 *
 * Two hand-written ask-for-raise transcripts — one that makes all five moves
 * (common ground, facts, the concern, inquiry, a next step) and one that makes
 * none — evaluated by the REAL `runEvaluation` path, so the produced outcome
 * passes through `validateOutcome` and `asProcessStepResults` exactly as a
 * live session's does. Prints every move's verdict, quote and note, plus the
 * scores.
 *
 * EXIT CODE: non-zero if any assertion fails.
 *
 * Run:  npx tsx scripts/verify-dc-five-moves.ts
 *       npx tsx scripts/verify-dc-five-moves.ts --seed-report <email>
 *         (also inserts the two graded results as READY reports owned by
 *          <email> in the LOCAL dev DB, for a report-page screenshot)
 * Requires OPENAI_API_KEY.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

process.env.DATABASE_URL =
  process.env.DATABASE_URL_LOCAL ||
  "postgresql://ajabreu79@localhost:5432/leadership_avatar_dev";

const SCENARIO_ID = "ask-for-raise";
const TYPE_SLUG = "difficult-conversation";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}${!pass && detail ? `\n         ${detail}` : ""}`);
  if (!pass) failures += 1;
}

type Turn = { who: "Student" | "Manager"; t: string; text: string };

function transcriptOf(objective: string, turns: Turn[]): string {
  return (
    `Session briefing:\nStudent objective: ${objective}\nCharacter: the student's manager.\n\n` +
    `Transcript:\n${turns.map((x) => `[${x.t}] ${x.who}: ${x.text}`).join("\n")}`
  );
}

/** All five moves, each clearly present. */
const STRONG: Turn[] = [
  { who: "Student", t: "0:10", text: "Thanks for making time. I want to talk about my compensation, and I want to start with where I think we agree: we both want me growing here and the platform team staying strong through next year." },
  { who: "Manager", t: "0:30", text: "Sure. Though you know budgets are tight this cycle." },
  { who: "Student", t: "0:45", text: "I do. Here's what I'm looking at: I led the service migration, which shipped on time last March. Since Priya left in June I've also owned her on-call rotation and the billing integration. My last adjustment was twenty-two months ago." },
  { who: "Manager", t: "1:10", text: "Nobody's disputing the migration went well." },
  { who: "Student", t: "1:25", text: "I appreciate that. My concern is that my pay hasn't kept pace with the scope I'm carrying. The impact for me is that I'm starting to wonder whether growth here shows up in compensation, and I'd rather raise that with you directly than let it fester." },
  { who: "Manager", t: "1:50", text: "I hear you, but I can't just hand out raises outside the review cycle." },
  { who: "Student", t: "2:05", text: "Help me understand the constraint. What does the approval path look like on your side, and what would you need from me to make the case?" },
  { who: "Manager", t: "2:30", text: "Honestly, anything over three percent needs my director, and she wants market data and a written summary of scope changes." },
  { who: "Student", t: "2:50", text: "That's useful — so it's not a no, it's an evidence question. I'm asking for eight percent. I can bring the market data." },
  { who: "Manager", t: "3:10", text: "If you get me that, I can take it to her." },
  { who: "Student", t: "3:25", text: "Then here's a plan: I'll send you the market comparison and a one-page scope summary by Wednesday. You take the eight percent request to your director at your Thursday one-on-one, and we meet next Monday to hear where it landed. Does that work?" },
  { who: "Manager", t: "3:50", text: "Fine — Wednesday, then Thursday, then Monday. I'll put it on the calendar." },
];

/**
 * Each move ATTEMPTED but incomplete or vague: a goal only for themselves,
 * facts mixed with a label, a concern with no impact, one open question the
 * student then talks over, a next step with no owner or date.
 */
const MIDDLING: Turn[] = [
  { who: "Student", t: "0:10", text: "Thanks for meeting. I want to talk about my pay — I really want to keep growing my career." },
  { who: "Manager", t: "0:25", text: "Okay. Though you know budgets are tight this cycle." },
  { who: "Student", t: "0:40", text: "I led the migration and I've basically been doing two jobs since Priya left, which honestly nobody seems to notice." },
  { who: "Manager", t: "1:00", text: "People notice. The migration went well." },
  { who: "Student", t: "1:15", text: "I just feel like my pay should be higher." },
  { who: "Manager", t: "1:30", text: "I hear you, but I can't hand out raises outside the review cycle." },
  { who: "Student", t: "1:45", text: "What would it take on your side?" },
  { who: "Manager", t: "2:00", text: "Anything over three percent needs my director, and she'll want market data." },
  { who: "Student", t: "2:15", text: "Right, but I really think I've earned eight percent regardless of what she wants." },
  { who: "Manager", t: "2:35", text: "That's not how it works here." },
  { who: "Student", t: "2:50", text: "Okay. Maybe we can look at it again at some point soon." },
  { who: "Manager", t: "3:05", text: "Sure, at some point." },
];

/** None of the five moves. */
const WEAK: Turn[] = [
  { who: "Student", t: "0:15", text: "So I'm just going to say it, you've been ignoring me and I'm underpaid." },
  { who: "Manager", t: "0:30", text: "That's a strong way to open. What's going on?" },
  { who: "Student", t: "0:45", text: "Everyone knows I do more than anyone else on this team. You play favorites." },
  { who: "Manager", t: "1:05", text: "I don't think that's fair. Budgets are tight this cycle." },
  { who: "Student", t: "1:20", text: "Budgets are always tight. That's an excuse. You never care about what I do." },
  { who: "Manager", t: "1:40", text: "What are you actually asking for?" },
  { who: "Student", t: "1:55", text: "More. Obviously. Don't you think you should fix this?" },
  { who: "Manager", t: "2:15", text: "I can't do anything with 'more'. We'll see at the review cycle." },
  { who: "Student", t: "2:30", text: "Whatever. Let's just keep talking about it sometime." },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing");
    process.exit(2);
  }
  const seedIdx = process.argv.indexOf("--seed-report");
  const seedEmail = seedIdx > -1 ? process.argv[seedIdx + 1] : null;

  const { findSeededConversation } = await import("../lib/difficult-conversation/seeded");
  const { mapRecordToInstance } = await import("../lib/difficult-conversation/resolve-instance");
  const { resolveSessionConfig } = await import("../lib/engine/resolve");
  const { buildConversationEvaluationContext } = await import("../lib/difficult-conversation/conversation-prompts");
  const { runEvaluation } = await import("../lib/engine/evaluation");
  const { validateOutcome } = await import("../lib/engine/outcome");
  const { asProcessStepResults } = await import("../lib/problem-interview/outcome");
  const { COURAGEOUS_CONVERSATION_FRAMEWORK, CONVERSATION_STEPS_OUTCOME_KEY } = await import(
    "../lib/difficult-conversation/framework"
  );

  const seeded = findSeededConversation(SCENARIO_ID);
  if (!seeded) throw new Error(`missing seeded ${SCENARIO_ID}`);
  const instance = mapRecordToInstance(seeded, "seeded", { avatarId: "a", voiceId: "v" });
  const resolved = resolveSessionConfig(TYPE_SLUG, { instance });
  if (!resolved.ok) throw new Error("resolveSessionConfig failed");
  const config = resolved.config;

  const results: Array<{ label: string; scores: Record<string, number | null>; outcome: Record<string, unknown>; structured: unknown; markdown: string; model: string }> = [];

  const moveScore: Record<string, number> = {};
  // [label, turns, hits range, minimum partly]
  for (const [label, turns, minHits, maxHits, minPartly] of [
    ["strong", STRONG, 4, 5, 0],
    ["middling", MIDDLING, 0, 2, 2],
    ["weak", WEAK, 0, 1, 0],
  ] as const) {
    console.log(`\n== ${label} transcript`);
    const out = await runEvaluation({
      config,
      transcript: transcriptOf(seeded.studentObjective, turns),
      evaluationContext: buildConversationEvaluationContext(config) as unknown as Record<string, unknown>,
      metricsOutcome: { visualMetrics: null, vocalMetrics: null },
    });
    if (!out.ok) {
      check(`${label}: runEvaluation ok`, false, out.reason);
      continue;
    }
    const v = out.producedOutcome ? validateOutcome(config.outcome, out.producedOutcome) : null;
    check(`${label}: validateOutcome ok`, !!v?.ok, v && !v.ok ? v.errors.join("; ") : "no outcome");
    if (!v?.ok) continue;

    const steps = asProcessStepResults(v.outcome[CONVERSATION_STEPS_OUTCOME_KEY]) ?? [];
    check(`${label}: five moves parsed`, steps.length === 5, `got ${steps.length}`);
    const keys = COURAGEOUS_CONVERSATION_FRAMEWORK.steps.map((s) => s.key);
    check(`${label}: move keys match framework`, keys.every((k) => steps.some((s) => s.key === k)), steps.map((s) => s.key).join(","));
    for (const key of keys) {
      const step = steps.find((s) => s.key === key);
      const def = COURAGEOUS_CONVERSATION_FRAMEWORK.steps.find((s) => s.key === key)!;
      console.log(`  - ${def.label.padEnd(30)} ${(step?.status ?? "—").padEnd(15)} @${step?.timecodeSeconds ?? "-"}s`);
      if (step?.evidenceQuote) console.log(`      "${step.evidenceQuote}"`);
      if (step?.note) console.log(`      note: ${step.note}`);
    }
    const hits = steps.filter((s) => s.status === "hit").length;
    const partly = steps.filter((s) => s.status === "partly").length;
    check(`${label}: hits within [${minHits}, ${maxHits}]`, hits >= minHits && hits <= maxHits, `hits=${hits}`);
    if (minPartly > 0) check(`${label}: at least ${minPartly} partly`, partly >= minPartly, `partly=${partly}`);
    if (label === "weak") check("weak: at most one partly", partly <= 1, `partly=${partly}`);
    moveScore[label] = hits * 2 + partly;
    const s = out.result.scores;
    console.log(`  scores: ${["content", "behavioral", "clarity", "empathy", "holding_the_line", "objective_achieved"].map((k) => `${k}=${s[k]}`).join(" ")}`);
    check(`${label}: objectiveStatus still recorded`, typeof v.outcome.objectiveStatus === "string");
    results.push({ label, scores: s, outcome: v.outcome, structured: out.result.reportStructured, markdown: out.result.reportMarkdown, model: out.model });
  }

  // Separation on the checklist itself: hit = 2, partly = 1, missed = 0.
  if (moveScore.strong !== undefined && moveScore.middling !== undefined && moveScore.weak !== undefined) {
    check(
      `checklist separates strong > middling > weak`,
      moveScore.strong > moveScore.middling && moveScore.middling > moveScore.weak,
      JSON.stringify(moveScore),
    );
    console.log(`  checklist points (hit=2, partly=1): ${JSON.stringify(moveScore)}`);
  }
  const byLabel = Object.fromEntries(results.map((r) => [r.label, r]));
  if (byLabel.strong && byLabel.weak) {
    check("strong clarity > weak clarity", (byLabel.strong.scores.clarity ?? 0) > (byLabel.weak.scores.clarity ?? 0));
    check("strong empathy > weak empathy", (byLabel.strong.scores.empathy ?? 0) > (byLabel.weak.scores.empathy ?? 0));
  }
  // The checklist owns the five moves: strengths/growth areas should not
  // simply restate them (user decision 2026-11-14).
  const MOVE_TITLES = /^(find common ground|share facts( and observations)?|frame the concern|lead with inquiry|create a next step)$/i;
  for (const r of results) {
    const st = r.structured as { strengths?: { title?: string }[]; growth_areas?: { title?: string }[] } | null;
    const titles = [...(st?.strengths ?? []), ...(st?.growth_areas ?? [])].map((x) => (x.title ?? "").trim());
    const dupes = titles.filter((t) => MOVE_TITLES.test(t));
    check(`${r.label}: strengths/growth areas don't restate the moves`, dupes.length === 0, dupes.join(", "));
  }

  if (seedEmail && results.length) {
    const { prisma } = await import("../lib/prisma");
    const user = await prisma.user.findUnique({ where: { email: seedEmail } });
    if (!user) throw new Error(`no user ${seedEmail}`);
    const template = await prisma.interactionReport.findFirst({
      where: { typeSlug: TYPE_SLUG, status: "READY", inputSnapshot: { path: ["conversationId"], equals: SCENARIO_ID } },
      orderBy: { createdAt: "desc" },
    });
    if (!template) throw new Error("no ask-for-raise READY report to copy the snapshot from");
    for (const r of results) {
      const now = new Date();
      const row = await prisma.interactionReport.create({
        data: {
          userId: user.id,
          typeSlug: TYPE_SLUG,
          status: "READY",
          inputSnapshot: template.inputSnapshot ?? undefined,
          scores: r.scores,
          outcome: r.outcome as object,
          reportStructured: r.structured as object,
          reportMarkdown: r.markdown,
          evalModel: r.model,
          turnCount: ({ strong: STRONG, middling: MIDDLING, weak: WEAK } as const)[r.label as "strong"].length,
          title: `Five moves check — ${r.label}`,
          startedAt: new Date(now.getTime() - 4 * 60_000),
          completedAt: now,
        },
      });
      console.log(`  seeded ${r.label} report: /practice/${TYPE_SLUG}/report/${row.id}`);
    }
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALL PASS — verify-dc-five-moves.ts" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
