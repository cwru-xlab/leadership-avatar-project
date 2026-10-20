/**
 * Proves plan 21-14's weakest-first, deterministic, explainable step
 * selection: `selectPathSteps()` and `nextStepFor()`.
 *
 * Builds `MasteryResult` literals directly (no database, no clock, no model
 * call) and feeds `selectPathSteps`/`nextStepFor`. Also calls 21-08's real
 * `validatePathSteps` against every emitted step list, so the two plans'
 * contracts are proven to meet rather than assumed to.
 *
 * Run: npx tsx scripts/verify-next-step.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import {
  selectPathSteps,
  nextStepFor,
  TIE_BREAK_ORDER,
  type StepSelection,
} from "../lib/study-plan/next-step";
import { validatePathSteps, type PathWithSteps } from "../lib/study-plan/path";
import { COMPETENCIES, type CompetencyKey } from "../lib/mastery/competencies";
import type { CompetencyMastery, MasteryResult } from "../lib/mastery/compute";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const ALL_KEYS = COMPETENCIES.map((c) => c.key) as CompetencyKey[];
const NOW = new Date("2026-10-16T12:00:00Z");
const WINDOW_START = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);

function blank(
  key: CompetencyKey,
  overrides: Partial<CompetencyMastery> = {}
): CompetencyMastery {
  return {
    competencyKey: key,
    lifetimePercent: null,
    currentPercent: null,
    lifetimeEvidenceCount: 0,
    currentEvidenceCount: 0,
    lifetimeWeightSum: 0,
    currentWeightSum: 0,
    lastContributionAt: null,
    ...overrides,
  };
}

/** A fully-evidenced (ESTABLISHED tier) competency at a given percent. */
function established(key: CompetencyKey, percent: number): CompetencyMastery {
  return blank(key, {
    lifetimePercent: percent,
    currentPercent: percent,
    lifetimeEvidenceCount: 8,
    currentEvidenceCount: 8,
    lifetimeWeightSum: 8.0,
    currentWeightSum: 8.0,
    lastContributionAt: NOW,
  });
}

function resultWith(competencies: CompetencyMastery[]): MasteryResult {
  return {
    competencies,
    overallLifetimePercent: null,
    overallCurrentPercent: null,
    windowStart: WINDOW_START,
    windowDays: 30,
    unmappedRowCount: 0,
  };
}

function shuffled<T>(arr: T[]): T[] {
  const copy = arr.slice();
  // Fixed, deterministic "shuffle" (reverse + rotate) — no Math.random, so
  // this script itself stays reproducible across runs.
  copy.reverse();
  const rotated = [...copy.slice(1), copy[0]];
  return rotated;
}

function stepFor(selection: StepSelection, kind: string) {
  return selection.steps.find((s) => s.kind === kind);
}

console.log("\n1. SINGLE WEAKEST");
{
  const competencies = [
    established(ALL_KEYS[0], 80),
    established(ALL_KEYS[1], 80),
    established(ALL_KEYS[2], 80),
    established(ALL_KEYS[3], 30),
    established(ALL_KEYS[4], 80),
    established(ALL_KEYS[5], 80),
    established(ALL_KEYS[6], 80),
  ];
  const mastery = resultWith(competencies);
  const selection = selectPathSteps({ mastery, desiredCount: 7 });

  check(
    "rank 1 is the 30% competency",
    selection.ranking[0].competencyKey === ALL_KEYS[3],
    JSON.stringify(selection.ranking[0])
  );

  const coached = selection.steps.find((s) => s.kind === "COACHED_SESSION");
  check(
    "the 30% competency gets the COACHED_SESSION",
    coached?.competencyKey === ALL_KEYS[3]
  );

  const last = selection.steps[selection.steps.length - 1];
  check(
    "final step is UNAIDED_SESSION on the 30% competency",
    last.kind === "UNAIDED_SESSION" && last.competencyKey === ALL_KEYS[3]
  );
}

console.log("\n2. ALL NULL");
{
  const competencies = ALL_KEYS.map((k) => blank(k));
  const mastery = resultWith(competencies);
  const selection = selectPathSteps({ mastery, desiredCount: 7 });

  check(
    "ranking follows TIE_BREAK_ORDER exactly",
    selection.ranking.every((r, i) => r.competencyKey === TIE_BREAK_ORDER[i]),
    JSON.stringify(selection.ranking.map((r) => r.competencyKey))
  );

  check(
    "every reason string says 'no scored evidence yet'",
    selection.ranking.every((r) => r.reason.includes("no scored evidence yet")),
    JSON.stringify(selection.ranking.map((r) => r.reason))
  );
}

console.log("\n3. NULL BEATS MEASURED");
{
  const measuredKey = ALL_KEYS[0];
  const nullKey = ALL_KEYS[1];
  const competencies = [
    blank(measuredKey, {
      lifetimePercent: 2,
      currentPercent: 2,
      lifetimeEvidenceCount: 3,
      currentEvidenceCount: 3,
      lifetimeWeightSum: 3.0,
      currentWeightSum: 3.0,
      lastContributionAt: NOW,
    }),
    blank(nullKey),
    ...ALL_KEYS.slice(2).map((k) => established(k, 90)),
  ];
  const mastery = resultWith(competencies);
  const selection = selectPathSteps({ mastery, desiredCount: 7 });

  check(
    "the unmeasured competency ranks first",
    selection.ranking[0].competencyKey === nullKey,
    JSON.stringify(selection.ranking[0])
  );

  const measuredReason = selection.ranking.find(
    (r) => r.competencyKey === measuredKey
  )!.reason;
  const nullReason = selection.ranking.find(
    (r) => r.competencyKey === nullKey
  )!.reason;
  check(
    "the two reason strings differ in kind (null not coerced to 0)",
    measuredReason !== nullReason &&
      nullReason.includes("no scored evidence yet") &&
      !measuredReason.includes("no scored evidence yet"),
    `measured: ${measuredReason}\n         null: ${nullReason}`
  );
}

console.log("\n4. EXACT TIE + DETERMINISM UNDER SHUFFLE");
{
  const tiedA = ALL_KEYS[2];
  const tiedB = ALL_KEYS[5];
  const competencies = [
    established(tiedA, 50),
    established(tiedB, 50),
    ...ALL_KEYS.filter((k) => k !== tiedA && k !== tiedB).map((k) =>
      established(k, 90)
    ),
  ];
  const mastery = resultWith(competencies);
  const selection = selectPathSteps({ mastery, desiredCount: 7 });

  const tieBreakIndexA = TIE_BREAK_ORDER.indexOf(tiedA);
  const tieBreakIndexB = TIE_BREAK_ORDER.indexOf(tiedB);
  const expectedFirst = tieBreakIndexA < tieBreakIndexB ? tiedA : tiedB;
  const rankedTied = selection.ranking.filter(
    (r) => r.competencyKey === tiedA || r.competencyKey === tiedB
  );
  check(
    "tied pair ordered by TIE_BREAK_ORDER",
    rankedTied[0].competencyKey === expectedFirst,
    JSON.stringify(rankedTied)
  );

  const shuffledMastery = resultWith(shuffled(competencies));
  const shuffledSelection = selectPathSteps({
    mastery: shuffledMastery,
    desiredCount: 7,
  });
  check(
    "shuffled input produces an identical ranking",
    JSON.stringify(shuffledSelection.ranking) ===
      JSON.stringify(selection.ranking)
  );
  check(
    "shuffled input produces identical steps",
    JSON.stringify(shuffledSelection.steps) === JSON.stringify(selection.steps)
  );
}

console.log("\n5. DETERMINISM — same input, two calls");
{
  const competencies = [
    established(ALL_KEYS[0], 40),
    ...ALL_KEYS.slice(1).map((k) => established(k, 70)),
  ];
  const mastery = resultWith(competencies);
  const first = selectPathSteps({ mastery, desiredCount: 6 });
  const second = selectPathSteps({ mastery, desiredCount: 6 });
  check(
    "two calls on the same input deep-equal, including reasons",
    JSON.stringify(first) === JSON.stringify(second)
  );
}

console.log("\n6. BOUNDS");
{
  const competencies = ALL_KEYS.map((k, i) => established(k, 50 + i));
  const mastery = resultWith(competencies);

  const low = selectPathSteps({ mastery, desiredCount: 2 });
  check("desiredCount 2 clamps to 5 steps", low.steps.length === 5);

  const high = selectPathSteps({ mastery, desiredCount: 40 });
  check("desiredCount 40 clamps to 10 steps", high.steps.length === 10);

  const exact = selectPathSteps({ mastery, desiredCount: 7 });
  check("desiredCount 7 stays 7", exact.steps.length === 7);

  for (const [label, selection] of [
    ["low", low],
    ["high", high],
    ["exact", exact],
  ] as const) {
    const positions = selection.steps.map((s) => s.position);
    const contiguous = positions.every((p, i) => p === i + 1);
    check(`${label}: positions contiguous from 1`, contiguous, JSON.stringify(positions));

    const violations = validatePathSteps(selection.steps);
    check(
      `${label}: accepted by validatePathSteps`,
      violations.length === 0,
      JSON.stringify(violations)
    );
  }
}

console.log("\n7. UNAVAILABLE");
{
  const weakest = ALL_KEYS[0];
  const competencies = [
    established(weakest, 10),
    ...ALL_KEYS.slice(1).map((k) => established(k, 70)),
  ];
  const mastery = resultWith(competencies);
  const selection = selectPathSteps({
    mastery,
    desiredCount: 7,
    unavailableCompetencies: [weakest],
  });

  const hostsNoKnowledgeCheck = !selection.steps.some(
    (s) => s.kind === "KNOWLEDGE_CHECK" && s.competencyKey === weakest
  );
  const hostsNoCoachedSession = !selection.steps.some(
    (s) => s.kind === "COACHED_SESSION" && s.competencyKey === weakest
  );
  check("unavailable weakest hosts no KNOWLEDGE_CHECK", hostsNoKnowledgeCheck);
  check("unavailable weakest hosts no COACHED_SESSION", hostsNoCoachedSession);

  check(
    "result is still a valid 5-10 step list",
    selection.steps.length >= 5 && selection.steps.length <= 10
  );
  check(
    "result still accepted by validatePathSteps",
    validatePathSteps(selection.steps).length === 0,
    JSON.stringify(validatePathSteps(selection.steps))
  );

  const last = selection.steps[selection.steps.length - 1];
  check(
    "final transfer-test step is still on the true weakest competency",
    last.kind === "UNAIDED_SESSION" && last.competencyKey === weakest
  );
}

console.log("\n8. SMALL CATALOG (synthetic 3-competency result)");
{
  const synthetic = [
    established(ALL_KEYS[0], 20),
    established(ALL_KEYS[1], 50),
    established(ALL_KEYS[2], 80),
  ];
  const mastery = resultWith(synthetic);
  const selection = selectPathSteps({ mastery, desiredCount: 5 });

  check("still produces at least 5 steps", selection.steps.length >= 5);
  check(
    "repeats the weakest competencies to reach the minimum",
    selection.steps.filter((s) => s.competencyKey === ALL_KEYS[0]).length > 1
  );
  check(
    "still passes validatePathSteps",
    validatePathSteps(selection.steps).length === 0,
    JSON.stringify(validatePathSteps(selection.steps))
  );
}

console.log("\n9. REASON QUALITY");
{
  const competencies = [
    established(ALL_KEYS[0], 15),
    blank(ALL_KEYS[1]),
    ...ALL_KEYS.slice(2).map((k) => established(k, 60)),
  ];
  const mastery = resultWith(competencies);
  const selection = selectPathSteps({ mastery, desiredCount: 7 });

  for (const r of selection.ranking) {
    const label = COMPETENCIES.find((c) => c.key === r.competencyKey)!.label;
    check(
      `${r.competencyKey}: reason contains the competency label`,
      r.reason.includes(label)
    );
    check(
      `${r.competencyKey}: reason is at least 40 characters`,
      r.reason.length >= 40,
      r.reason
    );
    if (r.currentPercent !== null || r.lifetimePercent !== null) {
      check(
        `${r.competencyKey}: non-null figure reason contains a percent sign`,
        r.reason.includes("%"),
        r.reason
      );
    }
  }
}

console.log("\n10. nextStepFor");
{
  function fakePath(
    steps: Array<{ position: number; status: string; selectionReason: string }>
  ): PathWithSteps {
    return {
      id: "path-1",
      studyPlanId: "plan-1",
      userId: "user-1",
      generatedAt: NOW,
      selectionSnapshot: {},
      steps: steps.map((s, i) => ({
        id: `step-${i + 1}`,
        pathId: "path-1",
        position: s.position,
        kind: "KNOWLEDGE_CHECK",
        competencyKey: ALL_KEYS[0],
        selectionReason: s.selectionReason,
        knowledgeCheckId: "check-1",
        coachedSessionId: null,
        status: s.status,
        completedAt: null,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as PathWithSteps;
  }

  const allPending = fakePath([
    { position: 1, status: "PENDING", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "PENDING", selectionReason: "SENTINEL-TWO" },
  ]);
  const r1 = nextStepFor(allPending);
  check(
    "all-pending: returns position 1 with its stored reason",
    r1?.step.position === 1 && r1.reason === "SENTINEL-ONE"
  );

  const firstDone = fakePath([
    { position: 1, status: "COMPLETE", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "PENDING", selectionReason: "SENTINEL-TWO" },
  ]);
  const r2 = nextStepFor(firstDone);
  check(
    "position 1 COMPLETE, 2 PENDING -> returns 2",
    r2?.step.position === 2 && r2.reason === "SENTINEL-TWO"
  );

  const outOfOrder = fakePath([
    { position: 1, status: "PENDING", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "COMPLETE", selectionReason: "SENTINEL-TWO" },
  ]);
  const r3 = nextStepFor(outOfOrder);
  check(
    "position 1 PENDING, 2 COMPLETE -> returns 1 (does not advance past a pending step)",
    r3?.step.position === 1 && r3.reason === "SENTINEL-ONE"
  );

  const allComplete = fakePath([
    { position: 1, status: "COMPLETE", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "COMPLETE", selectionReason: "SENTINEL-TWO" },
  ]);
  const r4 = nextStepFor(allComplete);
  check("all complete -> null", r4 === null);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
