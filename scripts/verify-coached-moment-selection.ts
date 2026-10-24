/**
 * Plan 22-07: coached moment selection battery. Uses a STUB scorer (no model
 * calls). Needs a live database; prints an explicit SKIP when DATABASE_URL is
 * unset.
 *
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *                npx tsx scripts/verify-coached-moment-selection.ts
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = resolve(__dirname, "..");
let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
    failures += 1;
  }
}

const GROWTH_AREA_FALLBACK = "GROWTH_AREA_FALLBACK";

async function main() {
  console.log("\nCoached moment selection (22-07)");
  if (!process.env.DATABASE_URL) {
    console.log("  SKIP DB section (no DATABASE_URL set)");
    return;
  }

  const { prisma } = await import("../lib/prisma");
  const { selectCoachedMoments, selectCoachedMomentsFromReports, NoQualifyingMomentError } =
    await import("../lib/study-plan/coached/moment-selection");
  const { TurnScoringFailedError } = await import("../lib/study-plan/coached/moment-scoring");
  type TurnScorer = import("../lib/study-plan/coached/moment-scoring").TurnScorer;
  const { isPleasantry } = await import("../lib/study-plan/coached/moment-ranking");
  const { initialProgress } = await import("../lib/interview/types");
  const { createPath } = await import("../lib/study-plan/path");
  const { selectPathSteps } = await import("../lib/study-plan/next-step");
  const { computeMastery } = await import("../lib/mastery/compute");
  const { loadCoachedEvidence } = await import("../lib/study-plan/coached/evidence");
  const { loadGenerationSources } = await import("../lib/study-plan/checks/sources");

  const COMP = "delivery_presence" as const;
  const COMP2 = "concision_and_focus" as const;
  const testId = randomUUID();
  let userId = "";
  let otherUserId = "";
  const reportIds: string[] = [];
  const studyPlanIds: string[] = [];
  const transcripts = new Map<string, unknown>();

  const NAME = "Pat Verifier";
  const T0 = 1_700_000_000_000;
  const mm = (k: number) => `0:${String(k * 10).padStart(2, "0")}`;

  const READY = "I'm ready to begin the interview.";
  const THANKS = "Thanks so much for your time today, it was lovely.";
  const SUB_A =
    "I told the team that the release would slip because we had not tested the payment flow properly.";
  const SUB_B =
    "Then I asked each owner to commit to a date and I wrote those dates in the shared channel.";
  const SUB_C =
    "After the review I explained my reasoning step by step so nobody was surprised by the decision.";

  type Spec = { role: "user" | "assistant"; text: string; growth?: boolean };

  async function makeReport(owner: string, specs: Spec[], scores: Record<string, number>) {
    const growth = specs
      .map((s, i) => (s.growth ? mm(i) : null))
      .filter((x): x is string => x !== null);
    const report = await prisma.interactionReport.create({
      data: {
        userId: owner,
        typeSlug: "general",
        status: "READY",
        turnCount: specs.length,
        transcriptKey: "stub-key",
        scores: scores as unknown as object,
        reportStructured: {
          overall_summary: "verify",
          strengths: [],
          growth_areas: [
            { title: "Verify growth", detail: "d", suggestion: "s", timecodes: growth, source: null, dimension: null },
          ],
          category_notes: { visual: null, vocal: null, content: null, behavioral: null },
          rubric_notes: [],
          practice_next: "verify",
        } as unknown as object,
      },
    });
    reportIds.push(report.id);
    transcripts.set(report.id, {
      version: 1 as const,
      reportId: report.id,
      userId: owner,
      typeSlug: "general",
      interviewer: { avatarId: null, name: null },
      startedAt: T0,
      updatedAt: T0 + 1000,
      turns: specs.map((s, i) => ({ role: s.role, content: s.text, timestamp: T0 + i * 10_000 })),
      progress: initialProgress(),
    });
    return report.id;
  }

  const readTranscript = async (_u: string, reportId: string) => {
    const t = transcripts.get(reportId);
    if (!t) throw new Error("no transcript");
    return t as never;
  };

  const A = (text: string): Spec => ({ role: "assistant", text });
  const U = (text: string, growth = false): Spec => ({ role: "user", text, growth });

  interface Stub {
    scorer: TurnScorer;
    received: string[];
    calls: number;
  }
  function stub(
    scoreFor: (text: string, competencyKey: string) => { evidences: boolean; score: number | null },
  ): Stub {
    const s: Stub = {
      received: [],
      calls: 0,
      scorer: async ({ competencyKey, turns }) => {
        s.calls += 1;
        return turns.map((t) => {
          s.received.push(t.studentText);
          const r = scoreFor(t.studentText, competencyKey);
          return {
            turnIndex: t.turnIndex,
            evidencesCompetency: r.evidences,
            score: r.evidences ? r.score : null,
            rationale: "stub",
          };
        });
      },
    };
    return s;
  }

  try {
    const user = await prisma.user.create({
      data: { email: `sel-verify-${testId}@example.com`, name: NAME, role: "STUDENT" },
    });
    userId = user.id;
    const other = await prisma.user.create({
      data: { email: `sel-verify-other-${testId}@example.com`, name: "Other Person", role: "STUDENT" },
    });
    otherUserId = other.id;

    const SC = { visual: 2, concision: 3 };

    // ---- Base report R1: pleasantry first turn, two substantive, pleasantry last.
    const R1 = await makeReport(
      userId,
      [A("Tell me about a conflict."), U(READY), A("Great, go on."), U(SUB_A, true), A("And then?"), U(SUB_B), A("Thanks."), U(THANKS)],
      SC,
    );
    const baseScores = (text: string) =>
      text === SUB_A
        ? { evidences: true, score: 2 }
        : text === SUB_B
          ? { evidences: true, score: 4 }
          : text === SUB_C
            ? { evidences: true, score: 3 }
            : { evidences: true, score: 1 }; // pleasantries would score LOWEST if ever sent

    // 1. Pleasantry never sent; replay is the lowest substantive turn.
    const s1 = stub(baseScores);
    const sel1 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R1], competencyKey: COMP },
      { scorer: s1.scorer, readTranscript },
    );
    check("1. replay is the lowest-scored substantive turn (not turn 1)", sel1.replay.turnIndex === 3 && sel1.replay.studentText === SUB_A);
    check("1b. pleasantries were never sent to the scorer", !s1.received.includes(READY) && !s1.received.includes(THANKS));
    check("1c. basis PER_TURN_SCORE, framing REWORK", sel1.basis === "PER_TURN_SCORE" && sel1.replay.framing === "REWORK");

    // 2. Determinism + cache.
    const s2 = stub(baseScores);
    const sel2 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R1], competencyKey: COMP },
      { scorer: s2.scorer, readTranscript },
    );
    check("2. second call returns identical selection", JSON.stringify(sel1) === JSON.stringify(sel2));
    check("2b. second call makes ZERO scorer calls (cache)", s2.calls === 0);
    const dupes = await prisma.momentCompetencyScore.groupBy({
      by: ["reportId", "turnIndex", "competencyKey"],
      where: { reportId: R1 },
      _count: true,
    });
    check("2c. no turn scored twice", dupes.every((d) => d._count === 1));

    // 3. Fresh from the other report; one qualifying -> null.
    const R2 = await makeReport(userId, [A("Another."), U(SUB_C, true)], SC);
    const sel3 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R1, R2], competencyKey: COMP },
      { scorer: stub(baseScores).scorer, readTranscript },
    );
    check("3. fresh comes from the other report", sel3.fresh !== null && sel3.fresh.reportId === R2 && sel3.replay.reportId === R1);
    const R3 = await makeReport(userId, [A("Q."), U(READY), A("Q2"), U(SUB_C)], SC);
    const sel3b = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R3], competencyKey: COMP },
      { scorer: stub(baseScores).scorer, readTranscript },
    );
    check("3b. one qualifying turn -> fresh is null (thin evidence)", sel3b.fresh === null && sel3b.replay.studentText === SUB_C);

    // 4. Always-failing scorer -> recorded fallback.
    const R4 = await makeReport(userId, [A("Q."), U(READY), A("Q2"), U(SUB_A, true), A("Q3"), U(SUB_B)], SC);
    const failing: TurnScorer = async () => {
      throw new TurnScoringFailedError("stub failure");
    };
    const origWarn = console.warn;
    console.warn = () => {};
    const sel4 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R4], competencyKey: COMP },
      { scorer: failing, readTranscript },
    );
    console.warn = origWarn;
    check("4. all scoring failed -> basis GROWTH_AREA_FALLBACK", sel4.basis === GROWTH_AREA_FALLBACK);
    check("4b. fallback moment is the one with a linked growth area", sel4.replay.turnIndex === 3);

    // 5. Foreign report contributes nothing.
    const RF = await makeReport(otherUserId, [A("Q."), U(SUB_A, true)], SC);
    let foreignThrew = false;
    try {
      await selectCoachedMomentsFromReports(
        { userId, reportIds: [RF], competencyKey: COMP },
        { scorer: stub(baseScores).scorer, readTranscript },
      );
    } catch (e) {
      foreignThrew = e instanceof NoQualifyingMomentError;
    }
    check("5. another user's report alone -> NoQualifyingMomentError", foreignThrew);
    const sel5 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R1, RF], competencyKey: COMP },
      { scorer: stub(baseScores).scorer, readTranscript },
    );
    check("5b. foreign report never supplies a moment", sel5.replay.reportId !== RF && (sel5.fresh?.reportId ?? "") !== RF);

    // 6. PII / self-name turns never scored or selected.
    const NAME_TURN = `${NAME} here, and I told the team that the release would slip because testing was incomplete.`;
    const EMAIL_TURN =
      "You can reach me at pat.verifier@example.com and I will confirm the plan with every single owner today.";
    const R5 = await makeReport(userId, [A("Q."), U(NAME_TURN), A("Q2"), U(EMAIL_TURN), A("Q3"), U(SUB_C)], SC);
    const s6 = stub((t) => (t === SUB_C ? { evidences: true, score: 3 } : { evidences: true, score: 1 }));
    const sel6 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R5], competencyKey: COMP },
      { scorer: s6.scorer, readTranscript },
    );
    check("6. self-name and email turns never sent to the scorer", !s6.received.includes(NAME_TURN) && !s6.received.includes(EMAIL_TURN));
    check("6b. neither is selected", sel6.replay.studentText === SUB_C && sel6.fresh === null);

    // 7. No qualifying moment.
    const R6 = await makeReport(userId, [A("Q."), U(READY), A("Q2"), U("Yes, sounds good to me."), A("Q3"), U(THANKS)], SC);
    let t7 = false;
    try {
      await selectCoachedMomentsFromReports(
        { userId, reportIds: [R6], competencyKey: COMP },
        { scorer: stub(baseScores).scorer, readTranscript },
      );
    } catch (e) {
      t7 = e instanceof NoQualifyingMomentError;
    }
    check("7. all pleasantries -> NoQualifyingMomentError", t7);
    const R7 = await makeReport(userId, [A("Q."), U(SUB_A, true), A("Q2"), U(SUB_B)], SC);
    let t7b = false;
    try {
      await selectCoachedMomentsFromReports(
        { userId, reportIds: [R7], competencyKey: COMP },
        { scorer: stub(() => ({ evidences: false, score: null })).scorer, readTranscript },
      );
    } catch (e) {
      t7b = e instanceof NoQualifyingMomentError;
    }
    check("7b. substantive but not evidencing -> NoQualifyingMomentError", t7b);

    // 8. ALL HIGH scores -> still selected, REFINEMENT.
    const R8 = await makeReport(userId, [A("Q."), U(SUB_A, true), A("Q2"), U(SUB_B), A("Q3"), U(SUB_C)], SC);
    const sel8 = await selectCoachedMomentsFromReports(
      { userId, reportIds: [R8], competencyKey: COMP },
      { scorer: stub((t) => (t === SUB_B ? { evidences: true, score: 5 } : { evidences: true, score: 4 })).scorer, readTranscript },
    );
    check("8. all-high: replay is the 4, framed REFINEMENT, no error", sel8.replay.score === 4 && sel8.replay.framing === "REFINEMENT");

    // 9. Bite-proof: the Phase 21 rule (first user turn) is caught by assertion 1.
    const t1 = transcripts.get(R1) as { turns: Array<{ role: string; content: string }> };
    const naiveIdx = t1.turns.findIndex((t) => t.role === "user");
    const naive = { turnIndex: naiveIdx, studentText: t1.turns[naiveIdx].content };
    const assertion1 = (m: { turnIndex: number; studentText: string }) =>
      m.turnIndex === 3 && m.studentText === SUB_A && !isPleasantry(m.studentText, "FIRST");
    check("9. bite-proof: assertion passes the real selector", assertion1(sel1.replay));
    check("9b. bite-proof: Phase 21 first-user-turn selector is CAUGHT", !assertion1(naive));

    // ---- Task 3 section marker (placement guard) is appended below.
    await placementSection();

    async function placementSection() {
      console.log("\nPlacement guard (shared predicate)");
      const route = readFileSync(join(ROOT, "app/api/study-plans/[planId]/path/route.ts"), "utf8");
      check("P0. route calls selectCoachedMomentsFromReports(", /selectCoachedMomentsFromReports\(/.test(route));
      check("P0b. route handles NoQualifyingMomentError", /NoQualifyingMomentError/.test(route));

      // Mirrors the route's walk: first qualifying competency in ranking order.
      async function place(reportsForPlan: string[], scorer: TurnScorer) {
        const sources = await loadGenerationSources(userId, reportsForPlan, { readTranscript });
        const evidence = await loadCoachedEvidence(userId, reportsForPlan);
        const interim = new Map(
          Array.from(evidence.entries()).filter(([k]) => sources.momentsByCompetency.has(k)),
        );
        const mastery = computeMastery([], new Date());
        const unavailable = mastery.competencies
          .map((c) => c.competencyKey)
          .filter((k) => !sources.momentsByCompetency.has(k));
        const first = selectPathSteps({ mastery, desiredCount: 7, unavailableCompetencies: unavailable, coachedEvidence: interim });
        const order = first.ranking.map((r) => r.competencyKey).filter((k) => interim.has(k));
        let placed: typeof COMP | null = null;
        for (const k of order) {
          try {
            await selectCoachedMomentsFromReports(
              { userId, reportIds: reportsForPlan, competencyKey: k },
              { scorer, readTranscript },
            );
            placed = k as typeof COMP;
            break;
          } catch (e) {
            if (!(e instanceof NoQualifyingMomentError)) throw e;
          }
        }
        const qualified = placed ? new Map([[placed, interim.get(placed)!]]) : new Map();
        const second = selectPathSteps({ mastery, desiredCount: 7, unavailableCompetencies: unavailable, coachedEvidence: qualified });
        return { order, placed, second };
      }

      const RP = await makeReport(userId, [A("Q."), U(SUB_A, true), A("Q2"), U(SUB_B, true)], SC);
      const probe = await place([RP], stub(() => ({ evidences: true, score: 3 })).scorer);
      check("P1. probe sees both competencies as interim candidates", probe.order.length >= 2, `order=${probe.order.join(",")}`);
      const [k1, k2] = probe.order;

      // (a) k1 never evidences -> not placed; k2 is.
      const sa = stub((_t, key) => (key === k1 ? { evidences: false, score: null } : { evidences: true, score: 2 }));
      // Fresh report: RP's scores for both competencies are already cached by the probe.
      const RPa = await makeReport(userId, [A("Q."), U(SUB_A, true), A("Q2"), U(SUB_B, true)], SC);
      const a = await place([RPa], sa.scorer);
      check("P2a. non-evidencing competency NOT placed; next qualifying one is", a.placed === k2 && a.second.steps.some((s) => s.kind === "COACHED_SESSION" && s.competencyKey === k2) && !a.second.steps.some((s) => s.kind === "COACHED_SESSION" && s.competencyKey === k1));

      // (b) all-high on k1 -> placed.
      const RP2 = await makeReport(userId, [A("Q."), U(SUB_A, true), A("Q2"), U(SUB_B, true)], SC);
      const sb = stub(() => ({ evidences: true, score: 5 }));
      const b = await place([RP2], sb.scorer);
      check("P2b. all-high competency IS placed (refinement still runs)", b.placed === b.order[0] && b.second.coachedOmitted === false);

      // (c) after placement, entry's selection is identical with zero new scorer calls.
      const plan = await prisma.studyPlan.create({
        data: {
          userId,
          title: "Selection Verify Plan",
          content: { priorityThemes: [] } as unknown as object,
          sourceReportIds: [RP2] as unknown as object,
          sourceReportCount: 1,
          generationModel: "verify-stub",
          draftTokenId: randomUUID(),
        },
      });
      studyPlanIds.push(plan.id);
      const placedKey = b.placed!;
      const steps = [1, 2, 3, 4, 5].map((position) => ({
        position,
        kind: position === 1 ? ("COACHED_SESSION" as const) : ("UNAIDED_SESSION" as const),
        competencyKey: placedKey,
        selectionReason: "verify-coached-moment-selection",
        knowledgeCheckId: null,
        coachedSessionId: null,
      }));
      const path = await createPath({ userId, studyPlanId: plan.id, steps, selectionSnapshot: { note: "verify" } });
      const step = path.steps.find((s) => s.kind === "COACHED_SESSION")!;
      const sc = stub(() => ({ evidences: true, score: 5 }));
      const entry = await selectCoachedMoments(
        { userId, pathStepId: step.id, competencyKey: placedKey },
        { scorer: sc.scorer, readTranscript },
      );
      const replayed = await selectCoachedMomentsFromReports(
        { userId, reportIds: [RP2], competencyKey: placedKey },
        { scorer: sc.scorer, readTranscript },
      );
      check("P2c. entry returns the same replay moment as placement did, zero new scorer calls", sc.calls === 0 && entry.replay.turnIndex === replayed.replay.turnIndex && entry.replay.reportId === RP2);
      let foreign = false;
      try {
        await selectCoachedMoments(
          { userId: otherUserId, pathStepId: step.id, competencyKey: placedKey },
          { scorer: sc.scorer, readTranscript },
        );
      } catch (e) {
        foreign = e instanceof NoQualifyingMomentError;
      }
      check("P3. another user cannot select via this step", foreign);
    }
  } finally {
    await prisma.momentCompetencyScore.deleteMany({ where: { reportId: { in: reportIds } } });
    if (studyPlanIds.length) {
      await prisma.studyPlanPath.deleteMany({ where: { studyPlanId: { in: studyPlanIds } } });
      await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    }
    if (reportIds.length) await prisma.interactionReport.deleteMany({ where: { id: { in: reportIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.log(`\n${failures} check(s) FAILED`);
      process.exit(1);
    }
    console.log("\nAll checks passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
