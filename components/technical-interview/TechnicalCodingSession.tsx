"use client";

import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import {
  Braces,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Lightbulb,
  MessageSquare,
  Play,
  Send,
  TerminalSquare,
  Users,
  XCircle,
} from "lucide-react";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import { useLayout } from "@/lib/layout-context";
import SessionAvatar, { useAvatarKeepAlive } from "@/components/session/SessionAvatar";
import { PushToTalkControl, formatElapsed } from "@/components/session/SessionRoom";
import { usePushToTalkRecorder } from "@/components/session/usePushToTalkRecorder";
import {
  useSyncVisualSpeaking,
  useVisualCapture,
} from "@/components/session/useVisualCapture";
import { SelfViewThumbnail } from "@/components/session/SelfViewThumbnail";
import { FaceDetectionBanner } from "@/components/session/FaceDetectionBanner";
import TechnicalPythonEditor from "@/components/technical-interview/TechnicalPythonEditor";
import {
  entryPointFromStarterCode,
  useVisibleTestRunner,
  type VisibleTestOutcome,
} from "@/components/technical-interview/useVisibleTestRunner";
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";
import type { StartAvatarRequest } from "@/types";
import {
  MAX_TECHNICAL_HINTS,
  type TechnicalCodingInputSnapshot,
} from "@/lib/technical-interview/types";
import type { ReportDTO } from "@/lib/report/dto";

const TARGET_SECONDS = 30 * 60;

type TerminalLine = {
  kind: "command" | "info" | "pass" | "fail" | "error";
  text: string;
  detail?: string;
};

type Turn = { role: "user" | "assistant"; content: string };

export default function TechnicalCodingSession({
  reportId,
  avatarConfig,
  cameraMode,
}: {
  reportId: string;
  avatarConfig: StartAvatarRequest;
  /**
   * The camera mode the server RESOLVED at session start, not what the student
   * asked for — `startSession` downgrades a request to "OFF" when video
   * consent is missing, and this room must not capture against that decision.
   */
  cameraMode: CameraMode;
}) {
  const { setFullScreen } = useLayout();
  const avatarRef = useRef<React.ElementRef<typeof SessionAvatar>>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<TechnicalCodingInputSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [source, setSource] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [runningTests, setRunningTests] = useState(false);
  const [avatarConnected, setAvatarConnected] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamingReply, setStreamingReply] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sidePanel, setSidePanel] = useState<"problem" | "interviewer">("problem");
  const [avatarFailed, setAvatarFailed] = useState(false);
  // Read at call time inside callbacks that must not re-create on failure.
  const avatarFailedRef = useRef(false);
  avatarFailedRef.current = avatarFailed;

  const { run: runPython, runtimeReady } = useVisibleTestRunner();
  useAvatarKeepAlive(avatarRef, avatarConnected);

  /**
   * The SAME visual-capture lifecycle every other live session uses
   * (`components/session/useVisualCapture`), not a second implementation: it
   * owns camera acquisition, MediaPipe face detection and the metrics stop.
   * Everything below stays null for the whole session when `cameraMode` is
   * "OFF", so a camera-off interview renders no self-view and no banner and
   * never touches the camera.
   */
  const {
    cameraStream,
    faceMissing,
    startVisualCapture,
    stopVisualCapture,
    releaseVisualCapture,
    syncSpeaking,
  } = useVisualCapture();

  // The room owns the whole viewport: it asks for `h-[100dvh]` below, so it has
  // to opt out of MainContent's padded, max-width column and out of the navbar
  // the same way every other immersive surface does. Without this the bottom
  // edge (terminal border, Run/Submit row) is pushed outside the visible box.
  useEffect(() => {
    setFullScreen(true);
    return () => setFullScreen(false);
  }, [setFullScreen]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * The clock transcript turns and captured visual episodes are both stamped
   * against, so an episode can be matched to the moment it happened. Set once
   * on mount, beside the elapsed timer it shares an origin with.
   */
  const startedAtRef = useRef<number>(Date.now());

  // Capture starts only AFTER the avatar has connected, never before: a
  // camera-on session must not delay the avatar handshake, and MediaPipe's
  // several-MB dynamic import would otherwise compete with the WebRTC setup.
  // A vendor failure still counts as "the room is live", so a degraded-to-text
  // interview is measured too.
  useEffect(() => {
    if (cameraMode !== "ON") return;
    if (!avatarConnected && !avatarFailed) return;
    startVisualCapture(() => startedAtRef.current);
  }, [avatarConnected, avatarFailed, cameraMode, startVisualCapture]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void fetch(`/api/practice/report/${reportId}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        data: (await response.json().catch(() => ({}))) as {
          report?: ReportDTO;
          technicalHintCount?: number;
          error?: string;
        },
      }))
      .then(({ response, data }) => {
        if (cancelled) return;
        const input = data.report?.input;
        if (!response.ok) {
          setLoadError(data.error || "Unable to load the coding workspace.");
          return;
        }
        if (input?.kind !== "technical-coding") {
          setLoadError(
            "This coding assignment is unavailable. Please start a new technical interview.",
          );
          return;
        }
        setSnapshot(input);
        setHintsUsed(Math.max(0, Math.min(MAX_TECHNICAL_HINTS, data.technicalHintCount ?? 0)));
        try {
          const saved = window.localStorage.getItem(`technical-coding:${reportId}:source`);
          setSource(saved || input.assignment.starterCode);
        } catch {
          setSource(input.assignment.starterCode);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Unable to reach the coding workspace. Check your connection and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, reportId]);

  useEffect(() => {
    if (!snapshot) return;
    try {
      window.localStorage.setItem(`technical-coding:${reportId}:source`, source);
    } catch {
      // Editing remains functional when storage is unavailable.
    }
  }, [reportId, snapshot, source]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns, streamingReply]);

  /**
   * The interviewer's brief is server-authored and idempotent, so a reconnect
   * or a re-run effect replays the same words instead of greeting twice. It is
   * requested once the avatar can actually speak it.
   */
  const openingRef = useRef(false);
  useEffect(() => {
    // A definitive vendor failure must not strand the interview: the brief is
    // still recorded and shown in text, exactly as the coached shell degrades.
    if (!snapshot || (!avatarConnected && !avatarFailed) || openingRef.current) return;
    openingRef.current = true;
    void fetch("/api/technical-interview/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId }),
    })
      .then(async (response) => (await response.json().catch(() => ({}))) as { opening?: string | null })
      .then((data) => {
        if (!data.opening) return;
        setTurns((prior) =>
          prior.length === 0 ? [{ role: "assistant", content: data.opening! }] : prior,
        );
        if (!avatarFailed) avatarRef.current?.speak(data.opening);
      })
      .catch(() => {
        openingRef.current = false;
      });
  }, [avatarConnected, avatarFailed, reportId, snapshot]);

  const entryPoint = useMemo(
    () => (snapshot ? entryPointFromStarterCode(snapshot.assignment.starterCode) : null),
    [snapshot],
  );

  const append = useCallback(
    (lines: TerminalLine[]) => setTerminalLines((prior) => [...prior, ...lines].slice(-200)),
    [],
  );

  // Each run replaces the previous output rather than stacking under it. The
  // terminal is a fixed-height scroller, so appending meant the newest result
  // landed below the fold and the candidate had to scroll to find it.
  const resetTerminal = useCallback((lines: TerminalLine[]) => {
    setTerminalLines(lines.slice(-200));
    if (terminalRef.current) terminalRef.current.scrollTop = 0;
  }, []);

  const runVisibleTests = useCallback(async () => {
    if (!snapshot || runningTests) return;
    const tests = snapshot.assignment.publicTests;
    setRunningTests(true);
    setTerminalOpen(true);
    resetTerminal([
      {
        kind: "command",
        text: `python -m pytest visible  (${tests.length} test${tests.length === 1 ? "" : "s"})`,
      },
      ...(runtimeReady
        ? []
        : [{ kind: "info" as const, text: "Starting the Python runtime (first run only)…" }]),
    ]);

    if (!entryPoint) {
      append([
        {
          kind: "error",
          text: "This assignment has no readable function signature. Please start a new session.",
        },
      ]);
      setRunningTests(false);
      return;
    }

    const outcome = await runPython(source, entryPoint, tests);

    if (outcome.status === "failed") {
      append([{ kind: "error", text: outcome.message }]);
    } else {
      const byId = new Map(tests.map((test) => [test.id, test]));
      const describe = (result: VisibleTestOutcome) => {
        const test = byId.get(result.id);
        const label = test?.label ?? result.id;
        const call = test
          ? `${entryPoint}(${(Array.isArray(test.input) ? test.input : [test.input])
              .map((value) => JSON.stringify(value))
              .join(", ")})`
          : label;
        if (result.error) {
          return { kind: "fail" as const, text: `${label} — ${call}`, detail: result.error };
        }
        return {
          kind: result.passed ? ("pass" as const) : ("fail" as const),
          text: `${label} — ${call}`,
          detail: result.passed
            ? `returned ${result.produced}`
            : `expected ${result.expected}, got ${result.produced}`,
        };
      };
      const passed = outcome.results.filter((result) => result.passed).length;
      append([
        ...(outcome.stdout.trim()
          ? [{ kind: "info" as const, text: "stdout", detail: outcome.stdout.trimEnd() }]
          : []),
        ...outcome.results.map(describe),
        {
          kind: passed === outcome.results.length ? "pass" : "fail",
          text: `${passed}/${outcome.results.length} visible tests passed.`,
          detail:
            passed === outcome.results.length
              ? "Hidden tests still run when you submit."
              : undefined,
        },
      ]);
    }
    setRunningTests(false);
    editorRef.current?.view?.focus();
  }, [append, entryPoint, resetTerminal, runPython, runningTests, runtimeReady, snapshot, source]);

  const evidence = useCallback(
    () => ({ version: 1 as const, checkpoints: [{ source }] }),
    [source],
  );

  const checkpoint = useCallback(async () => {
    await fetch("/api/practice/session/checkpoint", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, turns: [], progress: {}, technicalCheckpoints: evidence() }),
    }).catch(() => {});
  }, [evidence, reportId]);

  const sendChat = useCallback(
    async (content: string, requestHint = false) => {
      const trimmed = content.trim();
      if (!trimmed || sendingChat) return;
      setTurns((prior) => [...prior, { role: "user", content: trimmed }]);
      setChatInput("");
      setStreamingReply("");
      setSendingChat(true);
      setSidePanel("interviewer");
      try {
        const response = await fetch("/api/interaction/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId,
            // The server receives a new candidate turn only. It owns prior
            // transcript history and every interviewer reply.
            messages: [{ role: "user", content: trimmed }],
            engine: { typeSlug: "technical-coding" },
            ...(requestHint ? { technicalHintRequestId: crypto.randomUUID() } : {}),
          }),
        });
        if (!response.ok || !response.body) throw new Error("chat unavailable");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let reply = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
            if (!data) continue;
            try {
              const event = JSON.parse(data) as { type?: string; delta?: string };
              if (event.type === "content" && event.delta) {
                reply += event.delta;
                setStreamingReply(reply);
              }
            } catch {
              /* ignore malformed SSE frames */
            }
          }
        }
        if (reply) {
          setTurns((prior) => [...prior, { role: "assistant", content: reply }]);
          setStreamingReply("");
          if (!avatarFailedRef.current) avatarRef.current?.speak(reply);
          if (requestHint) setHintsUsed((value) => Math.min(MAX_TECHNICAL_HINTS, value + 1));
          void checkpoint();
        }
      } catch {
        setStreamingReply("Unable to reach the interviewer. Please try again.");
      } finally {
        setSendingChat(false);
      }
    },
    [checkpoint, reportId, sendingChat],
  );

  /**
   * The SAME shared push-to-talk recorder every other live session uses
   * (`components/session/usePushToTalkRecorder`): microphone acquisition, the
   * silent/short-recording guards, vocal capture and the transcription read
   * are not reimplemented here. The transcript is sent as an ordinary
   * candidate turn, so the server stays the sole author of the transcript.
   */
  const sendTranscript = useCallback(
    (transcript: string) => sendChat(transcript),
    [sendChat],
  );
  const talkLockRef = useRef(false);
  const {
    isRecording,
    isTranscribing,
    partialTranscript,
    toggleRecording,
    releaseMicrophone,
    vocalCaptureRef,
  } = usePushToTalkRecorder({
    language: avatarConfig.language ?? "en",
    sending: sendingChat,
    isPaused: false,
    lockRef: talkLockRef,
    onTranscript: sendTranscript,
    // Only cut the interviewer off once a recording has validly been claimed.
    onRecordingClaimed: () => avatarRef.current?.interrupt(),
    onRejected: (reason) =>
      addToast({
        title: reason === "too-short" ? "Nothing recorded" : "No speech detected",
        description:
          reason === "too-short"
            ? "Tap the microphone, speak, then tap again to send."
            : "Check that the right microphone is selected and not muted.",
        color: "warning",
      }),
    onTranscriptionFailed: (error) => {
      console.error("Technical interview transcription failed:", error);
      addToast({ title: "Could not transcribe your answer", color: "danger" });
    },
    onMicrophoneUnavailable: (error) => {
      console.error("Microphone unavailable:", error);
      addToast({
        title: "Could not access your microphone",
        description: "You can type to your interviewer instead.",
        color: "danger",
      });
    },
    audioFileName: "technical-interview-answer.webm",
  });

  // Keeps the visual engine's conversational window locked to the recorder,
  // driven from the state rather than beside each setter — see the hook.
  useSyncVisualSpeaking(syncSpeaking, isRecording);

  // Leaving the room releases the microphone and the provider session; an
  // unfinished recording is discarded rather than transcribed after the exit.
  useEffect(() => {
    const capture = vocalCaptureRef;
    return () => {
      releaseMicrophone();
      capture.current?.detachStream();
      avatarRef.current?.stopSession();
      // The camera LED going out is the part a student actually sees, so it
      // must happen on every exit path, not only a clean submit.
      releaseVisualCapture();
    };
  }, [releaseMicrophone, releaseVisualCapture, vocalCaptureRef]);

  const submit = useCallback(async () => {
    if (!source.trim() || submitting) return;
    setSubmitting(true);
    // Stop and drain BEFORE the finish fetch so the metrics ride in the same
    // request — the engine parses metrics on the finish call and has no second
    // chance at them. Neither call throws by its own contract; the defensive
    // catch keeps an unexpected failure from losing the interview, at the cost
    // of one unscored dimension.
    const visual: VisualMetrics | null = await stopVisualCapture();
    let vocal: VocalMetrics | null = null;
    try {
      vocal = (await vocalCaptureRef.current?.drain()) ?? null;
    } catch {
      vocal = null;
    }
    try {
      const response = await fetch("/api/practice/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          turns: [],
          progress: {},
          // Without this the report records no camera mode and no vocal data,
          // so Visual and Vocal resolve to INSUFFICIENT_DATA even when the
          // candidate was on camera and talking for thirty minutes.
          metrics: { cameraMode, visual, vocal },
          technicalCheckpoints: evidence(),
          finalSource: source,
        }),
      });
      if (!response.ok && response.status !== 409) throw new Error("submit failed");
      window.location.assign(`/reports/${reportId}`);
    } catch {
      append([
        { kind: "error", text: "Unable to submit yet. Your code is saved; try again." },
      ]);
      setSubmitting(false);
    }
  }, [
    append,
    cameraMode,
    evidence,
    reportId,
    source,
    stopVisualCapture,
    submitting,
    vocalCaptureRef,
  ]);

  if (loadError) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink p-5 text-canvas">
        <section className="w-full max-w-md rounded-xl border border-white/15 bg-[#101c2d] p-6 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-light-blue">
            Coding workspace unavailable
          </p>
          <h1 className="mt-2 font-display text-2xl text-white">
            We couldn’t open your interview.
          </h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-slate-300">
            {loadError}
          </p>
          <div className="mt-6 flex gap-3">
            <Button color="primary" onPress={() => setLoadAttempt((value) => value + 1)}>
              Try again
            </Button>
            <Button
              variant="flat"
              className="text-white"
              onPress={() => window.location.assign("/practice/interviews")}
            >
              Back to interviews
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink text-canvas">
        <Spinner color="primary" label="Loading coding workspace" />
      </main>
    );
  }

  const { assignment } = snapshot;
  const overTarget = elapsed > TARGET_SECONDS;

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-ink text-canvas">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-ink px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-light-blue/30 bg-light-blue/10">
            <Braces size={16} className="text-light-blue" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-light-blue">
              Technical interview
            </p>
            <h1 className="truncate font-display text-base font-medium leading-tight text-white">
              {assignment.title}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-light-blue sm:inline">
            Python 3.12
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs ${
              overTarget
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-white/5 text-white"
            }`}
          >
            <Clock3 size={13} />
            {formatElapsed(elapsed)} / 30:00
          </span>
        </div>
      </header>

      {/* Three columns on desktop; the editor keeps the largest share and each
          column scrolls on its own so the page itself never scrolls. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.6fr)_minmax(300px,0.85fr)] lg:overflow-hidden">
        {/* Problem / interviewer: tabs on mobile, problem column on desktop. */}
        <aside className="flex min-h-0 flex-col border-b border-white/10 bg-[#101c2d] lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 gap-1 border-b border-white/10 px-3 pt-2 lg:hidden">
            {(
              [
                ["problem", "Problem", Braces],
                ["interviewer", "Interviewer", Users],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSidePanel(key)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium ${
                  sidePanel === key
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 ${
              sidePanel === "problem" ? "" : "hidden lg:block"
            }`}
          >
            <h2 className="font-display text-xl font-medium text-white">{assignment.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">{assignment.statement}</p>

            <div className="mt-4 rounded-md border border-level-4/30 bg-level-4/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-level-4">
                Target complexity
              </p>
              <p className="mt-0.5 text-sm text-slate-200">{assignment.expectedComplexity}</p>
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-light-blue">
              Constraints
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-200">
              {assignment.constraints.map((constraint) => (
                <li key={constraint} className="flex gap-2">
                  <span aria-hidden="true" className="text-level-4">
                    •
                  </span>
                  <span>{constraint}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-light-blue">
              Visible tests
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Hidden tests also run when you submit.
            </p>
            <div className="mt-2 space-y-2">
              {assignment.publicTests.map((test) => (
                <article
                  key={test.id}
                  className="rounded-md border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs leading-5"
                >
                  <p className="font-sans text-[11px] font-semibold text-light-blue">
                    {test.label}
                  </p>
                  <p className="mt-1 break-words text-slate-300">
                    <span className="text-slate-500">in </span>
                    {JSON.stringify(test.input)}
                  </p>
                  <p className="break-words text-level-4">
                    <span className="text-slate-500">out </span>
                    {JSON.stringify(test.expected)}
                  </p>
                </article>
              ))}
            </div>
          </div>

          {/* Mobile-only interviewer tab content; desktop renders the dock. */}
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:hidden ${
              sidePanel === "interviewer" ? "" : "hidden"
            }`}
          >
            <InterviewerPanel
              avatarRef={avatarRef}
              avatarConfig={avatarConfig}
              onConnectedChange={setAvatarConnected}
              turns={turns}
              streamingReply={streamingReply}
              transcriptRef={transcriptRef}
              chatInput={chatInput}
              setChatInput={setChatInput}
              sendingChat={sendingChat}
              hintsUsed={hintsUsed}
              onSend={sendChat}
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              partialTranscript={partialTranscript}
              avatarConnected={avatarConnected}
              avatarFailed={avatarFailed}
              onAvatarFailed={() => setAvatarFailed(true)}
              onToggleRecording={toggleRecording}
              mounted={false}
              cameraStream={cameraStream}
            />
          </div>
        </aside>

        {/* Editor + terminal share the center column. */}
        <section className="flex min-h-0 flex-col overflow-hidden bg-white text-slate-900">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500">
            <span className="font-mono font-medium text-slate-700">solution.py</span>
            <span className="hidden sm:inline">⌘/Ctrl + Enter runs visible tests</span>
          </div>
          <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden lg:min-h-0">
            <TechnicalPythonEditor
              ref={editorRef}
              value={source}
              onChange={setSource}
              onRunVisibleTests={() => void runVisibleTests()}
              isRunning={runningTests}
            />
          </div>
          <p id="editor-help" className="sr-only">
            Python editor with line numbers and syntax highlighting. Press Control or Command Enter
            to run visible tests. Tab and Shift Tab adjust indentation.
          </p>

          <section className="shrink-0 border-t border-white/10 bg-[#050a12] text-canvas">
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <button
                type="button"
                onClick={() => setTerminalOpen((open) => !open)}
                aria-expanded={terminalOpen}
                className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-light-blue"
              >
                <TerminalSquare size={15} className="text-level-4" />
                Terminal
                <ChevronDown
                  size={14}
                  className={terminalOpen ? "rotate-180 transition-transform" : "transition-transform"}
                />
              </button>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  className="font-semibold text-white"
                  onPress={() => void runVisibleTests()}
                  isLoading={runningTests}
                  isDisabled={runningTests}
                  startContent={runningTests ? undefined : <Play size={14} />}
                >
                  Run
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isLoading={submitting}
                  isDisabled={!source.trim() || submitting}
                  onPress={() => void submit()}
                  startContent={submitting ? undefined : <Send size={14} />}
                >
                  Submit
                </Button>
              </div>
            </div>
            {terminalOpen && (
              <div
                ref={terminalRef}
                className="h-40 overflow-y-auto border-t border-white/10 px-4 py-2.5 font-mono text-xs leading-5"
                aria-live="polite"
              >
                {terminalLines.length === 0 ? (
                  <p className="text-slate-500">
                    Ready. Run the visible tests to check your work — Python runs locally in this
                    tab.
                  </p>
                ) : (
                  terminalLines.map((line, index) => (
                    <div key={`${line.text}-${index}`} className="flex gap-2">
                      {line.kind === "pass" && (
                        <CheckCircle2 size={13} className="mt-1 shrink-0 text-level-4" />
                      )}
                      {(line.kind === "fail" || line.kind === "error") && (
                        <XCircle size={13} className="mt-1 shrink-0 text-danger" />
                      )}
                      <p
                        className={
                          line.kind === "command"
                            ? "text-light-blue"
                            : line.kind === "pass"
                              ? "text-level-4"
                              : line.kind === "fail" || line.kind === "error"
                                ? "text-danger"
                                : "text-slate-400"
                        }
                      >
                        {line.kind === "command" && <span className="text-slate-500">$ </span>}
                        {line.text}
                        {line.detail && (
                          <span className="block whitespace-pre-wrap break-words text-slate-400">
                            {line.detail}
                          </span>
                        )}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </section>

        {/* Persistent interviewer dock (desktop). */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-white/10 bg-[#0b1524] px-4 py-4 lg:flex">
          <InterviewerPanel
            avatarRef={avatarRef}
            avatarConfig={avatarConfig}
            onConnectedChange={setAvatarConnected}
            turns={turns}
            streamingReply={streamingReply}
            transcriptRef={transcriptRef}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendingChat={sendingChat}
            hintsUsed={hintsUsed}
            onSend={sendChat}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            partialTranscript={partialTranscript}
            avatarConnected={avatarConnected}
            avatarFailed={avatarFailed}
            onAvatarFailed={() => setAvatarFailed(true)}
            onToggleRecording={toggleRecording}
            mounted
            cameraStream={cameraStream}
          />
        </aside>
      </div>
      {/* Always mounted so it folds away rather than disappearing. Only shown
          for a camera-on session — an off session has no face to miss. */}
      <FaceDetectionBanner visible={cameraMode === "ON" && faceMissing} />
    </main>
  );
}

/**
 * The avatar stage plus transcript. The avatar itself must mount EXACTLY once
 * per session — a second `SessionAvatar` would open a second provider session —
 * so the responsive layout renders the stage only in the desktop dock and
 * shows the mobile tab its transcript alone.
 */
function InterviewerPanel({
  avatarRef,
  avatarConfig,
  onConnectedChange,
  turns,
  streamingReply,
  transcriptRef,
  chatInput,
  setChatInput,
  sendingChat,
  hintsUsed,
  onSend,
  isRecording,
  isTranscribing,
  partialTranscript,
  avatarConnected,
  avatarFailed,
  onAvatarFailed,
  onToggleRecording,
  mounted,
  cameraStream,
}: {
  avatarRef: React.Ref<React.ElementRef<typeof SessionAvatar>>;
  avatarConfig: StartAvatarRequest;
  onConnectedChange: (connected: boolean) => void;
  turns: Turn[];
  streamingReply: string;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  chatInput: string;
  setChatInput: (value: string) => void;
  sendingChat: boolean;
  hintsUsed: number;
  onSend: (content: string, requestHint?: boolean) => Promise<void>;
  isRecording: boolean;
  isTranscribing: boolean;
  partialTranscript: string;
  avatarConnected: boolean;
  avatarFailed: boolean;
  onAvatarFailed: () => void;
  onToggleRecording: () => void;
  mounted: boolean;
  /** The student's own camera stream, or null when the session is camera-off. */
  cameraStream: MediaStream | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {mounted && (
        <section
          className="shrink-0 overflow-hidden rounded-xl border border-white/15 bg-ink shadow-xl"
          aria-label="Live interviewer video"
        >
          <div className="relative aspect-[4/3] bg-black">
            <SessionAvatar
              ref={avatarRef}
              config={avatarConfig}
              onSessionStateChange={(state) =>
                onConnectedChange(state === StreamingAvatarSessionState.CONNECTED)
              }
              // Every other live session handles this; without it a vendor
              // failure left the room stuck with no video, no brief, no
              // microphone and no explanation.
              onSessionTokenError={onAvatarFailed}
            />
            {/* Anchored inside the avatar panel, the usual video-call
                convention. Renders nothing at all when the stream is null. */}
            <SelfViewThumbnail stream={cameraStream} />
            {avatarFailed && (
              <div
                role="status"
                className="absolute inset-0 grid place-items-center bg-ink/95 px-4 text-center"
              >
                <p className="text-xs leading-5 text-slate-300">
                  The video interviewer couldn’t connect, so your interview continues in text.
                  Everything you type is still scored.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <section
        className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/15 bg-black/25"
        aria-label="Interviewer conversation"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-light-blue">
            <MessageSquare size={13} />
            Conversation
          </p>
          <Button
            size="sm"
            variant="flat"
            className="h-7 min-w-0 px-2 text-xs text-white"
            isDisabled={sendingChat || hintsUsed >= MAX_TECHNICAL_HINTS}
            startContent={<Lightbulb size={13} />}
            onPress={() => void onSend("Could I have a hint?", true)}
          >
            Hint {hintsUsed}/{MAX_TECHNICAL_HINTS}
          </Button>
        </div>

        <div
          ref={mounted ? transcriptRef : undefined}
          className="min-h-[140px] flex-1 space-y-2.5 overflow-y-auto px-3 py-3 text-sm leading-6"
          aria-live="polite"
        >
          {turns.length === 0 && !streamingReply && (
            <p className="text-xs leading-5 text-slate-400">
              Your interviewer will introduce the problem. Talk through your approach as you work —
              what you say is scored alongside your code.
            </p>
          )}
          {turns.map((turn, index) => (
            <div key={`${turn.role}-${index}`}>
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  turn.role === "user" ? "text-slate-500" : "text-light-blue"
                }`}
              >
                {turn.role === "user" ? "You" : "Interviewer"}
              </p>
              <p
                className={`mt-0.5 whitespace-pre-wrap break-words ${
                  turn.role === "user" ? "text-slate-300" : "text-white"
                }`}
              >
                {turn.content}
              </p>
            </div>
          ))}
          {streamingReply && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-light-blue">
                Interviewer
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-white">{streamingReply}</p>
            </div>
          )}
          {partialTranscript && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                You
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-400">
                {partialTranscript}
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-white/10 p-2">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onSend(chatInput);
            }}
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              disabled={sendingChat || isTranscribing}
              maxLength={4000}
              placeholder={
                avatarConnected || avatarFailed
                  ? "Speak, or type your approach…"
                  : "Connecting to your interviewer…"
              }
              aria-label="Message the interviewer"
              className="min-w-0 flex-1 rounded-md border border-white/20 bg-ink px-2.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-light-blue disabled:opacity-60"
            />
            <Button
              type="submit"
              size="sm"
              color="primary"
              className="h-auto"
              isLoading={sendingChat}
              isDisabled={!chatInput.trim() || sendingChat || isTranscribing}
            >
              Send
            </Button>
          </form>
          {/* The same tap-to-record control as every other live session. */}
          <PushToTalkControl
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            isDisabled={sendingChat || isTranscribing || (!avatarConnected && !avatarFailed)}
            onToggle={onToggleRecording}
          />
        </div>
      </section>
    </div>
  );
}
