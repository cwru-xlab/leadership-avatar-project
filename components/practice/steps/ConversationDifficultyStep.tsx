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

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="conversation-difficulty-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            id="conversation-difficulty-heading"
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
          >
            How hard should this be?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          One setting. Nothing else about this conversation is adjustable.
        </p>
      </div>

      <div className="grid gap-3" role="radiogroup" aria-label="Difficulty band">
        {DIFFICULTY_BANDS.map((band) => {
          const copy = BAND_COPY[band];
          const isSelected = selected === band;
          return (
            <button
              key={band}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(band)}
              className={`relative rounded-2xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${
                isSelected
                  ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]"
                  : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl tracking-[-0.02em] text-[#102331]">
                    {copy.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#58727f]">
                    {copy.description}
                  </p>
                </div>
                {isSelected && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#79d4b1] text-[#0b3029]">
                    <Check size={15} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-sm leading-6 text-[#58727f]">
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
