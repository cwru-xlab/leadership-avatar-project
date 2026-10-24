"use client";

/**
 * Shared hold-Space push-to-talk listener (Phase 22 G4,
 * 22-SHARED-SHELL-DECISION.md). Moved VERBATIM from the effect in
 * `components/practice/PracticeSessionShell.tsx`; the key rules themselves
 * come from `lib/practice/push-to-talk-key` and are not re-implemented.
 *
 * Call this hook at the position the shell's own listener effect used to sit
 * — AFTER the shell's unmount-cleanup effect — so that on unmount the shell's
 * `releaseMicrophone()` (which detaches `recorder.onstop`) runs before this
 * listener's `releaseHold()`. Effects clean up in declaration order.
 *
 * Registered once with `[]` deps so it is never torn down and re-attached
 * mid-hold: `startRecordingRef` / `stopRecordingRef` are refreshed by the
 * caller with bare render-time assignments, so the listener always calls the
 * current closures.
 */

import { type MutableRefObject, useEffect, useRef } from "react";

import {
  describeKeyTarget,
  isPushToTalkBlockingTarget,
  isPushToTalkKey,
} from "@/lib/practice/push-to-talk-key";

export interface HoldToTalkKeyOptions {
  startRecordingRef: MutableRefObject<(() => void) | null>;
  stopRecordingRef: MutableRefObject<(() => void) | null>;
  /** From `usePushToTalkRecorder` — aborts a start released mid-acquisition. */
  cancelPendingStartRef: MutableRefObject<boolean>;
  /**
   * Optional live gate checked on keydown only. The practice shell passes
   * none: there `startRecording` owns every gate. A shell whose talk control
   * is disabled for whole stretches (the coached shell, while the coach is
   * speaking) passes one so Space keeps scrolling the page meanwhile.
   */
  keyEnabledRef?: MutableRefObject<boolean>;
}

export function useHoldToTalkKey({
  startRecordingRef,
  stopRecordingRef,
  cancelPendingStartRef,
  keyEnabledRef,
}: HoldToTalkKeyOptions) {
  // Whether this component currently considers Space "held", for the
  // one-hold-one-recording guarantee.
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    const releaseHold = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      // A release landing before `startRecording`'s `await getMicrophone()`
      // resolves (the tap-and-release race) must abort that late-arriving
      // start — `stopRecording` is a no-op while `mediaRecorderRef.current`
      // is still null, so without this flag the mic would open with no
      // keyup left to close it.
      cancelPendingStartRef.current = true;
      stopRecordingRef.current?.();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPushToTalkKey(event.key)) return;
      // `event.repeat` is the key-repeat storm while a key stays held down —
      // one hold must mean exactly one recording.
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isPushToTalkBlockingTarget(describeKeyTarget(event.target))) return;
      if (spaceHeldRef.current) return;
      if (keyEnabledRef && !keyEnabledRef.current) return;

      // Prevent the page from also scrolling on Space.
      event.preventDefault();
      spaceHeldRef.current = true;
      // Deliberately does not consult the walk-out lock, `sending`,
      // `isPaused` or the recorder here. `startRecording` already owns
      // every one of those gates, including the re-check after
      // `getMicrophone()` resolves — duplicating them here is how the two
      // paths would drift apart.
      void startRecordingRef.current?.();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isPushToTalkKey(event.key)) return;
      if (!spaceHeldRef.current) return;
      // Releasing Space must stop the recording even if focus moved into a
      // blocked element during the hold — the held flag, not the current
      // target, decides whether to release.
      event.preventDefault();
      releaseHold();
    };

    const handleBlur = () => releaseHold();
    const handleVisibilityChange = () => {
      if (document.hidden) releaseHold();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Unmount or session end mid-hold must not leave the microphone open.
      releaseHold();
    };
    // Registered once; every input is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
