"use client";

/**
 * Topic + difficulty intake for the coding room.
 *
 * Both fields are deliberately OPTIONAL. Selection widens rather than failing
 * (`lib/technical-interview/selection.ts`), so "no preference" is a real
 * answer that means the old uniform draw over the whole catalog — not an empty
 * pool. A student who does not know what to practise should not have to guess.
 *
 * Topics are multi-select because one problem legitimately carries several
 * tags, and asking for "graphs or trees" is a wider, more satisfiable request
 * than either alone. Difficulty is single-select: asking for two levels at
 * once is the same as asking for none.
 *
 * The chosen values are not a promise. If the catalog has nothing at the exact
 * pair, the server serves the nearest match and records that it widened, so
 * this step must not claim the student will get precisely what they picked.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import {
  TECHNICAL_CODING_LANGUAGES,
  TECHNICAL_CODING_LANGUAGE_LABEL,
  TECHNICAL_DIFFICULTIES,
  TECHNICAL_TOPICS,
  type TechnicalCodingLanguage,
  type TechnicalDifficulty,
  type TechnicalTopic,
} from "@/lib/technical-interview/types";
import { Button } from "@heroui/button";
import { ArrowRight, Check } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";

const TOPIC_LABEL: Record<TechnicalTopic, string> = {
  arrays: "Arrays",
  strings: "Strings",
  hashing: "Hash maps & sets",
  "two-pointer": "Two pointers",
  "binary-search": "Binary search",
  "stack-queue": "Stacks & queues",
  trees: "Trees",
  graphs: "Graphs",
  "dynamic-programming": "Dynamic programming",
  greedy: "Greedy",
  math: "Math",
  sorting: "Sorting",
};

const DIFFICULTY_COPY: Record<
  TechnicalDifficulty,
  { title: string; description: string }
> = {
  easy: {
    title: "Easy",
    description: "One clear idea. Room to spend the time explaining it well.",
  },
  medium: {
    title: "Medium",
    description: "A non-obvious insight plus a clean implementation.",
  },
  hard: {
    title: "Hard",
    description: "Multiple steps, and tight on thirty minutes. Expect to be pushed.",
  },
};

export interface TechnicalFocusStepProps {
  nav: SetupStepNav;
  /** Wizard-owned so the choice survives back/forward. */
  topics: readonly TechnicalTopic[];
  difficulty: TechnicalDifficulty | null;
  language: TechnicalCodingLanguage;
  onLanguageChange: (next: TechnicalCodingLanguage) => void;
  onTopicsChange: (next: TechnicalTopic[]) => void;
  onDifficultyChange: (next: TechnicalDifficulty | null) => void;
}

export default function TechnicalFocusStep({
  nav,
  topics,
  difficulty,
  language,
  onLanguageChange,
  onTopicsChange,
  onDifficultyChange,
}: TechnicalFocusStepProps) {
  const difficultyRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const toggleTopic = (topic: TechnicalTopic) => {
    onTopicsChange(
      topics.includes(topic)
        ? topics.filter((value) => value !== topic)
        : [...topics, topic],
    );
  };

  // WAI-ARIA radio group: one tab stop (the checked level), arrow keys move
  // focus AND selection, wrapping at the ends — same contract as
  // ConversationDifficultyStep.
  const handleDifficultyKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next =
      (index + step + TECHNICAL_DIFFICULTIES.length) % TECHNICAL_DIFFICULTIES.length;
    onDifficultyChange(TECHNICAL_DIFFICULTIES[next]);
    difficultyRefs.current[next]?.focus();
  };

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="technical-focus-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="technical-focus-heading"
            className="mt-1 font-display text-3xl font-medium tracking-[-0.03em]"
          >
            What do you want to practise?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted">
          Both are optional. Skip them and you&apos;ll get a problem drawn from
          the whole catalog.
        </p>
      </div>

      <fieldset className="mb-8">
        <legend className="mb-3 text-sm font-semibold text-ink">
          Topics
          <span className="ml-2 font-normal text-muted">
            Pick any number — more picks mean more problems to draw from.
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {TECHNICAL_TOPICS.map((topic) => {
            const isSelected = topics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggleTopic(topic)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-true-blue ${
                  isSelected
                    ? "border-true-blue bg-light-blue/22 text-ink"
                    : "border-line bg-white text-muted hover:border-true-blue/50 hover:text-ink"
                }`}
              >
                {isSelected && <Check size={14} />}
                {TOPIC_LABEL[topic]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink">Difficulty</legend>
        <div className="grid gap-3" role="radiogroup" aria-label="Difficulty">
          {TECHNICAL_DIFFICULTIES.map((level, index) => {
            const copy = DIFFICULTY_COPY[level];
            const isSelected = difficulty === level;
            return (
              <button
                key={level}
                ref={(node) => {
                  difficultyRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected || (!difficulty && index === 0) ? 0 : -1}
                // Selecting the chosen level again clears it, which is the only
                // way back to "no preference" without leaving the step.
                onClick={() => onDifficultyChange(isSelected ? null : level)}
                onKeyDown={(event) => handleDifficultyKeyDown(event, index)}
                className={`rounded-xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-true-blue ${
                  isSelected
                    ? "border-true-blue bg-light-blue/22"
                    : "border-line bg-white hover:border-true-blue/50 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-medium tracking-[-0.02em] text-ink">
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
      </fieldset>

      <fieldset className="mt-8">
        <legend className="mb-3 text-sm font-semibold text-ink">Language</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Coding language">
          {TECHNICAL_CODING_LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={language === option}
              onClick={() => onLanguageChange(option)}
              className={`rounded-full border px-4 py-2 text-sm ${language === option ? "border-true-blue bg-light-blue/22 text-ink" : "border-line bg-white text-muted"}`}
            >
              {TECHNICAL_CODING_LANGUAGE_LABEL[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="mt-5 text-sm leading-6 text-muted">
        If nothing in the catalog matches exactly, you&apos;ll get the closest
        problem rather than no interview.
      </p>

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <Button variant="light" onPress={nav.goBack}>
          Back
        </Button>
        <Button color="primary" endContent={<ArrowRight size={17} />} onPress={nav.goNext}>
          Continue
        </Button>
      </div>
    </section>
  );
}
