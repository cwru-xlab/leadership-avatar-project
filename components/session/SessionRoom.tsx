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

/**
 * The full-viewport room: dark background and the two radial glows. Below the
 * lg breakpoint the panes stack — avatar stage on top, conversation filling
 * the rest with its own scroll — so a phone never gets two squeezed columns.
 */
export function SessionRoom({
  children,
  className = "relative flex h-[100dvh] flex-col overflow-hidden bg-ink text-canvas lg:flex-row",
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
  className = "relative flex h-[40dvh] min-h-[240px] shrink-0 flex-col lg:h-full lg:w-[64%] lg:flex-1",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

/** Right pane: status, conversation and the answer controls. */
export function SessionSidePane({
  children,
  className = "relative z-10 flex min-h-0 w-full flex-1 flex-col border-t border-white/10 bg-ink/95 lg:h-full lg:w-[36%] lg:max-w-[570px] lg:flex-none lg:border-l lg:border-t-0",
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

/** The green-dot pill in the stage header ("Live interview"). */
export function SessionLiveBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/15 bg-ink/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-level-4" />
      {label}
    </div>
  );
}

/**
 * Eyebrow, title, subtitle and the elapsed-time chip. `clockLabel` (optional)
 * replaces the chip's text, e.g. for a countdown; without it the chip shows
 * the elapsed time exactly as before.
 */
export function SessionStatus({
  eyebrow,
  title,
  subtitle,
  elapsedSeconds,
  clockLabel,
  clockAriaLabel,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  elapsedSeconds: number;
  clockLabel?: string;
  clockAriaLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="hidden text-[11px] font-semibold text-light-blue sm:block">{eyebrow}</p>
        <h1 className="font-display text-xl font-medium tracking-[-0.02em] text-white sm:mt-1 sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-light-blue sm:mt-1.5">{subtitle}</p>
      </div>
      <Chip
        size="sm"
        variant="flat"
        className="border border-light-blue/40 bg-ink text-light-blue"
        aria-label={clockAriaLabel}
      >
        {clockLabel ?? formatElapsed(elapsedSeconds)}
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
  idleLabel = "Tap to record",
  recordingLabel = "Tap again to send",
  submittedLabel = "Answer submitted",
  startAriaLabel = "Start recording answer",
  stopAriaLabel = "Stop recording and send answer",
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  idleLabel?: string;
  recordingLabel?: string;
  submittedLabel?: string;
  startAriaLabel?: string;
  stopAriaLabel?: string;
}) {
  // Tap-to-send (dev #37): one tap starts the recording, the next sends it.
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={isRecording || isTranscribing ? "solid" : "flat"}
        color={isRecording ? "danger" : isTranscribing ? "primary" : "default"}
        className="font-medium text-white"
        isDisabled={isDisabled}
        isLoading={isTranscribing}
        onPress={onToggle}
        aria-label={
          isTranscribing
            ? "Recorded answer submitted for transcription"
            : isRecording
              ? stopAriaLabel
              : startAriaLabel
        }
        startContent={isRecording ? <MicOff size={15} /> : <Mic size={15} />}
      >
        {isTranscribing ? submittedLabel : isRecording ? recordingLabel : idleLabel}
      </Button>
    </div>
  );
}
