"use client";

/**
 * Practice Pitches entry picker — elevator vs investor deck.
 * Dashboard tile routes here; each card launches the shared
 * `app/practice/[type]/page.tsx` wizard for that engine type.
 */

import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ArrowLeft, ArrowRight, Clock3, Layers, Mic } from "lucide-react";

const PITCH_OPTIONS = [
  {
    slug: "pitch-elevator",
    title: "Elevator pitch",
    description:
      "Thirty to sixty seconds with a live listener — discover what they care about, land a crisp ask, and earn follow-ups or a polite walk-out.",
    minutes: "1–5 min",
    icon: Mic,
  },
  {
    slug: "pitch-deck",
    title: "Investor pitch deck",
    description:
      "Walk an investor through your slides, negotiate the ask, and get feedback on structure, delivery, and deck appearance.",
    minutes: "20–30 min",
    icon: Layers,
  },
] as const;

export default function PracticePitchesPickerPage() {
  const router = useRouter();

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
        <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-7 sm:px-8 sm:pb-14">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
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
            Elevator pitches are short and conversation-first. Investor decks
            bring your slides into a longer meeting with a live navigator and
            negotiation.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="grid gap-5 sm:grid-cols-2">
          {PITCH_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <div
                key={option.slug}
                className="flex flex-col gap-5 rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-none"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
                  <Icon size={22} aria-hidden />
                </div>
                <div className="flex flex-col gap-3">
                  <h2 className="font-serif text-2xl tracking-[-0.02em] text-[#102331]">
                    {option.title}
                  </h2>
                  <p className="text-[15px] leading-6 text-[#526c7b]">
                    {option.description}
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-sm text-[#08718d]">
                    <Clock3 size={14} aria-hidden />
                    {option.minutes}
                  </p>
                </div>
                <div className="mt-auto flex justify-end pt-2">
                  <Button
                    color="primary"
                    endContent={<ArrowRight size={16} />}
                    onPress={() => router.push(`/practice/${option.slug}`)}
                  >
                    Start
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
