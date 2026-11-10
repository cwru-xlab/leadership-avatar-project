/**
 * Environment preflight for guard scripts.
 *
 * WHY THIS EXISTS
 *
 * Some guards need things the repo cannot provide: a live `next dev` server, an
 * OpenAI key, a database. When those are absent the scripts exited non-zero
 * with provider stack traces, which is indistinguishable from a real
 * regression.
 *
 * That ambiguity is not hypothetical. A full-suite run without `.env.local`
 * loaded reported "19 failures"; ten were nothing but a missing
 * `OPENAI_API_KEY`, and the shape of the list (every `*-grading` and `*-live`
 * script) was initially read as evidence of a shared code defect. Two hours of
 * misdirection came from a guard that could not say "I need a key."
 *
 * A skip is not a pass. `skipGuard` exits 0 so an unconfigured laptop does not
 * show red, but it prints a SKIP banner naming exactly what was missing, and
 * the suite runner (`scripts/run-verify-all.ts`) counts and reports skips
 * separately so they can never be mistaken for green.
 */

/** Exits 0 with a loud, unambiguous SKIP banner. */
export function skipGuard(name: string, requirement: string, howTo?: string): never {
  console.log(`\n=== ${name} ===\n`);
  console.log(`  SKIP  not run: ${requirement}`);
  if (howTo) console.log(`        ${howTo}`);
  console.log("\nSKIPPED (not a pass — the checks above never executed).\n");
  process.exit(0);
}

/** True when every named env var is present and non-empty. */
export function hasEnv(...names: string[]): boolean {
  return names.every((n) => (process.env[n] ?? "").trim().length > 0);
}

/**
 * Skips unless every named env var is set.
 *
 * Call AFTER any `dotenv` loading the script does, so `.env.local` is honoured.
 */
export function requireEnv(name: string, vars: string[], howTo?: string): void {
  const missing = vars.filter((v) => (process.env[v] ?? "").trim().length === 0);

  if (missing.length > 0) {
    skipGuard(
      name,
      `missing ${missing.join(", ")}`,
      howTo ?? "Set it in .env.local, then re-run.",
    );
  }
}

/**
 * Skips unless an HTTP server answers at `baseUrl`.
 *
 * Probes with a short timeout so a missing dev server costs ~1s rather than
 * the default fetch timeout. Any HTTP response counts as reachable: a 404 or a
 * 307 redirect still proves the server is up.
 */
export async function requireServer(
  name: string,
  baseUrl: string,
  howTo?: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    await fetch(baseUrl, { signal: controller.signal, redirect: "manual" });
  } catch {
    skipGuard(
      name,
      `no server reachable at ${baseUrl}`,
      howTo ?? "Start it with `npm run dev`, then re-run.",
    );
  } finally {
    clearTimeout(timer);
  }
}
