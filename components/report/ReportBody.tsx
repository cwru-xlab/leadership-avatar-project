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

import { Fragment, useMemo, useState } from "react";
import clsx from "clsx";
import { Tab, Tabs } from "@heroui/tabs";
import { ChevronDown } from "lucide-react";

import ReportMarkdown from "@/components/interview/ReportMarkdown";
import ReportScoreCards, {
  type ReportScoreCardsProps,
} from "@/components/interview/ReportScoreCards";
import CheckInBanner from "@/components/report/CheckInBanner";
import { levelDotClass } from "@/components/report/LevelChip";
import MomentsTimeline, {
  ANSWER_RAMP,
  buildTimelineAnswers,
} from "@/components/report/MomentsTimeline";
import ReportStatistics, {
  hasStatistics,
  measuredVisual,
  measuredVocal,
} from "@/components/report/ReportStatistics";
import { fallbackClock, reclockVisual, type ReportMoments } from "@/lib/report/moments";
import {
  applyCheckInHiding,
  eligibleCheckIns,
  type CheckInAnswers,
  type CheckInLead,
} from "@/lib/report/check-in";
import {
  formatTimecode,
  visualBands,
  visualBodyLanguageBands,
  visualObservationCaveat,
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
  /** Timeline clock and excerpts from the stored transcript. Null without one. */
  moments?: ReportMoments | null;
  showInterviewPaceTarget?: boolean;
  /** Needed to save check-in answers. Without it no check-in is asked. */
  reportId?: string;
  /** Saved check-in answers (`ReportDTO.checkIn`). */
  checkIn?: CheckInAnswers;
  /** The practice type's check-in coaching opener (`ReportChrome.checkInLead`). */
  checkInLead?: CheckInLead;
  /**
   * Mode-specific tabs appended to the shared strip.
   *
   * Deliberately a local shape rather than an import of `ReportExtraTab`:
   * this component is the GENERIC report body and must not depend on the
   * practice-type chrome map, which imports every mode's panels. `render`
   * takes no argument because the page has already bound the report.
   */
  extraTabs?: { key: string; title: string; render: () => React.ReactNode }[];
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

/**
 * Label/value list for metric bands.
 *
 * ONE GRID, NOT A ROW OF FLEX BOXES. Each row used to be its own
 * `justify-between` flex container, so no two rows shared a label column: the
 * split landed wherever that row's own value width put it. Short values
 * ("Steady") were fine, but these lists also carry sentences — "Held steady
 * from the opening posture", and observation rows quoting episode times — and
 * a long value took the width it wanted until the label gave way. "Hand at
 * mouth" wrapped mid-phrase next to its own wrapped value, which is the
 * raggedness this grid removes.
 *
 * `auto` sizes column one to the WIDEST label in the list, so every label in a
 * card starts and ends on the same edge and wraps only if that widest label
 * cannot fit. Long values then wrap inside column two instead of pushing into
 * column one.
 *
 * Stacked below `sm`: at 375px a shared label column would leave single words
 * per line, so the label sits above its value and the value aligns left with
 * it. `tabular-nums` keeps the figures in a column from shifting width.
 */
/**
 * Label/value list for metric bands.
 *
 * ONE GRID, NOT A ROW OF FLEX BOXES. Each row used to be its own
 * `justify-between` flex container, so no two rows shared a label column: a
 * value box shrink-wrapped its own text and so began wherever that text began.
 * Measured on the real observation rows, the value edges landed at 435 / 556 /
 * 559 / 595px — a 160px spread down a four-row card, with the right edges
 * flush the whole time. Short values ("Steady") hid it; the long ones did not,
 * and "Hand at mouth" and "Posture drift" were squeezed into wrapping
 * mid-phrase by their own values. `auto` sizes column one to the widest label
 * in the list, so every label shares one edge (spread now 0px) and a long
 * value wraps inside column two instead of taking the label's space.
 *
 * TWO VARIANTS, because there are two kinds of row, and `lib/metrics/bands.ts`
 * (see its header) already holds scored and descriptive rendering apart "by
 * design" in separate functions:
 *   - `scored` — band words like "Excellent". One or two words, so flush right
 *     reads as a column and keeps the card's right edge clean.
 *   - `descriptive` — `visualObservationRows`, whose values are sentences
 *     quoting episode times. Right-aligning a sentence that wraps leaves every
 *     line after the first starting at a different x, so these align left on
 *     the shared value edge and wrap as a block.
 * The variant follows the row's SOURCE, never its length: a short observation
 * and a long one must render the same way, or the card's alignment would
 * change with the session's data.
 *
 * Stacked below `sm`: at 375px a shared label column would leave single words
 * per line, so the label sits above its value. The rule is drawn on the label
 * (the row's start) and only reaches the value cell at `sm`, or a line would
 * appear between a label and its own value. `tabular-nums` keeps figures in a
 * column from shifting width.
 */
function BandList({
  rows,
  variant = "scored",
}: {
  rows: { label: string; value: string }[];
  variant?: "scored" | "descriptive";
}) {
  return (
    <dl className="grid grid-cols-1 rounded-lg border border-line bg-white sm:grid-cols-[auto_1fr]">
      {rows.map((row, index) => (
        <Fragment key={row.label}>
          <dt
            className={clsx(
              // Explicit pt/pb rather than `py`, so the stacked and side-by-side
              // paddings cannot collide as competing shorthand.
              "px-4 pt-3 pb-1 text-sm text-muted sm:pb-3",
              // Stacked, the rule belongs above the LABEL (the row's start).
              // Side by side, both cells need it or the line stops halfway.
              index > 0 && "border-t border-line",
            )}
          >
            {row.label}
          </dt>
          <dd
            className={clsx(
              "px-4 pb-3 text-sm font-semibold text-ink tabular-nums sm:pt-3 sm:pl-0",
              variant === "scored" ? "sm:text-right" : "sm:text-left",
              index > 0 && "sm:border-t sm:border-line",
            )}
          >
            {row.value}
          </dd>
        </Fragment>
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
  checkInLead,
  extraTabs = [],
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
    () => (reportId ? eligibleCheckIns(metrics?.cameraMode, timelineVisual, checkInLead) : []),
    [reportId, metrics, timelineVisual, checkInLead],
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
        {/* No strip exists on this path, so a mode's tabs would silently
            vanish. They render in flow instead: a legacy report that somehow
            carries a mode snapshot still shows its analysis, and a tab is
            never the only way to reach content. */}
        {extraTabs.map((tab) => (
          <Fragment key={tab.key}>{tab.render()}</Fragment>
        ))}
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
  // Delivery sections follow the same "was it measured" gates as the
  // Statistics figures, so a typed session never shows Voice bands under a
  // Vocal card that says "Not measured".
  const vocal = measuredVocal(metrics);
  const visual = measuredVisual(metrics);
  const notHidden = (row: { label: string }) => !hiddenRows?.has(row.label);
  const cameraRows = visual ? visualBands(visual).filter(notHidden) : [];
  const bodyRows = visual ? visualBodyLanguageBands(visual).filter(notHidden) : [];
  const observationRows = displayVisual ? visualObservationRows(displayVisual).filter(notHidden) : [];
  const hasDeliveryTab = Boolean(visual || vocal) || observationRows.length > 0;
  const hasStatsTab = hasStatistics(metrics);
  const revisit = answers
    .filter((a) => a.level <= 2)
    .sort((a, b) => a.level - b.level || a.start - b.start);

  return (
    <div className="flex flex-col gap-7">
      {/* Above the scores so it is seen, but a card in the flow: it never
          blocks reading, and nothing it saves reaches a score. */}
      {reportId && checkInQuestions.length > 0 && (
        <CheckInBanner
          answers={checkInAnswers}
          lead={checkInLead}
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
            {/* Columns stretch to one height so the dividers align. Safe only
                because each column is capped below: uncapped, fifteen weak
                answers against two strengths ran a rule down hundreds of
                pixels of empty white. */}
            <div className="grid overflow-hidden rounded-xl border border-line bg-white md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              <TakeawayColumn
                items={structured.strengths.map((s, i) => (
                  <TakeawayItem key={i} dot="bg-level-4" detail={s.detail} title={s.title} />
                ))}
                title="Keep doing"
              />
              <TakeawayColumn
                items={structured.growth_areas.map((g, i) => (
                  <TakeawayItem
                    key={i}
                    dot="bg-level-2"
                    detail={`Consider trying this: ${g.suggestion}`}
                    title={g.title}
                  />
                ))}
                title="Work on next"
              />
              {answers.length > 0 && (
                <TakeawayColumn
                  empty="No answer stood out as uneven."
                  items={revisit.map((a) => (
                    <li key={a.index}>
                      <a
                        className="-mx-2 flex gap-2.5 rounded-md px-2 py-1 text-ink outline-none transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue"
                        href="#moments"
                        onClick={(event) => {
                          event.preventDefault();
                          showMoment(a.index);
                        }}
                      >
                        <span
                          aria-hidden
                          className={clsx(
                            "mt-2 size-2 shrink-0 rounded-full",
                            levelDotClass(ANSWER_RAMP[a.level]),
                          )}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold">Answer {a.index + 1}</span>
                            <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-muted">
                              {formatTimecode(a.start)}
                            </span>
                          </span>
                          <span className="text-sm text-muted">
                            {a.word} delivery
                            {offTargetSummary(a.notes)}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                  title="Answers to revisit"
                />
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
              {visual && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>On camera</SectionHeading>
                  <BandList rows={cameraRows} />
                  {structured.category_notes.visual && <Prose>{structured.category_notes.visual}</Prose>}
                </section>
              )}

              {vocal && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>Voice</SectionHeading>
                  {showInterviewPaceTarget && (
                    <p className="text-sm text-muted">
                      Assessed pace: {Math.round(vocal.words_per_minute)} WPM. {"Interview target: 100–159 WPM."}
                    </p>
                  )}
                  <BandList rows={vocalBands(vocal)} />
                  {structured.category_notes.vocal && <Prose>{structured.category_notes.vocal}</Prose>}
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
                  <BandList rows={observationRows} variant="descriptive" />
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

        {/* Mode-specific analysis, contributed through `ReportChrome.extraTabs`
            (a problem interview's "The problem"/"Process steps", MITI's
            behavior counts and checklist). LAST, after Content: the shared
            tabs are the same five on every report, so a mode's own tab
            arriving at a fixed end position keeps the strip predictable.

            Rendered as `<Tab>` children here rather than as a pre-built
            fragment, because HeroUI reads its children to build the tab list
            — a wrapper element would register as one unnamed tab. For the
            same reason this maps to a flat array and cannot be nested in a
            fragment. */}
        {extraTabs.map((tab) => (
          <Tab key={tab.key} title={tab.title}>
            <div className="flex flex-col gap-7">{tab.render()}</div>
          </Tab>
        ))}
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

const OFF_TARGET_WORDS = new Set([
  "Slow",
  "Fast",
  "Frequent",
  "Very frequent",
  "Variable",
  "Uneven",
]);

/**
 * The "why" on a revisit row: the band words that are off target, at most two.
 *
 * CAPPED DELIBERATELY: the level word already says how many bands missed
 * (three or more reads "Off"), and one bad habit held all session flags the
 * same bands on every answer — listing all four turned fifteen rows into
 * fifteen copies of one sentence, which is one row of information. Two carry
 * the reason; the Moments panel this row links to lists all four.
 */
function offTargetSummary(notes: { label: string; value: string }[]): string {
  const flagged = notes.filter((n) => OFF_TARGET_WORDS.has(n.value));
  return flagged.length
    ? `, ${flagged
        .slice(0, 2)
        .map((n) => `${n.label.toLowerCase()} ${n.value.toLowerCase()}`)
        .join(", ")}`
    : "";
}

/** Visible items per Takeaways column before "Show all" (the list budget). */
const TAKEAWAY_VISIBLE = 3;

/**
 * One Takeaways column: three items, then the rest behind "Show all N".
 *
 * WHY THE CAP IS STRUCTURAL, NOT COSMETIC: the three columns hold unrelated
 * counts — two strengths against fifteen weak answers is normal — and they
 * share one panel. Uncapped, "Answers to revisit" ran a thousand pixels past
 * the other two and left most of a viewport as ruled white space. The Moments
 * timeline below is the tool for reading every answer; this is the shortlist.
 */
function TakeawayColumn({
  title,
  items,
  empty,
}: {
  title: string;
  items: React.ReactNode[];
  empty?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const hidden = items.length - TAKEAWAY_VISIBLE;
  return (
    <section className="flex flex-col gap-3.5 px-6 py-[22px] shadow-[-1px_0_0_var(--la-line),0_-1px_0_var(--la-line)]">
      <h3 className="font-display text-[22px] font-medium text-cwru-blue">{title}</h3>
      {items.length === 0 ? (
        empty && <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {showAll ? items : items.slice(0, TAKEAWAY_VISIBLE)}
        </ul>
      )}
      {hidden > 0 && (
        <button
          className="w-fit rounded-sm text-sm font-semibold text-link outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue"
          type="button"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

/**
 * One takeaway. The detail is clamped to two lines: this tab is the scan, and
 * the evaluator writes multi-sentence details that stacked into paragraph
 * walls three columns wide. Overview carries the same items in full, in
 * expandable rows.
 */
function TakeawayItem({ title, detail, dot }: { title: string; detail: string; dot: string }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className={clsx("mt-2 size-2 shrink-0 rounded-full", dot)} />
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold text-ink">{title}</span>
        <span className="line-clamp-2 text-sm text-muted">{detail}</span>
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
