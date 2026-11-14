"use client";

/**
 * Second page of the interview picker: every specialized interview. A preset
 * opens its customization page (which also starts it); the coding room has no
 * customization, so it starts directly.
 *
 * The list comes from `listSpecializedInterviews()`, so presets added to
 * `lib/interview/types.ts` appear here automatically, and presets with
 * `listed: false` (early-career) do not.
 *
 * Technical coding is easy to reach, not highlighted: it is an ordinary card in
 * the first position of the first row, and every card stays inside the first
 * 1440×900 viewport. Cards are compact: title, one line, time · level visible;
 * "What it covers" behind a disclosure on the same row as the action.
 *
 * No row may end in an empty slot. Two layouts are under review (2026-11-14):
 * `balanced` (default, rows sized to fill the width) and `filler` (four across,
 * the general interview as the last tile). `?layout=` previews either.
 */
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ChevronDown, Clock3, FileChartColumn, Layers, UserRound } from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
import {
  DEFAULT_LAYOUT,
  GENERAL_PICKER_ITEM,
  balancedSpans,
  type InterviewLayout,
  listSpecializedInterviews,
  orderForPicker,
  type SpecializedInterview,
} from "@/components/interview/interviewPicker";
import { routes } from "@/lib/routes";

const SPECIALIZED = orderForPicker(listSpecializedInterviews());

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue";
const CARD = "relative rounded-lg border border-line bg-white transition-colors duration-150 ease-out hover:border-true-blue/50";

function actionWord(item: SpecializedInterview) {
  return item.customizable ? "Set up" : "Start";
}

function Meta({ item }: { item: SpecializedInterview }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Clock3 aria-hidden size={13} />~{item.minutes} min
      </span>
      <span aria-hidden>·</span>
      <span>{item.level}</span>
    </p>
  );
}

/** "What it covers": sits above the card's stretched link so it stays clickable. */
function Covers({ item, className }: { item: SpecializedInterview; className?: string }) {
  return (
    <details className={clsx("group/details relative z-10 text-sm", className)}>
      <summary
        className={clsx(
          "inline-flex min-h-11 cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-md font-semibold text-link hover:underline [&::-webkit-details-marker]:hidden",
          FOCUS,
        )}
      >
        What it covers
        <ChevronDown
          aria-hidden
          className="transition-transform duration-200 group-open/details:rotate-180 motion-reduce:transition-none"
          size={15}
        />
      </summary>
      <div className="flex max-w-[65ch] flex-col gap-3 pb-3 pt-1">
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
  );
}

/** Text link whose ::after covers the whole card (the card is `relative`). */
function CardLink({ item }: { item: SpecializedInterview }) {
  const action = actionWord(item);
  return (
    <Link
      aria-label={`${action} ${item.title}`}
      className={clsx(
        "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md text-sm font-bold text-link after:absolute after:inset-0 after:rounded-lg hover:underline",
        FOCUS,
      )}
      href={item.href}
    >
      {action} <ArrowRight aria-hidden size={15} strokeWidth={2.5} />
    </Link>
  );
}

/** Compact card: title, one line, meta, then disclosure + action on one footer row. No dead space. */
function CompactCard({ item, className }: { item: SpecializedInterview; className?: string }) {
  const Icon = item.icon;
  return (
    <li className={clsx(CARD, "flex flex-col gap-1.5 px-4 pt-4", className)} data-interview={item.key}>
      <h2 className="flex items-start gap-2 font-display text-lg font-medium leading-tight text-cwru-blue">
        <Icon aria-hidden className="mt-0.5 shrink-0" size={20} strokeWidth={1.75} />
        {item.title}
      </h2>
      <p className="text-sm leading-[1.45] text-muted">{item.tagline}</p>
      <Meta item={item} />
      <div className="mt-auto flex flex-wrap items-start justify-between gap-x-3">
        <Covers item={item} className="min-w-0 flex-1" />
        <CardLink item={item} />
      </div>
    </li>
  );
}

// Static class names so Tailwind sees them; index = span of 12.
const SM_SPAN: Record<number, string> = { 6: "sm:col-span-6", 12: "sm:col-span-12" };
const LG_SPAN: Record<number, string> = { 4: "lg:col-span-4", 6: "lg:col-span-6", 12: "lg:col-span-12" };
const XL_SPAN: Record<number, string> = { 3: "xl:col-span-3", 4: "xl:col-span-4", 6: "xl:col-span-6", 12: "xl:col-span-12" };

/**
 * Balanced: every row full width at every breakpoint. Seven cards are 4 + 3 at
 * xl, 3 + 2 + 2 at lg (the 1024 content column is too narrow for four), and
 * 2 + 2 + 2 + 1 on tablet.
 */
function BalancedLayout() {
  const sm = balancedSpans(SPECIALIZED.length, 2);
  const lg = balancedSpans(SPECIALIZED.length, 3);
  const xl = balancedSpans(SPECIALIZED.length, 4);
  return (
    <ul aria-label="Industry-specific interviews" className="grid gap-3 sm:grid-cols-12">
      {SPECIALIZED.map((item, index) => (
        <CompactCard key={item.key} className={clsx(SM_SPAN[sm[index]], LG_SPAN[lg[index]], XL_SPAN[xl[index]])} item={item} />
      ))}
    </ul>
  );
}

/**
 * Filler: four across at xl (two below, since eight cards in three columns would
 * leave a gap), with the general interview as a quiet last tile so no slot is empty.
 */
function FillerLayout() {
  return (
    <ul aria-label="Industry-specific interviews" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[...SPECIALIZED, GENERAL_PICKER_ITEM].map((item) => (
        <CompactCard key={item.key} item={item} />
      ))}
    </ul>
  );
}

export default function IndustryInterviewsPage({ layout = DEFAULT_LAYOUT }: { layout?: InterviewLayout }) {
  return (
    <div className="flex flex-col gap-5" data-layout={layout}>
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

      {layout === "filler" ? <FillerLayout /> : <BalancedLayout />}
    </div>
  );
}
