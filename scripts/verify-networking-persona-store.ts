/**
 * Proves the owner-scoped networking persona store and routes from plan 16-04:
 * round-trip, cross-student 404, owner-scoped list/delete, write validation,
 * never-publishable absence (16-CONTEXT.md decision 7), no raw paste in the
 * storage layer, and spent-attestation receipt gating.
 *
 * Creates two throwaway test users against the LOCAL dev DB and cleans up its
 * own S3 objects and rows.
 *
 * Run:
 *   DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *     npx tsx scripts/verify-networking-persona-store.ts
 *
 * dotenv MUST load before s3-touching modules (module init reads AWS_*).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

const ROOT = resolve(__dirname, "..");

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === ".next" ||
      name === ".planning"
    ) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function grepOrEmpty(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", cwd: ROOT }).trim();
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) return "";
    throw err;
  }
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const {
    CURRENT_ATTESTATION_WORDING_VERSION,
  } = await import("../lib/networking/attestation");
  const {
    saveNetworkingPersona,
    loadOwnedNetworkingPersona,
    listOwnedNetworkingPersonas,
    deleteOwnedNetworkingPersona,
    validateNetworkingPersonaRecord,
  } = await import("../lib/networking/persona-store");
  type NetworkingPersonaRecord =
    import("../lib/networking/persona-store").NetworkingPersonaRecord;
  const { requireSpentOwnedAttestation } = await import(
    "../app/api/networking/persona/route"
  );
  const { MAX_PERSONA_LENGTH } = await import(
    "../lib/interview/customization"
  );

  const emailA = `persona-store-a-${randomUUID()}@example.com`;
  const emailB = `persona-store-b-${randomUUID()}@example.com`;
  let userA = "";
  let userB = "";
  const createdPersonaIds: Array<{ ownerId: string; personaId: string }> = [];
  const createdAttestationIds: string[] = [];

  async function cleanup() {
    for (const { ownerId, personaId } of createdPersonaIds) {
      try {
        await deleteOwnedNetworkingPersona(personaId, ownerId);
      } catch {
        /* best-effort */
      }
    }
    if (createdAttestationIds.length > 0) {
      await prisma.networkingAttestation.deleteMany({
        where: { id: { in: createdAttestationIds } },
      });
    }
    const userIds = [userA, userB].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.networkingAttestation.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  try {
    const a = await prisma.user.create({
      data: {
        email: emailA,
        name: "Persona Store Verify A",
        role: "STUDENT",
      },
    });
    userA = a.id;

    const b = await prisma.user.create({
      data: {
        email: emailB,
        name: "Persona Store Verify B",
        role: "STUDENT",
      },
    });
    userB = b.id;

    async function spentAttestation(userId: string): Promise<string> {
      const row = await prisma.networkingAttestation.create({
        data: {
          userId,
          wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
          consumedAt: new Date(),
        },
      });
      createdAttestationIds.push(row.id);
      return row.id;
    }

    function makeRecord(
      overrides: Partial<NetworkingPersonaRecord> & {
        ownerId: string;
        attestationId: string;
      },
    ): NetworkingPersonaRecord {
      const personaId = overrides.personaId ?? randomUUID();
      return {
        kind: "networking-persona",
        personaId,
        ownerId: overrides.ownerId,
        displayName: overrides.displayName ?? "Alex Rivera",
        persona:
          overrides.persona ??
          "Alex Rivera is a VP of marketing at a mid-size CPG company, warm but time-pressed.",
        source: overrides.source ?? "pasted",
        attestationId: overrides.attestationId,
        attestedAt: overrides.attestedAt ?? new Date().toISOString(),
        attestedWordingVersion:
          overrides.attestedWordingVersion ??
          CURRENT_ATTESTATION_WORDING_VERSION,
        createdAt: overrides.createdAt ?? new Date().toISOString(),
      };
    }

    console.log("\n=== verify-networking-persona-store ===\n");

    // ---- 1. Round trip ----
    console.log("1. Round trip — save then loadOwned as owner");
    let personaIdA1 = "";
    {
      const attId = await spentAttestation(userA);
      const record = makeRecord({ ownerId: userA, attestationId: attId });
      personaIdA1 = record.personaId;
      await saveNetworkingPersona(record);
      createdPersonaIds.push({ ownerId: userA, personaId: personaIdA1 });

      const loaded = await loadOwnedNetworkingPersona(personaIdA1, userA);
      check("load returns a record", loaded !== null);
      check(
        "every field intact",
        !!loaded &&
          loaded.kind === "networking-persona" &&
          loaded.personaId === record.personaId &&
          loaded.ownerId === record.ownerId &&
          loaded.displayName === record.displayName &&
          loaded.persona === record.persona &&
          loaded.source === record.source &&
          loaded.attestationId === record.attestationId &&
          loaded.attestedAt === record.attestedAt &&
          loaded.attestedWordingVersion === record.attestedWordingVersion &&
          loaded.createdAt === record.createdAt,
        JSON.stringify(loaded),
      );
      check(
        `persona length <= ${MAX_PERSONA_LENGTH}`,
        !!loaded && loaded.persona.length <= MAX_PERSONA_LENGTH,
        `len=${loaded?.persona.length}`,
      );
    }

    // ---- 2. Cross-student invisibility ----
    console.log(
      "\n2. Cross-student invisibility — roadmap criterion 3 load-bearing",
    );
    console.log(
      '   // "never appears in another student\'s session"',
    );
    {
      const loaded = await loadOwnedNetworkingPersona(personaIdA1, userB);
      check(
        "loadOwnedNetworkingPersona(idOfA, userB) returns null",
        loaded === null,
        JSON.stringify(loaded),
      );
    }

    // ---- 3. List is owner-scoped ----
    console.log("\n3. List is owner-scoped");
    let personaIdA2 = "";
    let personaIdB1 = "";
    {
      const attA2 = await spentAttestation(userA);
      const recA2 = makeRecord({
        ownerId: userA,
        attestationId: attA2,
        displayName: "Casey Kim",
        persona:
          "Casey Kim is a product manager who values concise updates and clear asks.",
        createdAt: new Date(Date.now() + 1000).toISOString(),
      });
      personaIdA2 = recA2.personaId;
      await saveNetworkingPersona(recA2);
      createdPersonaIds.push({ ownerId: userA, personaId: personaIdA2 });

      const attB1 = await spentAttestation(userB);
      const recB1 = makeRecord({
        ownerId: userB,
        attestationId: attB1,
        displayName: "Jordan Lee",
        persona:
          "Jordan Lee is an engineer-manager who prefers concrete examples over slogans.",
      });
      personaIdB1 = recB1.personaId;
      await saveNetworkingPersona(recB1);
      createdPersonaIds.push({ ownerId: userB, personaId: personaIdB1 });

      const listA = await listOwnedNetworkingPersonas(userA);
      const listB = await listOwnedNetworkingPersonas(userB);
      const idsA = listA.map((r) => r.personaId).sort();
      const idsB = listB.map((r) => r.personaId).sort();

      check(
        "listOwned(A) returns exactly A's two",
        idsA.length === 2 &&
          idsA.includes(personaIdA1) &&
          idsA.includes(personaIdA2),
        JSON.stringify(idsA),
      );
      check(
        "listOwned(B) returns exactly B's one",
        idsB.length === 1 && idsB[0] === personaIdB1,
        JSON.stringify(idsB),
      );
      check(
        "listOwned(A) sorted newest-createdAt first",
        listA.length >= 2 && listA[0].personaId === personaIdA2,
        listA.map((r) => r.personaId).join(","),
      );
    }

    // ---- 4. Delete is owner-scoped ----
    console.log("\n4. Delete is owner-scoped");
    {
      const denied = await deleteOwnedNetworkingPersona(personaIdA1, userB);
      check("B deleting A's persona returns false", denied === false);
      const stillThere = await loadOwnedNetworkingPersona(personaIdA1, userA);
      check(
        "A can still load it afterwards",
        stillThere !== null && stillThere.personaId === personaIdA1,
      );
      const allowed = await deleteOwnedNetworkingPersona(personaIdA2, userA);
      check("A deleting own persona returns true", allowed === true);
      // Remove from cleanup list so we don't double-delete
      const idx = createdPersonaIds.findIndex(
        (c) => c.personaId === personaIdA2,
      );
      if (idx >= 0) createdPersonaIds.splice(idx, 1);
    }

    // ---- 5. Validation refuses ----
    console.log("\n5. Validation refuses oversized persona / empty name / missing attestation");
    {
      const baseAtt = await spentAttestation(userA);
      let threw601 = false;
      try {
        validateNetworkingPersonaRecord(
          makeRecord({
            ownerId: userA,
            attestationId: baseAtt,
            persona: "x".repeat(MAX_PERSONA_LENGTH + 1),
          }),
        );
      } catch {
        threw601 = true;
      }
      check("601-char persona throws", threw601);

      let threwEmptyName = false;
      try {
        validateNetworkingPersonaRecord(
          makeRecord({
            ownerId: userA,
            attestationId: baseAtt,
            displayName: "",
          }),
        );
      } catch {
        threwEmptyName = true;
      }
      check("empty displayName throws", threwEmptyName);

      let threwMissingAtt = false;
      try {
        validateNetworkingPersonaRecord(
          makeRecord({
            ownerId: userA,
            attestationId: "   ",
          }),
        );
      } catch {
        threwMissingAtt = true;
      }
      check("missing attestationId throws", threwMissingAtt);
    }

    // ---- 6. No publish surface ----
    console.log("\n6. No publish surface, repo-wide");
    console.log(
      '   // 16-CONTEXT.md decision 7: "Never publishable; the publish affordance',
    );
    console.log(
      '   // must be absent, not merely off." Rejected: reuse only via a',
    );
    console.log(
      '   // "practice again" link — the distilled persona is a private INSTANCE.',
    );
    {
      const allFiles = walkFiles(ROOT);
      const publishPathHits = allFiles.filter((f) => {
        const rel = relative(ROOT, f).replace(/\\/g, "/");
        const base = rel.toLowerCase();
        return (
          /networking.*publish/.test(base) || /publish.*networking/.test(base)
        );
      });
      check(
        "no path matches both networking and publish (excl .planning/)",
        publishPathHits.length === 0,
        publishPathHits.map((f) => relative(ROOT, f)).join(", "),
      );

      const publishedHits = grepOrEmpty(
        'grep -rn "published" lib/networking app/api/networking || true',
      );
      const nonCommentHits = publishedHits
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .filter((line) => {
          // Allow deliberate-absence comments that mention the word.
          const afterColon = line.split(":").slice(2).join(":");
          const trimmed = afterColon.trim();
          return !(
            trimmed.startsWith("*") ||
            trimmed.startsWith("//") ||
            trimmed.startsWith("/*")
          );
        });
      check(
        'grep -rn "published" lib/networking app/api/networking is comment-only',
        nonCommentHits.length === 0,
        nonCommentHits.join("\n"),
      );

      const scenarioHits = grepOrEmpty(
        'grep -rn "networking" app/api/scenario/ || true',
      );
      check(
        'grep -rn "networking" app/api/scenario/ finds nothing',
        scenarioHits === "",
        scenarioHits,
      );
    }

    // ---- 7. No raw paste in storage layer ----
    console.log("\n7. No raw paste anywhere in the storage layer");
    console.log(
      "   // Distill-adjacent files (16-01 / 16-05) may mention profileText;",
    );
    console.log(
      "   // this storage layer must not — only the POST 400 tripwire may.",
    );
    {
      // Scope matches the plan's storage-layer paths. Exclude distill/ (16-05)
      // which legitimately accepts the paste for one non-streaming model call.
      const storeHits = grepOrEmpty(
        'grep -rn "profileText\\|rawPaste\\|pastedText" lib/networking/persona-store.ts || true',
      );
      const routeHits = grepOrEmpty(
        'grep -rn "profileText\\|rawPaste\\|pastedText" app/api/networking/persona/route.ts "app/api/networking/persona/[personaId]/route.ts" || true',
      );
      const storeLines = storeHits
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const routeLines = routeHits
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const tripwireOnly =
        storeLines.length === 0 &&
        routeLines.length > 0 &&
        routeLines.every(
          (l) =>
            l.includes("app/api/networking/persona/route.ts") &&
            l.includes("profileText"),
        ) &&
        !routeLines.some((l) => l.includes("[personaId]"));
      check(
        "raw-paste keys only as POST tripwire (store + [personaId] clean; distill excluded)",
        tripwireOnly,
        `store=${storeHits || "(none)"}\nroute=${routeHits || "(none)"}`,
      );
    }

    // ---- 8. Attestation receipt required and spent ----
    console.log(
      "\n8. Attestation receipt is required and must be spent (route helper)",
    );
    {
      const unspent = await prisma.networkingAttestation.create({
        data: {
          userId: userA,
          wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
          // consumedAt null — unspent
        },
      });
      createdAttestationIds.push(unspent.id);

      const unspentResult = await requireSpentOwnedAttestation(
        unspent.id,
        userA,
      );
      check(
        "unconsumed attestation is rejected by the route helper",
        unspentResult.ok === false,
        JSON.stringify(unspentResult),
      );

      const otherUsersAtt = await prisma.networkingAttestation.create({
        data: {
          userId: userB,
          wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
          consumedAt: new Date(),
        },
      });
      createdAttestationIds.push(otherUsersAtt.id);

      const wrongOwner = await requireSpentOwnedAttestation(
        otherUsersAtt.id,
        userA,
      );
      check(
        "attestation owned by another user is rejected",
        wrongOwner.ok === false,
        JSON.stringify(wrongOwner),
      );

      const spentRow = await prisma.networkingAttestation.create({
        data: {
          userId: userA,
          wordingVersion: CURRENT_ATTESTATION_WORDING_VERSION,
          consumedAt: new Date(),
        },
      });
      createdAttestationIds.push(spentRow.id);
      const spentOk = await requireSpentOwnedAttestation(spentRow.id, userA);
      check(
        "spent owned attestation is accepted",
        spentOk.ok === true,
        JSON.stringify(spentOk),
      );
    }

    if (failures > 0) {
      console.log(`\nFAILED: ${failures} assertion(s)\n`);
      process.exitCode = 1;
    } else {
      console.log("\nAll eight assertion sections passed.\n");
    }

    await cleanup();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
    await cleanup().catch((cleanupErr) => {
      console.error("cleanup failed:", cleanupErr);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
