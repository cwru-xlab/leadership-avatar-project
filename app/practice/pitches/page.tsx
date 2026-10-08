"use client";

/**
 * Practice Pitches entry picker — elevator vs "with a deck".
 * Dashboard tile routes here. The elevator card launches the shared
 * `app/practice/[type]/page.tsx` wizard directly. "With a deck" expands
 * in place into the five deck modes from `lib/pitch/deck-modes.ts`; each
 * deck-mode card launches the same shared wizard for its own slug.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Handshake,
  Layers,
  Mic,
  MinusCircle,
} from "lucide-react";

import { listDeckModes } from "@/lib/pitch/deck-modes";

const ELEVATOR_OPTION = {
  slug: "pitch-elevator",
  title: "Elevator pitch",
  description:
    "Thirty to sixty seconds with a live listener — discover what they care about, land a crisp ask, and earn follow-ups or a polite walk-out.",
  minutes: "1–5 min",
  icon: Mic,
} as const;

const DECK_MODES = listDeckModes();

const DECK_FAMILY_MINUTES = (() => {
  const floors = DECK_MODES.map((mode) => mode.envelopeSeconds[0] / 60);
  const ceilings = DECK_MODES.map((mode) => mode.envelopeSeconds[1] / 60);

  return `${Math.min(...floors)}–${Math.max(...ceilings)} min`;
})();

const DECK_PANEL_ID = "deck-mode-panel";

function minutesRange(envelopeSeconds: readonly [number, number]): string {
  const [low, high] = envelopeSeconds;

  return `${Math.round(low / 60)}–${Math.round(high / 60)} min`;
}

export default function PracticePitchesPickerPage() {
  const router = useRouter();
  const [deckExpanded, setDeckExpanded] = useState(false);
  const firstDeckCardRef = useRef<HTMLButtonElement>(null);

  const toggleDeckExpanded = () => {
    const next = !deckExpanded;

    setDeckExpanded(next);
    if (next) {
      // Move focus into the panel's first card once it renders.
      requestAnimationFrame(() => {
        firstDeckCardRef.current?.focus();
      });
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
        <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-7 sm:px-8 sm:pb-14">
          <button
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
            type="button"
            onClick={() => router.push("/")}
          >
            <ArrowLeft size={16} /> Back to practice
          </button>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
            Pitch studio
          </p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-[0.98] tracking-[-0.045em] text-[#102331] sm:text-5xl">
            Choose the pitch you want to practice.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#4e6977]">
            Elevator pitches are short and conversation-first. With a deck, you
            present slides to a live listener — five settings, each with a
            different audience and a different judgment.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-5 rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-none">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
              <ELEVATOR_OPTION.icon aria-hidden size={22} />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-serif text-2xl tracking-[-0.02em] text-[#102331]">
                {ELEVATOR_OPTION.title}
              </h2>
              <p className="text-[15px] leading-6 text-[#526c7b]">
                {ELEVATOR_OPTION.description}
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm text-[#08718d]">
                <Clock3 aria-hidden size={14} />
                {ELEVATOR_OPTION.minutes}
              </p>
            </div>
            <div className="mt-auto flex justify-end pt-2">
              <Button
                color="primary"
                endContent={<ArrowRight size={16} />}
                onPress={() => router.push(`/practice/${ELEVATOR_OPTION.slug}`)}
              >
                Start
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5 rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-none">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
              <Layers aria-hidden size={22} />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-serif text-2xl tracking-[-0.02em] text-[#102331]">
                With a deck
              </h2>
              <p className="text-[15px] leading-6 text-[#526c7b]">
                Present slides to a live listener. Five settings to choose from,
                each with its own audience, its own judgment, and its own time
                envelope.
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm text-[#08718d]">
                <Clock3 aria-hidden size={14} />
                {DECK_FAMILY_MINUTES}
              </p>
            </div>
            <div className="mt-auto flex justify-end pt-2">
              <button
                aria-controls={DECK_PANEL_ID}
                aria-expanded={deckExpanded}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#0a7391] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#08647c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a7391]"
                type="button"
                onClick={toggleDeckExpanded}
              >
                {deckExpanded ? "Hide deck settings" : "Choose a deck setting"}
                <ArrowRight
                  aria-hidden
                  className={`transition-transform ${
                    deckExpanded ? "rotate-90" : ""
                  }`}
                  size={16}
                />
              </button>
            </div>
          </div>
        </div>

        {deckExpanded && (
          <div
            aria-label="Deck pitch settings"
            className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            id={DECK_PANEL_ID}
            role="group"
          >
            {DECK_MODES.map((mode, index) => (
              <div
                key={mode.slug}
                className="flex flex-col gap-4 rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-none"
              >
                <div className="flex flex-col gap-2">
                  <h3 className="font-serif text-xl tracking-[-0.02em] text-[#102331]">
                    {mode.cardTitle}
                  </h3>
                  <p className="text-sm font-semibold text-[#08718d]">
                    {mode.listenerLine}
                  </p>
                  <p className="text-[15px] leading-6 text-[#526c7b]">
                    {mode.cardBlurb}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm text-[#4e6977]">
                    <span className="font-medium text-[#102331]">Scored:</span>{" "}
                    {mode.scoredLine}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="inline-flex items-center gap-1.5 text-sm text-[#08718d]">
                      <Clock3 aria-hidden size={14} />
                      {minutesRange(mode.envelopeSeconds)}
                    </p>
                    {mode.negotiates ? (
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeedb] px-2.5 py-1 text-xs font-semibold text-[#9a5b10]">
                        <Handshake aria-hidden size={12} />
                        {mode.negotiationMarker}
                      </p>
                    ) : (
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2f4] px-2.5 py-1 text-xs font-medium text-[#56707e]">
                        <MinusCircle aria-hidden size={12} />
                        {mode.negotiationMarker}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex justify-end pt-2">
                  <Button
                    ref={index === 0 ? firstDeckCardRef : undefined}
                    color="primary"
                    endContent={<ArrowRight size={16} />}
                    onPress={() => router.push(`/practice/${mode.slug}`)}
                  >
                    Start
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
