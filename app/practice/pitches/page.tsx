"use client";

/**
 * Practice Pitches entry picker — elevator vs "with a deck".
 * Dashboard tile routes here. The elevator card launches the shared
 * `app/practice/[type]/page.tsx` wizard directly. "With a deck" opens its own
 * page, `app/practice/pitches/deck`, which lists the deck modes from
 * `lib/pitch/deck-modes.ts`.
 */

import Link from "next/link";
import {
  ArrowRight,
  FileChartColumn,
  Presentation,
  UserRound,
  Clock3,
  Layers,
  Mic,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
import { listDeckModes } from "@/lib/pitch/deck-modes";
import { deckFamilyMinutes } from "@/lib/pitch/deck-minutes";

const ELEVATOR_OPTION = {
  slug: "pitch-elevator",
  title: "Elevator pitch",
  description:
    "Thirty to sixty seconds with a live listener — discover what they care about, land a crisp ask, and earn follow-ups or a polite walk-out.",
  minutes: "1–5 min",
  icon: Mic,
} as const;

const DECK_MODES = listDeckModes();
const COUNT_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const DECK_MODE_COUNT = COUNT_WORDS[DECK_MODES.length] ?? String(DECK_MODES.length);

function PickerCard({
  icon: Icon,
  title,
  description,
  minutes,
  href,
  actionLabel,
  ariaLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  minutes: string;
  href: string;
  actionLabel: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative flex flex-col gap-5 rounded-2xl border border-line bg-white p-6 transition-shadow hover:shadow-raised">
      <div className="flex size-14 items-center justify-center rounded-[16px] bg-cwru-blue text-white">
        <Icon aria-hidden size={26} strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-medium text-cwru-blue">{title}</h2>
        <p className="text-[15px] leading-6 text-muted">{description}</p>
        <p className="inline-flex items-center gap-1.5 text-sm text-true-blue">
          <Clock3 aria-hidden size={14} />
          {minutes}
        </p>
      </div>
      <div className="mt-auto flex justify-end pt-2">
        <Link
          aria-label={ariaLabel}
          className="inline-flex items-center gap-1 rounded-md text-sm font-bold text-true-blue after:absolute after:inset-0 after:rounded-2xl hover:underline focus-visible:outline-true-blue"
          href={href}
        >
          {actionLabel} <ArrowRight aria-hidden size={15} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}

export default function PracticePitchesPickerPage() {
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

      <div className="grid gap-4 sm:grid-cols-2">
        <PickerCard
          actionLabel="Start"
          ariaLabel={`Start ${ELEVATOR_OPTION.title}`}
          description={ELEVATOR_OPTION.description}
          href={`/practice/${ELEVATOR_OPTION.slug}`}
          icon={ELEVATOR_OPTION.icon}
          minutes={ELEVATOR_OPTION.minutes}
          title={ELEVATOR_OPTION.title}
        />
        <PickerCard
          actionLabel="Choose a setting"
          description={`Present slides to a live listener. ${DECK_MODE_COUNT} settings to choose from, each with its own audience, its own judgment, and its own time envelope.`}
          href="/practice/pitches/deck"
          icon={Layers}
          minutes={deckFamilyMinutes(DECK_MODES)}
          title="With a deck"
        />
      </div>
    </div>
  );
}
