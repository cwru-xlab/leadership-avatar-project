import { ArrowUp, AudioLines } from "lucide-react";
import clsx from "clsx";

/**
 * Icon shown on every tap-to-record button WHILE recording.
 *
 * Client feedback (2026-11-14): the old crossed-out mic (MicOff) on a red
 * button read as "muted". While recording the button is now green (HeroUI
 * `success` = Blue Green #377E72, 4.8:1 with white) and the icon says what the
 * next tap does, never "muted".
 *
 * Variants under review with the client — flip RECORD_BUTTON_VARIANT to compare:
 * - "send":     arrow-up send icon (chat-app send affordance; default)
 * - "live-dot": pulsing white dot (voice-note "recording" dot)
 * - "waveform": audio-lines icon, gently pulsing (Slack/Discord voice clip)
 */
export type RecordButtonVariant = "send" | "live-dot" | "waveform";

export const RECORD_BUTTON_VARIANT: RecordButtonVariant = "send";

/** Tailwind classes for the green recording fill (non-HeroUI buttons). */
export const RECORDING_FILL_CLASS = "bg-level-4 hover:bg-level-4/90 text-white";

export function RecordingIcon({
  className = "w-5 h-5",
  variant = RECORD_BUTTON_VARIANT,
}: {
  className?: string;
  variant?: RecordButtonVariant;
}) {
  if (variant === "live-dot") {
    return (
      <span
        aria-hidden
        className={clsx("relative inline-flex items-center justify-center", className)}
      >
        <span className="absolute inline-flex h-1/2 w-1/2 rounded-full bg-white/70 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1/2 w-1/2 rounded-full bg-white" />
      </span>
    );
  }
  if (variant === "waveform") {
    return <AudioLines aria-hidden className={clsx(className, "motion-safe:animate-pulse")} />;
  }
  return <ArrowUp aria-hidden className={className} />;
}
