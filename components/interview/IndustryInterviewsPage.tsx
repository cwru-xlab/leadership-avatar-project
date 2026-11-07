"use client";

/**
 * Second page of the interview picker: every specialized interview, one card
 * each. A preset card opens its customization page (which also starts it); the
 * coding room has no customization, so its card starts it directly.
 *
 * The list comes from `listSpecializedInterviews()`, so presets added to
 * `lib/interview/types.ts` appear here automatically, and presets with
 * `listed: false` (early-career) do not.
 */
import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3, FileChartColumn, Layers, UserRound } from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
import { listSpecializedInterviews } from "@/components/interview/interviewPicker";
import { routes } from "@/lib/routes";

const SPECIALIZED = listSpecializedInterviews();

export default function IndustryInterviewsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PracticeHero
        backHref={routes.interviews()}
        backLabel="Interview practice"
        description="Each one has its own interviewer, its own questions and its own scoring."
        facts={[
          { icon: UserRound, label: "Live avatar" },
          { icon: FileChartColumn, label: "Scored report" },
        ]}
        icon={Layers}
        title="Industry-specific interviews"
      />

      <ul aria-label="Industry-specific interviews" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SPECIALIZED.map((item) => {
          const Icon = item.icon;
          const action = item.customizable ? "Set up" : "Start";
          return (
            <li
              key={item.key}
              className="relative flex flex-col gap-4 rounded-lg border border-line bg-white p-5 transition-colors duration-150 ease-out hover:border-true-blue/50"
              data-interview={item.key}
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-start gap-2.5 font-display text-xl font-medium leading-tight text-cwru-blue">
                  <Icon aria-hidden className="mt-0.5 shrink-0" size={22} strokeWidth={1.75} />
                  {item.title}
                </h2>
                <p className="text-[15px] leading-6 text-muted">{item.tagline}</p>
              </div>

              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 aria-hidden size={14} />~{item.minutes} min
                </span>
                <span aria-hidden>·</span>
                <span>{item.level}</span>
              </p>

              {/* Above the card's stretched link so it stays clickable. */}
              <details className="group/details relative z-10 text-sm">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md font-semibold text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue [&::-webkit-details-marker]:hidden">
                  What it covers
                  <ChevronDown
                    aria-hidden
                    className="transition-transform duration-200 group-open/details:rotate-180 motion-reduce:transition-none"
                    size={15}
                  />
                </summary>
                <div className="flex flex-col gap-3 pb-1 pt-1">
                  <p className="leading-6 text-ink">{item.description}</p>
                  {item.areas.length > 0 && (
                    <ol className="flex flex-col gap-1.5 text-ink">
                      {item.areas.map((area, index) => (
                        <li key={area} className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="grid size-5 shrink-0 place-items-center rounded-full border border-line text-xs font-semibold tabular-nums text-cwru-blue"
                          >
                            {index + 1}
                          </span>
                          {area}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </details>

              <div className="mt-auto flex justify-end">
                <Link
                  aria-label={`${action} ${item.title}`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-bold text-link after:absolute after:inset-0 after:rounded-lg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
                  href={item.href}
                >
                  {action} <ArrowRight aria-hidden size={15} strokeWidth={2.5} />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
