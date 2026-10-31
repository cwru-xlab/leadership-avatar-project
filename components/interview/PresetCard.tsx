"use client";

import type { ReactNode } from "react";
import { Briefcase, Check, Clock3, Cpu, GraduationCap, Lightbulb, type LucideIcon } from "lucide-react";
import type { InterviewType } from "@/lib/interview/types";

/** One picture per preset; an unknown slug falls back to the briefcase. */
const PRESET_ICONS: Record<string, LucideIcon> = {
  general: Briefcase,
  technical: Cpu,
  consulting: Lightbulb,
  "early-career": GraduationCap,
};

/**
 * A single preset card in the picker index (`app/interview/page.tsx`).
 *
 * Shows the preset's label, one-line description, difficulty, rough length
 * and question areas — everything a student needs to distinguish a preset
 * before committing to a ~20-minute session (REQ-18). The active preset's
 * card also hosts the Customize affordance and the Start button, passed in
 * as `children` so this component stays a pure display shell.
 */
export default function PresetCard({
  interviewType,
  active,
  onSelect,
  children,
}: {
  interviewType: InterviewType;
  active: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  const Icon = PRESET_ICONS[interviewType.slug] ?? Briefcase;
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl p-5 transition-colors duration-150 ease-out ${
        active ? "border-2 border-true-blue bg-light-blue/22" : "border border-line bg-white hover:border-true-blue/50"
      }`}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className="flex w-full flex-col gap-3 rounded-lg text-left focus-visible:outline-true-blue"
      >
        <div className="flex items-center gap-3.5">
          <span
            className={`grid size-12 shrink-0 place-items-center rounded-[14px] ${
              active ? "bg-cwru-blue text-white" : "bg-light-blue/35 text-cwru-blue"
            }`}
          >
            <Icon aria-hidden size={24} strokeWidth={1.75} />
          </span>
          <h3 className="flex-1 font-display text-[22px] font-medium leading-tight text-cwru-blue">
            {interviewType.label}
          </h3>
          {active ? (
            <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-true-blue text-white">
              <Check aria-hidden size={15} strokeWidth={3} />
            </span>
          ) : (
            <span aria-hidden className="size-[26px] shrink-0 rounded-full border-2 border-line" />
          )}
        </div>
        <p className="text-[14.5px] leading-6 text-muted">{interviewType.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-light-blue/32 px-2.5 py-1 text-xs font-semibold capitalize text-cwru-blue">
            {interviewType.difficulty}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-light-blue/32 px-2.5 py-1 text-xs font-semibold text-cwru-blue">
            <Clock3 aria-hidden size={13} />
            {`~${interviewType.targetMinutes} min`}
          </span>
          {interviewType.questionAreas?.map((area) => (
            <span key={area} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink">
              {area}
            </span>
          ))}
        </div>
      </button>

      {active && children}
    </div>
  );
}
