"use client";

/**
 * These are plain form fields by design (14-RESEARCH.md Open Question 3). The
 * ask is captured structurally so it is session-constant and safe in the
 * system prompt from turn one; it is NOT extracted from the transcript. The
 * SETTLED terms are the evaluator's job. The scenario's fair-value band is
 * never shown here and never shown to the student.
 *
 * A nonsensical-but-valid ask (e.g. $1 for 90%) is accepted — the student is
 * allowed to make a bad ask; that is gradeable material, and the avatar will
 * push back. Do NOT add a "realistic range" check.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

export type NegotiationAskValue = {
  askPriceUsd: number;
  askEquityPct: number;
};

export interface NegotiationAskStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward (reversible). */
  ask: NegotiationAskValue | null;
  onChange: (ask: NegotiationAskValue | null) => void;
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

function parseEquityInput(raw: string): number | null {
  const cleaned = raw.replace(/%/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  return n;
}

export default function NegotiationAskStep({
  nav,
  ask,
  onChange,
}: NegotiationAskStepProps) {
  const [priceText, setPriceText] = useState(() =>
    ask ? formatUsdDisplay(ask.askPriceUsd) : "",
  );
  const [equityText, setEquityText] = useState(() =>
    ask ? String(ask.askEquityPct) : "",
  );
  const [attempted, setAttempted] = useState(false);

  const price = parseUsdInput(priceText);
  const equity = parseEquityInput(equityText);
  const priceOk = price !== null;
  const equityOk = equity !== null;
  const canAdvance = priceOk && equityOk;

  const commitAndAdvance = () => {
    if (!canAdvance || price === null || equity === null) {
      setAttempted(true);
      return;
    }
    onChange({ askPriceUsd: price, askEquityPct: equity });
    nav.goNext();
  };

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="negotiation-ask-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            id="negotiation-ask-heading"
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
          >
            What are you asking for?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          Be clear up front about what you want from the investor, then defend
          it. Your ask stays fixed for the meeting.
        </p>
      </div>

      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Input
              label="Investment amount"
              labelPlacement="outside"
              startContent={
                <span className="text-sm text-[#6a8491]" aria-hidden>
                  $
                </span>
              }
              inputMode="numeric"
              value={priceText}
              onValueChange={setPriceText}
              onBlur={() => {
                const n = parseUsdInput(priceText);
                if (n !== null) setPriceText(formatUsdDisplay(n));
              }}
              placeholder="500,000"
              aria-invalid={attempted && !priceOk}
              aria-describedby={
                attempted && !priceOk ? "ask-price-error" : undefined
              }
              classNames={{
                inputWrapper:
                  "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
              }}
            />
            {attempted && !priceOk ? (
              <p
                id="ask-price-error"
                className="mt-2 text-xs text-[#b4540f]"
                role="alert"
              >
                Enter a positive dollar amount — for example 500000.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[#6a8491]">USD, whole dollars.</p>
            )}
          </div>

          <div>
            <Input
              label="Equity offered"
              labelPlacement="outside"
              endContent={
                <span className="text-sm text-[#6a8491]" aria-hidden>
                  %
                </span>
              }
              inputMode="decimal"
              value={equityText}
              onValueChange={setEquityText}
              placeholder="10"
              aria-invalid={attempted && !equityOk}
              aria-describedby={
                attempted && !equityOk ? "ask-equity-error" : undefined
              }
              classNames={{
                inputWrapper:
                  "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
              }}
            />
            {attempted && !equityOk ? (
              <p
                id="ask-equity-error"
                className="mt-2 text-xs text-[#b4540f]"
                role="alert"
              >
                Enter a percent greater than 0 and less than 100.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[#6a8491]">
                Between 0 and 100 — exclusive.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button
            variant="light"
            onPress={() => {
              const nextPrice = parseUsdInput(priceText);
              const nextEquity = parseEquityInput(equityText);
              if (nextPrice !== null && nextEquity !== null) {
                onChange({
                  askPriceUsd: nextPrice,
                  askEquityPct: nextEquity,
                });
              }
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
