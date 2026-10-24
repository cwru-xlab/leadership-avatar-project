/**
 * Proves the coached moment ranking is pure and deterministic: the pleasantry
 * filter works on position AND content (the observed failure line "I'm ready
 * to begin the interview." can never be selected), the lowest-scored
 * qualifying turn wins with no score cutoff (high scores are REFINEMENT, not
 * dropped), and a second moment exists only when a distinct one does.
 *
 * Run: npx tsx scripts/verify-coached-moment-ranking.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import {
  isPleasantry,
  isQualifyingMoment,
  rankCoachedMoments,
  rankCoachedMomentsByGrowthArea,
  type RankableMoment,
  type TurnPosition,
} from "../lib/study-plan/coached/moment-ranking";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const READY = "I'm ready to begin the interview.";
const SUBSTANTIVE =
  "I reorganised the backlog so that the two squads stopped blocking each other on releases and delivery improved.";

function mk(o: Partial<RankableMoment> & { turnIndex: number }): RankableMoment {
  return {
    reportId: "A",
    studentText: SUBSTANTIVE,
    position: "MIDDLE",
    reportCreatedAt: new Date("2026-10-01T00:00:00Z"),
    linkedGrowthAreaCount: 0,
    evidencesCompetency: true,
    score: 3,
    ...o,
  };
}

// 1-5: pleasantry filter
console.log("pleasantry filter");
check("1a ready line FIRST", isPleasantry(READY, "FIRST"));
check("1b ready line MIDDLE (content alone)", isPleasantry(READY, "MIDDLE"));
check("2 greeting MIDDLE", isPleasantry("Hi, nice to meet you.", "MIDDLE"));
check(
  "3 greeting + substantive FIRST is eligible",
  !isPleasantry(
    "Hi, nice to meet you. In my last role I led a twelve-person team through a reorganisation that cut our release cycle in half.",
    "FIRST"
  )
);
check("4 thanks MIDDLE", isPleasantry("Thanks, that's great.", "MIDDLE"));
const TEN = "We shipped the redesign early because the team owned scoping.";
check("5a 10 words FIRST excluded", isPleasantry(TEN, "FIRST"));
check("5b 10 words MIDDLE eligible", !isPleasantry(TEN, "MIDDLE"));

// 6-13: ranking
console.log("ranking");
const r6 = rankCoachedMoments([
  mk({ turnIndex: 0, studentText: READY, position: "FIRST", score: 1 }),
  mk({ turnIndex: 2, score: 3 }),
]);
check(
  "6 ready line scored 1 is rejected PLEASANTRY and not replay",
  r6.replay?.turnIndex === 2 &&
    r6.rejected.some((x) => x.moment.turnIndex === 0 && x.reason === "PLEASANTRY")
);

const r7 = rankCoachedMoments([
  mk({ turnIndex: 1, score: 3 }),
  mk({ turnIndex: 2, score: 2 }),
  mk({ turnIndex: 3, score: 5 }),
  mk({ turnIndex: 4, score: null, evidencesCompetency: null }),
  mk({ turnIndex: 5, score: null, evidencesCompetency: false }),
]);
check("7 replay is the 2", r7.replay?.score === 2);
check("7 fresh is the 3", r7.fresh?.score === 3);
check(
  "7 the 5 is a survivor, not rejected",
  !r7.rejected.some((x) => x.moment.score === 5)
);
check(
  "7 unscored and not-evidencing carry reasons",
  r7.rejected.some((x) => x.moment.turnIndex === 4 && x.reason === "UNSCORED") &&
    r7.rejected.some((x) => x.moment.turnIndex === 5 && x.reason === "NOT_EVIDENCING")
);
check("7 replayFraming REWORK", r7.replayFraming === "REWORK");

const r7b = rankCoachedMoments([mk({ turnIndex: 1, score: 5 }), mk({ turnIndex: 2, score: 4 })]);
check(
  "7b all-high: replay 4 REFINEMENT, fresh 5 REFINEMENT, none rejected",
  r7b.replay?.score === 4 &&
    r7b.replayFraming === "REFINEMENT" &&
    r7b.fresh?.score === 5 &&
    r7b.freshFraming === "REFINEMENT" &&
    r7b.rejected.length === 0
);

check(
  "7c isQualifyingMoment",
  !isQualifyingMoment(mk({ turnIndex: 1, studentText: READY, position: "FIRST" })) &&
    !isQualifyingMoment(mk({ turnIndex: 1, score: null, evidencesCompetency: null })) &&
    !isQualifyingMoment(mk({ turnIndex: 1, score: null, evidencesCompetency: false })) &&
    isQualifyingMoment(mk({ turnIndex: 1, score: 5 }))
);

const r8 = rankCoachedMoments([mk({ turnIndex: 1, score: 2 })]);
check("8 single qualifying -> fresh null", r8.replay !== null && r8.fresh === null && r8.freshFraming === null);

const r9 = rankCoachedMoments([
  mk({ reportId: "A", turnIndex: 1, score: 1 }),
  mk({ reportId: "A", turnIndex: 2, score: 2 }),
  mk({ reportId: "B", turnIndex: 1, score: 3 }),
]);
check(
  "9 different report preferred for fresh",
  r9.replay?.reportId === "A" && r9.replay.score === 1 && r9.fresh?.reportId === "B"
);

const r9b = rankCoachedMoments([
  mk({ reportId: "A", turnIndex: 1, score: 1 }),
  mk({ reportId: "A", turnIndex: 2, score: 2 }),
]);
check("9b same-report fallback for fresh", r9b.fresh?.turnIndex === 2);

const t1 = rankCoachedMoments([
  mk({ reportId: "A", turnIndex: 1, score: 2, linkedGrowthAreaCount: 1 }),
  mk({ reportId: "B", turnIndex: 1, score: 2, linkedGrowthAreaCount: 3 }),
]);
check("10a tie: more growth areas wins", t1.replay?.reportId === "B");
const t2 = rankCoachedMoments([
  mk({ reportId: "A", turnIndex: 1, score: 2, reportCreatedAt: new Date("2026-09-01T00:00:00Z") }),
  mk({ reportId: "B", turnIndex: 1, score: 2, reportCreatedAt: new Date("2026-10-01T00:00:00Z") }),
]);
check("10b tie: more recent report wins", t2.replay?.reportId === "B");
const t3 = rankCoachedMoments([
  mk({ reportId: "A", turnIndex: 5, score: 2 }),
  mk({ reportId: "A", turnIndex: 3, score: 2 }),
]);
check("10c tie: lower turnIndex wins", t3.replay?.turnIndex === 3);

const base = [
  mk({ reportId: "A", turnIndex: 1, score: 2 }),
  mk({ reportId: "B", turnIndex: 4, score: 2, linkedGrowthAreaCount: 1 }),
  mk({ reportId: "C", turnIndex: 2, score: 4 }),
  mk({ reportId: "A", turnIndex: 6, score: 3 }),
];
const perms = [
  [base[3], base[2], base[1], base[0]],
  [base[1], base[3], base[0], base[2]],
  [base[2], base[0], base[3], base[1]],
];
const ref = rankCoachedMoments(base);
check(
  "11 order independence",
  perms.every((p) => {
    const r = rankCoachedMoments(p);
    return (
      JSON.stringify([r.replay, r.fresh]) === JSON.stringify([ref.replay, ref.fresh])
    );
  })
);

const padded = "  " + SUBSTANTIVE + "  ";
const r12 = rankCoachedMoments([mk({ turnIndex: 1, studentText: padded, score: 2 })]);
check("12 studentText untrimmed", r12.replay?.studentText === padded);

const g = rankCoachedMomentsByGrowthArea([
  mk({ turnIndex: 1, linkedGrowthAreaCount: 0, score: null, evidencesCompetency: null }),
  mk({ turnIndex: 0, studentText: READY, position: "FIRST", linkedGrowthAreaCount: 2 }),
  mk({ turnIndex: 3, linkedGrowthAreaCount: 1, score: null, evidencesCompetency: null }),
]);
check(
  "13 growth-area basis: zero-area never selected, pleasantry rejected",
  g.replay?.turnIndex === 3 &&
    g.fresh === null &&
    g.rejected.some((x) => x.moment.turnIndex === 0 && x.reason === "PLEASANTRY")
);

// Bite proof: a position-only filter must be caught by the cases above.
console.log("bite-proof");
const positionOnly = (_t: string, p: TurnPosition) => p === "FIRST";
check(
  "position-only variant is caught",
  positionOnly(READY, "MIDDLE") === false && positionOnly("Thanks, that's great.", "MIDDLE") === false
);

if (failures > 0) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
