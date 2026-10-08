"use client";

/**
 * Required audience + takeaway step for the deck-led-talk mode. The
 * takeaway is private — the audience avatar is never told it, and the
 * report compares it to what actually landed, matching how
 * NetworkingGoalStep frames its hidden goal (19-CONTEXT.md "Per-mode
 * wizard inputs").
 *
 * Audience max length: 300 characters (short free text).
 * Takeaway max length: 200 characters — tight enough to force one point.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";

import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

export const TALK_AUDIENCE_MAX_LENGTH = 300;
export const TALK_TAKEAWAY_MAX_LENGTH = 200;

export interface TalkAudienceValue {
  talkAudience: string;
  talkTakeaway: string;
}

export interface TalkAudienceStepProps {
  nav: SetupStepNav;
  value: TalkAudienceValue | null;
  onChange: (next: TalkAudienceValue | null) => void;
}

export default function TalkAudienceStep({
  nav,
  value,
  onChange,
}: TalkAudienceStepProps) {
  const [audience, setAudience] = useState(() => value?.talkAudience ?? "");
  const [takeaway, setTakeaway] = useState(() => value?.talkTakeaway ?? "");
  const [attempted, setAttempted] = useState(false);

  const audienceOk = audience.trim().length > 0;
  const takeawayOk = takeaway.trim().length > 0;
  const canAdvance = audienceOk && takeawayOk;

  const syncOrClear = (nextAudience: string, nextTakeaway: string) => {
    if (nextAudience.trim().length > 0 && nextTakeaway.trim().length > 0) {
      onChange({ talkAudience: nextAudience, talkTakeaway: nextTakeaway });
    } else {
      onChange(null);
    }
  };

  const handleAudienceChange = (raw: string) => {
    setAudience(raw);
    syncOrClear(raw, takeaway);
  };

  const handleTakeawayChange = (raw: string) => {
    setTakeaway(raw);
    syncOrClear(audience, raw);
  };

  const commitAndAdvance = () => {
    if (!canAdvance) {
      setAttempted(true);

      return;
    }
    onChange({ talkAudience: audience, talkTakeaway: takeaway });
    nav.goNext();
  };

  return (
    <section
      aria-labelledby="talk-audience-heading"
      className="mx-auto max-w-3xl"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            id="talk-audience-heading"
          >
            Who&apos;s in the room, and what&apos;s your one point?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          Describe the audience, then name the single thing you want them to
          leave with.{" "}
          <span className="font-medium text-[#183947]">
            The audience will not be told your takeaway.
          </span>{" "}
          The report compares it to what they actually left with.
        </p>
      </div>

      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="grid gap-6">
          <div>
            <Textarea
              aria-describedby={
                attempted && !audienceOk ? "talk-audience-error" : undefined
              }
              aria-invalid={attempted && !audienceOk}
              aria-label="Audience"
              classNames={{
                inputWrapper:
                  "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
              }}
              label="Who is in the room"
              labelPlacement="outside"
              maxLength={TALK_AUDIENCE_MAX_LENGTH}
              maxRows={3}
              minRows={2}
              placeholder="e.g. mid-level engineers and their managers at an internal tech conference"
              value={audience}
              onValueChange={handleAudienceChange}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6a8491]">
              {attempted && !audienceOk ? (
                <p
                  className="text-[#b4540f]"
                  id="talk-audience-error"
                  role="alert"
                >
                  Required — describe who is listening.
                </p>
              ) : (
                <p>Required — a short description of the audience.</p>
              )}
              <p>
                {audience.length}/{TALK_AUDIENCE_MAX_LENGTH}
              </p>
            </div>
          </div>

          <div>
            <Textarea
              aria-describedby={
                attempted && !takeawayOk ? "talk-takeaway-error" : undefined
              }
              aria-invalid={attempted && !takeawayOk}
              aria-label="Takeaway — one sentence"
              classNames={{
                inputWrapper:
                  "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
              }}
              label="The one thing they should leave with"
              labelPlacement="outside"
              maxLength={TALK_TAKEAWAY_MAX_LENGTH}
              maxRows={2}
              minRows={1}
              placeholder="e.g. that our new API cuts their integration time in half"
              value={takeaway}
              onValueChange={handleTakeawayChange}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#6a8491]">
              {attempted && !takeawayOk ? (
                <p
                  className="text-[#b4540f]"
                  id="talk-takeaway-error"
                  role="alert"
                >
                  Required — one sentence, one point.
                </p>
              ) : (
                <p>Required — keep it to one sentence, one point. Private.</p>
              )}
              <p>
                {takeaway.length}/{TALK_TAKEAWAY_MAX_LENGTH}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button
            variant="light"
            onPress={() => {
              syncOrClear(audience, takeaway);
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
