"use client";

/**
 * Required funding-ask step for the funding-request deck mode. Modeled
 * directly on NegotiationAskStep's shape and gating discipline, but there
 * is deliberately no ownership-stake field and no company-worth field
 * here — a grant or budget request gives up no ownership stake
 * (19-CONTEXT.md "Per-mode wizard inputs"). That concept is absent, not
 * zeroed or disabled.
 *
 * Use-of-funds max length: 500 characters. Chosen to keep the field a
 * one-paragraph summary rather than a business plan, per plan 19-06's
 * 300-600 character guidance.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";

import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

export const FUNDING_USE_OF_FUNDS_MAX_LENGTH = 500;

export interface FundingAskValue {
  requestedAmountUsd: number;
  useOfFunds: string;
}

export interface FundingAskStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward (reversible). */
  value: FundingAskValue | null;
  onChange: (next: FundingAskValue | null) => void;
}

function formatUsdDisplay(n: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

function parseUsdInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");

  if (!cleaned) return null;
  const n = Number(cleaned);

  if (!Number.isFinite(n) || n <= 0) return null;

  return Math.round(n);
}

export default function FundingAskStep({
  nav,
  value,
  onChange,
}: FundingAskStepProps) {
  const [amountText, setAmountText] = useState(() =>
    value ? formatUsdDisplay(value.requestedAmountUsd) : "",
  );
  const [useOfFunds, setUseOfFunds] = useState(() => value?.useOfFunds ?? "");
  const [attempted, setAttempted] = useState(false);

  const amount = parseUsdInput(amountText);
  const amountOk = amount !== null;
  const useOfFundsTrimmed = useOfFunds.trim();
  const useOfFundsOk = useOfFundsTrimmed.length > 0;
  const canAdvance = amountOk && useOfFundsOk;

  const syncOrClear = (nextAmount: number | null, nextUseOfFunds: string) => {
    const trimmed = nextUseOfFunds.trim();

    if (nextAmount !== null && trimmed.length > 0) {
      onChange({ requestedAmountUsd: nextAmount, useOfFunds: nextUseOfFunds });
    } else {
      onChange(null);
    }
  };

  const handleAmountChange = (raw: string) => {
    setAmountText(raw);
    syncOrClear(parseUsdInput(raw), useOfFunds);
  };

  const handleUseOfFundsChange = (raw: string) => {
    setUseOfFunds(raw);
    syncOrClear(parseUsdInput(amountText), raw);
  };

  const commitAndAdvance = () => {
    if (!canAdvance || amount === null) {
      setAttempted(true);

      return;
    }
    onChange({ requestedAmountUsd: amount, useOfFunds });
    nav.goNext();
  };

  return (
    <section
      aria-labelledby="funding-ask-heading"
      className="mx-auto max-w-3xl"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            id="funding-ask-heading"
          >
            What are you requesting?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          State the amount and what it is for. The reviewer will probe
          feasibility and spend, not negotiate terms.
        </p>
      </div>

      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="grid gap-6">
          <div>
            <Input
              aria-describedby={
                attempted && !amountOk ? "funding-amount-error" : undefined
              }
              aria-invalid={attempted && !amountOk}
              classNames={{
                inputWrapper:
                  "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
              }}
              inputMode="numeric"
              label="Amount requested"
              labelPlacement="outside"
              placeholder="50,000"
              startContent={
                <span aria-hidden className="text-sm text-[#6a8491]">
                  $
                </span>
              }
              value={amountText}
              onBlur={() => {
                const n = parseUsdInput(amountText);

                if (n !== null) setAmountText(formatUsdDisplay(n));
              }}
              onValueChange={handleAmountChange}
            />
            {attempted && !amountOk ? (
              <p
                className="mt-2 text-xs text-[#b4540f]"
                id="funding-amount-error"
                role="alert"
              >
                Enter a positive dollar amount — for example 50000.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[#6a8491]">USD, whole dollars.</p>
            )}
          </div>

          <div>
            <Textarea
              aria-describedby={
                attempted && !useOfFundsOk ? "funding-use-error" : undefined
              }
              aria-invalid={attempted && !useOfFundsOk}
              aria-label="Use of funds"
              classNames={{
                inputWrapper:
                  "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
              }}
              label="What it's for"
              labelPlacement="outside"
              maxLength={FUNDING_USE_OF_FUNDS_MAX_LENGTH}
              maxRows={4}
              minRows={2}
              placeholder="e.g. hiring one engineer and six months of runway to finish the pilot"
              value={useOfFunds}
              onValueChange={handleUseOfFundsChange}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6a8491]">
              {attempted && !useOfFundsOk ? (
                <p
                  className="text-[#b4540f]"
                  id="funding-use-error"
                  role="alert"
                >
                  Required — say briefly what the money is for.
                </p>
              ) : (
                <p>Required — a short summary, not a business plan.</p>
              )}
              <p>
                {useOfFunds.length}/{FUNDING_USE_OF_FUNDS_MAX_LENGTH}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button
            variant="light"
            onPress={() => {
              syncOrClear(parseUsdInput(amountText), useOfFunds);
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
