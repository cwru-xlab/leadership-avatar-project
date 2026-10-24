/**
 * Proves the mastery surface (route + panel + page + nav entry) shows what
 * it must and computes nothing of its own.
 *
 * This is a SOURCE-AND-DTO verifier, not a browser test — it reads files as
 * text and feeds `MasteryResult` literals through the real DTO/compute
 * functions. It does NOT render React, does NOT start a server, and does
 * NOT prove the page looks right in a browser. Visual/functional
 * correctness is 21-20's human UAT's job, not this script's.
 *
 * Run: npx tsx scripts/verify-mastery-surface.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import fs from "fs";
import path from "path";

import { toMasteryDTO, activityKeyForDriver, type ActivityLink } from "../lib/mastery/mastery-dto";
import type { MasteryContributionRow } from "../lib/mastery/ledger";
import { computeMastery } from "../lib/mastery/compute";
import { COMPETENCIES, type CompetencyKey } from "../lib/mastery/competencies";
import type { CompetencyMastery, MasteryResult } from "../lib/mastery/compute";
import { siteConfig } from "../config/site";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
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

// === Section 1: DTO COMPLETENESS =========================================
console.log("1. DTO COMPLETENESS");
{
  // One figure shape per tier (NONE, THIN, EMERGING, ESTABLISHED), cycled
  // across all seven competencies so every tier appears, and the first
  // competency is the all-null one.
  const tierShapes: Array<{ count: number; weightSum: number; percent: number }> = [
    { count: 0, weightSum: 0, percent: 0 }, // NONE — percent unused, forced null below
    { count: 1, weightSum: 1.0, percent: 50 }, // THIN (< 2.0)
    { count: 4, weightSum: 4.0, percent: 60 }, // EMERGING (>= 2.0, < 6.0)
    { count: 7, weightSum: 7.0, percent: 75 }, // ESTABLISHED (>= 6.0)
  ];

  const competencies: CompetencyMastery[] = COMPETENCY_KEYS.map((key, index) => {
    const shape = tierShapes[index % tierShapes.length];
    if (shape.count === 0) {
      return blankCompetency(key);
    }
    return blankCompetency(key, {
      lifetimePercent: shape.percent,
      currentPercent: shape.percent,
      lifetimeEvidenceCount: shape.count,
      currentEvidenceCount: shape.count,
      lifetimeWeightSum: shape.weightSum,
      currentWeightSum: shape.weightSum,
      lastContributionAt: NOW,
    });
  });

  const dto = toMasteryDTO(resultWith(competencies));

  check(
    "every competency has a non-empty lifetime.tierLabel and current.tierLabel",
    dto.competencies.every((c) => c.lifetime.tierLabel.length > 0 && c.current.tierLabel.length > 0)
  );

  check(
    "every competency with percent null has tier NONE and a non-null disclosure",
    dto.competencies.every((c) => {
      const lifetimeOk = c.lifetime.percent !== null || (c.lifetime.tier === "NONE" && c.lifetime.disclosure !== null);
      const currentOk = c.current.percent !== null || (c.current.tier === "NONE" && c.current.disclosure !== null);
      return lifetimeOk && currentOk;
    })
  );

  const thinCompetencies = dto.competencies.filter(
    (c) => c.lifetime.tier === "THIN" || c.current.tier === "THIN"
  );
  check(
    "at least one THIN competency exists in this fixture",
    thinCompetencies.length > 0
  );
  check(
    "every THIN figure has a non-null disclosure",
    dto.competencies.every((c) => {
      const lifetimeOk = c.lifetime.tier !== "THIN" || c.lifetime.disclosure !== null;
      const currentOk = c.current.tier !== "THIN" || c.current.disclosure !== null;
      return lifetimeOk && currentOk;
    })
  );

  check(
    "competencies.length === COMPETENCIES.length — nothing dropped",
    dto.competencies.length === COMPETENCIES.length,
    `got ${dto.competencies.length}, expected ${COMPETENCIES.length}`
  );

  const roundTrip = JSON.parse(JSON.stringify(dto));
  check(
    "JSON round-trip equals the original (no Date, no undefined, no NaN)",
    JSON.stringify(roundTrip) === JSON.stringify(dto)
  );

  function hasNaN(value: unknown): boolean {
    if (typeof value === "number") return Number.isNaN(value);
    if (Array.isArray(value)) return value.some(hasNaN);
    if (value && typeof value === "object") return Object.values(value).some(hasNaN);
    return false;
  }
  check("no value anywhere in the DTO is NaN", !hasNaN(dto));
}

// === Section 2: LABEL PRESENCE ============================================
console.log("\n2. LABEL PRESENCE");
{
  const panelSource = readSource("components/mastery/MasteryPanel.tsx");
  check('panel source contains the literal string "All time"', panelSource.includes("All time"));
  check('panel source contains the literal string "Recent"', panelSource.includes("Recent"));
  check(
    'panel source contains the literal string "Not yet measured"',
    panelSource.includes("Not yet measured")
  );
  check("panel source contains <dt", panelSource.includes("<dt"));
  check("panel source contains <dl", panelSource.includes("<dl"));
}

// === Section 3: NO COMPUTATION IN THE COMPONENT ===========================
console.log("\n3. NO COMPUTATION IN THE COMPONENT");
{
  const panelSource = readSource("components/mastery/MasteryPanel.tsx");
  const FORBIDDEN_IMPORT_PATHS = [
    "lib/mastery/compute",
    "lib/mastery/thinness",
    "lib/mastery/weights",
    "lib/mastery/ledger",
  ];
  for (const forbiddenPath of FORBIDDEN_IMPORT_PATHS) {
    check(
      `panel does not import from ${forbiddenPath}`,
      !panelSource.includes(forbiddenPath)
    );
  }
  check(
    "panel source does not reference evidenceTierFor",
    !panelSource.includes("evidenceTierFor")
  );
  check(
    "panel source does not reference THINNESS_THRESHOLDS",
    !panelSource.includes("THINNESS_THRESHOLDS")
  );
  check(
    "panel source contains no percent threshold comparison (> 40, >= 55, < 70, >= 85)",
    !/[<>]=?\s*(40|55|70|85)\b/.test(panelSource)
  );
}

// === Section 4: NO STREAK OR UNLOCK COPY ==================================
console.log("\n4. NO STREAK OR UNLOCK COPY");
{
  // Re-runs 21-17's forbidden-identifier scan over components/mastery/ and
  // app/mastery/ specifically. Those two directories did not exist when
  // 21-17's scripts/verify-levels-goals.ts ran its own walk, so that walk
  // could not have covered them — this duplication is deliberate, not an
  // oversight, so a reviewer sees why the same scan appears twice.
  function stripCommentsAndStrings(source: string): string {
    let result = "";
    let i = 0;
    const n = source.length;
    while (i < n) {
      const twoChars = source.slice(i, i + 2);
      if (twoChars === "//") {
        while (i < n && source[i] !== "\n") i += 1;
        continue;
      }
      if (twoChars === "/*") {
        i += 2;
        while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
        i += 2;
        continue;
      }
      const ch = source[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        i += 1;
        while (i < n && source[i] !== quote) {
          if (source[i] === "\\") {
            i += 2;
            continue;
          }
          i += 1;
        }
        i += 1;
        continue;
      }
      result += ch;
      i += 1;
    }
    return result;
  }

  function walkFiles(root: string): string[] {
    const absRoot = path.join(process.cwd(), root);
    if (!fs.existsSync(absRoot)) return [];
    const results: string[] = [];
    function recurse(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          recurse(full);
        } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
          results.push(full);
        }
      }
    }
    recurse(absRoot);
    return results;
  }

  const WALK_ROOTS = ["components/mastery", "app/mastery"];
  const walkedFiles = WALK_ROOTS.flatMap((root) => walkFiles(root));
  console.log(`  walked ${walkedFiles.length} file(s) across: ${WALK_ROOTS.join(", ")}`);
  check("walked file count is non-vacuous (at least 2)", walkedFiles.length >= 2, `walked ${walkedFiles.length}`);

  const STREAK_TERMS = ["streak", "consecutive", "dayStreak", "longestRun", "chainLength", "freeze"];
  const UNLOCK_TERMS = ["isUnlocked", "unlock", "locked", "prerequisite", "requiresLevel", "gatedBy", "availableAfter"];

  function findForbiddenMatches(terms: string[]): Array<{ file: string; term: string }> {
    const matches: Array<{ file: string; term: string }> = [];
    for (const file of walkedFiles) {
      const source = fs.readFileSync(file, "utf-8");
      const stripped = stripCommentsAndStrings(source).toLowerCase();
      for (const term of terms) {
        if (stripped.includes(term.toLowerCase())) {
          matches.push({ file: path.relative(process.cwd(), file), term });
        }
      }
    }
    return matches;
  }

  const streakMatches = findForbiddenMatches(STREAK_TERMS);
  check(
    "no streak/consecutive-day term appears outside a comment in components/mastery or app/mastery",
    streakMatches.length === 0,
    JSON.stringify(streakMatches)
  );

  const unlockMatches = findForbiddenMatches(UNLOCK_TERMS);
  check(
    "no unlock/lock/prerequisite/gate term appears outside a comment in components/mastery or app/mastery",
    unlockMatches.length === 0,
    JSON.stringify(unlockMatches)
  );
}

// === Section 5: NAV REACHABILITY (REQ-106) ================================
console.log("\n5. NAV REACHABILITY (REQ-106)");
{
  const navbarSource = readSource("components/auth-navbar.tsx");
  const iconMapMatch = navbarSource.match(/const iconMap = \{([\s\S]*?)\}/);
  const iconMapBlock = iconMapMatch ? iconMapMatch[1] : "";

  function reachabilityIssues(
    navItems: ReadonlyArray<{ label: string; href: string; icon: string }>
  ): string[] {
    const issues: string[] = [];
    const masteryEntry = navItems.find((item) => item.href === "/mastery");
    if (!masteryEntry) {
      issues.push("no studentNavItems entry with href '/mastery'");
      return issues;
    }
    if (!iconMapBlock.includes(masteryEntry.icon)) {
      issues.push(`icon '${masteryEntry.icon}' is not a key in auth-navbar's iconMap block`);
    }
    return issues;
  }

  const realIssues = reachabilityIssues(siteConfig.studentNavItems);
  check(
    "siteConfig.studentNavItems contains a '/mastery' entry whose icon is a key of auth-navbar's iconMap",
    realIssues.length === 0,
    JSON.stringify(realIssues)
  );

  // Prove the guard actually bites: run the same predicate against a
  // synthetic studentNavItems with the /mastery entry removed, and confirm
  // it reports missing rather than passing vacuously.
  const withoutMastery = siteConfig.studentNavItems.filter((item) => item.href !== "/mastery");
  const biteIssues = reachabilityIssues(withoutMastery);
  check(
    "the reachability guard reports missing when the /mastery entry is removed (proves it bites)",
    biteIssues.length === 1 && biteIssues[0].includes("no studentNavItems entry"),
    JSON.stringify(biteIssues)
  );
}

// === Section 6: ROUTE SHAPE ================================================
console.log("\n6. ROUTE SHAPE");
{
  const routeSource = readSource("app/api/mastery/route.ts");
  check("route exports GET", /export\s+async\s+function\s+GET\b/.test(routeSource));
  check("route does not export POST", !/export\s+async\s+function\s+POST\b/.test(routeSource));
  check("route does not export PUT", !/export\s+async\s+function\s+PUT\b/.test(routeSource));
  check("route does not export PATCH", !/export\s+async\s+function\s+PATCH\b/.test(routeSource));
  check("route does not export DELETE", !/export\s+async\s+function\s+DELETE\b/.test(routeSource));
  check("route contains 'no-store'", routeSource.includes("no-store"));
  check("route contains 'toMasteryDTO'", routeSource.includes("toMasteryDTO"));
  check('route does not contain "UTC" as a timezone fallback', !routeSource.includes('"UTC"'));
}

// === Section 7: EMPTY-STUDENT CASE =========================================
console.log("\n7. EMPTY-STUDENT CASE");
{
  const emptyResult = computeMastery([], NOW);
  const emptyDto = toMasteryDTO(emptyResult);

  check(
    "empty-student overall.lifetimePercent is null",
    emptyDto.overall.lifetimePercent === null
  );
  check(
    "empty-student overall.currentPercent is null",
    emptyDto.overall.currentPercent === null
  );
  check(
    "every competency is present",
    emptyDto.competencies.length === COMPETENCIES.length,
    `got ${emptyDto.competencies.length}`
  );
  check(
    "every competency has tier NONE on both lifetime and current",
    emptyDto.competencies.every((c) => c.lifetime.tier === "NONE" && c.current.tier === "NONE")
  );
  check(
    "every competency has a non-null disclosure on both lifetime and current",
    emptyDto.competencies.every((c) => c.lifetime.disclosure !== null && c.current.disclosure !== null)
  );
  check(
    "no competency's percent is 0 — every one is null",
    emptyDto.competencies.every((c) => c.lifetime.percent === null && c.current.percent === null)
  );
}


// === Section 8: GROWTH FIELDS (Phase 23) ===================================
console.log("\n8. GROWTH FIELDS: sources, trend, drivers, recent growth");
{
  const DAY = 24 * 60 * 60 * 1000;
  const [KEY_A] = COMPETENCY_KEYS;
  const row = (o: Partial<MasteryContributionRow>): MasteryContributionRow => ({
    id: `r-${Math.random()}`,
    userId: "u",
    competencyKey: KEY_A,
    source: "LIVE_SESSION",
    rawScore: 0.5,
    weight: 1,
    sourceReportId: null,
    sourceAttemptId: null,
    sourceCoachedSessionId: null,
    reversedAt: null,
    reversedReason: null,
    occurredAt: NOW,
    createdAt: NOW,
    ...o,
  });
  const rows = [
    row({ rawScore: 0.25, occurredAt: new Date(NOW.getTime() - 40 * DAY), sourceReportId: "old" }),
    row({ rawScore: 1, occurredAt: new Date(NOW.getTime() - DAY), sourceReportId: "rep-1" }),
    row({ source: "CHECK_DETERMINISTIC", weight: 0.45, rawScore: 1, occurredAt: new Date(NOW.getTime() - DAY), sourceAttemptId: "att-1" }),
  ];
  const result = computeMastery(rows, NOW);
  const links = new Map<string, ActivityLink>([
    [activityKeyForDriver({ sourceReportId: "rep-1", sourceAttemptId: null, sourceCoachedSessionId: null })!, { href: "/practice/case-study/report/rep-1", label: "Case study session" }],
  ]);
  const dto = toMasteryDTO(result, { activityLinks: links });
  const a = dto.competencies.find((c) => c.competencyKey === KEY_A)!;

  check("every competency carries 3 labelled sources", dto.competencies.every((c) => c.sources.length === 3 && c.sources.every((x) => x.label.length > 0)));
  check(
    "sources split live vs path (live | check, coached)",
    a.sources.map((x) => `${x.origin}:${x.group}`).join() === "live:live,check:path,coached:path"
  );
  check("live source counts 2 lifetime, check counts 1", a.sources[0].lifetime.evidenceCount === 2 && a.sources[1].lifetime.evidenceCount === 1);
  check("trend points carry ISO strings, last one ends at now", a.trend.length > 0 && a.trend[a.trend.length - 1].endsAt === NOW.toISOString());
  check("windowChange carries the pre-window figure (25) and a delta", a.windowChange.startPercent === 25 && a.windowChange.delta !== null);
  const repDriver = a.drivers.find((d) => d.href === "/practice/case-study/report/rep-1");
  check("a resolved driver gets its href and activity label", repDriver?.activityLabel === "Case study session");
  const checkDriver = a.drivers.find((d) => d.origin === "check");
  check("an unresolved driver renders with href null and a fallback label", checkDriver?.href === null && checkDriver?.activityLabel === "Knowledge check");
  check("recentGrowth names A with its label and drivers", dto.recentGrowth[0]?.competencyKey === KEY_A && dto.recentGrowth[0].label === a.label && dto.recentGrowth[0].drivers.length === a.drivers.length);
  const unlinked = toMasteryDTO(result);
  check("bite: without the link map, no driver has an href", unlinked.competencies.every((c) => c.drivers.every((d) => d.href === null)));
  check("growth DTO survives a JSON round trip", JSON.stringify(JSON.parse(JSON.stringify(dto))) === JSON.stringify(dto));

  const panelSource = readSource("components/mastery/MasteryPanel.tsx");
  check('panel renders a "Recent growth" section', panelSource.includes("Recent growth") && panelSource.includes("mastery.recentGrowth"));
  check('panel renders evidence sources ("Evidence from")', panelSource.includes("Evidence from") && panelSource.includes("competency.sources"));
  check("panel renders a trend (Sparkline)", panelSource.includes("<Sparkline"));
  check("panel renders level badges", panelSource.includes("LevelBadge"));
  check("panel does not import the server link resolver", !panelSource.includes("activity-links") && !panelSource.includes("lib/prisma"));

  // Page copy must name live practice, not only path learning.
  const copyIssues = (src: string) => {
    const issues: string[] = [];
    if (/built from every coached session\s+and knowledge check you have completed/.test(src)) issues.push("old path-only copy");
    if (!/live practice/i.test(src)) issues.push("does not mention live practice");
    return issues;
  };
  const pageSource = readSource("app/mastery/page.tsx");
  check("page copy names live practice sessions", copyIssues(pageSource).length === 0, JSON.stringify(copyIssues(pageSource)));
  check(
    "bite: the copy predicate FAILS on the old path-only sentence",
    copyIssues("built from every coached session\n and knowledge check you have completed.").length === 2
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
if (failures > 0) {
  process.exit(1);
}
