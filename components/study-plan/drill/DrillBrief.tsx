"use client";

/**
 * Presentational VOICE_DRILL brief: the scenario, the ONE live technique
 * reminder, the 60-90s target, and the results of COMPLETED attempts. An
 * open attempt never carries a score (the API returns null), so nothing
 * numeric can appear mid-drill.
 */
import { AudioLines, Lightbulb, Timer } from "lucide-react";

import type { VoiceDrillDTO } from "@/lib/study-plan/drill/types";

export default function DrillBrief({ drill }: { drill: VoiceDrillDTO }) {
  const completed = drill.attempts.filter((a) => a.completedAt !== null);
  return (
    <section className="rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(20,58,75,0.06)] sm:p-7">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">
        <AudioLines size={16} aria-hidden="true" /> Voice drill · {drill.competencyLabel}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-[#102331]">{drill.scenarioPrompt}</p>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#eaf7fa] p-3 text-sm text-[#173847]">
        <Lightbulb size={16} className="mt-0.5 shrink-0 text-[#0a7391]" aria-hidden="true" />
        <span>{drill.tipText}</span>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-[#58727f]">
        <Timer size={14} aria-hidden="true" /> About {drill.durationSeconds.minSeconds}-
        {drill.durationSeconds.maxSeconds} seconds, out loud. Graded once you finish.
      </p>
      {completed.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[#58727f]">Your finished attempts</p>
          <ul className="mt-2 flex flex-col gap-2">
            {completed.map((a) => (
              <li key={a.id} className="rounded-xl border border-[#dce8ed] p-3 text-sm text-[#385463]">
                <span className="font-semibold text-[#102331]">{a.score ?? "–"} / 5</span>
                {a.feedback ? <span> · Next time: {a.feedback}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
