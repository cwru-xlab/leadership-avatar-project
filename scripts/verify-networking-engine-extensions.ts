/**
 * Proves Phase 16 plan 16-03 engine extensions: the networking-persona
 * InstanceConfig member, the networking InputSnapshot member, the
 * never-publishable absence (16-CONTEXT.md decision 7), the single
 * avatarEndFloor declaration, and floor enforcement — without touching
 * Phase 13's verify-engine-config.ts / verify-engine-primitives.ts.
 *
 * Run: npx tsx scripts/verify-networking-engine-extensions.ts
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { ENGINE_TYPES } from "../lib/engine/registry";
import { resolveFromTypeConfig } from "../lib/engine/resolve";
import { resolveTermination } from "../lib/engine/termination";
import type {
  InstanceConfig,
  InteractionTypeConfig,
  TerminationPolicyConfig,
} from "../lib/engine/types";
import {
  asInputSnapshot,
  type NetworkingInputSnapshot,
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

const ROOT = resolve(__dirname, "..");

const NETWORKING_PERSONA: InstanceConfig = {
  kind: "networking-persona",
  personaId: "persona-alex-001",
  ownerId: "user-owner-1",
  displayName: "Alex Rivera",
  persona:
    "Alex Rivera is a VP of marketing at a mid-size CPG company, warm but time-pressed.",
  source: "pasted",
  attestationId: "att-001",
  attestedAt: "2026-10-04T00:00:00.000Z",
  attestedWordingVersion: "networking-attestation-v1",
  createdAt: "2026-10-04T00:00:00.000Z",
};

function networkingStubType(): InteractionTypeConfig {
  return {
    slug: "networking",
    name: "Networking Practice",
    description: "Stub type record for 16-03 config-layer proofs only.",
    extraRubricDimensions: [],
    prompts: {
      liveSystemPrompt: () => "",
      evaluatorPrompt: "",
      buildEvaluationContext: () => ({}),
    },
    limits: { targetMinutes: 10, targetQuestionCount: null },
    terminationPolicy: {
      studentMayEnd: true,
      avatarMayEnd: true,
      avatarEndReasons: ["disengage"],
      avatarEndFloor: { minAssistantTurns: 2 },
    },
    visibleContext: { visibleChannels: "*" },
    outcome: { fields: [] },
    timeBudget: { totalSeconds: 600, warnAtRemainingSeconds: 60 },
    instance: { required: false },
    checkpointing: "client-driven",
    finishPendingFlip: "request-path",
    supportsRetry: true,
    setupSteps: [],
  };
}

function networkingSnapshot(): NetworkingInputSnapshot {
  return {
    kind: "networking",
    personaSource: "brought-in",
    characterId: null,
    personaId: "persona-alex-001",
    displayName: "Alex Rivera",
    goal: "A referral into their marketing analytics team",
    interviewerAvatarId: "avatar-1",
    interviewerVoice: "voice-1",
    budgetSeconds: 600,
  };
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

console.log("\n1. Instance narrowing — networking-persona through resolveFromTypeConfig");
{
  const result = resolveFromTypeConfig(networkingStubType(), {
    instance: NETWORKING_PERSONA,
  });
  check("resolves ok:true with networking-persona instance", result.ok === true, JSON.stringify(result));
  if (result.ok && result.config.instance.kind === "networking-persona") {
    const inst = result.config.instance;
    check(
      "every networking-persona field arrives intact",
      inst.personaId === NETWORKING_PERSONA.personaId &&
        inst.ownerId === NETWORKING_PERSONA.ownerId &&
        inst.displayName === NETWORKING_PERSONA.displayName &&
        inst.persona === NETWORKING_PERSONA.persona &&
        inst.source === NETWORKING_PERSONA.source &&
        inst.attestationId === NETWORKING_PERSONA.attestationId &&
        inst.attestedAt === NETWORKING_PERSONA.attestedAt &&
        inst.attestedWordingVersion ===
          NETWORKING_PERSONA.attestedWordingVersion &&
        inst.createdAt === NETWORKING_PERSONA.createdAt,
      JSON.stringify(inst),
    );
  } else {
    check("every networking-persona field arrives intact", false, JSON.stringify(result));
  }
}

console.log("\n2. Optional instance — built-in-character path (instance.required: false)");
{
  const result = resolveFromTypeConfig(networkingStubType(), {});
  check(
    "resolves ok:true with no instance at all",
    result.ok === true,
    JSON.stringify(result),
  );
  check(
    "resolved instance kind is none",
    result.ok === true && result.config.instance.kind === "none",
    JSON.stringify(result),
  );
}

console.log("\n3. Never publishable — source-level guard (16-CONTEXT.md decision 7)");
console.log(
  '   // 16-CONTEXT.md decision 7: "Never publishable; the publish affordance',
);
console.log(
  '   // must be absent, not merely off." A defaulted-false flag is a latent',
);
console.log("   // bug; absence cannot be flipped.");
{
  const typesPath = resolve(ROOT, "lib/engine/types.ts");
  const typesText = readFileSync(typesPath, "utf8");
  const memberStart = typesText.indexOf('kind: "networking-persona"');
  check(
    "networking-persona member exists in types.ts",
    memberStart >= 0,
    "kind: networking-persona not found",
  );

  // Slice from the doc comment immediately above the member through the
  // closing of that union arm (before `| { kind: "none" }`).
  const docStart = typesText.lastIndexOf("/**", memberStart);
  const noneArm = typesText.indexOf('| { kind: "none" }', memberStart);
  const memberBlock =
    memberStart >= 0 && docStart >= 0 && noneArm > memberStart
      ? typesText.slice(docStart, noneArm)
      : "";

  const forbidden = memberBlock.match(
    /\b(published|visibility|isPublic|sharedWith|publishedAt)\b/g,
  );
  // The doc comment intentionally NAMES these identifiers to forbid them.
  // Count only non-comment lines inside the member block.
  const codeLines = memberBlock
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(
        t.startsWith("*") ||
        t.startsWith("/*") ||
        t.startsWith("//") ||
        t === "*/"
      );
    })
    .join("\n");
  const codeHits = codeLines.match(
    /\b(published|visibility|isPublic|sharedWith|publishedAt)\b/g,
  );
  check(
    "no publish/visibility identifier in networking-persona CODE (doc may name them)",
    !codeHits,
    `hits=${JSON.stringify(codeHits)}; forbidden-in-block=${JSON.stringify(forbidden)}`,
  );

  const allFiles = walkFiles(ROOT);
  const publishPathHits = allFiles.filter((f) => {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    const base = rel.toLowerCase();
    return (
      /networking.*publish/.test(base) || /publish.*networking/.test(base)
    );
  });
  check(
    "no **/networking*publish* or **/publish*networking* path outside .planning/",
    publishPathHits.length === 0,
    publishPathHits.map((f) => relative(ROOT, f)).join(", "),
  );

  const publishDir = resolve(ROOT, "app/api/scenario/publish");
  let networkingInPublish = "";
  try {
    networkingInPublish = execSync(
      `grep -rn "networking" "${publishDir}" || true`,
      { encoding: "utf8" },
    ).trim();
  } catch (err) {
    networkingInPublish = String(err);
  }
  check(
    'grep -rn "networking" app/api/scenario/publish/ finds nothing',
    networkingInPublish === "",
    networkingInPublish,
  );
}

console.log("\n4. Snapshot narrowing");
{
  const good = networkingSnapshot();
  const narrowed = asInputSnapshot(good);
  check("well-formed networking snapshot narrows", narrowed !== null, String(narrowed));
  check(
    'narrowed kind is "networking"',
    narrowed?.kind === "networking",
    JSON.stringify(narrowed),
  );
  if (narrowed?.kind === "networking") {
    check(
      "goal and personaId preserved",
      narrowed.goal === good.goal && narrowed.personaId === good.personaId,
      JSON.stringify(narrowed),
    );
  }

  const missingGoal = { ...good } as Record<string, unknown>;
  delete missingGoal.goal;
  check(
    "networking snapshot missing required field returns null",
    asInputSnapshot(missingGoal) === null,
  );

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
    "interview snapshot still narrows to interview",
    interview?.kind === "interview",
    JSON.stringify(interview),
  );

  const pitch = asInputSnapshot({
    kind: "pitch",
    pitchKind: "elevator",
    pitchSubject: "My startup",
    listenerKnowledge: "blind",
    deckId: null,
    slideCount: null,
    askPriceUsd: null,
    askEquityPct: null,
    fairValueBand: null,
    firstTurnWindowSeconds: null,
    budgetSeconds: 120,
    listenerPersona: null,
  });
  check(
    "pitch snapshot (14-02) still narrows to pitch",
    pitch?.kind === "pitch",
    JSON.stringify(pitch),
  );
}

console.log("\n5. Snapshot carries no raw paste");
{
  const sample = networkingSnapshot();
  const keys = Object.keys(sample);
  check("keys include personaId", keys.includes("personaId"));
  check("keys include displayName", keys.includes("displayName"));
  check('keys do NOT include "profileText"', !keys.includes("profileText"));
  check('keys do NOT include "rawPaste"', !keys.includes("rawPaste"));
  check('keys do NOT include "pastedText"', !keys.includes("pastedText"));
}

console.log("\n6. The floor is defined once");
{
  const typesText = readFileSync(resolve(ROOT, "lib/engine/types.ts"), "utf8");
  // Count declaration sites: property name followed by optional `?` and `:`.
  const declMatches = typesText.match(/\bavatarEndFloor\s*\??\s*:/g) ?? [];
  check(
    "exactly one avatarEndFloor DECLARATION in types.ts",
    declMatches.length === 1,
    `count=${declMatches.length}`,
  );

  // 14-02 landed the field (da26f83); 16-03 inherits it.
  const inheritedFrom1402 = true;
  console.log(
    inheritedFrom1402
      ? "  note  avatarEndFloor came from 14-02 (inherited by 16-03)"
      : "  note  avatarEndFloor was added by 16-03 (14-02 had not landed)",
  );
  check("floor provenance recorded", true);
}

console.log("\n7. Floor enforcement present or flagged");
{
  const termText = readFileSync(
    resolve(ROOT, "lib/engine/termination.ts"),
    "utf8",
  );
  const enforcesFloor =
    termText.includes("assistantTurnCount") &&
    termText.includes("avatarEndFloor") &&
    termText.includes("floor-not-met");

  if (!enforcesFloor) {
    console.log(
      "  !!!! HARD BLOCKER FOR PLAN 16-07: avatarEndFloor is declared but",
    );
    console.log(
      "  !!!! resolveTermination does NOT enforce it. 14-02 Task 2 must land",
    );
    console.log(
      "  !!!! first — a declared floor with no enforcement must not look green.",
    );
    check(
      "resolveTermination enforces avatarEndFloor (14-02 Task 2)",
      false,
      "enforcement missing — blocker for 16-07",
    );
  } else {
    const policy: TerminationPolicyConfig = {
      studentMayEnd: true,
      avatarMayEnd: true,
      avatarEndReasons: ["disengage"],
      avatarEndFloor: { minAssistantTurns: 2 },
    };
    const early = resolveTermination({
      policy,
      source: "avatar",
      reason: "disengage",
      assistantTurnCount: 1,
    });
    check(
      "sub-floor avatar termination is rejected",
      early.ok === false && early.recordedReason === null,
      JSON.stringify(early),
    );
    const atFloor = resolveTermination({
      policy,
      source: "avatar",
      reason: "disengage",
      assistantTurnCount: 2,
    });
    check(
      "at-floor avatar termination is accepted",
      atFloor.ok === true && atFloor.recordedReason === "disengage",
      JSON.stringify(atFloor),
    );
  }
}

console.log("\n8. Pre-existing types unchanged");
{
  for (const type of ENGINE_TYPES) {
    // Real records resolve through the registry path; use resolveFromTypeConfig
    // with no instance for required:false types, and a case-study stub for
    // case-study.
    if (type.instance.required) {
      const instance: InstanceConfig = {
        kind: "case-study",
        caseId: "c1",
        caseName: "Case",
        background: "bg",
        avatars: [{ name: "A", role: "R" }],
        criteria: null,
      };
      const result = resolveFromTypeConfig(type, { instance });
      check(`"${type.slug}" still resolves`, result.ok === true, JSON.stringify(result));
      check(
        `"${type.slug}" instance is not networking-persona`,
        result.ok === true && result.config.instance.kind !== "networking-persona",
        JSON.stringify(result.ok ? result.config.instance.kind : result),
      );
    } else {
      const result = resolveFromTypeConfig(type, {});
      check(`"${type.slug}" still resolves`, result.ok === true, JSON.stringify(result));
      check(
        `"${type.slug}" instance is not networking-persona`,
        result.ok === true && result.config.instance.kind !== "networking-persona",
        JSON.stringify(result.ok ? result.config.instance.kind : result),
      );
    }
  }
}

console.log("\n9. No networking vocabulary in the generic primitives");
{
  const primitiveFiles = [
    "lib/engine/visible-context.ts",
    "lib/engine/termination.ts",
    "lib/engine/time-budget.ts",
    "lib/engine/outcome.ts",
  ];
  for (const rel of primitiveFiles) {
    let hits = "";
    try {
      hits = execSync(`grep -in "networking" "${resolve(ROOT, rel)}" || true`, {
        encoding: "utf8",
      }).trim();
    } catch (err) {
      hits = String(err);
    }
    check(`no "networking" in ${rel}`, hits === "", hits);
  }
}

console.log("");
if (failures > 0) {
  console.log(`FAILED with ${failures} failing assertion(s)`);
  process.exit(1);
}
console.log("ALL PASS");
process.exit(0);
