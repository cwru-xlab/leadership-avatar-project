"use client";

/**
 * Presentational chrome of the live session room (Phase 22 G4,
 * 22-SHARED-SHELL-DECISION.md), moved verbatim out of
 * `components/practice/PracticeSessionShell.tsx` so the coached shell renders
 * the same room: the dark two-pane frame (avatar stage left, conversation
 * right), the LIVE badge, the status header with the elapsed clock, and the
 * push-to-talk control with its hold-Space hint.
 *
 * Every default className here is the practice shell's string, byte for byte;
 * the optional `className` overrides exist so a caller can change the frame's
 * responsive behaviour without the practice room changing at all.
 *
 * REQ-85: nothing here renders a meter, a level indicator or a score.
 */

import type { ReactNode } from "react";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Mic, MicOff } from "lucide-react";

export function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The full-viewport room: dark background and the two radial glows. */
export function SessionRoom({
  children,
  className = "relative flex h-[100dvh] overflow-hidden bg-[#07131f] text-[#f4f8fb]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={className}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(83,169,222,0.20),transparent_28%),radial-gradient(circle_at_90%_95%,rgba(13,113,142,0.18),transparent_32%)]" />
      {children}
    </main>
  );
}

/** Left pane: the avatar stage, its header and the self-view. */
export function SessionStagePane({
  children,
  className = "relative flex h-full flex-1 flex-col lg:w-[64%]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

/** Right pane: status, conversation and the answer controls. */
export function SessionSidePane({
  children,
  className = "relative z-10 flex h-full w-full max-w-[570px] flex-col border-l border-white/10 bg-[#0b1c2a]/95 lg:w-[36%]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <aside className={className}>{children}</aside>;
}

/** Overlay header across the top of the stage pane. */
export function SessionStageHeader({ children }: { children: ReactNode }) {
  return (
    <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-4 sm:px-7">
      {children}
    </header>
  );
}

/** The green-dot pill in the stage header ("LIVE INTERVIEW"). */
export function SessionLiveBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#07131f]/65 px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-[#d3e7f5] backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-[#72d6b0]" />
      {label}
    </div>
  );
}

/** Eyebrow, title, subtitle and the elapsed-time chip. */
export function SessionStatus({
  eyebrow,
  title,
  subtitle,
  elapsedSeconds,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  elapsedSeconds: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#75cce4]">{eyebrow}</p>
        <h1 className="mt-1 font-serif text-2xl tracking-[-0.02em] text-white">{title}</h1>
        <p className="mt-1.5 text-sm text-[#a7c2d2]">{subtitle}</p>
      </div>
      <Chip size="sm" variant="flat" className="border border-[#31596d] bg-[#102b3a] text-[#bfe5f2]">
        {formatElapsed(elapsedSeconds)}
      </Chip>
    </div>
  );
}

/**
 * The tap-to-record button and, when `showSpaceHint`, the "or hold Space to
 * talk" hint. Tap starts, tap again stops and sends; hold-Space is wired by
 * `useHoldToTalkKey`.
 */
export function PushToTalkControl({
  isRecording,
  isTranscribing,
  isDisabled,
  onToggle,
  showSpaceHint,
  idleLabel = "Tap to record",
  recordingLabel = "Tap again to send",
  startAriaLabel = "Start recording answer",
  stopAriaLabel = "Stop recording and send answer",
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  showSpaceHint: boolean;
  idleLabel?: string;
  recordingLabel?: string;
  startAriaLabel?: string;
  stopAriaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={isRecording ? "solid" : "flat"}
        color={isRecording ? "danger" : "default"}
        className="font-medium text-[#d7eaf3]"
        isDisabled={isDisabled}
        onPress={onToggle}
        aria-label={isRecording ? stopAriaLabel : startAriaLabel}
        startContent={isRecording ? <MicOff size={15} /> : <Mic size={15} />}
      >
        {isTranscribing ? "Transcribing…" : isRecording ? recordingLabel : idleLabel}
      </Button>
      {showSpaceHint ? (
        <span className="hidden text-[11px] leading-4 text-[#82a5b8] sm:inline">
          or hold <kbd className="rounded border border-white/20 bg-white/5 px-1 py-0.5 font-sans text-[10px] text-[#d7eaf3]">Space</kbd> to talk
        </span>
      ) : null}
    </div>
  );
}
