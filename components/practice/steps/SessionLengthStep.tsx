"use client";

/**
 * Slide-count-derived session length proposal (14-RESEARCH.md Pitfall 5).
 *
 * There is no prior art in this codebase for deriving a session length from
 * an uploaded artifact. The formula lives in `lib/pitch/session-length.ts`
 * and is Phase-14-local. The value shown here is a PROPOSAL the student may
 * adjust inside the 20–30 minute envelope; the server clamps again via
 * `clampAdjustableBudget` at startSession.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import {
  DECK_ENVELOPE_SECONDS,
  proposeDeckSeconds,
} from "@/lib/pitch/session-length";
import { Button } from "@heroui/button";
import { Slider } from "@heroui/slider";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";

export type SessionLengthValue = {
  budgetSeconds: number;
};

export interface SessionLengthStepProps {
  nav: SetupStepNav;
  /** Slide count from the deck-upload wizard state (may be missing). */
  slideCount: number | null;
  /** Wizard-owned value — must survive back/forward (reversible). */
  sessionLength: SessionLengthValue | null;
  onChange: (next: SessionLengthValue) => void;
}

const [FLOOR_SECONDS, CEILING_SECONDS] = DECK_ENVELOPE_SECONDS;
const FLOOR_MINUTES = FLOOR_SECONDS / 60;
const CEILING_MINUTES = CEILING_SECONDS / 60;

function clampMinutes(minutes: number): number {
  return Math.min(CEILING_MINUTES, Math.max(FLOOR_MINUTES, Math.round(minutes)));
}

export default function SessionLengthStep({
  nav,
  slideCount,
  sessionLength,
  onChange,
}: SessionLengthStepProps) {
  const hasDeck =
    typeof slideCount === "number" &&
    Number.isFinite(slideCount) &&
    slideCount > 0;

  const proposedSeconds = useMemo(
    () => (hasDeck ? proposeDeckSeconds(slideCount!) : FLOOR_SECONDS),
    [hasDeck, slideCount],
  );

  const initialMinutes = clampMinutes(
    (sessionLength?.budgetSeconds ?? proposedSeconds) / 60,
  );

  const [minutes, setMinutes] = useState(initialMinutes);

  const proposedMinutes = Math.round(proposedSeconds / 60);

  const commitAndAdvance = () => {
    const next = clampMinutes(minutes);
    onChange({ budgetSeconds: next * 60 });
    nav.goNext();
  };

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="session-length-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            id="session-length-heading"
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
          >
            How long is this meeting?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          {hasDeck
            ? `Based on your ${slideCount} slides we suggest ${proposedMinutes} minutes. Adjust it if you want.`
            : `Choose a length between ${FLOOR_MINUTES} and ${CEILING_MINUTES} minutes.`}
        </p>
      </div>

      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-serif text-4xl tracking-[-0.03em] text-[#102331]">
            {minutes}{" "}
            <span className="text-xl font-sans font-medium text-[#58727f]">
              minutes
            </span>
          </p>
          <p className="text-xs text-[#6a8491]">
            {FLOOR_MINUTES}–{CEILING_MINUTES} min
          </p>
        </div>

        <Slider
          aria-label="Session length in minutes"
          className="mt-6"
          minValue={FLOOR_MINUTES}
          maxValue={CEILING_MINUTES}
          step={1}
          value={minutes}
          onChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            if (typeof next === "number") setMinutes(clampMinutes(next));
          }}
          classNames={{
            filler: "bg-[#0a7391]",
            thumb: "bg-[#0a7391]",
            track: "bg-[#d4e2e9]",
          }}
        />

        <p className="mt-5 text-sm leading-6 text-[#58727f]">
          This is a guide — you can keep going past it, and the overrun will be
          noted in your report.
        </p>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button
            variant="light"
            onPress={() => {
              onChange({ budgetSeconds: clampMinutes(minutes) * 60 });
              nav.goBack();
            }}
          >
            Back
          </Button>
          <Button
            color="primary"
            endContent={<ArrowRight size={17} />}
            onPress={commitAndAdvance}
          >
            Continue
          </Button>
        </div>
      </div>
    </section>
  );
}
