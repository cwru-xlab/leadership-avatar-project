"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";

import { listInteractionTypes } from "@/lib/interactions";
import type { ReportDTO } from "@/lib/report/dto";
import { displayReportTitle, formatReportWhen } from "@/lib/report/title";
import { routes } from "@/lib/routes";

import InteractionTile from "./InteractionTile";

const STATUS_WORD: Record<ReportDTO["status"], string | null> = {
  READY: null,
  PENDING: "Scoring",
  FAILED: "Couldn't score",
  IN_PROGRESS: "Not finished",
};

/**
 * Grid spans that never leave a lone card in the last row: three across on
 * wide screens (a short last row splits the width), two across on tablets
 * (an odd last card takes the full row).
 */
function cardSpan(index: number, count: number): string {
  const lastRowStart = count - (count % 3 || 3);
  const wide =
    index < lastRowStart || count % 3 === 0
      ? "xl:col-span-2"
      : count % 3 === 2
        ? "xl:col-span-3"
        : "xl:col-span-6";
  const medium = count % 2 === 1 && index === count - 1 ? "md:col-span-2" : "";
  return clsx(wide, medium);
}

/**
 * The student landing experience: a card grid of the leadership
 * interaction types, one level ABOVE interview and case-play, then the three
 * most recent reports. Adding a sixth interaction type is a new record in
 * `lib/interactions`, not a new page — this component renders whatever
 * `listInteractionTypes()` returns and imports nothing about the experiences
 * themselves.
 */
export default function InteractionDashboard() {
  const types = listInteractionTypes();
  const [recent, setRecent] = useState<ReportDTO[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/practice/reports", {
      cache: "no-store",
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data: { reports?: ReportDTO[] }) => {
        if (!cancelled) setRecent((data.reports ?? []).slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
          What do you want to practice?
        </h1>
        <p className="text-[15px] leading-[1.55] text-muted">
          Each session is a live conversation with an AI avatar, followed by a
          scored report.
        </p>
      </header>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {types.map((type, index) => (
          <li
            key={type.slug}
            className={clsx("flex", cardSpan(index, types.length))}
          >
            <InteractionTile className="w-full" type={type} />
          </li>
        ))}
      </ul>

      {recent && (
        <section
          aria-labelledby="recent-reports"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2
              className="font-display text-[22px] font-medium leading-[1.15] text-cwru-blue"
              id="recent-reports"
            >
              Recent reports
            </h2>
            {recent.length > 0 && (
              <NextLink
                className="text-sm font-semibold text-link hover:underline"
                href={routes.reports()}
              >
                All reports
              </NextLink>
            )}
          </div>
          {recent.length === 0 ? (
            <p
              className="la-hatch rounded-lg border border-line px-4 py-6 text-sm text-muted"
            >
              Your reports will appear here after your first session.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
              {recent.map((report) => {
                const when = report.completedAt ?? report.startedAt;
                const status = STATUS_WORD[report.status];
                return (
                  <li key={report.id}>
                    <NextLink
                      className="flex min-h-14 items-center gap-4 px-4 py-3 transition-colors duration-150 ease-out hover:bg-canvas"
                      href={routes.report(report.id)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold text-ink">
                          {displayReportTitle({
                            title: report.title,
                            typeSlug: report.typeSlug,
                            input: report.input,
                            when,
                          })}
                        </span>
                        <span className="truncate text-[13px] text-muted">
                          {formatReportWhen(when)}
                          {status && ` · ${status}`}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="shrink-0 text-muted"
                        size={18}
                        strokeWidth={1.5}
                      />
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
