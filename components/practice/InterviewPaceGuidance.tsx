import { Gauge } from "lucide-react";

export type InterviewPaceGuidanceVariant = "setup" | "live";

interface InterviewPaceGuidanceProps {
  variant: InterviewPaceGuidanceVariant;
}

/**
 * Interview-only pace cue. The composing page chooses where it appears so the
 * shared setup wizard and session shell remain independent of interaction slugs.
 */
export default function InterviewPaceGuidance({
  variant,
}: InterviewPaceGuidanceProps) {
  if (variant === "live") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] leading-4 text-light-blue">
        <Gauge size={13} /> Aim for a measured, conversational pace: 100–159 words per minute.
      </p>
    );
  }

  return (
    <aside className="mt-8 flex gap-3 rounded-xl border border-light-blue bg-canvas p-4 text-sm leading-6 text-ink">
      <Gauge className="mt-0.5 shrink-0 text-true-blue" size={18} />
      <div>
        <p className="font-semibold text-ink">Set a measured pace</p>
        <p className="mt-1">
          During your answers, aim for a conversational pace of roughly 100–159
          words per minute. Pause when you need a moment to think.
        </p>
      </div>
    </aside>
  );
}
