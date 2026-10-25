import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTailBlock, buildTurnMessages } from "../lib/engine/prompts";
import { DIFFICULT_CONVERSATION_TYPE } from "../lib/difficult-conversation/conversation-type";
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

// ---------------------------------------------------------------------------
// Phase 20 / 20-05 — the new contracts, asserted at the REAL callers.
//
// Phase 18's UAT is the reason these are caller-level rather than unit-level:
// its ratchet was proven by passing `priorValue` into the primitive directly
// and was unenforced at the integration seam, so a live session reached 0.6
// and then fell back to 0.4. A contract proven only in the unit is not proven.
// ---------------------------------------------------------------------------

console.log("\n8. Phase 20 — type weights, derived reason, in-character exit");

const safetyPanel = read("components/practice/panels/SessionSafetyPanel.tsx");
const dcLauncher = read("app/practice/[type]/[instanceId]/page.tsx");
const dcPrompts = read("lib/difficult-conversation/conversation-prompts.ts");

// (a) Both server callers compute with the type's own weight profile. Without
// it they silently fall back to the shared defaults, where every Phase 20
// cause is weight 0 — hostility contributes nothing and the walk-out can
// never fire. Extends the existing integration-seam guard.
for (const [name, src] of [
  ["chat route", chatRoute],
  ["finish re-derivation", session],
] as const) {
  check(
    /disengagementWeights/.test(src) &&
      /computeDisengagementOverTranscript/.test(src) &&
      !/\bcomputeDisengagement\s*\(/.test(src),
    `${name} passes the type's disengagementWeights and still uses only the ratcheting primitive`,
  );
}

// (b) The reason is resolved server-side, and the tail directive interpolates
// it rather than hardcoding one.
check(
  /resolveWalkOutReason/.test(chatRoute),
  "chat route resolves the walk-out reason server-side",
);
check(
  /walkOut\.reason/.test(prompts),
  "forced-farewell directive interpolates the policy-supplied reason",
);

// (c) Behavioural, not a regex: the farewell must cite a reason the type
// actually declares. `buildWalkOutFragment` used to hardcode `lost_interest`,
// which difficult-conversation does not declare, so gate (2) of
// resolveTermination rejected the end and the session never terminated.
{
  const dcConfig: ResolvedSessionConfig = {
    typeSlug: "difficult-conversation",
    typeName: "Test difficult conversation",
    rubricDimensions: [],
    limits: { targetMinutes: null, targetQuestionCount: null },
    terminationPolicy: DIFFICULT_CONVERSATION_TYPE.terminationPolicy,
    visibleContext: { visibleChannels: "*" },
    outcome: { fields: [] },
    timeBudget: {
      totalSeconds: null,
      warnAtRemainingSeconds: null,
      firstTurnWindowSeconds: null,
      adjustableRangeSeconds: null,
    },
    // A real scenario instance: the DC type's in-character reminder refuses
    // to build without one, and that refusal is correct behaviour worth
    // keeping rather than stubbing around.
    instance: {
      kind: "difficult-conversation",
      conversationId: "ask-for-raise",
      source: "seeded",
      role: "Dana, your manager",
      studentRole: "their direct report",
      situation: "Annual review",
      sharedBackstory: "Shared history",
      hiddenPosition: "Budget is already allocated elsewhere.",
      studentObjective: "Secure a raise",
      stakes: "High",
      difficulty: "hostile",
      avatarId: "avatar-1",
      voiceId: "voice-1",
    },
    customization: null,
  };
  // buildTailBlock, not buildTurnMessages: the directive lives in the tail,
  // and the DC type's system prompt legitimately refuses to build without a
  // real scenario instance. Testing the tail keeps this assertion about the
  // thing it is actually asserting.
  const tail = buildTailBlock(dcConfig, {
    walkOut: {
      nearThreshold: false,
      forceFarewell: true,
      reason: "offensive_content",
    },
  });
  check(
    tail.includes('reason="offensive_content"'),
    "forced farewell cites the supplied reason, not a hardcoded lost_interest",
  );
  check(
    (
      DIFFICULT_CONVERSATION_TYPE.terminationPolicy.avatarEndReasons ?? []
    ).includes("offensive_content"),
    "offensive_content is a member of the type's declared avatarEndReasons",
  );
}

// (d) ONE ending path, in character (REQ-101). Guarded by ABSENCE: no
// break-frame vocabulary anywhere a walk-out can reach, and no second
// severity-conditional finish branch in the shell.
const breakFrameTerms = [
  "out of character",
  "breaking character",
  "moderator",
  "content policy",
  "this session has been ended by",
  "violation",
  "reported",
];
for (const term of breakFrameTerms) {
  check(
    !shell.toLowerCase().includes(term) &&
      !dcLauncher.toLowerCase().includes(term),
    `no break-frame vocabulary in the session shell or DC launcher: "${term}"`,
  );
}
check(
  /autoFinishOnAvatarEnd/.test(shell) && !/severe/i.test(shell),
  "exactly one auto-finish entry point; the shell has no severity-conditional branch",
);
check(
  /never break character/i.test(dcPrompts),
  "difficult-conversation prompt still forbids breaking character",
);
check(
  /do not .*(offer resources|break frame)/i.test(dcPrompts),
  "difficult-conversation prompt still forbids offering resources / breaking frame",
);

// (e) Phase 15's exits survive an avatar-initiated ending. A walk-out must
// never leave a student with no way out and no explanation.
check(
  /SUPPORT_RESOURCE_NOTE/.test(safetyPanel),
  "SessionSafetyPanel still exports the support-resource note",
);
check(
  !/isDisabled=\{[^}]*walkOut/i.test(safetyPanel),
  "SessionSafetyPanel's End-session control is never disabled by walk-out state",
);
check(
  /hideDefaultEndControl/.test(dcLauncher) &&
    /SessionSafetyPanel/.test(dcLauncher),
  "DC launcher keeps the one always-visible exit (hideDefaultEndControl + SessionSafetyPanel)",
);

console.log("\n9. UAT 2026-10-25 — the forced farewell is never dropped (F18-1)");
{
  // The farewell is scheduled from inside the crossing turn's request, so the
  // closure it runs through can still see `sending === true`. The entry guard
  // must exempt it, or the student is locked in with no final statement.
  const farewellGuardOk = (src: string) => {
    const start = src.indexOf("const content = candidateMessage.trim();");
    const guard = start === -1 ? "" : src.slice(start, src.indexOf("return;", start));
    return (
      /\(sending && !forceWalkOutFarewell\)/.test(guard) &&
      !/\n\s*sending \|\|/.test(guard) &&
      !/\n\s*isPaused \|\|/.test(guard)
    );
  };
  check(farewellGuardOk(shell), "sendMessage's entry guard lets the one-shot forced farewell through while `sending`");
  const bitten = shell.replace("(sending && !forceWalkOutFarewell) ||", "sending ||");
  check(!farewellGuardOk(bitten), "bite-proof: a bare `sending ||` gate is caught");
}

console.log("\n10. UAT 2026-10-25 — chat turns carry the shell's own reportId (F20-2)");
{
  // Every engine chat turn must name the row this shell finishes, AFTER any
  // caller-supplied body, so the walk-out proof and the session clock bind to
  // the same report finishSession verifies.
  const carriesOwnReport = (src: string) =>
    /\.\.\.\(extraChatBodyRef\.current \?\? \{\}\),[\s\S]{0,500}\.\.\.\(reportIdRef\.current \? \{ reportId: reportIdRef\.current \} : \{\}\)/.test(src);
  check(carriesOwnReport(shell), "the chat body sends reportIdRef after the extra body");
  check(!carriesOwnReport(shell.replace("...(reportIdRef.current ? { reportId: reportIdRef.current } : {})", "")), "bite-proof: dropping it is caught");
}

console.log("\n11. UAT 2026-10-25 — auto-finish survives Strict Mode; the record matches the live crossing");
{
  // React Strict Mode runs mount -> cleanup -> mount in dev. The cleanup sets
  // the cancel flag, so the effect body must re-arm it or the walk-out never
  // auto-finishes.
  const rearmed = (src: string) =>
    /useEffect\(\(\) => \{[\s\S]{0,400}walkOutFinishCancelledRef\.current = false;[\s\S]{0,200}return \(\) => \{\s*walkOutFinishCancelledRef\.current = true;/.test(src);
  check(rearmed(shell), "the unmount effect re-arms walkOutFinishCancelledRef on mount");
  check(!rearmed(shell.replace("walkOutFinishCancelledRef.current = false;", "")), "bite-proof: removing the re-arm is caught");
  // Finish uses the signed live result as a floor so a crossing that needed
  // the avatar cue (stripped from submitted turns) is still recorded.
  const floored = (src: string) =>
    /walkOutProof!\.disengagement\.value > replayedDisengagement\.value[\s\S]{0,80}\? walkOutProof!\.disengagement/.test(src);
  check(floored(session), "finishSession floors the replayed value with the signed live result");
  check(!floored(session.replace("? walkOutProof!.disengagement", "? replayedDisengagement")), "bite-proof: dropping the floor is caught");
}

console.log("\n12. UAT 2026-10-25 — non-interview sessions are not labelled interviews (D17-1, agenda)");
{
  const headerOk = (src: string) =>
    /\{isInterviewSession \? "Interview" : "Conversation"\} with \{interviewerName\}/.test(src) &&
    /\{isInterviewSession \? \(\s*<div className="border-y border-white\/10 py-3">/.test(src);
  check(headerOk(shell), "session header and interview agenda block are interview-only");
  check(!headerOk(shell.replace('{isInterviewSession ? "Interview" : "Conversation"} with', "Interview with")), "bite-proof: a hard-coded 'Interview with' is caught");
}

if (failures > 0) {
  console.error(`\n${failures} walk-out shell check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS");
