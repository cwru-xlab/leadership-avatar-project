"use client";

/**
 * Required buyer-profile step for the product-pitch deck mode. The profile
 * travels in the wizard's customization payload to session start and into
 * inputSnapshot only — it lets the avatar object from a real buyer
 * position (19-CONTEXT.md "Per-mode wizard inputs").
 *
 * Max length: 500 characters — a short profile, not a persona document.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";

import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { ArrowRight } from "lucide-react";

export const BUYER_PROFILE_MAX_LENGTH = 500;

export interface BuyerProfileValue {
  buyerProfile: string;
}

export interface BuyerProfileStepProps {
  nav: SetupStepNav;
  value: BuyerProfileValue | null;
  onChange: (next: BuyerProfileValue | null) => void;
}

export default function BuyerProfileStep({
  nav,
  value,
  onChange,
}: BuyerProfileStepProps) {
  const text = value?.buyerProfile ?? "";
  const trimmed = text.trim();
  const canAdvance = trimmed.length > 0;

  const handleChange = (raw: string) => {
    onChange(raw.trim().length > 0 ? { buyerProfile: raw } : null);
  };

  return (
    <section
      aria-labelledby="buyer-profile-heading"
      className="mx-auto max-w-3xl"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            id="buyer-profile-heading"
          >
            Who are you pitching to?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          Describe the buyer&apos;s role, company type and what they care about
          — specific enough that they can object from a real position.
        </p>
      </div>

      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <Textarea
          aria-label="Buyer profile"
          classNames={{
            inputWrapper:
              "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
          }}
          maxLength={BUYER_PROFILE_MAX_LENGTH}
          maxRows={5}
          minRows={3}
          placeholder="e.g. Director of Ops at a 200-person logistics company, owns the budget, cares about implementation time and switching cost from their current vendor"
          value={text}
          onValueChange={handleChange}
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6a8491]">
          <p>
            {canAdvance
              ? "Required — you can continue when this is filled in."
              : "Required — no buyer profile, no session."}
          </p>
          <p>
            {text.length}/{BUYER_PROFILE_MAX_LENGTH}
          </p>
        </div>

        <div className="mt-7 flex justify-between gap-3">
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
