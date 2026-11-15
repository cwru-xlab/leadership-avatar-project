/**
 * verify-technical-post-session — the post-session material is complete,
 * correct and server-only.
 *
 * Students see this material after a READY coding report, so a wrong model
 * solution would teach a wrong answer with the app's authority behind it.
 * This guard therefore EXECUTES every solution rather than reading it:
 *
 *   1. Completeness: every catalog assignment has an approach (2–5
 *      paragraphs), a complexity, 2–4 pitfalls, and a Python and a JavaScript
 *      model solution whose entry signature matches the starter code.
 *   2. Correctness: the Python model solution, the JavaScript model solution
 *      and the catalog's own `referenceSolution` each run in a child process
 *      against every public AND hidden test. Both harnesses are loaded from
 *      `public/technical-runner.worker.js` itself (the Python HARNESS string
 *      and the `runJavaScript` function), so "passes here" means "passes the
 *      comparison the candidate's browser uses".
 *   3. Revisions: every (id, version, hash) a report can persist — the current
 *      tuple and each historical v1 tuple — resolves to material, and a
 *      near-miss hash does not.
 *   4. Server-only: no module reachable from a "use client" file imports the
 *      material or the private catalog. Type-only imports are allowed; they
 *      are erased at build time and ship no content.
 *
 * Needs python3 and node on PATH; without python3 it prints a SKIP banner.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  TECHNICAL_ASSIGNMENTS,
  listHistoricalTechnicalAssignmentTuples,
} from "../lib/technical-interview/assignments.server";
import {
  getPostSessionMaterial,
  getPostSessionMaterialForRevision,
  listPostSessionMaterialIds,
} from "../lib/technical-interview/post-session.server";
import { ALGORITHM_MATERIAL } from "../lib/technical-interview/post-session/algorithms.server";
import { ARRAY_MATERIAL } from "../lib/technical-interview/post-session/arrays.server";
import { STRING_MATERIAL } from "../lib/technical-interview/post-session/strings.server";
import { skipGuard } from "./guard-env";

const NAME = "verify-technical-post-session";
const root = path.resolve(__dirname, "..");
const failures: string[] = [];
const fail = (message: string) => failures.push(message);

// ---------------------------------------------------------------------------
// 1. Completeness
// ---------------------------------------------------------------------------

const catalogIds = TECHNICAL_ASSIGNMENTS.map((assignment) => assignment.id);
const materialIds = listPostSessionMaterialIds();
const authoredCount =
  Object.keys(ARRAY_MATERIAL).length +
  Object.keys(STRING_MATERIAL).length +
  Object.keys(ALGORITHM_MATERIAL).length;
if (authoredCount !== materialIds.length) {
  fail(`an assignment id is authored in more than one post-session content file (${authoredCount} entries, ${materialIds.length} ids)`);
}
for (const id of materialIds) {
  if (!catalogIds.includes(id)) fail(`${id}: material is authored for an id that is not in the catalog`);
}
if (getPostSessionMaterial("not-a-real-assignment") !== null) fail("unknown ids must return null");
if (getPostSessionMaterial("constructor") !== null) fail("prototype keys must not resolve to material");

const pythonSignature = (source: string) => /^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/m.exec(source);
const javascriptSignature = (source: string) => /^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/m.exec(source);
const normalizeParameters = (parameters: string) => parameters.split(",").map((parameter) => parameter.trim()).join(", ");

for (const assignment of TECHNICAL_ASSIGNMENTS) {
  const material = getPostSessionMaterial(assignment.id);
  if (!material) {
    fail(`${assignment.id}: no post-session material`);
    continue;
  }
  const paragraphs = material.approach.split(/\n\s*\n/).map((paragraph) => paragraph.trim());
  if (paragraphs.length < 2 || paragraphs.length > 5 || paragraphs.some((paragraph) => paragraph.length < 40)) {
    fail(`${assignment.id}: approach needs 2–5 substantive paragraphs (found ${paragraphs.length})`);
  }
  if (!/O\(/.test(material.complexity)) fail(`${assignment.id}: complexity must state a big-O target`);
  if (material.pitfalls.length < 2 || material.pitfalls.length > 4 || material.pitfalls.some((pitfall) => pitfall.trim().length < 20)) {
    fail(`${assignment.id}: needs 2–4 substantive pitfalls`);
  }
  if (new Set(material.pitfalls).size !== material.pitfalls.length) fail(`${assignment.id}: duplicate pitfall`);

  const starterPython = pythonSignature(assignment.starterCodeByLanguage.python);
  const starterJavaScript = javascriptSignature(assignment.starterCodeByLanguage.javascript);
  const modelPython = pythonSignature(material.modelSolutions.python ?? "");
  const modelJavaScript = javascriptSignature(material.modelSolutions.javascript ?? "");
  if (!starterPython || !modelPython || starterPython[1] !== modelPython[1] || normalizeParameters(starterPython[2]) !== normalizeParameters(modelPython[2])) {
    fail(`${assignment.id}: Python model solution must declare ${starterPython?.[0] ?? "the starter signature"}`);
  }
  if (!starterJavaScript || !modelJavaScript || starterJavaScript[1] !== modelJavaScript[1] || normalizeParameters(starterJavaScript[2]) !== normalizeParameters(modelJavaScript[2])) {
    fail(`${assignment.id}: JavaScript model solution must declare ${starterJavaScript?.[0] ?? "the starter signature"}`);
  }
  if (/^\s*(pass|\/\/ Write your solution here\.)\s*$/m.test(material.modelSolutions.python + material.modelSolutions.javascript)) {
    fail(`${assignment.id}: model solution still contains starter placeholder code`);
  }
  if (!/#/.test(material.modelSolutions.python) || !/\/\//.test(material.modelSolutions.javascript)) {
    fail(`${assignment.id}: model solutions must be commented`);
  }
}

// ---------------------------------------------------------------------------
// 3. Revisions a report can reference
// ---------------------------------------------------------------------------

const tuples = [
  ...TECHNICAL_ASSIGNMENTS.map((assignment) => ({ id: assignment.id, version: assignment.version, hash: assignment.contentHash, label: "current" })),
  ...listHistoricalTechnicalAssignmentTuples().map((tuple) => ({ id: tuple.assignmentId, version: tuple.assignmentVersion, hash: tuple.assignmentHash, label: `v1/${tuple.generation}` })),
];
for (const tuple of tuples) {
  if (!getPostSessionMaterialForRevision(tuple.id, tuple.version, tuple.hash)) {
    fail(`${tuple.id} (${tuple.label}): a persisted revision does not resolve to material`);
  }
  if (getPostSessionMaterialForRevision(tuple.id, tuple.version, `${tuple.hash}x`)) {
    fail(`${tuple.id} (${tuple.label}): a near-miss hash must not resolve to material`);
  }
}

// ---------------------------------------------------------------------------
// 4. Server-only: walk the import graph from every "use client" module
// ---------------------------------------------------------------------------

const FORBIDDEN = [
  "lib/technical-interview/assignments.server.ts",
  "lib/technical-interview/post-session.server.ts",
  "lib/technical-interview/post-session/",
];
const SOURCE_DIRS = ["app", "components", "lib", "hooks", "contexts", "utils", "types"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function listSources(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...listSources(full));
    else if (EXTENSIONS.includes(path.extname(entry))) files.push(full);
  }
  return files;
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null; // A package, not project source.
  const candidates = [base, ...EXTENSIONS.map((extension) => base + extension), ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`))];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

/** Runtime imports only: `import type …` / `export type … from` ship nothing. */
function runtimeImports(source: string): string[] {
  const specifiers: string[] = [];
  const statement = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(statement)) {
    if (!match[2]) specifiers.push(match[3]);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);
  for (const match of source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);
  return specifiers;
}

const isClientModule = (source: string) =>
  /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(source);

const allSources = SOURCE_DIRS.flatMap((directory) => listSources(path.join(root, directory)));
const clientRoots = allSources.filter((file) => isClientModule(readFileSync(file, "utf8")));
const reachedFrom = new Map<string, string>();
const queue = [...clientRoots];
for (const file of clientRoots) reachedFrom.set(file, "(client root)");
while (queue.length > 0) {
  const file = queue.shift()!;
  for (const specifier of runtimeImports(readFileSync(file, "utf8"))) {
    const target = resolveImport(file, specifier);
    if (!target || reachedFrom.has(target)) continue;
    reachedFrom.set(target, file);
    queue.push(target);
  }
}
for (const [file, importer] of reachedFrom) {
  const relative = path.relative(root, file);
  if (FORBIDDEN.some((forbidden) => relative === forbidden || relative.startsWith(forbidden))) {
    fail(`server-only module ${relative} is reachable from client code (imported by ${path.relative(root, importer)})`);
  }
}
if (clientRoots.length < 20) fail(`expected to find many "use client" modules, found ${clientRoots.length}; the walker is broken`);

// ---------------------------------------------------------------------------
// 2. Execute every solution against every public and hidden test
// ---------------------------------------------------------------------------

const python = spawnSync("python3", ["--version"], { encoding: "utf8" });
if (python.status !== 0) {
  if (failures.length) {
    console.error(failures.map((failure) => `  FAIL  ${failure}`).join("\n"));
    process.exit(1);
  }
  skipGuard(NAME, "python3 is not on PATH", "Install Python 3 to execute the model and reference solutions.");
}

const workerPath = path.join(root, "public/technical-runner.worker.js");
const workDirectory = mkdtempSync(path.join(tmpdir(), "technical-post-session-"));

const PYTHON_DRIVER = `
import json, sys
source_path, harness_path, spec_path = sys.argv[1:4]
namespace = {"__name__": "__candidate__"}
exec(compile(open(source_path).read(), "solution.py", "exec"), namespace)
exec(open(harness_path).read(), namespace)
print(namespace["__run_visible_tests"](open(spec_path).read()))
`;

// Loads the browser worker in a sandbox and calls its own runJavaScript, so
// the comparison is byte-for-byte the one candidates get.
const NODE_DRIVER = `
const fs = require("node:fs");
const vm = require("node:vm");
const [workerPath, sourcePath, specPath, harnessOut] = process.argv.slice(2);
const context = vm.createContext({ self: {}, console });
vm.runInContext(fs.readFileSync(workerPath, "utf8") + "\\n;globalThis.__HARNESS = HARNESS;", context);
if (harnessOut) { fs.writeFileSync(harnessOut, context.__HARNESS); process.exit(0); }
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const outcome = context.runJavaScript(fs.readFileSync(sourcePath, "utf8"), spec.entry, spec.tests);
process.stdout.write(JSON.stringify(outcome));
`;

const pythonDriverPath = path.join(workDirectory, "driver.py");
const nodeDriverPath = path.join(workDirectory, "driver.cjs");
const harnessPath = path.join(workDirectory, "harness.py");
writeFileSync(pythonDriverPath, PYTHON_DRIVER);
writeFileSync(nodeDriverPath, NODE_DRIVER);
const extracted = spawnSync("node", [nodeDriverPath, workerPath, "", "", harnessPath], { encoding: "utf8" });
if (extracted.status !== 0 || !existsSync(harnessPath)) {
  fail(`could not load the Python harness from the browser worker: ${extracted.stderr}`);
}

type Outcome = { passed: number; total: number; problems: string[] };

function summarize(results: Array<{ id: string; passed: boolean; produced?: string; expected?: string; error?: string }>, total: number): Outcome {
  const problems = results
    .filter((result) => !result.passed)
    .map((result) => `${result.id}: ${result.error ?? `got ${result.produced}, expected ${result.expected}`}`);
  if (results.length !== total) problems.push(`ran ${results.length} of ${total} tests`);
  return { passed: results.filter((result) => result.passed).length, total, problems };
}

function runPython(label: string, source: string, spec: object, total: number): Outcome {
  const sourcePath = path.join(workDirectory, `${label}.py`);
  const specPath = path.join(workDirectory, `${label}.json`);
  writeFileSync(sourcePath, source);
  writeFileSync(specPath, JSON.stringify(spec));
  const run = spawnSync("python3", ["-I", pythonDriverPath, sourcePath, harnessPath, specPath], { encoding: "utf8", timeout: 20_000, cwd: workDirectory });
  if (run.status !== 0) return { passed: 0, total, problems: [`process failed: ${(run.stderr || run.error?.message || "").trim().split("\n").slice(-3).join(" · ")}`] };
  return summarize(JSON.parse(run.stdout).results, total);
}

function runJavaScript(label: string, source: string, spec: object, total: number): Outcome {
  const sourcePath = path.join(workDirectory, `${label}.js`);
  const specPath = path.join(workDirectory, `${label}.json`);
  writeFileSync(sourcePath, source);
  writeFileSync(specPath, JSON.stringify(spec));
  const run = spawnSync("node", [nodeDriverPath, workerPath, sourcePath, specPath], { encoding: "utf8", timeout: 20_000, cwd: workDirectory });
  if (run.status !== 0) return { passed: 0, total, problems: [`process failed: ${(run.stderr || run.error?.message || "").trim().split("\n").slice(-3).join(" · ")}`] };
  const outcome = JSON.parse(run.stdout);
  if (outcome.status !== "completed") return { passed: 0, total, problems: [`${outcome.errorCategory}: ${outcome.message}`] };
  return summarize(outcome.results, total);
}

const rows: string[][] = [];
try {
  for (const assignment of TECHNICAL_ASSIGNMENTS) {
    const material = getPostSessionMaterial(assignment.id);
    const entry = pythonSignature(assignment.starterCode)?.[1] ?? "";
    const tests = [...assignment.publicTestCases, ...assignment.hiddenTests].map(({ id, input, expected }) => ({ id, input, expected }));
    const spec = { entry, tests };
    const runs: Array<[string, () => Outcome | null]> = [
      ["python", () => (material ? runPython(`${assignment.id}-model`, material.modelSolutions.python, spec, tests.length) : null)],
      ["javascript", () => (material ? runJavaScript(`${assignment.id}-model`, material.modelSolutions.javascript, spec, tests.length) : null)],
      ["reference", () => runPython(`${assignment.id}-reference`, assignment.referenceSolution, spec, tests.length)],
    ];
    const cells = [assignment.id, `${assignment.publicTestCases.length}+${assignment.hiddenTests.length}`];
    for (const [label, run] of runs) {
      const outcome = run();
      if (!outcome) {
        cells.push("missing");
        continue;
      }
      cells.push(`${outcome.passed}/${outcome.total}${outcome.problems.length ? " FAIL" : ""}`);
      for (const problem of outcome.problems) fail(`${assignment.id} ${label}: ${problem}`);
    }
    rows.push(cells);
  }
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

console.log(`\n=== ${NAME} ===\n`);
const header = ["assignment", "pub+hid", "python", "javascript", "reference"];
const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column])).join("  ");
console.log(line(header));
for (const row of rows) console.log(line(row));
console.log(
  `\nRevisions checked: ${tuples.length}. Client modules walked: ${clientRoots.length} roots, ${reachedFrom.size} reachable files.`,
);

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((failure) => `  FAIL  ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`\nPost-session material verified for ${TECHNICAL_ASSIGNMENTS.length} assignments: every model and reference solution passes every public and hidden test.`);
