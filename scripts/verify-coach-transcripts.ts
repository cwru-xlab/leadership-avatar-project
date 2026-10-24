/**
 * Phase 23 transcript-level evaluation of the coach (L1/L2/L6), with REAL
 * OpenAI calls (coach, grader and reply classifier all un-stubbed).
 *
 * It drives `coachTurn` directly with scripted student utterances against
 * alice.johnson@case.edu's real coached moments (read from her existing
 * coached session's source transcripts, read-only), on THROWAWAY plan/path/
 * session rows that are deleted afterwards.
 *
 *   (a) strong rework as the first reply -> LEG_DONE within 2 coach turns
 *   (b) weak vague reply, then an improved one -> a technique is named and a
 *       retry invited
 *   (c) the student parrots the coach's technique -> not accepted as an attempt
 *   (d) moment 2: the moment-1 answer recycled (verbatim, then paraphrased)
 *       -> never accepted
 *
 * Needs DATABASE_URL, AWS and OPENAI_API_KEY:
 *   npx tsx --env-file=<.env.local> scripts/verify-coach-transcripts.ts
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma";
import { s3Storage } from "../lib/s3-client";
import { getEngineType } from "../lib/engine/registry";
import { COMPETENCIES } from "../lib/mastery/competencies";
import { createPath } from "../lib/study-plan/path";
import { coachTurn, type CoachTurnArgs, type CoachTraceEvent } from "../lib/study-plan/coached/coach";
import { resolveCoachForUser } from "../lib/study-plan/coached/coach-identity";
import { rubricDimensionsForCompetency } from "../lib/study-plan/coached/coach-prompt";
import { techniqueLine, techniquesForCompetency } from "../lib/study-plan/coached/tips";

const EMAIL = "alice.johnson@case.edu";
const KEY = "structure_and_clarity" as const;
const LINES = techniquesForCompetency(KEY).map(techniqueLine);
const named = (speech: string) => LINES.filter((l) => speech.includes(l));

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}${!pass && detail ? `\n         ${detail}` : ""}`);
  if (!pass) failures += 1;
}

const STRONG =
  "Sure. The biggest pushback came from the SVP of Operations, who worried the rollout would slow her team. I answered with the data first: the pilot cut handoff time by 30%. Then I offered a two-week trial on one team. That turned her into our sponsor.";
const VAGUE = "Honestly I think I just wanted them to know it went fine and there wasn't really much pushback at all.";
const PARAPHRASED_SVP =
  "So the main resistance was from the head of operations, she thought the new process would slow her people down, so I showed her our pilot numbers on handoff time and suggested a short trial with a single team, and after that she backed us.";

interface Moment {
  counterpartLine: string | null;
  studentLine: string;
  typeSlug: string;
  typeName: string;
}

async function loadMoment(userId: string, reportId: string, turnIndex: number): Promise<Moment> {
  const report = await prisma.interactionReport.findFirst({ where: { id: reportId, userId }, select: { typeSlug: true } });
  if (!report) throw new Error(`report ${reportId} not found`);
  const tr = await s3Storage.getInterviewTranscript(userId, reportId);
  const turn = tr?.turns[turnIndex];
  if (!tr || !turn) throw new Error(`transcript turn ${turnIndex} unavailable for ${reportId}`);
  let counterpartLine: string | null = null;
  for (let i = turnIndex - 1; i >= 0; i--) {
    if (tr.turns[i].role === "assistant") {
      counterpartLine = tr.turns[i].content;
      break;
    }
  }
  return { counterpartLine, studentLine: turn.content, typeSlug: report.typeSlug, typeName: getEngineType(report.typeSlug)?.name ?? report.typeSlug };
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`${EMAIL} not found`);
  const source = await prisma.coachedSession.findFirst({
    where: { userId: user.id, competencyKey: KEY, freshSourceReportId: { not: null }, selectionBasis: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  if (!source?.replaySourceReportId || source.replayTurnIndex === null || !source.freshSourceReportId || source.freshTurnIndex === null) {
    throw new Error("no two-moment coached session for alice to read moments from");
  }
  const m1 = await loadMoment(user.id, source.replaySourceReportId, source.replayTurnIndex);
  const m2 = await loadMoment(user.id, source.freshSourceReportId, source.freshTurnIndex);
  const coach = await resolveCoachForUser(user.id);
  const c = COMPETENCIES.find((x) => x.key === KEY)!;
  const competency = { key: KEY, label: c.label, description: (c as { description?: string }).description ?? "" };

  console.log(`Moment 1 - they said: ${m1.counterpartLine}\n           you said:  ${m1.studentLine}`);
  console.log(`Moment 2 - they said: ${m2.counterpartLine}\n           you said:  ${m2.studentLine}`);

  const planIds: string[] = [];
  const sessionIds: string[] = [];
  async function throwawaySession(): Promise<string> {
    const plan = await prisma.studyPlan.create({
      data: {
        userId: user!.id,
        title: "verify-coach-transcripts (throwaway)",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-coach-transcripts",
        draftTokenId: randomUUID(),
      },
    });
    planIds.push(plan.id);
    const path = await createPath({
      userId: user!.id,
      studyPlanId: plan.id,
      steps: [1, 2, 3, 4, 5].map((position) => ({
        position,
        kind: position === 1 ? ("COACHED_SESSION" as const) : ("UNAIDED_SESSION" as const),
        competencyKey: KEY,
        selectionReason: "verify-coach-transcripts",
        knowledgeCheckId: null,
        coachedSessionId: null,
      })),
      selectionSnapshot: { note: "verify-coach-transcripts" },
    });
    const step = path.steps.find((s) => s.kind === "COACHED_SESSION")!;
    const cs = await prisma.coachedSession.create({
      data: {
        userId: user!.id,
        pathStepId: step.id,
        competencyKey: KEY,
        replaySourceReportId: source!.replaySourceReportId,
        replayTurnIndex: source!.replayTurnIndex,
        freshSourceReportId: source!.freshSourceReportId,
        freshTurnIndex: source!.freshTurnIndex,
        selectionBasis: "PER_TURN_SCORE",
      },
    });
    sessionIds.push(cs.id);
    return cs.id;
  }

  function driver(sessionId: string, leg: "REPLAY" | "FRESH", m: Moment) {
    let coachTurns = 0;
    return async (text: string | null) => {
      const events: CoachTraceEvent[] = [];
      const args: CoachTurnArgs = {
        userId: user!.id,
        coachedSessionId: sessionId,
        leg,
        legCount: 2,
        momentFraming: "REWORK",
        moment: { counterpartLine: m.counterpartLine, studentLine: m.studentLine },
        coach,
        competency,
        rubricDimensions: rubricDimensionsForCompetency(m.typeSlug, KEY),
        underlyingTypeName: m.typeName,
        utterance: text === null ? null : { text, spokenDurationMs: Math.max(3000, text.split(/\s+/).length * 400) },
      };
      if (text !== null) console.log(`    STUDENT: ${text}`);
      const res = await coachTurn(args, { trace: (e) => events.push(e) });
      coachTurns += 1;
      const stored = text === null ? null : await prisma.coachedTurn.findFirst({
        where: { coachedSessionId: sessionId, leg, speaker: "STUDENT" },
        orderBy: { seq: "desc" },
      });
      if (stored) {
        console.log(
          `      [stored ${stored.move}${stored.move === "ATTEMPT" ? `, graded ${stored.score}, ${stored.acceptable ? "acceptable" : "not acceptable"}` : ""}${stored.parroted ? ", parroted" : ""}]` +
            (stored.gradeRationale ? ` grader: ${stored.gradeRationale}` : ""),
        );
      }
      const rej = events.filter((e) => e.kind === "CANDIDATE_REJECTED").map((e) => (e as { reason: string }).reason);
      const fb = events.some((e) => e.kind === "FALLBACK");
      console.log(`    COACH #${coachTurns} [${res.coachTurn.move}/${res.coachTurn.awaiting}${rej.length ? `; rejected: ${rej.join(",")}` : ""}${fb ? "; FALLBACK" : ""}]: ${res.coachTurn.speech}`);
      if (res.coachTurn.demonstration) console.log(`      (demonstration: ${res.coachTurn.demonstration})`);
      return { res, coachTurns, stored };
    };
  }

  try {
    console.log("\n(a) strong rework as the first reply");
    {
      const s = await throwawaySession();
      const say = driver(s, "REPLAY", m1);
      await say(null);
      const r = await say(STRONG);
      check("(a) the first reply is graded as an acceptable attempt", r.stored?.move === "ATTEMPT" && r.stored?.acceptable === true);
      check("(a) LEG_DONE within 2 coach turns", r.res.coachTurn.move === "LEG_DONE" && r.coachTurns <= 2);
      check("(a) no score or grade spoken", !/\b(score|grade|out of)\b/i.test(r.res.coachTurn.speech));
    }

    console.log("\n(b) weak vague reply, then an improved one");
    {
      const s = await throwawaySession();
      const say = driver(s, "REPLAY", m1);
      await say(null);
      const r1 = await say(VAGUE);
      check("(b) after the vague reply the coach names exactly one library technique", named(r1.res.coachTurn.speech).length === 1, r1.res.coachTurn.speech);
      check("(b) ...and invites a (re)try, with no second question", r1.res.coachTurn.awaiting === "ATTEMPT" && r1.res.coachTurn.move === "INVITE_ATTEMPT");
      check("(b) the vague reply was not accepted", r1.stored?.acceptable !== true);
      const r2 = await say(STRONG);
      check("(b) the improved answer is graded acceptable and closes the leg", r2.stored?.acceptable === true && r2.res.coachTurn.move === "LEG_DONE");
    }

    console.log("\n(c) the student parrots the coach's technique");
    {
      const s = await throwawaySession();
      const say = driver(s, "REPLAY", m1);
      await say(null);
      const r1 = await say("I'm not sure, I think I was just trying to keep it short.");
      const line = named(r1.res.coachTurn.speech)[0];
      check("(c) the coach named a technique to parrot", Boolean(line), r1.res.coachTurn.speech);
      const parrot = line ? line.replace(/^Try [^:]+: /, "").replace(/^./, (ch) => ch.toUpperCase()) : "Lead with your conclusion, then give at most two supports.";
      const r2 = await say(parrot);
      check("(c) repeating the technique is NOT accepted as an attempt (stored REPLY, ungraded)", r2.stored?.move === "REPLY" && r2.stored?.parroted === true && r2.res.legState.attemptsInLeg === 0);
      check("(c) the leg stays open and the coach re-invites", !r2.res.legState.legReady && r2.res.coachTurn.awaiting === "ATTEMPT");
    }

    console.log("\n(d) moment 2: the moment-1 answer recycled");
    {
      const s = await throwawaySession();
      const leg1 = driver(s, "REPLAY", m1);
      await leg1(null);
      await leg1(STRONG);
      const say = driver(s, "FRESH", m2);
      await say(null);
      const r1 = await say(STRONG);
      check("(d1) the verbatim recycled answer is not accepted (score 1)", r1.stored?.move === "ATTEMPT" && r1.stored?.acceptable === false && r1.stored?.score === 1);
      check("(d1) the leg is not closed and the coach re-invites", !r1.res.legState.legReady && r1.res.coachTurn.awaiting === "ATTEMPT");
      const r2 = await say(PARAPHRASED_SVP);
      check("(d2) a paraphrased off-topic answer is not accepted either (model topic check)", r2.stored?.acceptable !== true && (r2.stored?.score ?? 1) <= 1);
      check("(d2) the leg is still open", !r2.res.legState.legReady);
    }
  } finally {
    await prisma.coachedSession.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => {});
    for (const id of planIds) await prisma.studyPlan.delete({ where: { id } }).catch(() => {});
    const left = await prisma.coachedSession.count({ where: { id: { in: sessionIds } } });
    console.log(`\ncleanup: ${sessionIds.length} throwaway session(s), ${planIds.length} plan(s) deleted; remaining=${left}`);
  }
}

main()
  .catch((err) => {
    failures += 1;
    console.log(`  FAIL threw: ${err instanceof Error ? err.stack : String(err)}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
