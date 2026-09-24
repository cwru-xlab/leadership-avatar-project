"use client";

import type { ReactNode } from "react";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Check, Clock3 } from "lucide-react";
import type { InterviewType } from "@/lib/interview/types";

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
  return (
    <Card
      className={`border shadow-none transition-colors ${
        active ? "border-[#0a7391] bg-[#edf9fc]" : "border-[#d4e2e9] bg-white"
      }`}
    >
      <CardBody className="gap-4 p-6">
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          className="flex w-full flex-col gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-2xl tracking-[-0.02em] text-[#102331]">
              {interviewType.label}
            </h3>
            {active && (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0a7391] text-white">
                <Check size={14} />
              </span>
            )}
          </div>
          <p className="text-[15px] leading-6 text-[#526c7b]">{interviewType.description}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="flat" className="bg-[#e0f3f9] text-[#08718d]">
              {interviewType.difficulty}
            </Chip>
            <Chip
              size="sm"
              variant="flat"
              className="gap-1 bg-[#e0f3f9] text-[#08718d]"
              startContent={<Clock3 size={13} />}
            >
              {`~${interviewType.targetMinutes} min`}
            </Chip>
          </div>
          {interviewType.questionAreas && interviewType.questionAreas.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs text-[#58727f]">
              {interviewType.questionAreas.map((area) => (
                <li
                  key={area}
                  className="rounded-full border border-[#d4e2e9] bg-[#f5f8fa] px-2.5 py-1"
                >
                  {area}
                </li>
              ))}
            </ul>
          )}
        </button>

        {active && children}
      </CardBody>
    </Card>
  );
}
