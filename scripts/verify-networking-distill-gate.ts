/**
 * Proves plan 16-05: every networking distill gate rejection happens BEFORE
 * any model call, one tick authorises exactly one distillation, a failed
 * distillation does not refund the tick, only one distillation prompt exists
 * in the repo, and the Phase 8 interview distill route contract is intact.
 *
 * The model call is stubbed via __setDistillPersonaForVerify — zero provider
 * requests are made.
 *
 * Run against LOCAL dev DB only:
 *   DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *     npx tsx scripts/verify-networking-distill-gate.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { NextRequest } from "next/server";

import { createToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { siteConfig } from "../config/site";
import {
  ATTESTATION_FRESHNESS_SECONDS,
  CURRENT_ATTESTATION_WORDING_VERSION,
  recordAttestation,
} from "../lib/networking/attestation";
import { __setDistillPersonaForVerify } from "../lib/interview/persona-distill";
import { POST as networkingDistillPost } from "../app/api/networking/persona/distill/route";
import { POST as interviewDistillPost } from "../app/api/interview/persona/distill/route";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const PROFILE =
  "Alex Rivera is a product manager at a healthcare startup with ten years of experience.";

const testEmail = `distill-gate-verify-${randomUUID()}@example.com`;
const otherEmail = `distill-gate-verify-other-${randomUUID()}@example.com`;
let userId = "";
let otherUserId = "";
let userToken = "";
let otherToken = "";
const createdIds: string[] = [];

let spyCalls = 0;
let spyShouldThrow = false;

function resetSpy(opts: { throw?: boolean } = {}) {
  spyCalls = 0;
  spyShouldThrow = opts.throw === true;
  __setDistillPersonaForVerify(async () => {
    spyCalls += 1;
    if (spyShouldThrow) {
      throw new Error("forced-distill-failure");
    }
    return {
      persona:
        "Alex Rivera, a product manager at a healthcare startup with ten years of experience. You introduce yourself as Alex Rivera when the conversation opens.",
      displayName: "Alex Rivera",
    };
  });
}

function makePost(url: string, body: unknown, token: string): NextRequest {
  const headers = new Headers({
    "Content-Type": "application/json",
    Cookie: `${siteConfig.auth.cookie.name}=${token}`,
  });

  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  __setDistillPersonaForVerify(null);

  if (createdIds.length > 0) {
    await prisma.networkingAttestation.deleteMany({
      where: { id: { in: createdIds } },
    });
  }

  const userIds = [userId, otherUserId].filter(Boolean);

  if (userIds.length > 0) {
    await prisma.networkingAttestation.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

function extractErrorStrings(source: string): string[] {
  return [...source.matchAll(/error:\s*"([^"]+)"/g)].map((m) => m[1]);
}

async function main() {
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: "Distill Gate Verify",
      role: "STUDENT",
    },
  });
  userId = user.id;
  userToken = await createToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: "student",
  });

  const other = await prisma.user.create({
    data: {
      email: otherEmail,
      name: "Distill Gate Verify Other",
      role: "STUDENT",
    },
  });
  otherUserId = other.id;
  otherToken = await createToken({
    id: other.id,
    email: other.email,
    name: other.name,
    role: "student",
  });

  // ------------------------------------------------------------------
  console.log("\n1. One distiller declaration in the repo");
  {
    const out = execSync(
      "grep -rn \"PERSONA_DISTILL_SYSTEM_PROMPT\" app lib || true",
      { encoding: "utf8" },
    );
    const lines = out.split("\n").filter((l) => l.trim().length > 0);
    const declarations = lines.filter((l) =>
      /export\s+const\s+PERSONA_DISTILL_SYSTEM_PROMPT\s*=/.test(l),
    );
    const outsideModule = lines.filter(
      (l) => !l.startsWith("lib/interview/persona-distill.ts:"),
    );
    const secondDeclOutside = outsideModule.filter((l) =>
      /const\s+PERSONA_DISTILL_SYSTEM_PROMPT\s*=/.test(l),
    );

    check(
      "exactly one declaration in lib/interview/persona-distill.ts",
      declarations.length === 1 &&
        declarations[0].startsWith("lib/interview/persona-distill.ts:"),
      out,
    );
    check(
      "no second declaration outside the shared module",
      secondDeclOutside.length === 0,
      outsideModule.join("\n"),
    );
  }

  // ------------------------------------------------------------------
  console.log("\n2. No model call on a missing attestationId");
  {
    resetSpy();
    const res = await networkingDistillPost(
      makePost("/api/networking/persona/distill", { profileText: PROFILE }, userToken),
    );
    const body = await res.json();
    check("status 400", res.status === 400, `status=${res.status}`);
    check("spy call count is 0", spyCalls === 0, `calls=${spyCalls}`);
    check(
      "error mentions attestationId",
      typeof body.error === "string" && body.error.includes("attestationId"),
      JSON.stringify(body),
    );
  }

  // ------------------------------------------------------------------
  console.log("\n3. No model call on an unknown attestationId");
  {
    resetSpy();
    const unknownId = randomUUID();
    const res = await networkingDistillPost(
      makePost(
        "/api/networking/persona/distill",
        { profileText: PROFILE, attestationId: unknownId },
        userToken,
      ),
    );
    const body = await res.json();
    check("status 403", res.status === 403, `status=${res.status}`);
    check("reason is not-found", body.reason === "not-found", JSON.stringify(body));
    check("spy call count is 0", spyCalls === 0, `calls=${spyCalls}`);

    // stash for section 4 body comparison
    (globalThis as { __unknownBody?: unknown }).__unknownBody = body;
  }

  // ------------------------------------------------------------------
  console.log("\n4. No model call on another user's attestationId (opaque)");
  {
    resetSpy();
    const recorded = await recordAttestation({
      userId: otherUserId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    check("setup other-user attestation", recorded.ok === true, JSON.stringify(recorded));

    if (recorded.ok) {
      createdIds.push(recorded.attestationId);
      const res = await networkingDistillPost(
        makePost(
          "/api/networking/persona/distill",
          { profileText: PROFILE, attestationId: recorded.attestationId },
          userToken,
        ),
      );
      const body = await res.json();
      const unknownBody = (globalThis as { __unknownBody?: unknown }).__unknownBody;

      check("status 403", res.status === 403, `status=${res.status}`);
      check("spy call count is 0", spyCalls === 0, `calls=${spyCalls}`);
      check(
        "body identical to unknown-id body (no existence oracle)",
        JSON.stringify(body) === JSON.stringify(unknownBody),
        `owned=${JSON.stringify(body)} unknown=${JSON.stringify(unknownBody)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  console.log("\n5. No model call on an expired attestation");
  {
    resetSpy();
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    check("setup fresh attestation", recorded.ok === true, JSON.stringify(recorded));

    if (recorded.ok) {
      createdIds.push(recorded.attestationId);
      const staleAt = new Date(
        Date.now() - (ATTESTATION_FRESHNESS_SECONDS + 60) * 1000,
      );
      await prisma.networkingAttestation.update({
        where: { id: recorded.attestationId },
        data: { attestedAt: staleAt },
      });

      const res = await networkingDistillPost(
        makePost(
          "/api/networking/persona/distill",
          { profileText: PROFILE, attestationId: recorded.attestationId },
          userToken,
        ),
      );
      const body = await res.json();
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: recorded.attestationId },
      });

      check("status 403", res.status === 403, `status=${res.status}`);
      check("reason is expired", body.reason === "expired", JSON.stringify(body));
      check("spy call count is 0", spyCalls === 0, `calls=${spyCalls}`);
      check(
        "row still unconsumed",
        row?.consumedAt === null,
        JSON.stringify(row),
      );
    }
  }

  // ------------------------------------------------------------------
  console.log("\n6. No model call on a stale-wording attestation");
  {
    resetSpy();
    // recordAttestation refuses stale wording — insert the row directly.
    const row = await prisma.networkingAttestation.create({
      data: {
        userId,
        wordingVersion: "v0-stale",
      },
    });
    createdIds.push(row.id);

    const res = await networkingDistillPost(
      makePost(
        "/api/networking/persona/distill",
        { profileText: PROFILE, attestationId: row.id },
        userToken,
      ),
    );
    const body = await res.json();

    check("status 403", res.status === 403, `status=${res.status}`);
    check(
      "reason is stale-wording",
      body.reason === "stale-wording",
      JSON.stringify(body),
    );
    check("spy call count is 0", spyCalls === 0, `calls=${spyCalls}`);
  }

  // ------------------------------------------------------------------
  console.log("\n7. Happy path distills exactly once");
  let happyId = "";
  {
    resetSpy();
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    check("setup happy attestation", recorded.ok === true, JSON.stringify(recorded));

    if (recorded.ok) {
      happyId = recorded.attestationId;
      createdIds.push(happyId);

      const res = await networkingDistillPost(
        makePost(
          "/api/networking/persona/distill",
          { profileText: PROFILE, attestationId: happyId },
          userToken,
        ),
      );
      const body = await res.json();
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: happyId },
      });

      check("status 200", res.status === 200, `status=${res.status}`);
      check("spy call count is 1", spyCalls === 1, `calls=${spyCalls}`);
      check(
        "response has persona + displayName + attestationId",
        typeof body.persona === "string" &&
          body.persona.length > 0 &&
          typeof body.displayName === "string" &&
          body.attestationId === happyId,
        JSON.stringify(body),
      );
      check("row consumedAt is non-null", row?.consumedAt !== null, JSON.stringify(row));
    }
  }

  // ------------------------------------------------------------------
  console.log("\n8. Single use — replay does not call the model again");
  {
    // Keep spyCalls from section 7 (should be 1); do not reset count to prove
    // the total stays at 1, but clear throw flag.
    spyShouldThrow = false;
    __setDistillPersonaForVerify(async () => {
      spyCalls += 1;
      return {
        persona: "should-not-be-called",
        displayName: "",
      };
    });

    const res = await networkingDistillPost(
      makePost(
        "/api/networking/persona/distill",
        { profileText: PROFILE, attestationId: happyId },
        userToken,
      ),
    );
    const body = await res.json();

    check("status 403", res.status === 403, `status=${res.status}`);
    check(
      "reason is already-consumed",
      body.reason === "already-consumed",
      JSON.stringify(body),
    );
    check("spy call count is still 1", spyCalls === 1, `calls=${spyCalls}`);
  }

  // ------------------------------------------------------------------
  console.log(
    "\n9. Failed distillation does not release the attestation (deliberate)",
  );
  {
    // A spent tick stays spent even when the model call fails — that is the
    // correct trade against making the gate re-usable.
    resetSpy({ throw: true });
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    check("setup fail-path attestation", recorded.ok === true, JSON.stringify(recorded));

    if (recorded.ok) {
      createdIds.push(recorded.attestationId);

      const res = await networkingDistillPost(
        makePost(
          "/api/networking/persona/distill",
          { profileText: PROFILE, attestationId: recorded.attestationId },
          userToken,
        ),
      );
      const body = await res.json();
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: recorded.attestationId },
      });

      check("status 502", res.status === 502, `status=${res.status}`);
      check(
        "user-facing error matches Phase 8 string",
        body.error ===
          "We could not process that description. Please try again.",
        JSON.stringify(body),
      );
      check("spy was invoked once", spyCalls === 1, `calls=${spyCalls}`);
      check(
        "row consumedAt remains non-null after failure",
        row?.consumedAt !== null,
        JSON.stringify(row),
      );
    }
  }

  // ------------------------------------------------------------------
  console.log("\n10. Phase 8 interview route contract is unchanged");
  {
    resetSpy();
    const res = await interviewDistillPost(
      makePost("/api/interview/persona/distill", { profileText: PROFILE }, userToken),
    );
    const body = await res.json();

    check("interview distill status 200", res.status === 200, `status=${res.status}`);
    check(
      "interview response shape { persona, displayName }",
      typeof body.persona === "string" &&
        body.persona.length > 0 &&
        typeof body.displayName === "string" &&
        body.attestationId === undefined,
      JSON.stringify(body),
    );
    check("spy incremented for interview path", spyCalls === 1, `calls=${spyCalls}`);

    // 400 path
    resetSpy();
    const bad = await interviewDistillPost(
      makePost("/api/interview/persona/distill", {}, userToken),
    );
    const badBody = await bad.json();
    check("interview 400 status", bad.status === 400, `status=${bad.status}`);
    check(
      "interview 400 string",
      badBody.error === "profileText is required",
      JSON.stringify(badBody),
    );
    check("interview 400 made no model call", spyCalls === 0, `calls=${spyCalls}`);

    // 401 path
    resetSpy();
    const unauth = await interviewDistillPost(
      makePost("/api/interview/persona/distill", { profileText: PROFILE }, ""),
    );
    const unauthBody = await unauth.json();
    check("interview 401 status", unauth.status === 401, `status=${unauth.status}`);
    check(
      "interview 401 string",
      unauthBody.error === "Unauthorized",
      JSON.stringify(unauthBody),
    );

    // 502 path
    resetSpy({ throw: true });
    const fail = await interviewDistillPost(
      makePost("/api/interview/persona/distill", { profileText: PROFILE }, userToken),
    );
    const failBody = await fail.json();
    check("interview 502 status", fail.status === 502, `status=${fail.status}`);
    check(
      "interview 502 string",
      failBody.error ===
        "We could not process that description. Please try again.",
      JSON.stringify(failBody),
    );

    // Compare error strings against pre-extraction snapshot (or git HEAD~ of task 1).
    let beforeSource = "";
    if (existsSync("/tmp/distill-before.ts")) {
      beforeSource = readFileSync("/tmp/distill-before.ts", "utf8");
    } else {
      beforeSource = execSync(
        "git show 6904746^:app/api/interview/persona/distill/route.ts",
        { encoding: "utf8" },
      );
    }
    const afterSource = readFileSync(
      "app/api/interview/persona/distill/route.ts",
      "utf8",
    );
    const beforeErrors = extractErrorStrings(beforeSource);
    const afterErrors = extractErrorStrings(afterSource);
    check(
      "error string literals match pre-extraction snapshot",
      JSON.stringify(beforeErrors) === JSON.stringify(afterErrors),
      `before=${JSON.stringify(beforeErrors)} after=${JSON.stringify(afterErrors)}`,
    );
  }

  // ------------------------------------------------------------------
  console.log("\n11. Interview route knows nothing about attestations");
  {
    let grepEmpty = false;
    try {
      execSync(
        "grep -in attestation app/api/interview/persona/distill/route.ts",
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      grepEmpty = false;
    } catch (err) {
      const status = (err as { status?: number }).status;
      grepEmpty = status === 1;
    }
    check(
      "grep attestation on interview distill route returns nothing",
      grepEmpty,
    );
  }

  if (failures > 0) {
    console.log(`\nFAILED: ${failures} assertion(s)\n`);
    process.exitCode = 1;
  } else {
    console.log("\nAll eleven assertion groups passed.\n");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((err) => {
      console.error("cleanup failed:", err);
    });
    await prisma.$disconnect();
  });
