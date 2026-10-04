/**
 * Spike: prove generate → (edit) → distill against what exists TODAY.
 *
 * 1. Calls `generatePersonDescription` directly (three seniority/field hints).
 * 2. Asserts each description is editable prose (not a persona sentence).
 * 3. POSTs each description to the live Phase 8 route
 *    `POST /api/interview/persona/distill` (distillPersona is private today).
 * 4. Prints a final hint → description length → persona → displayName table.
 *
 * Auth cookie: the distill route requires a logged-in user. Either:
 *   - Set SPIKE_AUTH_COOKIE to the raw `auth-token=<jwt>` cookie value, OR
 *   - Leave it unset and this script will POST /api/auth/login as
 *     student@case.edu / student123 (dev only) and capture Set-Cookie.
 *
 * Requires: OPENAI_API_KEY (via .env.local), `npm run dev` on :3000.
 *
 * Run: npx tsx --env-file=.env.local scripts/spike-networking-person-generation.ts
 *
 * Not a unit test — makes real model calls. Do not add to CI.
 */

import {
  generatePersonDescription,
  MAX_GENERATED_DESCRIPTION_LENGTH,
} from "../lib/networking/person-generation";

const BASE_URL = process.env.SPIKE_BASE_URL || "http://localhost:3000";
const MAX_PERSONA_LENGTH = 600;

const HINTS = [
  "a busy VP of marketing at a mid-size CPG company, friendly but short on time",
  "a technical recruiter who screens a hundred engineers a month",
  "a peer-level data engineer two years out of school",
] as const;

type Triple = {
  hint: string;
  description: string;
  persona: string;
  displayName: string;
};

function fail(message: string): never {
  console.error(`\nFAIL: ${message}`);
  process.exit(1);
}

function assertDescription(hint: string, description: string) {
  if (!description.trim()) {
    fail(`empty description for hint: ${hint}`);
  }
  if (description.length > MAX_GENERATED_DESCRIPTION_LENGTH) {
    fail(
      `description length ${description.length} > ${MAX_GENERATED_DESCRIPTION_LENGTH}`,
    );
  }
  if (/[#*]|^- /m.test(description)) {
    fail(`description contains markdown markers for hint: ${hint}\n${description}`);
  }
  if (/^here\b/i.test(description.trim())) {
    fail(`description starts with "Here" for hint: ${hint}\n${description}`);
  }
  if (/^you are\b/i.test(description.trim())) {
    fail(
      `description opens with "You are" (distiller register) for hint: ${hint}\n${description}`,
    );
  }
}

async function obtainAuthCookie(): Promise<string> {
  if (process.env.SPIKE_AUTH_COOKIE?.trim()) {
    return process.env.SPIKE_AUTH_COOKIE.trim();
  }

  console.log("1b. Logging in as student@case.edu to obtain auth cookie...");
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@case.edu",
      password: "student123",
    }),
  });

  if (!res.ok) {
    fail(`login failed: HTTP ${res.status} ${await res.text()}`);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const authLine =
    setCookie.find((c) => c.startsWith("auth-token=")) ||
    // Fallback for runtimes without getSetCookie
    (res.headers.get("set-cookie") || "")
      .split(/,(?=\s*auth-token=)/)
      .find((c) => c.includes("auth-token="));

  if (!authLine) {
    fail(
      "login succeeded but no auth-token Set-Cookie returned. Set SPIKE_AUTH_COOKIE manually.",
    );
  }

  const cookiePair = authLine.split(";")[0]?.trim();
  if (!cookiePair?.startsWith("auth-token=")) {
    fail(`could not parse auth-token from Set-Cookie: ${authLine}`);
  }

  console.log("    ok — auth cookie captured");
  return cookiePair!;
}

async function distillViaHttp(
  cookie: string,
  profileText: string,
): Promise<{ persona: string; displayName: string }> {
  const res = await fetch(`${BASE_URL}/api/interview/persona/distill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ profileText }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    persona?: unknown;
    displayName?: unknown;
    error?: unknown;
  };

  if (!res.ok) {
    fail(
      `distill HTTP ${res.status}: ${typeof body.error === "string" ? body.error : JSON.stringify(body)}`,
    );
  }

  const persona = typeof body.persona === "string" ? body.persona : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName : "";

  if (!persona.trim()) {
    fail("distill returned empty persona");
  }
  if (persona.length > MAX_PERSONA_LENGTH) {
    fail(`persona length ${persona.length} > ${MAX_PERSONA_LENGTH}`);
  }

  return { persona, displayName };
}

async function main() {
  console.log("\n=== Spike: networking person generation → Phase 8 distill ===\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Hints: ${HINTS.length}`);

  console.log("\n1. Obtain auth cookie for live distill route");
  const cookie = await obtainAuthCookie();

  const triples: Triple[] = [];

  console.log("\n2. Generate descriptions (direct lib call)");
  for (let i = 0; i < HINTS.length; i++) {
    const hint = HINTS[i]!;
    console.log(`\n--- Hint ${i + 1} ---`);
    console.log(`HINT: ${hint}`);

    const { description } = await generatePersonDescription(hint);
    console.log(`DESCRIPTION (${description.length} chars):\n${description}`);
    assertDescription(hint, description);

    console.log("\n3. Distill via live Phase 8 route");
    const { persona, displayName } = await distillViaHttp(cookie, description);
    console.log(`PERSONA (${persona.length} chars):\n${persona}`);
    console.log(`DISPLAY NAME: ${displayName || "(empty)"}`);

    triples.push({ hint, description, persona, displayName });
  }

  console.log("\n4. Final table (hint → description length → persona → displayName)\n");
  console.log(
    "| # | hint (truncated) | desc len | displayName | persona (truncated) |",
  );
  console.log("|---|---|---|---|---|");
  triples.forEach((t, i) => {
    const hintShort =
      t.hint.length > 48 ? `${t.hint.slice(0, 45)}...` : t.hint;
    const personaShort =
      t.persona.length > 60 ? `${t.persona.slice(0, 57)}...` : t.persona;
    console.log(
      `| ${i + 1} | ${hintShort} | ${t.description.length} | ${t.displayName || "—"} | ${personaShort} |`,
    );
  });

  console.log("\n=== Full triples (for human judgement) ===\n");
  triples.forEach((t, i) => {
    console.log(`### Triple ${i + 1}`);
    console.log(`HINT: ${t.hint}`);
    console.log(`DESCRIPTION:\n${t.description}`);
    console.log(`PERSONA:\n${t.persona}`);
    console.log(`DISPLAY NAME: ${t.displayName || "(empty)"}`);
    console.log("");
  });

  console.log("OK — generate → distill proven for all three hints.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
