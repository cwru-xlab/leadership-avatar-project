"use client";

/**
 * Deck pitch settings — the second screen of the pitches picker. One card per
 * row of `lib/pitch/deck-modes.ts`; each card launches the shared
 * `app/practice/[type]/page.tsx` wizard for its own slug.
 */

import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  FileChartColumn,
  Handshake,
  Layers,
  MinusCircle,
  Target,
  UserRound,
} from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
import { deckModeIcon } from "@/components/practice/deckModeIcons";
import { listDeckModes } from "@/lib/pitch/deck-modes";
import { deckFamilyMinutes, minutesRange } from "@/lib/pitch/deck-minutes";

const DECK_MODES = listDeckModes();

export default function DeckPitchSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PracticeHero
        backHref="/practice/pitches"
        backLabel="Pitch practice"
        description="Present slides to a live listener. Each setting has its own audience, its own judgment and its own time envelope."
        facts={[
          { icon: Clock3, label: deckFamilyMinutes(DECK_MODES) },
          { icon: UserRound, label: "Live listener" },
          { icon: FileChartColumn, label: "Scored report" },
        ]}
        icon={Layers}
        title="Pitch with a deck"
      />

      <section aria-labelledby="deck-settings-heading" className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium text-cwru-blue" id="deck-settings-heading">
          Choose a setting
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DECK_MODES.map((mode) => {
            const Icon = deckModeIcon(mode.slug);

            return (
              <li
                key={mode.slug}
                className="group relative flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 transition-shadow hover:shadow-raised"
              >
                <div className="flex items-start gap-3.5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-cwru-blue text-white">
                    <Icon aria-hidden size={22} strokeWidth={1.75} />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="font-display text-xl font-medium leading-tight text-cwru-blue">
                      {mode.cardTitle}
                    </h3>
                    <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-link">
                      <UserRound aria-hidden size={14} />
                      {mode.listenerLine}
                    </p>
                  </div>
                </div>

                <p className="text-[15px] leading-6 text-muted">{mode.cardBlurb}</p>

                <p className="flex items-start gap-2 text-sm text-ink">
                  <Target aria-hidden className="mt-0.5 shrink-0 text-link" size={15} />
                  <span>
                    <span className="font-semibold">Scored on</span> {mode.scoredLine.charAt(0).toLowerCase() + mode.scoredLine.slice(1)}
                  </span>
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink">
                    <Clock3 aria-hidden size={12} />
                    {minutesRange(mode.envelopeSeconds)}
                  </span>
                  {mode.negotiates ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-level-2/16 px-2.5 py-1 text-xs font-semibold text-ink">
                      <Handshake aria-hidden size={12} />
                      {mode.negotiationMarker}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
                      <MinusCircle aria-hidden size={12} />
                      {mode.negotiationMarker}
                    </span>
                  )}
                </div>

                <div className="mt-auto flex justify-end pt-1">
                  <Link
                    aria-label={`Start ${mode.cardTitle}`}
                    className="inline-flex items-center gap-1 rounded-md text-sm font-bold text-link after:absolute after:inset-0 after:rounded-2xl hover:underline focus-visible:outline-true-blue"
                    href={`/practice/${mode.slug}`}
                  >
                    Start <ArrowRight aria-hidden size={15} strokeWidth={2.5} />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
