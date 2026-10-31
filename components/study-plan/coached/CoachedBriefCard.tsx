"use client";

import { Mic, MessagesSquare, TrendingUp } from "lucide-react";
import { Spinner } from "@heroui/spinner";

import CoachedMomentPanel from "./CoachedMomentPanel";
import { formatMomentDate } from "./format-moment-date";
import { useCoachPortrait } from "@/components/study-plan/useCoachPortrait";

/**
 * Pre-entry brief. Nothing auto-starts: the avatar is mounted only after the
 * student presses the single button here (consent).
 */

export interface CoachedBriefCardProps {
  coachName: string;
  /** For the coach's portrait; the name shows until it loads. */
  coachAvatarId?: string;
  competencyLabel: string;
  competencyDescription: string;
  moment: { counterpartLine: string | null; studentLine: string; sessionDate: string };
  momentFraming: "REWORK" | "REFINEMENT";
  legCount: 1 | 2;
  worth: { coachedWeight: number; unaidedWeight: number };
  onStart: () => void;
  starting: boolean;
  resuming: boolean;
  /**
   * Set when the coach has already closed the current part but the student
   * has not moved on yet (e.g. after a reload). The brief then says the part
   * is done and what comes next, instead of looking like a fresh start.
   */
  progress?: { partDone: 1 | 2; next: "SECOND_MOMENT" | "SUMMARY" } | null;
}

export default function CoachedBriefCard({
  coachName,
  coachAvatarId,
  competencyLabel,
  competencyDescription,
  moment,
  momentFraming,
  legCount,
  worth,
  onStart,
  starting,
  resuming,
  progress = null,
}: CoachedBriefCardProps) {
  const pct = Math.round((worth.coachedWeight / worth.unaidedWeight) * 100);
  const momentDate = formatMomentDate(moment.sessionDate);

  const portrait = useCoachPortrait(coachAvatarId ?? null);

  return (
    <section aria-labelledby="coached-brief-heading" className="flex flex-col items-center gap-5 text-center">
      <span className="relative">
        <span className="grid size-24 place-items-center overflow-hidden rounded-full bg-light-blue font-display text-2xl font-medium text-cwru-blue shadow-[0_0_0_6px_white,0_0_0_8px_var(--la-light-blue)]">
          {portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${coachName}, your coach`} className="size-full object-cover" src={portrait} />
          ) : (
            coachName
          )}
        </span>
        <span className="absolute -bottom-0.5 -right-1.5 grid size-8 place-items-center rounded-full bg-cwru-blue text-white shadow-[0_0_0_3px_white]">
          <MessagesSquare aria-hidden size={16} strokeWidth={2} />
        </span>
      </span>

      <span className="inline-flex items-center gap-1.5 rounded-full bg-light-blue/32 px-3 py-1 text-[12.5px] font-semibold text-cwru-blue">
        <MessagesSquare aria-hidden size={14} strokeWidth={2} />
        Coached practice
      </span>

      <div className="flex flex-col gap-1">
        <h1 id="coached-brief-heading" className="font-display text-[28px] font-medium leading-tight text-cwru-blue">
          {competencyLabel}
        </h1>
        <p className="text-sm text-muted">{competencyDescription}</p>
      </div>

      {progress ? (
        <p
          role="status"
          data-testid="coached-brief-progress"
          className="rounded-xl border border-level-4/40 bg-level-4/10 px-4 py-3 text-sm font-semibold text-ink"
        >
          {`Part ${progress.partDone} done — next: ${
            progress.next === "SECOND_MOMENT" ? "your second moment" : "your graded summary"
          }`}
        </p>
      ) : null}

      <div className="flex w-full max-w-[65ch] flex-col gap-2 text-left">
        <p className="text-sm font-semibold text-ink">
          {progress ? "The moment you just reworked" : "The moment you will rework"}
          {momentDate ? `, from your session on ${momentDate}` : ""}
        </p>
        <CoachedMomentPanel
          counterpartLine={moment.counterpartLine}
          studentLine={moment.studentLine}
        />
        {momentFraming === "REFINEMENT" ? (
          <p className="text-sm text-ink">
            This was one of your stronger moments on this skill, so the work here is sharpening
            it, not fixing it.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {[
          { icon: MessagesSquare, text: legCount === 2 ? "Two moments" : "One moment" },
          { icon: Mic, text: "Microphone needed" },
          { icon: TrendingUp, text: `Worth: ${pct}% of an unaided practice session toward ${competencyLabel}.` },
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
        className="group mt-1 flex flex-col items-center gap-3 rounded-2xl p-2 focus-visible:outline-true-blue disabled:cursor-not-allowed disabled:opacity-50"
        disabled={starting}
        type="button"
        onClick={onStart}
      >
        <span className="relative grid size-[84px] place-items-center">
          <span aria-hidden className="absolute -inset-2.5 rounded-full bg-light-blue/45" />
          <span className="relative grid size-[84px] place-items-center rounded-full bg-cwru-blue text-white shadow-[0_6px_0_var(--la-dark-blue)] transition-transform duration-150 ease-out group-active:translate-y-0.5">
            {starting ? <Spinner color="white" size="sm" /> : <Mic aria-hidden size={34} strokeWidth={2} />}
          </span>
        </span>
        <span className="text-[15px] font-bold text-cwru-blue">
          {resuming ? `Continue with ${coachName}` : `Start with ${coachName}`}
        </span>
      </button>
      <p className="max-w-[56ch] text-[13px] text-muted">
        You will talk it through with {coachName}, then say a better version out loud.{" "}
        {legCount === 2
          ? "Then you will do the same with a second moment of yours."
          : "There was not a second moment in your sessions clear enough to use, so this session has one part."}{" "}
        You answer by speaking, not typing.
      </p>
    </section>
  );
}
