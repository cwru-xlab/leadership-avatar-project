"use client";

/**
 * Slide-count-derived session length proposal (14-RESEARCH.md Pitfall 5).
 *
 * There is no prior art in this codebase for deriving a session length from
 * an uploaded artifact. The formula lives in `lib/pitch/session-length.ts`
 * and is Phase-14-local. The value shown here is a PROPOSAL the student may
 * adjust inside the MODE'S OWN envelope (`DeckMode.envelopeSeconds`, passed
 * in by the wizard — D19-1: never the investor's 20–30 min for every mode).
 * The server clamps again via `clampAdjustableBudget` at startSession, against
 * the type's `adjustableRangeSeconds`, which equals the same envelope.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { proposeDeckSeconds } from "@/lib/pitch/session-length";
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
  /**
   * This deck mode's own [floor, ceiling] in seconds — `deckMode.envelopeSeconds`
   * from lib/pitch/deck-modes.ts. Required so no mode silently inherits
   * another mode's range (D19-1).
   */
  envelopeSeconds: readonly [number, number];
  /** Wizard-owned value — must survive back/forward (reversible). */
  sessionLength: SessionLengthValue | null;
  onChange: (next: SessionLengthValue) => void;
}

export default function SessionLengthStep({
  nav,
  slideCount,
  envelopeSeconds,
  sessionLength,
  onChange,
}: SessionLengthStepProps) {
  const [FLOOR_SECONDS, CEILING_SECONDS] = envelopeSeconds;
  const FLOOR_MINUTES = FLOOR_SECONDS / 60;
  const CEILING_MINUTES = CEILING_SECONDS / 60;

  const clampMinutes = (value: number): number =>
    Math.min(CEILING_MINUTES, Math.max(FLOOR_MINUTES, Math.round(value)));

  const hasDeck =
    typeof slideCount === "number" &&
    Number.isFinite(slideCount) &&
    slideCount > 0;

  const proposedSeconds = useMemo(
    () =>
      hasDeck ? proposeDeckSeconds(slideCount!, envelopeSeconds) : FLOOR_SECONDS,
    [hasDeck, slideCount, envelopeSeconds, FLOOR_SECONDS],
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
          <h2
            id="session-length-heading"
            className="mt-1 font-display font-medium text-3xl tracking-[-0.03em]"
          >
            How long is this meeting?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted">
          {hasDeck
            ? `Based on your ${slideCount} slides we suggest ${proposedMinutes} minutes. Adjust it if you want.`
            : `Choose a length between ${FLOOR_MINUTES} and ${CEILING_MINUTES} minutes.`}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-white p-6 sm:p-9">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display font-medium text-4xl tracking-[-0.03em] text-ink">
            {minutes}{" "}
            <span className="text-xl font-sans font-medium text-muted">
              minutes
            </span>
          </p>
          <p className="text-xs text-muted">
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
            filler: "bg-true-blue",
            thumb: "bg-true-blue",
            track: "bg-line",
          }}
        />

        <p className="mt-5 text-sm leading-6 text-muted">
          This is a guide — you can keep going past it, and the overrun will be
          noted in your report.
        </p>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-6">
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
