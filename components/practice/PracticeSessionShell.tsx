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
  Pause,
  SendHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { InteractiveAvatarRef } from "@/components/HeyGenAvatar/InteractiveAvatar";
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
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import { SelfViewThumbnail } from "@/components/session/SelfViewThumbnail";
import { FaceDetectionBanner } from "@/components/session/FaceDetectionBanner";
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
import { usePushToTalkRecorder } from "@/components/session/usePushToTalkRecorder";
import {
  useSyncVisualSpeaking,
  useVisualCapture,
} from "@/components/session/useVisualCapture";
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
  /** Server declined the one-shot forced farewell this turn asked for
   * (proof missing/invalid, or an end-of-turn metadata computation failed).
   * See debug: elevator-walkout-dead-end. */
  walkOutFarewellDeclined?: boolean;
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
  /** Optional type-composed guidance rendered below the answer controls. */
  answerControlsSupplement?: ReactNode;
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
// MIN_RECORDING_MS / MIN_AUDIO_BYTES / MIN_PEAK_RMS, KEEP_ALIVE_INTERVAL_MS
// and formatElapsed moved verbatim to the shared session chrome
// (components/session/, 22-SHARED-SHELL-DECISION.md).
// Answers, not turns. Below this the report will be thin, and the evaluator
// prompt explicitly handles a too-short transcript — so warn, do not block.
const SHORT_INTERVIEW_ANSWERS = 3;

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
  answerControlsSupplement,
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
  // Phase 10 metrics capture (REQ-35/43/49), via the shared session chrome.
  // The camera stream and visual engine stay null for the entire session when
  // cameraMode is "OFF" — the self-view and banner both render nothing then.
  const {
    cameraStream,
    faceMissing,
    startVisualCapture,
    stopVisualCapture,
    releaseVisualCapture,
    syncSpeaking,
  } = useVisualCapture();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState<InterviewProgress>(initialProgress);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const [responseWaitSeconds, setResponseWaitSeconds] = useState(0);
  const [sending, setSending] = useState(false);
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
  /** Set on unmount so a resolved farewell wait cannot finish a dead session. */
  const walkOutFinishCancelledRef = useRef(false);
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

  /**
   * Ends the session once the farewell has actually finished playing.
   *
   * REQ-82 requires the final statement to complete before auto-finish, but the
   * avatar is the only thing that knows when it stopped talking. A word-count
   * estimate (the previous `words * 500ms`, capped at 15s) overshot real speech
   * badly enough to look hung, so this waits on the avatar speech-ended signal
   * and keeps a bounded ceiling only for a dropped event.
   */
  const finishAfterFarewell = useCallback((farewellText: string) => {
    const words = farewellText.trim().split(/\s+/).filter(Boolean).length;
    const ceilingMs = Math.min(20_000, Math.max(3_000, words * 600 + 2_000));
    const avatar = avatarRef.current;

    if (!avatar) {
      // The avatar never mounted, so there is no speech to wait on.
      void handleEndRef.current?.();

      return;
    }

    void avatar.waitForSpeechEnd(ceilingMs).then(() => {
      if (walkOutFinishCancelledRef.current) return;
      void handleEndRef.current?.();
    });
  }, []);
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
  // The synchronous double-CONNECTED guard (`visualStartingRef`) moved with
  // the capture block into `useVisualCapture`.

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

  // Vocal capture, the microphone release and the visual-capture release now
  // live in the shared session hooks (`usePushToTalkRecorder`,
  // `useVisualCapture`). The unmount cleanup effect that calls them is
  // declared right after the recorder hook below.

  // The provider reaps idle sessions; ping while connected and unpaused (the
  // shared `useAvatarKeepAlive`, moved verbatim from here).
  useAvatarKeepAlive(avatarRef, avatarReady && !isPaused);

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

  // Begins immediately after a valid answer is submitted and clears when the
  // completed response renders, as well as on every stream completion/error
  // path. An elapsed time communicates that work is still in progress without
  // implying a response-time estimate.
  useEffect(() => {
    if (!isAwaitingResponse) {
      setResponseWaitSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setResponseWaitSeconds(0);
    const interval = window.setInterval(() => {
      setResponseWaitSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [isAwaitingResponse]);

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
      setIsAwaitingResponse(true);

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
        // This shell buffers transport streaming until the clean, marker-free
        // response can render. Clear the wait indicator at that visible handoff,
        // rather than at the first byte the learner cannot yet see.
        setIsAwaitingResponse(false);
        const nextProgress = parsedTurn.progress ?? progress;
        setProgress(nextProgress);
        checkpoint(nextProgress);

        const acceptedTermination =
          walkOutMetadata?.termination ?? parsedTurn.termination;
        const isWalkOut = walkOutMetadata?.walkOutFinal === true;

        // This request IS the one-shot forced farewell whenever
        // `forceWalkOutFarewell` is true — the only caller of this branch is
        // the self-retry below. Enter the terminal block even if the server
        // declined the directive (missing/invalid proof) or dropped its
        // metadata outright: the crossing it would be honouring was already
        // server-verified on the FIRST request, which is what set
        // `walkOutLockRef.current` in the first place. Falling through to
        // the ordinary reply path here is exactly how a locked session was
        // left with no exit (debug: elevator-walkout-dead-end) — trapping
        // the student is strictly worse than an imperfect ending.
        if (isWalkOut || forceWalkOutFarewell) {
          walkOutLockRef.current = true;
          setWalkOutLock(true);
          setAvatarEndedNotice(true);

          if (
            !acceptedTermination &&
            !forceWalkOutFarewell &&
            !forcedFarewellRequestedRef.current
          ) {
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
          // A declined or dropped forced farewell can still carry an
          // unrelated reply (or none at all) — never speak dead air, and
          // never let an empty string leave the avatar silent with the
          // session still finishing.
          const farewellText =
            parsedTurn.cleanedText && parsedTurn.cleanedText.trim().length > 0
              ? parsedTurn.cleanedText
              : "Thanks for the conversation — I need to step away.";
          setStreamingText(farewellText);
          avatarRef.current?.speak(farewellText);
          finishAfterFarewell(farewellText);
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
            finishAfterFarewell(parsedTurn.cleanedText);
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
        setIsAwaitingResponse(false);
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

  // The recorder hands its transcript to the chat turn. A wrapper, not
  // `sendMessage` itself: the hook also passes the recording length, which
  // must never land in `sendMessage`'s `forceWalkOutFarewell` slot.
  const sendTranscript = useCallback(
    (transcript: string) => sendMessage(transcript),
    [sendMessage]
  );

  // Shared push-to-talk recorder (components/session/usePushToTalkRecorder),
  // moved verbatim from this shell. The gates and toasts below are exactly
  // the ones `startRecording` / `transcribeRecording` used inline.
  const {
    isRecording,
    isTranscribing,
    partialTranscript,
    startRecording,
    stopRecording,
    toggleRecording,
    releaseMicrophone,
    vocalCaptureRef,
  } = usePushToTalkRecorder({
    language,
    sending,
    isPaused,
    lockRef: walkOutLockRef,
    onTranscript: sendTranscript,
    onRecordingStarted: markOpeningTurnStarted,
    // Do not cut off the interviewer until a valid recording start has been
    // claimed. A rejected microphone permission should leave speech alone.
    onRecordingClaimed: () => avatarRef.current?.interrupt(),
    onRejected: (reason) => {
      if (reason === "too-short") {
        addToast({
          title: "Nothing recorded",
          description: "Tap the microphone, speak, then tap again to send.",
          color: "warning",
        });
        return;
      }
      addToast({
        title: "No speech detected",
        description: "Check that the right microphone is selected and not muted.",
        color: "warning",
      });
    },
    onTranscriptionFailed: (error) => {
      console.error("Interview transcription failed:", error);
      addToast({ title: "Could not transcribe your answer", color: "danger" });
    },
    onMicrophoneUnavailable: (error) => {
      console.error("Microphone unavailable:", error);
      addToast({
        title: "Could not access your microphone",
        description: "You can type your answer instead.",
        color: "danger",
      });
    },
  });

  useEffect(() => {
    return () => {
      walkOutFinishCancelledRef.current = true;
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
    };
  }, [releaseMicrophone, releaseVisualCapture, vocalCaptureRef]);

  // Keeps the visual engine's conversational window locked to the recorder —
  // an effect on `isRecording` itself, so the two can never disagree.
  useSyncVisualSpeaking(syncSpeaking, isRecording);

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
        // The capture block itself (camera request, the double-CONNECTED
        // guard, face detection, adopting the recorder's current window)
        // moved verbatim into the shared `useVisualCapture`.
        if (cameraMode === "ON" && !serverForcedCameraOffRef.current) {
          startVisualCapture(() => startedAtRef.current ?? Date.now());
        }
      }
    },
    [startOpening, cameraMode, startVisualCapture]
  );

  // The only path that records a typed turn (REQ-44): the push-to-talk
  // path submits its own spoken turn inside transcribeRecording and must
  // never also count as typed.
  const sendTypedMessage = useCallback(() => {
    if (walkOutLockRef.current || !input.trim()) return;
    vocalCaptureRef.current?.recordTypedTurn();
    void sendMessage(input);
  }, [input, sendMessage]);


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
    // `stopVisualCapture` is the shared hook's verbatim copy of the old
    // inline stop: never throws, and nulls the handle so the later
    // releaseVisualCapture() call (post-finish cleanup) cannot double-stop.
    const visual: VisualMetrics | null = await stopVisualCapture();
    let vocal: VocalMetrics | null = null;
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
    <SessionRoom>
      <SessionStagePane>
        <SessionStageHeader>
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
          <SessionLiveBadge label="LIVE INTERVIEW" />
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
        </SessionStageHeader>

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
              <SessionAvatar
                ref={avatarRef}
                config={avatarConfig}
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
              <SessionAvatar
                ref={avatarRef}
                config={avatarConfig}
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
      </SessionStagePane>

      <SessionSidePane>
        <div className="hidden px-8 pb-5 pt-7 lg:block">
          <InterviewStatus
            interviewerName={interviewerName}
            stageLabel={stageLabel}
            elapsedSeconds={elapsedSeconds}
            avatarReady={avatarReady}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 sm:px-8">
          <div className="border-y border-white/10 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#73cee5]">
              Practice flow
            </p>
            <p className="mt-1 text-xs leading-5 text-[#c4dbe7]">
              Background, behavioral stories, and role-specific discussion. You&apos;ll have time to ask your questions at the end.
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-[#a9c5d6]">
              <span>{progress.questionsAsked} of ~{targetQuestionCount} questions</span>
              <span>{resumeFileName ? "Resume in context" : "Behavioral focus"}</span>
            </div>
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
          {isAwaitingResponse && !isPaused ? (
            <div
              role="status"
              className="flex items-center gap-2 pb-4 text-sm text-[#b9d5e4]"
            >
              <Spinner color="primary" size="sm" aria-hidden="true" />
              <span>Waiting for a response</span>
              <span aria-hidden="true">· {formatElapsed(responseWaitSeconds)}</span>
            </div>
          ) : null}
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
                <PushToTalkControl
                  isRecording={isRecording}
                  isTranscribing={isTranscribing}
                  isDisabled={
                    walkOutLock || sending || isTranscribing || !avatarReady
                  }
                  onToggle={toggleRecording}
                />
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
          {answerControlsSupplement}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-4 text-[#82a5b8]">
            <FileText size={13} /> Your resume is used only to personalize this practice interview.
          </p>
        </div>
      </SessionSidePane>

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
    </SessionRoom>
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
  // The status header is the shared `SessionStatus`; these are the practice
  // room's own strings, unchanged.
  return (
    <SessionStatus
      eyebrow="Leadership Avatar practice"
      title={<>Interview with {interviewerName}</>}
      subtitle={avatarReady ? `${stageLabel} stage` : "Connecting securely"}
      elapsedSeconds={elapsedSeconds}
    />
  );
}
