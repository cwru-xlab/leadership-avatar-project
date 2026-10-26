/**
 * Proves the thinness tier boundaries, the no-bare-figure guarantee, and the
 * lifetime/current tier independence `toMasteryDTO()` and `evidenceTierFor()`
 * are supposed to carry. Builds `MasteryResult` literals directly and feeds
 * `toMasteryDTO()` — no database, no model call.
 *
 * Run: npx tsx scripts/verify-mastery-thinness.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import { evidenceTierFor } from "../lib/mastery/thinness";
import { toMasteryDTO } from "../lib/mastery/mastery-dto";
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

const NOW = new Date("2026-10-16T12:00:00Z");
const COMPETENCY_KEYS = COMPETENCIES.map((c) => c.key) as CompetencyKey[];

function blankCompetency(
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

function resultWith(
  competencies: CompetencyMastery[],
  overrides: Partial<MasteryResult> = {}
): MasteryResult {
  return {
    competencies,
    overallLifetimePercent: null,
    overallCurrentPercent: null,
    windowStart: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
    windowDays: 30,
    unmappedRowCount: 0,
    recentGrowth: [],
    ...overrides,
  };
}

console.log("1. TIER BOUNDARIES");
{
  check(
    "count 0, weight 0 -> NONE",
    evidenceTierFor({ evidenceCount: 0, weightSum: 0 }) === "NONE"
  );
  check(
    "count 1, weight 0.20 (one model-graded rewrite) -> THIN",
    evidenceTierFor({ evidenceCount: 1, weightSum: 0.2 }) === "THIN"
  );
  check(
    "count 2, weight 1.999 -> THIN",
    evidenceTierFor({ evidenceCount: 2, weightSum: 1.999 }) === "THIN"
  );
  check(
    "count 2, weight 2.0 -> EMERGING",
    evidenceTierFor({ evidenceCount: 2, weightSum: 2.0 }) === "EMERGING"
  );
  check(
    "weight 5.999 -> EMERGING",
    evidenceTierFor({ evidenceCount: 6, weightSum: 5.999 }) === "EMERGING"
  );
  check(
    "weight 6.0 -> ESTABLISHED",
    evidenceTierFor({ evidenceCount: 6, weightSum: 6.0 }) === "ESTABLISHED"
  );
  check(
    "count 0 with weight 3.0 -> NONE (count-first rule)",
    evidenceTierFor({ evidenceCount: 0, weightSum: 3.0 }) === "NONE"
  );
  let threwOnNegativeCount = false;
  try {
    evidenceTierFor({ evidenceCount: -1, weightSum: 1 });
  } catch {
    threwOnNegativeCount = true;
  }
  check("negative evidenceCount throws", threwOnNegativeCount);

  let threwOnNegativeWeight = false;
  try {
    evidenceTierFor({ evidenceCount: 1, weightSum: -1 });
  } catch {
    threwOnNegativeWeight = true;
  }
  check("negative weightSum throws", threwOnNegativeWeight);
}

console.log(
  "2. THE 21-CONTEXT CASE: a competency with exactly two live sessions still displays, flagged"
);
{
  const [keyA] = COMPETENCY_KEYS;
  const competencies = COMPETENCY_KEYS.map((key) =>
    key === keyA
      ? blankCompetency(key, {
          lifetimePercent: 55.0,
          currentPercent: 55.0,
          lifetimeEvidenceCount: 2,
          currentEvidenceCount: 2,
          lifetimeWeightSum: 2.0,
          currentWeightSum: 2.0,
          lastContributionAt: NOW,
        })
      : blankCompetency(key)
  );

  const dto = toMasteryDTO(resultWith(competencies));
  const dtoA = dto.competencies.find((c) => c.competencyKey === keyA)!;

  check(
    "two-session competency's lifetime percent is non-null (not withheld)",
    dtoA.lifetime.percent === 55.0
  );
  check(
    "two-session competency's tier carries a non-null disclosure (not presented bare)",
    dtoA.lifetime.disclosure !== null
  );
}

console.log("3. NO FIGURE WITHOUT A TIER");
{
  // A mixture: first competency NONE, second THIN, third ESTABLISHED, rest blank-none.
  const [keyNone, keyThin, keyEstablished] = COMPETENCY_KEYS;
  const competencies = COMPETENCY_KEYS.map((key) => {
    if (key === keyNone) {
      return blankCompetency(key);
    }
    if (key === keyThin) {
      return blankCompetency(key, {
        lifetimePercent: 40.0,
        currentPercent: 40.0,
        lifetimeEvidenceCount: 1,
        currentEvidenceCount: 1,
        lifetimeWeightSum: 0.45,
        currentWeightSum: 0.45,
        lastContributionAt: NOW,
      });
    }
    if (key === keyEstablished) {
      return blankCompetency(key, {
        lifetimePercent: 70.0,
        currentPercent: 70.0,
        lifetimeEvidenceCount: 7,
        currentEvidenceCount: 7,
        lifetimeWeightSum: 7.0,
        currentWeightSum: 7.0,
        lastContributionAt: NOW,
      });
    }
    return blankCompetency(key);
  });

  const dto = toMasteryDTO(resultWith(competencies));

  check(
    "no competency dropped for being thin",
    dto.competencies.length === COMPETENCIES.length
  );

  const everyHasLabels = dto.competencies.every(
    (c) => c.lifetime.tierLabel.length > 0 && c.current.tierLabel.length > 0
  );
  check("every competency has non-empty lifetime and current tierLabel", everyHasLabels);

  const everyThinHasDisclosure = dto.competencies.every((c) => {
    if (c.lifetime.percent !== null && c.lifetime.tier === "THIN") {
      return c.lifetime.disclosure !== null;
    }
    return true;
  });
  check(
    "every non-null THIN lifetime figure has a non-null disclosure",
    everyThinHasDisclosure
  );

  const everyNullHasNoneAndDisclosure = dto.competencies.every((c) => {
    if (c.lifetime.percent === null) {
      return c.lifetime.tier === "NONE" && c.lifetime.disclosure !== null;
    }
    return true;
  });
  check(
    "a percent:null competency has tier NONE and a non-null disclosure",
    everyNullHasNoneAndDisclosure
  );
}

console.log("4. LIFETIME AND CURRENT TIER INDEPENDENCE");
{
  const [keyA] = COMPETENCY_KEYS;
  const competencies = COMPETENCY_KEYS.map((key) =>
    key === keyA
      ? blankCompetency(key, {
          lifetimePercent: 80.0,
          currentPercent: 30.0,
          lifetimeEvidenceCount: 9,
          currentEvidenceCount: 1,
          lifetimeWeightSum: 9.0,
          currentWeightSum: 0.2,
          lastContributionAt: NOW,
        })
      : blankCompetency(key)
  );

  const dto = toMasteryDTO(resultWith(competencies));
  const dtoA = dto.competencies.find((c) => c.competencyKey === keyA)!;

  check(
    "lifetime tier is ESTABLISHED while current tier is THIN on the same competency",
    dtoA.lifetime.tier === "ESTABLISHED" && dtoA.current.tier === "THIN"
  );
}

console.log("5. SHAPE GUARD");
{
  const competencies = COMPETENCY_KEYS.map((key) =>
    blankCompetency(key, {
      lifetimePercent: 10,
      currentPercent: 10,
      lifetimeEvidenceCount: 1,
      currentEvidenceCount: 1,
      lifetimeWeightSum: 0.45,
      currentWeightSum: 0.45,
      lastContributionAt: NOW,
    })
  );

  const dto = toMasteryDTO(resultWith(competencies, { unmappedRowCount: 0 }));
  const roundTripped = JSON.parse(JSON.stringify(dto));

  function containsDate(value: unknown): boolean {
    if (value instanceof Date) return true;
    if (Array.isArray(value)) return value.some(containsDate);
    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>).some(containsDate);
    }
    return false;
  }

  check("no Date instance survives serialization", !containsDate(dto));
  check(
    "JSON round-trip deep-equals the original DTO",
    JSON.stringify(roundTripped) === JSON.stringify(dto)
  );
  check(
    "unmappedRowCount is present even when zero",
    Object.prototype.hasOwnProperty.call(dto, "unmappedRowCount") &&
      dto.unmappedRowCount === 0
  );
}

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log("ALL PASS");
  process.exit(0);
}
