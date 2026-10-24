"use client";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";

import CoachedMomentPanel from "./CoachedMomentPanel";

/**
 * Pre-entry brief. Nothing auto-starts: the avatar is mounted only after the
 * student presses the single button here (consent).
 */

export interface CoachedBriefCardProps {
  coachName: string;
  competencyLabel: string;
  competencyDescription: string;
  moment: { counterpartLine: string | null; studentLine: string; sessionDate: string };
  momentFraming: "REWORK" | "REFINEMENT";
  legCount: 1 | 2;
  worth: { coachedWeight: number; unaidedWeight: number };
  onStart: () => void;
  starting: boolean;
  resuming: boolean;
}

export default function CoachedBriefCard({
  coachName,
  competencyLabel,
  competencyDescription,
  moment,
  momentFraming,
  legCount,
  worth,
  onStart,
  starting,
  resuming,
}: CoachedBriefCardProps) {
  const pct = Math.round((worth.coachedWeight / worth.unaidedWeight) * 100);

  return (
    <section aria-labelledby="coached-brief-heading" className="space-y-5">
      <div>
        <h1 id="coached-brief-heading" className="font-serif text-2xl text-[#102331]">
          {competencyLabel}
        </h1>
        <p className="mt-1 text-sm text-[#58727f]">{competencyDescription}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#385463]">
          The moment you will rework, from your session on {moment.sessionDate}
        </p>
        <CoachedMomentPanel
          counterpartLine={moment.counterpartLine}
          studentLine={moment.studentLine}
        />
        {momentFraming === "REFINEMENT" ? (
          <p className="text-sm text-[#385463]">
            This was one of your stronger moments on this skill, so the work here is sharpening
            it, not fixing it.
          </p>
        ) : null}
      </div>

      <Card className="border border-[#dce8ed]">
        <CardBody className="space-y-2 p-5 text-sm leading-6 text-[#385463]">
          <p>
            You will talk it through with {coachName}, then say a better version out loud.
          </p>
          {legCount === 2 ? (
            <p>Then you will do the same with a second moment of yours.</p>
          ) : (
            <p>
              There was not a second moment in your sessions clear enough to use, so this session
              has one part.
            </p>
          )}
          <p>
            Worth: {pct}% of an unaided practice session toward {competencyLabel}.
          </p>
          <p>You will need a microphone. You answer by speaking, not typing.</p>
        </CardBody>
      </Card>

      <Button color="primary" isDisabled={starting} onPress={onStart}>
        {starting ? (
          <Spinner size="sm" />
        ) : resuming ? (
          `Continue with ${coachName}`
        ) : (
          `Start with ${coachName}`
        )}
      </Button>
    </section>
  );
}
