"use client";

/**
 * Required networking goal step. The goal travels in the wizard's
 * customization payload to session start and into inputSnapshot only —
 * the avatar never sees it (16-CONTEXT.md).
 *
 * Length cap: 300 characters (chosen for a short typed ask; recorded in
 * 16-08-SUMMARY.md).
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";

import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { ArrowRight } from "lucide-react";

/** Modest cap for a short typed ask — see 16-08-SUMMARY.md. */
export const NETWORKING_GOAL_MAX_LENGTH = 300;

export interface NetworkingGoalStepProps {
  nav: SetupStepNav;
  goal: string;
  onChange: (goal: string) => void;
}

export default function NetworkingGoalStep({
  nav,
  goal,
  onChange,
}: NetworkingGoalStepProps) {
  const trimmed = goal.trim();
  const canAdvance = trimmed.length > 0;

  return (
    <section
      aria-labelledby="networking-goal-heading"
      className="mx-auto max-w-3xl"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            id="networking-goal-heading"
          >
            What do you want from this conversation?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          One short goal — for example, a referral into their team, or advice on
          breaking into consulting.{" "}
          <span className="font-medium text-[#183947]">
            The person you are practicing with will not be told this.
          </span>{" "}
          That is the exercise: you have to steer there yourself.
        </p>
      </div>

      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <Textarea
          aria-label="Your networking goal"
          classNames={{
            inputWrapper:
              "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
          }}
          maxLength={NETWORKING_GOAL_MAX_LENGTH}
          maxRows={4}
          minRows={2}
          placeholder="e.g. a referral into their team"
          value={goal}
          onValueChange={onChange}
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6a8491]">
          <p>
            {canAdvance
              ? "Required — you can continue when this is filled in."
              : "Required — no goal, no session."}
          </p>
          <p>
            {goal.length}/{NETWORKING_GOAL_MAX_LENGTH}
          </p>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <Button variant="flat" onPress={nav.goBack}>
            Back
          </Button>
          <Button
            color="primary"
            endContent={<ArrowRight size={17} />}
            isDisabled={!canAdvance}
            size="lg"
            onPress={nav.goNext}
          >
            Continue
          </Button>
        </div>
      </div>
    </section>
  );
}
