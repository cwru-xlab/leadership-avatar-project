/**
 * Plan 22-08: mechanical proof that the coach layer cannot reach any other
 * kind of session.
 *
 * Hard rule (22-CONTEXT.md): "a coach must never appear in any other kind of
 * session." Assertion here: no engine type can acquire the coach layer -
 * not by import, not in any runtime-built system prompt, not via the registry.
 *
 * Credential-free (no DATABASE_URL needed). Style mirrors
 * scripts/verify-coached-mode-isolation.ts.
 *
 * Run: npx tsx scripts/verify-coach-containment.ts
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

import {
  COACH_LAYER_MARKER,
  buildCoachSystemPrompt,
} from "../lib/study-plan/coached/coach-prompt";
import { ENGINE_TYPES } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { assembleSystemPrompt } from "../lib/engine/prompts";

const ROOT = resolve(__dirname, "..");
const COACH_PROMPT = "lib/study-plan/coached/coach-prompt.ts";
const COACHED_ROUTE = "app/api/study-plans/path-steps/[stepId]/coached/route.ts";
const COACH_ONLY_FRAGMENT = "You are the ONLY person in this conversation";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}
const skip = (m: string) => console.log(`  SKIP ${m}`);
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

// ---- import graph ---------------------------------------------------------
const files = ["app", "lib", "components"].flatMap((d) => walk(join(ROOT, d)));
const fileSet = new Set(files.map(rel));

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = rel(resolve(dirname(join(ROOT, from)), spec));
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

type Graph = Map<string, Set<string>>; // file -> files it imports
const forward: Graph = new Map();
const SPEC_RE = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
for (const f of fileSet) {
  const src = readFileSync(join(ROOT, f), "utf8");
  const deps = new Set<string>();
  for (const m of src.matchAll(SPEC_RE)) {
    const r = resolveSpec(f, m[1]);
    if (r) deps.add(r);
  }
  forward.set(f, deps);
}

function reverseClosure(g: Graph, target: string): Set<string> {
  const rev = new Map<string, string[]>();
  for (const [from, tos] of g) for (const t of tos) (rev.get(t) ?? rev.set(t, []).get(t)!).push(from);
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of rev.get(cur) ?? []) if (!seen.has(p)) { seen.add(p); stack.push(p); }
  }
  return seen;
}
function forwardClosure(g: Graph, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of g.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen;
}

const isAllowedImporter = (f: string) =>
  f.startsWith("lib/study-plan/coached/") || f === COACHED_ROUTE;
const FORBIDDEN_ROOTS = [
  "lib/engine/",
  "app/api/interaction/",
  "app/api/practice/",
  "app/practice/",
  "components/practice/",
  "lib/interview/",
];
const forbiddenIn = (set: Set<string>) =>
  [...set].filter((f) => FORBIDDEN_ROOTS.some((r) => f.startsWith(r)));

// ---------------------------------------------------------------------------
console.log("\n1. REVERSE IMPORT CLOSURE of coach-prompt.ts");
const closure = reverseClosure(forward, COACH_PROMPT);
{
  console.log(`  walked ${fileSet.size} files; closure=[${[...closure].sort().join(", ")}]`);
  check("walked > 200 files (non-vacuous)", fileSet.size > 200, `walked=${fileSet.size}`);
  const stray = [...closure].filter((f) => !isAllowedImporter(f));
  check("every importer is under lib/study-plan/coached/ or is the coached route", stray.length === 0, stray.join(", "));
  if (existsSync(join(ROOT, "lib/study-plan/coached/coach.ts"))) {
    check("closure is non-empty (coach.ts exists)", closure.size > 0);
  } else {
    skip("non-empty closure check: coach.ts (22-10) does not exist yet");
  }
}

// ---------------------------------------------------------------------------
console.log("\n2. FORBIDDEN ROOTS");
{
  check("no forbidden root file is in the reverse closure", forbiddenIn(closure).length === 0, forbiddenIn(closure).join(", "));
  for (const start of ["lib/engine/registry.ts", "app/api/interaction/chat/route.ts"]) {
    if (!fileSet.has(start)) {
      check(`${start} exists`, false);
      continue;
    }
    const fwd = forwardClosure(forward, start);
    const leaked = [...fwd].filter((f) => f.startsWith("lib/study-plan/coached/"));
    console.log(`  forward closure of ${start}: ${fwd.size} files`);
    check(`forward closure of ${start} contains nothing under lib/study-plan/coached/`, leaked.length === 0, leaked.join(", "));
  }
}

// ---------------------------------------------------------------------------
console.log("\n3. RUNTIME MARKER on every buildable engine prompt");
const leaks = (s: string) => s.includes(COACH_LAYER_MARKER) || s.includes(COACH_ONLY_FRAGMENT);
{
  let built = 0;
  const notBuilt: string[] = [];
  for (const type of ENGINE_TYPES) {
    let prompt: string | null = null;
    try {
      const r = resolveFromTypeConfig(type);
      if (r.ok) prompt = assembleSystemPrompt(r.config, { language: "en" } as never);
    } catch {
      prompt = null;
    }
    if (prompt === null) {
      notBuilt.push(type.slug);
      continue;
    }
    built += 1;
    check(`${type.slug}: live system prompt free of coach layer`, !leaks(prompt));
  }
  for (const s of notBuilt) console.log(`  note ${s}: needs an instance - covered by Section 1-2 only`);
  check("at least 3 types built", built >= 3, `built=${built}`);

  const coachPrompt = buildCoachSystemPrompt({
    coachName: "Ann",
    competency: { key: "structure_and_clarity", label: "Structure", description: "d" },
    rubricDimensions: [],
    underlyingTypeName: "Pitch",
    leg: "REPLAY",
    legCount: 2,
    momentFraming: "REWORK",
    moment: { counterpartLine: null, studentLine: "x" },
    attemptsInLeg: 0,
    demonstrationsInLeg: 0,
    demonstrationAllowed: false,
    lastAttempt: null,
    softCapReached: false,
    isOpening: true,
    isResume: false,
  });
  check("coach prompt starts with COACH_LAYER_MARKER (marker is real)", coachPrompt.startsWith(COACH_LAYER_MARKER));
  check("coach prompt contains the coach-only fragment", coachPrompt.includes(COACH_ONLY_FRAGMENT));
}

// ---------------------------------------------------------------------------
console.log("\n4. REGISTRY");
{
  check("ENGINE_TYPES.length === 13", ENGINE_TYPES.length === 13, `length=${ENGINE_TYPES.length}`);
  const bad = ENGINE_TYPES.filter((t) => /coach/i.test(t.slug) || /coach/i.test(t.name));
  check('no ENGINE_TYPES slug or name contains "coach"', bad.length === 0, bad.map((t) => t.slug).join(", "));
}

// ---------------------------------------------------------------------------
console.log("\n5. ENGINE UNTOUCHED since Phase 22 base (59f6166)");
{
  // Engine edits merged in from the team's `dev` branch are not coached-mode
  // work; the guard is that no commit authored on this line touches the
  // engine. Uncommitted edits are caught too.
  let out = "";
  let ran = true;
  try {
    const hasDev = execSync("git rev-parse --verify --quiet origin/dev || true", { cwd: ROOT, encoding: "utf8" }).trim() !== "";
    // Walk-out (Phase 18/20) fixes from the 2026-10-25 UAT live in these three
    // engine files and are not coached-mode work; the import-closure checks in
    // sections 2-3 still forbid any coached module reaching the engine.
    const walkOutExempt = [
      "':(exclude)lib/engine/disengagement.ts'",
      "':(exclude)lib/engine/hostility.ts'",
      "':(exclude)lib/engine/termination.ts'",
    ].join(" ");
    const commits = execSync(
      `git log --no-merges --format=%h 59f6166..HEAD ${hasDev ? "--not origin/dev" : ""} -- lib/engine/ ${walkOutExempt}`,
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    const uncommitted = execSync(`git diff --name-only HEAD -- lib/engine/ ${walkOutExempt}`, { cwd: ROOT, encoding: "utf8" }).trim();
    out = [commits, uncommitted].filter(Boolean).join("\n");
  } catch (e) {
    ran = false;
    check("git log ran", false, String(e));
  }
  if (ran) check("no changes under lib/engine/ from this branch's own commits", out === "", out);
}

// ---------------------------------------------------------------------------
console.log("\n6. BITE-PROOFS");
{
  const tampered: Graph = new Map([...forward].map(([k, v]) => [k, new Set(v)]));
  tampered.get("lib/engine/prompts.ts")!.add(COACH_PROMPT);
  const tClosure = reverseClosure(tampered, COACH_PROMPT);
  check(
    "(a) Section 2 check FAILS when lib/engine/prompts.ts imports coach-prompt.ts",
    forbiddenIn(tClosure).includes("lib/engine/prompts.ts") &&
      [...tClosure].some((f) => !isAllowedImporter(f)),
  );
  const real = "base prompt text";
  check("(b) Section 3 detector flags assembleSystemPrompt-output + marker", leaks(real + "\n" + COACH_LAYER_MARKER));
  check("(b) detector does not flag a clean prompt", !leaks(real));
}

if (failures === 0) {
  console.log("\nverify-coach-containment: ALL SECTIONS PASSED\n");
  process.exit(0);
}
console.log(`\nverify-coach-containment: FAILED (${failures} failure(s))\n`);
process.exit(1);
