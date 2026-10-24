"use client";

/**
 * Shared camera self-view + visual capture lifecycle (Phase 22 G3/G4,
 * 22-SHARED-SHELL-DECISION.md): camera acquisition, MediaPipe face detection
 * through `lib/metrics/visual-capture`, the face-missing flag the
 * `FaceDetectionBanner` reads, and the `VisualMetrics` stop.
 *
 * Moved VERBATIM out of `components/practice/PracticeSessionShell.tsx`. The
 * caller still decides WHEN capture starts (the practice shell: on the avatar
 * reaching CONNECTED, never before — REQ-49) and whether it is allowed at all
 * (cameraMode ON, and not downgraded by the server); this hook owns HOW.
 *
 * REQ-85: this hook exposes only the face-detected fact and the raw stream for
 * the self-view. No live metric, percentage or rating leaves it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { addToast } from "@heroui/toast";

import {
  createVisualCapture,
  requestCameraStream,
  type VisualCaptureHandle,
} from "@/lib/metrics/visual-capture";
import type { VisualMetrics } from "@/lib/metrics/types";

/**
 * Drives `syncSpeaking` from the recorder's `isRecording` state. Deliberately
 * an effect on the state itself: driving it from the state makes the visual
 * window and the recorder impossible to disagree.
 */
export function useSyncVisualSpeaking(
  syncSpeaking: (isRecording: boolean) => void,
  isRecording: boolean,
) {
  useEffect(() => {
    syncSpeaking(isRecording);
  }, [syncSpeaking, isRecording]);
}

export function useVisualCapture() {
  // visualCaptureRef/cameraStreamRef stay null for the entire session when
  // capture is never started — the self-view and banner both render nothing
  // in that case.
  const visualCaptureRef = useRef<VisualCaptureHandle | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [faceMissing, setFaceMissing] = useState(false);
  // Mirrors cameraStreamRef for rendering only — SelfViewThumbnail needs a
  // reactive value to attach its <video> element to; the ref remains the
  // source of truth every cleanup/lifecycle path reads and stops tracks on.
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  /** Mirrors `isRecording` for readers that run outside React's render cycle
   * — specifically the async camera-acquisition block, which creates the
   * visual engine long after this state was last set and must adopt the
   * current window rather than assume silence. */
  const isRecordingRef = useRef(false);
  // Set SYNCHRONOUSLY before requesting the camera. `visualCaptureRef` is only
  // assigned after an await, so it cannot guard against a second CONNECTED
  // event arriving mid-request — both would pass the check and acquire their
  // own stream, and only the last one would be reachable for teardown.
  const visualStartingRef = useRef(false);

  // Stops the visual engine and releases the camera track. Idempotent and
  // safe to call from multiple exit paths (Leave, End, unmount) — the camera
  // LED must go out on every one of them.
  const releaseVisualCapture = useCallback(() => {
    // Capture the handle and release the tracks FIRST, synchronously. The
    // camera LED going out is the part a student actually sees, and it must
    // not wait on `stop()`'s now-async (but bounded) engine teardown. The
    // three callers of this function (unmount, handleLeave, the post-finish
    // cleanup) discard the metrics entirely, so the engine stop below is
    // deliberately fire-and-forget.
    const handle = visualCaptureRef.current;
    visualCaptureRef.current = null;
    visualStartingRef.current = false;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);

    void handle?.stop().catch(() => {});
  }, []);

  /**
   * Keeps the visual engine's conversational window locked to the recorder.
   * The caller drives this from an effect on its `isRecording` state (see
   * `useSyncVisualSpeaking`), never beside each `setIsRecording` — there are
   * several of those, and hand-wiring each is precisely how the visual window
   * would eventually drift away from the vocal pipeline's turn accounting.
   * Safe before capture exists — the ref is simply null then, and the engine
   * defaults to "not speaking".
   */
  const syncSpeaking = useCallback((isRecording: boolean) => {
    isRecordingRef.current = isRecording;
    visualCaptureRef.current?.setSpeaking(isRecording);
  }, []);

  /**
   * Acquires the camera and starts the visual engine, once. A second call
   * while a stream is held or being requested is a no-op. The caller has
   * already decided capture is allowed (camera ON, not server-downgraded).
   * `getSessionStartedAtMs` is read AFTER the camera resolves, exactly where
   * the practice shell used to read its session clock.
   */
  const startVisualCapture = useCallback((getSessionStartedAtMs: () => number) => {
    if (visualCaptureRef.current || visualStartingRef.current) return;
    visualStartingRef.current = true;
    void (async () => {
      const result = await requestCameraStream();
      if (!result.ok) {
        // The consent step's own probe already succeeded — the camera was
        // seized between steps. The student is already live; do NOT
        // block. The finish payload's null visual block will resolve
        // to INSUFFICIENT_DATA server-side (REQ-42).
        addToast({
          title: "Your camera stopped responding",
          description: "Visual won't be measured for this session.",
          color: "warning",
        });
        visualStartingRef.current = false;
        return;
      }
      // Defence in depth: if anything did slip through and a stream is
      // already held, stop it rather than orphaning it. An orphaned
      // stream is invisible to releaseVisualCapture and leaves the
      // camera light on after the session ends.
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      cameraStreamRef.current = result.stream;
      setCameraStream(result.stream);
      const capture = createVisualCapture({
        stream: result.stream,
        // Transcript turns are stamped against this same clock, so
        // handing it to the engine is what lets an episode be matched
        // to the sentence it happened during. Capture starts later than
        // the session — it waits for the avatar to connect — and the
        // engine records that distance as `coverage.capture_offset_s`.
        sessionStartedAtMs: getSessionStartedAtMs(),
        onFaceStateChange: (detected) => setFaceMissing(!detected),
      });
      visualCaptureRef.current = capture;
      // The recorder may already be live by the time capture starts;
      // adopt the current state rather than assuming silence.
      capture.setSpeaking(isRecordingRef.current);
      void capture.start();
    })();
  }, []);

  /**
   * Stops the engine and returns its metrics for a finish payload. Never
   * throws; nulls the handle so a later `releaseVisualCapture()` cannot
   * double-stop.
   */
  const stopVisualCapture = useCallback(async (): Promise<VisualMetrics | null> => {
    let visual: VisualMetrics | null = null;
    try {
      visual = (await visualCaptureRef.current?.stop()) ?? null;
    } catch {
      visual = null;
    } finally {
      // Null the ref immediately so the later releaseVisualCapture() call
      // (post-finish cleanup) cannot double-stop. stop() is already
      // idempotent via its own `stopped` flag, so this is belt and braces,
      // not load-bearing.
      visualCaptureRef.current = null;
    }
    return visual;
  }, []);

  return {
    cameraStream,
    faceMissing,
    startVisualCapture,
    stopVisualCapture,
    releaseVisualCapture,
    syncSpeaking,
  };
}
