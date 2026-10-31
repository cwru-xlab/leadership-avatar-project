"use client";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";

import CoachedMomentPanel from "./CoachedMomentPanel";
import { formatMomentDate } from "./format-moment-date";

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
  /**
   * Set when the coach has already closed the current part but the student
   * has not moved on yet (e.g. after a reload). The brief then says the part
   * is done and what comes next, instead of looking like a fresh start.
   */
  progress?: { partDone: 1 | 2; next: "SECOND_MOMENT" | "SUMMARY" } | null;
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
  progress = null,
}: CoachedBriefCardProps) {
  const pct = Math.round((worth.coachedWeight / worth.unaidedWeight) * 100);
  const momentDate = formatMomentDate(moment.sessionDate);

  return (
    <section aria-labelledby="coached-brief-heading" className="space-y-5">
      <div>
        <h1 id="coached-brief-heading" className="font-display font-medium text-2xl text-ink">
          {competencyLabel}
        </h1>
        <p className="mt-1 text-sm text-muted">{competencyDescription}</p>
      </div>

      {progress ? (
        <p
          role="status"
          data-testid="coached-brief-progress"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          {`Part ${progress.partDone} done — next: ${
            progress.next === "SECOND_MOMENT" ? "your second moment" : "your graded summary"
          }`}
        </p>
      ) : null}

      <div className="space-y-2">
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

      <Card className="border border-line">
        <CardBody className="space-y-2 p-5 text-sm leading-6 text-ink">
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
