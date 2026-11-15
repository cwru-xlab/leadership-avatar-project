"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { ChevronRight } from "lucide-react";

import { listInteractionTypes } from "@/lib/interactions";
import type { ReportDTO } from "@/lib/report/dto";
import { displayReportTitle, formatReportWhen } from "@/lib/report/title";
import { routes } from "@/lib/routes";

import BalancedGrid from "@/components/layout/BalancedGrid";

import InteractionTile from "./InteractionTile";
import PageTitle from "@/components/shell/PageTitle";

const STATUS_WORD: Record<ReportDTO["status"], string | null> = {
  READY: null,
  PENDING: "Scoring",
  FAILED: "Couldn't score",
  IN_PROGRESS: "Not finished",
};

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
        <PageTitle>
          What do you want to practice?
        </PageTitle>
        <p className="text-[15px] leading-[1.55] text-muted">
          Each session is a{" "}
          <em className="font-semibold not-italic text-ink">personalized</em>{" "}
          live conversation with an AI avatar, followed by a scored report.
        </p>
      </header>

      {/* Rows always fill the width: seven types are 3 + 2 + 2 on desktop, 2 + 2 + 2 + 1 on tablet. */}
      <BalancedGrid className="gap-4" perRow={{ md: 2, xl: 3 }}>
        {types.map((type) => (
          <InteractionTile key={type.slug} className="w-full flex-1" type={type} />
        ))}
      </BalancedGrid>

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
