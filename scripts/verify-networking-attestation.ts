/**
 * Proves the NetworkingAttestation store and record/consume primitives from
 * plan 16-02: single-use, ownership, freshness, stale-wording rejection, and
 * that Phase 10's videoAnalysisConsentAt is untouched under lib/networking/.
 *
 * Run against LOCAL dev DB only:
 *   DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *     npx tsx scripts/verify-networking-attestation.ts
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  ATTESTATION_FRESHNESS_SECONDS,
  CURRENT_ATTESTATION_WORDING_VERSION,
  consumeAttestation,
  recordAttestation,
} from "../lib/networking/attestation";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const testEmail = `attestation-verify-${randomUUID()}@example.com`;
const otherEmail = `attestation-verify-other-${randomUUID()}@example.com`;
let userId = "";
let otherUserId = "";
const createdIds: string[] = [];

async function cleanup() {
  if (createdIds.length > 0) {
    await prisma.networkingAttestation.deleteMany({
      where: { id: { in: createdIds } },
    });
  }
  // Also clear any rows tied to our throwaway users (stale-wording wrote none,
  // but ownership / freshness helpers may have created extras).
  const userIds = [userId, otherUserId].filter(Boolean);
  if (userIds.length > 0) {
    await prisma.networkingAttestation.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function main() {
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: "Attestation Verify",
      role: "STUDENT",
    },
  });
  userId = user.id;

  const other = await prisma.user.create({
    data: {
      email: otherEmail,
      name: "Attestation Verify Other",
      role: "STUDENT",
    },
  });
  otherUserId = other.id;

  console.log("\n1. recordAttestation with current version writes an unconsumed row");
  {
    const result = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    check("returns ok with an attestationId", result.ok === true, JSON.stringify(result));
    if (result.ok) {
      createdIds.push(result.attestationId);
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: result.attestationId },
      });
      check(
        "row exists with matching userId, attestedAt set, consumedAt null",
        !!row &&
          row.userId === userId &&
          row.attestedAt instanceof Date &&
          row.consumedAt === null,
        JSON.stringify(row)
      );
    }
  }

  console.log("\n2. recordAttestation with stale wording writes nothing");
  {
    const before = await prisma.networkingAttestation.count({ where: { userId } });
    const result = await recordAttestation({ userId, wordingVersion: "v0" });
    const after = await prisma.networkingAttestation.count({ where: { userId } });
    check(
      "returns stale-wording",
      result.ok === false && result.reason === "stale-wording",
      JSON.stringify(result)
    );
    check("row count unchanged", before === after, `before=${before} after=${after}`);
  }

  console.log("\n3. consumeAttestation succeeds once and stamps consumedAt");
  let spentId = "";
  {
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    if (!recorded.ok) {
      check("setup record for consume", false, JSON.stringify(recorded));
    } else {
      spentId = recorded.attestationId;
      createdIds.push(spentId);
      const now = new Date();
      const result = await consumeAttestation({
        attestationId: spentId,
        userId,
        now,
      });
      check("consume returns ok", result.ok === true, JSON.stringify(result));
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: spentId },
      });
      check("consumedAt is now non-null", row?.consumedAt !== null && row?.consumedAt !== undefined);
    }
  }

  console.log("\n4. Single use — second consume of the same id is already-consumed");
  {
    const result = await consumeAttestation({
      attestationId: spentId,
      userId,
      now: new Date(),
    });
    check(
      "second consume returns already-consumed",
      result.ok === false && result.reason === "already-consumed",
      JSON.stringify(result)
    );
  }

  console.log("\n5. Ownership — another user cannot spend this attestation");
  {
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    if (!recorded.ok) {
      check("setup record for ownership", false, JSON.stringify(recorded));
    } else {
      createdIds.push(recorded.attestationId);
      const result = await consumeAttestation({
        attestationId: recorded.attestationId,
        userId: otherUserId,
        now: new Date(),
      });
      check(
        "other user gets not-owned",
        result.ok === false && result.reason === "not-owned",
        JSON.stringify(result)
      );
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: recorded.attestationId },
      });
      check("row consumedAt still null", row?.consumedAt === null);
    }
  }

  console.log("\n6. Freshness — backdated attestation expires without consuming");
  {
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    if (!recorded.ok) {
      check("setup record for freshness", false, JSON.stringify(recorded));
    } else {
      createdIds.push(recorded.attestationId);
      const past = new Date(
        Date.now() - (ATTESTATION_FRESHNESS_SECONDS + 60) * 1000
      );
      await prisma.networkingAttestation.update({
        where: { id: recorded.attestationId },
        data: { attestedAt: past },
      });
      const result = await consumeAttestation({
        attestationId: recorded.attestationId,
        userId,
        now: new Date(),
      });
      check(
        "returns expired",
        result.ok === false && result.reason === "expired",
        JSON.stringify(result)
      );
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: recorded.attestationId },
      });
      check("row was NOT consumed", row?.consumedAt === null);
    }
  }

  console.log("\n7. Stale wording — version bump rejects unconsumed rows");
  {
    const recorded = await recordAttestation({
      userId,
      wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
    });
    if (!recorded.ok) {
      check("setup record for stale wording", false, JSON.stringify(recorded));
    } else {
      createdIds.push(recorded.attestationId);
      const result = await consumeAttestation({
        attestationId: recorded.attestationId,
        userId,
        now: new Date(),
        currentWordingVersion: "v2",
      });
      check(
        "returns stale-wording when current version is simulated as v2",
        result.ok === false && result.reason === "stale-wording",
        JSON.stringify(result)
      );
      const row = await prisma.networkingAttestation.findUnique({
        where: { id: recorded.attestationId },
      });
      check("row was NOT consumed", row?.consumedAt === null);
    }
  }

  console.log("\n8. Unknown id → not-found");
  {
    const result = await consumeAttestation({
      attestationId: randomUUID(),
      userId,
      now: new Date(),
    });
    check(
      "random uuid returns not-found",
      result.ok === false && result.reason === "not-found",
      JSON.stringify(result)
    );
  }

  console.log("\n9. Phase 10 consent is untouched under lib/networking/");
  {
    // User.videoAnalysisConsentAt still exists on the model (schema column).
    const meta = await prisma.user.findUnique({
      where: { id: userId },
      select: { videoAnalysisConsentAt: true },
    });
    check(
      "User.videoAnalysisConsentAt field is selectable (column exists)",
      meta !== null && "videoAnalysisConsentAt" in meta,
      JSON.stringify(meta)
    );

    let grepEmpty = false;
    try {
      execSync("grep -rn videoAnalysisConsentAt lib/networking", {
        stdio: ["ignore", "pipe", "pipe"],
      });
      grepEmpty = false;
    } catch (err) {
      // grep exits 1 when no matches — that is success for this assertion.
      const status = (err as { status?: number }).status;
      grepEmpty = status === 1;
    }
    check("grep videoAnalysisConsentAt under lib/networking returns nothing", grepEmpty);
  }

  if (failures > 0) {
    console.log(`\nFAILED: ${failures} assertion(s)\n`);
    process.exitCode = 1;
  } else {
    console.log("\nAll nine assertion groups passed.\n");
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
