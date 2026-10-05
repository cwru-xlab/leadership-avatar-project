"use client";

/**
 * Full pre-session briefing for difficult-conversation.
 *
 * Props take the student-briefing shape only — there is no `hiddenPosition`
 * key. Passing a hidden position is a compile error (see
 * `buildStudentBriefing`'s Pick<> and `StudentVisibleAuthoredFields`).
 * Plan 15-08 Task 3 walkthrough also checks at runtime that the rendered
 * briefing contains no substring of the character's private stance.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { buildStudentBriefing } from "@/lib/difficult-conversation/conversation-prompts";
import { Button } from "@heroui/button";
import { ArrowRight } from "lucide-react";

/**
 * Student-visible briefing fields only. Deliberately omits `hiddenPosition`
 * — including it here is a TypeScript error by construction.
 */
export interface ConversationBriefingFields {
  role: string;
  studentRole: string;
  situation: string;
  sharedBackstory: string;
  studentObjective: string;
  stakes: string;
}

export interface ConversationBriefingStepProps {
  nav: SetupStepNav;
  /** Student-visible fields only — no hiddenPosition key exists on this type. */
  briefing: ConversationBriefingFields;
  /** Optional heading for the scenario (seeded title / authored title). */
  title?: string;
}

const BLOCKS: Array<{
  key: keyof ConversationBriefingFields | "who";
  label: string;
  emphasize?: boolean;
}> = [
  { key: "situation", label: "The situation" },
  { key: "who", label: "Who's who" },
  { key: "sharedBackstory", label: "What you both already know" },
  {
    key: "studentObjective",
    label: "What you want out of this",
    emphasize: true,
  },
  { key: "stakes", label: "What's at stake" },
];

export default function ConversationBriefingStep({
  nav,
  briefing,
  title,
}: ConversationBriefingStepProps) {
  // Call buildStudentBriefing so the narrower authored-text helper stays on
  // the dependency path (compile-time refusal of hiddenPosition). The UI
  // lays out labelled blocks rather than the delimited prompt string.
  void buildStudentBriefing(briefing);

  return (
    <section
      className="mx-auto max-w-3xl space-y-6"
      aria-labelledby="conversation-briefing-heading"
    >
      <div>
        <p className="text-sm font-semibold text-[#0a7391]">
          Step {nav.stepNumber} of {nav.totalSteps}
        </p>
        <h2
          id="conversation-briefing-heading"
          className="mt-1 font-serif text-3xl tracking-[-0.03em]"
        >
          {title?.trim() || "Before you start"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#58727f]">
          Read the situation carefully. You will not see what they privately
          think — finding that out is part of the conversation.
        </p>
      </div>

      <div className="space-y-4">
        {BLOCKS.map((block) => {
          let body: string;
          if (block.key === "who") {
            body = `You are ${briefing.studentRole}. You're talking to ${briefing.role}.`;
          } else {
            body = briefing[block.key];
          }

          return (
            <div
              key={block.key}
              className={`rounded-2xl border p-5 sm:p-6 ${
                block.emphasize
                  ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.12)]"
                  : "border-[#d4e2e9] bg-white"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                  block.emphasize ? "text-[#0a7391]" : "text-[#6a8491]"
                }`}
              >
                {block.label}
              </p>
              <p
                className={`mt-2 whitespace-pre-wrap leading-relaxed ${
                  block.emphasize
                    ? "font-serif text-xl tracking-[-0.02em] text-[#102331]"
                    : "text-sm text-[#3d5764]"
                }`}
              >
                {body}
              </p>
            </div>
          );
        })}
      </div>

      <p className="rounded-2xl border border-dashed border-[#c5d8e1] bg-[#f7fbfc] px-5 py-4 text-sm leading-6 text-[#58727f]">
        What they actually think about all this is theirs. You&apos;ll have to
        find out.
      </p>

      <div className="flex flex-wrap justify-between gap-3">
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
