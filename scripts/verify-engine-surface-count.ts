/**
 * Filesystem guard: Phase 13's "exactly one of each" engine surface (REQ-59)
 * and the single camera-consent copy (REQ-70).
 *
 * Fails on the first regression so Phases 14–16 cannot re-fork a per-type tree.
 *
 * Run: npx tsx scripts/verify-engine-surface-count.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();

let failures = 0;

function fail(msg: string): never {
  console.log(`  FAIL ${msg}`);
  failures += 1;
  console.log(`\nverify-engine-surface-count: FAILED (${failures} failure(s))\n`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`  ok   ${msg}`);
}

function abs(...parts: string[]) {
  return join(ROOT, ...parts);
}

function rel(p: string) {
  return relative(ROOT, p);
}

function pathExists(...parts: string[]) {
  return existsSync(abs(...parts));
}

function assertAbsent(label: string, ...parts: string[]) {
  if (pathExists(...parts)) {
    fail(`${label} must not exist: ${parts.join("/")}`);
  }
  ok(`${label} absent (${parts.join("/")})`);
}

function assertExactlyOneFile(label: string, expectedRel: string) {
  if (!pathExists(...expectedRel.split("/"))) {
    fail(`${label}: expected file missing: ${expectedRel}`);
  }
  ok(`${label}: ${expectedRel}`);
}

/** Walk a directory tree; skip node_modules / .next / .git. */
function walkFiles(dir: string, out: string[] = []): string[] {
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
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log("\n1. Session lifecycle — exactly one start / checkpoint / finish under practice");
{
  const expected = [
    "app/api/practice/session/start/route.ts",
    "app/api/practice/session/checkpoint/route.ts",
    "app/api/practice/session/finish/route.ts",
  ];
  for (const p of expected) assertExactlyOneFile("session route", p);

  const sessionRoutes = walkFiles(abs("app/api")).filter((f) =>
    /[/\\]session[/\\](start|checkpoint|finish)[/\\]route\.ts$/.test(f)
  );
  if (sessionRoutes.length !== 3) {
    fail(
      `expected exactly 3 session lifecycle routes, found ${sessionRoutes.length}:\n` +
        sessionRoutes.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok(`exactly 3 session lifecycle route files under app/api`);

  assertAbsent("interview session tree", "app/api/interview/session");
  assertAbsent("scenario session tree", "app/api/scenario/session");
}

// ---------------------------------------------------------------------------
console.log("\n2. Report surfaces — exactly one GET / retry / reports-list");
{
  assertExactlyOneFile(
    "report-GET",
    "app/api/practice/report/[reportId]/route.ts"
  );
  assertExactlyOneFile(
    "retry",
    "app/api/practice/report/[reportId]/retry/route.ts"
  );
  assertExactlyOneFile("reports-list", "app/api/practice/reports/route.ts");

  const reportGets = walkFiles(abs("app/api")).filter((f) =>
    /[/\\]report[/\\]\[[^\]]+\][/\\]route\.ts$/.test(f)
  );
  if (reportGets.length !== 1) {
    fail(
      `expected exactly 1 report-GET route, found ${reportGets.length}:\n` +
        reportGets.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 report-GET under app/api");

  const retries = walkFiles(abs("app/api")).filter((f) =>
    /[/\\]retry[/\\]route\.ts$/.test(f)
  );
  if (retries.length !== 1) {
    fail(
      `expected exactly 1 retry route, found ${retries.length}:\n` +
        retries.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 retry under app/api");

  const lists = walkFiles(abs("app/api")).filter((f) =>
    /[/\\]reports[/\\]route\.ts$/.test(f)
  );
  if (lists.length !== 1) {
    fail(
      `expected exactly 1 reports-list route, found ${lists.length}:\n` +
        lists.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 reports-list under app/api");
}

// ---------------------------------------------------------------------------
console.log("\n3. Evaluation — exactly one runner and one evaluator module under lib/");
{
  assertExactlyOneFile("evaluation runner", "lib/engine/evaluation-runner.ts");
  assertExactlyOneFile("evaluator module", "lib/engine/evaluation.ts");

  const runners = walkFiles(abs("lib")).filter((f) =>
    f.endsWith("evaluation-runner.ts")
  );
  if (runners.length !== 1) {
    fail(
      `expected exactly 1 evaluation-runner.ts under lib/, found ${runners.length}:\n` +
        runners.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 evaluation-runner.ts under lib/");

  const evalModules = walkFiles(abs("lib")).filter((f) =>
    /[/\\]evaluation\.ts$/.test(f)
  );
  if (evalModules.length !== 1) {
    fail(
      `expected exactly 1 evaluation.ts under lib/, found ${evalModules.length}:\n` +
        evalModules.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 evaluation.ts under lib/");

  assertAbsent("legacy interview evaluation", "lib/interview/evaluation.ts");
  assertAbsent(
    "legacy interview evaluation-runner",
    "lib/interview/evaluation-runner.ts"
  );
  assertAbsent("legacy scenario evaluation", "lib/scenario/evaluation.ts");
  assertAbsent(
    "legacy scenario evaluation-runner",
    "lib/scenario/evaluation-runner.ts"
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. Report DTO — exactly one under lib/");
{
  assertExactlyOneFile("report DTO", "lib/report/dto.ts");
  assertAbsent("legacy interview report-dto", "lib/interview/report-dto.ts");
  assertAbsent("legacy scenario report-dto", "lib/scenario/report-dto.ts");

  const reportDtoNamed = walkFiles(abs("lib")).filter((f) =>
    /[/\\]report-dto\.ts$/.test(f)
  );
  if (reportDtoNamed.length !== 0) {
    fail(
      `legacy report-dto.ts files must not exist, found ${reportDtoNamed.length}:\n` +
        reportDtoNamed.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("no lib/**/report-dto.ts leftovers");
}

// ---------------------------------------------------------------------------
console.log("\n5. Session shell + report page — exactly one each");
{
  assertExactlyOneFile(
    "session shell",
    "components/practice/PracticeSessionShell.tsx"
  );
  assertAbsent(
    "legacy InterviewSessionShell",
    "components/interview/InterviewSessionShell.tsx"
  );

  const shells = walkFiles(abs("components")).filter((f) =>
    /SessionShell\.tsx$/.test(f)
  );
  if (shells.length !== 1) {
    fail(
      `expected exactly 1 *SessionShell.tsx under components/, found ${shells.length}:\n` +
        shells.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 SessionShell under components/");

  assertExactlyOneFile(
    "report page",
    "app/practice/[type]/report/[reportId]/page.tsx"
  );
  assertAbsent(
    "legacy interview report page tree",
    "app/interview/[type]/report"
  );
  assertAbsent(
    "legacy case-play report page tree",
    "app/case-play/[caseId]/report"
  );

  const reportPages = walkFiles(abs("app")).filter((f) =>
    /[/\\]report[/\\]\[[^\]]+\][/\\]page\.tsx$/.test(f)
  );
  if (reportPages.length !== 1) {
    fail(
      `expected exactly 1 report page under app/, found ${reportPages.length}:\n` +
        reportPages.map((f) => `         ${rel(f)}`).join("\n")
    );
  }
  ok("exactly 1 report page under app/");
}

// ---------------------------------------------------------------------------
console.log("\n6. CAMERA_BLOCK_COPY defined exactly once (REQ-70)");
{
  const codeFiles = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("components")),
    ...walkFiles(abs("lib")),
  ].filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  // A definition is `const CAMERA_BLOCK_COPY` or `export const CAMERA_BLOCK_COPY`
  // (not a comment or a usage).
  const defRe = /^\s*(?:export\s+)?const\s+CAMERA_BLOCK_COPY\b/m;
  const defs: string[] = [];
  for (const f of codeFiles) {
    let src: string;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (defRe.test(src)) defs.push(rel(f));
  }

  if (defs.length !== 1) {
    fail(
      `expected CAMERA_BLOCK_COPY defined exactly once, found ${defs.length}:\n` +
        (defs.length
          ? defs.map((d) => `         ${d}`).join("\n")
          : "         (none)")
    );
  }
  if (defs[0] !== "components/practice/steps/CameraConsentStep.tsx") {
    fail(
      `CAMERA_BLOCK_COPY must live in CameraConsentStep.tsx, found in ${defs[0]}`
    );
  }
  ok(`CAMERA_BLOCK_COPY defined once in ${defs[0]}`);
}

console.log("\nverify-engine-surface-count: ALL CHECKS PASSED\n");
process.exit(0);
