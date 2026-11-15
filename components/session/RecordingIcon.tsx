import { ArrowUp } from "lucide-react";

/**
 * Icon shown on every tap-to-record button WHILE recording.
 *
 * Client feedback (2026-11-14): the old crossed-out mic (MicOff) on a red
 * button read as "muted". While recording the button is now green (HeroUI
 * `success` = Blue Green #377E72, 4.8:1 with white) and the icon says what the
 * next tap does: an arrow-up send icon, like a chat app's send button.
 */

/** Tailwind classes for the green recording fill (non-HeroUI buttons). */
export const RECORDING_FILL_CLASS = "bg-level-4 hover:bg-level-4/90 text-white";

export function RecordingIcon({ className = "w-5 h-5" }: { className?: string }) {
  return <ArrowUp aria-hidden className={className} />;
}
