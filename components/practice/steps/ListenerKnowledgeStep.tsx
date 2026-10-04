"use client";

/**
 * Three student-selected levels by locked decision. This is NOT Phase 8's
 * difficulty parameter and NOT a scenario-record property; do not wire it to
 * either.
 *
 * Fetch discipline: only a level-filtered view of the persona is held in
 * React state / the DOM. A student can read the DOM, and at `blind` the
 * discovery is the exercise — never fetch or render the full persona and
 * then hide fields client-side.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import {
  ELEVATOR_LISTENER_PERSONA,
  type ListenerKnowledge,
} from "@/lib/pitch/elevator-prompts";
import { Button } from "@heroui/button";
import { ArrowRight, Check, UserRound } from "lucide-react";

export type { ListenerKnowledge };

export interface ListenerKnowledgeStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward (reversible). */
  listenerKnowledge: ListenerKnowledge | null;
  onSelect: (level: ListenerKnowledge) => void;
}

const LEVELS: Array<{
  id: ListenerKnowledge;
  title: string;
  description: string;
}> = [
  {
    id: "blind",
    title: "Completely blind",
    description:
      "You walk in cold. You will have to find out who they are and what they care about in the conversation.",
  },
  {
    id: "name-role",
    title: "Name and role only",
    description:
      "You know who you are meeting. What they care about is still yours to discover.",
  },
  {
    id: "full-profile",
    title: "Full profile",
    description:
      "You read their profile beforehand. You are expected to use it.",
  },
];

/**
 * Level-filtered persona view. At `blind` returns null so nothing about the
 * person — name, role, interests, priorities — enters the DOM.
 */
function disclosureForLevel(level: ListenerKnowledge | null): {
  name?: string;
  role?: string;
  interests?: readonly string[];
  priorities?: readonly string[];
} | null {
  if (!level || level === "blind") return null;
  if (level === "name-role") {
    return {
      name: ELEVATOR_LISTENER_PERSONA.name,
      role: ELEVATOR_LISTENER_PERSONA.role,
    };
  }
  return {
    name: ELEVATOR_LISTENER_PERSONA.name,
    role: ELEVATOR_LISTENER_PERSONA.role,
    interests: ELEVATOR_LISTENER_PERSONA.interests,
    priorities: ELEVATOR_LISTENER_PERSONA.priorities,
  };
}

export default function ListenerKnowledgeStep({
  nav,
  listenerKnowledge,
  onSelect,
}: ListenerKnowledgeStepProps) {
  const disclosure = disclosureForLevel(listenerKnowledge);

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="listener-knowledge-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            id="listener-knowledge-heading"
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
          >
            How much do you know about your listener?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          Choose how much of their profile you see before you start. What
          they care about is yours to discover unless you pick the full
          profile.
        </p>
      </div>

      <div className="grid gap-3">
        {LEVELS.map((level) => {
          const selected = listenerKnowledge === level.id;
          return (
            <button
              key={level.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(level.id)}
              className={`relative rounded-2xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${
                selected
                  ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]"
                  : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl tracking-[-0.02em] text-[#102331]">
                    {level.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#58727f]">
                    {level.description}
                  </p>
                </div>
                {selected && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#79d4b1] text-[#0b3029]">
                    <Check size={15} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 min-h-[7.5rem]">
        {listenerKnowledge === "blind" && (
          <div className="flex items-center gap-4 rounded-2xl border border-dashed border-[#c5d8e1] bg-[#f7fbfc] p-5">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#d7e6ed] text-[#3d5c6b]"
              aria-hidden
            >
              <UserRound size={26} />
            </div>
            <p className="text-sm leading-6 text-[#58727f]">
              You will meet them cold. Nothing about who they are is shown
              here — that is the exercise.
            </p>
          </div>
        )}

        {disclosure && (
          <div className="rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(30,68,85,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0a7391]">
              Your listener
            </p>
            <p className="mt-2 font-serif text-2xl tracking-[-0.02em] text-[#102331]">
              {disclosure.name}
            </p>
            <p className="mt-1 text-sm text-[#526c7b]">{disclosure.role}</p>
            {disclosure.interests && disclosure.priorities && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6a8491]">
                    Interests
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-[#3d5764]">
                    {disclosure.interests.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6a8491]">
                    Priorities
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-[#3d5764]">
                    {disclosure.priorities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <Button variant="light" onPress={nav.goBack}>
          Back
        </Button>
        <Button
          color="primary"
          isDisabled={!listenerKnowledge}
          endContent={<ArrowRight size={17} />}
          onPress={nav.goNext}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
