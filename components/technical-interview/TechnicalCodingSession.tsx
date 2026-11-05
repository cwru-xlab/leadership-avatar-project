"use client";

import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Braces, ChevronDown, Clock3, Play, Send, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import SessionAvatar, { useAvatarKeepAlive } from "@/components/session/SessionAvatar";
import { formatElapsed } from "@/components/session/SessionRoom";
import type { StartAvatarRequest } from "@/types";
import type { TechnicalCodingInputSnapshot } from "@/lib/technical-interview/types";
import type { ReportDTO } from "@/lib/report/dto";

export default function TechnicalCodingSession({ reportId, avatarConfig }: { reportId: string; avatarConfig: StartAvatarRequest }) {
  const avatarRef = useRef<React.ElementRef<typeof SessionAvatar>>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [snapshot, setSnapshot] = useState<TechnicalCodingInputSnapshot | null>(null);
  const [source, setSource] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalLines, setTerminalLines] = useState<string[]>(["Workspace ready.", "Visible tests are listed in the problem panel."]);
  const [avatarConnected, setAvatarConnected] = useState(false);

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

  const runVisibleTests = () => {
    setTerminalLines((lines) => [
      ...lines,
      "> Run visible tests",
      "Execution sandbox is not configured yet. Your code remains in this editor; no code was executed.",
    ]);
    editorRef.current?.focus();
  };

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

      <section className="relative grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(290px,0.37fr)_minmax(0,0.63fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-white/10 bg-[#101c2d] px-4 py-5 lg:border-b-0 lg:border-r lg:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-light-blue">Problem</p>
          <h2 className="mt-2 font-display text-2xl font-medium text-white">{assignment.title}</h2>
          <p className="mt-4 text-sm leading-6 text-slate-200">{assignment.statement}</p>
          <div className="mt-5 border-l-2 border-level-4/80 pl-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-level-4">Target</p><p className="mt-1 text-sm text-slate-200">{assignment.expectedComplexity}</p></div>
          <h3 className="mt-6 text-sm font-semibold text-white">Visible tests</h3>
          <div className="mt-2 space-y-2">{assignment.publicTests.map((test) => <article key={test.id} className="rounded-md border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5"><p className="font-sans font-semibold text-light-blue">{test.label}</p><p className="mt-1 text-slate-300">input: {JSON.stringify(test.input)}</p><p className="text-level-4">expected: {JSON.stringify(test.expected)}</p></article>)}</div>
        </aside>

        <section className="relative flex min-h-0 flex-col bg-[#07111f]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-light-blue"><span className="font-mono">solution.py</span><span>Autosave stays on this device until submission is implemented</span></div>
          <label className="sr-only" htmlFor="python-source">Python solution</label>
          <textarea id="python-source" ref={editorRef} value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 text-slate-100 outline-none caret-level-4 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-light-blue" aria-describedby="editor-help" />
          <p id="editor-help" className="sr-only">Python editor. Use the Run visible tests button to execute once sandbox access is enabled.</p>

          <section className="pointer-events-auto absolute right-3 top-3 z-10 w-36 overflow-hidden rounded-lg border border-white/15 bg-ink shadow-2xl sm:right-5 sm:top-5 sm:w-44" aria-label="Interviewer video">
            <div className="aspect-[4/3] bg-black"><SessionAvatar ref={avatarRef} config={avatarConfig} onSessionStateChange={(state) => setAvatarConnected(state === StreamingAvatarSessionState.CONNECTED)} /></div>
            <div className="border-t border-white/10 px-2.5 py-2 text-[11px] text-light-blue">Interviewer · live</div>
          </section>
        </section>
      </section>

      <section className="relative z-20 border-t border-white/10 bg-[#050a12]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"><button type="button" onClick={() => setTerminalOpen((open) => !open)} className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-light-blue"><TerminalSquare size={16} className="text-level-4" />Execution terminal<ChevronDown size={15} className={terminalOpen ? "rotate-180 transition-transform" : "transition-transform"} /></button><div className="flex gap-2"><Button size="sm" variant="flat" className="font-semibold text-white" onPress={runVisibleTests} startContent={<Play size={15} />}>Run visible tests</Button><Button size="sm" color="primary" isDisabled startContent={<Send size={15} />}>Submit & report</Button></div></div>
        {terminalOpen && <div className="max-h-40 overflow-y-auto border-t border-white/10 px-4 py-3 font-mono text-xs leading-5 text-slate-300 sm:px-6" aria-live="polite">{terminalLines.map((line, index) => <p key={`${line}-${index}`} className={line.startsWith(">") ? "text-level-4" : undefined}>{line}</p>)}</div>}
      </section>
    </main>
  );
}
