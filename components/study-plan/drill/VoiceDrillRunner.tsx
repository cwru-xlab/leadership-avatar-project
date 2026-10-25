"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ChevronLeft, Lightbulb, Sparkles, Volume2 } from "lucide-react";

import type { InteractiveAvatarRef } from "@/components/HeyGenAvatar/InteractiveAvatar";
import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import { FaceDetectionBanner } from "@/components/session/FaceDetectionBanner";
import { SelfViewThumbnail } from "@/components/session/SelfViewThumbnail";
import { SessionAvatar, useAvatarKeepAlive } from "@/components/session/SessionAvatar";
import {
  formatElapsed,
  PushToTalkControl,
  SessionLiveBadge,
  SessionRoom,
  SessionSidePane,
  SessionStageHeader,
  SessionStagePane,
  SessionStatus,
} from "@/components/session/SessionRoom";
import { useHoldToTalkKey } from "@/components/session/useHoldToTalkKey";
import { usePushToTalkRecorder } from "@/components/session/usePushToTalkRecorder";
import { useSyncVisualSpeaking, useVisualCapture } from "@/components/session/useVisualCapture";
import {
  completeDrillAttempt,
  startDrillAttempt,
  type DrillApiError,
} from "@/components/study-plan/drill/api";
import type { DrillDelivery, VoiceDrillRunnerProps } from "@/components/study-plan/drill/contract";
import type { VocalMetrics } from "@/lib/metrics/types";
import {
  MIN_GRADABLE_TRANSCRIPT_WORDS,
  type CompleteDrillAttemptBody,
} from "@/lib/study-plan/drill/types";
import type { StartAvatarRequest } from "@/types";

/**
 * The live VOICE_DRILL rep, built on the shared session chrome in
 * `components/session/` (the same pieces CoachedSessionShell uses — nothing
 * copied, nothing from components/practice): avatar stage + keep-alive,
 * push-to-talk recorder with vocal capture, hold-Space, self-view with face
 * detection and visual capture, and the dark two-pane room.
 *
 * FLOW
 * - Mounting starts ONE attempt (ref-guarded; a redo is a new mount).
 * - The coach speaks `drill.scenarioPrompt` and then the fixed `liveTip`, once,
 *   when the stage reaches CONNECTED (the queued-speech fix: nothing is spoken
 *   into a stage that is not connected). The two server texts are spoken
 *   separately and verbatim — no tip is composed here.
 * - The student answers by tap or hold-Space; each recording becomes a
 *   caption. The countdown starts on the first recording and is SOFT: at 0:00
 *   it asks the student to wrap up, it never stops them.
 * - Finish stops the capture, POSTs transcript + metrics, and hands the graded
 *   attempt up. Until then nothing numeric is on screen (REQ-85, 23-CONTEXT:
 *   numeric grade only at the end).
 */

/** After this long without CONNECTED the student is OFFERED captions only. */
const SLOW_CONNECT_NOTICE_MS = 15_000;
/** Upper bound on waiting for the scenario line before the tip. */
const SPEECH_WAIT_MAX_MS = 45_000;

interface Segment {
  text: string;
  spokenMs: number;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function VoiceDrillRunner({
  stepId,
  drill,
  liveTip,
  durationSeconds,
  cameraMode,
  coach,
  onGraded,
  onExit,
}: VoiceDrillRunnerProps) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [slowConnect, setSlowConnect] = useState(false);
  const [coachSpeaking, setCoachSpeaking] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const avatarRef = useRef<InteractiveAvatarRef>(null);
  const stageReadyRef = useRef(false);
  const attemptRequestedRef = useRef(false);
  const briefSpokenRef = useRef(false);
  const answerStartedRef = useRef(false);
  const slowConnectTimerRef = useRef<number | null>(null);
  const answerStartedAtRef = useRef<number | null>(null);
  /** Collected once; a resubmit after a grading hiccup resends the same body. */
  const collectedRef = useRef<DrillDelivery | null>(null);
  const bodyRef = useRef<CompleteDrillAttemptBody | null>(null);
  const captionsEndRef = useRef<HTMLDivElement>(null);

  const {
    cameraStream,
    faceMissing,
    startVisualCapture,
    stopVisualCapture,
    releaseVisualCapture,
    syncSpeaking,
  } = useVisualCapture();

  // One attempt per mount. The ref survives a dev double-effect.
  useEffect(() => {
    if (attemptRequestedRef.current) return;
    attemptRequestedRef.current = true;
    startDrillAttempt(stepId, cameraMode)
      .then((attempt) => setAttemptId(attempt.id))
      .catch((e: DrillApiError) => setStartError(e.error ?? "This drill could not start."));
    // Mount only: the step and camera choice are fixed for a mounted rep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slow-connect offer, from mount (consent already happened).
  useEffect(() => {
    slowConnectTimerRef.current = window.setTimeout(() => {
      slowConnectTimerRef.current = null;
      if (!stageReadyRef.current) setSlowConnect(true);
    }, SLOW_CONNECT_NOTICE_MS);
    return () => {
      if (slowConnectTimerRef.current !== null) window.clearTimeout(slowConnectTimerRef.current);
    };
  }, []);

  // Countdown tick, from the first recording on.
  useEffect(() => {
    if (answerStartedAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [answerStartedAt]);

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [segments.length]);

  useAvatarKeepAlive(avatarRef, stageReady && !finishing);

  const avatarConfig = useMemo<StartAvatarRequest>(
    () =>
      ({
        quality: "low",
        avatarName: coach.avatarId,
        knowledgeId: undefined,
        voice: { rate: 1.0, voiceId: coach.voiceId, emotion: undefined },
        language: "en",
      }) as StartAvatarRequest,
    [coach.avatarId, coach.voiceId],
  );

  /** Scenario, then the tip — once, and only into a connected stage. */
  async function speakBriefOnce(): Promise<void> {
    const avatar = avatarRef.current;
    if (briefSpokenRef.current || !avatar || !stageReadyRef.current) return;
    briefSpokenRef.current = true;
    setCoachSpeaking(true);
    try {
      avatar.speak(drill.scenarioPrompt);
      await avatar.waitForSpeechEnd(SPEECH_WAIT_MAX_MS);
      // The tip stays on screen either way; it is not spoken over the student.
      if (stageReadyRef.current && !answerStartedRef.current) {
        avatarRef.current?.speak(liveTip);
        await avatarRef.current?.waitForSpeechEnd(SPEECH_WAIT_MAX_MS);
      }
    } finally {
      setCoachSpeaking(false);
    }
  }

  function startCaptureIfAllowed(): void {
    if (cameraMode !== "ON") return;
    startVisualCapture(() => answerStartedAtRef.current ?? Date.now());
  }

  function handleStageReady(): void {
    if (stageReadyRef.current) return;
    stageReadyRef.current = true;
    setStageReady(true);
    setSlowConnect(false);
    setVideoUnavailable(false);
    if (slowConnectTimerRef.current !== null) {
      window.clearTimeout(slowConnectTimerRef.current);
      slowConnectTimerRef.current = null;
    }
    // Capture after CONNECTED, never before, so it cannot delay the handshake.
    startCaptureIfAllowed();
    void speakBriefOnce();
  }

  function handleStageInactive(): void {
    stageReadyRef.current = false;
    setStageReady(false);
  }

  function handleStageError(): void {
    stageReadyRef.current = false;
    setStageReady(false);
    setVideoUnavailable(true);
    startCaptureIfAllowed();
  }

  function handleContinueWithoutVideo(): void {
    setSlowConnect(false);
    setVideoUnavailable(true);
    startCaptureIfAllowed();
  }

  const stageHandlersRef = useRef({ ready: handleStageReady, inactive: handleStageInactive });
  stageHandlersRef.current = { ready: handleStageReady, inactive: handleStageInactive };
  const handleAvatarStateChange = useCallback((state: StreamingAvatarSessionState) => {
    if (state === StreamingAvatarSessionState.CONNECTED) stageHandlersRef.current.ready();
    else if (state === StreamingAvatarSessionState.INACTIVE) stageHandlersRef.current.inactive();
  }, []);
  const stageErrorRef = useRef(handleStageError);
  stageErrorRef.current = handleStageError;
  const handleAvatarTokenError = useCallback(() => stageErrorRef.current(), []);

  // -------------------------------------------------------------------------
  // Spoken answer — the shared push-to-talk recorder (no typed path).
  // -------------------------------------------------------------------------

  const connected = stageReady || videoUnavailable;
  const canSpeak = connected && attemptId !== null && !finishing;

  const talkLockRef = useRef(true);
  talkLockRef.current = !canSpeak;
  const keyEnabledRef = useRef(false);
  keyEnabledRef.current = canSpeak;

  const handleTranscript = useCallback((transcript: string, elapsedMs: number) => {
    setTalkError(null);
    const text = transcript.trim();
    if (!text) return;
    setSegments((current) => [...current, { text, spokenMs: Math.round(elapsedMs) }]);
  }, []);

  const {
    isRecording,
    isTranscribing,
    partialTranscript,
    startRecording,
    stopRecording,
    toggleRecording,
    releaseMicrophone,
    vocalCaptureRef,
    cancelPendingStartRef,
  } = usePushToTalkRecorder({
    language: "en",
    sending: finishing,
    isPaused: !canSpeak,
    lockRef: talkLockRef,
    onTranscript: handleTranscript,
    onRecordingStarted: () => {
      setTalkError(null);
      if (!answerStartedRef.current) {
        answerStartedRef.current = true;
        const t = Date.now();
        answerStartedAtRef.current = t;
        setAnswerStartedAt(t);
        setNow(t);
      }
    },
    onRecordingClaimed: () => avatarRef.current?.interrupt(),
    onRejected: (reason) =>
      setTalkError(
        reason === "too-short"
          ? "Nothing was recorded. Tap the microphone (or hold Space), speak, then send."
          : "No speech was detected. Check that the right microphone is selected and not muted.",
      ),
    onTranscriptionFailed: (error) => {
      console.error("Drill transcription failed:", error);
      setTalkError("Could not transcribe that. Please say it again.");
    },
    onMicrophoneUnavailable: (error) => {
      console.error("Microphone unavailable:", error);
      setTalkError("A voice drill is spoken, so it needs a microphone. Allow microphone access and try again.");
    },
    audioFileName: "drill-answer.webm",
    stampVocalTurnStart: true,
  });

  // Unmount: release the microphone, the camera and the avatar. Declared
  // BEFORE the hold-Space listener, as in the other shells.
  useEffect(() => {
    return () => {
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
    };
  }, [releaseMicrophone, releaseVisualCapture, vocalCaptureRef]);

  useSyncVisualSpeaking(syncSpeaking, isRecording);

  const startRecordingRef = useRef<(() => void) | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;
  useHoldToTalkKey({ startRecordingRef, stopRecordingRef, cancelPendingStartRef, keyEnabledRef });

  // -------------------------------------------------------------------------
  // Finish: stop capture -> POST -> hand the graded attempt up.
  // -------------------------------------------------------------------------

  const transcript = segments.map((s) => s.text).join(" ");
  const words = wordCount(transcript);
  const enoughToGrade = words >= MIN_GRADABLE_TRANSCRIPT_WORDS;
  const canFinish = enoughToGrade && attemptId !== null && !isRecording && !isTranscribing && !finishing;

  async function collectDelivery(): Promise<DrillDelivery> {
    if (collectedRef.current) return collectedRef.current;
    const visual = await stopVisualCapture();
    let vocal: VocalMetrics | null = null;
    try {
      vocal = (await vocalCaptureRef.current?.drain()) ?? null;
    } catch {
      vocal = null;
    }
    const collected: DrillDelivery = { cameraMode, visual, vocal };
    collectedRef.current = collected;
    return collected;
  }

  async function handleFinish(): Promise<void> {
    if (!canFinish || !attemptId) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const delivery = await collectDelivery();
      const body: CompleteDrillAttemptBody = bodyRef.current ?? {
        transcript,
        spokenDurationMs: segments.reduce((sum, s) => sum + s.spokenMs, 0),
        cameraMode,
        metrics: { visual: delivery.visual, vocal: delivery.vocal },
      };
      bodyRef.current = body;
      const graded = await completeDrillAttempt(stepId, attemptId, body);
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
      onGraded(graded, delivery);
    } catch (e) {
      const err = e as DrillApiError;
      if (err.code === "GRADING_FAILED") {
        setFinishError("Grading hit a snag. Press Finish again; your answer is kept.");
      } else if (err.code === "TOO_SHORT") {
        bodyRef.current = null;
        setFinishError("That was too short to grade. Say a little more, then finish.");
      } else if (err.status === 409) {
        setFinishError("This attempt was already graded. Head back to the drill to try again.");
      } else {
        setFinishError(err.error ?? "We couldn't reach the server. Please try again.");
      }
    } finally {
      setFinishing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const maxSeconds = durationSeconds.maxSeconds;
  const elapsed = answerStartedAt === null ? 0 : Math.max(0, Math.floor((now - answerStartedAt) / 1000));
  const remaining = Math.max(0, maxSeconds - elapsed);
  const overTime = answerStartedAt !== null && remaining === 0;
  const coachLabel = `Coach ${coach.name}`;

  const idleLabel = segments.length === 0 ? "Tap to answer" : "Tap to keep going";
  const progressPct = Math.min(100, Math.round((elapsed / maxSeconds) * 100));

  return (
    <SessionRoom className="relative flex min-h-[100dvh] flex-col bg-[#07131f] text-[#f4f8fb] lg:h-[100dvh] lg:flex-row">
      <SessionStagePane className="relative flex h-[56vh] min-h-[320px] flex-col lg:h-full lg:flex-1 lg:w-[64%]">
        <SessionStageHeader>
          <Button
            isIconOnly
            aria-label="Leave the drill"
            variant="light"
            className="bg-[#07131f]/65 text-white backdrop-blur-md"
            onPress={onExit}
          >
            <ChevronLeft size={20} />
          </Button>
          <SessionLiveBadge label="VOICE DRILL" />
          <div className="h-10 w-10" aria-hidden />
        </SessionStageHeader>

        {/* Stays mounted when unavailable so a late connect can still speak. */}
        <div className={videoUnavailable ? "hidden" : "absolute inset-0"}>
          <SessionAvatar
            ref={avatarRef}
            config={avatarConfig}
            onSessionStateChange={handleAvatarStateChange}
            onSessionTokenError={handleAvatarTokenError}
          />
        </div>
        {videoUnavailable ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center" role="status">
            <p className="max-w-sm text-sm leading-6 text-[#d3e7f5]">
              The video coach couldn&apos;t connect. The scenario is on screen; answer out loud
              whenever you&apos;re ready.
            </p>
          </div>
        ) : null}
        {!connected ? (
          <div className="absolute inset-x-0 bottom-24 z-10 flex flex-col items-center gap-3 px-6 text-center">
            <Spinner color="primary" size="sm" />
            <p className="text-sm text-[#d3e7f5]">Connecting to {coachLabel}…</p>
            {slowConnect ? (
              <Button size="sm" variant="flat" className="text-[#d7eaf3]" onPress={handleContinueWithoutVideo}>
                Taking a while — continue without video
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#07131f] via-[#07131f]/45 to-transparent" />
        <span className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {coachLabel}
        </span>
        <SelfViewThumbnail stream={cameraStream} />
      </SessionStagePane>

      <SessionSidePane className="relative z-10 flex w-full flex-col border-white/10 bg-[#0b1c2a]/95 lg:h-full lg:w-[36%] lg:max-w-[570px] lg:border-l">
        <div className="px-5 pb-4 pt-6 sm:px-8 lg:pt-7">
          <SessionStatus
            eyebrow="Voice drill"
            title={drill.competencyLabel}
            subtitle={
              !connected
                ? "Connecting securely"
                : overTime
                  ? "Time — wrap up when you're ready"
                  : `Aim for ${durationSeconds.minSeconds}-${maxSeconds} seconds`
            }
            elapsedSeconds={elapsed}
            clockLabel={formatElapsed(remaining)}
            clockAriaLabel="Time left"
          />
          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Drill time used"
            aria-valuemin={0}
            aria-valuemax={maxSeconds}
            aria-valuenow={Math.min(elapsed, maxSeconds)}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${overTime ? "bg-[#f0b45b]" : "bg-[#73cee5]"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-4 sm:px-8 lg:overflow-y-auto">
          <article className="max-w-[94%]" aria-label="Scenario">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#73cee5]">
              {coachSpeaking ? <Volume2 size={13} className="animate-pulse" /> : <Sparkles size={13} />} {coachLabel}
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#edf6fb]">{drill.scenarioPrompt}</p>
          </article>

          <aside aria-label="Technique to apply" className="rounded-xl border border-white/10 bg-[#102a3a] p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#73cee5]">
              <Lightbulb size={14} aria-hidden="true" /> Technique to apply
            </p>
            {/* Rendered verbatim from the server (closed technique library); never composed here. */}
            <p className="mt-2 text-sm leading-6 text-[#d3e7f5]">{liveTip}</p>
          </aside>

          <div className="space-y-3" aria-label="Your answer captions">
            {segments.map((segment, index) => (
              <article
                key={index}
                className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#1d4f69] px-4 py-3 text-sm leading-6 text-white"
              >
                {segment.text}
              </article>
            ))}
            {partialTranscript ? (
              <article className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm border border-[#4782a0] bg-[#153e54] px-4 py-3 text-sm leading-6 text-[#dcedf5]">
                {partialTranscript}
              </article>
            ) : null}
            <div ref={captionsEndRef} />
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#091925] px-5 py-5 sm:px-8">
          {startError ? (
            <p className="mb-2 text-sm text-[#ffb4a8]" role="alert">
              {startError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PushToTalkControl
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              isDisabled={!canSpeak || isTranscribing}
              onToggle={toggleRecording}
              showSpaceHint={canSpeak}
              idleLabel={idleLabel}
              recordingLabel="Tap again when done"
              startAriaLabel={idleLabel}
              stopAriaLabel="Stop recording"
            />
            {segments.length > 0 ? (
              <Button color="primary" size="sm" isDisabled={!canFinish} onPress={handleFinish}>
                {finishing ? <Spinner size="sm" color="white" /> : "Finish and get graded"}
              </Button>
            ) : null}
          </div>
          {segments.length > 0 && !enoughToGrade && !isRecording && !isTranscribing ? (
            <p className="mt-2 text-xs text-[#a9c5d6]">Say a bit more before you finish — a full answer is graded best.</p>
          ) : null}
          {talkError ? (
            <p className="mt-2 text-sm text-[#ffb4a8]" role="alert">
              {talkError}
            </p>
          ) : null}
          {finishError ? (
            <p className="mt-2 text-sm text-[#ffb4a8]" role="alert">
              {finishError}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] leading-4 text-[#82a5b8]">
            You answer out loud, in one go or a few pieces. Your grade appears when you finish.
          </p>
        </div>
      </SessionSidePane>

      <FaceDetectionBanner visible={cameraMode === "ON" && faceMissing} />
    </SessionRoom>
  );
}
