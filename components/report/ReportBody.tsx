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
 * RAW FIGURES: unlike `ReportScoreCards`, the Delivery tab's figures and the narrative
 * quote concrete numbers. That split is deliberate — see the note atop
 * `ReportScoreCards.tsx`.
 *
 * Tabs with no data are dropped, never shown empty.
 *
 * ONE HOME PER FACT (2026-11 condense pass): students said they had the gist
 * a third of the way down and the rest read as repetition. So:
 * - The first screen is the gist: four scores, the one thing to practice, a
 *   two-sentence summary and the top three strengths and growth areas.
 * - Three tabs, not five. Takeaways restated the Overview rows' own detail and
 *   suggestions word for word, and its "answers to revisit" were the low
 *   points already marked on Moments. Statistics restated every Delivery band
 *   word beside its figure. Its figures now head the Delivery tab and carry
 *   the band word, and Delivery lists only the rows the figures do not.
 * - Voice and camera rows appear only when they were measured, by the same
 *   gates as the figures, so the tab can never contradict a "Not measured"
 *   score card.
 * Nothing is removed: details, suggestions, evidence, Observations and every
 * rubric note stay one click away.
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
import CheckInBanner from "@/components/report/CheckInBanner";
import MomentsTimeline, { buildTimelineAnswers } from "@/components/report/MomentsTimeline";
import ReportStatistics, {
  hasStatistics,
  measuredVisual,
  measuredVocal,
  VISUAL_ROWS_IN_FIGURES,
} from "@/components/report/ReportStatistics";
import { fallbackClock, reclockVisual, type ReportMoments } from "@/lib/report/moments";
import { applyCheckInHiding, eligibleCheckIns, type CheckInAnswers } from "@/lib/report/check-in";
import {
  visualBands,
  visualBodyLanguageBands,
  visualObservationCaveat,
  visualObservationRows,
} from "@/lib/metrics/bands";

/**
 * Attribution chip for a feedback item's evidence basis. Returns `null` for
 * a null/absent source — the legacy path (reports generated before this
 * field existed, or any non-interview evaluator, which never declares it)
 * must stay silent, never render an "unknown" badge.
 */
function sourceLabel(source: FeedbackSource): string {
  return source === "resume"
    ? "From your resume"
    : source === "conversation"
      ? "From the conversation"
      : "Resume + conversation";
}

function SourceChip({ source }: { source?: FeedbackSource | null }) {
  if (!source) return null;
  const label = sourceLabel(source);
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
  /** Timeline clock and excerpts from the stored transcript. Null without one. */
  moments?: ReportMoments | null;
  showInterviewPaceTarget?: boolean;
  /** Needed to save check-in answers. Without it no check-in is asked. */
  reportId?: string;
  /** Saved check-in answers (`ReportDTO.checkIn`). */
  checkIn?: CheckInAnswers;
}

function SectionHeading({
  children,
  count,
  note,
}: {
  children: React.ReactNode;
  count?: number;
  /** A fact every row shares, said once here instead of on each row. */
  note?: string | null;
}) {
  return (
    <h3 className="font-display text-[22px] font-medium leading-[1.15] text-cwru-blue">
      {children}
      {(count !== undefined || note) && (
        <span className="ml-2 font-sans text-sm font-normal text-muted">
          {[count, note].filter((part) => part !== undefined && part !== null).join(" · ")}
        </span>
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
        className="flex min-h-12 w-full items-center gap-2.5 px-3.5 py-3 text-left outline-none transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-true-blue"
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
          className="w-fit rounded-sm text-sm font-semibold text-link outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Read the full summary"}
        </button>
      )}
    </div>
  );
}

/** How many rows any report list shows before "Show all (n)". */
const VISIBLE_ROWS = 3;

/**
 * A list that shows its first three items and puts the rest behind one
 * button. The evaluator lists most important first, so the cut keeps the top.
 */
function ShowAll<T>({
  items,
  render,
  className = "flex flex-col gap-2",
}: {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, VISIBLE_ROWS);
  return (
    <>
      <div className={className}>{shown.map(render)}</div>
      {items.length > VISIBLE_ROWS && (
        <button
          aria-expanded={all}
          className="w-fit rounded-sm text-sm font-semibold text-link outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue"
          type="button"
          onClick={() => setAll((value) => !value)}
        >
          {all ? "Show fewer" : `Show all (${items.length})`}
        </button>
      )}
    </>
  );
}

/**
 * When every item in a list rests on the same input, say so once under the
 * heading instead of on every row.
 */
function sharedSource(items: { source?: FeedbackSource | null }[]): FeedbackSource | null {
  const first = items[0]?.source ?? null;
  return first && items.every((item) => item.source === first) ? first : null;
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
  moments = null,
  showInterviewPaceTarget = false,
  reportId,
  checkIn,
}: ReportBodyProps) {
  const [selectedAnswer, setSelectedAnswer] = useState(0);
  const [checkInAnswers, setCheckInAnswers] = useState<CheckInAnswers>(checkIn ?? {});

  // Everything on the Moments timeline reads this copy, so episode times agree
  // with the answers and with the growth-area timecodes that cite them.
  const timelineVisual = useMemo(() => {
    const visual = metrics?.visual ?? null;
    return visual && reclockVisual(visual, moments?.clock ?? fallbackClock(visual));
  }, [metrics, moments]);

  // Asked from the full reading, so a flag the student hid stays answerable.
  const checkInQuestions = useMemo(
    () => (reportId ? eligibleCheckIns(metrics?.cameraMode, timelineVisual) : []),
    [reportId, metrics, timelineVisual],
  );

  // What the page SHOWS after "No" or "Something else" took a flag off this
  // report. Display only: `scores` come from the evaluator and are untouched.
  const shown = useMemo(
    () => (timelineVisual ? applyCheckInHiding(timelineVisual, checkInAnswers) : null),
    [timelineVisual, checkInAnswers],
  );
  const displayVisual = shown?.visual ?? null;
  const hiddenRows = shown?.hiddenRowLabels;

  const answers = useMemo(
    () =>
      buildTimelineAnswers(
        metrics?.vocal ?? null,
        displayVisual,
        structured?.growth_areas ?? [],
        moments,
      ),
    [metrics, displayVisual, structured, moments],
  );

  // Pre-structured rows: the score panel, then the stored markdown. No tabs,
  // no empty panels — the data to fill them does not exist. The score panel
  // was missing here once the body took it over from the page, which left a
  // legacy report with no scores on its first screen.
  if (!structured) {
    return (
      <div className="flex flex-col gap-7">
        <ReportScoreCards metrics={metrics} scores={scores} />
        {markdown && (
          <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
            <ReportMarkdown markdown={markdown} />
          </div>
        )}
      </div>
    );
  }

  const showMoment = (index: number) => {
    setSelectedAnswer(index);
    document.getElementById("moments")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasMomentsSection =
    answers.length > 0 ||
    (displayVisual?.episodes?.length ?? 0) > 0 ||
    (displayVisual?.observations?.episodes?.length ?? 0) > 0;
  // Scenario reports have no rubric-notes section at all. An empty tab is
  // worse than an absent one, so the panel is dropped rather than shown blank.
  const hasContentTab =
    Boolean(structured.category_notes.content) ||
    Boolean(structured.category_notes.behavioral) ||
    structured.rubric_notes.length > 0;
  // Delivery rows follow the same "was it measured" gates as the figures.
  const vocal = measuredVocal(metrics);
  const visual = measuredVisual(metrics);
  const cameraRows = visual
    ? visualBands(visual).filter((row) => !VISUAL_ROWS_IN_FIGURES.has(row.label) && !hiddenRows?.has(row.label))
    : [];
  const bodyRows = visual ? visualBodyLanguageBands(visual) : [];
  const observationRows = displayVisual
    ? visualObservationRows(displayVisual).filter((row) => !hiddenRows?.has(row.label))
    : [];
  const visualNote = visual ? structured.category_notes.visual : null;
  const vocalNote = vocal ? structured.category_notes.vocal : null;
  const hasDeliveryTab =
    hasStatistics(metrics) || cameraRows.length > 0 || bodyRows.length > 0 || observationRows.length > 0;
  const strengthSource = sharedSource(structured.strengths);
  const growthSource = sharedSource(structured.growth_areas);

  return (
    <div className="flex flex-col gap-7">
      {/* Above the scores so it is seen, but a card in the flow: it never
          blocks reading, and nothing it saves reaches a score. */}
      {reportId && checkInQuestions.length > 0 && (
        <CheckInBanner
          answers={checkInAnswers}
          questions={checkInQuestions}
          reportId={reportId}
          onAnswersChange={setCheckInAnswers}
        />
      )}

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
                  <SectionHeading
                    count={structured.strengths.length}
                    note={strengthSource && sourceLabel(strengthSource).toLowerCase()}
                  >
                    Strengths
                  </SectionHeading>
                  <ShowAll
                    items={structured.strengths}
                    render={(s, i) => (
                      <DisclosureRow
                        key={`s-${i}`}
                        meta={strengthSource ? null : <SourceChip source={s.source} />}
                        title={s.title}
                      >
                        <Prose>{s.detail}</Prose>
                        {s.evidence && (
                          <p className="font-display text-base italic text-muted">“{s.evidence}”</p>
                        )}
                      </DisclosureRow>
                    )}
                  />
                </section>
              )}

              {structured.growth_areas.length > 0 && (
                <section className="flex min-w-0 flex-col gap-2">
                  <SectionHeading
                    count={structured.growth_areas.length}
                    note={growthSource && sourceLabel(growthSource).toLowerCase()}
                  >
                    Growth areas
                  </SectionHeading>
                  <ShowAll
                    items={structured.growth_areas}
                    render={(g, i) => {
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
                              {!growthSource && <SourceChip source={g.source} />}
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
                          {g.suggestion && (
                            <p className="max-w-[65ch] text-ink">
                              <span className="font-semibold">Consider trying this: </span>
                              {g.suggestion}
                            </p>
                          )}
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
                    }}
                  />
                </section>
              )}
            </div>
          </div>
        </Tab>

        {hasDeliveryTab ? (
          <Tab key="delivery" title="Delivery">
            <div className="flex flex-col gap-7">
              {/* Figures first, each with its band word. The sections below
                  hold only what the figures don't: the remaining camera rows,
                  body language, the coach's note per category, Observations. */}
              <ReportStatistics metrics={metrics} showInterviewPaceTarget={showInterviewPaceTarget} />

              <div className="grid gap-7 md:grid-cols-2">
                {(cameraRows.length > 0 || visualNote) && (
                  <section className="flex flex-col gap-3">
                    <SectionHeading>On camera</SectionHeading>
                    {cameraRows.length > 0 && <BandList rows={cameraRows} />}
                    {visualNote && <Prose>{visualNote}</Prose>}
                  </section>
                )}

                {vocalNote && (
                  <section className="flex flex-col gap-3">
                    <SectionHeading>Voice</SectionHeading>
                    <Prose>{vocalNote}</Prose>
                  </section>
                )}

                {/* Legible as its own thing rather than extra rows on the camera
                    list — a pre-Phase-12 report has no scored body-language fields
                    on `metrics.visual`, so this renders nothing new. */}
                {bodyRows.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SectionHeading>Body language</SectionHeading>
                    <BandList rows={bodyRows} />
                  </section>
                )}

                {/* LAST section of Delivery, deliberately. These are things the
                    camera recorded that do not affect any score — stated once here,
                    at the section level, never as a per-row tag inside a scored
                    list. Muted treatment only; the tinted panel is reserved for
                    "One thing to practice next time". */}
                {/* The reclocked copy, not `metrics.visual`: the rows quote episode
                    times, and must read on the same clock as Moments. */}
                {displayVisual && observationRows.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SectionHeading>Observations</SectionHeading>
                    <p className="text-sm text-muted">
                      Things the camera recorded during the session. These do not affect any score.
                      {visualObservationCaveat(displayVisual) && (
                        <> {visualObservationCaveat(displayVisual)}</>
                      )}
                    </p>
                    <BandList rows={observationRows} />
                  </section>
                )}
              </div>
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
                  <SectionHeading count={structured.rubric_notes.length}>By rubric item</SectionHeading>
                  <ShowAll
                    className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white"
                    items={structured.rubric_notes}
                    render={(n, i) => (
                      <div
                        key={`${n.item}-${i}`}
                        className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                      >
                        <p className="text-sm font-semibold text-ink">{n.item}</p>
                        <p className="text-sm text-muted sm:max-w-[70%] sm:text-right">{n.note}</p>
                      </div>
                    )}
                  />
                </section>
              )}
            </div>
          </Tab>
        ) : null}
      </Tabs>

      {hasMomentsSection && (
        <MomentsTimeline
          answers={answers}
          hasTranscript={moments !== null}
          selected={selectedAnswer}
          visual={displayVisual}
          onSelect={setSelectedAnswer}
        />
      )}
    </div>
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
