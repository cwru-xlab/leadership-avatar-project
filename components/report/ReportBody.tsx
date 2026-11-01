"use client";

/**
 * The report body: the score panel, the one thing to practice next, five tabs
 * over the evaluator's structured output, and the Moments timeline that
 * closes the page.
 *
 * WHY: the report used to be a single 600-800 word markdown blob under the
 * score cards — nothing scannable, nothing collapsible, and the one genuinely
 * actionable line ("One thing to practice next time") buried at the bottom
 * after a twelve-item bullet list. The evaluator now returns DATA
 * (`lib/report/structured.ts`), so the content can be navigated instead of
 * read start to finish.
 *
 * LEGACY PATH: every report generated before that change has
 * `reportStructured: null` and only markdown. Those must keep rendering, so
 * this component falls back to `ReportMarkdown` rather than showing an empty
 * page. That fallback is the most likely thing to break silently here.
 *
 * RAW FIGURES: unlike `ReportScoreCards`, the Statistics tab and the narrative
 * quote concrete numbers. That split is deliberate — see the note atop
 * `ReportScoreCards.tsx`.
 *
 * Tabs with no data are dropped, never shown empty.
 */
import type { FeedbackSource, StructuredReport } from "@/lib/report/structured";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Tab, Tabs } from "@heroui/tabs";
import { ChevronDown } from "lucide-react";

import ReportMarkdown from "@/components/interview/ReportMarkdown";
import ReportScoreCards, {
  type ReportScoreCardsProps,
} from "@/components/interview/ReportScoreCards";
import { levelDotClass } from "@/components/report/LevelChip";
import MomentsTimeline, {
  ANSWER_RAMP,
  buildTimelineAnswers,
} from "@/components/report/MomentsTimeline";
import ReportStatistics, { hasStatistics } from "@/components/report/ReportStatistics";
import {
  formatTimecode,
  visualBands,
  visualBodyLanguageBands,
  visualObservationRows,
  vocalBands,
} from "@/lib/metrics/bands";

/**
 * Attribution chip for a feedback item's evidence basis. Returns `null` for
 * a null/absent source — the legacy path (reports generated before this
 * field existed, or any non-interview evaluator, which never declares it)
 * must stay silent, never render an "unknown" badge.
 */
function SourceChip({ source }: { source?: FeedbackSource | null }) {
  if (!source) return null;
  const label =
    source === "resume"
      ? "From your resume"
      : source === "conversation"
        ? "From the conversation"
        : "Resume + conversation";
  return (
    <span
      className="whitespace-nowrap rounded-sm bg-light-blue/32 px-2 py-0.5 text-xs text-cwru-blue"
      title={source === "both" ? "From your resume and the conversation" : undefined}
    >
      {label}
    </span>
  );
}

interface ReportBodyProps {
  structured: StructuredReport | null;
  markdown: string | null;
  scores: ReportScoreCardsProps["scores"];
  metrics: ReportScoreCardsProps["metrics"];
  showInterviewPaceTarget?: boolean;
}

function SectionHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3 className="font-display text-[22px] font-medium leading-[1.15] text-cwru-blue">
      {children}
      {count !== undefined && (
        <span className="ml-2 font-sans text-sm font-normal text-muted">{count}</span>
      )}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[65ch] text-[15px] leading-[1.55] text-ink">{children}</p>;
}

function BandList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted">{row.label}</dt>
          <dd className="text-right text-sm font-semibold text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One expandable row card: title line always visible, detail behind a click. */
function DisclosureRow({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <button
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors duration-150 ease-out hover:bg-canvas"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="min-w-[10rem] flex-1 text-[15px] font-semibold text-ink">{title}</span>
          {meta}
        </span>
        <ChevronDown
          aria-hidden
          className={clsx("shrink-0 text-link transition-transform duration-200", open && "rotate-180")}
          size={16}
        />
      </button>
      {open && <div className="flex flex-col gap-2 px-4 pb-4 text-[14.5px]">{children}</div>}
    </div>
  );
}

/** First two sentences up front; the rest behind "Read the full summary". */
function Summary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  const lead = sentences.slice(0, 2).join("").trim();
  const hasMore = sentences.length > 2;
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[56ch] text-[17px] leading-[1.55] text-ink">{expanded ? text : lead}</p>
      {hasMore && (
        <button
          className="w-fit text-sm font-semibold text-link hover:underline"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Read the full summary"}
        </button>
      )}
    </div>
  );
}

const TAB_CLASSES = {
  base: "w-full",
  tabList: "w-full gap-7 overflow-x-auto rounded-none border-b border-line p-0",
  tab: "h-12 max-w-fit px-0",
  tabContent:
    "text-[15px] font-medium text-muted group-data-[selected=true]:font-semibold group-data-[selected=true]:text-cwru-blue",
  cursor: "h-0.5 w-full bg-true-blue",
  panel: "px-0 pb-0 pt-6",
};

export default function ReportBody({
  structured,
  markdown,
  scores,
  metrics,
  showInterviewPaceTarget = false,
}: ReportBodyProps) {
  const [selectedAnswer, setSelectedAnswer] = useState(0);

  const answers = useMemo(
    () =>
      buildTimelineAnswers(
        metrics?.vocal ?? null,
        metrics?.visual ?? null,
        structured?.growth_areas ?? [],
      ),
    [metrics, structured],
  );

  // Pre-structured rows: render exactly what they rendered before. No tabs,
  // no empty panels — the data to fill them does not exist.
  if (!structured) {
    return markdown ? (
      <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
        <ReportMarkdown markdown={markdown} />
      </div>
    ) : null;
  }

  const showMoment = (index: number) => {
    setSelectedAnswer(index);
    document.getElementById("moments")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasMomentsSection =
    answers.length > 0 ||
    (metrics?.visual?.episodes?.length ?? 0) > 0 ||
    (metrics?.visual?.observations?.episodes?.length ?? 0) > 0;
  // Scenario reports have no rubric-notes section at all. An empty tab is
  // worse than an absent one, so the panel is dropped rather than shown blank.
  const hasContentTab =
    Boolean(structured.category_notes.content) ||
    Boolean(structured.category_notes.behavioral) ||
    structured.rubric_notes.length > 0;
  const hasDeliveryTab = Boolean(metrics?.visual || metrics?.vocal);
  const hasStatsTab = hasStatistics(metrics);
  const revisit = answers
    .filter((a) => a.level <= 2)
    .sort((a, b) => a.level - b.level || a.start - b.start);

  return (
    <div className="flex flex-col gap-7">
      <ReportScoreCards metrics={metrics} scores={scores} />

      {/* Promoted from the very bottom of the old report. It is the single
          most actionable line and was the hardest thing to find. The only
          tinted panel on the page. */}
      {structured.practice_next && (
        <section
          aria-labelledby="practice-next"
          className="flex items-center gap-6 rounded-xl bg-light-blue/32 px-5 py-6 md:px-7"
        >
          <TargetMark />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-semibold text-cwru-blue" id="practice-next">
              One thing to practice next time
            </h2>
            <p
              className={clsx(
                "max-w-[56ch] font-display italic leading-[1.35] text-ink",
                // A one-line statement reads at 24px; a long one would read as a headline.
                structured.practice_next.length > 140 ? "text-lg md:text-xl" : "text-xl md:text-2xl",
              )}
            >
              {structured.practice_next}
            </p>
          </div>
        </section>
      )}

      <Tabs aria-label="Report sections" classNames={TAB_CLASSES} variant="underlined">
        <Tab key="overview" title="Overview">
          <div className="flex flex-col gap-7">
            {structured.overall_summary && <Summary text={structured.overall_summary} />}

            <div className="grid gap-6 md:grid-cols-2">
              {structured.strengths.length > 0 && (
                <section className="flex min-w-0 flex-col gap-2">
                  <SectionHeading count={structured.strengths.length}>Strengths</SectionHeading>
                  {structured.strengths.map((s, i) => (
                    <DisclosureRow key={`s-${i}`} meta={<SourceChip source={s.source} />} title={s.title}>
                      <Prose>{s.detail}</Prose>
                      {s.evidence && (
                        <p className="font-display text-base italic text-muted">“{s.evidence}”</p>
                      )}
                    </DisclosureRow>
                  ))}
                </section>
              )}

              {structured.growth_areas.length > 0 && (
                <section className="flex min-w-0 flex-col gap-2">
                  <SectionHeading count={structured.growth_areas.length}>Growth areas</SectionHeading>
                  {structured.growth_areas.map((g, i) => {
                    const cited = answers.find((a) => a.citedBy === g.title);
                    return (
                      <DisclosureRow
                        key={`g-${i}`}
                        meta={
                          <>
                            {/* Source answers "where did this come from"; the
                                timecodes answer "when". Timecodes stay on the
                                collapsed row: they are the link to Moments and
                                are useless hidden inside it. */}
                            <SourceChip source={g.source} />
                            {g.timecodes.length > 0 && (
                              <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-muted">
                                {g.timecodes.join(" · ")}
                              </span>
                            )}
                          </>
                        }
                        title={g.title}
                      >
                        <Prose>{g.detail}</Prose>
                        <p className="max-w-[65ch] text-ink">
                          <span className="font-semibold">Consider trying this: </span>
                          {g.suggestion}
                        </p>
                        {cited && (
                          <a
                            className="w-fit text-[13.5px] font-semibold text-link hover:underline"
                            href="#moments"
                            onClick={(event) => {
                              event.preventDefault();
                              showMoment(cited.index);
                            }}
                          >
                            Show this moment on the timeline ↓
                          </a>
                        )}
                      </DisclosureRow>
                    );
                  })}
                </section>
              )}
            </div>
          </div>
        </Tab>

        {structured.strengths.length + structured.growth_areas.length > 0 ? (
          <Tab key="takeaways" title="Takeaways">
            <div className="grid overflow-hidden rounded-xl border border-line bg-white md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              <TakeawayColumn title="Keep doing">
                {structured.strengths.map((s, i) => (
                  <TakeawayItem key={i} dot="bg-level-4" detail={s.detail} title={s.title} />
                ))}
              </TakeawayColumn>
              <TakeawayColumn title="Work on next">
                {structured.growth_areas.map((g, i) => (
                  <TakeawayItem
                    key={i}
                    dot="bg-level-2"
                    detail={`Consider trying this: ${g.suggestion}`}
                    title={g.title}
                  />
                ))}
              </TakeawayColumn>
              {answers.length > 0 && (
                <TakeawayColumn title="Answers to revisit">
                  {revisit.length === 0 ? (
                    <li className="text-sm text-muted">No answer stood out as uneven.</li>
                  ) : (
                    revisit.map((a) => (
                      <li key={a.index}>
                        <a
                          className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-ink transition-colors duration-150 ease-out hover:bg-canvas"
                          href="#moments"
                          onClick={(event) => {
                            event.preventDefault();
                            showMoment(a.index);
                          }}
                        >
                          <span aria-hidden className={clsx("size-2.5 shrink-0 rounded-full", levelDotClass(ANSWER_RAMP[a.level]))} />
                          <span className="flex min-w-0 flex-1 flex-col leading-snug">
                            <span className="font-semibold">Answer {a.index + 1}</span>
                            <span className="text-[13px] text-muted">
                              {a.word} delivery
                              {offTargetSummary(a.notes)}
                            </span>
                          </span>
                          <span className="font-mono text-[12.5px] tabular-nums text-muted">
                            {formatTimecode(a.start)}
                          </span>
                        </a>
                      </li>
                    ))
                  )}
                </TakeawayColumn>
              )}
            </div>
          </Tab>
        ) : null}

        {hasStatsTab ? (
          <Tab key="statistics" title="Statistics">
            <ReportStatistics metrics={metrics} showInterviewPaceTarget={showInterviewPaceTarget} />
          </Tab>
        ) : null}

        {hasDeliveryTab ? (
          <Tab key="delivery" title="Delivery">
            <div className="grid gap-7 md:grid-cols-2">
              {metrics?.visual && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>On camera</SectionHeading>
                  <BandList rows={visualBands(metrics.visual)} />
                  {structured.category_notes.visual && <Prose>{structured.category_notes.visual}</Prose>}
                </section>
              )}

              {metrics?.vocal && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>Voice</SectionHeading>
                  {showInterviewPaceTarget && (
                    <p className="text-sm text-muted">
                      Assessed pace: {Math.round(metrics.vocal.words_per_minute)} WPM. {"Interview target: 100–159 WPM."}
                    </p>
                  )}
                  <BandList rows={vocalBands(metrics.vocal)} />
                  {structured.category_notes.vocal && <Prose>{structured.category_notes.vocal}</Prose>}
                </section>
              )}

              {/* Legible as its own thing rather than extra rows on the camera
                  list — a pre-Phase-12 report has no scored body-language fields
                  on `metrics.visual`, so this renders nothing new. */}
              {metrics?.visual && visualBodyLanguageBands(metrics.visual).length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>Body language</SectionHeading>
                  <BandList rows={visualBodyLanguageBands(metrics.visual)} />
                </section>
              )}

              {/* LAST section of Delivery, deliberately. These are things the
                  camera recorded that do not affect any score — stated once here,
                  at the section level, never as a per-row tag inside a scored
                  list. Muted treatment only; the tinted panel is reserved for
                  "One thing to practice next time". */}
              {metrics?.visual && visualObservationRows(metrics.visual).length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>Observations</SectionHeading>
                  <p className="text-sm text-muted">
                    Things the camera recorded during the session. These do not affect any score.
                  </p>
                  <BandList rows={visualObservationRows(metrics.visual)} />
                </section>
              )}
            </div>
          </Tab>
        ) : null}

        {hasContentTab ? (
          <Tab key="content" title="Content">
            <div className="flex flex-col gap-7">
              {structured.category_notes.content && (
                <section className="flex flex-col gap-2">
                  <SectionHeading>Content and structure</SectionHeading>
                  <Prose>{structured.category_notes.content}</Prose>
                </section>
              )}
              {structured.category_notes.behavioral && (
                <section className="flex flex-col gap-2">
                  <SectionHeading>Behavioral and mindset</SectionHeading>
                  <Prose>{structured.category_notes.behavioral}</Prose>
                </section>
              )}
              {structured.rubric_notes.length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>By rubric item</SectionHeading>
                  <dl className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white">
                    {structured.rubric_notes.map((n) => (
                      <div
                        key={n.item}
                        className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                      >
                        <dt className="text-sm font-semibold text-ink">{n.item}</dt>
                        <dd className="text-sm text-muted sm:max-w-[70%] sm:text-right">{n.note}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>
          </Tab>
        ) : null}
      </Tabs>

      {hasMomentsSection && (
        <MomentsTimeline
          answers={answers}
          selected={selectedAnswer}
          visual={metrics?.visual ?? null}
          onSelect={setSelectedAnswer}
        />
      )}
    </div>
  );
}

function offTargetSummary(notes: { label: string; value: string }[]): string {
  const flagged = notes.filter((n) =>
    ["Slow", "Fast", "Frequent", "Very frequent", "Variable", "Uneven"].includes(n.value),
  );
  return flagged.length
    ? `, ${flagged.map((n) => `${n.label.toLowerCase()} ${n.value.toLowerCase()}`).join(", ")}`
    : "";
}

function TakeawayColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 px-6 py-[22px] shadow-[-1px_0_0_var(--la-line),0_-1px_0_var(--la-line)]">
      <h3 className="font-display text-[22px] font-medium text-cwru-blue">{title}</h3>
      <ul className="flex flex-col gap-3.5">{children}</ul>
    </section>
  );
}

function TakeawayItem({ title, detail, dot }: { title: string; detail: string; dot: string }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className={clsx("mt-2 size-2 shrink-0 rounded-full", dot)} />
      <span className="flex flex-col">
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-sm text-muted">{detail}</span>
      </span>
    </li>
  );
}

/** The practice-next target. Its ripple plays twice on load and stops. */
function TargetMark() {
  return (
    <div aria-hidden className="relative size-16 shrink-0 max-sm:hidden">
      <span className="absolute inset-0 rounded-full border-2 border-true-blue opacity-0 motion-safe:animate-[la-ripple_1.6s_ease-out_0.4s_2]" />
      <svg className="relative" height="64" viewBox="0 0 56 56" width="64">
        <circle cx="28" cy="28" fill="white" r="22" />
        <circle cx="28" cy="28" fill="none" r="16" stroke="var(--la-true-blue)" strokeWidth="2" />
        <circle cx="28" cy="28" fill="none" r="8" stroke="var(--la-true-blue)" strokeWidth="2" />
        <circle cx="28" cy="28" fill="var(--la-cwru-blue)" r="3" />
        <path d="M28 28 46 10" stroke="var(--la-cwru-blue)" strokeLinecap="round" strokeWidth="2.5" />
        <path
          d="m41 9 5 1 1 5"
          fill="none"
          stroke="var(--la-cwru-blue)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
}
