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
  initialProgress,
  type InterviewProgress,
  type InterviewType,
} from "@/lib/interview/types";
import type { StartAvatarRequest } from "@/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface InterviewSessionShellProps {
  interviewType: InterviewType;
  interviewerName: string;
  avatarConfig: StartAvatarRequest;
  resumeText: string;
  resumeFileName?: string;
  language: string;
  onExit: () => void;
  onFinish: () => void;
}

const HISTORY_TURNS = 10;
const MIN_RECORDING_MS = 400;
const MIN_AUDIO_BYTES = 2048;
const MIN_PEAK_RMS = 0.01;

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function advanceProgress(
  previous: InterviewProgress,
  hasResume: boolean
): InterviewProgress {
  const next = {
    ...previous,
    categoriesCovered: [...previous.categoriesCovered],
    dodgedCategories: [...previous.dodgedCategories],
    followUpsUsed: 0,
  };

  if (previous.stage === "opening") {
    next.questionsAsked += 1;
    next.stage = hasResume ? "resume" : "behavioral";
    return next;
  }

  if (previous.stage === "resume") {
    next.questionsAsked += 1;
    if (next.questionsAsked >= 3) next.stage = "behavioral";
    return next;
  }

  if (previous.stage === "behavioral") {
    const categories = [
      "conflict/disagreement",
      "failure/setback",
      "leadership without authority",
      "feedback received",
      "ambiguity",
      "teamwork",
    ] as const;
    const nextCategory = categories.find(
      (category) => !next.categoriesCovered.includes(category)
    );
    if (nextCategory) next.categoriesCovered.push(nextCategory);
    next.questionsAsked += 1;
    if (next.categoriesCovered.length >= 3) next.stage = "role_specific";
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
  interviewerName,
  avatarConfig,
  resumeText,
  resumeFileName,
  language,
  onExit,
  onFinish,
}: InterviewSessionShellProps) {
  const avatarRef = useRef<InteractiveAvatarRef>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
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

  const stageLabel = useMemo(
    () =>
      progress.stage === "role_specific"
        ? "Role focus"
        : progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1),
    [progress.stage]
  );

  const appendMessage = useCallback((message: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, message];
    setMessages(messagesRef.current);
  }, []);

  const stopMetering = useCallback(() => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
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
      avatarRef.current?.stopSession();
    };
  }, [releaseMicrophone]);

  useEffect(() => {
    if (!startedAtRef.current || isPaused) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current!) / 1000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [isPaused]);

  const sendMessage = useCallback(
    async (candidateMessage: string) => {
      const content = candidateMessage.trim();
      if (!content || sending || isPaused) return;

      const userMessage: ChatMessage = { role: "user", content };
      const messageHistory = [...messagesRef.current, userMessage];
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
        setProgress((current) => advanceProgress(current, Boolean(resumeText.trim())));
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
    [appendMessage, interviewType.slug, isPaused, language, progress, resumeText, sending]
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
      }
    },
    [startOpening]
  );

  const getMicrophone = useCallback(async () => {
    const existing = micStreamRef.current;
    if (existing?.getAudioTracks().some((track) => track.readyState === "live")) {
      return existing;
    }
    existing?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
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

  const finish = () => {
    releaseMicrophone();
    avatarRef.current?.stopSession();
    onFinish();
  };

  return (
    <main className="relative flex min-h-[100dvh] overflow-hidden bg-[#07131f] text-[#f4f8fb]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(83,169,222,0.20),transparent_28%),radial-gradient(circle_at_90%_95%,rgba(13,113,142,0.18),transparent_32%)]" />
      <section className="relative flex min-h-[100dvh] flex-1 flex-col lg:w-[64%]">
        <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-4 sm:px-7">
          <Button
            isIconOnly
            aria-label="Leave interview"
            variant="light"
            className="bg-[#07131f]/65 text-white backdrop-blur-md"
            onPress={onExit}
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
              onPress={finish}
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
        <div className="relative z-10 mt-auto px-5 pb-6 pt-36 sm:px-8 lg:hidden">
          <InterviewStatus
            interviewerName={interviewerName}
            stageLabel={stageLabel}
            elapsedSeconds={elapsedSeconds}
            avatarReady={avatarReady}
          />
        </div>
      </section>

      <aside className="relative z-10 flex w-full max-w-[570px] flex-col border-l border-white/10 bg-[#0b1c2a]/95 lg:min-h-[100dvh] lg:w-[36%]">
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
                      void sendMessage(input);
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
                  onPress={() => void sendMessage(input)}
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#75cce4]">CaseBridge practice</p>
        <h1 className="mt-1 font-serif text-2xl tracking-[-0.02em] text-white">Interview with {interviewerName}</h1>
        <p className="mt-1.5 text-sm text-[#a7c2d2]">{avatarReady ? `${stageLabel} stage` : "Connecting securely"}</p>
      </div>
      <Chip size="sm" variant="flat" className="border border-[#31596d] bg-[#102b3a] text-[#bfe5f2]">
        {formatElapsed(elapsedSeconds)}
      </Chip>
    </div>
  );
}
