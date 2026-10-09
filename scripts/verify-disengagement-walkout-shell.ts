import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTurnMessages } from "../lib/engine/prompts";
import type { ResolvedSessionConfig } from "../lib/engine/types";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

let failures = 0;

function check(condition: unknown, description: string) {
  if (condition) {
    console.log(`PASS ${description}`);
    return;
  }

  failures += 1;
  console.error(`FAIL ${description}`);
}

const shell = read("components/practice/PracticeSessionShell.tsx");
const chatRoute = read("app/api/interaction/chat/route.ts");
const finishRoute = read("app/api/practice/session/finish/route.ts");
const session = read("lib/engine/session.ts");
const pitchPage = read("app/practice/[type]/page.tsx");
const prompts = read("lib/engine/prompts.ts");

check(
  /walkOutLockRef\.current\s*=\s*true/.test(shell) &&
    /setWalkOutLock\(true\)/.test(shell),
  "crossing enters a terminal walk-out lock",
);
check(
  /disabled=\{\s*walkOutLock\s*\|\|\s*sending/.test(shell) &&
    /isDisabled=\{\s*walkOutLock\s*\|\|/.test(shell) &&
    /walkOutLockRef\.current\) return;/.test(shell),
  "typed and push-to-talk input paths respect the walk-out lock",
);
check(
  /if \(!walkOutLockRef\.current\) \{\s*avatarRef\.current\?\.interrupt\(\)/.test(
    shell,
  ),
  "finish does not interrupt the protected final avatar statement",
);
check(
  /forceWalkOutFarewell/.test(shell) &&
    /forcedFarewellRequestedRef\.current/.test(shell) &&
    /sendMessageRef\.current\?\.\("", true\)/.test(shell),
  "a crossing without a marker requests at most one forced farewell",
);
check(
  /walkOutProof: walkOutProofRef\.current/.test(shell) &&
    /terminationSource: pendingTerminationRef\.current\?\.source/.test(shell),
  "finish sends the signed walk-out proof and avatar termination source",
);
check(
  /assistantTurnCount,\s*disengagementValue: walkOutMetadata/.test(shell),
  "client parsing receives assistant turns and derived disengagement",
);
check(
  /computeDisengagement/.test(chatRoute) &&
    /walkOutFinal/.test(chatRoute) &&
    /createWalkOutProof/.test(chatRoute),
  "chat route computes server walk-out metadata and proof",
);
check(
  /walkOutProof/.test(finishRoute) &&
    /verifyWalkOutProof/.test(session) &&
    /disengagementDecline/.test(session),
  "finish verifies and persists engine-owned decline evidence",
);
check(
  /status:\s*"IN_PROGRESS"/.test(chatRoute) &&
    /userId:\s*currentUser\.id/.test(chatRoute) &&
    /walkOutReport\?\.startedAt/.test(chatRoute),
  "proofs bind only to an owned in-progress report and its server clock",
);
check(
  /proofMatchesTranscript/.test(session) &&
    /derivedDisengagement\.value/.test(session) &&
    !/walkOutProof\?\.disengagement\s*\?\?\s*derivedDisengagement/.test(session),
  "finish treats the proof as permission and re-derives the recorded value",
);
check(
  /autoFinishOnAvatarEnd=\{isPitch\}/.test(pitchPage) &&
    /reportId/.test(pitchPage),
  "both pitch launchers opt into auto-finish with a report binding",
);
check(
  /buildWalkOutFragment/.test(prompts) &&
    /buildTailBlock/.test(prompts),
  "private walk-out guidance stays in the per-turn tail block",
);

const visibleMeterTerms = [
  "engagement meter",
  "patience gauge",
  "temperature gauge",
  "patience remaining",
  "disengagement score",
];
const pitchUi = `${shell}\n${pitchPage}`.toLowerCase();
for (const term of visibleMeterTerms) {
  check(!pitchUi.includes(term), `no learner-facing ${term} UI`);
}

// The ratchet lives in priorValue, which every caller must thread. Calling the
// bare primitive per request silently recomputes from zero: a session reached
// 0.6 in UAT, then a single novel reply dropped it to 0.4. Both server callers
// must replay the transcript instead.
for (const [name, source] of [
  ["chat route", chatRoute],
  ["finish re-derivation", session],
] as const) {
  check(
    source.includes("computeDisengagementOverTranscript"),
    `${name} derives disengagement by replaying the transcript`,
  );
  check(
    !/\bcomputeDisengagement\s*\(/.test(source),
    `${name} does not call the un-ratcheted primitive directly`,
  );
}

// The farewell must end on the avatar's own speech-ended event. A word-count
// estimate overshot real speech and left the student on a locked screen.
check(
  shell.includes("waitForSpeechEnd"),
  "walk-out finish waits for the avatar speech-ended signal",
);
check(
  !shell.includes("finalSpeechMs"),
  "walk-out finish no longer drives auto-finish from a guessed duration",
);

// elevator-walkout-dead-end: the one-shot forced farewell resends history
// with NO new user message, so the transcript ends on an assistant turn.
// `buildTurnMessages` used to splice its tail (the forceFarewell directive)
// onto the latest message found by searching for role "user" — which, on
// exactly this turn, is a STALE, already-answered message several turns
// back, not the live edge of the conversation. The model never saw the
// directive as "now" and produced an unrelated reply instead of a farewell +
// `<engine-end>` marker, leaving the session locked with no exit.
{
  const config: ResolvedSessionConfig = {
    typeSlug: "pitch-elevator",
    typeName: "Test elevator",
    rubricDimensions: [],
    limits: { targetMinutes: null, targetQuestionCount: null },
    terminationPolicy: {
      studentMayEnd: true,
      avatarMayEnd: true,
      avatarEndReasons: ["lost_interest"],
      avatarEndFloor: { minAssistantTurns: 2 },
      disengagementThreshold: 0.5,
    },
    visibleContext: { visibleChannels: "*" },
    outcome: { fields: [] },
    timeBudget: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: null,
      adjustableRangeSeconds: null,
    },
    instance: { kind: "none" },
    customization: null,
  };

  // Shaped exactly like the shell's one-shot forced-farewell resend: history
  // unchanged, no new user message, so the last entry is an assistant turn.
  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: "it's a marketplace thing ok" },
    { role: "assistant", content: "Got it. Who is the customer?" },
    { role: "user", content: "a marketplace thing ok" },
    {
      role: "assistant",
      content: "Alright, did you have a pitch or an idea you wanted to walk me through?",
    },
  ];

  const built = buildTurnMessages({
    config,
    messages: transcript,
    turnState: {
      walkOut: { nearThreshold: false, forceFarewell: true },
    },
    language: { code: "en", label: "English", name: "English" },
  });

  const nonSystem = built.messages.filter((m) => m.role !== "system");
  const lastMessage = nonSystem.at(-1);
  const staleUserMessage = nonSystem.find(
    (m) => m.role === "user" && m.content.startsWith("a marketplace thing"),
  );

  check(
    lastMessage?.role === "user" &&
      lastMessage.content.includes("End this conversation now"),
    "forced farewell: the directive lands on a new trailing turn, not a stale one",
  );
  check(
    staleUserMessage !== undefined &&
      !staleUserMessage.content.includes("End this conversation now"),
    "forced farewell: the already-answered user turn is left untouched",
  );
  check(
    built.messages.length === transcript.length + 2, // +1 system, +1 synthetic trailing directive
    "forced farewell: exactly one synthetic trailing turn is appended, nothing is dropped",
  );
}

// elevator-walkout-dead-end: a forced farewell whose proof did not verify
// (or whose metadata computation threw) must say so, not degrade silently
// into what looks like an ordinary reply.
check(
  /walkOutFarewellDeclined/.test(chatRoute),
  "chat route signals a declined forced farewell instead of serving it silently",
);
check(
  /walkOutMetadataError/.test(chatRoute),
  "chat route never silently drops end-of-turn metadata on an internal error",
);
check(
  /isWalkOut \|\| forceWalkOutFarewell/.test(shell),
  "shell always resolves the one-shot forced farewell to a terminal state, even if declined",
);

if (failures > 0) {
  console.error(`\n${failures} walk-out shell check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS");
