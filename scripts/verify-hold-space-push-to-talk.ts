import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SPACE_ACTIVATED_ROLES,
  describeKeyTarget,
  isPushToTalkBlockingTarget,
  isPushToTalkKey,
  shouldAbortPendingStart,
} from "../lib/practice/push-to-talk-key";

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
// Phase 22 G4 (22-SHARED-SHELL-DECISION.md): the recorder, the hold-Space
// listener and the hint markup moved VERBATIM into the shared session chrome,
// used by the practice shell and the coached shell alike. Every assertion
// below that used to read the practice shell now reads the module the code
// moved to, and the practice shell is asserted to wire that module in exactly
// the way it used to wire itself.
const recorder = read("components/session/usePushToTalkRecorder.ts");
const keyHook = read("components/session/useHoldToTalkKey.ts");
const room = read("components/session/SessionRoom.tsx");

// ---------------------------------------------------------------------------
// Section 1 — key recognition (behavioural)
// ---------------------------------------------------------------------------
check(isPushToTalkKey(" "), "Section 1: ' ' is a push-to-talk key");
check(isPushToTalkKey("Space"), "Section 1: 'Space' is a push-to-talk key");
check(isPushToTalkKey("Spacebar"), "Section 1: 'Spacebar' is a push-to-talk key");
check(!isPushToTalkKey("Enter"), "Section 1: 'Enter' is not a push-to-talk key");
check(!isPushToTalkKey("a"), "Section 1: 'a' is not a push-to-talk key");
check(!isPushToTalkKey("Tab"), "Section 1: 'Tab' is not a push-to-talk key");
check(!isPushToTalkKey(""), "Section 1: '' is not a push-to-talk key");

// ---------------------------------------------------------------------------
// Section 2 — Space in text entry does NOT start recording (behavioural)
// ---------------------------------------------------------------------------
check(
  isPushToTalkBlockingTarget({ tagName: "INPUT", role: null, isContentEditable: false }),
  "Section 2: INPUT blocks push-to-talk",
);
check(
  isPushToTalkBlockingTarget({ tagName: "TEXTAREA", role: null, isContentEditable: false }),
  "Section 2: TEXTAREA blocks push-to-talk",
);
check(
  isPushToTalkBlockingTarget({ tagName: "SELECT", role: null, isContentEditable: false }),
  "Section 2: SELECT blocks push-to-talk",
);
check(
  isPushToTalkBlockingTarget({ tagName: null, role: "textbox", isContentEditable: false }),
  "Section 2: role=textbox blocks push-to-talk",
);
check(
  isPushToTalkBlockingTarget({ tagName: "DIV", role: null, isContentEditable: true }),
  "Section 2: contenteditable DIV blocks push-to-talk",
);

// ---------------------------------------------------------------------------
// Section 3 — Space on a focused control does NOT start recording (behavioural)
// ---------------------------------------------------------------------------
check(
  isPushToTalkBlockingTarget({ tagName: "BUTTON", role: null, isContentEditable: false }),
  "Section 3: BUTTON blocks push-to-talk",
);
check(
  isPushToTalkBlockingTarget({ tagName: "A", role: null, isContentEditable: false }),
  "Section 3: A blocks push-to-talk",
);
// Asserted purely as defensive coverage for a future native <details>
// disclosure — there is no <summary> element rendered anywhere in app/ or
// components/ outside app/test-pages/ today. The live deck-picker
// disclosure (app/practice/pitches/page.tsx) is a native
// <button type="button">, already covered by the BUTTON case above.
check(
  isPushToTalkBlockingTarget({ tagName: "SUMMARY", role: null, isContentEditable: false }),
  "Section 3: SUMMARY blocks push-to-talk (defensive; no <summary> in the live app)",
);
for (const role of SPACE_ACTIVATED_ROLES) {
  check(
    isPushToTalkBlockingTarget({ tagName: "DIV", role, isContentEditable: false }),
    `Section 3: role=${role} blocks push-to-talk`,
  );
}
// role:"button" specifically protects the Phase 19 deck-picker Start buttons
// and avatar cards, and the deck-picker disclosure — a native
// <button type="button"> with aria-expanded/aria-controls, NOT a <details>
// element. Already covered by the loop above; named here so the intent is
// explicit.
check(
  isPushToTalkBlockingTarget({ tagName: "DIV", role: "button", isContentEditable: false }),
  "Section 3: role=button blocks push-to-talk (deck-picker Start buttons / avatar cards / disclosure)",
);

// ---------------------------------------------------------------------------
// Section 4 — Space elsewhere DOES start recording (behavioural)
// ---------------------------------------------------------------------------
check(
  !isPushToTalkBlockingTarget({ tagName: "DIV", role: null, isContentEditable: false }),
  "Section 4: plain DIV does not block push-to-talk",
);
check(
  !isPushToTalkBlockingTarget({ tagName: "MAIN", role: null, isContentEditable: false }),
  "Section 4: MAIN does not block push-to-talk",
);
check(
  !isPushToTalkBlockingTarget({ tagName: "SECTION", role: null, isContentEditable: false }),
  "Section 4: SECTION does not block push-to-talk",
);
check(
  !isPushToTalkBlockingTarget({ tagName: null, role: null, isContentEditable: false }),
  "Section 4: null/null/false does not block push-to-talk",
);
check(
  !isPushToTalkBlockingTarget({ tagName: "DIV", role: "presentation", isContentEditable: false }),
  "Section 4: role=presentation does not block push-to-talk",
);

// ---------------------------------------------------------------------------
// Section 5 — describeKeyTarget resolves ancestors (behavioural, stub DOM)
// ---------------------------------------------------------------------------
{
  const spanWithButtonAncestor = {
    tagName: "SPAN",
    isContentEditable: false,
    getAttribute: () => null,
    closest: () => ({
      tagName: "BUTTON",
      isContentEditable: false,
      getAttribute: () => null,
    }),
  };
  check(
    isPushToTalkBlockingTarget(describeKeyTarget(spanWithButtonAncestor as unknown)),
    "Section 5: SPAN resolved to a BUTTON ancestor via closest() blocks push-to-talk",
  );
}
{
  const nestedInContentEditable = {
    tagName: "SPAN",
    isContentEditable: false,
    getAttribute: () => null,
    closest: () => ({
      tagName: "DIV",
      isContentEditable: true,
      getAttribute: () => null,
    }),
  };
  check(
    isPushToTalkBlockingTarget(describeKeyTarget(nestedInContentEditable as unknown)),
    "Section 5: element resolved inside a contenteditable region blocks push-to-talk",
  );
}
{
  const noClosest = {
    tagName: "DIV",
    isContentEditable: false,
    getAttribute: () => null,
  };
  let threw = false;
  let descriptor;
  try {
    descriptor = describeKeyTarget(noClosest as unknown);
  } catch {
    threw = true;
  }
  check(!threw, "Section 5: a stub with no closest() does not throw");
  check(
    descriptor?.tagName === "DIV",
    "Section 5: a stub with no closest() is described from its own fields",
  );
}
{
  const throwingClosest = {
    tagName: "DIV",
    isContentEditable: false,
    getAttribute: () => null,
    closest: () => {
      throw new Error("unsupported selector");
    },
  };
  let threw = false;
  let descriptor;
  try {
    descriptor = describeKeyTarget(throwingClosest as unknown);
  } catch {
    threw = true;
  }
  check(!threw, "Section 5: a stub whose closest() throws does not let the exception escape");
  check(
    descriptor?.tagName === "DIV",
    "Section 5: a stub whose closest() throws falls back to the raw target",
  );
}

// ---------------------------------------------------------------------------
// Section 6 — shell wiring (source assertions)
// ---------------------------------------------------------------------------
check(
  /isPushToTalkBlockingTarget/.test(keyHook) && /describeKeyTarget/.test(keyHook) &&
    /from\s+"@\/lib\/practice\/push-to-talk-key"/.test(keyHook),
  "Section 6: the shared key hook imports isPushToTalkBlockingTarget and describeKeyTarget from @/lib/practice/push-to-talk-key",
);
check(
  /from\s+"@\/components\/session\/useHoldToTalkKey"/.test(shell) &&
    /from\s+"@\/components\/session\/usePushToTalkRecorder"/.test(shell),
  "Section 6: the practice shell wires the shared useHoldToTalkKey and usePushToTalkRecorder",
);
check(
  !/from\s+"@\/lib\/practice\/push-to-talk-key"/.test(shell),
  "Section 6: the practice shell no longer carries its own copy of the key wiring",
);
check(/event\.repeat/.test(keyHook), "Section 6: the handler guards on event.repeat");
check(/event\.preventDefault\(\)/.test(keyHook), "Section 6: the handler calls event.preventDefault()");
check(
  /startRecordingRef\.current\?\.\(\)/.test(keyHook),
  "Section 6: Space starts via startRecordingRef.current",
);
check(
  /stopRecordingRef\.current\?\.\(\)/.test(keyHook),
  "Section 6: Space stops via stopRecordingRef.current",
);
check(
  /startRecordingRef\.current = startRecording;/.test(shell) &&
    /stopRecordingRef\.current = stopRecording;/.test(shell),
  "Section 6: the practice shell refreshes the start/stop refs with bare render-time assignments",
);
check(
  /lockRef\.current\s*\|\|/.test(recorder) && /lockRef:\s*walkOutLockRef/.test(shell),
  "Section 6: startRecording still carries its own lock pre-guard, and the practice shell's lock is walkOutLockRef",
);

const getMicIndex = recorder.indexOf("await getMicrophone()");
const newRecorderIndex = recorder.indexOf("new MediaRecorder(stream", getMicIndex);
const postGetMicSlice =
  getMicIndex >= 0 && newRecorderIndex > getMicIndex
    ? recorder.slice(getMicIndex, newRecorderIndex)
    : "";

check(postGetMicSlice.length > 0, "Section 6: the post-getMicrophone()/pre-recorder slice is non-empty");
check(
  postGetMicSlice.includes("walkOutLocked: lockRef.current"),
  "Section 6: the post-getMicrophone() recheck still threads the live lock (walkOutLocked: lockRef.current)",
);
check(
  postGetMicSlice.includes("startCancelled: cancelPendingStartRef.current"),
  "Section 6: the post-getMicrophone() recheck threads startCancelled: cancelPendingStartRef.current",
);

const keyDownIndex = keyHook.indexOf("const handleKeyDown = ");
const keyUpIndex = keyHook.indexOf("const handleKeyUp = ", keyDownIndex);
const keyDownSliceRaw =
  keyDownIndex >= 0 && keyUpIndex > keyDownIndex ? keyHook.slice(keyDownIndex, keyUpIndex) : "";

/**
 * Strip comments before the negative checks below.
 *
 * Those checks assert the handler does not CONSULT `walkOutLockRef` /
 * `mediaRecorderRef` — i.e. that it inherits Phase 18's gate from
 * `startRecording` rather than duplicating it. The handler carries a comment
 * explaining precisely that, and a naive `includes()` matched the explanation
 * and failed a correct implementation.
 *
 * Deleting the comment to satisfy the test would be backwards: that comment is
 * what stops a future editor re-adding the gate. Strip comments instead, which
 * is the same approach `scripts/verify-deck-family-surface-count.ts` (plan
 * 19-10) already takes for its own absence scans.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const keyDownSlice = stripComments(keyDownSliceRaw);

check(keyDownSliceRaw.length > 0, "Section 6: the keydown handler slice is non-empty");
check(
  keyDownSlice.length > 0,
  "Section 6: the keydown handler slice is non-empty after stripping comments",
);
check(
  !keyDownSlice.includes("walkOutLockRef") && !/\blockRef\b/.test(keyDownSlice),
  "Section 6 (negative): the keydown handler does NOT mention walkOutLockRef / lockRef (no duplicated gate)",
);
check(
  !keyDownSlice.includes("mediaRecorderRef"),
  "Section 6 (negative): the keydown handler does NOT mention mediaRecorderRef",
);
check(
  !keyDownSlice.includes("cancelPendingStartRef"),
  "Section 6 (negative): the keydown handler does NOT mention cancelPendingStartRef",
);

// ---------------------------------------------------------------------------
// Section 7 — cleanup (source assertions)
// ---------------------------------------------------------------------------
check(
  /removeEventListener\("keydown"/.test(keyHook),
  "Section 7: cleanup removes the keydown listener",
);
check(
  /removeEventListener\("keyup"/.test(keyHook),
  "Section 7: cleanup removes the keyup listener",
);
check(
  /removeEventListener\("blur"/.test(keyHook),
  "Section 7: cleanup removes the blur listener",
);
check(
  /removeEventListener\("visibilitychange"/.test(keyHook),
  "Section 7: cleanup removes the visibilitychange listener",
);
{
  const effectIndex = keyHook.indexOf("const releaseHold = () => {");
  const effectEndIndex = keyHook.indexOf("}, []);", effectIndex);
  const effectSlice =
    effectIndex >= 0 && effectEndIndex > effectIndex
      ? keyHook.slice(effectIndex, effectEndIndex)
      : "";
  const cleanupIndex = effectSlice.lastIndexOf("return () => {");
  const cleanupSlice = cleanupIndex >= 0 ? effectSlice.slice(cleanupIndex) : "";
  check(
    cleanupSlice.length > 0 && cleanupSlice.includes("releaseHold()"),
    "Section 7: the effect's cleanup calls releaseHold() so a mid-hold unmount cannot leave the recorder running",
  );
  check(
    /\}, \[\]\);/.test(keyHook.slice(effectIndex, effectIndex + effectSlice.length + 20)),
    "Section 7: the listener effect's dependency array is empty ([]) so it cannot re-subscribe mid-hold",
  );
  // Effects clean up in declaration order. The shell's unmount cleanup
  // (releaseMicrophone, which detaches recorder.onstop before stopping) must
  // be declared BEFORE the listener, or a mid-hold unmount would stop a live
  // recorder through releaseHold() and transcribe after the student left.
  const cleanupAt = shell.search(/useEffect\(\(\) => \{\s*return \(\) => \{\s*walkOutFinishCancelledRef\.current = true;\s*releaseMicrophone\(\);/);
  const listenerAt = shell.indexOf("useHoldToTalkKey({");
  check(
    cleanupAt >= 0 && listenerAt > cleanupAt,
    "Section 7: the practice shell declares its unmount cleanup (releaseMicrophone) BEFORE useHoldToTalkKey",
  );
}

// ---------------------------------------------------------------------------
// Section 8 — no per-type wiring (source assertions)
// ---------------------------------------------------------------------------
check(
  (keyHook.match(/isPushToTalkBlockingTarget/g) ?? []).length <= 2 &&
    (shell.match(/isPushToTalkBlockingTarget/g) ?? []).length === 0,
  "Section 8: isPushToTalkBlockingTarget appears at most twice in the shared hook (import + single call) and not in the shell",
);
check(
  (room.match(/to talk/g) ?? []).length === 1 && (shell.match(/to talk/g) ?? []).length === 0,
  "Section 8: the hint string 'to talk' appears exactly once (in the shared PushToTalkControl)",
);

// ---------------------------------------------------------------------------
// Section 9 — hint presence
// ---------------------------------------------------------------------------
check(/hold/.test(room), "Section 9: the shared control mentions 'hold'");
check(/<kbd[^>]*>Space<\/kbd>/.test(room), "Section 9: the shared control renders a <kbd>Space</kbd>");
check(
  /\{showSpaceHint \? \(/.test(room) && /showSpaceHint=\{!walkOutLock && avatarReady\}/.test(shell),
  "Section 9: the hint is gated on !walkOutLock && avatarReady (passed by the practice shell as showSpaceHint)",
);

// ---------------------------------------------------------------------------
// Section 10 — tap-and-release ordering (behavioural + source)
//
// This proves the abort DECISION and its WIRING — that the right flag is
// read in the right place before the right landmark. It is not, and cannot
// be, a test of a real promise interleaving (keyup racing getMicrophone()'s
// resolution in an actual browser); that would need a DOM/recorder harness
// this project does not have. That residual is recorded in the summary.
// ---------------------------------------------------------------------------
check(
  shouldAbortPendingStart({
    sending: false,
    isTranscribing: false,
    isPaused: false,
    walkOutLocked: false,
    startCancelled: false,
  }) === false,
  "Section 10: with every flag false, a normal hold proceeds (shouldAbortPendingStart is false)",
);
check(
  shouldAbortPendingStart({
    sending: false,
    isTranscribing: false,
    isPaused: false,
    walkOutLocked: false,
    startCancelled: true,
  }) === true,
  "Section 10: startCancelled alone aborts the pending start — the tap-and-release race",
);
check(
  shouldAbortPendingStart({
    sending: true,
    isTranscribing: false,
    isPaused: false,
    walkOutLocked: false,
    startCancelled: false,
  }) === true,
  "Section 10: sending alone aborts the pending start",
);
check(
  shouldAbortPendingStart({
    sending: false,
    isTranscribing: true,
    isPaused: false,
    walkOutLocked: false,
    startCancelled: false,
  }) === true,
  "Section 10: isTranscribing alone aborts the pending start",
);
check(
  shouldAbortPendingStart({
    sending: false,
    isTranscribing: false,
    isPaused: true,
    walkOutLocked: false,
    startCancelled: false,
  }) === true,
  "Section 10: isPaused alone aborts the pending start",
);
check(
  shouldAbortPendingStart({
    sending: false,
    isTranscribing: false,
    isPaused: false,
    walkOutLocked: true,
    startCancelled: false,
  }) === true,
  "Section 10: walkOutLocked alone aborts the pending start",
);

{
  const inFlightClaimIndex = recorder.indexOf("recordingStartInFlightRef.current = true;");
  const cancelClearIndex = recorder.indexOf("cancelPendingStartRef.current = false;", inFlightClaimIndex);
  const getMicAwaitIndex = recorder.indexOf("await getMicrophone()", cancelClearIndex);
  check(
    inFlightClaimIndex >= 0 &&
      cancelClearIndex > inFlightClaimIndex &&
      getMicAwaitIndex > cancelClearIndex,
    "Section 10: startRecording clears cancelPendingStartRef AFTER claiming the in-flight flag and BEFORE awaiting getMicrophone()",
  );
}
{
  const releaseHoldIndex = keyHook.indexOf("const releaseHold = () => {");
  const releaseHoldEndIndex = keyHook.indexOf("const handleKeyDown = ", releaseHoldIndex);
  const releaseHoldSlice =
    releaseHoldIndex >= 0 && releaseHoldEndIndex > releaseHoldIndex
      ? keyHook.slice(releaseHoldIndex, releaseHoldEndIndex)
      : "";
  check(
    releaseHoldSlice.includes("cancelPendingStartRef.current = true"),
    "Section 10: the release path SETS cancelPendingStartRef.current = true",
  );
}
check(
  recorder.indexOf("shouldAbortPendingStart({") >= 0 &&
    recorder.indexOf("new MediaRecorder") >= 0 &&
    recorder.indexOf("shouldAbortPendingStart({") < recorder.indexOf("new MediaRecorder"),
  "Section 10: the abort check runs BEFORE new MediaRecorder — an aborted start can never call recorder.start()",
);

if (failures > 0) {
  console.error(`\n${failures} hold-space push-to-talk check(s) failed.`);
  process.exit(1);
}

console.log("\nALL PASS");
