import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

if (failures > 0) {
  console.error(`\n${failures} walk-out shell check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS");
