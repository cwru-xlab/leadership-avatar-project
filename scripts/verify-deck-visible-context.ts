/**
 * Sentinel proof for REQ-63 / REQ-75: an investor receives only slides the
 * founder has shown. This drives the chat turn-assembly seam; the source
 * allow-list below also guards the authorized client-index reader locations.
 *
 * Run: npx tsx scripts/verify-deck-visible-context.ts
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { buildTurnMessages } from "../lib/engine/prompts";
import { resolveSessionConfig } from "../lib/engine/resolve";
import type {
  InstanceConfig,
  ResolvedSessionConfig,
} from "../lib/engine/types";
import { DEFAULT_ATTEMPT_LANGUAGE } from "../lib/languages";
import { buildDeckEvaluationContext } from "../lib/pitch/deck-prompts";
import {
  ratchetHighWaterMark,
  resolveRevealedSlides,
} from "../lib/pitch/slide-reveal";

const ROOT = resolve(__dirname, "..");
const SLIDE_COUNT = 8;
const SHARED_SUFFIX = "K7QX";
const PERMISSIVE_STATE_SENTINEL = "PERMISSIVE-SESSION-STATE-SENTINEL";
const SENTINELS = Array.from(
  { length: SLIDE_COUNT },
  (_, index) =>
    `SENTINEL-SLIDE-${String(index).padStart(2, "0")}-${SHARED_SUFFIX}`,
);

const deckInstance: InstanceConfig = {
  kind: "pitch-deck",
  deckId: "verify-visible-context-deck",
  slideCount: SLIDE_COUNT,
  slideTexts: SENTINELS.map(
    (sentinel, index) => `${sentinel} plus filler for slide ${index + 1}.`,
  ),
  askPriceUsd: 1_000_000,
  askEquityPct: 10,
  fairValueBand: {
    priceUsdMin: 800_000,
    priceUsdMax: 1_200_000,
    equityPctMin: 8,
    equityPctMax: 12,
  },
  proposedSeconds: 1_500,
};

const SOURCE_READER_PATHS = ["app", "components", "lib"];
const ALLOWED_CLIENT_INDEX_READERS = new Set([
  "app/api/interaction/chat/route.ts",
  "app/api/practice/session/checkpoint/route.ts",
  "app/practice/[type]/page.tsx",
  // Forwards the untrusted hint in the checkpoint request; it never computes a mark.
  "components/practice/PracticeSessionShell.tsx",
  "lib/engine/session.ts",
  "lib/pitch/slide-reveal.ts",
]);

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function serializeTurn(config: ResolvedSessionConfig, mark: number | null) {
  const revealedSlides = resolveRevealedSlides({ config, mark });
  const built = buildTurnMessages({
    config,
    messages: [
      {
        role: "user",
        content: "I would like to continue my pitch.",
      },
    ],
    turnState: { revealedSlides, slideCount: SLIDE_COUNT },
    language: DEFAULT_ATTEMPT_LANGUAGE,
  });

  return {
    built,
    revealedSlides,
    providerPayload: JSON.stringify(built.messages),
  };
}

function shownSentinels(mark: number): string[] {
  return SENTINELS.slice(0, mark + 1);
}

function hiddenSentinels(mark: number): string[] {
  return SENTINELS.slice(mark + 1);
}

function sourceIndexReaders(): string[] {
  try {
    const output = execFileSync(
      "git",
      [
        "grep",
        "--untracked",
        "-lE",
        "revealedSlideIndex|ratchetHighWaterMark",
        "--",
        ...SOURCE_READER_PATHS,
      ],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();

    return output ? output.split("\n") : [];
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 1
    ) {
      return [];
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`source-reader scan failed: ${message}`);
  }
}

console.log("\n=== verify-deck-visible-context ===");
console.log(`sentinels: ${SENTINELS.join(", ")}`);
console.log(
  "assembly path: ratchetHighWaterMark → resolveRevealedSlides → buildTurnMessages",
);

const resolved = resolveSessionConfig("pitch-deck", { instance: deckInstance });
if (!resolved.ok) {
  console.error("FATAL: could not resolve pitch-deck test config", resolved);
  process.exit(1);
}
const deckConfig = resolved.config;
const resolvedSlideTexts =
  deckConfig.instance.kind === "pitch-deck"
    ? deckConfig.instance.slideTexts
    : [];

console.log("\n1. The test is live — deck admission is cursor-gated");
{
  check(
    "resolveSessionConfig(pitch-deck) returned pitch-deck instance",
    deckConfig.instance.kind === "pitch-deck",
  );
  check(
    "resolved deck retains all eight sentinels",
    SENTINELS.every((sentinel) =>
      resolvedSlideTexts.some((text) => text.includes(sentinel)),
    ),
  );
  check(
    'deck retains the deliberate permissive "*" config that disables generic rendering',
    deckConfig.visibleContext.visibleChannels === "*",
    JSON.stringify(deckConfig.visibleContext),
  );

  const admitted = resolveRevealedSlides({ config: deckConfig, mark: 2 });
  check(
    "deck adapter admits exactly slides 0 through server-owned mark 2",
    admitted.length === 3 &&
      admitted.every((slide, index) =>
        slide.text.includes(SENTINELS[index] ?? "missing sentinel"),
      ),
    JSON.stringify(admitted),
  );
}

console.log("\n2. Nothing shown yet");
{
  const turn = serializeTurn(deckConfig, null);
  check(
    "null mark resolves to no revealed slides",
    turn.revealedSlides.length === 0,
  );
  check(
    `whole outbound payload contains zero ${SHARED_SUFFIX} occurrences`,
    !turn.providerPayload.includes(SHARED_SUFFIX),
    turn.providerPayload,
  );
}

console.log("\n3. Forward sweep — unreached slides stay absent");
{
  let stored: number | null = null;
  for (let requested = 0; requested < SLIDE_COUNT; requested += 1) {
    const ratchet = ratchetHighWaterMark({
      stored,
      requested,
      slideCount: SLIDE_COUNT,
    });
    stored = ratchet.mark;
    check(
      `mark ${requested}: ratchet returns ${requested}`,
      stored === requested,
      JSON.stringify(ratchet),
    );

    if (stored === null) continue;
    const turn = serializeTurn(deckConfig, stored);
    for (const sentinel of shownSentinels(stored)) {
      check(
        `mark ${stored}: shown ${sentinel} is present`,
        turn.providerPayload.includes(sentinel),
      );
    }
    for (const sentinel of hiddenSentinels(stored)) {
      check(
        `mark ${stored}: unreached ${sentinel} is absent`,
        !turn.providerPayload.includes(sentinel),
      );
    }

    if (stored === 2) {
      const latestUser = turn.built.messages.at(-1);
      console.log("\n--- mark 2 full final user message ---");
      console.log(latestUser?.content ?? "(missing latest user message)");
      console.log("--- end mark 2 final user message ---\n");
    }
  }
}

console.log("\n4. Backward navigation does not un-show");
{
  const forward = ratchetHighWaterMark({
    stored: null,
    requested: 6,
    slideCount: SLIDE_COUNT,
  });
  const backward = ratchetHighWaterMark({
    stored: forward.mark,
    requested: 2,
    slideCount: SLIDE_COUNT,
  });
  check(
    "requesting 2 after reaching 6 retains mark 6 without advancing",
    backward.mark === 6 && backward.advanced === false,
    JSON.stringify(backward),
  );

  if (backward.mark !== null) {
    const turn = serializeTurn(deckConfig, backward.mark);
    for (const sentinel of shownSentinels(backward.mark)) {
      check(
        `backward navigation retains ${sentinel}`,
        turn.providerPayload.includes(sentinel),
      );
    }
    for (const sentinel of hiddenSentinels(backward.mark)) {
      check(
        `backward navigation withholds ${sentinel}`,
        !turn.providerPayload.includes(sentinel),
      );
    }
  }
}

console.log("\n5. Hostile client index values cannot leak ahead");
{
  const cases: Array<{
    label: string;
    requested: unknown;
    expectedMark: number;
  }> = [
    { label: "99", requested: 99, expectedMark: 7 },
    { label: "8", requested: 8, expectedMark: 7 },
    { label: "7.9", requested: 7.9, expectedMark: 7 },
    { label: "-1", requested: -1, expectedMark: 2 },
    { label: "NaN", requested: Number.NaN, expectedMark: 2 },
    { label: "Infinity", requested: Number.POSITIVE_INFINITY, expectedMark: 2 },
    { label: '"7"', requested: "7", expectedMark: 2 },
    { label: "null", requested: null, expectedMark: 2 },
    { label: "undefined", requested: undefined, expectedMark: 2 },
    { label: "object", requested: {}, expectedMark: 2 },
  ];

  for (const hostile of cases) {
    const result = ratchetHighWaterMark({
      stored: 2,
      requested: hostile.requested,
      slideCount: SLIDE_COUNT,
    });
    check(
      `hostile ${hostile.label}: returned mark is ${hostile.expectedMark}`,
      result.mark === hostile.expectedMark,
      JSON.stringify(result),
    );
    check(
      `hostile ${hostile.label}: mark never exceeds last slide`,
      result.mark === null || result.mark <= SLIDE_COUNT - 1,
      JSON.stringify(result),
    );

    const turn = serializeTurn(deckConfig, result.mark);
    const mark = result.mark ?? -1;
    for (const sentinel of hiddenSentinels(mark)) {
      check(
        `hostile ${hostile.label}: ${sentinel} remains absent above mark ${mark}`,
        !turn.providerPayload.includes(sentinel),
      );
    }
  }
}

console.log("\n6. System prompt is clean and session-constant");
{
  const prompts: string[] = [];
  for (const mark of [0, 3, 7]) {
    const turn = serializeTurn(deckConfig, mark);
    prompts.push(turn.built.systemPrompt);
    check(
      `mark ${mark}: assembled first message is the system prompt`,
      turn.built.messages[0]?.content === turn.built.systemPrompt,
    );
    check(
      `mark ${mark}: system prompt has no ${SHARED_SUFFIX}`,
      !turn.built.systemPrompt.includes(SHARED_SUFFIX),
    );
    for (const sentinel of SENTINELS) {
      check(
        `mark ${mark}: system prompt excludes ${sentinel}`,
        !turn.built.systemPrompt.includes(sentinel),
      );
    }
  }
  check(
    "system prompt is byte-identical at marks 0, 3, and 7",
    prompts.every((prompt) => prompt === prompts[0]),
  );
}

console.log(
  "\n7. Source backstop — only authorized readers handle the client index",
);
{
  const readers = sourceIndexReaders();
  const unexpected = readers.filter(
    (reader) => !ALLOWED_CLIENT_INDEX_READERS.has(reader),
  );
  const missing = [...ALLOWED_CLIENT_INDEX_READERS].filter(
    (reader) => !readers.includes(reader),
  );

  console.log(`   readers: ${readers.join(", ") || "(none)"}`);
  check("source-reader scan found at least one reader", readers.length > 0);
  check(
    "no unapproved source reads revealedSlideIndex or ratchetHighWaterMark",
    unexpected.length === 0,
    unexpected.join("\n"),
  );
  check(
    "all documented client/index ratchet locations remain present",
    missing.length === 0,
    missing.join("\n"),
  );
}

console.log("\n8. Evaluator receives its intentionally full deck evidence");
{
  const evaluation = buildDeckEvaluationContext(deckConfig);
  const serialized = JSON.stringify(evaluation);
  check(
    "evaluation context retains every configured deck sentinel",
    SENTINELS.every((sentinel) => serialized.includes(sentinel)),
  );
  check(
    "evaluation context identifies this as a deck evaluation",
    evaluation.kind === "pitch-deck" && evaluation.slideCount === SLIDE_COUNT,
    JSON.stringify(evaluation),
  );
}

console.log("\n9. Permissive types do not render generic session state");
{
  const interview = resolveSessionConfig("general", {});
  check("general interview config resolves", interview.ok);
  if (interview.ok) {
    const built = buildTurnMessages({
      config: interview.config,
      messages: [{ role: "user", content: "Please begin the interview." }],
      turnState: {
        sessionState: { secret: PERMISSIVE_STATE_SENTINEL },
      },
      language: DEFAULT_ATTEMPT_LANGUAGE,
    });
    const payload = JSON.stringify(built.messages);
    check(
      'interview visibleContext remains permissive "*"',
      interview.config.visibleContext.visibleChannels === "*",
    );
    check(
      "permissive interview turn assembly does not render generic session state",
      !payload.includes(PERMISSIVE_STATE_SENTINEL),
      payload,
    );
  }
}

console.log("\n=== RESULT ===");
if (failures > 0) {
  console.log(`FAILED with ${failures} assertion(s)`);
  process.exit(1);
}
console.log("ALL NINE SECTIONS PASSED");
