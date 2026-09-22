"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
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
  ArrowUp,
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
import { extractSpeakable } from "@/lib/interview/speakable";
import {
  BEHAVIORAL_CATEGORIES,
  initialProgress,
  type InterviewProgress,
  type InterviewType,
} from "@/lib/interview/types";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import {
  createVisualCapture,
  requestCameraStream,
  type VisualCaptureHandle,
} from "@/lib/metrics/visual-capture";
import { createVocalCapture, type VocalCaptureHandle } from "@/lib/metrics/vocal-capture";
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import { SelfViewThumbnail } from "@/components/metrics/SelfViewThumbnail";
import { FaceDetectionBanner } from "@/components/metrics/FaceDetectionBanner";
import type { StartAvatarRequest } from "@/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

interface InterviewSessionShellProps {
  interviewType: InterviewType;
  /**
   * The raw picker input, resent VERBATIM on session start and every chat
   * turn (REQ-23). Never re-derived, mutated, or re-resolved here — the
   * server re-resolves it identically each time, and byte-stability is what
   * keeps the OpenAI prefix cache hitting turn to turn.
   */
  customization?: InterviewCustomizationInput | null;
  interviewerName: string;
  interviewerAvatarId: string;
  avatarConfig: StartAvatarRequest;
  /**
   * The camera-mode decision made and LOCKED in the setup wizard (REQ-35).
   * Deliberately a plain value, never a setter — this component has no
   * ability to change it, by the prop's type rather than by discipline.
   */
  cameraMode: CameraMode;
  resumeText: string;
  resumeFileName?: string;
  resumeId: string | null;
  language: string;
  onExit: () => void;
  onFinish: (reportId: string) => void;
}

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
 * Stage thresholds scale with the chosen session length (`targetQuestionCount`)
 * instead of the old hardcoded ~9-question shape, so a "Quick" session doesn't
 * march through the same stage lengths as a `standard` one. The time-based
 * "move to closing" trigger in `buildProgressBlock` remains the real backstop
 * and needs no change here.
 *
 * For the 9-question `standard` length both derived thresholds evaluate to 3,
 * exactly matching today's shipped, human-validated `general` behavior.
 */
function advanceProgress(
  previous: InterviewProgress,
  hasResume: boolean,
  targetQuestionCount: number
): InterviewProgress {
  const next = {
    ...previous,
    categoriesCovered: [...previous.categoriesCovered],
    dodgedCategories: [...previous.dodgedCategories],
    followUpsUsed: 0,
  };

  const resumeQuestionCap = hasResume
    ? Math.max(1, Math.round(targetQuestionCount / 3))
    : 0;
  const behavioralCategoryQuota = Math.min(
    BEHAVIORAL_CATEGORIES.length,
    Math.max(2, Math.round(targetQuestionCount / 3))
  );

  if (previous.stage === "opening") {
    next.questionsAsked += 1;
    next.stage = hasResume ? "resume" : "behavioral";
    return next;
  }

  if (previous.stage === "resume") {
    next.questionsAsked += 1;
    if (next.questionsAsked >= resumeQuestionCap) next.stage = "behavioral";
    return next;
  }

  if (previous.stage === "behavioral") {
    const nextCategory = BEHAVIORAL_CATEGORIES.find(
      (category) => !next.categoriesCovered.includes(category)
    );
    if (nextCategory) next.categoriesCovered.push(nextCategory);
    next.questionsAsked += 1;
    if (next.categoriesCovered.length >= behavioralCategoryQuota) next.stage = "role_specific";
    return next;
  }

  if (previous.stage === "role_specific") {
    next.questionsAsked += 1;
    next.stage = "closing";
    return next;
  }

  return next;
}

/**
 * A type-agnostic, immersive interview room.
 *
 * Its only interview-specific input is the registry record and the selected
 * LiveAvatar pair, making a future coding or consulting interview a route/data
 * addition rather than another real-time-avatar page.
 */
export default function InterviewSessionShell({
  interviewType,
  customization,
  interviewerName,
  interviewerAvatarId,
  avatarConfig,
  cameraMode,
  resumeText,
  resumeFileName,
  resumeId,
  language,
  onExit,
  onFinish,
}: InterviewSessionShellProps) {
  const avatarRef = useRef<InteractiveAvatarRef>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const reportIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const openingSentRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const peakRmsRef = useRef(0);
  const meterTimerRef = useRef<number | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [avatarReady, setAvatarReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [exitIntent, setExitIntent] = useState<null | "end" | "leave">(null);
  const [submitting, setSubmitting] = useState(false);

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
  const ensureReport = useCallback(async (): Promise<string | null> => {
    if (reportIdRef.current) return reportIdRef.current;
    if (startingRef.current) return null;
    startingRef.current = true;
    try {
      const res = await fetch("/api/interview/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeSlug: interviewType.slug,
          customization,
          interviewerAvatarId,
          interviewerName,
          resumeId,
          resumeText,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      reportIdRef.current = data.reportId ?? null;
      return reportIdRef.current;
    } catch {
      return null;
    } finally {
      startingRef.current = false;
    }
  }, [interviewType.slug, customization, interviewerAvatarId, interviewerName, resumeId, resumeText]);

  const checkpoint = useCallback(
    (nextProgress: InterviewProgress) => {
      void (async () => {
        const reportId = await ensureReport();
        if (!reportId) return;
        try {
          await fetch("/api/interview/session/checkpoint", {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reportId,
              turns: messagesRef.current,
              progress: nextProgress,
            }),
          });
        } catch {
          // Intentionally silent. A dropped checkpoint costs at most one
          // exchange and must never interrupt the interview or alarm the
          // student.
        }
      })();
    },
    [ensureReport]
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
    visualCaptureRef.current?.stop();
    visualCaptureRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
  }, []);

  const releaseMicrophone = useCallback(() => {
    stopMetering();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, [stopMetering]);

  useEffect(() => {
    return () => {
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

  const sendMessage = useCallback(
    async (candidateMessage: string) => {
      const content = candidateMessage.trim();
      if (!content || sending || isPaused) return;

      const userMessage = { role: "user" as const, content };
      const messageHistory = [
        ...messagesRef.current,
        { ...userMessage, timestamp: Date.now() },
      ];
      appendMessage(userMessage);
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
            interview: {
              typeSlug: interviewType.slug,
              // REQ-23: resent unchanged on every turn, never re-derived or
              // mutated here. The server re-resolves this identically each
              // time, and byte-stability is what keeps the assembled system
              // prompt session-constant for the OpenAI prefix cache.
              customization,
              resumeText,
              progress,
              startedAt: startedAtRef.current ?? Date.now(),
            },
          }),
        });

        if (!response.ok) throw new Error("The interviewer could not respond.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream was available.");

        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        let speakBuffer = "";
        let streamErrored = false;
        const flushSpeech = (final: boolean) => {
          const { chunks, rest } = extractSpeakable(speakBuffer);
          speakBuffer = rest;
          chunks.forEach((chunk) => avatarRef.current?.speak(chunk));
          if (final && speakBuffer.trim()) {
            avatarRef.current?.speak(speakBuffer.trim());
            speakBuffer = "";
          }
        };

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
              };
              if (event.type === "content" && event.delta) {
                answer += event.delta;
                speakBuffer += event.delta;
                setStreamingText(answer);
                flushSpeech(false);
              } else if (event.type === "error") {
                streamErrored = true;
              }
            } catch {
              // Ignore a malformed frame and continue reading the stream.
            }
          }
        }

        flushSpeech(true);
        if (streamErrored || !answer.trim()) {
          throw new Error("The interviewer response was interrupted.");
        }

        appendMessage({ role: "assistant", content: answer.trim() });
        const nextProgress = advanceProgress(
          progress,
          Boolean(resumeText.trim()),
          interviewType.targetQuestionCount
        );
        setProgress(nextProgress);
        checkpoint(nextProgress);
      } catch (error) {
        console.error("Interview chat failed:", error);
        avatarRef.current?.interrupt();
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
      interviewType.slug,
      customization,
      isPaused,
      language,
      progress,
      resumeText,
      sending,
    ]
  );

  const startOpening = useCallback(() => {
    if (openingSentRef.current) return;
    openingSentRef.current = true;
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    void sendMessage("I’m ready to begin the interview.");
  }, [sendMessage]);

  const handleAvatarStateChange = useCallback(
    (state: StreamingAvatarSessionState) => {
      if (state === StreamingAvatarSessionState.CONNECTED) {
        setAvatarReady(true);
        startOpening();

        // Start capture AFTER the avatar has connected, never before — a
        // camera-on session must not delay the avatar handshake (REQ-49),
        // and MediaPipe's several-MB dynamic import would otherwise compete
        // with the WebRTC setup.
        if (cameraMode === "ON" && !visualCaptureRef.current) {
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
              return;
            }
            cameraStreamRef.current = result.stream;
            setCameraStream(result.stream);
            const capture = createVisualCapture({
              stream: result.stream,
              onFaceStateChange: (detected) => setFaceMissing(!detected),
            });
            visualCaptureRef.current = capture;
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
        description: "Hold the microphone button while you speak.",
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
    if (!input.trim()) return;
    vocalCaptureRef.current?.recordTypedTurn();
    void sendMessage(input);
  }, [input, sendMessage]);

  const startRecording = useCallback(async () => {
    if (sending || isTranscribing || isPaused) return;
    try {
      avatarRef.current?.interrupt();
      const stream = await getMicrophone();
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
        stopMetering();
        void transcribeRecording();
      };
      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      startMetering(stream);
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone unavailable:", error);
      addToast({
        title: "Could not access your microphone",
        description: "You can type your answer instead.",
        color: "danger",
      });
    }
  }, [getMicrophone, isPaused, isTranscribing, sending, startMetering, stopMetering, transcribeRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const answeredCount = Math.max(
    0,
    messagesRef.current.filter((message) => message.role === "user").length - 1
  );

  const handleLeave = () => {
    releaseMicrophone();
    releaseVisualCapture();
    vocalCaptureRef.current?.detachStream();
    avatarRef.current?.stopSession();
    onExit();
  };

  const handleEnd = async () => {
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
    // same request. stop() is synchronous; drain() is awaited and bounded at
    // 8s by design (lib/metrics/vocal-capture.ts) — the existing in-flight
    // spinner (submitting) already covers this wait so End does not look
    // frozen. drain() never throws by its own contract, but a defensive
    // catch keeps a truly unexpected failure from losing the interview.
    let visual: VisualMetrics | null = null;
    let vocal: VocalMetrics | null = null;
    try {
      visual = visualCaptureRef.current?.stop() ?? null;
    } catch {
      visual = null;
    }
    try {
      vocal = (await vocalCaptureRef.current?.drain(8000)) ?? null;
    } catch {
      vocal = null;
    }
    try {
      const res = await fetch("/api/interview/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          turns: messagesRef.current,
          progress,
          metrics: { cameraMode, visual, vocal },
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
      addToast({
        title: "We couldn't end the interview",
        description: "Your transcript is safe. Try ending again in a moment.",
        color: "danger",
      });
      setSubmitting(false);
      setExitIntent(null);
    }
  };

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
            onPress={() => setExitIntent("leave")}
          >
            <ChevronLeft size={20} />
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#07131f]/65 px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-[#d3e7f5] backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#72d6b0]" />
            LIVE INTERVIEW
          </div>
          <Tooltip content="End the interview">
            <Button
              isIconOnly
              aria-label="End interview"
              variant="light"
              className="bg-[#07131f]/65 text-white backdrop-blur-md"
              onPress={() => setExitIntent("end")}
            >
              <CircleStop size={20} />
            </Button>
          </Tooltip>
        </header>

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
            <span>{progress.questionsAsked} of ~{interviewType.targetQuestionCount} questions</span>
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
                  disabled={sending || isTranscribing || !avatarReady}
                  rows={2}
                  placeholder={avatarReady ? "Type your answer, or hold the mic to speak…" : "Connecting to your interviewer…"}
                  className="min-h-14 flex-1 resize-none rounded-xl border border-white/15 bg-[#102a3a] px-3 py-3 text-sm text-white outline-none placeholder:text-[#89aabd] focus:border-[#71c9e7] focus:ring-2 focus:ring-[#71c9e7]/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Button
                  isIconOnly
                  aria-label="Send answer"
                  color="primary"
                  isLoading={sending}
                  isDisabled={!input.trim() || sending || isTranscribing || !avatarReady}
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
                  isDisabled={sending || isTranscribing || !avatarReady}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={(event) => {
                    event.preventDefault();
                    void startRecording();
                  }}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    stopRecording();
                  }}
                  startContent={isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                >
                  {isTranscribing ? "Transcribing…" : isRecording ? "Release to send" : "Hold to speak"}
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className="text-[#afcad9]"
                  startContent={<Pause size={14} />}
                  onPress={() => setIsPaused(true)}
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

      <Modal
        isOpen={exitIntent !== null}
        onClose={() => !submitting && setExitIntent(null)}
      >
        <ModalContent>
          {exitIntent === "end" ? (
            <>
              <ModalHeader>End interview and generate your report?</ModalHeader>
              <ModalBody>
                <p>
                  You can&apos;t resume after this. We&apos;ll review your
                  interview and your report will be ready in under a minute.
                </p>
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
                  onPress={() => void handleEnd()}
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
