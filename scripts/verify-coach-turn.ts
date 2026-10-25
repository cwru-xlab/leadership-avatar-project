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
  techniqueLine,
  techniquesForCompetency,
  validateCoachSpeech,
} from "../lib/study-plan/coached/tips";
import { MIN_ATTEMPT_WORDS } from "../lib/study-plan/coached/reply-classifier";

const STRUCTURE_LINES = techniquesForCompetency("structure_and_clarity").map(techniqueLine);
/** How many library technique lines a coach speech names. */
const linesNamed = (speech: string) => STRUCTURE_LINES.filter((l) => speech.includes(l)).length;
/** The pre-Phase-23 generic fallback that wasted a turn in the real run. */
const OLD_GENERIC_FALLBACK = "Let's stay with that moment. What were you aiming to get across?";

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
// Built only from the fixture student's own words (demonstrations may not invent facts).
const DEMO = "We finished the project through a difficult stretch, and it worked out for the team.";

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

  /** A stub reply classifier that counts its calls. */
  function stubClassifier(reanswers: boolean) {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return { reanswers, why: "stub" };
    };
    return { fn, calls: () => calls };
  }

  /** Drive one turn with fresh stubs. */
  async function turn(
    sessionId: string,
    utterance: CoachTurnArgs["utterance"],
    queue: Out[],
    g: CoachTurnDeps["grade"] = grader(2, false),
    classify: CoachTurnDeps["classifyReply"] = stubClassifier(false).fn,
  ) {
    const gen = stubGen(queue);
    const rejected: string[] = [];
    const res = await coachTurn(
      { ...base(sessionId), utterance },
      {
        generate: gen.fn,
        grade: g,
        classifyReply: classify,
        trace: (e) => {
          if (e.kind === "CANDIDATE_REJECTED") rejected.push(e.reason);
        },
      },
    );
    return { res, calls: gen.calls(), rejected };
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
      check("2. premature DEMONSTRATE never delivered (technique-plus-invite fallback instead)", res.coachTurn.move === "INVITE_ATTEMPT" && res.coachTurn.demonstration === null && linesNamed(res.coachTurn.speech) === 1);
      check("2. exactly MAX_COACH_GENERATION_ATTEMPTS (3) candidates tried", calls === 3, `calls=${calls}`);
      const stored = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, speaker: "COACH" }, orderBy: { seq: "desc" } });
      check("2. stored COACH row has demonstration null", stored?.demonstration === null);
      check("2. no demonstration anywhere in the stored session", (await prisma.coachedTurn.count({ where: { coachedSessionId: s, demonstration: { not: null } } })) === 0);
    }

    // 3. One demonstration (the ladder's miss-3 step, L7); never earlier; a second is rejected
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      await turn(s, say("It was about the project"), [INVITE]);
      const early = await turn(s, say("We finished the thing and it mostly went fine"), [DEMONSTRATE]);
      check("3. a demonstration after miss 1 is refused (escalation, L7)", early.res.coachTurn.demonstration === null && early.rejected.every((r) => r === "MOVE_NOT_ALLOWED_DEMONSTRATE"));
      await turn(s, say("We got through it in the end and the team was fine with that"), [INVITE]);
      const first = await turn(s, say("Basically it worked out for the team after a while"), [DEMONSTRATE]);
      check("3. DEMONSTRATE delivered after miss 3", first.res.coachTurn.move === "DEMONSTRATE" && first.res.coachTurn.demonstration === DEMO);
      const second = await turn(s, say("So we shipped it and the team was happy about it"), [DEMONSTRATE]);
      check("3. second DEMONSTRATE in the leg rejected (the kind close is delivered instead)", second.res.coachTurn.demonstration === null && second.res.coachTurn.move === "LEG_DONE");
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
      await turn(s, say("We finished the thing and it mostly went fine"), [INVITE]);
      await turn(s, say("We got through it in the end and the team was fine with that"), [INVITE]);
      await turn(s, say("Basically it worked out for the team after a while"), [DEMONSTRATE]);
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
      // The fallback now invites (awaiting ATTEMPT), so the next utterance is attempt 4.
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
      check(
        "7. when every opening candidate is bad, the deterministic opening names the skill and asks one question",
        allBad.res.coachTurn.move === "OPEN" && /structure and clarity/.test(allBad.res.coachTurn.speech) && allBad.res.coachTurn.speech !== OLD_GENERIC_FALLBACK,
      );
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

    // 11. L1 - attempt-quality reply, diagnosis cap, no generic fallback
    const STRONG =
      "We moved the launch two weeks so the data migration could finish cleanly. I made that call after the dry run failed, told the client the same day, and we shipped with zero downtime.";
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const cls = stubClassifier(true);
      const { res } = await turn(s, say(STRONG), [LEG_DONE], grader(5, true), cls.fn);
      const stored = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, speaker: "STUDENT" } });
      check("11a. a reply that re-answers the prompt is stored and graded as an ATTEMPT", stored?.move === "ATTEMPT" && stored?.score === 5 && stored?.acceptable === true);
      check("11a. ...and the coach closes the leg on the 2nd coach turn", res.coachTurn.move === "LEG_DONE" && res.legState.coachTurnsInLeg === 2 && res.legState.legReady);
      check("11a. the classifier was consulted exactly once", cls.calls() === 1);
    }
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const { res, rejected } = await turn(s, say(STRONG), [INVITE], grader(5, true), stubClassifier(true).fn);
      check("11b. after an acceptable attempt a non-closing candidate is rejected", rejected.length === 3 && rejected.every((r) => r === "MUST_CLOSE_AFTER_ACCEPTABLE"), rejected.join(","));
      check("11b. ...and the deterministic fallback closes the leg (LEG_DONE)", res.coachTurn.move === "LEG_DONE" && res.legState.legReady && !res.coachTurn.closedAtSoftCap);
    }
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const ASK: Out = { speech: "Interesting. What else were you hoping they would notice?", move: "ASK_DIAGNOSIS", awaiting: "REPLY", demonstration: null };
      const vague = "Honestly I think I was just trying to show them that it went okay in the end overall";
      const { res, rejected } = await turn(s, say(vague), [ASK], grader(2, false), stubClassifier(false).fn);
      check("11c. a second diagnosis question is rejected (DIAGNOSIS_CAP)", rejected.length === 3 && rejected.every((r) => r === "DIAGNOSIS_CAP"), rejected.join(","));
      check("11c. the fallback names one technique and invites, never a question", res.coachTurn.move === "INVITE_ATTEMPT" && res.coachTurn.awaiting === "ATTEMPT" && linesNamed(res.coachTurn.speech) === 1 && !res.coachTurn.speech.trim().endsWith("?"));
      check("11c. the fallback is not the old generic line", !res.coachTurn.speech.includes("Let's stay with that moment"));
      const coachTexts = (await prisma.coachedTurn.findMany({ where: { coachedSessionId: s, speaker: "COACH" } })).map((r) => r.text);
      check("11c. no coach speech in the leg is repeated", new Set(coachTexts).size === coachTexts.length);
      check("11c. only one question was ever asked in the leg", res.legState.diagnosisQuestionsInLeg === 1);
    }
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const cls = stubClassifier(true);
      const short = "I wanted them to see it went fine";
      await turn(s, say(short), [INVITE], grader(5, true), cls.fn);
      check(`11d. a reply under ${MIN_ATTEMPT_WORDS} words never reaches the classifier and is a REPLY`, cls.calls() === 0 && (await prisma.coachedTurn.count({ where: { coachedSessionId: s, move: "ATTEMPT" } })) === 0);
    }
    {
      // Case (c): parroting the technique the coach just named.
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const invite = await turn(s, say("I guess I wanted to say it worked out"), [{ ...INVITE, techniqueId: "structure-headline-first" } as Out]);
      check("11e. the invite names the requested technique", invite.res.coachTurn.speech.includes(techniqueLine(techniquesForCompetency("structure_and_clarity")[0])));
      let graded = 0;
      const countingGrader: CoachTurnDeps["grade"] = async () => {
        graded += 1;
        return { score: 5, acceptable: true, rationale: "stub" };
      };
      const parrot = await turn(s, say("Lead with your conclusion, then give at most two supports."), [INVITE], countingGrader, stubClassifier(true).fn);
      const last = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, speaker: "STUDENT" }, orderBy: { seq: "desc" } });
      check("11e. repeating the technique back is stored as a REPLY (parroted), not an attempt", last?.move === "REPLY" && last?.parroted === true);
      check("11e. ...it is never graded and the leg stays open", graded === 0 && parrot.res.legState.attemptsInLeg === 0 && !parrot.res.legState.legReady);
      check("11e. the coach invites again with a technique", parrot.res.coachTurn.move === "INVITE_ATTEMPT" && linesNamed(parrot.res.coachTurn.speech) === 1);
    }

    // 12. L2 - a technique named aloud before every attempt
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const first = await turn(s, say("I think it was about the project"), [{ ...INVITE, techniqueId: "structure-signpost-transitions" } as Out]);
      const sig = techniquesForCompetency("structure_and_clarity").find((t) => t.id === "structure-signpost-transitions")!;
      check("12a. the model's technique id is honoured, spoken as one library line", first.res.coachTurn.speech.includes(techniqueLine(sig)) && linesNamed(first.res.coachTurn.speech) === 1);
      check("12a. the first invite asks for the answer again", first.res.coachTurn.speech.endsWith("as if you're back in that moment."));
      const second = await turn(s, say("So we did the thing, and then it went okay and that was mostly it really"), [{ ...INVITE, techniqueId: "not-a-real-id" } as Out]);
      check("12b. after a not-yet attempt an unknown id falls back to a different, unused technique", linesNamed(second.res.coachTurn.speech) === 1 && !second.res.coachTurn.speech.includes(techniqueLine(sig)));
      check("12b. the retry invite asks for one more try", second.res.coachTurn.speech.endsWith("Give it one more try, out loud."));
      for (const l of STRUCTURE_LINES) {
        let ok = true;
        try {
          assertTipSafe(l, { studentLine: STUDENT_LINE });
        } catch {
          ok = false;
        }
        if (!ok) check(`12c. technique line passes assertTipSafe: ${l}`, false);
      }
      check("12c. every structure technique line passes assertTipSafe", true);
      const GRADED: Out = { ...INVITE, speech: "That was a 4 out of 5, nearly there." };
      const g = await turn(s, say("We did it and the team was happy and the client was happy with it too"), [GRADED]);
      check("12d. a coach speech that mentions a score is rejected (SPEECH_MENTIONS_GRADE)", g.rejected.length === 3 && g.rejected.every((r) => r === "SPEECH_MENTIONS_GRADE") && !/4 out of 5/.test(g.res.coachTurn.speech), g.rejected.join(","));
    }

    // 12e. Invite reaction length cap
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const LONG: Out = { ...INVITE, speech: "Good start. ".repeat(20).trim() };
      const r = await turn(s, say("I think it was about the project"), [LONG]);
      check("12e. an over-long invite reaction is rejected (INVITE_REACTION_TOO_LONG), never truncated", r.rejected.length === 3 && r.rejected.every((x) => x === "INVITE_REACTION_TOO_LONG") && !r.res.coachTurn.speech.includes("Good start. Good start."), r.rejected.join(","));
      const s2 = await newSession();
      await turn(s2, null, [OPEN]);
      const ok = await turn(s2, say("I think it was about the project"), [{ ...INVITE, speech: "Good start. ".repeat(5).trim() }]);
      check("12e. bite: a short reaction passes", ok.rejected.length === 0);
    }

    // 13. Bite-proofs for 11/12
    {
      // Without the attempt-quality path (classifier says no), the same strong
      // reply is a REPLY and the leg is NOT closed on the 2nd coach turn.
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const { res } = await turn(s, say(STRONG), [LEG_DONE], grader(5, true), stubClassifier(false).fn);
      check("13a. bite: with the classifier saying no, the strong reply is not an attempt and LEG_DONE is refused", res.legState.attemptsInLeg === 0 && !res.legState.legReady);
      check("13b. bite: linesNamed catches a speech with its technique line removed", linesNamed(res.coachTurn.speech) === 1 && linesNamed(STRUCTURE_LINES.reduce((acc, l) => acc.replace(l, ""), res.coachTurn.speech)) === 0);
      check("13c. bite: the old generic fallback would fail the 11c checks", linesNamed(OLD_GENERIC_FALLBACK) === 0 && OLD_GENERIC_FALLBACK.trim().endsWith("?"));
    }

    // 14. L6 - an attempt must answer THIS moment's prompt
    {
      const { gradeCoachedAttempt } = await import("../lib/study-plan/coached/grade-attempt");
      const gIn = {
        competency: base("x").competency,
        rubricDimensions: [],
        counterpartLine: COUNTERPART,
        originalLine: STUDENT_LINE,
        attempt: "a",
        spokenDurationMs: 1000,
        demonstration: null,
      };
      const off = await gradeCoachedAttempt(gIn, { grader: async () => ({ score: 5, acceptable: true, onTopic: false, rationale: "different story" }) });
      check("14a. grader: an off-topic verdict is never acceptable and scores at most 1", off.acceptable === false && off.score === 1 && off.onTopic === false);
      const on = await gradeCoachedAttempt(gIn, { grader: async () => ({ score: 5, acceptable: true, onTopic: true, rationale: "ok" }) });
      check("14a. bite: the same verdict on-topic stays acceptable at 5", on.acceptable === true && on.score === 5);

      let graded = 0;
      const counting5: CoachTurnDeps["grade"] = async () => {
        graded += 1;
        return { score: 5, acceptable: true, onTopic: true, rationale: "stub" };
      };
      const s = await newSession();
      await turn(s, null, [OPEN]);
      await turn(s, say(STRONG), [LEG_DONE], grader(5, true), stubClassifier(true).fn);
      const fresh = (u: CoachTurnArgs["utterance"], q: Out[], g: CoachTurnDeps["grade"], c = stubClassifier(true)) =>
        coachTurn({ ...base(s), leg: "FRESH", utterance: u }, { generate: stubGen(q).fn, grade: g, classifyReply: c.fn });
      await fresh(null, [OPEN], counting5);
      const RECYCLED =
        "I made that call after the dry run failed, told the client the same day, and we shipped with zero downtime. We moved the launch two weeks so the data migration could finish cleanly.";
      const cls = stubClassifier(true);
      const r1 = await fresh(say(RECYCLED), [LEG_DONE], counting5, cls);
      const att = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, leg: "FRESH", speaker: "STUDENT" }, orderBy: { seq: "desc" } });
      check("14b. moment-1's answer replayed in moment 2 is a graded ATTEMPT, score 1, not acceptable", att?.move === "ATTEMPT" && att?.score === 1 && att?.acceptable === false);
      check("14b. ...detected deterministically: no grader or classifier call", graded === 0 && cls.calls() === 0);
      check("14b. ...the leg is not closed, and the coach says it is a different situation and re-invites", !r1.legState.legReady && r1.coachTurn.move === "INVITE_ATTEMPT" && /different situation/.test(r1.coachTurn.speech) && linesNamed(r1.coachTurn.speech) === 1);
      const offGrader: CoachTurnDeps["grade"] = async () => ({ score: 5, acceptable: true, onTopic: false, rationale: "answers a different question" });
      const r2 = await fresh(say("At my last job I organised the offsite and everyone said the agenda was really clear and useful for the whole team"), [LEG_DONE], offGrader);
      const att2 = await prisma.coachedTurn.findFirst({ where: { coachedSessionId: s, leg: "FRESH", speaker: "STUDENT" }, orderBy: { seq: "desc" } });
      check("14c. a model off-topic verdict is stored score 1, not acceptable, and LEG_DONE is refused", att2?.score === 1 && att2?.acceptable === false && !r2.legState.legReady);
      const r3 = await fresh(say("At my last job I organised the offsite and everyone said the agenda was really clear and useful for the whole team"), [LEG_DONE], counting5);
      check("14c. bite: the same words graded on-topic are accepted and close the leg", r3.legState.legReady && r3.coachTurn.move === "LEG_DONE");
      let seen: string[] | undefined;
      const s3 = await newSession();
      await turn(s3, null, [OPEN]);
      await turn(s3, say(STRONG), [LEG_DONE], grader(5, true), stubClassifier(true).fn);
      await coachTurn({ ...base(s3), leg: "FRESH", utterance: null }, { generate: stubGen([OPEN]).fn });
      await coachTurn(
        { ...base(s3), leg: "FRESH", utterance: say("At Leidos I built a partner data system and interviewed each partner team before writing any requirements for it") },
        { generate: stubGen([INVITE]).fn, classifyReply: stubClassifier(true).fn, grade: async (input) => { seen = input.otherMomentAnswers; return { score: 2, acceptable: false, onTopic: true, rationale: "stub" }; } },
      );
      check("14e. the grader receives the other moment's answers so it can catch a reworded recycle", Array.isArray(seen) && seen.length === 1 && seen[0] === STRONG);
    }
    {
      // Bite for the deterministic check: with no other leg, the same words are graded normally.
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const { res } = await turn(s, say("I made that call after the dry run failed, told the client the same day, and we shipped with zero downtime."), [LEG_DONE], grader(5, true), stubClassifier(true).fn);
      check("14d. bite: without an earlier leg the same words are not 'recycled' and are accepted", res.legState.legReady);
    }

    // 15. L7 - support escalates across misses; never the same technique twice in a row
    {
      const { chooseTechnique, safeTechniques } = await import("../lib/study-plan/coached/coach");
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const HEAD = "structure-headline-first";
      const inviteHead = { ...INVITE, techniqueId: HEAD } as Out;
      const t0 = await turn(s, say("I think it was about the project"), [inviteHead]);
      const miss = (n: number) => `Attempt ${n}: we did the project and it went fine for the team overall in the end`;
      const m1 = await turn(s, say(miss(1)), [inviteHead]); // asks to repeat headline-first
      const m2 = await turn(s, say(miss(2)), [inviteHead]);
      const invites = [t0, m1, m2].map((x) => STRUCTURE_LINES.find((l) => x.res.coachTurn.speech.includes(l)) ?? "");
      check("15a. every invite names exactly one technique", [t0, m1, m2].every((x) => linesNamed(x.res.coachTurn.speech) === 1));
      check("15a. miss 1 and miss 2 each name a DIFFERENT technique from the one just before (a repeated id is overridden)", invites[0] !== invites[1] && invites[1] !== invites[2], invites.join(" | "));
      const m3inv = await turn(s, say(miss(3)), [inviteHead]);
      check("15b. after miss 3 a plain invite is refused: the demonstration is the only move", m3inv.rejected.length === 3 && m3inv.rejected.every((r) => r === "MOVE_NOT_ALLOWED_INVITE_ATTEMPT"), m3inv.rejected.join(","));
      check("15b. ...and if no demonstration can be produced, the fallback is the [slot] template demonstration", m3inv.res.coachTurn.move === "DEMONSTRATE" && /\[[^\]]+\]/.test(m3inv.res.coachTurn.demonstration ?? ""));
      const s2 = await newSession();
      await turn(s2, null, [OPEN]);
      await turn(s2, say("I think it was about the project"), [INVITE]);
      await turn(s2, say(miss(1)), [INVITE]);
      await turn(s2, say(miss(2)), [INVITE]);
      const demo = await turn(s2, say(miss(3)), [DEMONSTRATE]);
      check("15c. miss 3 -> the gated demonstration, inviting one last try", demo.res.coachTurn.move === "DEMONSTRATE" && demo.res.coachTurn.awaiting === "ATTEMPT" && demo.res.coachTurn.demonstration === DEMO);
      const close = await turn(s2, say(miss(4)), [INVITE]);
      check("15d. after the last try (miss 4) only LEG_DONE is accepted; the fallback closes kindly with a takeaway", close.res.coachTurn.move === "LEG_DONE" && /takeaway/.test(close.res.coachTurn.speech) && close.res.coachTurn.closedAtSoftCap === true && close.res.legState.legReady);
      const safe = safeTechniques("structure_and_clarity", STUDENT_LINE);
      const prevText = `x ${techniqueLine(safe[0])} y`;
      check("15e. bite: chooseTechnique overrides a request to repeat the last technique", chooseTechnique(safe, safe[0].id, [prevText])?.id !== safe[0].id);
      check("15e. bite: with no previous technique the same request is honoured", chooseTechnique(safe, safe[0].id, [])?.id === safe[0].id);
    }

    // 16. Q6 - the reaction must not pre-paraphrase the technique the app speaks
    {
      const s = await newSession();
      await turn(s, null, [OPEN]);
      const PARA = { ...INVITE, speech: "Next time, lead with your conclusion so it lands.", techniqueId: "structure-headline-first" } as Out;
      const r = await turn(s, say("I think it was about the project"), [PARA]);
      check("16. a reaction paraphrasing the chosen technique is rejected (REACTION_PARAPHRASES_TECHNIQUE)", r.rejected.length === 3 && r.rejected.every((x) => x === "REACTION_PARAPHRASES_TECHNIQUE"), r.rejected.join(","));
      const s2 = await newSession();
      await turn(s2, null, [OPEN]);
      const r2 = await turn(s2, say("I think it was about the project"), [{ ...PARA, speech: "You named the goal, but no example yet." } as Out]);
      check("16. bite: a plain reaction with the same technique passes", r2.rejected.length === 0);
      const s3 = await newSession();
      await turn(s3, null, [OPEN]);
      const r3 = await turn(s3, say("I think it was about the project"), [{ ...INVITE, speech: "Use a signpost as you move along.", techniqueId: "structure-signpost-transitions" } as Out]);
      const s4 = await newSession();
      await turn(s4, null, [OPEN]);
      const r4 = await turn(s4, say("I think it was about the project"), [{ ...INVITE, speech: "Put your headline up front this time.", techniqueId: "structure-signpost-transitions" } as Out]);
      check("16. a reaction hinting at a DIFFERENT technique than the one spoken is rejected too", r4.rejected.length === 3 && r4.rejected.every((x) => x === "REACTION_PARAPHRASES_TECHNIQUE"), r4.rejected.join(","));
      check("16. a reaction using the technique's distinctive name word ('signpost') is rejected", r3.rejected.length === 3 && r3.rejected.every((x) => x === "REACTION_PARAPHRASES_TECHNIQUE"), r3.rejected.join(","));
    }

    // 17. Demonstrations use only the student's facts (user decision, L7 Q2)
    {
      const { demonstrationTemplate } = await import("../lib/study-plan/coached/tips");
      const INVENTED: Out = { ...DEMONSTRATE, demonstration: "At Acme I led the Nimbus rollout, and it cut costs by 40% in 2 weeks." };
      const setup = async () => {
        const s = await newSession();
        await turn(s, null, [OPEN]);
        await turn(s, say("It was about the project"), [INVITE]);
        await turn(s, say("We finished the thing and it mostly went fine"), [INVITE]);
        await turn(s, say("We got through it in the end and the team was fine with that"), [INVITE]);
        return s; // the next weak attempt is miss 3, where the demonstration is due
      };
      const s = await setup();
      const r = await turn(s, say("Basically it worked out for the team after a while"), [INVENTED]);
      check("17a. a demonstration with invented names/numbers is rejected, regenerated once, then stops", r.calls === 2 && r.rejected.length === 2 && r.rejected.every((x) => x.startsWith("DEMONSTRATION_UNSUPPORTED_FACTS")), `calls=${r.calls} ${r.rejected.join(",")}`);
      check("17a. ...and the placeholder-template demonstration is delivered instead", r.res.coachTurn.move === "DEMONSTRATE" && r.res.coachTurn.demonstration === demonstrationTemplate("structure_and_clarity"));
      const s2 = await setup();
      const r2 = await turn(s2, say("At Acme I ran the Nimbus rollout, we cut costs by 40% in 2 weeks"), [INVENTED]);
      check("17b. bite: the same demonstration is accepted when the student said those facts", r2.rejected.length === 0 && r2.res.coachTurn.demonstration === INVENTED.demonstration);
      const s3 = await setup();
      const VAGUE_INVENT: Out = { ...DEMONSTRATE, demonstration: "One executive asked how the change might affect quarterly targets, so I explained our projections and the plan for temporary gaps." };
      const r3 = await turn(s3, say("Basically it worked out for the team after a while"), [VAGUE_INVENT]);
      check("17c. invented details with no name or number are caught by the content-share check, then the template", r3.rejected.length === 2 && r3.rejected.every((x) => x.includes("content")) && r3.res.coachTurn.demonstration === demonstrationTemplate("structure_and_clarity"), r3.rejected.join(","));
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
