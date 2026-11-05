"use client";

/**
 * Three student-selected levels by locked decision. This is NOT Phase 8's
 * difficulty parameter and NOT a scenario-record property; do not wire it to
 * either.
 *
 * Fetch discipline: only a level-filtered view of the persona is held in
 * React state / the DOM. A student can read the DOM, and at `blind` the
 * discovery is the exercise — never fetch or render the full persona and
 * then hide fields client-side. The server draws the listener and filters to
 * the level, and at `blind` nothing is requested at all.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import type { ListenerKnowledge } from "@/lib/pitch/elevator-prompts";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowRight, Check, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

export type { ListenerKnowledge };

export interface ListenerKnowledgeStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward (reversible). */
  listenerKnowledge: ListenerKnowledge | null;
  /** Part of the draw: restarting the same pitch keeps the same listener. */
  pitchSubject: string;
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

/** The level-filtered persona view the server returned. Absent at `blind`. */
interface ListenerDisclosure {
  name: string;
  role: string;
  previewUrl: string | null;
  interests?: readonly string[];
  priorities?: readonly string[];
}

type DisclosureState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; disclosure: ListenerDisclosure };

export default function ListenerKnowledgeStep({
  nav,
  listenerKnowledge,
  pitchSubject,
  onSelect,
}: ListenerKnowledgeStepProps) {
  const [state, setState] = useState<DisclosureState>({ status: "loading" });
  const sighted = listenerKnowledge !== null && listenerKnowledge !== "blind";

  useEffect(() => {
    if (!sighted) return;
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const response = await fetch(
          "/api/practice/session/elevator-listener",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listenerKnowledge,
              pitchSubject: pitchSubject.trim(),
            }),
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          listener?: ListenerDisclosure | null;
        };

        if (cancelled) return;
        setState(
          response.ok && data.listener
            ? { status: "ready", disclosure: data.listener }
            : { status: "failed" },
        );
      } catch {
        if (!cancelled) setState({ status: "failed" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sighted, listenerKnowledge, pitchSubject]);

  const disclosure =
    sighted && state.status === "ready" ? state.disclosure : null;

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="listener-knowledge-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="listener-knowledge-heading"
            className="mt-1 font-display font-medium text-3xl tracking-[-0.03em]"
          >
            How much do you know about your listener?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted">
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
              className={`relative rounded-xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-true-blue ${
                selected
                  ? "border-true-blue bg-light-blue/22"
                  : "border-line bg-white hover:border-true-blue/50 hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-medium text-xl tracking-[-0.02em] text-ink">
                    {level.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {level.description}
                  </p>
                </div>
                {selected && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-level-4 text-ink">
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
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-line bg-canvas p-5">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-line text-ink"
              aria-hidden
            >
              <UserRound size={26} />
            </div>
            <p className="text-sm leading-6 text-muted">
              You will meet them cold. Nothing about who they are is shown
              here — that is the exercise.
            </p>
          </div>
        )}

        {sighted && state.status === "loading" && (
          <div
            aria-busy="true"
            className="flex items-center gap-4 rounded-xl border border-line bg-white p-5 text-sm text-muted"
          >
            <Spinner color="primary" size="sm" />
            Finding your listener
          </div>
        )}

        {sighted && state.status === "failed" && (
          <p className="rounded-xl border border-dashed border-line bg-canvas p-5 text-sm leading-6 text-muted">
            We could not load their profile. You can still continue: you will
            meet them when the session starts.
          </p>
        )}

        {disclosure && (
          <div
            className="rounded-xl border border-line bg-white p-5"
            data-testid="listener-disclosure"
          >
            <div className="flex items-center gap-4">
              {disclosure.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                  src={disclosure.previewUrl}
                />
              ) : (
                <div
                  aria-hidden
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-line text-ink"
                >
                  <UserRound size={26} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-link">Your listener</p>
                <p className="mt-1 font-display font-medium text-2xl tracking-[-0.02em] text-ink">
                  {disclosure.name}
                </p>
                <p className="mt-1 text-sm text-muted">{disclosure.role}</p>
              </div>
            </div>
            {disclosure.interests && disclosure.priorities && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted">
                    Interests
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-ink">
                    {disclosure.interests.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">
                    Priorities
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-ink">
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
