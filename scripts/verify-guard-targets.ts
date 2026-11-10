/**
 * verify-guard-targets — the guard that guards the guards.
 *
 * WHY THIS EXISTS
 *
 * Source-reading guards assert that a string is present in (or absent from) a
 * file. That makes them silently dependent on a file path. When a refactor
 * moves the code but leaves the old path behind as a thin re-export wrapper,
 * every such assertion keeps "working" against a husk:
 *
 *   - POSITIVE assertions ("page mounts <JobDescriptionStep") start FAILING,
 *     which looks like a product regression and isn't.
 *   - NEGATIVE assertions ("page does NOT reference CameraConsentStep") start
 *     PASSING VACUOUSLY, which is worse: the guard reports green while
 *     protecting nothing.
 *
 * This happened once already, at scale. The `09dda6e` route unification moved
 * the practice launchers into `components/practice/routes/*` and left
 * `app/practice/[type]/page.tsx` (11 lines), `[instanceId]/page.tsx` (2 lines)
 * and `report/[reportId]/page.tsx` (2 lines) behind as wrappers. Eight guard
 * scripts kept reading the wrappers, producing 17 failures that all looked
 * like unrelated regressions, plus an unknown number of vacuous passes.
 *
 * So this check fails when a guard script reads a thin wrapper for its
 * CONTENT. Reading a wrapper is legitimate when the wrapper itself is the
 * subject (route contracts assert the `notFound()` guard lives there), so
 * those pairs are allowlisted explicitly with a reason.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const rel = (p: string) => p.split(path.sep).join("/");

/**
 * A file is a "thin wrapper" when it exists only to re-export a component
 * that lives elsewhere: short, and delegating to `@/components`. The line
 * budget is deliberately generous — `app/practice/[type]/page.tsx` is 11 lines
 * because it also carries a `notFound()` slug guard.
 */
const WRAPPER_MAX_LINES = 20;

function isThinWrapper(absPath: string): boolean {
  const src = readFileSync(absPath, "utf8");
  const lines = src.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length > WRAPPER_MAX_LINES) return false;

  // Must delegate to a component defined somewhere else.
  return /from\s+["']@\/components\//.test(src);
}

/**
 * (script, path) pairs where reading the wrapper is the actual intent.
 * Every entry needs a reason, so a future reader can tell an intentional
 * wrapper assertion from a stale one.
 */
const INTENTIONAL_WRAPPER_READS = new Map<string, string>([
  [
    "verify-route-contract.ts::app/practice/[type]/page.tsx",
    "Asserts the wrapper's own `type === \"technical-coding\") notFound()` slug guard.",
  ],
  [
    "verify-route-contract.ts::app/practice/interviews/technical/page.tsx",
    "Asserts the canonical technical route wrapper launches TechnicalCodingPracticePage.",
  ],
]);

/**
 * Matches a path literal being read for content on one line, e.g.
 *   read("components/practice/routes/PracticeTypePage.tsx")
 *   source("app/x/page.tsx")
 *
 * Only `read(...)`/`source(...)`/`readFileSync(...)` style content reads are
 * flagged. Bare path literals used for existence checks (`existsSync`) or in
 * expected-inventory arrays are intentionally ignored: those are about the
 * route existing, not about what is inside it.
 *
 * All source roots are scanned, not just `app/`. The refactor that motivated
 * this check moved code INTO `components/`, so the next husk is as likely to
 * appear there as under `app/`.
 */
const SOURCE_ROOTS = "(?:app|components|lib)";
const CONTENT_READ_RE = new RegExp(
  `(?:readFileSync|read|source|code)\\s*\\(\\s*["'](${SOURCE_ROOTS}/[^"']+\\.tsx?)["']`,
  "g",
);

/** `const PAGE_PATH = "components/..."` later fed to a content reader. */
const PATH_CONST_RE = new RegExp(
  `const\\s+(\\w+)\\s*=\\s*["'](${SOURCE_ROOTS}/[^"']+\\.tsx?)["']\\s*;`,
  "g",
);

/**
 * Path literals inside an array that is iterated into a reader, e.g.
 *   for (const p of ["components/a.tsx", "lib/b.ts"]) { const t = source(p); }
 *
 * These are invisible to the single-line patterns above, which is how the
 * first draft of this very check missed five of the paths it was written to
 * protect.
 *
 * This is matched narrowly — the loop variable must actually reach a reader
 * inside the loop body. A blanket scan for bare path literals was tried first
 * and produced 10 false positives: guards legitimately hold path literals for
 * glob patterns, existence/uniqueness assertions (`assertExactlyOneFile`), and
 * absence assertions for deleted modules. None of those are content reads.
 */
function arrayFedReadTargets(src: string): string[] {
  const out: string[] = [];
  // Non-greedy up to the closing `]) {`. A `[^\]]*` class was tried first and
  // silently matched nothing: Next.js paths like `app/practice/[type]/page.tsx`
  // contain `]`, so a guard for route refactors could not parse route paths.
  const loopRe = /for\s*\(\s*const\s+(\w+)\s+of\s*\[([\s\S]*?)\]\s*\)\s*\{/g;

  for (const m of src.matchAll(loopRe)) {
    const [, variable, arrayBody] = m;
    const bodyStart = m.index! + m[0]!.length;
    const body = src.slice(bodyStart, bodyStart + 600);
    const readsVar = new RegExp(
      `(?:readFileSync|read|source|code)\\s*\\(\\s*${variable}\\s*[),]`,
    ).test(body);

    if (!readsVar) continue;

    for (const lit of arrayBody.matchAll(
      new RegExp(`["'](${SOURCE_ROOTS}/[^"']+\\.tsx?)["']`, "g"),
    )) {
      out.push(lit[1]!);
    }
  }

  return out;
}

/**
 * Path built from segment arrays rather than a single literal, e.g.
 *   fs.readFileSync(path.join(ROOT, "app", "practice", "[type]", "page.tsx"))
 *   for (const page of [["app","practice","[type]","page.tsx"]]) ...
 *
 * `verify-prove-it.ts` used both forms and so escaped the literal-path scan
 * entirely: five of its checks were reading 2-11 line wrappers. Joining the
 * segments reconstructs the path the reader will actually open.
 *
 * Existence checks are excluded. `fs.existsSync(path.join(ROOT, "app", ...))`
 * is asserting that a ROUTE exists (or, in the inverted-assertion idiom, that a
 * deliberately-wrong path does not) — the wrapper is the correct target there,
 * and flagging it produced four false positives on the first run.
 */
function segmentJoinedReadTargets(src: string): string[] {
  const out: string[] = [];
  // A run of >= 2 quoted segments, the last ending in .ts/.tsx, rooted at a
  // known source directory.
  const runRe =
    /["'](app|components|lib)["']\s*,\s*((?:["'][^"']+["']\s*,\s*)*["'][^"']+\.tsx?["'])/g;

  for (const m of src.matchAll(runRe)) {
    // Look back far enough to see `existsSync(path.join(` before the segments.
    // Must tolerate newlines: the idiom is frequently formatted as
    //   const x = fs.existsSync(
    //     path.join(ROOT, "app", ...),
    //   );
    const before = src.slice(Math.max(0, m.index! - 120), m.index!);

    if (/existsSync\s*\(\s*(?:[\w.]*\.)?join\s*\(\s*[\w.]*\s*,?\s*$/.test(before)) {
      continue;
    }

    const segments = [
      m[1]!,
      ...[...m[2]!.matchAll(/["']([^"']+)["']/g)].map((s) => s[1]!),
    ];

    out.push(segments.join("/"));
  }

  return out;
}

interface Finding {
  script: string;
  target: string;
  lines: number;
  via: string;
}

const findings: Finding[] = [];
const scripts = readdirSync(path.join(root, "scripts"))
  .filter((f) => f.startsWith("verify-") && f.endsWith(".ts"))
  .filter((f) => f !== "verify-guard-targets.ts")
  .sort();

for (const script of scripts) {
  // Read as latin1: a couple of guards embed raw binary fixtures (PE/ZIP
  // magic bytes for forged-upload tests), which makes utf8 decoding lossy.
  const src = readFileSync(path.join(root, "scripts", script), "latin1");

  const targets = new Map<string, string>();

  for (const m of src.matchAll(CONTENT_READ_RE)) {
    targets.set(m[1]!, `${m[0]!.split("(")[0]!}("...")`);
  }

  // A path held in a const, then used with any reader, is still a content read.
  for (const m of src.matchAll(PATH_CONST_RE)) {
    const [, name, target] = m;
    const usedForContent = new RegExp(
      `(?:readFileSync|read|source|code)\\s*\\([^)]*\\b${name}\\b`,
    ).test(src);

    if (usedForContent) targets.set(target!, `const ${name}`);
  }

  for (const target of arrayFedReadTargets(src)) {
    if (!targets.has(target)) targets.set(target, "path list -> reader");
  }

  for (const target of segmentJoinedReadTargets(src)) {
    if (!targets.has(target)) targets.set(target, "path.join segments");
  }

  for (const [target, via] of targets) {
    const absPath = path.join(root, target);

    if (INTENTIONAL_WRAPPER_READS.has(`${script}::${target}`)) continue;

    if (!existsSync(absPath)) {
      findings.push({ script, target, lines: -1, via });
      continue;
    }
    if (!isThinWrapper(absPath)) continue;

    const lines = readFileSync(absPath, "utf8").split("\n").length;

    findings.push({ script, target, lines, via });
  }
}

console.log("\n=== verify-guard-targets ===\n");
console.log(`Scanned ${scripts.length} guard scripts.`);

if (findings.length === 0) {
  console.log("\n  ok   no guard reads a thin wrapper (or a missing file) for content\n");
  console.log("All checks passed.\n");
  process.exit(0);
}

console.log(`\n  FAIL ${findings.length} guard content-read(s) point at a husk:\n`);

for (const f of findings) {
  const what =
    f.lines === -1
      ? "DOES NOT EXIST"
      : `is a ${f.lines}-line re-export wrapper`;

  console.log(`    ${f.script}`);
  console.log(`      reads ${f.target} via ${f.via}`);
  console.log(`      -> that file ${what}.`);
  console.log(
    "      Positive assertions against it fail spuriously; negative ones pass vacuously.",
  );
  console.log(
    "      Repoint it at the file that now holds the code, or allowlist it in",
  );
  console.log("      INTENTIONAL_WRAPPER_READS with a reason.\n");
}

process.exit(1);
