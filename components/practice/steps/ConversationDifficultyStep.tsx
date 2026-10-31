"use client";

/**
 * The one tuning dial for difficult-conversation — three bands, nothing else.
 * Chosen here, then hidden entirely for the live session (no meter, no badge).
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import {
  DIFFICULTY_BANDS,
  type DifficultyBand,
} from "@/lib/difficult-conversation/types";
import { Button } from "@heroui/button";
import { ArrowRight, Check } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";

export interface ConversationDifficultyStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward. */
  difficulty: DifficultyBand | null;
  /** Record default — used when the student has not yet chosen. */
  defaultDifficulty: DifficultyBand;
  onSelect: (band: DifficultyBand) => void;
}

const BAND_COPY: Record<
  DifficultyBand,
  { title: string; description: string }
> = {
  receptive: {
    title: "Receptive",
    description: "Defensive but reachable.",
  },
  guarded: {
    title: "Guarded",
    description: "Deflects, needs to be pinned down.",
  },
  hostile: {
    title: "Hostile",
    description: "Counter-attacks and has a bottom line they will state late.",
  },
};

export default function ConversationDifficultyStep({
  nav,
  difficulty,
  defaultDifficulty,
  onSelect,
}: ConversationDifficultyStepProps) {
  const selected = difficulty ?? defaultDifficulty;
  const bandRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // WAI-ARIA radio group: one tab stop (the checked band), arrow keys move
  // focus AND selection, wrapping at the ends (UAT D15-4).
  const handleBandKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + DIFFICULTY_BANDS.length) % DIFFICULTY_BANDS.length;
    onSelect(DIFFICULTY_BANDS[next]);
    bandRefs.current[next]?.focus();
  };

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="conversation-difficulty-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="conversation-difficulty-heading"
            className="mt-1 font-display font-medium text-3xl tracking-[-0.03em]"
          >
            How hard should this be?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted">
          One setting. Nothing else about this conversation is adjustable.
        </p>
      </div>

      <div className="grid gap-3" role="radiogroup" aria-label="Difficulty band">
        {DIFFICULTY_BANDS.map((band, index) => {
          const copy = BAND_COPY[band];
          const isSelected = selected === band;
          return (
            <button
              key={band}
              ref={(node) => {
                bandRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(band)}
              onKeyDown={(event) => handleBandKeyDown(event, index)}
              className={`relative rounded-xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-true-blue ${
                isSelected
                  ? "border-true-blue bg-light-blue/22"
                  : "border-line bg-white hover:border-true-blue/50 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-medium text-xl tracking-[-0.02em] text-ink">
                    {copy.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {copy.description}
                  </p>
                </div>
                {isSelected && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-level-4 text-ink">
                    <Check size={15} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-sm leading-6 text-muted">
        You won&apos;t see this setting again once you start — you&apos;ll have
        to read them.
      </p>

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <Button variant="light" onPress={nav.goBack}>
          Back
        </Button>
        <Button
          color="primary"
          endContent={<ArrowRight size={17} />}
          onPress={nav.goNext}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
