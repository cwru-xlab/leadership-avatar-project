"use client";

/**
 * Shared push-to-talk recorder for every live avatar session (Phase 22 G4,
 * 22-SHARED-SHELL-DECISION.md): microphone acquisition, the MediaRecorder
 * lifecycle, RMS metering for the empty/silent-recording guards, vocal
 * capture (`lib/metrics/vocal-capture`), and the SSE transcription read
 * against `/api/audio/transcribe`.
 *
 * Moved VERBATIM out of `components/practice/PracticeSessionShell.tsx`. The
 * practice shell is the source of truth for every rule here; the only changes
 * are that the shell-specific pieces arrive as options:
 *
 * - `sending` / `isPaused` / `lockRef` are the gates `startRecording` checked
 *   inline (`lockRef` is the practice shell's `walkOutLockRef`). They are read
 *   exactly as before: `sending` and `isPaused` from the render that created
 *   `startRecording`, `lockRef.current` live.
 * - `onTranscript` replaces the direct `sendMessage(transcript)` call. It is a
 *   closure dependency of `transcribeRecording`, exactly as `sendMessage` was.
 * - `onRecordingStarted` replaces the direct `markOpeningTurnStarted()` call,
 *   also as a closure dependency.
 * - The toasts and the avatar interrupt are notification callbacks, read
 *   through refs at call time (they carry no closure state that matters).
 *
 * The hold-Space listener is deliberately NOT in this hook — see
 * `useHoldToTalkKey`. Its cleanup must run AFTER the owning shell's own
 * unmount cleanup (which detaches `recorder.onstop` before stopping), and a
 * hook's effects run in the position the hook is called, so the shell calls
 * `useHoldToTalkKey` where its own listener effect used to live.
 *
 * REQ-85: this hook renders nothing and exposes no live meter value. The RMS
 * peak is used only to reject a silent recording.
 */

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

import { shouldAbortPendingStart } from "@/lib/practice/push-to-talk-key";
import { createVocalCapture, type VocalCaptureHandle } from "@/lib/metrics/vocal-capture";

export const MIN_RECORDING_MS = 400;
export const MIN_AUDIO_BYTES = 2048;
export const MIN_PEAK_RMS = 0.01;

export type RecordingRejection = "too-short" | "no-speech";

export interface PushToTalkRecorderOptions {
  language: string;
  /** A turn is in flight; a new recording may not start. */
  sending: boolean;
  /** The session is paused; a new recording may not start. */
  isPaused: boolean;
  /** Live lock (practice: the walk-out lock). `true` refuses a start. */
  lockRef: MutableRefObject<boolean>;
  /** Receives the final transcript and the recording's wall-clock length. */
  onTranscript: (transcript: string, elapsedMs: number) => Promise<void> | void;
  /** Called once the recorder has started (practice: opening-turn timing). */
  onRecordingStarted?: () => void;
  /**
   * Called after a recording start has been validly claimed and BEFORE the
   * recorder starts — the place to cut the avatar off. A rejected microphone
   * permission never reaches it.
   */
  onRecordingClaimed?: () => void;
  onRejected: (reason: RecordingRejection) => void;
  onTranscriptionFailed: (error: unknown) => void;
  onMicrophoneUnavailable: (error: unknown) => void;
  /** Filename for the transcription upload. */
  audioFileName?: string;
  /**
   * Stamp each spoken turn's start on the vocal capture clock
   * (`beginTurnRecording`). Off by default because the practice shell never
   * called it; changing that would change practice's vocal payload.
   */
  stampVocalTurnStart?: boolean;
}

export function usePushToTalkRecorder({
  language,
  sending,
  isPaused,
  lockRef,
  onTranscript,
  onRecordingStarted,
  onRecordingClaimed,
  onRejected,
  onTranscriptionFailed,
  onMicrophoneUnavailable,
  audioFileName = "interview-answer.webm",
  stampVocalTurnStart = false,
}: PushToTalkRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const peakRmsRef = useRef(0);
  const meterTimerRef = useRef<number | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartInFlightRef = useRef(false);
  // Lets a release that lands before `getMicrophone()` resolves abort the
  // late-arriving start (the tap-and-release race) — set by the release path
  // in `useHoldToTalkKey`, read by `startRecording`.
  const cancelPendingStartRef = useRef(false);
  const vocalCaptureRef = useRef<VocalCaptureHandle | null>(null);

  const [partialTranscript, setPartialTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Notification callbacks: read at call time.
  const onRecordingClaimedRef = useRef(onRecordingClaimed);
  onRecordingClaimedRef.current = onRecordingClaimed;
  const onRejectedRef = useRef(onRejected);
  onRejectedRef.current = onRejected;
  const onTranscriptionFailedRef = useRef(onTranscriptionFailed);
  onTranscriptionFailedRef.current = onTranscriptionFailed;
  const onMicrophoneUnavailableRef = useRef(onMicrophoneUnavailable);
  onMicrophoneUnavailableRef.current = onMicrophoneUnavailable;

  const stopMetering = useCallback(() => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
  }, []);

  // Vocal capture is created once on mount, independent of cameraMode — audio
  // is always available regardless of the camera decision.
  useEffect(() => {
    vocalCaptureRef.current = createVocalCapture();
  }, []);

  const releaseMicrophone = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder?.state === "recording") {
      // Leaving or ending an interview discards an unfinished answer rather than
      // starting a transcription after the student has gone.
      recorder.onstop = null;
      recorder.stop();
    }
    recordingStartInFlightRef.current = false;
    setIsRecording(false);
    stopMetering();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, [stopMetering]);

  const getMicrophone = useCallback(async () => {
    const existing = micStreamRef.current;
    if (existing?.getAudioTracks().some((track) => track.readyState === "live")) {
      return existing;
    }
    existing?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    // Reuses the SAME audio stream the push-to-talk path already owns — no
    // second getUserMedia({ audio: true }) call. The vocal engine runs its
    // own independent AnalyserNode; this does not touch startMetering/
    // peakRmsRef below.
    vocalCaptureRef.current?.attachStream(stream);
    return stream;
  }, []);

  const startMetering = useCallback((stream: MediaStream) => {
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume();

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      meterSourceRef.current = source;
      peakRmsRef.current = 0;
      const samples = new Float32Array(analyser.fftSize);
      meterTimerRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sumSquares = 0;
        samples.forEach((sample) => {
          sumSquares += sample * sample;
        });
        peakRmsRef.current = Math.max(
          peakRmsRef.current,
          Math.sqrt(sumSquares / samples.length)
        );
      }, 50);
    } catch {
      // The byte/duration checks still protect transcription if Web Audio is absent.
    }
  }, []);

  const transcribeRecording = useCallback(async () => {
    const elapsed = Date.now() - recordingStartRef.current;
    const audio = new Blob(chunksRef.current, { type: "audio/webm" });
    const peakRms = peakRmsRef.current;
    chunksRef.current = [];

    if (elapsed < MIN_RECORDING_MS || audio.size < MIN_AUDIO_BYTES) {
      onRejectedRef.current("too-short");
      return;
    }
    if (peakRms > 0 && peakRms < MIN_PEAK_RMS) {
      onRejectedRef.current("no-speech");
      return;
    }

    // Fire-and-forget, never awaited — the live transcription latency the
    // student feels must be unchanged. A rejected blob (the two guards
    // above) is not a spoken turn and must never reach here.
    vocalCaptureRef.current?.submitSpokenTurn(audio, elapsed);

    setIsTranscribing(true);
    setPartialTranscript("");
    try {
      const formData = new FormData();
      formData.append("audio", audio, audioFileName);
      formData.append("language", language);
      const response = await fetch("/api/audio/transcribe", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Transcription request failed.");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No transcription stream was available.");
      const decoder = new TextDecoder();
      let buffer = "";
      let transcript = "";
      let failed = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type?: string;
              text?: string;
            };
            if (event.type === "delta" || event.type === "done") {
              transcript = event.text ?? transcript;
              setPartialTranscript(transcript);
            }
            if (event.type === "error") failed = true;
          } catch {
            // Keep processing subsequent server-sent events.
          }
        }
      }
      void reader.cancel().catch(() => {});
      if (failed || !transcript.trim()) throw new Error("No transcription returned.");
      await onTranscript(transcript, elapsed);
    } catch (error) {
      onTranscriptionFailedRef.current(error);
    } finally {
      setPartialTranscript("");
      setIsTranscribing(false);
    }
  }, [audioFileName, language, onTranscript]);

  const startRecording = useCallback(async () => {
    if (
      sending ||
      isTranscribing ||
      isPaused ||
      lockRef.current ||
      recordingStartInFlightRef.current ||
      mediaRecorderRef.current?.state === "recording"
    ) {
      return;
    }
    recordingStartInFlightRef.current = true;
    // Each start owns a fresh cancel flag — a stale cancel left over from an
    // earlier hold must not kill a later start.
    cancelPendingStartRef.current = false;
    try {
      const stream = await getMicrophone();
      if (
        shouldAbortPendingStart({
          sending,
          isTranscribing,
          isPaused,
          walkOutLocked: lockRef.current,
          startCancelled: cancelPendingStartRef.current,
        })
      ) {
        return;
      }
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        stopMetering();
        void transcribeRecording();
      };
      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      // Do not cut off the avatar until a valid recording start has been
      // claimed. A rejected microphone permission should leave speech alone.
      onRecordingClaimedRef.current?.();
      startMetering(stream);
      if (stampVocalTurnStart) vocalCaptureRef.current?.beginTurnRecording();
      recorder.start();
      onRecordingStarted?.();
      // Deliberately uncapped. A 45-second ceiling used to force-submit the
      // turn mid-sentence, with the toast arriving only AFTER the cut. None of
      // the real limits bind anywhere near it — OpenAI's 25MB file cap is
      // ~100 minutes of Opus, and the transcription call's own timeout is the
      // practical wall. An answer that runs long is a conciseness finding the
      // report can make from `VocalTurnMetrics.duration_s`; truncating it
      // teaches the student nothing about why.
      setIsRecording(true);
    } catch (error) {
      onMicrophoneUnavailableRef.current(error);
    } finally {
      recordingStartInFlightRef.current = false;
    }
  }, [getMicrophone, isPaused, isTranscribing, lockRef, onRecordingStarted, sending, stampVocalTurnStart, startMetering, stopMetering, transcribeRecording]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.stop();
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (lockRef.current) return;
    if (mediaRecorderRef.current?.state === "recording") {
      stopRecording();
      return;
    }
    void startRecording();
  }, [lockRef, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    partialTranscript,
    startRecording,
    stopRecording,
    toggleRecording,
    releaseMicrophone,
    /** The vocal capture engine, created on mount. Drain or detach via this. */
    vocalCaptureRef,
    /** Read by `useHoldToTalkKey` to abort a start released mid-acquisition. */
    cancelPendingStartRef,
  };
}
