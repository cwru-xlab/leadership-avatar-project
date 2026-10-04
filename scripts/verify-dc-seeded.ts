/**
 * Proves the seeded difficult-conversation catalog: count/uniqueness, the same
 * validator authored records must pass, non-trivial four fields, withheld
 * hidden position, unownable through the owner-scoped loader, findSeeded
 * playability, live ACTIVE avatar resolution, and absence of mirrored variants.
 *
 * Run: npx tsx scripts/verify-dc-seeded.ts
 * Fails loudly if the HeyGen catalog is unreachable — never skips.
 *
 * dotenv MUST load before modules that read HEYGEN_API_KEY / AWS_* at init.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

function hasTwentyCharOverlap(hidden: string, other: string): string | null {
  for (let i = 0; i <= hidden.length - 20; i++) {
    const slice = hidden.slice(i, i + 20);
    if (other.includes(slice)) return slice;
  }
  return null;
}

function authoredInputFrom(
  record: import("../lib/difficult-conversation/types").DifficultConversationRecord
) {
  return {
    title: record.title,
    avatarRole: record.avatarRole,
    studentRole: record.studentRole,
    situation: record.situation,
    sharedBackstory: record.sharedBackstory,
    hiddenPosition: record.hiddenPosition,
    studentObjective: record.studentObjective,
    stakes: record.stakes,
    difficulty: record.difficulty,
    avatarId: record.avatarId,
    voiceId: record.voiceId,
  };
}

async function main() {
  const { DC_LIMITS } = await import("../lib/difficult-conversation/types");
  const { validateDifficultConversationInput } = await import(
    "../lib/difficult-conversation/validation"
  );
  const {
    SEEDED_CONVERSATIONS,
    findSeededConversation,
    SEEDED_AVATAR_GENDER_HINTS,
  } = await import("../lib/difficult-conversation/seeded");
  const { loadOwnedDifficultConversation } = await import(
    "../lib/difficult-conversation/store"
  );
  const { assignSeededAvatar, fetchActiveAvatarCatalog } = await import(
    "../lib/difficult-conversation/avatar-assignment"
  );

  let failures = 0;

  function check(name: string, pass: boolean, detail?: string) {
    if (pass) {
      console.log(`  ok   ${name}`);
    } else {
      failures += 1;
      console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
    }
  }

  console.log("\n=== verify-dc-seeded ===\n");

  // ---- 1. Count and uniqueness ----
  console.log("1. Count and uniqueness — exactly seven kebab-case ids");
  {
    const ids = SEEDED_CONVERSATIONS.map((r) => r.id);
    console.log(`  ids (stable for 15-11): ${ids.join(", ")}`);
    check("exactly seven records", SEEDED_CONVERSATIONS.length === 7, `got ${SEEDED_CONVERSATIONS.length}`);
    check("ids unique", new Set(ids).size === ids.length);
    for (const id of ids) {
      check(
        `id "${id}" is lowercase kebab-case`,
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
      );
    }
  }

  // ---- 2. Same validator as authored records ----
  console.log(
    "\n2. Same validator as authored records — validateDifficultConversationInput → []"
  );
  {
    for (const record of SEEDED_CONVERSATIONS) {
      const errs = validateDifficultConversationInput(
        authoredInputFrom(record)
      );
      check(
        `"${record.id}" validates to []`,
        errs.length === 0,
        errs.map((e) => `${e.field}: ${e.message}`).join("; ")
      );
    }
  }

  // ---- 3. All four fields non-trivial ----
  console.log("\n3. All four fields non-trivial — DC_LIMITS mins");
  {
    console.log(
      "  id                              hidden  backstory  objective  stakes"
    );
    for (const r of SEEDED_CONVERSATIONS) {
      const row = [
        r.id.padEnd(30),
        String(r.hiddenPosition.length).padStart(6),
        String(r.sharedBackstory.length).padStart(10),
        String(r.studentObjective.length).padStart(10),
        String(r.stakes.length).padStart(7),
      ].join(" ");
      console.log(`  ${row}`);
      check(
        `"${r.id}" hiddenPosition >= ${DC_LIMITS.HIDDEN_POSITION_MIN}`,
        r.hiddenPosition.trim().length >= DC_LIMITS.HIDDEN_POSITION_MIN
      );
      check(
        `"${r.id}" sharedBackstory >= ${DC_LIMITS.SHARED_BACKSTORY_MIN}`,
        r.sharedBackstory.trim().length >= DC_LIMITS.SHARED_BACKSTORY_MIN
      );
      check(
        `"${r.id}" studentObjective >= ${DC_LIMITS.STUDENT_OBJECTIVE_MIN}`,
        r.studentObjective.trim().length >= DC_LIMITS.STUDENT_OBJECTIVE_MIN
      );
      check(
        `"${r.id}" stakes >= ${DC_LIMITS.STAKES_MIN}`,
        r.stakes.trim().length >= DC_LIMITS.STAKES_MIN
      );
    }
  }

  // ---- 4. Hidden position withheld ----
  console.log(
    "\n4. Hidden position withheld — no 20+ char overlap into briefing fields"
  );
  {
    for (const r of SEEDED_CONVERSATIONS) {
      const sit = hasTwentyCharOverlap(r.hiddenPosition, r.situation);
      const back = hasTwentyCharOverlap(r.hiddenPosition, r.sharedBackstory);
      check(
        `"${r.id}" hiddenPosition ∉ situation`,
        sit === null,
        sit ? `overlap: ${JSON.stringify(sit)}` : undefined
      );
      check(
        `"${r.id}" hiddenPosition ∉ sharedBackstory`,
        back === null,
        back ? `overlap: ${JSON.stringify(back)}` : undefined
      );
    }
  }

  // ---- 5. Unownable ----
  console.log(
    "\n5. Unownable — ownerId null; loadOwnedDifficultConversation → null"
  );
  {
    for (const r of SEEDED_CONVERSATIONS) {
      check(`"${r.id}" ownerId === null`, r.ownerId === null);
      const owned = await loadOwnedDifficultConversation(r.id, "any-user");
      check(
        `loadOwnedDifficultConversation("${r.id}", "any-user") === null`,
        owned === null
      );
    }
  }

  // ---- 6. Playable via findSeededConversation ----
  console.log(
    "\n6. Playable — findSeededConversation is the seeded lookup (15-06 checks code first)"
  );
  {
    for (const r of SEEDED_CONVERSATIONS) {
      const found = findSeededConversation(r.id);
      check(
        `findSeededConversation("${r.id}") returns the record`,
        found !== undefined && found.id === r.id
      );
    }
    check(
      "findSeededConversation(unknown) is undefined",
      findSeededConversation("not-a-real-seeded-id") === undefined
    );
  }

  // ---- 7. Live avatar resolution ----
  console.log(
    "\n7. Live avatar resolution — assignSeededAvatar against today's ACTIVE catalog"
  );
  {
    let catalog: Awaited<ReturnType<typeof fetchActiveAvatarCatalog>>;
    try {
      catalog = await fetchActiveAvatarCatalog();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      check("LiveAvatar ACTIVE catalog reachable", false, detail);
      catalog = [];
    }

    const activeIds = new Set(catalog.map((a) => a.avatarId));
    console.log(`  ACTIVE catalog size: ${catalog.length}`);
    console.log("  conversationId                 avatarId                              voiceId");

    for (const r of SEEDED_CONVERSATIONS) {
      try {
        const hint = SEEDED_AVATAR_GENDER_HINTS[r.id];
        const pair = await assignSeededAvatar(
          r.id,
          hint ? { genderHint: hint } : undefined
        );
        console.log(
          `  ${r.id.padEnd(30)} ${pair.avatarId.padEnd(36)} ${pair.voiceId}`
        );
        check(
          `"${r.id}" resolved non-empty avatarId+voiceId`,
          pair.avatarId.length > 0 && pair.voiceId.length > 0
        );
        check(
          `"${r.id}" avatarId is in today's ACTIVE catalog`,
          activeIds.has(pair.avatarId)
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        check(`"${r.id}" assignSeededAvatar succeeds`, false, detail);
      }
    }

    // Seeded records must not hardcode avatar ids
    for (const r of SEEDED_CONVERSATIONS) {
      check(
        `"${r.id}" ships with empty avatarId/voiceId (resolve-time fill)`,
        r.avatarId === "" && r.voiceId === ""
      );
    }
  }

  // ---- 8. Deferred items absent ----
  console.log(
    "\n8. Deferred items absent — no mirrored role-swap variants"
  );
  {
    const deferredTerms = /\b(industry|reframe|both sides)\b/i;
    for (const r of SEEDED_CONVERSATIONS) {
      const blob = [
        r.title,
        r.situation,
        r.sharedBackstory,
        r.hiddenPosition,
        r.studentObjective,
        r.stakes,
      ].join("\n");
      check(
        `"${r.id}" has no deferred industry/reframe/both-sides wording`,
        !deferredTerms.test(blob)
      );
    }

    // No two records share the same situation with swapped roles.
    for (let i = 0; i < SEEDED_CONVERSATIONS.length; i++) {
      for (let j = i + 1; j < SEEDED_CONVERSATIONS.length; j++) {
        const a = SEEDED_CONVERSATIONS[i]!;
        const b = SEEDED_CONVERSATIONS[j]!;
        const swappedRoles =
          a.avatarRole === b.studentRole && a.studentRole === b.avatarRole;
        const sameSituationStem =
          a.situation.slice(0, 40) === b.situation.slice(0, 40);
        check(
          `"${a.id}" vs "${b.id}" is not a mirrored role-swap`,
          !(swappedRoles && sameSituationStem)
        );
      }
    }

    check(
      "published true on every seeded record",
      SEEDED_CONVERSATIONS.every((r) => r.published === true)
    );
    check(
      "default difficulty is guarded on every seeded record",
      SEEDED_CONVERSATIONS.every((r) => r.difficulty === "guarded")
    );
  }

  console.log("");
  if (failures > 0) {
    console.error(`verify-dc-seeded: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("verify-dc-seeded: all eight sections passed");
}

main().catch((error) => {
  console.error("verify-dc-seeded: unexpected error");
  console.error(error);
  process.exit(1);
});
