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
      <p className="flex items-center gap-1.5 text-[11px] leading-4 text-[#82a5b8]">
        <Gauge size={13} /> Aim for a measured, conversational pace: 100–159 words per minute.
      </p>
    );
  }

  return (
    <aside className="mt-8 flex gap-3 rounded-2xl border border-[#b9dbe5] bg-[#eaf7fa] p-4 text-sm leading-6 text-[#385463]">
      <Gauge className="mt-0.5 shrink-0 text-[#0a7391]" size={18} />
      <div>
        <p className="font-semibold text-[#173847]">Set a measured pace</p>
        <p className="mt-1">
          During your answers, aim for a conversational pace of roughly 100–159
          words per minute. Pause when you need a moment to think.
        </p>
      </div>
    </aside>
  );
}
