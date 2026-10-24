/**
 * Plan 22-10: proves the mechanical coach behaviours with stubbed generate and
 * grade functions (no model calls).
 *
 * Section 1 is pure. Section 2 needs a database and prints an explicit SKIP
 * when DATABASE_URL is unset.
 *
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *                npx tsx scripts/verify-coach-turn.ts
 */
import { randomUUID } from "node:crypto";

import {
  legStateFromTurns,
  type CoachedTurnRow,
  type CoachTurnArgs,
  type CoachTurnDeps,
} from "../lib/study-plan/coached/coach";
import { DEFAULT_COACH } from "../lib/study-plan/coached/coach-identity";
import {
  assertTipSafe,
  validateCoachSpeech,
} from "../lib/study-plan/coached/tips";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}
const skip = (m: string) => console.log(`  SKIP ${m}`);

function row(p: Partial<CoachedTurnRow> & Pick<CoachedTurnRow, "seq" | "speaker" | "move">): CoachedTurnRow {
  return {
    leg: "REPLAY",
    awaiting: null,
    text: "x",
    demonstration: null,
    score: null,
    acceptable: null,
    parroted: null,
    gradeRationale: null,
    spokenDurationMs: null,
    closedAtSoftCap: null,
    ...p,
  };
}

const STUDENT_LINE = "We did some stuff and it kind of worked out for the team I guess";
const COUNTERPART = "Tell me about a time you led a project through a difficult stretch";
const DEMO = "Open with the result, then name the one decision you made and what it changed.";

type Out = {
  speech: string;
  move: string;
  awaiting: string;
  demonstration: string | null;
};
const OPEN: Out = {
  speech: "Today we are sharpening how clearly you land the point of this story. What were you trying to get across there?",
  move: "OPEN",
  awaiting: "REPLY",
  demonstration: null,
};
const INVITE: Out = {
  speech: "Thanks. Now say that moment again, out loud, in your own words.",
  move: "INVITE_ATTEMPT",
  awaiting: "ATTEMPT",
  demonstration: null,
};
const DEMONSTRATE: Out = {
  speech: "Here is one version. Listen, then try again in your own words.",
  move: "DEMONSTRATE",
  awaiting: "ATTEMPT",
  demonstration: DEMO,
};
const LEG_DONE: Out = {
  speech: "That lands well. We can close this moment here.",
  move: "LEG_DONE",
  awaiting: "NONE",
  demonstration: null,
};

async function main() {
  console.log("\n1. legStateFromTurns - pure");
  {
    const turns = [
      row({ seq: 1, speaker: "COACH", move: "OPEN", awaiting: "REPLY" }),
      row({ seq: 2, speaker: "STUDENT", move: "REPLY" }),
      row({ seq: 3, speaker: "COACH", move: "INVITE_ATTEMPT", awaiting: "ATTEMPT" }),
      row({ seq: 4, speaker: "STUDENT", move: "ATTEMPT", score: 2, acceptable: false }),
      row({ seq: 5, speaker: "COACH", move: "DEMONSTRATE", awaiting: "ATTEMPT", demonstration: "d" }),
      row({ seq: 6, speaker: "STUDENT", move: "ATTEMPT", score: 4, acceptable: true }),
      row({ seq: 7, speaker: "COACH", move: "LEG_DONE", awaiting: "NONE", leg: "FRESH" }),
    ];
    const s = legStateFromTurns(turns, "REPLAY");
    check("attempts counted (2)", s.attemptsInLeg === 2);
    check("demonstrations counted (1)", s.demonstrationsInLeg === 1);
    check("coach turns counted (3)", s.coachTurnsInLeg === 3);
    check("awaiting from last coach turn", s.awaiting === "ATTEMPT");
    check("legReady is per-leg (FRESH LEG_DONE ignored)", s.legReady === false);
    check("lastAttempt is the latest", s.lastAttempt?.seq === 6);
    check("hasOpened / acceptable / lastDemonstration", s.hasOpened && s.hasAcceptableAttempt && s.lastDemonstration === "d");
    check("FRESH leg legReady", legStateFromTurns(turns, "FRESH").legReady === true);
    const empty = legStateFromTurns([], "REPLAY");
    check("empty leg: not opened, no awaiting", !empty.hasOpened && empty.awaiting === null);
  }

  if (!process.env.DATABASE_URL) {
    skip("2. coachTurn database section (no DATABASE_URL set)");
    return;
  }
  console.log("\n2. coachTurn - requires a database");

  const { prisma } = await import("../lib/prisma");
  const { createPath } = await import("../lib/study-plan/path");
  const {
    coachTurn,
    CoachTurnOrderError,
    UnspokenAttemptError,
  } = await import("../lib/study-plan/coached/coach");

  const testId = randomUUID();
  let userId = "";
  const planIds: string[] = [];
  const sessionIds: string[] = [];

  async function newSession(): Promise<string> {
    const plan = await prisma.studyPlan.create({
      data: {
        userId,
        title: "coach-turn verify",
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-coach-turn-stub",
        draftTokenId: randomUUID(),
      },
    });
    planIds.push(plan.id);
    const filler = [2, 3, 4, 5].map((position) => ({
      position,
      kind: "UNAIDED_SESSION" as const,
      competencyKey: "structure_and_clarity" as const,
      selectionReason: "verify-coach-turn filler",
      knowledgeCheckId: null,
      coachedSessionId: null,
    }));
    const path = await createPath({
      userId,
      studyPlanId: plan.id,
      steps: [
        {
          position: 1,
          kind: "COACHED_SESSION",
          competencyKey: "structure_and_clarity",
          selectionReason: "verify-coach-turn coached step",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
        ...filler,
      ],
      selectionSnapshot: { note: "verify-coach-turn" },
    });
    const step = path.steps.find((s) => s.kind === "COACHED_SESSION")!;
    const cs = await prisma.coachedSession.create({
      data: {
        userId,
        pathStepId: step.id,
        competencyKey: "structure_and_clarity",
        replaySourceReportId: `verify-coach-turn-${testId}`,
        replayTurnIndex: 0,
        selectionBasis: "PER_TURN_SCORE",
      },
    });
    sessionIds.push(cs.id);
    return cs.id;
  }

  const base = (sessionId: string): Omit<CoachTurnArgs, "utterance"> => ({
    userId,
    coachedSessionId: sessionId,
    leg: "REPLAY",
    legCount: 2,
    momentFraming: "REWORK",
    moment: { counterpartLine: COUNTERPART, studentLine: STUDENT_LINE },
    coach: { ...DEFAULT_COACH, isDefault: true },
    competency: {
      key: "structure_and_clarity",
      label: "Structure and clarity",
      description: "Lands the point in an organised way.",
    },
    rubricDimensions: [],
    underlyingTypeName: "General interview",
  });

  /** A stub generate that plays a queue, repeating its last entry. */
  function stubGen(queue: Out[]) {
    let calls = 0;
    const fn = async () => {
      const out = queue[Math.min(calls, queue.length - 1)];
      calls += 1;
      return out;
    };
    return { fn, calls: () => calls };
  }
  const grader = (score: number, acceptable: boolean) => async () => ({
    score,
    acceptable,
    rationale: "stub verdict",
  });

  /** Drive one turn with fresh stubs. */
  async function turn(
    sessionId: string,
    utterance: CoachTurnArgs["utterance"],
    queue: Out[],
    g: CoachTurnDeps["grade"] = grader(2, false),
  ) {
    const gen = stubGen(queue);
    const res = await coachTurn(
      { ...base(sessionId), utterance },
      { generate: gen.fn, grade: g },
    );
    return { res, calls: gen.calls() };
  }
  const say = (text: string) => ({ text, spokenDurationMs: 6000 });

  try {
    const user = await prisma.user.create({
      data: { email: `coach-turn-verify-${testId}@example.com`, name: "Coach Turn Verify", role: "STUDENT" },
    });
    userId = user.id;

    // 1. Opening
    {
      const s = await newSession();
      const { res } = await turn(s, null, [OPEN]);
      check("1. opening delivered, awaiting REPLY, move OPEN", res.coachTurn.move === "OPEN" && res.coachTurn.awaiting === "REPLY");
      check("1. opening state: opened, zero attempts", res.legState.hasOpened && res.legState.attemptsInLeg === 0);
    }

    // 2. Demonstration before any attempt
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const { res, calls } = await turn(s, say("I wanted them to see we delivered the project"), [DEMONSTRATE]);
      check("2. premature DEMONSTRATE never delivered (fallback instead)", res.coachTurn.move === "ASK_DIAGNOSIS" && res.coachTurn.demonstration === null);
      check("2. exactly MAX_COACH_GENERATION_ATTEMPTS (3) candidates tried", calls === 3, `calls=${calls}`);
      const stored = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, speaker: "COACH" }, orderBy: { seq: "desc" } });
      check("2. stored COACH row has demonstration null", stored?.demonstration === null);
      check("2. no demonstration anywhere in the stored session", (await prisma.coachedTurn.count({ where: { coachedSessionId: s, demonstration: { not: null } } })) === 0);
    }

    // 3. One demonstration after a weak attempt; a second is rejected
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      await turn(s, say("It was about the project"), [INVITE]);
      const first = await turn(s, say("We finished the thing and it mostly went fine"), [DEMONSTRATE]);
      check("3. DEMONSTRATE delivered after a weak attempt", first.res.coachTurn.move === "DEMONSTRATE" && first.res.coachTurn.demonstration === DEMO);
      const second = await turn(s, say("So we shipped it and the team was happy about it"), [DEMONSTRATE]);
      check("3. second DEMONSTRATE in the leg rejected (fallback delivered)", second.res.coachTurn.demonstration === null && second.res.coachTurn.move === "ASK_DIAGNOSIS");
      check("3. exactly one demonstration stored", second.res.legState.demonstrationsInLeg === 1);
      let limitMsg = "";
      try {
        assertTipSafe(DEMO, { studentLine: STUDENT_LINE, gate: { kind: "DEMONSTRATION", attemptsInLeg: 2, demonstrationsInLeg: 1 } });
      } catch (e) {
        limitMsg = e instanceof Error ? e.message : String(e);
      }
      check("3. rejection reason is DEMONSTRATION_LIMIT", limitMsg.includes("DEMONSTRATION_LIMIT"), limitMsg);
    }

    // 4. Parroted attempt
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      await turn(s, say("It was about the project"), [INVITE]);
      await turn(s, say("We finished the thing and it mostly went fine"), [DEMONSTRATE]);
      await turn(s, say(DEMO), [INVITE], grader(5, true));
      const att = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, speaker: "STUDENT", move: "ATTEMPT" }, orderBy: { seq: "desc" } });
      check("4. verbatim demonstration stored parroted=true", att?.parroted === true);
      check("4. ...and acceptable=false despite grader score 5", att?.acceptable === false && att?.score === 5);
    }

    // 5. LEG_DONE only once earned
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      await turn(s, say("It was about the project"), [INVITE]);
      const early = await turn(s, say("We finished the thing and it mostly went fine"), [LEG_DONE], grader(2, false));
      check("5. LEG_DONE before an acceptable attempt rejected", early.res.coachTurn.move !== "LEG_DONE" && !early.res.legState.legReady);
      await turn(s, say("I think it was unclear"), [INVITE]);
      const ok = await turn(s, say("I led the migration, cut the downtime to zero, and the team shipped a week early"), [LEG_DONE], grader(4, true));
      check("5. LEG_DONE after a grade-4 acceptable attempt delivered", ok.res.coachTurn.move === "LEG_DONE" && ok.res.legState.legReady === true);
      check("5. not flagged closedAtSoftCap", ok.res.coachTurn.closedAtSoftCap === false);
      let order = false;
      try {
        await turn(s, null, [INVITE]);
      } catch (e) {
        order = e instanceof CoachTurnOrderError;
      }
      check("5. a turn after the leg is closed throws CoachTurnOrderError", order);
    }

    // 6. Soft cap
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      await turn(s, say("It was about the project"), [INVITE]);
      await turn(s, say("We finished the thing and it mostly went fine"), [INVITE]);
      await turn(s, say("The team did well on the project overall"), [INVITE]);
      const below = await turn(s, say("Basically things turned out all right in the end"), [LEG_DONE], grader(2, false));
      check("6. at 3 weak attempts (below the cap) LEG_DONE is rejected", below.res.legState.attemptsInLeg === 3 && !below.res.legState.legReady);
      await turn(s, say("Fine, it just worked out for the group"), [INVITE]);
      const capped = await turn(s, say("Honestly it was a decent outcome for everybody"), [LEG_DONE], grader(2, false));
      check("6. at 4 weak attempts LEG_DONE accepted with closedAtSoftCap", capped.res.legState.attemptsInLeg === 4 && capped.res.coachTurn.move === "LEG_DONE" && capped.res.coachTurn.closedAtSoftCap === true && capped.res.legState.legReady);
      const stored = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, move: "LEG_DONE" } });
      check("6. closedAtSoftCap persisted true", stored?.closedAtSoftCap === true);
    }

    // 7. Speech gate
    {
      const s = await newSession();
      const badCue: Out = { ...OPEN, speech: "You could try saying it with the result first." };
      const badVoice: Out = { ...OPEN, speech: `Remember they asked: ${COUNTERPART}. What did you do then?` };
      const { res, calls } = await turn(s, null, [badCue, badVoice, OPEN]);
      check("7. 'try saying' and counterpart-verbatim candidates rejected, third delivered", res.coachTurn.speech === OPEN.speech && calls === 3, `calls=${calls}`);
      const s2 = await newSession();
      const allBad = await turn(s2, null, [badCue, badVoice]);
      check("7. when every candidate is bad the fallback is delivered", allBad.res.coachTurn.speech.startsWith("Let's stay with that moment"));
    }

    // 8. Unspoken attempt / order
    {
      const s = await newSession();
      let before = false;
      try {
        await turn(s, say("hello"), [OPEN]);
      } catch (e) {
        before = e instanceof CoachTurnOrderError;
      }
      check("8. an utterance before the coach has opened is refused", before);
      await turn(s, null, [OPEN]);
      let unspoken = false;
      try {
        await turn(s, { text: "typed answer", spokenDurationMs: 0 }, [INVITE]);
      } catch (e) {
        unspoken = e instanceof UnspokenAttemptError;
      }
      check("8. spokenDurationMs 0 throws UnspokenAttemptError", unspoken);
      check("8. nothing persisted for the refused utterance", (await prisma.coachedTurn.count({ where: { coachedSessionId: s, speaker: "STUDENT" } })) === 0);
    }

    // Ownership
    {
      const s = await newSession();
      let denied = false;
      try {
        await coachTurn({ ...base(s), userId: randomUUID(), utterance: null }, { generate: stubGen([OPEN]).fn });
      } catch {
        denied = true;
      }
      check("ownership: another user cannot drive the session", denied);
    }

    // 9. Re-validation sweep from stored data
    {
      const rows = await prisma.coachedTurn.findMany({
        where: { coachedSessionId: { in: sessionIds } },
        orderBy: [{ coachedSessionId: "asc" }, { seq: "asc" }],
      });
      const coachRows = rows.filter((r) => r.speaker === "COACH");
      let bad = 0;
      for (const r of coachRows) {
        const attempts = rows
          .filter((x) => x.coachedSessionId === r.coachedSessionId && x.speaker === "STUDENT" && x.move === "ATTEMPT")
          .map((x) => x.text);
        const v = validateCoachSpeech(r.text, { studentLine: STUDENT_LINE, counterpartLine: COUNTERPART, studentAttempts: attempts });
        if (!v.ok) bad += 1;
      }
      check(`9. all ${coachRows.length} stored COACH rows re-pass validateCoachSpeech`, coachRows.length > 10 && bad === 0, `bad=${bad}`);
      const demoRows = coachRows.filter((r) => r.demonstration !== null);
      let demoBad = 0;
      for (const r of demoRows) {
        const prior = rows.filter((x) => x.coachedSessionId === r.coachedSessionId && x.seq < r.seq);
        const attempts = prior.filter((x) => x.speaker === "STUDENT" && x.move === "ATTEMPT").length;
        const demos = prior.filter((x) => x.demonstration !== null).length;
        try {
          assertTipSafe(r.demonstration!, { studentLine: STUDENT_LINE, gate: { kind: "DEMONSTRATION", attemptsInLeg: attempts, demonstrationsInLeg: demos } });
        } catch {
          demoBad += 1;
        }
      }
      check(`9. all ${demoRows.length} stored demonstrations re-pass the gate at their position`, demoRows.length >= 1 && demoBad === 0, `bad=${demoBad}`);
    }

    // 10. Bite-proof
    {
      let before = "";
      try {
        assertTipSafe(DEMO, { studentLine: STUDENT_LINE, gate: { kind: "DEMONSTRATION", attemptsInLeg: 0, demonstrationsInLeg: 0 } });
      } catch (e) {
        before = e instanceof Error ? e.message : String(e);
      }
      check("10. demonstration text throws DEMONSTRATION_BEFORE_ATTEMPT at attemptsInLeg 0", before.includes("DEMONSTRATION_BEFORE_ATTEMPT"), before);
      let threw = false;
      try {
        assertTipSafe(DEMO, { studentLine: STUDENT_LINE, gate: { kind: "DEMONSTRATION", attemptsInLeg: 1, demonstrationsInLeg: 0 } });
      } catch {
        threw = true;
      }
      check("10. the same text does NOT throw at attemptsInLeg 1 (case 2 was rejected by the attempt gate)", !threw);
    }
  } finally {
    for (const id of planIds) await prisma.studyPlan.delete({ where: { id } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    failures += 1;
    console.log(`  FAIL threw unexpectedly: ${err instanceof Error ? err.stack : String(err)}`);
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
