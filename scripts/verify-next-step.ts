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
  reasonForDegradedCheck,
  TIE_BREAK_ORDER,
  type StepSelection,
} from "../lib/study-plan/next-step";
import { coachedEvidenceFromReports } from "../lib/study-plan/coached/evidence";
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

/** Scored evidence for every competency, so pre-existing cases keep their
 * meaning (the coached step lands where it always did). */
const ALL_EVIDENCE = new Map<CompetencyKey, { lowestPercent: number }>(
  ALL_KEYS.map((k) => [k, { lowestPercent: 40 }])
);

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
  const selection = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });

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
  const selection = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });

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
  const selection = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });

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
  const selection = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });

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
    coachedEvidence: ALL_EVIDENCE,
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
  const first = selectPathSteps({ mastery, desiredCount: 6, coachedEvidence: ALL_EVIDENCE });
  const second = selectPathSteps({ mastery, desiredCount: 6, coachedEvidence: ALL_EVIDENCE });
  check(
    "two calls on the same input deep-equal, including reasons",
    JSON.stringify(first) === JSON.stringify(second)
  );
}

console.log("\n6. BOUNDS");
{
  const competencies = ALL_KEYS.map((k, i) => established(k, 50 + i));
  const mastery = resultWith(competencies);

  const low = selectPathSteps({ mastery, desiredCount: 2, coachedEvidence: ALL_EVIDENCE });
  check("desiredCount 2 clamps to 5 steps", low.steps.length === 5);

  const high = selectPathSteps({ mastery, desiredCount: 40, coachedEvidence: ALL_EVIDENCE });
  check("desiredCount 40 clamps to 10 steps", high.steps.length === 10);

  const exact = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });
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
    coachedEvidence: ALL_EVIDENCE,
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
  const selection = selectPathSteps({ mastery, desiredCount: 5, coachedEvidence: ALL_EVIDENCE });

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
  const selection = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });

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

  // An IN_PROGRESS step (e.g. an entered coached session) is resumed before
  // any PENDING step, with its own stored reason.
  const inProgressLater = fakePath([
    { position: 1, status: "PENDING", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "IN_PROGRESS", selectionReason: "SENTINEL-TWO" },
    { position: 3, status: "PENDING", selectionReason: "SENTINEL-THREE" },
  ]);
  const r5 = nextStepFor(inProgressLater);
  check(
    "IN_PROGRESS at 2 with PENDING at 1 -> returns 2 with its stored reason",
    r5?.step.position === 2 && r5.reason === "SENTINEL-TWO"
  );

  const onlyInProgress = fakePath([
    { position: 1, status: "COMPLETE", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "IN_PROGRESS", selectionReason: "SENTINEL-TWO" },
  ]);
  const r6 = nextStepFor(onlyInProgress);
  check(
    "only an IN_PROGRESS step left -> returns it (never null while work is open)",
    r6?.step.position === 2 && r6.reason === "SENTINEL-TWO"
  );

  const twoInProgress = fakePath([
    { position: 3, status: "IN_PROGRESS", selectionReason: "SENTINEL-THREE" },
    { position: 1, status: "IN_PROGRESS", selectionReason: "SENTINEL-ONE" },
  ]);
  const r7 = nextStepFor(twoInProgress);
  check("two IN_PROGRESS steps -> the lowest position", r7?.step.position === 1);

  const skippedOnly = fakePath([
    { position: 1, status: "SKIPPED", selectionReason: "SENTINEL-ONE" },
    { position: 2, status: "COMPLETE", selectionReason: "SENTINEL-TWO" },
  ]);
  check("SKIPPED + COMPLETE only -> null", nextStepFor(skippedOnly) === null);
}

console.log("\n10b. STORED REASONS MATCH THE STORED STEP KIND");
{
  /** A non-check step whose reason mentions a knowledge check describes a
   * step that does not exist (the degraded-step bug). */
  function kindReasonIssues(
    steps: Array<{ position: number; kind: string; selectionReason: string }>
  ): string[] {
    return steps
      .filter(
        (s) =>
          (s.kind === "UNAIDED_SESSION" || s.kind === "COACHED_SESSION") &&
          /knowledge check/i.test(s.selectionReason)
      )
      .map((s) => `step ${s.position} (${s.kind}) reason mentions a knowledge check`);
  }

  const mastery = resultWith(
    ALL_KEYS.map((key, i) => (i % 2 === 0 ? established(key, 30 + i * 5) : blank(key)))
  );
  const selection = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: ALL_EVIDENCE });
  check(
    "selectPathSteps: no UNAIDED/COACHED step reason mentions a knowledge check",
    kindReasonIssues(selection.steps).length === 0,
    JSON.stringify(kindReasonIssues(selection.steps))
  );

  // Simulate the path route's degrade branch on EVERY check step.
  const degraded = selection.steps.map((s) =>
    s.kind === "KNOWLEDGE_CHECK"
      ? { ...s, kind: "UNAIDED_SESSION", selectionReason: reasonForDegradedCheck(s.selectionReason) }
      : s
  );
  const checkCount = selection.steps.filter((s) => s.kind === "KNOWLEDGE_CHECK").length;
  check("fixture has at least one KNOWLEDGE_CHECK step to degrade", checkCount > 0, `got ${checkCount}`);
  check(
    "after degrading every check, no stored UNAIDED/COACHED reason mentions a knowledge check",
    kindReasonIssues(degraded).length === 0,
    JSON.stringify(kindReasonIssues(degraded))
  );

  const original = selection.steps.find((s) => s.kind === "KNOWLEDGE_CHECK")!;
  const rewritten = reasonForDegradedCheck(original.selectionReason);
  check(
    "degraded reason keeps the base (competency) sentence and says it is a practice session",
    rewritten.startsWith(original.selectionReason.split(" This knowledge check")[0]) &&
      /practice session/.test(rewritten)
  );
  check(
    "reasonForDegradedCheck is deterministic",
    reasonForDegradedCheck(original.selectionReason) === rewritten
  );

  // PLANTED REGRESSION: the old behaviour (kind changed, reason kept) must
  // be detected.
  const planted = selection.steps.map((s) =>
    s.kind === "KNOWLEDGE_CHECK" ? { ...s, kind: "UNAIDED_SESSION" } : s
  );
  check(
    "the guard DETECTS a degraded step that kept its knowledge-check reason (planted regression)",
    kindReasonIssues(planted).length === checkCount,
    JSON.stringify(kindReasonIssues(planted))
  );
}

console.log("\n11. COACHED REASON IS TRUTHFUL");
{
  // The contradiction detector: a reason that claims no scored evidence AND
  // describes a coached rework.
  const contradictory = (reason: string) =>
    reason.includes("no scored evidence") && reason.toLowerCase().includes("coached");

  const mastery = resultWith(ALL_KEYS.map((k) => blank(k)));
  const evKeys = [ALL_KEYS[3], ALL_KEYS[5]];
  const evidence = new Map<CompetencyKey, { lowestPercent: number }>(
    evKeys.map((k, i) => [k, { lowestPercent: 31 + i }])
  );
  const selection = selectPathSteps({
    mastery,
    desiredCount: 7,
    coachedEvidence: evidence,
  });
  const first = selection.steps[0];
  check(
    "all-NONE + evidence: position 1 is COACHED_SESSION on an evidenced competency",
    first.kind === "COACHED_SESSION" && evKeys.includes(first.competencyKey)
  );
  check(
    "coached NONE reason says 'no mastery figure yet' and carries the percent",
    first.selectionReason.includes("no mastery figure yet") &&
      first.selectionReason.includes(`${evidence.get(first.competencyKey)!.lowestPercent}%`),
    first.selectionReason
  );
  check(
    "no step reason contains both 'no scored evidence' and 'coached'",
    selection.steps.every((s) => !contradictory(s.selectionReason)),
    JSON.stringify(selection.steps.map((s) => s.selectionReason))
  );
  check("coachedOmitted is false when a step was placed", selection.coachedOmitted === false);
  check(
    "result accepted by validatePathSteps",
    validatePathSteps(selection.steps).length === 0
  );

  const none = selectPathSteps({
    mastery,
    desiredCount: 7,
    coachedEvidence: new Map(),
  });
  check(
    "empty evidence: no COACHED_SESSION step and coachedOmitted",
    !none.steps.some((s) => s.kind === "COACHED_SESSION") && none.coachedOmitted === true
  );
  check(
    "empty evidence: path still accepted by validatePathSteps",
    validatePathSteps(none.steps).length === 0,
    JSON.stringify(validatePathSteps(none.steps))
  );

  const third = selection.ranking[2].competencyKey;
  const thirdOnly = selectPathSteps({
    mastery,
    desiredCount: 7,
    coachedEvidence: new Map([[third, { lowestPercent: 22 }]]),
  });
  check(
    "evidence only on rank #3: it still gets position 1",
    thirdOnly.steps[0].kind === "COACHED_SESSION" &&
      thirdOnly.steps[0].competencyKey === third
  );

  // Bite-proof: the OLD composition must be flagged by the detector.
  const oldBase = `${COMPETENCIES[0].label} has no scored evidence yet, so it is ranked ahead of every measured competency.`;
  const oldComposed = `${oldBase} This coached session reworks a moment where it showed.`;
  check("bite-proof: detector flags the old contradictory composition", contradictory(oldComposed));
}

console.log("\n12. coachedEvidenceFromReports");
{
  // 1..5 rubric scores; dimension keys come from the real catalog.
  const dim = COMPETENCIES[0].dimensionKeys[0];
  const mk = (id: string, v: number | null) => ({
    id,
    userId: "u1",
    scores: { [dim]: v },
    createdAt: NOW,
  });
  const ev = coachedEvidenceFromReports([mk("r1", 5), mk("r2", 2), mk("r3", null)]);
  const got = ev.get(COMPETENCIES[0].key);
  const lowAlone = coachedEvidenceFromReports([mk("r2", 2)]).get(COMPETENCIES[0].key)!.lowestPercent;
  const highAlone = coachedEvidenceFromReports([mk("r1", 5)]).get(COMPETENCIES[0].key)!.lowestPercent;
  check("lowest percent kept across reports", got?.lowestPercent === lowAlone && lowAlone < highAlone,
    JSON.stringify(got)
  );
  check(
    "both scoring report ids listed, null-score report absent",
    !!got && got.scoredReportIds.includes("r1") && got.scoredReportIds.includes("r2") && !got.scoredReportIds.includes("r3"),
    JSON.stringify(got)
  );
  const nullOnly = coachedEvidenceFromReports([{ id: "r4", userId: "u1", scores: null, createdAt: NOW }]);
  check("null scores contribute nothing", nullOnly.size === 0);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
