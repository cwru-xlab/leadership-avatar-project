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
    <section className="rounded-xl border border-line bg-white p-5 sm:p-7">
      <p className="flex items-center gap-2 text-xs font-bold text-true-blue">
        <AudioLines size={16} aria-hidden="true" /> Voice drill · {drill.competencyLabel}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-ink">{drill.scenarioPrompt}</p>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-canvas p-3 text-sm text-ink">
        <Lightbulb size={16} className="mt-0.5 shrink-0 text-true-blue" aria-hidden="true" />
        <span>{drill.tipText}</span>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <Timer size={14} aria-hidden="true" /> About {drill.durationSeconds.minSeconds}-
        {drill.durationSeconds.maxSeconds} seconds, out loud. Graded once you finish.
      </p>
      {completed.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-bold text-muted">Finished attempts</p>
          <ul className="mt-2 flex flex-col gap-2">
            {completed.map((a) => {
              const names = (a.retryFocuses ?? []).map((f) => f.techniqueName);
              if (names.length === 0 && a.retryFocus) names.push(a.retryFocus.techniqueName);
              return (
                <li key={a.id} className="rounded-xl border border-line p-3 text-sm text-ink">
                  <span className="font-semibold text-ink">{a.score ?? "–"} / 5</span>
                  {names.length > 0 ? <span> · I would focus on {names.join(" and ")}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
