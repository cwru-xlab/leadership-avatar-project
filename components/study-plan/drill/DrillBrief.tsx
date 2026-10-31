"use client";

/**
 * Presentational VOICE_DRILL brief: the coach, the scenario, the ONE live
 * technique reminder, the 60-90s target, the results of COMPLETED attempts,
 * and the one start action. An open attempt never carries a score (the API
 * returns null), so nothing numeric can appear mid-drill.
 */
import { AudioLines, Hash, Lightbulb, Mic, Timer, TrendingUp } from "lucide-react";

import { useCoachPortrait } from "@/components/study-plan/useCoachPortrait";
import type { VoiceDrillDTO } from "@/lib/study-plan/drill/types";

export default function DrillBrief({
  drill,
  coachName,
  coachAvatarId,
  worthPct,
  startLabel,
  canStart,
  onStart,
}: {
  drill: VoiceDrillDTO;
  coachName: string | null;
  coachAvatarId: string | null;
  worthPct: number;
  startLabel: string;
  canStart: boolean;
  onStart: () => void;
}) {
  const completed = drill.attempts.filter((a) => a.completedAt !== null);
  const portrait = useCoachPortrait(coachAvatarId);
  const name = coachName ?? "Your coach";

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <span className="relative">
        <span className="grid size-24 place-items-center overflow-hidden rounded-full bg-light-blue font-display text-2xl font-medium text-cwru-blue shadow-[0_0_0_6px_white,0_0_0_8px_var(--la-light-blue)]">
          {portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${name}, your coach`} className="size-full object-cover" src={portrait} />
          ) : (
            name
          )}
        </span>
        <span className="absolute -bottom-0.5 -right-1.5 grid size-8 place-items-center rounded-full bg-cwru-blue text-white shadow-[0_0_0_3px_white]">
          <AudioLines aria-hidden size={17} strokeWidth={2} />
        </span>
      </span>

      <span className="inline-flex items-center gap-1.5 rounded-full bg-light-blue/32 px-3 py-1 text-[12.5px] font-semibold text-cwru-blue">
        <Mic aria-hidden size={14} strokeWidth={2} />
        Voice drill · {drill.competencyLabel}
      </span>

      <p className="max-w-[40ch] whitespace-pre-wrap font-display text-xl italic leading-[1.4] text-ink md:text-[25px]">
        “{drill.scenarioPrompt}”
      </p>

      <div className="flex w-full max-w-xl items-center gap-3.5 rounded-2xl border border-level-2/45 bg-level-2/10 px-5 py-4 text-left">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-level-2">
          <Lightbulb aria-hidden size={21} strokeWidth={1.75} />
        </span>
        <span className="flex flex-col">
          <span className="text-[12.5px] font-semibold text-muted">Technique to try</span>
          <span className="text-base font-semibold text-ink">{drill.tipText}</span>
        </span>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {[
          { icon: Timer, text: `${drill.durationSeconds.minSeconds}–${drill.durationSeconds.maxSeconds} seconds, out loud` },
          { icon: Mic, text: "Microphone needed" },
          { icon: Hash, text: "No score while you talk" },
          { icon: TrendingUp, text: `Worth ${worthPct}% of a session` },
        ].map(({ icon: Icon, text }) => (
          <span
            key={text}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink"
          >
            <Icon aria-hidden size={14} />
            {text}
          </span>
        ))}
      </div>

      <button
        aria-describedby="drill-start-note"
        className="group mt-2 flex flex-col items-center gap-3 rounded-2xl p-2 focus-visible:outline-true-blue disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canStart}
        type="button"
        onClick={onStart}
      >
        <span className="relative grid size-[84px] place-items-center">
          <span aria-hidden className="absolute -inset-2.5 rounded-full bg-light-blue/45" />
          <span className="relative grid size-[84px] place-items-center rounded-full bg-cwru-blue text-white shadow-[0_6px_0_var(--la-dark-blue)] transition-transform duration-150 ease-out group-active:translate-y-0.5">
            <Mic aria-hidden size={34} strokeWidth={2} />
          </span>
        </span>
        <span className="text-[15px] font-bold text-cwru-blue">{startLabel}</span>
      </button>
      <p className="text-[13px] text-muted" id="drill-start-note">
        {name} sets the scene out loud, then you answer and try the technique.
      </p>

      {completed.length > 0 ? (
        <div className="flex w-full max-w-xl flex-col gap-2 text-left">
          <p className="text-[13px] font-semibold text-muted">Finished attempts</p>
          <ul className="flex flex-col gap-2">
            {completed.map((a) => {
              const names = (a.retryFocuses ?? []).map((f) => f.techniqueName);
              if (names.length === 0 && a.retryFocus) names.push(a.retryFocus.techniqueName);
              return (
                <li key={a.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink">
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
