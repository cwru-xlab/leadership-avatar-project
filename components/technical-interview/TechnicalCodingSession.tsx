"use client";

import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Braces, ChevronDown, Clock3, Play, Send, TerminalSquare } from "lucide-react";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useEffect, useRef, useState } from "react";

import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import SessionAvatar, { useAvatarKeepAlive } from "@/components/session/SessionAvatar";
import { formatElapsed } from "@/components/session/SessionRoom";
import TechnicalPythonEditor from "@/components/technical-interview/TechnicalPythonEditor";
import type { StartAvatarRequest } from "@/types";
import type { TechnicalCodingInputSnapshot } from "@/lib/technical-interview/types";
import type { ReportDTO } from "@/lib/report/dto";

export default function TechnicalCodingSession({ reportId, avatarConfig }: { reportId: string; avatarConfig: StartAvatarRequest }) {
  const avatarRef = useRef<React.ElementRef<typeof SessionAvatar>>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [snapshot, setSnapshot] = useState<TechnicalCodingInputSnapshot | null>(null);
  const [source, setSource] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalLines, setTerminalLines] = useState<string[]>(["Workspace ready.", "Visible tests are listed in the problem panel."]);
  const [runningTests, setRunningTests] = useState(false);
  const [avatarConnected, setAvatarConnected] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [turns, setTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [streamingReply, setStreamingReply] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useAvatarKeepAlive(avatarRef, avatarConnected);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/practice/report/${reportId}`, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() as { report?: ReportDTO } }))
      .then(({ response, data }) => {
        const input = data.report?.input;
        if (!cancelled && response.ok && input?.kind === "technical-coding") {
          setSnapshot(input);
          try {
            const saved = window.localStorage.getItem(`technical-coding:${reportId}:source`);
            setSource(saved || input.assignment.starterCode);
          } catch {
            setSource(input.assignment.starterCode);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setTerminalLines((lines) => [...lines, "Unable to load the assignment. Refresh to try again."]);
      });
    return () => { cancelled = true; };
  }, [reportId]);

  useEffect(() => {
    if (!snapshot) return;
    try {
      window.localStorage.setItem(`technical-coding:${reportId}:source`, source);
    } catch {
      // Editing remains functional when storage is unavailable.
    }
  }, [reportId, snapshot, source]);

  const runVisibleTests = async () => {
    if (!snapshot || runningTests) return;
    setRunningTests(true);
    setTerminalLines((lines) => [...lines, "> Run visible tests"]);
    try {
      const response = await fetch("/api/technical-interview/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          source,
          requestedTestIds: snapshot.assignment.publicTests.map((test) => test.id),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        execution?: { publicResults?: Array<{ id: string; passed: boolean; message?: string }> };
      };
      const resultLines = data.execution?.publicResults?.map((result) =>
        `${result.passed ? "PASS" : "FAIL"} ${result.id}${result.message ? ` — ${result.message}` : ""}`,
      ) ?? [];
      setTerminalLines((lines) => [
        ...lines,
        ...(resultLines.length > 0 ? resultLines : [data.error || "Unable to run visible tests."]),
      ]);
    } catch {
      setTerminalLines((lines) => [...lines, "Unable to reach the execution service. No code was run."]);
    } finally {
      setRunningTests(false);
      editorRef.current?.view?.focus();
    }
  };

  const evidence = useCallback(() => ({
    version: 1 as const,
    checkpoints: [{ source }],
  }), [source]);

  const checkpoint = useCallback(async (nextTurns: Array<{ role: "user" | "assistant"; content: string }>) => {
    await fetch("/api/practice/session/checkpoint", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, turns: nextTurns, progress: {}, technicalEvidence: evidence() }),
    }).catch(() => {});
  }, [evidence, reportId]);

  const sendChat = useCallback(async (content: string, requestHint = false) => {
    const trimmed = content.trim();
    if (!trimmed || sendingChat) return;
    const nextTurns = [...turns, { role: "user" as const, content: trimmed }];
    setTurns(nextTurns);
    setChatInput("");
    setStreamingReply("");
    setSendingChat(true);
    try {
      const response = await fetch("/api/interaction/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          messages: nextTurns,
          engine: { typeSlug: "technical-coding", turnState: { startedAt: Date.now() } },
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
          } catch { /* ignore malformed SSE frames */ }
        }
      }
      if (reply) {
        const completedTurns = [...nextTurns, { role: "assistant" as const, content: reply }];
        setTurns(completedTurns);
        setStreamingReply("");
        avatarRef.current?.speak(reply);
        if (requestHint) setHintsUsed((value) => Math.min(2, value + 1));
        void checkpoint(completedTurns);
      }
    } catch {
      setStreamingReply("Unable to reach the interviewer. Please try again.");
    } finally {
      setSendingChat(false);
    }
  }, [checkpoint, reportId, sendingChat, turns]);

  const submit = useCallback(async () => {
    if (!source.trim() || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/practice/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, turns, progress: {}, technicalEvidence: evidence(), finalSource: source }),
      });
      if (!response.ok && response.status !== 409) throw new Error("submit failed");
      window.location.assign(`/practice/technical-coding/report/${reportId}`);
    } catch {
      setTerminalLines((lines) => [...lines, "Unable to submit yet. Your code remains available; try again."]);
      setSubmitting(false);
    }
  }, [evidence, reportId, source, submitting, turns]);

  if (!snapshot) {
    return <main className="grid min-h-[100dvh] place-items-center bg-ink text-canvas"><Spinner color="primary" label="Loading coding workspace" /></main>;
  }

  const { assignment } = snapshot;
  return (
    <main className="relative grid h-[100dvh] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-ink text-canvas">
      <header className="relative z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-ink/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-light-blue/30 bg-light-blue/10"><Braces size={18} className="text-light-blue" /></div>
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-light-blue">Technical coding interview</p><h1 className="truncate font-display text-lg font-medium text-white">{assignment.title}</h1></div>
        </div>
        <div className="flex items-center gap-3 text-sm"><span className="hidden text-light-blue sm:inline">Python 3.12</span><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-white"><Clock3 size={14} />{formatElapsed(elapsed)} / 30:00</span></div>
      </header>

      <section className="grid min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(290px,0.32fr)_minmax(0,1fr)_220px] lg:overflow-hidden">
        <aside className="min-h-[290px] overflow-y-auto border-b border-white/10 bg-[#101c2d] px-4 py-5 lg:min-h-0 lg:border-b-0 lg:border-r lg:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-light-blue">Problem</p>
          <h2 className="mt-2 font-display text-2xl font-medium text-white">{assignment.title}</h2>
          <p className="mt-4 text-sm leading-6 text-slate-200">{assignment.statement}</p>
          <div className="mt-5 border-l-2 border-level-4/80 pl-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-level-4">Target</p><p className="mt-1 text-sm text-slate-200">{assignment.expectedComplexity}</p></div>
          <h3 className="mt-6 text-sm font-semibold text-white">Constraints</h3>
          <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-200">{assignment.constraints.map((constraint) => <li key={constraint} className="flex gap-2"><span aria-hidden="true" className="text-level-4">•</span><span>{constraint}</span></li>)}</ul>
          <h3 className="mt-6 text-sm font-semibold text-white">Examples</h3>
          <div className="mt-2 space-y-3">{assignment.examples.map((example, index) => <article key={`${example.input}-${index}`} className="rounded-md border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5"><p className="font-sans font-semibold text-light-blue">Example {index + 1}</p><p className="mt-1 text-slate-300">Input: {example.input}</p><p className="text-level-4">Output: {example.output}</p>{example.explanation && <p className="mt-2 font-sans text-slate-300">{example.explanation}</p>}</article>)}</div>
          <h3 className="mt-6 text-sm font-semibold text-white">Visible tests</h3>
          <div className="mt-2 space-y-2">{assignment.publicTests.map((test) => <article key={test.id} className="rounded-md border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5"><p className="font-sans font-semibold text-light-blue">{test.label}</p><p className="mt-1 text-slate-300">input: {JSON.stringify(test.input)}</p><p className="text-level-4">expected: {JSON.stringify(test.expected)}</p></article>)}</div>
        </aside>

        <section className="flex min-h-[360px] flex-col bg-white text-slate-900 lg:min-h-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500"><span className="font-mono font-medium text-slate-700">solution.py</span><span className="hidden sm:inline">Autosave stays on this device until submission is implemented</span></div>
          <TechnicalPythonEditor ref={editorRef} value={source} onChange={setSource} onRunVisibleTests={() => void runVisibleTests()} isRunning={runningTests} />
          <p id="editor-help" className="sr-only">Python editor with line numbers and syntax highlighting. Press Control or Command Enter to run visible tests. Tab and Shift Tab adjust indentation.</p>
        </section>

        <aside className="border-t border-white/10 bg-[#0b1524] p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-light-blue">Interviewer</p>
          <section className="mt-3 overflow-hidden rounded-lg border border-white/15 bg-ink shadow-xl" aria-label="Live interviewer video">
            <div className="aspect-[4/3] bg-black"><SessionAvatar ref={avatarRef} config={avatarConfig} onSessionStateChange={(state) => setAvatarConnected(state === StreamingAvatarSessionState.CONNECTED)} /></div>
            <div className="border-t border-white/10 px-3 py-2 text-xs text-light-blue">Live interview</div>
          </section>
          <p className="mt-3 text-xs leading-5 text-slate-400">Talk through your approach as you work. Your interviewer remains beside the editor on larger screens.</p>
          <section className="mt-4 rounded-lg border border-white/15 bg-black/20 p-3" aria-label="Interviewer conversation">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-light-blue">Conversation</p><Button size="sm" variant="flat" className="min-w-0 text-xs text-white" isDisabled={sendingChat || hintsUsed >= 2} onPress={() => void sendChat("Could I have a hint?", true)}>Request hint {hintsUsed}/2</Button></div>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto text-xs leading-5" aria-live="polite">
              {turns.length === 0 && !streamingReply && <p className="text-slate-400">Ask a clarification or talk through your approach.</p>}
              {turns.map((turn, index) => <p key={`${turn.role}-${index}`} className={turn.role === "user" ? "text-slate-300" : "text-white"}><span className="font-semibold text-light-blue">{turn.role === "user" ? "You" : "Interviewer"}: </span>{turn.content}</p>)}
              {streamingReply && <p className="text-white"><span className="font-semibold text-light-blue">Interviewer: </span>{streamingReply}</p>}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void sendChat(chatInput); }}>
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} disabled={sendingChat} maxLength={4000} placeholder="Explain your approach…" className="min-w-0 flex-1 rounded-md border border-white/20 bg-ink px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-light-blue" />
              <Button type="submit" size="sm" color="primary" isLoading={sendingChat} isDisabled={!chatInput.trim() || sendingChat}>Send</Button>
            </form>
          </section>
        </aside>
      </section>

      <section className="relative z-20 border-t border-white/10 bg-[#050a12]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"><button type="button" onClick={() => setTerminalOpen((open) => !open)} className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-light-blue"><TerminalSquare size={16} className="text-level-4" />Execution terminal<ChevronDown size={15} className={terminalOpen ? "rotate-180 transition-transform" : "transition-transform"} /></button><div className="flex gap-2"><Button size="sm" variant="flat" className="font-semibold text-white" onPress={() => void runVisibleTests()} isLoading={runningTests} isDisabled={runningTests} startContent={runningTests ? undefined : <Play size={15} />}>Run visible tests</Button><Button size="sm" color="primary" isLoading={submitting} isDisabled={!source.trim() || submitting} onPress={() => void submit()} startContent={submitting ? undefined : <Send size={15} />}>Submit & report</Button></div></div>
        {terminalOpen && <div className="max-h-40 overflow-y-auto border-t border-white/10 px-4 py-3 font-mono text-xs leading-5 text-slate-300 sm:px-6" aria-live="polite">{terminalLines.map((line, index) => <p key={`${line}-${index}`} className={line.startsWith(">") ? "text-level-4" : undefined}>{line}</p>)}</div>}
      </section>
    </main>
  );
}
