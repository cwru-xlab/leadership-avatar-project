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
 * Technical coding is the featured mode: every layout keeps it, and every other
 * option, inside the first 1440×900 viewport, and gives it the page's one
 * filled primary button. Each layout keeps the same text levels: title, one
 * line, time · level visible; "What it covers" behind a disclosure.
 *
 * Three layouts are under review (2026-11-14). `DEFAULT_LAYOUT` (interviewPicker.ts) is what ships;
 * `?layout=featured|grouped|rows` previews the others until one is picked.
 */
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ChevronDown, Clock3, FileChartColumn, Layers, UserRound } from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
import {
  DEFAULT_LAYOUT,
  FEATURED_INTERVIEW_KEY,
  INTERVIEW_GROUPS,
  type InterviewLayout,
  interviewGroup,
  listSpecializedInterviews,
  orderForPicker,
  type SpecializedInterview,
} from "@/components/interview/interviewPicker";
import { routes } from "@/lib/routes";

const SPECIALIZED = orderForPicker(listSpecializedInterviews());

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue";
const CARD = "relative rounded-lg border border-line bg-white transition-colors duration-150 ease-out hover:border-true-blue/50";
const FEATURE_CARD =
  "relative rounded-xl border border-true-blue/40 bg-light-blue/20 transition-colors duration-150 ease-out hover:border-true-blue";

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
          "inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md font-semibold text-link hover:underline [&::-webkit-details-marker]:hidden",
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

/** The page's one filled primary, for the featured interview; its ::after also covers the card. */
function PrimaryLink({ item }: { item: SpecializedInterview }) {
  const action = actionWord(item);
  return (
    <Link
      aria-label={`${action} ${item.title}`}
      className={clsx(
        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-cwru-blue px-5 text-sm font-semibold text-white transition-colors duration-150 ease-out after:absolute after:inset-0 after:rounded-xl hover:bg-cwru-blue/90",
        FOCUS,
      )}
      href={item.href}
    >
      {action} {item.title.toLowerCase()} <ArrowRight aria-hidden size={16} strokeWidth={2.5} />
    </Link>
  );
}

/** Compact card: title, one line, meta, then disclosure + action on one footer row. No dead space. */
function CompactCard({ item, heading = "h2" }: { item: SpecializedInterview; heading?: "h2" | "h3" }) {
  const Icon = item.icon;
  const Heading = heading;
  return (
    <li className={clsx(CARD, "flex flex-col gap-1.5 px-4 pt-4")} data-interview={item.key}>
      <Heading className="flex items-start gap-2 font-display text-lg font-medium leading-tight text-cwru-blue">
        <Icon aria-hidden className="mt-0.5 shrink-0" size={20} strokeWidth={1.75} />
        {item.title}
      </Heading>
      <p className="text-sm leading-[1.45] text-muted">{item.tagline}</p>
      <Meta item={item} />
      <div className="mt-auto flex flex-wrap items-start justify-between gap-x-3">
        <Covers item={item} className="min-w-0 flex-1" />
        <CardLink item={item} />
      </div>
    </li>
  );
}

/** B: the coding room as a wide card across the top, then a compact grid of the rest. */
function FeaturedLayout() {
  return (
    <ul aria-label="Industry-specific interviews" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {SPECIALIZED.map((item) => {
        if (item.key !== FEATURED_INTERVIEW_KEY) return <CompactCard key={item.key} item={item} />;
        const Icon = item.icon;
        return (
          <li
            key={item.key}
            className={clsx(FEATURE_CARD, "flex flex-col gap-1 px-5 pt-5 sm:col-span-2 md:px-6 lg:col-span-3")}
            data-interview={item.key}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="flex min-w-0 items-start gap-4">
                <span className="hidden size-12 shrink-0 place-items-center rounded-xl bg-cwru-blue text-white sm:grid">
                  <Icon aria-hidden size={24} strokeWidth={1.75} />
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h2 className="flex items-center gap-2 font-display text-2xl font-medium leading-tight text-cwru-blue">
                    <Icon aria-hidden className="shrink-0 sm:hidden" size={22} strokeWidth={1.75} />
                    {item.title}
                  </h2>
                  <p className="text-[15px] leading-6 text-ink">{item.tagline}</p>
                  <Meta item={item} />
                </div>
              </div>
              <PrimaryLink item={item} />
            </div>
            <Covers item={item} className="sm:pl-16" />
          </li>
        );
      })}
    </ul>
  );
}

/** A: grouped by field, Technical first; the coding room leads its group, two columns wide. */
function GroupedLayout() {
  return (
    <div className="flex flex-col gap-6">
      {INTERVIEW_GROUPS.map((group) => {
        const items = SPECIALIZED.filter((item) => interviewGroup(item.key) === group.key);
        if (items.length === 0) return null;
        const headingId = `interview-group-${group.key}`;
        return (
          <section key={group.key} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-medium leading-[1.15] text-cwru-blue" id={headingId}>
              {group.title}
            </h2>
            <ul aria-labelledby={headingId} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((item) => {
                if (item.key !== FEATURED_INTERVIEW_KEY) return <CompactCard key={item.key} heading="h3" item={item} />;
                const Icon = item.icon;
                return (
                  <li
                    key={item.key}
                    className={clsx(FEATURE_CARD, "flex flex-col gap-1.5 px-5 pt-4 sm:col-span-2")}
                    data-interview={item.key}
                  >
                    <h3 className="flex items-start gap-2 font-display text-[22px] font-medium leading-tight text-cwru-blue">
                      <Icon aria-hidden className="mt-0.5 shrink-0" size={22} strokeWidth={1.75} />
                      {item.title}
                    </h3>
                    <p className="text-[15px] leading-6 text-ink">{item.tagline}</p>
                    <Meta item={item} />
                    <div className="mt-auto flex flex-wrap-reverse items-center justify-between gap-x-3 pb-3 pt-1">
                      <Covers item={item} className="min-w-0" />
                      <PrimaryLink item={item} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** C: one compact list, the coding row first and tinted, action on the right of each row. */
function RowsLayout() {
  return (
    <ul aria-label="Industry-specific interviews" className="flex flex-col gap-2">
      {SPECIALIZED.map((item) => {
        const Icon = item.icon;
        const featured = item.key === FEATURED_INTERVIEW_KEY;
        return (
          <li
            key={item.key}
            className={clsx(featured ? FEATURE_CARD : CARD, "flex flex-col px-4 pt-2 sm:px-5", featured && "py-1")}
            data-interview={item.key}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-1">
              <div className="flex min-w-0 flex-1 basis-[22rem] items-start gap-3">
                <Icon
                  aria-hidden
                  className="mt-0.5 shrink-0 text-cwru-blue"
                  size={featured ? 22 : 20}
                  strokeWidth={1.75}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2
                    className={clsx(
                      "font-display font-medium leading-tight text-cwru-blue",
                      featured ? "text-[22px]" : "text-lg",
                    )}
                  >
                    {item.title}
                  </h2>
                  <p className="text-sm leading-[1.45] text-muted">{item.tagline}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 pl-8 sm:pl-0">
                <div className="w-44">
                  <Meta item={item} />
                </div>
                {featured ? <PrimaryLink item={item} /> : <CardLink item={item} />}
              </div>
            </div>
            <Covers item={item} className="-mt-1 pl-8" />
          </li>
        );
      })}
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

      {layout === "grouped" ? <GroupedLayout /> : layout === "rows" ? <RowsLayout /> : <FeaturedLayout />}
    </div>
  );
}
