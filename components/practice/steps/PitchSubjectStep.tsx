"use client";

/**
 * Free text by locked decision (14-CONTEXT.md). Do NOT add a category list,
 * suggestion chips or a select here — the user rejected a catalog of pitch
 * subjects explicitly.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

/** Modest cap — enough for a short subject line, not an essay. */
export const PITCH_SUBJECT_MAX_LENGTH = 300;
const MIN_SUBJECT_LENGTH = 3;

export interface PitchSubjectStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward (reversible). */
  pitchSubject: string;
  onChange: (pitchSubject: string) => void;
}

export default function PitchSubjectStep({
  nav,
  pitchSubject,
  onChange,
}: PitchSubjectStepProps) {
  const [attempted, setAttempted] = useState(false);
  const trimmed = pitchSubject.trim();
  const canAdvance = trimmed.length >= MIN_SUBJECT_LENGTH;
  const showError = attempted && !canAdvance;

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="pitch-subject-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="pitch-subject-heading"
            className="mt-1 font-display font-medium text-3xl tracking-[-0.03em]"
          >
            What are you pitching?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted">
          It can be a product, a company, an idea, or yourself — write it in
          your own words so your listener knows what they are about to hear.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-white p-6 sm:p-9">
        <Textarea
          aria-label="What you are pitching"
          aria-invalid={showError}
          aria-describedby={showError ? "pitch-subject-error" : undefined}
          minRows={2}
          maxRows={4}
          maxLength={PITCH_SUBJECT_MAX_LENGTH}
          value={pitchSubject}
          onValueChange={onChange}
          placeholder={
            "e.g. a last-mile routing tool for mid-size logistics fleets\nor myself as a product manager for operations software"
          }
          classNames={{
            inputWrapper:
              "border border-line bg-canvas shadow-none data-[hover=true]:bg-canvas",
          }}
        />
        <div className="mt-2 flex items-start justify-between gap-3 text-xs text-muted">
          {showError ? (
            <p id="pitch-subject-error" className="text-copper" role="alert">
              Describe it in a few words so your listener knows what they are
              hearing about.
            </p>
          ) : (
            <p>Free text — no categories, no catalog.</p>
          )}
          <p className="shrink-0">
            {pitchSubject.length}/{PITCH_SUBJECT_MAX_LENGTH}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          <Button variant="light" onPress={nav.goBack}>
            Back
          </Button>
          <Button
            color="primary"
            endContent={<ArrowRight size={17} />}
            onPress={() => {
              if (!canAdvance) {
                setAttempted(true);
                return;
              }
              onChange(trimmed);
              nav.goNext();
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </section>
  );
}
