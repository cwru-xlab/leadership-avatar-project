"use client";

import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Tooltip } from "@heroui/tooltip";
import { addToast } from "@heroui/toast";
import {
  ChevronLeft,
  CircleStop,
  FileText,
  Mic,
  MicOff,
  Pause,
  SendHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import InteractiveAvatarWrapper, {
  type InteractiveAvatarRef,
} from "@/components/HeyGenAvatar/InteractiveAvatar";
import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import {
  initialProgress,
  type InterviewProgress,
} from "@/lib/interview/types";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import { getEngineType } from "@/lib/engine/registry";
import { parseEngineTurn } from "@/lib/engine/turn-control";
import type {
  DisengagementComputeResult,
  DisengagementCue,
} from "@/lib/engine/disengagement";
import type { ResolvedSessionConfig } from "@/lib/engine/types";
import {
  createVisualCapture,
  requestCameraStream,
  type VisualCaptureHandle,
} from "@/lib/metrics/visual-capture";
import { createVocalCapture, type VocalCaptureHandle } from "@/lib/metrics/vocal-capture";
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import { SelfViewThumbnail } from "@/components/metrics/SelfViewThumbnail";
import { FaceDetectionBanner } from "@/components/metrics/FaceDetectionBanner";
import type { CaseStudy, InteractionLog, StartAvatarRequest } from "@/types";
import CaseStudySessionView from "@/components/practice/CaseStudySessionView";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

type WalkOutMetadata = {
  termination?: { reason: string } | null;
  disengagement?: DisengagementComputeResult;
  disengagementCue?: DisengagementCue | null;
  walkOutFinal?: boolean;
  walkOutProof?: string | null;
};

interface PracticeSessionShellProps {
  /**
   * Resolved TYPE+INSTANCE config for this session. The shell never
   * re-resolves — the page owns that and passes the result down.
   */
  sessionConfig: ResolvedSessionConfig;
  /**
   * The raw picker input, resent VERBATIM on session start and every chat
   * turn (REQ-23). Never re-derived, mutated, or re-resolved here — the
   * server re-resolves it identically each time, and byte-stability is what
   * keeps the OpenAI prefix cache hitting turn to turn.
   *
   * Networking may also carry `characterId` (built-in character) or
   * `distilledPersona` + `personaDisplayName` (brought-in) — fields the
   * interview picker type does not declare, but the chat route reads.
   */
  customization?:
    | (InterviewCustomizationInput & {
        characterId?: string | null;
      })
    | null;
  /**
   * Report row created by SetupWizard's launch POST (or by ensureReport as
   * a retry). Pre-seeded into reportIdRef so the first checkpoint does not
   * need to create a second row.
   */
  reportId: string;
  interviewerName?: string;
  interviewerAvatarId?: string;
  avatarConfig?: StartAvatarRequest | null;
  /**
   * The camera-mode decision made and LOCKED in the setup wizard (REQ-35).
   * Deliberately a plain value, never a setter — this component has no
   * ability to change it, by the prop's type rather than by discipline.
   */
  cameraMode: CameraMode;
  resumeText?: string;
  resumeFileName?: string;
  resumeId?: string | null;
  language: string;
  onExit: () => void;
  onFinish: (reportId: string) => void;
  /**
   * Case-study only — full S3 CaseStudy (avatar ids / voice ids) and the
   * InteractionLog returned by session start. Ignored for interview presets.
   */
  caseStudy?: CaseStudy | null;
  interactionLog?: InteractionLog | null;
  /**
   * Optional type-specific in-session chrome (e.g. pitch timer, session safety).
   * Rendered top-right of the avatar pane — never a second shell, never centered
   * over the face. Pure presentation: panels here must not gate mic/send controls.
   */
  sessionPanel?: ReactNode;
  /**
   * Optional className for the sessionPanel positioning wrapper. Pitch-deck
   * uses a wider bottom placement so the live viewer coexists with the avatar
   * (14-13). Defaults preserve the compact top-right overlay from 14-10.
   */
  sessionPanelClassName?: string;
  /**
   * Left-pane media layout. `avatar-primary` (default) is the interview layout.
   * `deck-primary` fills the stage with the session panel (slides) and shrinks
   * the live avatar into a corner PiP like the self-view (pitch-deck).
   */
  mediaLayout?: "avatar-primary" | "deck-primary";
  /**
   * Optional fields merged into every `/api/interaction/chat` body and, when
   * `revealedSlideIndex` is present, into the existing checkpoint body
   * (13-10 extension for 14-13). Pitch-deck uses this to ride the furthest
   * slide on every turn so a dropped write self-heals.
   */
  extraChatBody?: Record<string, unknown>;
  /**
   * Read-only opening-turn timing for soft first-turn windows (pitch-elevator).
   * Fires when the student begins a pitching-phase turn and again when a
   * pitch-scale turn is delivered (phase → followups). Short discovery turns
   * stay in pitching and clear turnStartedAt so the 60s window can restart on
   * the actual pitch. Does not accept commands back.
   */
  onOpeningTurnTimingChange?: (state: {
    turnStartedAt: number | null;
    phase: "pitching" | "followups";
  }) => void;
  /**
   * Optional ref filled with a finish helper so type-contributed panels can
   * end with an explicit terminationReason / terminationSource (15-08).
   */
  sessionFinishRef?: MutableRefObject<SessionFinishFn | null>;
  /**
   * When set, the shell's built-in End control finishes with this student
   * reason (and source "student") instead of an unspecified end.
   */
  defaultStudentEndReason?: string;
  /**
   * Hide the shell's built-in End control when a type panel owns End-session
   * (difficult-conversation SessionSafetyPanel).
   */
  hideDefaultEndControl?: boolean;
  /**
   * Avatar-accepted ends finish immediately with a neutral transition — no
   * error toast, no "session ended unexpectedly" copy (15-08 walk-out).
   */
  autoFinishOnAvatarEnd?: boolean;
  /**
   * Prefill for the end-session "Name this report" field. Finish still writes
   * a server default when blank.
   */
  defaultReportTitle?: string;
}

export type SessionFinishFn = (opts: {
  reason: string;
  source: "student" | "avatar";
}) => Promise<void>;

const HISTORY_TURNS = 10;
const MIN_RECORDING_MS = 400;
const MIN_AUDIO_BYTES = 2048;
const MIN_PEAK_RMS = 0.01;
// Well inside any provider idle window, and cheap: one request a minute at most.
const KEEP_ALIVE_INTERVAL_MS = 30_000;
// Answers, not turns. Below this the report will be thin, and the evaluator
// prompt explicitly handles a too-short transcript — so warn, do not block.
const SHORT_INTERVIEW_ANSWERS = 3;

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * One generic live-session shell for every engine-backed interaction type
 * (REQ-59). Ported from InterviewSessionShell — same layout, controls,
 * capture lifecycle and turn loop — driven by ResolvedSessionConfig instead
 * of a per-type interview record. Calls only /api/practice/session/* and
 * /api/interaction/chat.
 */

/**
 * One generic live-session shell for every engine-backed interaction type
 * (REQ-59). Interview presets use the interview live room; case-study
 * delegates to CaseStudySessionView so `/api/interaction/save` and the
 * multi-role UI stay byte-identical to today's case-play session (REQ-69).
 */
export default function PracticeSessionShell(props: PracticeSessionShellProps) {
  if (
    props.sessionConfig.instance.kind === "case-study" &&
    props.caseStudy &&
    props.interactionLog
  ) {
    return (
      <CaseStudySessionView
        caseData={props.caseStudy}
        reportId={props.reportId}
        cameraMode={props.cameraMode}
        initialLog={props.interactionLog}
        language={props.language}
        onExit={props.onExit}
        onFinish={props.onFinish}
      />
    );
  }
  return <PracticeInterviewRoom {...props} />;
}

function PracticeInterviewRoom({
  sessionConfig,
  customization,
  reportId: initialReportId,
  interviewerName = "",
  interviewerAvatarId = "",
  avatarConfig = null,
  cameraMode,
  resumeText = "",
  resumeFileName,
  resumeId = null,
  language,
  onExit,
  onFinish,
  sessionPanel,
  sessionPanelClassName,
  mediaLayout = "avatar-primary",
  extraChatBody,
  onOpeningTurnTimingChange,
  sessionFinishRef,
  defaultStudentEndReason,
  hideDefaultEndControl = false,
  autoFinishOnAvatarEnd = false,
  defaultReportTitle = "",
}: PracticeSessionShellProps) {
  if (!avatarConfig) {
    throw new Error("PracticeInterviewRoom requires avatarConfig");
  }
  const avatarRef = useRef<InteractiveAvatarRef>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const reportIdRef = useRef<string | null>(initialReportId || null);
  const extraChatBodyRef = useRef(extraChatBody);
  const checkpointing =
    getEngineType(sessionConfig.typeSlug)?.checkpointing ?? "none";
  const targetQuestionCount =
    sessionConfig.limits.targetQuestionCount ??
    sessionConfig.customization?.targetQuestionCount ??
    9;
  const startingRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  // Soft first-turn window (pitch-elevator): when the student's opening turn
  // began, and whether it has been delivered. Read-only to the page via
  // onOpeningTurnTimingChange — never used to disable mic/send.
  const openingTurnStartedAtRef = useRef<number | null>(null);
  const [openingTurnPhase, setOpeningTurnPhase] = useState<
    "pitching" | "followups"
  >("pitching");

  useEffect(() => {
    extraChatBodyRef.current = extraChatBody;
  }, [extraChatBody]);

  // Pitch window targets the spoken pitch, not discovery Q&A (14-10 Session A).
  // Under this floor a turn is treated as setup and the timer can restart.
  const PITCH_WINDOW_MIN_SECONDS = 30;
  // Typed turns have ~0 wall-clock between start+deliver; ~50 words ≈ 20s speech.
  const PITCH_WINDOW_MIN_WORDS = 50;

  const markOpeningTurnStarted = useCallback(() => {
    if (openingTurnPhase === "followups") return;
    // Allow restart after a short discovery turn cleared the start time.
    if (openingTurnStartedAtRef.current != null) return;
    openingTurnStartedAtRef.current = Date.now();
    onOpeningTurnTimingChange?.({
      turnStartedAt: openingTurnStartedAtRef.current,
      phase: "pitching",
    });
  }, [onOpeningTurnTimingChange, openingTurnPhase]);
  const markOpeningTurnDelivered = useCallback(
    (content = ""): boolean => {
      if (openingTurnPhase === "followups") return true;
      const started = openingTurnStartedAtRef.current;
      const elapsedSec =
        started == null
          ? 0
          : Math.max(0, (Date.now() - started) / 1000);
      const words = content.trim().split(/\s+/).filter(Boolean).length;
      const isPitchScale =
        elapsedSec >= PITCH_WINDOW_MIN_SECONDS ||
        (elapsedSec < 2 && words >= PITCH_WINDOW_MIN_WORDS);

      if (!isPitchScale) {
        // Discovery / intro — leave the soft window open for the real pitch.
        openingTurnStartedAtRef.current = null;
        onOpeningTurnTimingChange?.({
          turnStartedAt: null,
          phase: "pitching",
        });
        return false;
      }

      setOpeningTurnPhase("followups");
      onOpeningTurnTimingChange?.({
        turnStartedAt: openingTurnStartedAtRef.current,
        phase: "followups",
      });
      return true;
    },
    [onOpeningTurnTimingChange, openingTurnPhase]
  );
  const openingSentRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const peakRmsRef = useRef(0);
  const meterTimerRef = useRef<number | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartInFlightRef = useRef(false);

  // Phase 10 metrics capture refs (REQ-35/43/49). visualCaptureRef/
  // cameraStreamRef stay null for the entire session when cameraMode is
  // "OFF" — the self-view and banner both render nothing in that case.
  const visualCaptureRef = useRef<VisualCaptureHandle | null>(null);
  const vocalCaptureRef = useRef<VocalCaptureHandle | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [faceMissing, setFaceMissing] = useState(false);
  // Mirrors cameraStreamRef for rendering only — SelfViewThumbnail needs a
  // reactive value to attach its <video> element to; the ref remains the
  // source of truth every cleanup/lifecycle path reads and stops tracks on.
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState<InterviewProgress>(initialProgress);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  /** Mirrors `isRecording` for readers that run outside React's render cycle
   * — specifically the async camera-acquisition block, which creates the
   * visual engine long after this state was last set and must adopt the
   * current window rather than assume silence. */
  const isRecordingRef = useRef(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [avatarReady, setAvatarReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [exitIntent, setExitIntent] = useState<null | "end" | "leave">(null);
  const [reportTitleDraft, setReportTitleDraft] = useState(defaultReportTitle);
  const [submitting, setSubmitting] = useState(false);
  // Walk-outs are a terminal state: no typed, voice, pause, exit, or interrupt
  // action may cut the single final avatar statement short.
  const [walkOutLock, setWalkOutLock] = useState(false);
  const walkOutLockRef = useRef(false);
  const forcedFarewellRequestedRef = useRef(false);
  const walkOutFinishTimerRef = useRef<number | null>(null);
  const disengagementRef = useRef<DisengagementComputeResult | null>(null);
  const walkOutProofRef = useRef<string | null>(null);
  /** Pending termination from an accepted avatar end marker (or panel request). */
  const pendingTerminationRef = useRef<{
    reason: string;
    source: "student" | "avatar";
  } | null>(null);
  useEffect(() => {
    setReportTitleDraft(defaultReportTitle);
  }, [defaultReportTitle]);

  // Stable ref so the chat turn handler can call the latest handleEnd without
  // re-binding sendMessage on every render (avatar auto-finish path).
  const handleEndRef = useRef<((title?: string) => Promise<void>) | null>(null);
  const sendMessageRef = useRef<
    ((candidateMessage: string, forceWalkOutFarewell?: boolean) => Promise<void>) | null
  >(null);
  const [avatarEndedNotice, setAvatarEndedNotice] = useState(false);

  const stageLabel = useMemo(
    () =>
      progress.stage === "role_specific"
        ? "Role focus"
        : progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1),
    [progress.stage]
  );

  const appendMessage = useCallback(
    (message: { role: ChatMessage["role"]; content: string }) => {
      const stamped: ChatMessage = { ...message, timestamp: Date.now() };
      messagesRef.current = [...messagesRef.current, stamped];
      setMessages(messagesRef.current);
    },
    []
  );

  // The row is created on the FIRST REAL TURN, not on mount — sessions where
  // the avatar never connected or the student bailed instantly leave no row
  // behind. Only `checkpoint()` may call this; no exit path may.
  // Set when the server downgrades a camera-ON request to OFF (missing
  // consent). Blocks any later capture start so the running session and the
  // stored report can never disagree about whether the camera was on.
  const serverForcedCameraOffRef = useRef(false);
  // Set SYNCHRONOUSLY before requesting the camera. `visualCaptureRef` is only
  // assigned after an await, so it cannot guard against a second CONNECTED
  // event arriving mid-request — both would pass the check and acquire their
  // own stream, and only the last one would be reachable for teardown.
  const visualStartingRef = useRef(false);

  const ensureReport = useCallback(async (): Promise<string | null> => {
    if (reportIdRef.current) return reportIdRef.current;
    if (startingRef.current) return null;
    startingRef.current = true;
    try {
      const res = await fetch("/api/practice/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeSlug: sessionConfig.typeSlug,
          instanceId:
            sessionConfig.instance.kind === "case-study"
              ? sessionConfig.instance.caseId
              : undefined,
          customization,
          interviewerAvatarId,
          interviewerName,
          resumeId,
          resumeText,
          // REQ-35: without this the server sees `undefined`, falls back to
          // "OFF", and the report records a deliberate opt-out that never
          // happened — even while capture is running and the banner is live.
          cameraMode,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      reportIdRef.current = data.reportId ?? null;

      // Honor the server's RESOLVED camera mode. If it downgraded us to OFF
      // (missing consent), stop capturing and say so, rather than letting the
      // session look measured while the report says otherwise.
      if (data.cameraMode === "OFF" && cameraMode === "ON") {
        serverForcedCameraOffRef.current = true;
        releaseVisualCapture();
        addToast({
          title: "Camera analysis is off for this session",
          description:
            "We couldn't confirm your consent to video analysis, so Visual won't be scored. You can turn it on in Settings before your next session.",
          color: "warning",
        });
      }

      return reportIdRef.current;
    } catch {
      return null;
    } finally {
      startingRef.current = false;
    }
  }, [
    sessionConfig.typeSlug,
    sessionConfig.instance,
    customization,
    interviewerAvatarId,
    interviewerName,
    resumeId,
    resumeText,
    cameraMode,
  ]);

  const checkpoint = useCallback(
    (nextProgress: InterviewProgress) => {
      // Type-declared checkpointing (REQ-69): types with checkpointing:"none"
      // must issue ZERO checkpoint calls — do not invent an unconditional one.
      if (checkpointing !== "client-driven") return;
      void (async () => {
        const reportId = await ensureReport();
        if (!reportId) return;
        try {
          const extra = extraChatBodyRef.current;
          await fetch("/api/practice/session/checkpoint", {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reportId,
              turns: messagesRef.current,
              progress: nextProgress,
              ...(extra && "revealedSlideIndex" in extra
                ? { revealedSlideIndex: extra.revealedSlideIndex }
                : {}),
            }),
          });
        } catch {
          // Intentionally silent. A dropped checkpoint costs at most one
          // exchange and must never interrupt the interview or alarm the
          // student.
        }
      })();
    },
    [checkpointing, ensureReport]
  );

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

  useEffect(() => {
    return () => {
      if (walkOutFinishTimerRef.current != null) {
        clearTimeout(walkOutFinishTimerRef.current);
      }
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
    };
  }, [releaseMicrophone, releaseVisualCapture]);

  // The provider reaps idle sessions, and nothing else in the app pings it —
  // `keepAlive` existed on the session hook but had no callers, so a session
  // died well short of the 20-minute interview target. Ping while connected and
  // unpaused; a paused session is deliberately being abandoned or resumed soon,
  // and a failed ping is not worth interrupting the interview over.
  useEffect(() => {
    if (!avatarReady || isPaused) return;
    const interval = window.setInterval(() => {
      void avatarRef.current?.keepAlive().catch(() => {});
    }, KEEP_ALIVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [avatarReady, isPaused]);

  // Depends on `avatarReady`, not just `isPaused`: `startedAtRef` is a ref, so
  // setting it in `startOpening` does not re-run this effect. `avatarReady` flips
  // in the same CONNECTED handler that starts the session, giving the effect a
  // real dependency to react to — without it the interval is never created and
  // the elapsed clock sits at 0:00 for the whole interview.
  useEffect(() => {
    if (!startedAtRef.current || isPaused) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current!) / 1000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [isPaused, avatarReady]);

  // Keeps the visual engine's conversational window locked to the recorder.
  //
  // Deliberately an effect on `isRecording` rather than a call beside each
  // `setIsRecording`: there are several of those (manual stop, the toggle, the
  // error paths), and hand-wiring each is precisely how the visual window
  // would eventually drift away from the vocal pipeline's turn accounting.
  // Driving it from the state itself makes them impossible to
  // disagree. Safe before capture exists — the ref is simply null then, and
  // the engine defaults to "not speaking".
  useEffect(() => {
    isRecordingRef.current = isRecording;
    visualCaptureRef.current?.setSpeaking(isRecording);
  }, [isRecording]);

  const sendMessage = useCallback(
    async (candidateMessage: string, forceWalkOutFarewell = false) => {
      const content = candidateMessage.trim();
      if (
        (!content && !forceWalkOutFarewell) ||
        sending ||
        isPaused ||
        (walkOutLockRef.current && !forceWalkOutFarewell)
      ) {
        return;
      }

      const userMessage = { role: "user" as const, content };
      const messageHistory = forceWalkOutFarewell
        ? messagesRef.current
        : [
            ...messagesRef.current,
            { ...userMessage, timestamp: Date.now() },
          ];
      if (!forceWalkOutFarewell) {
        markOpeningTurnStarted();
      }
      // Capture before deliver — short discovery clears the ref so the timer
      // can restart, but this chat turn still needs the start timestamp.
      const firstTurnStartedAtForPayload = openingTurnStartedAtRef.current;
      if (!forceWalkOutFarewell) {
        appendMessage(userMessage);
      }
      // While still pitching, decide whether THIS turn was the pitch (voice
      // duration / substantial typed text) or just discovery — do not freeze
      // the 60s window on a 4-second intro.
      const pitchWindowConcluded = forceWalkOutFarewell
        ? true
        : openingTurnPhase === "followups"
          ? true
          : markOpeningTurnDelivered(content);
      setInput("");
      setSending(true);
      setStreamingText("");

      try {
        const response = await fetch("/api/interaction/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messageHistory
              .slice(-HISTORY_TURNS * 2)
              .map(({ role, content: messageContent }) => ({
                role,
                content: messageContent,
              })),
            language,
            engine: {
              typeSlug: sessionConfig.typeSlug,
              instance:
                sessionConfig.instance.kind === "none"
                  ? undefined
                  : sessionConfig.instance,
              // REQ-23: resent unchanged on every turn, never re-derived or
              // mutated here. The server re-resolves this identically each
              // time, and byte-stability is what keeps the assembled system
              // prompt session-constant for the OpenAI prefix cache.
              customization,
              resumeText,
              turnState: {
                progress,
                startedAt: startedAtRef.current ?? Date.now(),
                firstTurnStartedAt: firstTurnStartedAtForPayload,
                firstTurnDelivered: pitchWindowConcluded,
                forceWalkOutFarewell,
                walkOutProof: walkOutProofRef.current,
              },
            },
            ...(extraChatBodyRef.current ?? {}),
          }),
        });

        if (!response.ok) throw new Error("The interviewer could not respond.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream was available.");

        const decoder = new TextDecoder();
        let buffer = "";
        let rawAnswer = "";
        let streamErrored = false;
        let walkOutMetadata: WalkOutMetadata | null = null;

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
                delta?: string;
                metadata?: WalkOutMetadata;
              };
              if (event.type === "content" && event.delta) {
                rawAnswer += event.delta;
              } else if (event.type === "end" && event.metadata) {
                walkOutMetadata = event.metadata;
              } else if (event.type === "error") {
                streamErrored = true;
              }
            } catch {
              // Ignore a malformed frame and continue reading the stream.
            }
          }
        }

        const assistantTurnCount =
          messageHistory.filter((message) => message.role === "assistant").length + 1;
        const parsedTurn = parseEngineTurn(rawAnswer, sessionConfig, {
          previousProgress: progress,
          hasResume: Boolean(resumeText.trim()),
          targetQuestionCount,
          assistantTurnCount,
          disengagementValue: walkOutMetadata?.disengagement?.value,
        });
        if (parsedTurn.malformed) {
          // Progress is entirely model-driven: no marker means no advance,
          // with no other symptom until someone notices the counter has not
          // moved all session. Log enough to tell WHICH failure it was.
          console.warn("[practice] turn-control marker unusable", {
            stage: progress.stage,
            questionsAsked: progress.questionsAsked,
            hasMarker: /<interview-turn\b/i.test(rawAnswer),
            tail: rawAnswer.slice(-120),
          });
        }
        if (streamErrored || !parsedTurn.cleanedText) {
          throw new Error("The interviewer response was interrupted.");
        }

        // Sending one complete, clean response to the provider avoids concurrent
        // sentence chunks being reordered or split around a comma. It also makes
        // it impossible for hidden controller metadata to reach the avatar.
        if (walkOutMetadata?.disengagement) {
          disengagementRef.current = walkOutMetadata.disengagement;
        }
        if (typeof walkOutMetadata?.walkOutProof === "string") {
          walkOutProofRef.current = walkOutMetadata.walkOutProof;
        }
        appendMessage({ role: "assistant", content: parsedTurn.cleanedText });
        const nextProgress = parsedTurn.progress ?? progress;
        setProgress(nextProgress);
        checkpoint(nextProgress);

        const acceptedTermination =
          walkOutMetadata?.termination ?? parsedTurn.termination;
        const isWalkOut = walkOutMetadata?.walkOutFinal === true;

        if (isWalkOut) {
          walkOutLockRef.current = true;
          setWalkOutLock(true);
          setAvatarEndedNotice(true);

          if (!acceptedTermination && !forcedFarewellRequestedRef.current) {
            // Do not speak a crossing reply that is not the final statement.
            // The one-shot follow-up keeps the avatar's audible close singular.
            forcedFarewellRequestedRef.current = true;
            window.setTimeout(() => {
              void sendMessageRef.current?.("", true);
            }, 0);
            return;
          }

          pendingTerminationRef.current = {
            reason: acceptedTermination?.reason ?? "lost_interest",
            source: "avatar",
          };
          setStreamingText(parsedTurn.cleanedText);
          avatarRef.current?.speak(parsedTurn.cleanedText);
          const words = parsedTurn.cleanedText
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
          const finalSpeechMs = Math.min(
            15_000,
            Math.max(1_500, words * 500 + 1_000),
          );
          walkOutFinishTimerRef.current = window.setTimeout(() => {
            void handleEndRef.current?.();
          }, finalSpeechMs);
          return;
        }

        setStreamingText(parsedTurn.cleanedText);
        avatarRef.current?.speak(parsedTurn.cleanedText);
        if (acceptedTermination) {
          pendingTerminationRef.current = {
            reason: acceptedTermination.reason,
            source: "avatar",
          };
          if (autoFinishOnAvatarEnd) {
            walkOutLockRef.current = true;
            setWalkOutLock(true);
            setAvatarEndedNotice(true);
            const words = parsedTurn.cleanedText
              .trim()
              .split(/\s+/)
              .filter(Boolean).length;
            const finalSpeechMs = Math.min(
              15_000,
              Math.max(1_500, words * 500 + 1_000),
            );
            walkOutFinishTimerRef.current = window.setTimeout(() => {
              void handleEndRef.current?.();
            }, finalSpeechMs);
          } else {
            setExitIntent("end");
          }
        }
      } catch (error) {
        console.error("Practice chat failed:", error);
        if (forceWalkOutFarewell) {
          // The forced request has one attempt only. Re-open the session rather
          // than trapping the student behind a failed network request.
          forcedFarewellRequestedRef.current = false;
          walkOutLockRef.current = false;
          setWalkOutLock(false);
          setAvatarEndedNotice(false);
        }
        if (!walkOutLockRef.current) {
          avatarRef.current?.interrupt();
        }
        addToast({
          title: "The interviewer lost the connection",
          description: "Your answer is still visible. Try sending it again.",
          color: "danger",
        });
      } finally {
        setStreamingText("");
        setSending(false);
      }
    },
    [
      appendMessage,
      checkpoint,
      sessionConfig,
      customization,
      isPaused,
      language,
      autoFinishOnAvatarEnd,
      markOpeningTurnDelivered,
      markOpeningTurnStarted,
      openingTurnPhase,
      progress,
      resumeText,
      sending,
      targetQuestionCount,
    ]
  );

  sendMessageRef.current = sendMessage;

  const startOpening = useCallback(() => {
    if (openingSentRef.current) return;
    openingSentRef.current = true;
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    // Soft first-turn window types (pitch-elevator): do NOT auto-send a
    // canned student line — that would consume the opening window before the
    // student speaks. The student begins when they record or type.
    if (sessionConfig.timeBudget.firstTurnWindowSeconds != null) {
      return;
    }
    void sendMessage("I’m ready to begin the interview.");
  }, [sendMessage, sessionConfig.timeBudget.firstTurnWindowSeconds]);

  const handleAvatarStateChange = useCallback(
    (state: StreamingAvatarSessionState) => {
      if (state === StreamingAvatarSessionState.CONNECTED) {
        setAvatarReady(true);
        startOpening();

        // Start capture AFTER the avatar has connected, never before — a
        // camera-on session must not delay the avatar handshake (REQ-49),
        // and MediaPipe's several-MB dynamic import would otherwise compete
        // with the WebRTC setup.
        if (
          cameraMode === "ON" &&
          !serverForcedCameraOffRef.current &&
          !visualCaptureRef.current &&
          !visualStartingRef.current
        ) {
          visualStartingRef.current = true;
          void (async () => {
            const result = await requestCameraStream();
            if (!result.ok) {
              // The wizard's own probe already succeeded — the camera was
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
              sessionStartedAtMs: startedAtRef.current ?? Date.now(),
              onFaceStateChange: (detected) => setFaceMissing(!detected),
            });
            visualCaptureRef.current = capture;
            // The recorder may already be live by the time capture starts;
            // adopt the current state rather than assuming silence.
            capture.setSpeaking(isRecordingRef.current);
            void capture.start();
          })();
        }
      }
    },
    [startOpening, cameraMode]
  );

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
      addToast({
        title: "Nothing recorded",
        description: "Tap the microphone, speak, then tap again to send.",
        color: "warning",
      });
      return;
    }
    if (peakRms > 0 && peakRms < MIN_PEAK_RMS) {
      addToast({
        title: "No speech detected",
        description: "Check that the right microphone is selected and not muted.",
        color: "warning",
      });
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
      formData.append("audio", audio, "interview-answer.webm");
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
      await sendMessage(transcript);
    } catch (error) {
      console.error("Interview transcription failed:", error);
      addToast({ title: "Could not transcribe your answer", color: "danger" });
    } finally {
      setPartialTranscript("");
      setIsTranscribing(false);
    }
  }, [language, sendMessage]);

  // The only path that records a typed turn (REQ-44): the push-to-talk
  // path submits its own spoken turn inside transcribeRecording and must
  // never also count as typed.
  const sendTypedMessage = useCallback(() => {
    if (walkOutLockRef.current || !input.trim()) return;
    vocalCaptureRef.current?.recordTypedTurn();
    void sendMessage(input);
  }, [input, sendMessage]);

  const startRecording = useCallback(async () => {
    if (
      sending ||
      isTranscribing ||
      isPaused ||
      walkOutLockRef.current ||
      recordingStartInFlightRef.current ||
      mediaRecorderRef.current?.state === "recording"
    ) {
      return;
    }
    recordingStartInFlightRef.current = true;
    try {
      const stream = await getMicrophone();
      if (sending || isTranscribing || isPaused || walkOutLockRef.current) {
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
      // Do not cut off the interviewer until a valid recording start has been
      // claimed. A rejected microphone permission should leave speech alone.
      avatarRef.current?.interrupt();
      startMetering(stream);
      recorder.start();
      markOpeningTurnStarted();
      // Deliberately uncapped. A 45-second ceiling used to force-submit the
      // turn mid-sentence, with the toast arriving only AFTER the cut. None of
      // the real limits bind anywhere near it — OpenAI's 25MB file cap is
      // ~100 minutes of Opus, and the transcription call's own timeout is the
      // practical wall. An answer that runs long is a conciseness finding the
      // report can make from `VocalTurnMetrics.duration_s`; truncating it
      // teaches the student nothing about why.
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone unavailable:", error);
      addToast({
        title: "Could not access your microphone",
        description: "You can type your answer instead.",
        color: "danger",
      });
    } finally {
      recordingStartInFlightRef.current = false;
    }
  }, [getMicrophone, isPaused, isTranscribing, markOpeningTurnStarted, sending, startMetering, stopMetering, transcribeRecording]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.stop();
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (walkOutLockRef.current) return;
    if (mediaRecorderRef.current?.state === "recording") {
      stopRecording();
      return;
    }
    void startRecording();
  }, [startRecording, stopRecording]);

  const answeredCount = Math.max(
    0,
    messagesRef.current.filter((message) => message.role === "user").length - 1
  );

  const handleLeave = () => {
    if (walkOutLockRef.current) return;
    releaseMicrophone();
    releaseVisualCapture();
    vocalCaptureRef.current?.detachStream();
    avatarRef.current?.stopSession();
    onExit();
  };

  const handleEnd = async (titleOverride?: string) => {
    // A normal student end interrupts immediately. The walk-out timer calls this
    // only after the final line's bounded speaking window, so never cut it off.
    if (!walkOutLockRef.current) {
      avatarRef.current?.interrupt();
    }
    // A null reportId has two very different causes, and conflating them
    // silently discards real interviews:
    //   1. Nothing was ever said — the student connected and pressed End
    //      immediately. No row should exist; creating one here would leave an
    //      orphan IN_PROGRESS record the finish endpoint would reject anyway.
    //   2. The row was never created because ensureReport() failed earlier
    //      (a transient error, or checkpoint never got to run). The interview
    //      DID happen and the student is owed a report.
    // Only case 1 is a leave. Case 2 creates the row now — it is not an orphan,
    // there is a transcript behind it.
    let reportId = reportIdRef.current;
    if (!reportId) {
      const hasRealTurns = messagesRef.current.some(
        (message) => message.role === "assistant"
      );
      if (!hasRealTurns) {
        setExitIntent(null);
        handleLeave();
        return;
      }
      setSubmitting(true);
      reportId = await ensureReport();
      if (!reportId) {
        addToast({
          title: "We couldn't save this interview",
          description:
            "Your answers are still on screen. Try ending again in a moment.",
          color: "danger",
        });
        setSubmitting(false);
        setExitIntent(null);
        return;
      }
    }
    setSubmitting(true);
    // Stop/drain BEFORE the finish fetch so the metrics field rides in the
    // same request. Both stop() and drain() are awaited and bounded by
    // design (lib/metrics/visual-capture.ts, lib/metrics/vocal-capture.ts) —
    // the existing in-flight spinner (submitting) already covers this wait so
    // End does not look frozen. Neither throws by its own contract, but a
    // defensive catch keeps a truly unexpected failure from losing the
    // interview.
    let visual: VisualMetrics | null = null;
    let vocal: VocalMetrics | null = null;
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
    try {
      vocal = (await vocalCaptureRef.current?.drain()) ?? null;
    } catch {
      vocal = null;
    }
    try {
      const res = await fetch("/api/practice/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          turns: messagesRef.current,
          progress,
          metrics: { cameraMode, visual, vocal },
          terminationReason: pendingTerminationRef.current?.reason ?? null,
          terminationSource: pendingTerminationRef.current?.source ?? "student",
          terminationAtSeconds:
            pendingTerminationRef.current?.source === "avatar"
              ? elapsedSeconds
              : null,
          walkOutProof: walkOutProofRef.current,
          title:
            typeof titleOverride === "string"
              ? titleOverride
              : reportTitleDraft,
        }),
      });
      // 409 means it was already submitted — still the right destination.
      if (!res.ok && res.status !== 409) throw new Error("finish-failed");
      // The avatar session is stopped only AFTER the finish call succeeds, so
      // a failed submit leaves the student in a live, retryable interview
      // rather than a dead one.
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
      onFinish(reportId);
    } catch {
      // The automatic finish can fail independently of the completed final
      // statement. Restore controls so the student can retry submission; the
      // pending avatar termination and signed proof remain intact.
      if (walkOutLockRef.current) {
        walkOutLockRef.current = false;
        setWalkOutLock(false);
      }
      addToast({
        title: "We couldn't end the interview",
        description: "Your transcript is safe. Try ending again in a moment.",
        color: "danger",
      });
      setSubmitting(false);
      setExitIntent(null);
    }
  };

  handleEndRef.current = handleEnd;

  useEffect(() => {
    if (!sessionFinishRef) return;
    sessionFinishRef.current = async (opts) => {
      pendingTerminationRef.current = opts;
      await handleEndRef.current?.();
    };
    return () => {
      sessionFinishRef.current = null;
    };
  }, [sessionFinishRef]);

  return (
    <main className="relative flex h-[100dvh] overflow-hidden bg-[#07131f] text-[#f4f8fb]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(83,169,222,0.20),transparent_28%),radial-gradient(circle_at_90%_95%,rgba(13,113,142,0.18),transparent_32%)]" />
      <section className="relative flex h-full flex-1 flex-col lg:w-[64%]">
        <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-4 sm:px-7">
          <Button
            isIconOnly
            aria-label="Leave interview"
            variant="light"
            className="bg-[#07131f]/65 text-white backdrop-blur-md"
            isDisabled={walkOutLock}
            onPress={() => {
              if (!walkOutLockRef.current) setExitIntent("leave");
            }}
          >
            <ChevronLeft size={20} />
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#07131f]/65 px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-[#d3e7f5] backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#72d6b0]" />
            LIVE INTERVIEW
          </div>
          {sessionPanel && mediaLayout !== "deck-primary" ? (
            // Top-right of the avatar pane by default — keeps the face clear.
            // Pitch-deck deck-primary mounts the panel as the stage instead.
            <div
              className={
                sessionPanelClassName ??
                "pointer-events-auto absolute right-3 top-[4.25rem] z-30 max-w-[min(100%-1.5rem,22rem)] sm:right-5 sm:top-[4.75rem]"
              }
            >
              {sessionPanel}
            </div>
          ) : null}
          {!hideDefaultEndControl ? (
          <Tooltip content="End the interview">
            <Button
              isIconOnly
              aria-label="End interview"
              variant="light"
              className="bg-[#07131f]/65 text-white backdrop-blur-md"
              isDisabled={walkOutLock}
              onPress={() => {
                if (walkOutLockRef.current) return;
                if (defaultStudentEndReason) {
                  pendingTerminationRef.current = {
                    reason: defaultStudentEndReason,
                    source: "student",
                  };
                }
                setExitIntent("end");
              }}
            >
              <CircleStop size={20} />
            </Button>
          </Tooltip>
          ) : (
            <div className="h-10 w-10" aria-hidden />
          )}
        </header>

        {mediaLayout === "deck-primary" ? (
          <>
            {/* Slides own the stage; avatar is a corner PiP like self-view. */}
            <div className="absolute inset-0 bg-[#041018]" aria-hidden />
            {sessionPanel ? (
              <div
                className={
                  sessionPanelClassName ??
                  "pointer-events-auto absolute inset-0 z-10 flex flex-col"
                }
              >
                {sessionPanel}
              </div>
            ) : null}
            <div
              className="absolute bottom-4 left-4 z-20 h-[132px] w-44 overflow-hidden rounded-2xl border border-white/20 bg-black/80 shadow-xl sm:h-[150px] sm:w-52"
              aria-label={
                interviewerName
                  ? `Live video of ${interviewerName}`
                  : "Live investor video"
              }
            >
              <InteractiveAvatarWrapper
                ref={avatarRef}
                config={avatarConfig}
                showHistory={false}
                autoStart
                cleanMode
                onSessionStateChange={handleAvatarStateChange}
              />
              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                {interviewerName.trim() || "Investor"}
              </span>
            </div>
            <SelfViewThumbnail stream={cameraStream} />
          </>
        ) : (
          <>
            <div className="absolute inset-0">
              <InteractiveAvatarWrapper
                ref={avatarRef}
                config={avatarConfig}
                showHistory={false}
                autoStart
                cleanMode
                onSessionStateChange={handleAvatarStateChange}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#07131f] via-[#07131f]/45 to-transparent" />

            {/* Self-view sits in the bottom-right of the AVATAR panel, the usual
                video-call convention, rather than against the viewport edge where
                it reserved an empty column beside the transcript. */}
            <SelfViewThumbnail stream={cameraStream} />
          </>
        )}
        <div className="relative z-10 mt-auto px-5 pb-6 pt-36 sm:px-8 lg:hidden">
          <InterviewStatus
            interviewerName={interviewerName}
            stageLabel={stageLabel}
            elapsedSeconds={elapsedSeconds}
            avatarReady={avatarReady}
          />
        </div>
      </section>

      <aside className="relative z-10 flex h-full w-full max-w-[570px] flex-col border-l border-white/10 bg-[#0b1c2a]/95 lg:w-[36%]">
        <div className="hidden px-8 pb-5 pt-7 lg:block">
          <InterviewStatus
            interviewerName={interviewerName}
            stageLabel={stageLabel}
            elapsedSeconds={elapsedSeconds}
            avatarReady={avatarReady}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 sm:px-8">
          <div className="flex items-center justify-between border-y border-white/10 py-3 text-xs text-[#a9c5d6]">
            <span>{progress.questionsAsked} of ~{targetQuestionCount} questions</span>
            <span>{resumeFileName ? "Resume in context" : "Behavioral focus"}</span>
          </div>

          <div aria-live="polite" className="min-h-0 flex-1 space-y-5 overflow-y-auto py-6 pr-1">
            {!messages.length && !streamingText && (
              <div className="flex h-full min-h-44 flex-col items-center justify-center text-center text-[#abc5d5]">
                <Spinner color="primary" size="sm" />
                <p className="mt-4 text-sm">{avatarReady ? "Your interviewer is preparing the first question." : "Establishing a secure live connection."}</p>
              </div>
            )}
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={
                  message.role === "assistant"
                    ? "max-w-[94%]"
                    : "ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-[#1d4f69] px-4 py-3 text-sm leading-6 text-white"
                }
              >
                {message.role === "assistant" && (
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#73cee5]">
                    <Sparkles size={13} /> {interviewerName}
                  </div>
                )}
                <p className={message.role === "assistant" ? "text-[15px] leading-7 text-[#edf6fb]" : ""}>{message.content}</p>
              </article>
            ))}
            {streamingText && (
              <article className="max-w-[94%]">
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#73cee5]">
                  <Volume2 size={13} className="animate-pulse" /> {interviewerName}
                </div>
                <p className="text-[15px] leading-7 text-[#edf6fb]">{streamingText}</p>
              </article>
            )}
            {partialTranscript && (
              <article className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm border border-[#4782a0] bg-[#153e54] px-4 py-3 text-sm leading-6 text-[#dcedf5]">
                {partialTranscript}
              </article>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#091925] px-5 py-5 sm:px-8">
          {isPaused ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#37647a] bg-[#102a3a] p-3">
              <div className="text-sm text-[#d8edf6]">Your session is paused. The interviewer cannot hear you.</div>
              <Button size="sm" color="primary" onPress={() => setIsPaused(false)}>Resume</Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <label htmlFor="interview-answer" className="sr-only">Your interview answer</label>
                <textarea
                  id="interview-answer"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendTypedMessage();
                    }
                  }}
                  disabled={
                    walkOutLock || sending || isTranscribing || !avatarReady
                  }
                  rows={2}
                  placeholder={avatarReady ? "Type your answer, or tap the mic to record…" : "Connecting to your interviewer…"}
                  className="min-h-14 flex-1 resize-none rounded-xl border border-white/15 bg-[#102a3a] px-3 py-3 text-sm text-white outline-none placeholder:text-[#89aabd] focus:border-[#71c9e7] focus:ring-2 focus:ring-[#71c9e7]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Button
                  isIconOnly
                  aria-label="Send answer"
                  color="primary"
                  isLoading={sending}
                  isDisabled={
                    walkOutLock ||
                    !input.trim() ||
                    sending ||
                    isTranscribing ||
                    !avatarReady
                  }
                  className="h-14 w-14 self-end"
                  onPress={sendTypedMessage}
                >
                  <SendHorizontal size={19} />
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant={isRecording ? "solid" : "flat"}
                  color={isRecording ? "danger" : "default"}
                  className="font-medium text-[#d7eaf3]"
                  isDisabled={
                    walkOutLock || sending || isTranscribing || !avatarReady
                  }
                  onPress={toggleRecording}
                  aria-label={isRecording ? "Stop recording and send answer" : "Start recording answer"}
                  startContent={isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                >
                  {isTranscribing ? "Transcribing…" : isRecording ? "Tap again to send" : "Tap to record"}
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className="text-[#afcad9]"
                  startContent={<Pause size={14} />}
                  isDisabled={walkOutLock}
                  onPress={() => {
                    if (!walkOutLockRef.current) setIsPaused(true);
                  }}
                >
                  Pause
                </Button>
              </div>
            </>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-[#82a5b8]">
            <FileText size={13} /> Your resume is used only to personalize this practice interview.
          </p>
        </div>
      </aside>

      {avatarEndedNotice ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-20 z-40 flex justify-center px-4"
          role="status"
        >
          <p className="rounded-full border border-white/15 bg-[#07131f]/80 px-4 py-2 text-sm text-[#d3e7f5] backdrop-blur-md">
            The conversation ended.
          </p>
        </div>
      ) : null}

      <Modal
        isOpen={exitIntent !== null}
        onClose={() => !submitting && setExitIntent(null)}
      >
        <ModalContent>
          {exitIntent === "end" ? (
            <>
              <ModalHeader>End session and generate your report?</ModalHeader>
              <ModalBody>
                <p>
                  You can&apos;t resume after this. We&apos;ll review the
                  session and your report will be ready in under a minute.
                </p>
                <Input
                  label="Name this report"
                  description="Shown in My Reports with the date and time. Leave blank to use an automatic name."
                  value={reportTitleDraft}
                  onValueChange={setReportTitleDraft}
                  maxLength={120}
                  classNames={{ inputWrapper: "bg-default-100" }}
                />
                {answeredCount < SHORT_INTERVIEW_ANSWERS && (
                  <p className="text-[#b4540f]">
                    You&apos;ve only answered {answeredCount} question
                    {answeredCount === 1 ? "" : "s"} — your report will be
                    limited.
                  </p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  isDisabled={submitting}
                  onPress={() => setExitIntent(null)}
                >
                  Keep going
                </Button>
                <Button
                  color="primary"
                  isLoading={submitting}
                  onPress={() => void handleEnd(reportTitleDraft)}
                >
                  End and get my report
                </Button>
              </ModalFooter>
            </>
          ) : (
            <>
              <ModalHeader>Leave without a report?</ModalHeader>
              <ModalBody>
                <p>
                  Leaving now ends this session without generating a report.
                  Nothing you&apos;ve said will be evaluated.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => setExitIntent(null)}>
                  Keep going
                </Button>
                <Button color="danger" onPress={handleLeave}>
                  Leave without a report
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <FaceDetectionBanner visible={cameraMode === "ON" && faceMissing} />
    </main>
  );
}

function InterviewStatus({
  interviewerName,
  stageLabel,
  elapsedSeconds,
  avatarReady,
}: {
  interviewerName: string;
  stageLabel: string;
  elapsedSeconds: number;
  avatarReady: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#75cce4]">Leadership Avatar practice</p>
        <h1 className="mt-1 font-serif text-2xl tracking-[-0.02em] text-white">Interview with {interviewerName}</h1>
        <p className="mt-1.5 text-sm text-[#a7c2d2]">{avatarReady ? `${stageLabel} stage` : "Connecting securely"}</p>
      </div>
      <Chip size="sm" variant="flat" className="border border-[#31596d] bg-[#102b3a] text-[#bfe5f2]">
        {formatElapsed(elapsedSeconds)}
      </Chip>
    </div>
  );
}
