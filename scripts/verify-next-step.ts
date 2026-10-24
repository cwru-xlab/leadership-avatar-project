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
  reasonForDegradedCheckToDrill,
  TIE_BREAK_ORDER,
  MAX_DRILLS_PER_TARGET,
  WEAK_THRESHOLD_PERCENT,
  type StepSelection,
} from "../lib/study-plan/next-step";
import { coachedEvidenceFromReports } from "../lib/study-plan/coached/evidence";
import {
  planEvidenceFromReports,
  themeMatchesFromPlan,
  priorityThemesFromContent,
} from "../lib/study-plan/plan-targets";
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
    byOrigin: [],
    trend: [],
    windowStartLifetimePercent: null,
    windowDelta: null,
    windowDrivers: [],
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
    recentGrowth: [],
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

  // Phase 23 user decision: a competency with no moment still gets a
  // CONCEPT knowledge check (quoting nobody), never a coached step.
  const conceptCheck = selection.steps.find(
    (s) => s.kind === "KNOWLEDGE_CHECK" && s.competencyKey === weakest
  );
  const hostsNoCoachedSession = !selection.steps.some(
    (s) => s.kind === "COACHED_SESSION" && s.competencyKey === weakest
  );
  check(
    "unavailable weakest hosts a CONCEPT knowledge check whose reason says it quotes none",
    !!conceptCheck && conceptCheck.selectionReason.includes("concept knowledge check") && conceptCheck.selectionReason.includes("quotes none"),
    conceptCheck?.selectionReason
  );
  check(
    "a moment-backed check is NOT worded as a concept check",
    selection.steps.filter((s) => s.kind === "KNOWLEDGE_CHECK" && s.competencyKey !== weakest).every((s) => !s.selectionReason.includes("concept knowledge check"))
  );
  check(
    "degrading a concept check to a drill drops every check sentence",
    !!conceptCheck && !/knowledge check/i.test(reasonForDegradedCheckToDrill(conceptCheck.selectionReason))
  );
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

console.log("\n11. COACHED REASON IS TRUTHFUL (Phase 23: coached sits after learn + drill)");
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
  // In the route, coached evidence comes from the SAME source reports as the
  // plan's SCORED signal, so an evidenced competency is always a plan target.
  const planEvidence = new Map(
    evKeys.map((k, i) => [k, { meanPercent: 40 + i, scoredReportCount: 2 }] as const)
  );
  const selection = selectPathSteps({
    mastery,
    desiredCount: 10,
    coachedEvidence: evidence,
    planEvidence,
  });
  const coachedSteps = selection.steps.filter((s) => s.kind === "COACHED_SESSION");
  check(
    "all-NONE + evidence: every COACHED_SESSION is on an evidenced competency",
    coachedSteps.length > 0 && coachedSteps.every((s) => evKeys.includes(s.competencyKey)),
    JSON.stringify(coachedSteps.map((s) => s.competencyKey))
  );
  check(
    "coached reason cites the plan's own sessions with the percent",
    coachedSteps.every((s) => {
      const mean = planEvidence.get(s.competencyKey)!.meanPercent;
      return s.selectionReason.includes(`${mean}%`) && s.selectionReason.includes("sessions this plan was built from");
    }),
    JSON.stringify(coachedSteps.map((s) => s.selectionReason))
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

  // Coached evidence on a non-plan (GLOBAL) target still yields a truthful
  // reason naming the lowest source figure.
  const globalCoached = selectPathSteps({
    mastery,
    desiredCount: 10,
    coachedEvidence: new Map([[TIE_BREAK_ORDER[0], { lowestPercent: 22 }]]),
  });
  const gc = globalCoached.steps.find((s) => s.kind === "COACHED_SESSION");
  check(
    "coached on a GLOBAL target: reason carries the lowest source figure",
    !!gc && gc.selectionReason.includes("22%") && !contradictory(gc.selectionReason),
    gc?.selectionReason
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


// ---------------------------------------------------------------------------
// Phase 23: plan-first targeting, learn -> drill -> rework -> prove, VOICE_DRILL
// ---------------------------------------------------------------------------

/** Every way a step list can break the Phase 23 order. Pure, so the
 * bite-proofs can run it on planted bad lists. */
function orderIssues(
  steps: Array<{ position: number; kind: string; competencyKey: string }>
): string[] {
  const issues: string[] = [];
  const ordered = steps.slice().sort((a, b) => a.position - b.position);
  const unaided = ordered.filter((s) => s.kind === "UNAIDED_SESSION");
  if (unaided.length !== 1) issues.push(`expected exactly 1 UNAIDED_SESSION, got ${unaided.length}`);
  if (ordered[ordered.length - 1]?.kind !== "UNAIDED_SESSION") issues.push("last step is not UNAIDED_SESSION");
  const STAGE: Record<string, number> = { KNOWLEDGE_CHECK: 0, VOICE_DRILL: 1, COACHED_SESSION: 2 };
  const body = ordered.slice(0, -1);
  // Contiguous blocks per competency, stage non-decreasing inside a block.
  const seenClosed = new Set<string>();
  let current: string | null = null;
  let lastStage = -1;
  let drills = 0;
  for (const s of body) {
    if (s.competencyKey !== current) {
      if (current) seenClosed.add(current);
      if (seenClosed.has(s.competencyKey)) issues.push(`competency ${s.competencyKey} appears in two separate blocks`);
      current = s.competencyKey;
      lastStage = -1;
      drills = 0;
    }
    const stage = STAGE[s.kind];
    if (stage === undefined) {
      issues.push(`step ${s.position}: ${s.kind} inside the body`);
      continue;
    }
    if (stage < lastStage) issues.push(`step ${s.position}: ${s.kind} after a later stage (learn -> drill -> rework)`);
    lastStage = stage;
    if (s.kind === "VOICE_DRILL") drills += 1;
    if (drills > MAX_DRILLS_PER_TARGET) issues.push(`step ${s.position}: more than ${MAX_DRILLS_PER_TARGET} drills for ${s.competencyKey}`);
  }
  return issues;
}

console.log("\n13. PLAN-FIRST TARGETING");
{
  // Globally, Outcome achievement is unmeasured (NONE tier) and would rank
  // first. The plan's own sessions scored three other competencies.
  const outcome: CompetencyKey = "outcome_achievement";
  const competencies = ALL_KEYS.map((k) =>
    k === outcome ? blank(k) : established(k, 70)
  );
  const mastery = resultWith(competencies);
  const planEvidence = new Map<CompetencyKey, { meanPercent: number; scoredReportCount: number }>([
    ["audience_attunement", { meanPercent: 55, scoredReportCount: 10 }],
    ["structure_and_clarity", { meanPercent: 48, scoredReportCount: 10 }],
    ["delivery_presence", { meanPercent: 62, scoredReportCount: 6 }],
  ]);

  const globalOnly = selectPathSteps({ mastery, desiredCount: 10, coachedEvidence: new Map() });
  check(
    "baseline (no plan signal): the unmeasured Outcome achievement is the global #1",
    globalOnly.ranking[0].competencyKey === outcome && globalOnly.steps[0].competencyKey === outcome
  );

  const planFirst = selectPathSteps({ mastery, desiredCount: 10, coachedEvidence: new Map(), planEvidence });
  check(
    "plan-first: step 1 targets the plan's weakest scored skill, not the global gap",
    planFirst.steps[0].competencyKey === "structure_and_clarity",
    JSON.stringify(planFirst.steps.map((s) => `${s.kind}/${s.competencyKey}`))
  );
  check(
    "plan-first: targets are the three scored skills, weakest mean first",
    JSON.stringify(planFirst.targets) ===
      JSON.stringify(["structure_and_clarity", "audience_attunement", "delivery_presence"]),
    JSON.stringify(planFirst.targets)
  );
  check(
    "plan-first: the never-measured global gap is not targeted when the plan fills the slots",
    !planFirst.steps.some((s) => s.competencyKey === outcome)
  );
  check(
    "plan-first: SCORED entries rank before GLOBAL entries",
    planFirst.ranking.slice(0, 3).every((r) => r.basis === "SCORED") &&
      planFirst.ranking.slice(3).every((r) => r.basis === "GLOBAL")
  );
  check(
    "REQ-118: step 1's stored reason names the plan signal and its figure",
    planFirst.steps[0].selectionReason.includes("this plan's #1 target") &&
      planFirst.steps[0].selectionReason.includes("48%") &&
      planFirst.steps[0].selectionReason.includes("10 sessions"),
    planFirst.steps[0].selectionReason
  );
  check(
    "REQ-118: no stored reason claims a plan basis it does not have",
    planFirst.steps.every((s) => {
      const entry = planFirst.ranking.find((r) => r.competencyKey === s.competencyKey)!;
      return entry.basis === "SCORED" ? s.selectionReason.includes("on average") : true;
    })
  );

  // THEME-only competencies rank after SCORED and before GLOBAL.
  const themeMatches = new Map([
    ["credibility_of_the_case" as CompetencyKey, { priority: 1, theme: "Quantifying impact" }],
  ]);
  const withTheme = selectPathSteps({
    mastery,
    desiredCount: 10,
    coachedEvidence: new Map(),
    planEvidence: new Map([["structure_and_clarity", { meanPercent: 48, scoredReportCount: 10 }]]),
    themeMatches,
  });
  check(
    "THEME-only ranks after SCORED and before GLOBAL",
    withTheme.ranking[0].competencyKey === "structure_and_clarity" &&
      withTheme.ranking[1].competencyKey === "credibility_of_the_case" &&
      withTheme.ranking[1].basis === "THEME" &&
      withTheme.ranking[2].basis === "GLOBAL",
    JSON.stringify(withTheme.ranking.map((r) => `${r.basis}/${r.competencyKey}`))
  );
  check(
    "THEME reason quotes the plan's theme verbatim and says the sessions did not score it",
    withTheme.ranking[1].reason.includes('"Quantifying impact"') &&
      withTheme.ranking[1].reason.includes("did not score it directly"),
    withTheme.ranking[1].reason
  );
  check(
    "a GLOBAL fill reason says it is not one of the plan's own weak skills",
    withTheme.ranking[2].reason.includes("fills a remaining slot"),
    withTheme.ranking[2].reason
  );

  // SCORED tie broken by theme priority, before the global comparator.
  const tie = selectPathSteps({
    mastery,
    desiredCount: 10,
    coachedEvidence: new Map(),
    planEvidence: new Map([
      ["delivery_presence", { meanPercent: 50, scoredReportCount: 3 }],
      ["audience_attunement", { meanPercent: 50, scoredReportCount: 3 }],
    ]),
    themeMatches: new Map([["audience_attunement" as CompetencyKey, { priority: 2, theme: "Active Listening" }]]),
  });
  check(
    "SCORED tie: the themed competency ranks first (delivery would win the global tie-break)",
    tie.ranking[0].competencyKey === "audience_attunement",
    JSON.stringify(tie.ranking.slice(0, 2).map((r) => r.competencyKey))
  );

  // BITE-PROOF: the targeting guard must fail on a global-first selection.
  const targetingIssue = (sel: StepSelection) =>
    sel.steps[0].competencyKey === outcome ? ["step 1 targets the never-measured global gap"] : [];
  check(
    "bite-proof: the targeting guard FLAGS the old global-first selection",
    targetingIssue(globalOnly).length === 1 && targetingIssue(planFirst).length === 0
  );
}

console.log("\n14. ORDER: learn -> drill -> rework -> prove");
{
  const mastery = resultWith(ALL_KEYS.map((k, i) => established(k, 40 + i * 5)));
  const planEvidence = new Map(
    ALL_KEYS.slice(0, 3).map((k, i) => [k, { meanPercent: 30 + i * 10, scoredReportCount: 4 }] as const)
  );
  const sel = selectPathSteps({ mastery, desiredCount: 10, coachedEvidence: ALL_EVIDENCE, planEvidence });
  check("full evidence: no order issues", orderIssues(sel.steps).length === 0, JSON.stringify(orderIssues(sel.steps)));
  check(
    "full evidence: each targeted block is KNOWLEDGE_CHECK, VOICE_DRILL, COACHED_SESSION",
    JSON.stringify(sel.steps.slice(0, 3).map((s) => s.kind)) ===
      JSON.stringify(["KNOWLEDGE_CHECK", "VOICE_DRILL", "COACHED_SESSION"]),
    JSON.stringify(sel.steps.map((s) => s.kind))
  );
  check(
    "the final step is the ONE UNAIDED_SESSION, on the #1 target",
    sel.steps[sel.steps.length - 1].kind === "UNAIDED_SESSION" &&
      sel.steps[sel.steps.length - 1].competencyKey === sel.targets[0] &&
      sel.steps.filter((s) => s.kind === "UNAIDED_SESSION").length === 1
  );
  check(
    "every targeted competency gets at least one VOICE_DRILL",
    sel.targets.every((t) => sel.steps.some((s) => s.kind === "VOICE_DRILL" && s.competencyKey === t))
  );
  check(
    "the final step's reason describes the transfer test",
    sel.steps[sel.steps.length - 1].selectionReason.includes("transfer test")
  );

  // Room for a second drill: coached only on target #1.
  const roomy = selectPathSteps({
    mastery,
    desiredCount: 10,
    coachedEvidence: new Map([[ALL_KEYS[0], { lowestPercent: 25 }]]),
    planEvidence,
  });
  const firstBlockDrills = roomy.steps.filter((s) => s.kind === "VOICE_DRILL" && s.competencyKey === roomy.targets[0]).length;
  check("room left: the #1 target gets a second drill", firstBlockDrills === 2, `${firstBlockDrills}`);
  check(
    "the second drill's reason says it is a second rep",
    roomy.steps.filter((s) => s.kind === "VOICE_DRILL" && s.competencyKey === roomy.targets[0])[1].selectionReason.includes("second voice drill")
  );
  check("roomy: no order issues", orderIssues(roomy.steps).length === 0, JSON.stringify(orderIssues(roomy.steps)));

  // BITE-PROOFS
  const swapped = sel.steps.map((s) =>
    s.position === 2 ? { ...s, kind: "COACHED_SESSION" } : s.position === 3 ? { ...s, kind: "VOICE_DRILL" } : s
  );
  check(
    "bite-proof: rework before drill is FLAGGED",
    orderIssues(swapped).some((i) => i.includes("after a later stage")),
    JSON.stringify(orderIssues(swapped))
  );
  const twoUnaided = sel.steps.map((s) => (s.position === 2 ? { ...s, kind: "UNAIDED_SESSION" } : s));
  check(
    "bite-proof: a mid-path UNAIDED_SESSION is FLAGGED",
    orderIssues(twoUnaided).some((i) => i.includes("exactly 1 UNAIDED_SESSION")),
    JSON.stringify(orderIssues(twoUnaided))
  );
}

console.log("\n15. VOICE_DRILL kind + degrade-to-drill");
{
  const mastery = resultWith(ALL_KEYS.map((k, i) => established(k, 40 + i * 5)));
  const sel = selectPathSteps({ mastery, desiredCount: 10, coachedEvidence: ALL_EVIDENCE });
  const drills = sel.steps.filter((s) => s.kind === "VOICE_DRILL");
  check("VOICE_DRILL steps carry neither id", drills.length > 0 && drills.every((s) => !s.knowledgeCheckId && !s.coachedSessionId));
  check("validatePathSteps accepts the drill path", validatePathSteps(sel.steps).length === 0, JSON.stringify(validatePathSteps(sel.steps)));
  const withKc = sel.steps.map((s) => (s.kind === "VOICE_DRILL" ? { ...s, knowledgeCheckId: "kc-x" } : s));
  check(
    "bite-proof: a VOICE_DRILL carrying a knowledgeCheckId is rejected",
    validatePathSteps(withKc).some((e) => e.includes("VOICE_DRILL step must not carry knowledgeCheckId"))
  );
  const badKind = sel.steps.map((s, i) => (i === 0 ? { ...s, kind: "VOICE_DRIL" as any } : s));
  check(
    "bite-proof: an unknown kind is rejected",
    validatePathSteps(badKind).some((e) => e.includes('unknown kind "VOICE_DRIL"'))
  );

  const kc = sel.steps.find((s) => s.kind === "KNOWLEDGE_CHECK")!;
  const rewritten = reasonForDegradedCheckToDrill(kc.selectionReason);
  check(
    "degrade-to-drill reason keeps the base sentence, drops the check, names a voice drill",
    !/knowledge check/i.test(rewritten) && rewritten.includes("voice drill") &&
      rewritten.startsWith(kc.selectionReason.split(" This knowledge check")[0]),
    rewritten
  );
  const degraded = sel.steps.map((s) =>
    s.kind === "KNOWLEDGE_CHECK"
      ? { ...s, kind: "VOICE_DRILL" as const, knowledgeCheckId: null, selectionReason: reasonForDegradedCheckToDrill(s.selectionReason) }
      : s
  );
  check(
    "after degrading every check to a drill: still exactly one UNAIDED_SESSION, valid",
    degraded.filter((s) => s.kind === "UNAIDED_SESSION").length === 1 && validatePathSteps(degraded).length === 0
  );
}

console.log("\n16. BUDGET SWEEP (deterministic enumeration)");
{
  let combos = 0;
  const problems: string[] = [];
  const masteries = [
    resultWith(ALL_KEYS.map((k) => blank(k))),
    resultWith(ALL_KEYS.map((k, i) => established(k, 20 + i * 10))),
  ];
  for (const mastery of masteries) {
    for (let unavailMask = 0; unavailMask < 8; unavailMask += 1) {
      for (let evMask = 0; evMask < 8; evMask += 1) {
        for (const desired of [1, 5, 7, 9, 10, 50]) {
          combos += 1;
          const order = selectPathSteps({ mastery, desiredCount: 7, coachedEvidence: new Map() }).ranking.map((r) => r.competencyKey);
          const unavailable = order.slice(0, 3).filter((_, i) => unavailMask & (1 << i));
          const coachedEvidence = new Map(
            order.slice(0, 3).filter((_, i) => evMask & (1 << i)).map((k) => [k, { lowestPercent: 30 }] as const)
          );
          const sel = selectPathSteps({ mastery, desiredCount: desired, unavailableCompetencies: unavailable, coachedEvidence });
          const cap = Math.max(5, Math.min(10, desired));
          const tag = `u${unavailMask}/e${evMask}/d${desired}`;
          if (sel.steps.length < 5 || sel.steps.length > 10) problems.push(`${tag}: ${sel.steps.length} steps`);
          if (sel.steps.length > cap) problems.push(`${tag}: over the cap ${cap}`);
          if (validatePathSteps(sel.steps).length) problems.push(`${tag}: invalid ${validatePathSteps(sel.steps)}`);
          if (orderIssues(sel.steps).length) problems.push(`${tag}: ${orderIssues(sel.steps)}`);
          if (sel.steps.some((s) => s.kind === "COACHED_SESSION" && unavailable.includes(s.competencyKey)))
            problems.push(`${tag}: unavailable competency hosts a coached step`);
          if (sel.steps[0].kind !== "KNOWLEDGE_CHECK") problems.push(`${tag}: the path does not open with a knowledge check`);
          // learn -> drill -> prove: every targeted block opens with a check.
          for (const t of sel.targets) {
            const first = sel.steps.find((s) => s.competencyKey === t && s.kind !== "UNAIDED_SESSION");
            if (first?.kind !== "KNOWLEDGE_CHECK" && sel.steps.filter((s) => s.kind !== "UNAIDED_SESSION").some((s) => s.competencyKey === t)) {
              // a fill block may be trimmed to a drill only when the cap is tight
              if (cap >= 7) problems.push(`${tag}: target ${t} has no opening knowledge check`);
            }
          }
        }
      }
    }
  }
  check(`all ${combos} combinations: 5-10 steps, within cap, valid, ordered`, problems.length === 0, problems.slice(0, 5).join(" | "));
}

console.log("\n17. plan-targets helpers");
{
  const themes = priorityThemesFromContent({
    priorityThemes: [
      { priority: 2, theme: "Completeness and Clarification of Answers" },
      { priority: 1, theme: "Consistency of Organization Across Responses" },
      { priority: 3, theme: "Reflection and Coachability" },
      { theme: "malformed" },
    ],
  });
  check("priorityThemesFromContent drops malformed entries", themes.length === 3);
  const matches = themeMatchesFromPlan(themes);
  check(
    "Organization theme -> Structure & clarity at priority 1",
    matches.get("structure_and_clarity")?.priority === 1,
    JSON.stringify([...matches.values()])
  );
  check("an unmatched theme adds no signal (no guessing)", ![...matches.values()].some((m) => m.theme.startsWith("Reflection")));
  check("priorityThemesFromContent(null) is empty", priorityThemesFromContent(null).length === 0);

  const dim = COMPETENCIES[1].dimensionKeys[0]; // structure: content
  const ev = planEvidenceFromReports([
    { id: "r1", userId: "u", scores: { [dim]: 1 }, createdAt: NOW },
    { id: "r2", userId: "u", scores: { [dim]: 5 }, createdAt: NOW },
    { id: "r3", userId: "u", scores: { [dim]: 3 }, createdAt: NOW },
  ]).get(COMPETENCIES[1].key)!;
  check(
    "planEvidenceFromReports: mean 50%, lowest 0%, 3 reports",
    ev.meanPercent === 50 && ev.lowestPercent === 0 && ev.scoredReportCount === 3,
    JSON.stringify(ev)
  );
}

console.log("\n18. WEAK THRESHOLD (user decision: weak only below 70%)");
{
  check("WEAK_THRESHOLD_PERCENT is 70", WEAK_THRESHOLD_PERCENT === 70);
  const outcome: CompetencyKey = "outcome_achievement";
  const mastery = resultWith(ALL_KEYS.map((k) => (k === outcome ? blank(k) : established(k, 65))));
  const planEvidence = new Map<CompetencyKey, { meanPercent: number; scoredReportCount: number }>([
    ["structure_and_clarity", { meanPercent: 75, scoredReportCount: 10 }], // strong
    ["audience_attunement", { meanPercent: 70, scoredReportCount: 10 }], // boundary: strong
    ["delivery_presence", { meanPercent: 69, scoredReportCount: 7 }], // weak
  ]);
  const themeMatches = new Map([
    ["credibility_of_the_case" as CompetencyKey, { priority: 1, theme: "Quantifying impact" }],
    ["structure_and_clarity" as CompetencyKey, { priority: 2, theme: "Organization of Responses" }],
  ]);
  const sel = selectPathSteps({ mastery, desiredCount: 10, coachedEvidence: new Map(), planEvidence, themeMatches });
  const basis = (k: CompetencyKey) => sel.ranking.find((r) => r.competencyKey === k)!;
  check("69% is weak (SCORED) and ranks #1", basis("delivery_presence").basis === "SCORED" && sel.ranking[0].competencyKey === "delivery_presence");
  check("70% (boundary) is STRONG", basis("audience_attunement").basis === "STRONG");
  check("a themed skill scored >= 70% is STRONG, not THEME", basis("structure_and_clarity").basis === "STRONG");
  const rankOf = (k: CompetencyKey) => basis(k).rank;
  check(
    "STRONG plan skills rank below the theme-only skill and below every global gap",
    rankOf("structure_and_clarity") > rankOf("credibility_of_the_case") &&
      sel.ranking.filter((r) => r.basis === "GLOBAL").every((g) => g.rank < rankOf("audience_attunement")),
    JSON.stringify(sel.ranking.map((r) => `${r.rank}:${r.basis}/${r.competencyKey}`))
  );
  check(
    "targets: weak plan skill, then the theme, then the absent global gap",
    JSON.stringify(sel.targets) === JSON.stringify(["delivery_presence", "credibility_of_the_case", outcome]),
    JSON.stringify(sel.targets)
  );
  check(
    "the never-measured gap's reason says it is absent",
    basis(outcome).reason.includes("never been measured") && basis(outcome).reason.includes("absent gap"),
    basis(outcome).reason
  );
  check("the weak reason names the 70% line", basis("delivery_presence").reason.includes("below the 70% weak-skill line"));
  check("the strong reason says it ranks after weak skills, themes and gaps", basis("structure_and_clarity").reason.includes("at or above the 70% weak-skill line"));
  check(
    "theme wording is honest ('related to your plan theme'), never 'matches'",
    basis("credibility_of_the_case").reason.includes('related to your plan theme "Quantifying impact"') &&
      sel.ranking.every((r) => !r.reason.includes("matches the plan's priority theme"))
  );
  // BITE-PROOF: without the threshold (same skills at weak means) the 75%
  // skill would be targeted; the guard must flag that.
  const thresholdIssue = (x: StepSelection) =>
    x.targets.some((t) => (planEvidence.get(t)?.meanPercent ?? 0) >= WEAK_THRESHOLD_PERCENT) ? ["a >=70% plan skill was targeted"] : [];
  const noThreshold = selectPathSteps({
    mastery,
    desiredCount: 10,
    coachedEvidence: new Map(),
    planEvidence: new Map([...planEvidence].map(([k, v]) => [k, { ...v, meanPercent: v.meanPercent - 50 }] as const)),
    themeMatches,
  });
  check(
    "bite-proof: the threshold guard FLAGS a selection that targets >=70% skills",
    thresholdIssue(noThreshold).length === 1 && thresholdIssue(sel).length === 0
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
