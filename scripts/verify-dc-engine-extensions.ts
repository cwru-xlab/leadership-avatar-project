/**
 * Proves Phase 15 plan 15-01 engine extensions: difficult-conversation
 * InstanceConfig + InputSnapshot members, the hiddenPosition privacy
 * boundary, Phase 14's avatarEndFloor gate, and the two student-end
 * reason codes — without extending the termination marker (Gap 1).
 *
 * Run: npx tsx scripts/verify-dc-engine-extensions.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseTerminationMarker,
  resolveTermination,
} from "../lib/engine/termination";
import type {
  DifficultConversationInstance,
  InstanceConfig,
  TerminationPolicyConfig,
} from "../lib/engine/types";
import {
  asInputSnapshot,
  type DifficultConversationInputSnapshot,
  type InputSnapshot,
} from "../lib/report/snapshot";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const FULL_INSTANCE: DifficultConversationInstance = {
  kind: "difficult-conversation",
  conversationId: "dc-seed-001",
  source: "seeded",
  role: "Dana, your direct report",
  studentRole: "their manager",
  situation: "Dana missed a critical deadline and the client noticed.",
  sharedBackstory: "The team shipped late; Dana owned the integration piece.",
  hiddenPosition:
    "Dana believes the deadline was unrealistic and will not volunteer that she skipped the dry run.",
  studentObjective: "Get a concrete recovery plan without destroying trust.",
  stakes: "If this goes badly, Dana disengages and the next release slips further.",
  difficulty: "guarded",
  avatarId: "avatar-dana",
  voiceId: "voice-dana",
};

function snapshotFromInstance(
  instance: DifficultConversationInstance,
): DifficultConversationInputSnapshot {
  return {
    kind: "difficult-conversation",
    conversationId: instance.conversationId,
    conversationTitle: "Missed deadline with Dana",
    source: instance.source,
    role: instance.role,
    studentRole: instance.studentRole,
    situation: instance.situation,
    sharedBackstory: instance.sharedBackstory,
    studentObjective: instance.studentObjective,
    stakes: instance.stakes,
    difficulty: instance.difficulty,
    avatarId: instance.avatarId,
  };
}

console.log("\n1. DifficultConversationInstance narrows on kind");
{
  const config: InstanceConfig = FULL_INSTANCE;
  check(
    "kind discriminant is difficult-conversation",
    config.kind === "difficult-conversation",
  );
  if (config.kind === "difficult-conversation") {
    check(
      "narrowed fields include hiddenPosition and voiceId",
      typeof config.hiddenPosition === "string" &&
        typeof config.voiceId === "string" &&
        config.difficulty === "guarded",
      JSON.stringify({
        hiddenPosition: config.hiddenPosition,
        voiceId: config.voiceId,
        difficulty: config.difficulty,
      }),
    );
  } else {
    check("narrowed fields include hiddenPosition and voiceId", false, "kind mismatch");
  }
}

console.log("\n2. DifficultConversationInputSnapshot round-trips through asInputSnapshot");
{
  const snap = snapshotFromInstance(FULL_INSTANCE);
  const narrowed = asInputSnapshot(snap);
  check("narrowing returns non-null", narrowed !== null, String(narrowed));
  check(
    "narrowed kind is difficult-conversation",
    narrowed?.kind === "difficult-conversation",
    JSON.stringify(narrowed),
  );
  if (narrowed?.kind === "difficult-conversation") {
    check(
      "conversationTitle and difficulty preserved",
      narrowed.conversationTitle === "Missed deadline with Dana" &&
        narrowed.difficulty === "guarded",
      JSON.stringify(narrowed),
    );
  }
}

console.log("\n3. Privacy boundary — hiddenPosition absent from snapshot");
{
  const snapshotPath = resolve(__dirname, "../lib/report/snapshot.ts");
  const sourceText = readFileSync(snapshotPath, "utf8");
  const lines = sourceText.split("\n");
  const nonCommentHits = lines.filter((line) => {
    if (!line.includes("hiddenPosition")) return false;
    const trimmed = line.trim();
    return !(trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"));
  });
  check(
    "hiddenPosition appears only on comment lines in snapshot.ts",
    nonCommentHits.length === 0,
    nonCommentHits.join(" | "),
  );

  const snap = snapshotFromInstance(FULL_INSTANCE);
  check(
    '"hiddenPosition" in snapshot === false',
    !("hiddenPosition" in snap),
    JSON.stringify(Object.keys(snap)),
  );
}

console.log("\n4. Malformed snapshots return null and do not throw");
{
  const cases: Array<{ name: string; value: unknown }> = [
    { name: "missing kind", value: { conversationId: "x" } },
    { name: "wrong kind", value: { kind: "interview", conversationId: "x" } },
    {
      name: "undeclared difficulty band",
      value: {
        ...snapshotFromInstance(FULL_INSTANCE),
        difficulty: "nuclear",
      },
    },
    {
      name: "role set to a number",
      value: {
        ...snapshotFromInstance(FULL_INSTANCE),
        role: 42,
      },
    },
  ];

  for (const c of cases) {
    let threw = false;
    let result: InputSnapshot | null = null;
    try {
      result = asInputSnapshot(c.value);
    } catch (err) {
      threw = true;
      check(`${c.name} does not throw`, false, String(err));
    }
    if (!threw) {
      check(`${c.name} returns null`, result === null, JSON.stringify(result));
    }
  }
}

console.log("\n5. Floor — positive and negative");
{
  const policy: TerminationPolicyConfig = {
    studentMayEnd: true,
    avatarMayEnd: true,
    avatarEndReasons: ["walked_away", "agreed_to_plan"],
    avatarEndFloor: { minAssistantTurns: 3 },
  };

  const early = resolveTermination({
    policy,
    source: "avatar",
    reason: "agreed_to_plan",
    assistantTurnCount: 2,
  });
  check(
    "avatar end at assistantTurnCount 2 is REJECTED",
    early.ok === false && early.recordedReason === null,
    JSON.stringify(early),
  );

  const atFloor = resolveTermination({
    policy,
    source: "avatar",
    reason: "agreed_to_plan",
    assistantTurnCount: 3,
  });
  check(
    "avatar end at assistantTurnCount 3 is ACCEPTED",
    atFloor.ok === true && atFloor.recordedReason === "agreed_to_plan",
    JSON.stringify(atFloor),
  );

  const undeclared = resolveTermination({
    policy,
    source: "avatar",
    reason: "invented_reason",
    assistantTurnCount: 3,
  });
  check(
    "avatar end at floor with undeclared reason is REJECTED",
    undeclared.ok === false && undeclared.recordedReason === null,
    JSON.stringify(undeclared),
  );
}

console.log("\n6. Student end — both reason codes pass and are distinguishable");
{
  const policy: TerminationPolicyConfig = {
    studentMayEnd: true,
    avatarMayEnd: false,
    avatarEndReasons: [],
  };

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
    "student_closed_in_character is ACCEPTED",
    closed.ok === true && closed.recordedReason === "student_closed_in_character",
    JSON.stringify(closed),
  );
  check(
    "student_left_session is ACCEPTED",
    left.ok === true && left.recordedReason === "student_left_session",
    JSON.stringify(left),
  );
  check(
    "the two reason codes are distinguishable in the result",
    closed.ok &&
      left.ok &&
      closed.recordedReason !== left.recordedReason,
    JSON.stringify({ closed, left }),
  );
}

console.log("\n7. No marker change — parseTerminationMarker has no source attribute");
{
  const terminationPath = resolve(__dirname, "../lib/engine/termination.ts");
  const sourceText = readFileSync(terminationPath, "utf8");
  const fnStart = sourceText.indexOf("export function parseTerminationMarker");
  const nextExport = sourceText.indexOf("\nexport ", fnStart + 1);
  const body =
    fnStart >= 0
      ? sourceText.slice(fnStart, nextExport === -1 ? undefined : nextExport)
      : "";

  check(
    "parseTerminationMarker body is present",
    body.includes("parseTerminationMarker") && body.includes("REASON_ATTRIBUTE"),
    body.slice(0, 120),
  );
  check(
    "marker parser body has no source= / source: attribute",
    !/source\s*=/.test(body) && !/source\s*:/.test(body),
    body,
  );

  // Sanity: a normal marker still parses (Phase 15 did not break 13-03).
  const parsed = parseTerminationMarker(
    'Alright — I will put that in writing. <engine-end reason="agreed_to_plan" />',
  );
  check(
    "existing marker syntax still strips and extracts reason",
    parsed.cleanedText === "Alright — I will put that in writing." &&
      parsed.termination?.reason === "agreed_to_plan",
    JSON.stringify(parsed),
  );
}

console.log("\n8. Additive only — interview, scenario, and pitch (if present) still narrow");
{
  const interview = asInputSnapshot({
    kind: "interview",
    interviewerAvatarId: null,
    interviewerName: null,
    resumeId: null,
    resumeText: null,
    industry: null,
    roleTitle: null,
    difficulty: null,
    targetMinutes: null,
    targetQuestionCount: null,
    interviewerPersona: null,
  });
  check(
    "interview snapshot still narrows",
    interview?.kind === "interview",
    JSON.stringify(interview),
  );

  const scenario = asInputSnapshot({
    kind: "scenario",
    caseId: "case-1",
    caseName: "A case",
    background: "Background",
    avatars: [],
    criteria: null,
  });
  check(
    "scenario snapshot still narrows",
    scenario?.kind === "scenario",
    JSON.stringify(scenario),
  );

  const pitchProbe = asInputSnapshot({
    kind: "pitch",
    pitchKind: "elevator",
    pitchSubject: "A product",
    listenerKnowledge: "blind",
    deckId: null,
    slideCount: null,
    askPriceUsd: null,
    askEquityPct: null,
    fairValueBand: null,
    firstTurnWindowSeconds: 60,
    budgetSeconds: 180,
    listenerPersona: null,
  });
  if (pitchProbe === null) {
    // Pitch member not present — acceptable if Phase 14 snapshot has not landed.
    check(
      "pitch snapshot member absent or rejected (Phase 14 may not have landed)",
      true,
    );
  } else {
    check(
      "pitch snapshot still narrows when present",
      pitchProbe.kind === "pitch",
      JSON.stringify(pitchProbe),
    );
  }
}

console.log("");
if (failures > 0) {
  console.error(`verify-dc-engine-extensions: ${failures} failure(s)`);
  process.exit(1);
}
console.log("verify-dc-engine-extensions: all sections passed");
process.exit(0);
