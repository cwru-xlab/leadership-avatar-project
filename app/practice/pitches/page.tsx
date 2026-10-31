"use client";

/**
 * Practice Pitches entry picker — elevator vs "with a deck".
 * Dashboard tile routes here. The elevator card launches the shared
 * `app/practice/[type]/page.tsx` wizard directly. "With a deck" expands
 * in place into the five deck modes from `lib/pitch/deck-modes.ts`; each
 * deck-mode card launches the same shared wizard for its own slug.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import {
  ArrowRight,
  FileChartColumn,
  Presentation,
  UserRound,
  Clock3,
  Handshake,
  Layers,
  Mic,
  MinusCircle,
} from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
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
  const deckToggleRef = useRef<HTMLButtonElement>(null);

  /**
   * Collapse the disclosure and return focus to the control that opened it —
   * the WAI-ARIA disclosure expectation. Without this, a keyboard user who has
   * tabbed into the five mode cards can only leave them by tabbing forward out
   * of the document and back in through the browser chrome.
   *
   * Found during Phase 19's Pass 2 keyboard UAT (plan 19-11, block F item 1),
   * which requires "Escape or Shift+Tab returns and collapses it". Shift+Tab
   * already returned focus because the panel follows the toggle in DOM order;
   * Escape did nothing at all.
   */
  const collapseDeckPanel = useCallback(() => {
    setDeckExpanded(false);
    deckToggleRef.current?.focus();
  }, []);

  // Document-level rather than an onKeyDown on the panel: the panel is a
  // `role="group"`, a non-interactive element that must not carry keyboard
  // listeners (jsx-a11y/no-noninteractive-element-interactions). The listener
  // exists only while the panel is open, so it cannot swallow Escape anywhere
  // else in the app.
  //
  // CAPTURE phase deliberately: a bubble-phase listener on `document` is the
  // LAST to see the event, so any ancestor (a UI-library overlay, a layout
  // wrapper) that calls stopPropagation on Escape would silently swallow it.
  // Capture runs before any descendant handler, so the disclosure closes
  // regardless of what sits between it and the document.
  useEffect(() => {
    if (!deckExpanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      collapseDeckPanel();
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [deckExpanded, collapseDeckPanel]);

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
    <div className="flex flex-col gap-6">
      <PracticeHero
        description="Elevator pitches are short and conversation-first. With a deck, you present slides to a live listener — five settings, each with a different audience and a different judgment."
        facts={[
          { icon: Clock3, label: "1–30 min" },
          { icon: UserRound, label: "Live listener" },
          { icon: FileChartColumn, label: "Scored report" },
        ]}
        icon={Presentation}
        title="Pitch practice"
      />

      <div className="flex flex-col">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
            <div className="flex size-14 items-center justify-center rounded-[16px] bg-cwru-blue text-white">
              <ELEVATOR_OPTION.icon aria-hidden size={26} strokeWidth={1.75} />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium text-cwru-blue">
                {ELEVATOR_OPTION.title}
              </h2>
              <p className="text-[15px] leading-6 text-muted">
                {ELEVATOR_OPTION.description}
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm text-true-blue">
                <Clock3 aria-hidden size={14} />
                {ELEVATOR_OPTION.minutes}
              </p>
            </div>
            <div className="mt-auto flex justify-end pt-2">
              <Button
                color="primary"
                endContent={<ArrowRight size={16} />}
                onPress={() => router.push(`/practice/${ELEVATOR_OPTION.slug}`)}
                aria-label={`Start ${ELEVATOR_OPTION.title}`}
              >
                Start
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
            <div className="flex size-14 items-center justify-center rounded-[16px] bg-cwru-blue text-white">
              <Layers aria-hidden size={26} strokeWidth={1.75} />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium text-cwru-blue">
                With a deck
              </h2>
              <p className="text-[15px] leading-6 text-muted">
                Present slides to a live listener. Five settings to choose from,
                each with its own audience, its own judgment, and its own time
                envelope.
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm text-true-blue">
                <Clock3 aria-hidden size={14} />
                {DECK_FAMILY_MINUTES}
              </p>
            </div>
            <div className="mt-auto flex justify-end pt-2">
              <button
                ref={deckToggleRef}
                aria-controls={DECK_PANEL_ID}
                aria-expanded={deckExpanded}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cwru-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
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
                className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6"
              >
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-xl font-medium text-cwru-blue">
                    {mode.cardTitle}
                  </h3>
                  <p className="text-sm font-semibold text-true-blue">
                    {mode.listenerLine}
                  </p>
                  <p className="text-[15px] leading-6 text-muted">
                    {mode.cardBlurb}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">
                    <span className="font-medium text-ink">Scored:</span>{" "}
                    {mode.scoredLine}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="inline-flex items-center gap-1.5 text-sm text-true-blue">
                      <Clock3 aria-hidden size={14} />
                      {minutesRange(mode.envelopeSeconds)}
                    </p>
                    {mode.negotiates ? (
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-level-2/16 px-2.5 py-1 text-xs font-semibold text-ink">
                        <Handshake aria-hidden size={12} />
                        {mode.negotiationMarker}
                      </p>
                    ) : (
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
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
                    aria-label={`Start ${mode.cardTitle}`}
                  >
                    Start
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
