"use client";

/**
 * Interview practice entry — general versus industry-specific, the same
 * two-door shape as the pitches picker (`app/practice/pitches/page.tsx`).
 *
 * General is the one-click default: Start goes straight into the setup wizard
 * at `routes.interview("general")` with preset defaults (no customization
 * handoff is written). "Customize first" opens the general preset's own
 * customization page. Industry-specific opens the second picker page, which
 * lists every listed specialized preset plus the coding room.
 */
import Link from "next/link";
import { ArrowRight, Briefcase, Clock3, FileChartColumn, Layers, SlidersHorizontal, UserRound } from "lucide-react";

import PracticeHero from "@/components/practice/PracticeHero";
import { interviewTagline, listSpecializedInterviews } from "@/components/interview/interviewPicker";
import { DEFAULT_INTERVIEW_TYPE } from "@/lib/interview/types";
import { routes } from "@/lib/routes";

const GENERAL = DEFAULT_INTERVIEW_TYPE;
const SPECIALIZED = listSpecializedInterviews();
const NAMES = SPECIALIZED.map((item) => item.title.split(" / ")[0].toLowerCase());
const PREVIEW_ICONS = SPECIALIZED.slice(0, 5);

function namesLine(): string {
  if (NAMES.length <= 3) return NAMES.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${NAMES.slice(0, 3).join(", ")} and ${NAMES.length - 3} more`;
}

export default function InterviewEntryPage() {
  const minutes = SPECIALIZED.map((item) => item.minutes);
  const specializedRange = `${Math.min(...minutes)}–${Math.max(...minutes)} min`;

  return (
    <div className="flex flex-col gap-6">
      <PracticeHero
        backHref={routes.practice()}
        description="A live AI interviewer asks, follows up and scores you. Start general, or pick an interview built for your field."
        facts={[
          { icon: UserRound, label: "Live avatar" },
          { icon: FileChartColumn, label: "Scored report" },
        ]}
        icon={Briefcase}
        title="Interview practice"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-labelledby="general-interview-heading"
          className="flex flex-col gap-5 rounded-lg border border-line bg-white p-6"
        >
          <div className="flex flex-col gap-2">
            <h2
              className="flex items-center gap-3 font-display text-2xl font-medium text-cwru-blue"
              id="general-interview-heading"
            >
              <Briefcase aria-hidden className="shrink-0" size={24} strokeWidth={1.75} />
              General interview
            </h2>
            <p className="text-[15px] leading-6 text-muted">{interviewTagline(GENERAL)}</p>
          </div>

          {GENERAL.questionAreas && (
            <ol aria-label="What it covers" className="flex flex-col gap-2">
              {GENERAL.questionAreas.map((area, index) => (
                <li key={area} className="flex items-center gap-3 text-sm text-ink">
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full border border-line font-semibold tabular-nums text-cwru-blue"
                  >
                    {index + 1}
                  </span>
                  {area}
                </li>
              ))}
            </ol>
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden size={14} />~{GENERAL.targetMinutes} min
            </span>
            <span aria-hidden>·</span>
            <span>{GENERAL.difficulty}</span>
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-cwru-blue px-5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-cwru-blue/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
              href={routes.interview(GENERAL.slug)}
            >
              Start general interview <ArrowRight aria-hidden size={16} strokeWidth={2.5} />
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
              href={routes.customizeInterview(GENERAL.slug)}
            >
              <SlidersHorizontal aria-hidden size={15} />
              Customize first
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="industry-interview-heading"
          className="group relative flex flex-col gap-5 rounded-lg border border-line bg-white p-6 transition-colors duration-150 ease-out hover:border-true-blue/50"
        >
          <div className="flex flex-col gap-2">
            <h2
              className="flex items-center gap-3 font-display text-2xl font-medium text-cwru-blue"
              id="industry-interview-heading"
            >
              <Layers aria-hidden className="shrink-0" size={24} strokeWidth={1.75} />
              Industry-specific interview
            </h2>
            <p className="text-[15px] leading-6 text-muted">
              The questions and the interviewer change with the field.
            </p>
          </div>

          <ul aria-label="Included interviews" className="flex flex-wrap items-center gap-2">
            {PREVIEW_ICONS.map(({ key, icon: Icon, title }) => (
              <li
                key={key}
                className="grid size-10 place-items-center rounded-full border border-line text-cwru-blue"
                title={title}
              >
                <Icon aria-hidden size={18} strokeWidth={1.75} />
                <span className="sr-only">{title}</span>
              </li>
            ))}
          </ul>
          <p className="-mt-2 text-sm text-ink first-letter:uppercase">{namesLine()}</p>

          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Clock3 aria-hidden size={14} />
            {specializedRange}
          </p>

          <div className="mt-auto flex pt-1">
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-cwru-blue px-5 text-sm font-semibold text-cwru-blue transition-colors duration-150 ease-out after:absolute after:inset-0 after:rounded-lg hover:bg-light-blue/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
              href={routes.industryInterviews()}
            >
              Choose an interview <ArrowRight aria-hidden size={16} strokeWidth={2.5} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
