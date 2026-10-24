/**
 * Proves plan 21-17's two additions (per-competency levels, daily/weekly
 * goals) and — the larger half — proves the two mechanics 21-CONTEXT.md
 * rejected (streaks, unlocking) are ABSENT, by a comment-stripped source
 * scan plus API-shape assertions that no signature in this codebase accepts
 * a gate.
 *
 * Entirely database-free: builds `MasteryContributionRow` literals and a
 * fixed `now`. No model call.
 *
 * Run: npx tsx scripts/verify-levels-goals.ts
 * Must pass with NO `DATABASE_URL` and NO `OPENAI_API_KEY` set.
 */
import * as fs from "fs";
import * as path from "path";
import { levelFor, LEVEL_THRESHOLDS } from "../lib/mastery/levels";
import { goalProgress, GOAL_DEFAULTS } from "../lib/study-plan/goals";
import type { MasteryContributionRow } from "../lib/mastery/ledger";
import { markStepComplete } from "../lib/study-plan/path";
import { nextStepFor } from "../lib/study-plan/next-step";

let failures = 0;
let checkCount = 0;

function check(name: string, pass: boolean, detail?: string) {
  checkCount += 1;
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function row(
  id: string,
  occurredAt: string,
  opts?: { sourceReportId?: string | null; sourceAttemptId?: string | null }
): MasteryContributionRow {
  return {
    id,
    userId: "u1",
    competencyKey: "k",
    source: "LIVE_SESSION",
    rawScore: 1,
    weight: 1,
    sourceReportId: opts?.sourceReportId ?? null,
    sourceAttemptId: opts?.sourceAttemptId ?? null,
    sourceCoachedSessionId: null,
    reversedAt: null,
    reversedReason: null,
    occurredAt: new Date(occurredAt),
    createdAt: new Date(occurredAt),
  };
}

console.log("\n=== Section 1: LEVEL BOUNDARIES ===");

check("39.9% -> level 1", levelFor({ percent: 39.9, tier: "ESTABLISHED" }).level === 1);
check("40% -> level 2 (inclusive lower bound)", levelFor({ percent: 40, tier: "ESTABLISHED" }).level === 2);
check("54.9% -> level 2", levelFor({ percent: 54.9, tier: "ESTABLISHED" }).level === 2);
check("55% -> level 3 (inclusive lower bound)", levelFor({ percent: 55, tier: "ESTABLISHED" }).level === 3);
check("69.9% -> level 3", levelFor({ percent: 69.9, tier: "ESTABLISHED" }).level === 3);
check("70% -> level 4 (inclusive lower bound)", levelFor({ percent: 70, tier: "ESTABLISHED" }).level === 4);
check("84.9% -> level 4", levelFor({ percent: 84.9, tier: "ESTABLISHED" }).level === 4);
check("85% -> level 5 (inclusive lower bound)", levelFor({ percent: 85, tier: "ESTABLISHED" }).level === 5);
check("0% -> level 1", levelFor({ percent: 0, tier: "ESTABLISHED" }).level === 1);
check("100% -> level 5", levelFor({ percent: 100, tier: "ESTABLISHED" }).level === 5);
check("null percent -> null level", levelFor({ percent: null, tier: "NONE" }).level === null);
check("null percent -> name 'Not yet measured'", levelFor({ percent: null, tier: "NONE" }).name === "Not yet measured");

check(
  "-1% throws",
  (() => {
    try {
      levelFor({ percent: -1, tier: "ESTABLISHED" });
      return false;
    } catch {
      return true;
    }
  })()
);
check(
  "101% throws",
  (() => {
    try {
      levelFor({ percent: 101, tier: "ESTABLISHED" });
      return false;
    } catch {
      return true;
    }
  })()
);

const thinResult = levelFor({ percent: 90, tier: "THIN" });
check("THIN tier at 90% -> level 5", thinResult.level === 5);
check("THIN tier at 90% -> provisional: true", thinResult.provisional === true);
const establishedResult = levelFor({ percent: 90, tier: "ESTABLISHED" });
check("ESTABLISHED tier at 90% -> provisional: false", establishedResult.provisional === false);

check("nextLevelAtPercent at level 1 is 40", levelFor({ percent: 0, tier: "ESTABLISHED" }).nextLevelAtPercent === 40);
check("nextLevelAtPercent at level 2 is 55", levelFor({ percent: 40, tier: "ESTABLISHED" }).nextLevelAtPercent === 55);
check("nextLevelAtPercent at level 3 is 70", levelFor({ percent: 55, tier: "ESTABLISHED" }).nextLevelAtPercent === 70);
check("nextLevelAtPercent at level 4 is 85", levelFor({ percent: 70, tier: "ESTABLISHED" }).nextLevelAtPercent === 85);
check("nextLevelAtPercent at level 5 is null", levelFor({ percent: 85, tier: "ESTABLISHED" }).nextLevelAtPercent === null);
check("LEVEL_THRESHOLDS has exactly 5 entries", LEVEL_THRESHOLDS.length === 5);

console.log("\n=== Section 2: GOAL WINDOWS ===");

const NOW = new Date("2026-10-16T23:30:00Z"); // Friday, local 19:30 in America/New_York
const TZ = "America/New_York";

{
  // Local Fri 18:00 counts toward daily; local Thu 22:00 (UTC Fri 02:00) does
  // NOT count toward daily but DOES count toward weekly. This pair is the
  // whole reason timeZone is a required parameter: a UTC-naive "today" would
  // get this pair wrong in one direction or the other.
  const fridayEvening = row("r1", "2026-10-16T22:00:00Z"); // local Fri 18:00
  const thursdayLate = row("r2", "2026-10-16T02:00:00Z"); // local Thu 22:00 (prior local day)

  const progress = goalProgress({
    contributions: [fridayEvening, thursdayLate],
    now: NOW,
    timeZone: TZ,
  });

  check(
    "local-Fri-18:00 contribution counts toward daily (timezone-sensitive)",
    progress.daily.completed === 1
  );
  check(
    "local-Thu-22:00 contribution does NOT count toward daily (timezone-sensitive, would with a UTC-naive 'today')",
    (() => {
      const dailyOnly = goalProgress({
        contributions: [thursdayLate],
        now: NOW,
        timeZone: TZ,
      });
      return dailyOnly.daily.completed === 0;
    })()
  );
  check(
    "local-Thu-22:00 contribution DOES count toward weekly",
    (() => {
      const weeklyOnly = goalProgress({
        contributions: [thursdayLate],
        now: NOW,
        timeZone: TZ,
      });
      return weeklyOnly.weekly.completed === 1;
    })()
  );
}

{
  const monday = row("r3", "2026-10-12T10:00:00Z"); // Monday local, current week
  const priorSunday = row("r4", "2026-10-11T10:00:00Z"); // Sunday local, prior week

  const mondayOnly = goalProgress({ contributions: [monday], now: NOW, timeZone: TZ });
  check("Monday-of-current-week contribution counts toward weekly", mondayOnly.weekly.completed === 1);

  const sundayOnly = goalProgress({ contributions: [priorSunday], now: NOW, timeZone: TZ });
  check("Sunday-of-prior-week contribution does NOT count toward weekly", sundayOnly.weekly.completed === 0);
}

{
  const progress = goalProgress({ contributions: [], now: NOW, timeZone: TZ });
  check(
    "windowStart/windowEnd are returned as strings",
    typeof progress.daily.windowStart === "string" &&
      typeof progress.daily.windowEnd === "string" &&
      typeof progress.weekly.windowStart === "string" &&
      typeof progress.weekly.windowEnd === "string"
  );
  // Local midnight Fri Oct 16 2026 in America/New_York (EDT, UTC-4) is
  // 2026-10-16T04:00:00.000Z.
  check(
    "daily window starts at local midnight (2026-10-16T04:00:00.000Z in America/New_York)",
    progress.daily.windowStart === "2026-10-16T04:00:00.000Z",
    `got ${progress.daily.windowStart}`
  );
}

console.log("\n=== Section 3: ACTIVITY GROUPING ===");

{
  // Three contributions sharing one sourceReportId (as 21-16 writes for one
  // coached session, one row per competency) -> 1 activity, not 3.
  const oneSession = [
    row("s1", "2026-10-16T22:00:00Z", { sourceReportId: "report-1" }),
    row("s2", "2026-10-16T22:01:00Z", { sourceReportId: "report-1" }),
    row("s3", "2026-10-16T22:02:00Z", { sourceReportId: "report-1" }),
  ];
  const progress = goalProgress({ contributions: oneSession, now: NOW, timeZone: TZ });
  check(
    "three contributions sharing one sourceReportId count as ONE activity, not three",
    progress.daily.completed === 1,
    `got ${progress.daily.completed}`
  );
}

{
  // Two with different sourceReportIds plus two with different
  // sourceAttemptIds -> 4 distinct activities.
  const fourActivities = [
    row("a1", "2026-10-16T22:00:00Z", { sourceReportId: "report-A" }),
    row("a2", "2026-10-16T22:01:00Z", { sourceReportId: "report-B" }),
    row("a3", "2026-10-16T22:02:00Z", { sourceAttemptId: "attempt-A" }),
    row("a4", "2026-10-16T22:03:00Z", { sourceAttemptId: "attempt-B" }),
  ];
  const progress = goalProgress({
    contributions: fourActivities,
    now: NOW,
    timeZone: TZ,
    targets: { weeklyActivities: 4 },
  });
  check(
    "two different sourceReportIds + two different sourceAttemptIds count as FOUR activities",
    progress.weekly.completed === 4,
    `got ${progress.weekly.completed}`
  );
  check("met flips true exactly at the target (4 >= 4)", progress.weekly.met === true);

  const belowTarget = goalProgress({
    contributions: fourActivities.slice(0, 3),
    now: NOW,
    timeZone: TZ,
    targets: { weeklyActivities: 4 },
  });
  check(
    "met is false one activity short of the target (3 < 4)",
    belowTarget.weekly.met === false,
    `got completed=${belowTarget.weekly.completed}`
  );
}

{
  // One row with BOTH sourceReportId and sourceAttemptId null -> counted as
  // its own activity, keyed by its own row id. Documented choice: a
  // sourceless row cannot be folded into any other row's group, since there
  // is no larger unit (session/attempt) to attribute it to.
  const sourceless = row("lonely", "2026-10-16T22:00:00Z");
  const progress = goalProgress({ contributions: [sourceless], now: NOW, timeZone: TZ });
  check(
    "a row with both sourceReportId and sourceAttemptId null counts as its own activity (keyed by row id)",
    progress.daily.completed === 1
  );
}

console.log("\n=== Section 4: NO STREAKS (negative guard) ===");

const WALK_ROOTS = [
  "lib/mastery",
  "lib/study-plan",
  "components/mastery",
  "components/study-plan",
];

/**
 * Strips double-slash line comments, slash-star block comments, AND string
 * literals (single/double-quoted and template) from TypeScript source,
 * before a forbidden-identifier scan.
 *
 * Comments are stripped so this plan's OWN deliberate "what does not exist"
 * documentation (which necessarily uses the word "streak" to say it is
 * absent) does not fail the guard — the natural "fix" for a failing guard
 * would otherwise be deleting the documentation, which is exactly backwards.
 *
 * String literals are ALSO stripped, for a second reason: the guard is
 * meant to catch actual gating CODE (an identifier like `isUnlocked`, a
 * `locked: true` field, a `.filter()` call), not an incidental English word
 * inside a human-readable string — e.g. `path.ts`'s existing error message
 * `` `(locked by 21-CONTEXT.md)` `` uses "locked" to describe a numeric
 * bound being fixed by a product decision, nothing to do with step/level
 * unlocking. Stripping strings first ALSO fixes a latent bug a naive
 * comment-stripper would otherwise have: a string containing `//` (e.g. a
 * URL) would be misread as a line-comment start if strings were not
 * recognized as their own state.
 *
 * This is a single-pass state machine over the string, not a full TS
 * parser — it tracks string/comment state to avoid exactly the `//`-inside-
 * a-string misread above, and handles backslash escapes inside strings, but
 * does not handle every pathological case a real tokenizer would (e.g. a
 * regex literal containing `/*`). Sufficient for this codebase's actual
 * source.
 */
function stripCommentsAndStrings(source: string): string {
  let result = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
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
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2; // skip the escaped character too
          continue;
        }
        i += 1;
      }
      i += 1; // consume closing quote
      continue;
    }

    result += ch;
    i += 1;
  }
  return result;
}

/**
 * A single, narrow, DOCUMENTED exclusion from the forbidden-term scan: the
 * literal substring `locked_by`, which exists in `lib/mastery/weights.ts`
 * (predating this plan, outside this plan's `files_modified`, not
 * reword-able under the shared-working-tree protocol) as a governance
 * field name on `WEIGHT_ORDERING_CONSTRAINTS` — recording WHICH decision
 * fixed a weight ordering, nothing to do with feature access. Plain
 * substring matching (needed below to catch a term embedded in a camelCase
 * identifier, e.g. a hypothetical `dailyStreak`) would otherwise flag this
 * unrelated word every run. This is the ONLY exclusion; it removes exactly
 * the eight-character sequence "locked_by" and nothing else, so a real
 * `locked`, `isLocked`, or `locked:` anywhere else is still caught.
 */
function withKnownUnrelatedCollisionsRemoved(source: string): string {
  return source.replace(/locked_by/gi, "");
}

function walkFiles(root: string): string[] {
  const absRoot = path.join(process.cwd(), root);
  if (!fs.existsSync(absRoot)) {
    return [];
  }
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

const walkedFiles: string[] = WALK_ROOTS.flatMap((root) => walkFiles(root));
console.log(`  walked ${walkedFiles.length} file(s) across: ${WALK_ROOTS.join(", ")}`);

check(
  "walked file count is non-vacuous (greater than 10)",
  walkedFiles.length > 10,
  `walked ${walkedFiles.length}`
);

const STREAK_TERMS = ["streak", "consecutive", "dayStreak", "longestRun", "chainLength", "freeze"];
const UNLOCK_TERMS = [
  "isUnlocked",
  "unlock",
  "locked",
  "prerequisite",
  "requiresLevel",
  "gatedBy",
  "availableAfter",
];

function findForbiddenMatches(terms: string[]): Array<{ file: string; term: string }> {
  const matches: Array<{ file: string; term: string }> = [];
  for (const file of walkedFiles) {
    const source = fs.readFileSync(file, "utf-8");
    const stripped = withKnownUnrelatedCollisionsRemoved(
      stripCommentsAndStrings(source)
    ).toLowerCase();
    for (const term of terms) {
      if (stripped.includes(term.toLowerCase())) {
        matches.push({ file: path.relative(process.cwd(), file), term });
      }
    }
  }
  return matches;
}

const streakMatches = findForbiddenMatches(STREAK_TERMS);
console.log(`  streak/consecutive-term matches outside comments: ${JSON.stringify(streakMatches)}`);
check(
  "no streak/consecutive-day term appears outside a comment anywhere in the walked set",
  streakMatches.length === 0,
  JSON.stringify(streakMatches)
);

console.log("\n=== Section 5: NO UNLOCKING (negative guard + API shape) ===");

const unlockMatches = findForbiddenMatches(UNLOCK_TERMS);
console.log(`  unlock/gate-term matches outside comments: ${JSON.stringify(unlockMatches)}`);
check(
  "no unlock/lock/prerequisite/gate term appears outside a comment anywhere in the walked set",
  unlockMatches.length === 0,
  JSON.stringify(unlockMatches)
);

// Behavioural half: no exported signature in the actual, imported modules
// accepts a level, a prior-step id, or a completion precondition.
check(
  "markStepComplete(userId, stepId) takes exactly 2 parameters (no level/precondition arg)",
  markStepComplete.length === 2,
  `arity ${markStepComplete.length}`
);
check(
  "markStepComplete's own source signature line names no level/prior/precondition parameter",
  !/\(.*\b(level|priorStep|precondition|requiresLevel)\b.*\)\s*:/i.test(
    markStepComplete.toString().split("\n")[0]
  ),
  markStepComplete.toString().split("\n")[0]
);

check(
  "nextStepFor(path) takes exactly 1 parameter (no level/unlock-state arg)",
  nextStepFor.length === 1,
  `arity ${nextStepFor.length}`
);

check(
  "levelFor takes only { percent, tier } — not unlockedLevels/a content catalog",
  (() => {
    const src = levelFor.toString();
    const signatureLine = src.split("\n")[0] + src.split("\n")[1];
    return !/unlockedLevels|catalog|availableContent/i.test(signatureLine);
  })()
);

// Crude-but-honest smell detector: no file calls levelFor( and then chains a
// .filter( on the same line or the two following lines. This is a smell
// detector, not a proof — it can be defeated by reformatting or an
// intervening variable assignment — and is deliberately paired with the
// signature assertions above, which ARE a proof that the relevant functions'
// own parameter lists accept no gate.
function findLevelForFilterSmell(): Array<{ file: string; lineIndex: number }> {
  const hits: Array<{ file: string; lineIndex: number }> = [];
  for (const file of walkedFiles) {
    const source = fs.readFileSync(file, "utf-8");
    const stripped = stripCommentsAndStrings(source);
    const lines = stripped.split("\n");
    for (let idx = 0; idx < lines.length; idx += 1) {
      if (lines[idx].includes("levelFor(")) {
        const window = lines.slice(idx, idx + 3).join("\n");
        if (window.includes(".filter(")) {
          hits.push({ file: path.relative(process.cwd(), file), lineIndex: idx });
        }
      }
    }
  }
  return hits;
}

const filterSmellHits = findLevelForFilterSmell();
check(
  "no file calls levelFor( and chains .filter( within the same or next two lines",
  filterSmellHits.length === 0,
  JSON.stringify(filterSmellHits)
);

console.log(`\nTotal checks: ${checkCount}`);
console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log("ALL PASS");
  process.exit(0);
}
