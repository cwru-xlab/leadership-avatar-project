/**
 * run-verify-all — one command that runs every guard and tells the truth.
 *
 * WHY THIS EXISTS
 *
 * There are 130+ `scripts/verify-*.ts` guards and, until now, no way to run
 * them together. Only 14 were reachable through `package.json`, so the rest
 * were only ever run by whoever remembered they existed.
 *
 * The cost of that was measured: a route refactor left 17 assertions reading
 * 2-11 line re-export wrappers, and nobody noticed. `verify-coach-containment`
 * asserted `ENGINE_TYPES.length === 13` through seven engine-type additions —
 * a check whose entire job was to notice registry growth, blind to it. Neither
 * would have survived a single full run.
 *
 * Three outcomes, never conflated:
 *
 *   PASS  exit 0, and the script actually ran its checks
 *   SKIP  exit 0 because a precondition was missing (no key, no dev server).
 *         NOT a pass; printed and counted separately so it cannot be read as
 *         one. Ten "failures" in an earlier sweep were only a missing
 *         OPENAI_API_KEY, and the misreading cost real debugging time.
 *   FAIL  exit non-zero: a genuine assertion failure
 *
 * Usage:
 *   npm run verify:fast             # 116 deterministic guards, ~2.5 min, no API calls
 *   npm run verify:all              # everything, including model-calling guards
 *   npm run verify:all -- deck      # only guards whose name matches "deck"
 *
 * WHICH ONE TO GATE ON
 *
 * `verify:fast` is the reliable signal: 116 guards, all source/registry
 * assertions, reproducibly green. Use it before committing.
 *
 * `verify:all` additionally runs the `*-grading` and `*-live` guards, which
 * send real transcripts to a model and assert on returned rubric scores. They
 * are inherently non-deterministic — measured here, five failed in one sweep
 * and four of those five passed unchanged on immediate re-run. Treat a single
 * red from that tier as a signal to re-run, not as a regression, and only
 * investigate a failure that reproduces.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const fast = args.includes("--fast");
const filters = args.filter((a) => !a.startsWith("--"));

/** Guards that make real model calls: minutes each, and they cost money. */
const SLOW = /-(grading|live|live-prompt)$|^verify-(calibrate|deck-routes)/;

const scripts = readdirSync(path.join(root, "scripts"))
  .filter((f) => f.startsWith("verify-") && f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .filter((name) => (filters.length === 0 ? true : filters.some((f) => name.includes(f))))
  .filter((name) => (fast ? !SLOW.test(name) : true))
  .sort();

type Outcome = "pass" | "skip" | "fail";
interface Result {
  name: string;
  outcome: Outcome;
  ms: number;
  detail: string;
}

function run(name: string): Promise<Result> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("npx", ["tsx", path.join("scripts", `${name}.ts`)], {
      cwd: root,
      env: process.env,
    });

    let out = "";

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => {
      const ms = Date.now() - started;
      // A guard that exits 0 after printing the SKIP banner did not run its
      // checks. Trusting the exit code alone would count it as a pass.
      const skipped = /^\s*SKIP\s+not run:/m.test(out);
      const outcome: Outcome = skipped ? "skip" : code === 0 ? "pass" : "fail";
      const reason = out.match(/^\s*SKIP\s+not run:\s*(.+)$/m)?.[1] ?? "";
      const firstFail =
        out.match(/^\s*(?:FAIL|✗)\s+(.+)$/m)?.[1] ??
        out.match(/^\s*(\w*Error:.*)$/m)?.[1] ??
        "";

      resolve({
        name,
        outcome,
        ms,
        detail: skipped ? reason : firstFail,
      });
    });
  });
}

async function main() {
  console.log(`\n=== verify:all — ${scripts.length} guard(s)${fast ? " (--fast)" : ""} ===\n`);

  const results: Result[] = [];

  // Sequential on purpose: several guards read and write shared fixture files,
  // and the model-calling ones are rate-limited.
  for (const name of scripts) {
    const r = await run(name);

    results.push(r);
    const tag = r.outcome === "pass" ? "PASS" : r.outcome === "skip" ? "SKIP" : "FAIL";
    const secs = `${(r.ms / 1000).toFixed(1)}s`.padStart(7);

    console.log(
      `  ${tag}  ${secs}  ${r.name}${r.detail ? `\n              ${r.detail}` : ""}`,
    );
  }

  const passed = results.filter((r) => r.outcome === "pass");
  const skipped = results.filter((r) => r.outcome === "skip");
  const failed = results.filter((r) => r.outcome === "fail");

  console.log(`\n=== ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed ===`);

  if (skipped.length > 0) {
    console.log("\nSkipped (preconditions missing — these checks did NOT run):");
    for (const r of skipped) console.log(`  ${r.name} — ${r.detail}`);
  }

  if (failed.length > 0) {
    console.log("\nFailed:");
    for (const r of failed) console.log(`  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    process.exit(1);
  }

  console.log("\nNo failures.\n");
}

void main();
