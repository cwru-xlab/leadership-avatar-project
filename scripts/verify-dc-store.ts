/**
 * Proves difficult-conversation validation, ownership (404-never-403),
 * published-is-discovery-only play path, summary privacy, and server-side
 * ownership stamping against the configured S3 bucket.
 *
 * Run: npx tsx scripts/verify-dc-store.ts
 * Fails loudly if S3 is unavailable — never skips.
 *
 * dotenv MUST load before s3-client is imported (module init reads AWS_*).
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const { validateDifficultConversationInput } = await import(
    "../lib/difficult-conversation/validation"
  );
  const { DIFFICULTY_BANDS, DC_LIMITS } = await import(
    "../lib/difficult-conversation/types"
  );
  const {
    saveDifficultConversation,
    loadOwnedDifficultConversation,
    loadDifficultConversationForPlay,
    listDifficultConversations,
    deleteDifficultConversation,
  } = await import("../lib/difficult-conversation/store");
  type DifficultConversationSaveInput = import("../lib/difficult-conversation/store").DifficultConversationSaveInput;
  type DifficultConversationRecord = import("../lib/difficult-conversation/types").DifficultConversationRecord;
  const { s3Storage } = await import("../lib/s3-client");

  let failures = 0;

  function check(name: string, pass: boolean, detail?: string) {
    if (pass) {
      console.log(`  ok   ${name}`);
    } else {
      failures += 1;
      console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
    }
  }

  const FIX_WORDS = ["Give", "Add", "Shorten", "Choose", "Use", "Remove"];

  function messageHasProblemAndFix(message: string): boolean {
    return (
      message.length > 40 && FIX_WORDS.some((w) => message.includes(w))
    );
  }

  function validInput(
    overrides: Partial<DifficultConversationSaveInput> = {}
  ): DifficultConversationSaveInput {
    return {
      title: "Performance conversation with Dana",
      avatarRole: "Direct report",
      studentRole: "Team lead",
      situation:
        "Dana has missed three deadlines this quarter and the rest of the team is covering. You need to address the pattern before the next sprint.",
      sharedBackstory:
        "Dana joined eighteen months ago with strong early reviews. Last quarter two projects slipped; you had an informal chat in March. The team still likes Dana personally.",
      hiddenPosition:
        "Dana believes the deadlines were unrealistic and that you never protected the team from scope creep. Their bottom line is refusing a PIP without written workload changes.",
      studentObjective:
        "Get a written commitment to an improvement plan with clear milestones.",
      stakes:
        "If this goes badly Dana may escalate to HR or quietly disengage from the team.",
      difficulty: "guarded",
      avatarId: "avatar-verify-dc-1",
      voiceId: "voice-verify-dc-1",
      ...overrides,
    };
  }

  function pad(s: string, n: number): string {
    return s.repeat(Math.ceil(n / s.length)).slice(0, n);
  }

  const USER_A = "verify-dc-user-a";
  const USER_B = "verify-dc-user-b";
  const createdIds: string[] = [];

  async function cleanup() {
    for (const id of createdIds) {
      try {
        await s3Storage.deleteDifficultConversationObject(id);
      } catch {
        /* best-effort */
      }
    }
  }

  console.log("\n=== verify-dc-store ===\n");

  // ---- 1. Valid input ----
  console.log("1. Fully valid input validates to []");
  {
    const errs = validateDifficultConversationInput(validInput());
    check("valid input → []", errs.length === 0, JSON.stringify(errs));
  }

  // ---- 2. Every failure path ----
  console.log("\n2. Every failure path, individually and together");
  const textFields: Array<{
    field: keyof DifficultConversationSaveInput;
    min: number;
    max: number;
  }> = [
    { field: "title", min: DC_LIMITS.TITLE_MIN, max: DC_LIMITS.TITLE_MAX },
    {
      field: "avatarRole",
      min: DC_LIMITS.AVATAR_ROLE_MIN,
      max: DC_LIMITS.AVATAR_ROLE_MAX,
    },
    {
      field: "studentRole",
      min: DC_LIMITS.STUDENT_ROLE_MIN,
      max: DC_LIMITS.STUDENT_ROLE_MAX,
    },
    {
      field: "situation",
      min: DC_LIMITS.SITUATION_MIN,
      max: DC_LIMITS.SITUATION_MAX,
    },
    {
      field: "sharedBackstory",
      min: DC_LIMITS.SHARED_BACKSTORY_MIN,
      max: DC_LIMITS.SHARED_BACKSTORY_MAX,
    },
    {
      field: "hiddenPosition",
      min: DC_LIMITS.HIDDEN_POSITION_MIN,
      max: DC_LIMITS.HIDDEN_POSITION_MAX,
    },
    {
      field: "studentObjective",
      min: DC_LIMITS.STUDENT_OBJECTIVE_MIN,
      max: DC_LIMITS.STUDENT_OBJECTIVE_MAX,
    },
    { field: "stakes", min: DC_LIMITS.STAKES_MIN, max: DC_LIMITS.STAKES_MAX },
  ];

  for (const { field, min, max } of textFields) {
    const missing = { ...validInput(), [field]: "" };
    const missingErrs = validateDifficultConversationInput(missing);
    const missingHit = missingErrs.find((e) => e.field === field);
    check(
      `${field} missing fails`,
      !!missingHit && messageHasProblemAndFix(missingHit.message),
      JSON.stringify(missingErrs)
    );

    const short = {
      ...validInput(),
      [field]: pad("x", Math.max(1, min - 1)),
    };
    const shortErrs = validateDifficultConversationInput(short);
    const shortHit = shortErrs.find((e) => e.field === field);
    check(
      `${field} too short fails`,
      !!shortHit && messageHasProblemAndFix(shortHit.message),
      JSON.stringify(shortErrs)
    );

    const long = { ...validInput(), [field]: pad("y", max + 1) };
    const longErrs = validateDifficultConversationInput(long);
    const longHit = longErrs.find((e) => e.field === field);
    check(
      `${field} too long fails`,
      !!longHit && messageHasProblemAndFix(longHit.message),
      JSON.stringify(longErrs)
    );
  }

  {
    const five = validateDifficultConversationInput({
      title: "ab",
      avatarRole: "",
      studentRole: "x",
      situation: "too short",
      sharedBackstory: "also too short",
      studentObjective: "ok objective here",
      stakes: "ok stakes!!",
      difficulty: "hostile",
    });
    check(
      "five fields failing at once → five entries",
      five.length >= 5,
      `got ${five.length}: ${five.map((e) => e.field).join(",")}`
    );
    check(
      "every multi-fail message has problem+fix",
      five.every((e) => messageHasProblemAndFix(e.message)),
      JSON.stringify(five)
    );
  }

  // ---- 3. Difficulty bands ----
  console.log("\n3. Difficulty bands");
  {
    const bad = validateDifficultConversationInput(
      validInput({ difficulty: "extreme" as never })
    );
    check(
      "difficulty outside bands fails",
      bad.some((e) => e.field === "difficulty"),
      JSON.stringify(bad)
    );
    for (const band of DIFFICULTY_BANDS) {
      const ok = validateDifficultConversationInput(
        validInput({ difficulty: band })
      );
      check(`band "${band}" passes`, ok.length === 0, JSON.stringify(ok));
    }
  }

  // ---- 4. Avatar/voice pairing ----
  console.log("\n4. avatarId / voiceId pairing");
  {
    const avatarOnly = validateDifficultConversationInput({
      ...validInput(),
      avatarId: "a1",
      voiceId: "",
    });
    check(
      "avatarId without voiceId fails",
      avatarOnly.some((e) => e.field === "voiceId"),
      JSON.stringify(avatarOnly)
    );

    const voiceOnly = validateDifficultConversationInput({
      ...validInput(),
      avatarId: "",
      voiceId: "v1",
    });
    check(
      "voiceId without avatarId fails",
      voiceOnly.some((e) => e.field === "avatarId"),
      JSON.stringify(voiceOnly)
    );

    check(
      "both present passes",
      validateDifficultConversationInput(validInput()).length === 0
    );
    check(
      "both absent passes",
      validateDifficultConversationInput({
        ...validInput(),
        avatarId: "",
        voiceId: "",
      }).length === 0
    );
  }

  // ---- 5. Unknown key ----
  console.log("\n5. Unknown key rejected");
  {
    const errs = validateDifficultConversationInput({
      ...validInput(),
      cohortIds: ["x"],
    } as never);
    check(
      "unknown key rejected",
      errs.some((e) => e.field === "cohortIds"),
      JSON.stringify(errs)
    );
  }

  // ---- S3 round-trips (fail loudly if unavailable) ----
  if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID) {
    console.error(
      "\nS3 credentials missing (AWS_S3_BUCKET_NAME / AWS_ACCESS_KEY_ID). Cannot skip."
    );
    process.exit(1);
  }

  // Probe with a real write — list helpers swallow credential errors.
  const probeId = `verify-dc-probe-${Date.now()}`;
  try {
    const probe: DifficultConversationRecord = {
      id: probeId,
      title: "probe",
      avatarRole: "r",
      studentRole: "s",
      situation: pad("sit ", 40),
      sharedBackstory: pad("back ", 40),
      hiddenPosition: pad("hide ", 40),
      studentObjective: "Get a commitment.",
      stakes: "Escalation to HR.",
      difficulty: "receptive",
      avatarId: "a",
      voiceId: "v",
      ownerId: USER_A,
      published: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastCheck: null,
    };
    await s3Storage.saveDifficultConversationObject(probe);
    createdIds.push(probeId);
    await s3Storage.deleteDifficultConversationObject(probeId);
    createdIds.pop();
  } catch (err) {
    console.error("\nS3 unavailable — failing loudly:", err);
    process.exit(1);
  }

  let saved: DifficultConversationRecord | null = null;

  try {
    // ---- 6. Round-trip ----
    console.log("\n6. Round-trip save/load/index");
    {
      saved = await saveDifficultConversation(
        { ...validInput(), id: `verify-dc-${Date.now()}` },
        USER_A
      );
      createdIds.push(saved.id);

      const loaded = await loadOwnedDifficultConversation(saved.id, USER_A);
      check("load as owner returns record", !!loaded, "null");
      check(
        "round-trip fields match",
        !!loaded &&
          loaded.title === saved.title &&
          loaded.hiddenPosition === saved.hiddenPosition &&
          loaded.ownerId === USER_A &&
          loaded.published === false,
        JSON.stringify(loaded)
      );

      const listed = await listDifficultConversations({ ownerId: USER_A });
      check(
        "index lists the record",
        listed.some((e) => e.id === saved!.id),
        JSON.stringify(listed.map((e) => e.id))
      );
    }

    // ---- 7. 404-never-403 ----
    console.log("\n7. 404-never-403");
    {
      const asB = await loadOwnedDifficultConversation(saved!.id, USER_B);
      const missing = await loadOwnedDifficultConversation(
        "verify-dc-does-not-exist",
        USER_A
      );

      const ownerlessId = `verify-dc-ownerless-${Date.now()}`;
      const ownerless: DifficultConversationRecord = {
        ...saved!,
        id: ownerlessId,
        ownerId: null,
      };
      await s3Storage.saveDifficultConversationObject(ownerless);
      createdIds.push(ownerlessId);
      const asOwnerless = await loadOwnedDifficultConversation(
        ownerlessId,
        USER_A
      );

      check("non-owner → null", asB === null);
      check("missing id → null", missing === null);
      check("ownerless → null", asOwnerless === null);
      check(
        "all three indistinguishable (all null)",
        asB === null && missing === null && asOwnerless === null
      );
    }

    // ---- 8. Play path ----
    console.log("\n8. Play path (published is discovery, not access)");
    {
      // Assertion: published === false on saved record, yet forPlay still returns it
      // for a non-owner. Deliberate: published gates discovery only, not access.
      check("saved record is unpublished", saved!.published === false);
      const play = await loadDifficultConversationForPlay(saved!.id);
      check(
        "forPlay returns record for non-owner while published===false",
        !!play && play.id === saved!.id && play.ownerId === USER_A,
        JSON.stringify(
          play && {
            id: play.id,
            ownerId: play.ownerId,
            published: play.published,
          }
        )
      );
    }

    // ---- 9. Privacy boundary ----
    console.log("\n9. Privacy boundary — summaries omit hiddenPosition");
    {
      const summaries = await listDifficultConversations();
      const leak = summaries.some((entry) =>
        Object.prototype.hasOwnProperty.call(entry, "hiddenPosition")
      );
      check("no summary contains hiddenPosition key", !leak);
    }

    // ---- 10. Server-side ownership ----
    console.log("\n10. Server-side ownership stamping");
    {
      const beforePublished = saved!.published;
      const sneaky = await saveDifficultConversation(
        {
          ...validInput(),
          id: saved!.id,
          ...( {
            ownerId: "someone-else",
            published: true,
          } as object),
        } as DifficultConversationSaveInput,
        USER_A
      );
      check(
        "stored ownerId is authenticated userId",
        sneaky.ownerId === USER_A,
        sneaky.ownerId ?? "null"
      );
      check(
        "stored published preserved (not taken from payload)",
        sneaky.published === beforePublished,
        `got ${sneaky.published}`
      );
      saved = sneaky;
    }

    // ---- 11. Delete ownership ----
    console.log("\n11. Delete ownership");
    {
      const denied = await deleteDifficultConversation(saved!.id, USER_B);
      check("delete as non-owner → false", denied === false);
      const stillThere = await s3Storage.difficultConversationExists(saved!.id);
      check("record still exists after denied delete", stillThere === true);

      const ok = await deleteDifficultConversation(saved!.id, USER_A);
      check("delete as owner → true", ok === true);
      const gone = await s3Storage.difficultConversationExists(saved!.id);
      check("object gone after owner delete", gone === false);
      const index = await listDifficultConversations();
      check(
        "index entry gone after owner delete",
        !index.some((e) => e.id === saved!.id)
      );
      const idx = createdIds.indexOf(saved!.id);
      if (idx >= 0) createdIds.splice(idx, 1);
    }
  } finally {
    await cleanup();
    const leftover = (
      await s3Storage.listDifficultConversationObjects()
    ).filter((e) => createdIds.includes(e.id));
    check(
      "cleanup left no createdIds behind",
      leftover.length === 0,
      leftover.map((e) => e.id).join(",")
    );
  }

  console.log(
    failures === 0
      ? "\nAll sections passed.\n"
      : `\n${failures} assertion(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-dc-store crashed:", err);
  process.exit(1);
});
