/**
 * Proves the difficult-conversation TYPE (plan 15-06): eight dimensions,
 * session-constant prompt, reminder in the tail, floor-gated walk-out,
 * no scoring hook, no time envelope, and locked-decision text guards.
 *
 * Run: npx tsx scripts/verify-dc-type.ts
 * Seeded resolution needs the live HeyGen catalog; authored resolution needs S3.
 * dotenv MUST load before those modules initialize.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv();

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const ROOT = resolve(__dirname, "..");

async function main() {
  const { resolveSessionConfig } = await import("../lib/engine/resolve");
  const { getEngineType } = await import("../lib/engine/registry");
  const { buildRubricJsonSchema } = await import("../lib/engine/rubric");
  const { resolveTermination } = await import("../lib/engine/termination");
  const { computeTimeBudgetState } = await import("../lib/engine/time-budget");
  const { assembleSystemPrompt, buildTailBlock } = await import(
    "../lib/engine/prompts"
  );
  const {
    buildConversationSystemPrompt,
    buildInCharacterReminder,
    CONVERSATION_EVALUATOR_PROMPT,
  } = await import("../lib/difficult-conversation/conversation-prompts");
  const {
    resolveDifficultConversationInstance,
    mapRecordToInstance,
  } = await import("../lib/difficult-conversation/resolve-instance");
  const {
    SEEDED_CONVERSATIONS,
    findSeededConversation,
  } = await import("../lib/difficult-conversation/seeded");
  const {
    saveDifficultConversation,
    deleteDifficultConversation,
  } = await import("../lib/difficult-conversation/store");
  const { resolveAttemptLanguage } = await import("../lib/languages");

  const language = resolveAttemptLanguage(undefined);

  // ---------------------------------------------------------------------------
  console.log("\n1. resolveSessionConfig — seeded, authored, and required instance");
  {
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    check("seeded instance resolves", seeded !== null, "null");
    if (seeded) {
      const ok = resolveSessionConfig("difficult-conversation", {
        instance: seeded,
      });
      check("seeded → resolveSessionConfig ok:true", ok.ok === true, JSON.stringify(ok));
    }

    const missing = resolveSessionConfig("difficult-conversation", {});
    check(
      "undefined instance → ok:false (instance.required)",
      missing.ok === false,
      JSON.stringify(missing),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n2. Seeded-first resolution — seven seeded + one authored");
  {
    const seededIds = SEEDED_CONVERSATIONS.map((r) => r.id);
    check("seven seeded records", seededIds.length === 7, String(seededIds.length));

    const shapes: string[][] = [];

    for (const id of seededIds) {
      const instance = await resolveDifficultConversationInstance(id);
      check(`resolve("${id}") source:seeded`, instance?.source === "seeded");
      if (instance) shapes.push(Object.keys(instance).sort());
    }

    if (shapes.length >= 2) {
      check(
        "seeded member shapes structurally identical",
        shapes.every((k) => JSON.stringify(k) === JSON.stringify(shapes[0])),
      );
    }

    const ownerId = `verify-dc-type-${Date.now()}`;
    let authoredId: string | null = null;

    try {
      const saved = await saveDifficultConversation(
        {
          title: "Verify authored resolve",
          avatarRole: "Peer on the squad",
          studentRole: "Tech lead",
          situation:
            "You need to raise a recurring missed handoff that is putting the sprint commitment at risk and get a concrete recovery plan.",
          sharedBackstory:
            "Both of you know the last two handoffs slipped and that the sprint review is Friday. A prior standup flagged the dependency without resolving it.",
          hiddenPosition:
            "You believe the lead keeps changing scope mid-sprint and you will not own a written plan until they admit the thrash.",
          studentObjective: "Get a written recovery plan with owners and dates.",
          stakes: "If it goes badly the sprint slips and trust on the squad erodes.",
          difficulty: "guarded",
          avatarId: "avatar-verify-authored",
          voiceId: "voice-verify-authored",
        },
        ownerId,
      );
      authoredId = saved.id;

      const authored = await resolveDifficultConversationInstance(saved.id);
      check(
        "authored S3 id → source:authored",
        authored?.source === "authored",
        JSON.stringify(authored?.source),
      );

      if (authored && shapes[0]) {
        check(
          "authored and seeded share the same key set",
          JSON.stringify(Object.keys(authored).sort()) ===
            JSON.stringify(shapes[0]),
        );
      }

      // Seeded-first: a seeded id must not be shadowed by an authored object.
      const seededHit = findSeededConversation("confront-low-performer");
      const viaResolver = await resolveDifficultConversationInstance(
        "confront-low-performer",
      );
      check(
        "seeded id still resolves as seeded (code array first)",
        Boolean(seededHit) && viaResolver?.source === "seeded",
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      check("authored S3 resolve path available", false, detail);
    } finally {
      if (authoredId) {
        try {
          await deleteDifficultConversation(authoredId, ownerId);
        } catch {
          // best-effort cleanup
        }
      }
    }

    // Pure mapper identity (no I/O) — same keys regardless of source label.
    const sample = SEEDED_CONVERSATIONS[0]!;
    const a = mapRecordToInstance(sample, "authored", {
      avatarId: "x",
      voiceId: "y",
    });
    const b = mapRecordToInstance(sample, "seeded", {
      avatarId: "x",
      voiceId: "y",
    });
    check(
      "mapRecordToInstance key sets match across sources",
      JSON.stringify(Object.keys(a).sort()) ===
        JSON.stringify(Object.keys(b).sort()),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n3. Eight rubric dimensions in locked order (REQ-72)");
  {
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    const result = resolveSessionConfig("difficult-conversation", {
      instance: seeded!,
    });
    if (!result.ok) {
      check("resolve for rubric", false);
    } else {
      const keys = result.config.rubricDimensions.map((d) => d.key);
      const expected = [
        "visual",
        "vocal",
        "content",
        "behavioral",
        "clarity",
        "empathy",
        "holding_the_line",
        "objective_achieved",
      ];
      check(
        "keys exactly eight in order",
        JSON.stringify(keys) === JSON.stringify(expected),
        JSON.stringify(keys),
      );
      check("visual present", keys.includes("visual"));
      check("vocal present", keys.includes("vocal"));
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n4. buildRubricJsonSchema — extras + outcome separation");
  {
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    const result = resolveSessionConfig("difficult-conversation", {
      instance: seeded!,
    });
    if (!result.ok) {
      check("resolve for schema", false);
    } else {
      const schema = buildRubricJsonSchema(result.config);
      const required = schema.schema.required;
      for (const key of [
        "clarity_score",
        "empathy_score",
        "holding_the_line_score",
        "objective_achieved_score",
        "visual_score",
        "vocal_score",
      ]) {
        check(`required[] contains ${key}`, required.includes(key));
      }
      check("outcome in required[]", required.includes("outcome"));
      const outcome = schema.schema.properties.outcome as {
        properties?: Record<string, unknown>;
      };
      check(
        "outcome has objectiveStatus",
        Boolean(outcome?.properties?.objectiveStatus),
      );
      check(
        "outcome has inRoleReaction",
        Boolean(outcome?.properties?.inRoleReaction),
      );
      check(
        "outcome has reactionCauses",
        Boolean(outcome?.properties?.reactionCauses),
      );
      // Physical separation: outcome keys must not appear as top-level score props.
      check(
        "objectiveStatus not a top-level score property",
        !("objectiveStatus" in schema.schema.properties),
      );
      check(
        "inRoleReaction not a top-level score property",
        !("inRoleReaction" in schema.schema.properties),
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n5. Session-constant prompt across difficulty bands");
  {
    const base = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    if (!base) {
      check("seeded base for prompt", false);
    } else {
      const prompts: string[] = [];
      for (const difficulty of ["receptive", "guarded", "hostile"] as const) {
        const result = resolveSessionConfig("difficult-conversation", {
          instance: { ...base, difficulty },
        });
        if (!result.ok) {
          check(`resolve ${difficulty}`, false);
          continue;
        }
        const a = buildConversationSystemPrompt(result.config);
        const b = buildConversationSystemPrompt(result.config);
        check(`${difficulty}: byte-identical`, a === b);
        check(
          `${difficulty}: full hiddenPosition present`,
          a.includes(base.hiddenPosition),
        );
        prompts.push(a);
      }
      check(
        "three difficulty prompts differ",
        prompts.length === 3 &&
          prompts[0] !== prompts[1] &&
          prompts[1] !== prompts[2] &&
          prompts[0] !== prompts[2],
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n6. Reminder in the tail, not the system prompt; prefix stable");
  {
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    const result = resolveSessionConfig("difficult-conversation", {
      instance: seeded!,
    });
    if (!result.ok) {
      check("resolve for reminder", false);
    } else {
      const system = buildConversationSystemPrompt(result.config);
      const reminder = buildInCharacterReminder(result.config);
      const tail = buildTailBlock(result.config, {});
      check("reminder non-empty", reminder.length > 20);
      check("reminder appears in buildTailBlock", tail.includes(reminder));
      check(
        "reminder does NOT appear in system prompt",
        !system.includes(reminder) && !system.includes("[IN-CHARACTER REMINDER"),
      );

      const p1 = assembleSystemPrompt(result.config, { language });
      const p2 = assembleSystemPrompt(result.config, { language });
      check("assembleSystemPrompt byte-identical twice", p1 === p2);
      check(
        "assembleSystemPrompt matches buildConversationSystemPrompt",
        p1 === system,
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n7. Floor — positive and negative");
  {
    const type = getEngineType("difficult-conversation")!;
    const policy = type.terminationPolicy;

    const below = resolveTermination({
      policy,
      source: "avatar",
      reason: "walked_out",
      assistantTurnCount: 3,
    });
    check(
      "assistantTurnCount:3 + walked_out REJECTED",
      below.ok === false && below.reason === "floor-not-met",
      JSON.stringify(below),
    );

    // 20-03 gave this type a real disengagementThreshold, so gate 4 of
    // resolveTermination now requires trusted derived evidence at or above
    // it (lib/engine/termination.ts's fail-closed rule) — the chat route
    // always supplies the real computed value; this fixture supplies the
    // type's own declared threshold to exercise the same gate explicitly.
    const atFloor = resolveTermination({
      policy,
      source: "avatar",
      reason: "walked_out",
      assistantTurnCount: 4,
      disengagementValue: policy.disengagementThreshold ?? undefined,
    });
    check(
      "assistantTurnCount:4 + walked_out + at-threshold evidence ACCEPTED",
      atFloor.ok === true && atFloor.recordedReason === "walked_out",
      JSON.stringify(atFloor),
    );

    const missingEvidence = resolveTermination({
      policy,
      source: "avatar",
      reason: "walked_out",
      assistantTurnCount: 4,
    });
    check(
      "assistantTurnCount:4 + walked_out + NO disengagement evidence REJECTED (fails closed)",
      missingEvidence.ok === false &&
        missingEvidence.reason === "disengagement-below-threshold",
      JSON.stringify(missingEvidence),
    );

    const badReason = resolveTermination({
      policy,
      source: "avatar",
      reason: "bored",
      assistantTurnCount: 4,
    });
    check(
      'assistantTurnCount:4 + "bored" REJECTED',
      badReason.ok === false && badReason.recordedReason === null,
      JSON.stringify(badReason),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n8. Student end — both reason codes accepted and distinguishable");
  {
    const type = getEngineType("difficult-conversation")!;
    const policy = type.terminationPolicy;

    const closed = resolveTermination({
      policy,
      source: "student",
      reason: "student_closed_in_character",
    });
    const left = resolveTermination({
      policy,
      source: "student",
      reason: "student_left_session",
    });
    check(
      "student_closed_in_character ACCEPTED",
      closed.ok === true &&
        closed.recordedReason === "student_closed_in_character",
    );
    check(
      "student_left_session ACCEPTED",
      left.ok === true && left.recordedReason === "student_left_session",
    );
    check(
      "student end reasons distinguishable",
      closed.ok &&
        left.ok &&
        closed.recordedReason !== left.recordedReason,
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n9. No scoring hook");
  {
    const type = getEngineType("difficult-conversation")!;
    check(
      "postProcessScores is undefined",
      type.postProcessScores === undefined,
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n10. No time envelope");
  {
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    const result = resolveSessionConfig("difficult-conversation", {
      instance: seeded!,
    });
    if (!result.ok) {
      check("resolve for timeBudget", false);
    } else {
      check(
        "totalSeconds === null",
        result.config.timeBudget.totalSeconds === null,
      );
      check(
        "firstTurnWindowSeconds === null",
        result.config.timeBudget.firstTurnWindowSeconds == null,
      );
      const state = computeTimeBudgetState({
        config: result.config.timeBudget,
        startedAt: new Date(0),
        now: new Date(1800 * 1000),
      });
      check(
        "1800s elapsed is not a stop signal",
        state.remainingSeconds === null &&
          state.expired === false &&
          state.warn === false,
        JSON.stringify(state),
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n11. Locked-decision text guards");
  {
    const typeSrc = readFileSync(
      resolve(ROOT, "lib/difficult-conversation/conversation-type.ts"),
      "utf8",
    );
    const promptsSrc = readFileSync(
      resolve(ROOT, "lib/difficult-conversation/conversation-prompts.ts"),
      "utf8",
    );
    const combined = `${typeSrc}\n${promptsSrc}`;

    check(
      "no engagementScore / engagement_meter / gauge",
      !/engagementScore|engagement_meter|\bgauge\b/i.test(combined),
    );
    check(
      "no coach-voice detector symbols",
      !/detectCoachVoice|regenerateTurn|isOutOfCharacter/.test(combined),
    );
    check(
      "no industry/role reframing field",
      !/\bindustry\b/.test(typeSrc) && !/roleTitle|role_refram/.test(combined),
    );
    check("no cohortIds", !/cohortIds/.test(combined));

    // Difficulty must not appear in any client-bound builder output.
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    const { buildStudentBriefing } = await import(
      "../lib/difficult-conversation/conversation-prompts"
    );
    if (seeded) {
      const briefing = buildStudentBriefing(seeded);
      check(
        "student briefing has no difficulty string",
        !briefing.toLowerCase().includes(seeded.difficulty) &&
          !/\b(receptive|guarded|hostile)\b/i.test(briefing),
      );
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n12. Prohibition section present and specific");
  {
    const seeded = await resolveDifficultConversationInstance(
      "confront-low-performer",
    );
    const result = resolveSessionConfig("difficult-conversation", {
      instance: seeded!,
    });
    if (!result.ok) {
      check("resolve for prohibition", false);
    } else {
      const system = buildConversationSystemPrompt(result.config);
      const numbered = (system.match(/^\d+\.\s/gm) ?? []).length;
      const wrongs = (system.match(/\bWRONG:/g) ?? []).length;
      check(`at least four numbered rules (found ${numbered})`, numbered >= 4);
      check(`at least four WRONG examples (found ${wrongs})`, wrongs >= 4);
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n13. Approach-not-result instruction present");
  {
    check(
      'evaluator contains "immovable"',
      /immovable/i.test(CONVERSATION_EVALUATOR_PROMPT),
    );
    check(
      "two-case calibration present",
      /Objective not met \+ skilful pursuit = high/i.test(
        CONVERSATION_EVALUATOR_PROMPT,
      ) &&
        /Objective met \+ clumsy pursuit = low/i.test(
          CONVERSATION_EVALUATOR_PROMPT,
        ),
    );
    check(
      'explicit "do not score the outcome record"',
      /do not score the outcome record/i.test(CONVERSATION_EVALUATOR_PROMPT),
    );
  }

  console.log(
    failures === 0
      ? "\nALL PASS — verify-dc-type.ts\n"
      : `\n${failures} FAILURE(S) — verify-dc-type.ts\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
