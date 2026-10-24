"use client";

/**
 * Plan 22-06: hold-to-talk for a coached session. The student answers aloud;
 * there is deliberately no typed path (22-CONTEXT.md: "a well-typed line does
 * not prove the student can say it").
 *
 * Part of the SECOND avatar mount (22-AVATAR-MOUNT-DECISION.md). The
 * MediaRecorder / metering / SSE block is a disclosed duplicate of the one in
 * the practice session shell; the key rules are NOT duplicated, they come from
 * the shared `lib/practice/push-to-talk-key` module.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  describeKeyTarget,
  isPushToTalkBlockingTarget,
  isPushToTalkKey,
  shouldAbortPendingStart,
} from "@/lib/practice/push-to-talk-key";
import {
  createVocalCapture,
  type VocalCaptureHandle,
} from "@/lib/metrics/vocal-capture";

// Values copied from components/practice/PracticeSessionShell.tsx (the
// source of truth); they cannot be imported from that tree.
const MIN_RECORDING_MS = 400;
const MIN_AUDIO_BYTES = 2048;
const MIN_PEAK_RMS = 0.01;

export interface CoachedTranscript {
  text: string;
  durationMs: number;
}

interface Args {
  enabled: boolean;
  language?: string;
  onBeforeRecord?: () => void;
  onTranscript: (t: CoachedTranscript) => void;
}

export function useCoachedPushToTalk({
  enabled,
  language = "en",
  onBeforeRecord,
  onTranscript,
}: Args) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micUnavailable, setMicUnavailable] = useState(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const startInFlightRef = useRef(false);
  const cancelPendingStartRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const vocalCaptureRef = useRef<VocalCaptureHandle | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const peakRmsRef = useRef(0);

  // Current-value refs so callbacks and the once-registered key listeners
  // never read stale state.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const isTranscribingRef = useRef(false);
  const languageRef = useRef(language);
  languageRef.current = language;
  const onBeforeRecordRef = useRef(onBeforeRecord);
  onBeforeRecordRef.current = onBeforeRecord;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    vocalCaptureRef.current = createVocalCapture();
    return () => {
      vocalCaptureRef.current?.detachStream();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    };
  }, []);

  const getMicrophone = useCallback(async () => {
    const existing = micStreamRef.current;
    if (existing?.getAudioTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    existing?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    vocalCaptureRef.current?.attachStream(stream);
    return stream;
  }, []);

  const stopMetering = useCallback(() => {
    if (meterTimerRef.current !== null) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
  }, []);

  const startMetering = useCallback((stream: MediaStream) => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const context = audioContextRef.current ?? new Ctor();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      meterSourceRef.current = source;
      peakRmsRef.current = 0;
      const samples = new Float32Array(analyser.fftSize);
      meterTimerRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        samples.forEach((s) => {
          sum += s * s;
        });
        peakRmsRef.current = Math.max(
          peakRmsRef.current,
          Math.sqrt(sum / samples.length),
        );
      }, 50);
    } catch {
      // Byte/duration checks still protect transcription without Web Audio.
    }
  }, []);

  const transcribeRecording = useCallback(async () => {
    const elapsed = Date.now() - recordingStartRef.current;
    const audio = new Blob(chunksRef.current, { type: "audio/webm" });
    const peakRms = peakRmsRef.current;
    chunksRef.current = [];

    if (elapsed < MIN_RECORDING_MS || audio.size < MIN_AUDIO_BYTES) {
      setError("Nothing was recorded. Hold Space (or the mic button), speak, then release.");
      return;
    }
    if (peakRms > 0 && peakRms < MIN_PEAK_RMS) {
      setError("No speech was detected. Check that the right microphone is selected and not muted.");
      return;
    }

    // Fire-and-forget; rejected recordings above never reach here.
    vocalCaptureRef.current?.submitSpokenTurn(audio, elapsed);

    isTranscribingRef.current = true;
    setIsTranscribing(true);
    setPartialTranscript("");
    try {
      const formData = new FormData();
      formData.append("audio", audio, "coached-answer.webm");
      formData.append("language", languageRef.current);
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
            // Keep processing subsequent events.
          }
        }
      }
      void reader.cancel().catch(() => {});
      if (failed || !transcript.trim()) {
        throw new Error("No transcription returned.");
      }
      onTranscriptRef.current({ text: transcript.trim(), durationMs: elapsed });
    } catch (err) {
      console.error("Coached transcription failed:", err);
      setError("Could not transcribe your answer. Please try again.");
    } finally {
      setPartialTranscript("");
      isTranscribingRef.current = false;
      setIsTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (
      !enabledRef.current ||
      isTranscribingRef.current ||
      startInFlightRef.current ||
      recorderRef.current?.state === "recording"
    ) {
      return;
    }
    startInFlightRef.current = true;
    cancelPendingStartRef.current = false;
    setError(null);
    try {
      const stream = await getMicrophone();
      if (
        shouldAbortPendingStart({
          sending: false,
          isTranscribing: isTranscribingRef.current,
          isPaused: !enabledRef.current,
          walkOutLocked: false,
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
        if (recorderRef.current === recorder) recorderRef.current = null;
        stopMetering();
        void transcribeRecording();
      };
      recorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      // Recording is validly claimed: let the shell cut the coach off now.
      onBeforeRecordRef.current?.();
      startMetering(stream);
      vocalCaptureRef.current?.beginTurnRecording();
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone unavailable:", err);
      setMicUnavailable(true);
      setError(
        "A microphone is required for coached sessions because the rework is spoken. Allow microphone access and try again.",
      );
    } finally {
      startInFlightRef.current = false;
    }
  }, [getMicrophone, startMetering, stopMetering, transcribeRecording]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.stop();
    setIsRecording(false);
  }, []);

  const startRef = useRef(startRecording);
  startRef.current = startRecording;
  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;

  // Registered once ([] deps) so a mid-hold re-render can never orphan the
  // matching keyup and leave the microphone open.
  useEffect(() => {
    const releaseHold = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      // Release before the mic promise settles must abort the late start.
      cancelPendingStartRef.current = true;
      stopRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPushToTalkKey(event.key)) return;
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isPushToTalkBlockingTarget(describeKeyTarget(event.target))) return;
      if (spaceHeldRef.current) return;
      if (!enabledRef.current) return;
      event.preventDefault();
      spaceHeldRef.current = true;
      void startRef.current();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isPushToTalkKey(event.key)) return;
      if (!spaceHeldRef.current) return;
      event.preventDefault();
      releaseHold();
    };

    const handleBlur = () => releaseHold();
    const handleVisibility = () => {
      if (document.hidden) releaseHold();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseHold();
    };
  }, []);

  return {
    isRecording,
    isTranscribing,
    partialTranscript,
    error,
    startRecording,
    stopRecording,
    micUnavailable,
  };
}
