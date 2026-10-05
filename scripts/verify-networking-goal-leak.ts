/**
 * Exhaustive hidden-goal leak assertion for Networking Practice (plan 16-09).
 *
 * Proves a sentinel goal is ABSENT from every live-prompt assembly surface the
 * chat turn uses (assembleSystemPrompt, buildTailBlock, buildTurnMessages /
 * outbound provider body, applyVisibleContext) across six turn positions, and
 * PRESENT in the evaluation context and persisted NetworkingInputSnapshot.
 *
 * Coverage set (Phase 13 seams, real names):
 *   - lib/engine/resolve.ts          → resolveSessionConfig
 *   - lib/engine/prompts.ts          → assembleSystemPrompt, buildTailBlock,
 *                                       buildTurnMessages (chat route entry)
 *   - lib/engine/visible-context.ts  → applyVisibleContext
 *   - lib/networking/prompts.ts      → buildNetworkingEvaluationContext
 *   - lib/report/snapshot.ts         → asInputSnapshot
 *   - app/api/interaction/chat/route.ts → createLLMStream(messages) body shape
 *
 * Run: npx tsx scripts/verify-networking-goal-leak.ts
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { resolveSessionConfig } from "../lib/engine/resolve";
import {
  assembleSystemPrompt,
  buildTailBlock,
  buildTurnMessages,
  type EngineTurnState,
} from "../lib/engine/prompts";
import { applyVisibleContext } from "../lib/engine/visible-context";
import type { InstanceConfig } from "../lib/engine/types";
import { DEFAULT_ATTEMPT_LANGUAGE } from "../lib/languages";
import { buildNetworkingEvaluationContext } from "../lib/networking/prompts";
import {
  asInputSnapshot,
  type NetworkingInputSnapshot,
} from "../lib/report/snapshot";

const ROOT = resolve(__dirname, "..");

/** Must not occur naturally — any hit is conclusive. */
const SENTINEL =
  "SENTINEL-GOAL-7Q4Z a referral into their team";

const LEAK_PHRASE_RE = /goal|objective|what they want|their ask/i;

const TURNS = [1, 2, 3, 5, 10, 30] as const;

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const NETWORKING_PERSONA: InstanceConfig = {
  kind: "networking-persona",
  personaId: "persona-leak-001",
  ownerId: "user-leak-1",
  displayName: "Alex Rivera",
  persona:
    "Alex Rivera is a VP of marketing at a mid-size CPG company, warm but time-pressed.",
  source: "pasted",
  attestationId: "att-leak-001",
  attestedAt: "2026-10-04T00:00:00.000Z",
  attestedWordingVersion: "networking-attestation-v1",
  createdAt: "2026-10-04T00:00:00.000Z",
};

function networkingSnapshot(
  overrides: Partial<NetworkingInputSnapshot> = {},
): NetworkingInputSnapshot {
  return {
    kind: "networking",
    personaSource: "brought-in",
    characterId: null,
    personaId: "persona-leak-001",
    displayName: "Alex Rivera",
    goal: SENTINEL,
    interviewerAvatarId: "avatar-1",
    interviewerVoice: "voice-1",
    budgetSeconds: 900,
    ...overrides,
  };
}

/** Session context channels a live networking turn would carry. */
function sessionStateWithGoal(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const snap = networkingSnapshot();
  return {
    displayName: snap.displayName,
    characterId: snap.characterId,
    personaId: snap.personaId,
    personaSource: snap.personaSource,
    persona: NETWORKING_PERSONA.kind === "networking-persona"
      ? NETWORKING_PERSONA.persona
      : "",
    interviewerAvatarId: snap.interviewerAvatarId,
    interviewerVoice: snap.interviewerVoice,
    budgetSeconds: snap.budgetSeconds,
    goal: SENTINEL,
    ...extra,
  };
}

function turnStateFor(turn: number): EngineTurnState {
  const startedAt = new Date("2026-10-04T00:00:00.000Z");
  const now = new Date(startedAt.getTime() + turn * 30_000);
  return {
    startedAt,
    now,
    sessionState: sessionStateWithGoal(),
  };
}

function historyOfLength(n: number): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      out.push({
        role: "user",
        content: `Student turn ${i + 1}: I work in product at a health-tech startup.`,
      });
    } else {
      out.push({
        role: "assistant",
        content: `Nice — what kinds of problems are you solving these days?`,
      });
    }
  }
  if (out.length === 0 || out[out.length - 1].role !== "user") {
    out.push({
      role: "user",
      content: "Curious how you think about early partnerships.",
    });
  }
  return out;
}

/** Same shape createLLMStream → openai.chat.completions.create receives. */
function providerBodyFromTurn(
  built: ReturnType<typeof buildTurnMessages>,
): Record<string, unknown> {
  return {
    model: "gpt-4.1",
    messages: built.messages,
    stream: true,
    max_tokens: 1000,
    stream_options: { include_usage: true },
  };
}

function containsSentinel(text: string): boolean {
  return text.includes(SENTINEL) || text.includes("7Q4Z");
}

// ---------------------------------------------------------------------------
console.log("\n=== verify-networking-goal-leak ===");
console.log(`SENTINEL: ${SENTINEL}`);
console.log(
  "Assembly functions covered: resolveSessionConfig, assembleSystemPrompt,",
);
console.log(
  "  buildTailBlock, buildTurnMessages, applyVisibleContext,",
);
console.log(
  "  buildNetworkingEvaluationContext, asInputSnapshot,",
);
console.log(
  "  provider body shape from app/api/interaction/chat/route.ts → createLLMStream",
);

// ---------------------------------------------------------------------------
console.log("\n1. Resolution carries the goal (test is live)");
{
  // Goal is NOT a ResolveSessionConfigInput field (16-07 extension handoff).
  // Session state that carries the goal is NetworkingInputSnapshot + opaque
  // sessionState channels. Prove resolve ok:true AND the sentinel is present
  // in that session state before exclusion assertions run.
  const resolved = resolveSessionConfig("networking", {
    instance: NETWORKING_PERSONA,
  });
  check(
    'resolveSessionConfig("networking", networking-persona) ok:true',
    resolved.ok === true,
    JSON.stringify(resolved),
  );

  const snapshot = networkingSnapshot();
  check(
    "NetworkingInputSnapshot.goal === SENTINEL (session state carrier)",
    snapshot.goal === SENTINEL,
  );

  const state = sessionStateWithGoal();
  check(
    "sessionState.goal === SENTINEL (retrievable before exclusion)",
    state.goal === SENTINEL,
  );

  // Passing a smuggled customization bag must not break resolve (networking
  // ignores interview customization). Sentinel still lives on the snapshot.
  const withCustom = resolveSessionConfig("networking", {
    instance: NETWORKING_PERSONA,
    customization: {
      distilledPersona: SENTINEL,
      personaDisplayName: "ShouldNotLeak",
    },
  });
  check(
    "resolve still ok:true with smuggled customization containing sentinel",
    withCustom.ok === true,
  );
  if (withCustom.ok) {
    const serialized = JSON.stringify(withCustom.config);
    // Interview customization is null for non-interview types — sentinel
    // must not land on ResolvedSessionConfig via that path.
    check(
      "sentinel absent from ResolvedSessionConfig JSON (goal not on resolve)",
      !containsSentinel(serialized),
      serialized.slice(0, 400),
    );
  }
}

const resolvedNetworking = resolveSessionConfig("networking", {
  instance: NETWORKING_PERSONA,
});
if (!resolvedNetworking.ok) {
  console.error("FATAL: cannot resolve networking config");
  process.exit(1);
}
const netConfig = resolvedNetworking.config;

// ---------------------------------------------------------------------------
console.log("\n2. System prompt, every turn (assembleSystemPrompt)");
{
  const prompts: string[] = [];
  for (const turn of TURNS) {
    const prompt = assembleSystemPrompt(netConfig, {
      language: DEFAULT_ATTEMPT_LANGUAGE,
    });
    prompts.push(prompt);
    check(
      `turn ${turn}: sentinel absent from assembleSystemPrompt`,
      !containsSentinel(prompt),
    );
    check(
      `turn ${turn}: no goal|objective|what they want|their ask`,
      !LEAK_PHRASE_RE.test(prompt),
      prompt.slice(0, 200),
    );
  }
  // Session-constant: every turn identical.
  check(
    "system prompt byte-identical across turns 1..30 (REQ-73)",
    prompts.every((p) => p === prompts[0]),
  );
  console.log("\n--- turn-1 system prompt (full) ---");
  console.log(prompts[0]);
  console.log("--- end turn-1 system prompt ---\n");
}

// ---------------------------------------------------------------------------
console.log("\n3. Tail block, every turn (buildTailBlock)");
{
  const tails: Record<number, string> = {};
  for (const turn of TURNS) {
    const tail = buildTailBlock(netConfig, turnStateFor(turn));
    tails[turn] = tail;
    check(
      `turn ${turn}: sentinel absent from buildTailBlock`,
      !containsSentinel(tail),
    );
    check(
      `turn ${turn}: no goal|objective|what they want|their ask in tail`,
      !LEAK_PHRASE_RE.test(tail),
      tail.slice(0, 200),
    );
  }
  console.log("\n--- turn-1 tail block ---");
  console.log(tails[1] || "(empty)");
  console.log("--- end turn-1 tail ---\n");
  console.log("--- turn-5 tail block ---");
  console.log(tails[5] || "(empty)");
  console.log("--- end turn-5 tail ---\n");
}

// ---------------------------------------------------------------------------
console.log("\n4. Whole outbound provider body (buildTurnMessages → createLLMStream shape)");
{
  const cases: Array<{
    label: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }> = [
    { label: "1-message history", messages: historyOfLength(1) },
    { label: "10-message history", messages: historyOfLength(10) },
    {
      label: "goal-adjacent student mention",
      messages: [
        {
          role: "user",
          content:
            "I have been thinking about career moves and introductions lately.",
        },
        {
          role: "assistant",
          content: "What kinds of moves are on your mind?",
        },
        {
          role: "user",
          content:
            "Just exploring — curious how people in your seat think about talent.",
        },
      ],
    },
  ];

  for (const c of cases) {
    const built = buildTurnMessages({
      config: netConfig,
      messages: c.messages,
      turnState: turnStateFor(1),
      language: DEFAULT_ATTEMPT_LANGUAGE,
    });
    const body = providerBodyFromTurn(built);
    const serialized = JSON.stringify(body);
    check(
      `${c.label}: sentinel absent from JSON.stringify(provider body)`,
      !containsSentinel(serialized),
    );
    console.log(`   ${c.label} body keys: ${JSON.stringify(Object.keys(body))}`);
  }
  // Print key set once clearly for the human reader.
  const sample = providerBodyFromTurn(
    buildTurnMessages({
      config: netConfig,
      messages: historyOfLength(1),
      turnState: turnStateFor(1),
      language: DEFAULT_ATTEMPT_LANGUAGE,
    }),
  );
  console.log(`\n   outbound body key set: ${JSON.stringify(Object.keys(sample))}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. Visible-context slice (applyVisibleContext)");
{
  for (const turn of TURNS) {
    const slice = applyVisibleContext(
      netConfig.visibleContext,
      sessionStateWithGoal(),
      {},
    );
    const serialized = JSON.stringify(slice);
    check(
      `turn ${turn}: sentinel absent from visible slice`,
      !containsSentinel(serialized) && !("goal" in slice),
      serialized,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n6. Slice not bypassable by a new undeclared channel (allow-list posture)");
{
  // 16-07 chose ALLOW-LIST. An undeclared channel carrying the sentinel must
  // stay absent. If this were a deny-list, this section would EXPECT a leak.
  const posture =
    netConfig.visibleContext.visibleChannels === "*"
      ? "PERMISSIVE (*)"
      : Array.isArray(netConfig.visibleContext.visibleChannels)
        ? "ALLOW-LIST"
        : "UNKNOWN";
  console.log(`   visibleContext posture: ${posture}`);
  check("posture is ALLOW-LIST (16-07)", posture === "ALLOW-LIST");

  const state = sessionStateWithGoal({
    undeclaredSecretChannel: SENTINEL,
    anotherNewChannel: { nested: SENTINEL },
  });
  const slice = applyVisibleContext(netConfig.visibleContext, state, {});
  const serialized = JSON.stringify(slice);
  check(
    "undeclared channel with sentinel ABSENT from slice",
    !containsSentinel(serialized) &&
      !("undeclaredSecretChannel" in slice) &&
      !("anotherNewChannel" in slice),
    serialized,
  );
  check(
    "goal channel still absent (allow-list)",
    !("goal" in slice),
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. Evaluator DOES see the sentinel");
{
  const snapshot = networkingSnapshot();
  const evalCtx = buildNetworkingEvaluationContext(netConfig, snapshot);
  console.log(`   evaluation context: ${JSON.stringify(evalCtx, null, 2)}`);
  check(
    "buildNetworkingEvaluationContext.goal === SENTINEL",
    evalCtx.goal === SENTINEL,
    JSON.stringify(evalCtx),
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. Snapshot stores the sentinel (asInputSnapshot round-trip)");
{
  const snapshot = networkingSnapshot();
  check("snapshot.goal === SENTINEL", snapshot.goal === SENTINEL);
  const roundTripped = asInputSnapshot(snapshot);
  check("asInputSnapshot returns networking kind", roundTripped?.kind === "networking");
  check(
    "round-trip preserves goal",
    roundTripped?.kind === "networking" && roundTripped.goal === SENTINEL,
    JSON.stringify(roundTripped),
  );
  // Also from plain JSON (as persisted in Prisma Json).
  const fromJson = asInputSnapshot(JSON.parse(JSON.stringify(snapshot)));
  check(
    "JSON round-trip preserves goal",
    fromJson?.kind === "networking" && fromJson.goal === SENTINEL,
  );
}

// ---------------------------------------------------------------------------
console.log("\n9. No other type is affected (interview customization sentinel)");
{
  const before = resolveSessionConfig("general", {});
  const after = resolveSessionConfig("general", {
    customization: {
      distilledPersona: SENTINEL,
      personaDisplayName: "Sentinel Person",
    },
  });
  check("interview resolve ok before", before.ok === true);
  check("interview resolve ok after sentinel customization", after.ok === true);

  if (after.ok) {
    const prompt = assembleSystemPrompt(after.config, {
      language: DEFAULT_ATTEMPT_LANGUAGE,
      resumeText: "",
    });
    // Interview DOES put distilledPersona into the live prompt — that is
    // pre-Phase-16 behavior. The networking exclusion must not become a
    // global filter that strips interview persona text.
    check(
      "interview live prompt STILL contains sentinel persona (not globally filtered)",
      containsSentinel(prompt),
      "sentinel missing — networking exclusion may have become a global filter",
    );
    console.log(
      `   interview prompt contains sentinel: ${containsSentinel(prompt)} (expected true)`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n10. Grep backstop — lib/engine/ must not read a .goal field");
{
  let out = "";
  try {
    out = execSync('grep -rn "\\.goal\\b" lib/engine/ || true', {
      encoding: "utf8",
      cwd: ROOT,
    }).trim();
  } catch (err) {
    out = String(err);
  }
  console.log(`   grep -rn "\\.goal\\b" lib/engine/ → ${out ? out : "(empty)"}`);
  check(
    'grep -rn "\\.goal\\b" lib/engine/ returns nothing',
    out === "",
    out,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== RESULT ===");
if (failures > 0) {
  console.log(`FAILED with ${failures} assertion(s)`);
  process.exit(1);
}
console.log("ALL TEN SECTIONS PASSED");
process.exit(0);
