"use client";

/**
 * The report body: four tabs over the evaluator's structured output.
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
 * RAW FIGURES: unlike `ReportScoreCards`, the narrative below quotes concrete
 * numbers. That split is deliberate — see the note atop `ReportScoreCards.tsx`.
 */
import { Accordion, AccordionItem } from "@heroui/accordion";
import { Chip } from "@heroui/chip";
import { Tab, Tabs } from "@heroui/tabs";

import ReportMarkdown from "@/components/interview/ReportMarkdown";
import ReportScoreCards, {
  type ReportScoreCardsProps,
} from "@/components/interview/ReportScoreCards";
import {
  DeliveryByAnswerPanel,
  MomentsPanel,
} from "@/components/metrics/DeliveryTimeline";
import {
  visualBands,
  visualBodyLanguageBands,
  visualObservationRows,
  vocalBands,
} from "@/lib/metrics/bands";
import type { StructuredReport } from "@/lib/report/structured";

interface ReportBodyProps {
  structured: StructuredReport | null;
  markdown: string | null;
  scores: ReportScoreCardsProps["scores"];
  metrics: ReportScoreCardsProps["metrics"];
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-default-500">
      {children}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-medium leading-relaxed text-default-700">{children}</p>;
}

function BandList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 border-b border-default-100 pb-2 last:border-0 last:pb-0"
        >
          <dt className="text-small text-default-500">{row.label}</dt>
          <dd className="text-small text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ReportBody({
  structured,
  markdown,
  scores,
  metrics,
}: ReportBodyProps) {
  // Pre-structured rows: render exactly what they rendered before. No tabs,
  // no empty panels — the data to fill them does not exist.
  if (!structured) {
    return markdown ? <ReportMarkdown markdown={markdown} /> : null;
  }

  // Either episode source is enough for the Moments tab to earn its keep — a
  // session whose only finding was a visible phone (a descriptive-only
  // episode) must not silently lose its timeline.
  const hasMoments =
    (metrics?.visual?.episodes?.length ?? 0) > 0 ||
    (metrics?.visual?.observations?.episodes?.length ?? 0) > 0;
  const hasTurns = (metrics?.vocal?.turns?.length ?? 0) > 0;
  // Scenario reports have no rubric-notes section at all. An empty tab is
  // worse than an absent one, so the panel is dropped rather than shown blank.
  const hasContentTab =
    Boolean(structured.category_notes.content) ||
    Boolean(structured.category_notes.behavioral) ||
    structured.rubric_notes.length > 0;

  return (
    <Tabs
      aria-label="Report sections"
      variant="underlined"
      classNames={{ panel: "pt-6" }}
    >
      <Tab key="overview" title="Overview">
        <div className="flex flex-col gap-8">
          <ReportScoreCards scores={scores} metrics={metrics} />

          {/* Promoted from the very bottom of the old report. It is the single
              most actionable line and was the hardest thing to find. */}
          {structured.practice_next && (
            <section className="rounded-2xl border border-primary-200 bg-primary-50/50 p-5">
              <SectionHeading>One thing to practice next time</SectionHeading>
              <p className="mt-2 text-medium leading-relaxed text-default-800">
                {structured.practice_next}
              </p>
            </section>
          )}

          {structured.overall_summary && (
            <section className="flex flex-col gap-2">
              <SectionHeading>Overall</SectionHeading>
              <Prose>{structured.overall_summary}</Prose>
            </section>
          )}

          {structured.strengths.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeading>Strengths</SectionHeading>
              <Accordion variant="light" selectionMode="multiple" className="px-0">
                {structured.strengths.map((s, i) => (
                  <AccordionItem
                    key={`s-${i}`}
                    aria-label={s.title}
                    title={<span className="text-medium">{s.title}</span>}
                  >
                    <div className="flex flex-col gap-2 pb-2">
                      <Prose>{s.detail}</Prose>
                      {s.evidence && (
                        <blockquote className="border-l-2 border-default-200 pl-3 text-small italic text-default-500">
                          “{s.evidence}”
                        </blockquote>
                      )}
                    </div>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}

          {structured.growth_areas.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeading>Growth areas</SectionHeading>
              <Accordion variant="light" selectionMode="multiple" className="px-0">
                {structured.growth_areas.map((g, i) => (
                  <AccordionItem
                    key={`g-${i}`}
                    aria-label={g.title}
                    title={
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-medium">{g.title}</span>
                        {/* Timecodes surfaced on the collapsed row: they are
                            the link back to the Moments tab, and are useless
                            if you have to expand each item to find them. */}
                        {g.timecodes.map((t) => (
                          <Chip key={t} size="sm" variant="flat" className="font-mono">
                            {t}
                          </Chip>
                        ))}
                      </div>
                    }
                  >
                    <div className="flex flex-col gap-2 pb-2">
                      <Prose>{g.detail}</Prose>
                      <p className="text-small text-default-600">
                        <span className="font-semibold">Try this: </span>
                        {g.suggestion}
                      </p>
                    </div>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}
        </div>
      </Tab>

      <Tab key="delivery" title="Delivery">
        <div className="flex flex-col gap-8">
          {metrics?.visual && (
            <section className="flex flex-col gap-3">
              <SectionHeading>On camera</SectionHeading>
              <BandList rows={visualBands(metrics.visual)} />
              {structured.category_notes.visual && (
                <Prose>{structured.category_notes.visual}</Prose>
              )}
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

          {metrics?.vocal && (
            <section className="flex flex-col gap-3">
              <SectionHeading>Voice</SectionHeading>
              <BandList rows={vocalBands(metrics.vocal)} />
              {structured.category_notes.vocal && (
                <Prose>{structured.category_notes.vocal}</Prose>
              )}
            </section>
          )}

          {hasTurns && (
            <section className="flex flex-col gap-3">
              <SectionHeading>Answer by answer</SectionHeading>
              <DeliveryByAnswerPanel vocal={metrics?.vocal ?? null} />
            </section>
          )}

          {/* LAST section of Delivery, deliberately. These are things the
              camera recorded that do not affect any score — stated once here,
              at the section level, never as a per-row tag inside a scored
              list (a "not scored" chip beside a scored row is exactly the
              inverted defect this phase exists to avoid). Muted treatment
              only; no primary-colour panel — that idiom is reserved for
              "One thing to practice next time". */}
          {metrics?.visual && visualObservationRows(metrics.visual).length > 0 && (
            <section className="flex flex-col gap-3 rounded-2xl border border-default-100 p-5">
              <SectionHeading>Observations</SectionHeading>
              <p className="text-small text-default-500">
                Things the camera recorded during the session. These do not
                affect any score.
              </p>
              <BandList rows={visualObservationRows(metrics.visual)} />
            </section>
          )}
        </div>
      </Tab>

      {hasContentTab ? (
        <Tab key="content" title="Content">
          <div className="flex flex-col gap-8">
            {structured.category_notes.content && (
              <section className="flex flex-col gap-2">
                <SectionHeading>Content &amp; structure</SectionHeading>
                <Prose>{structured.category_notes.content}</Prose>
              </section>
            )}
            {structured.category_notes.behavioral && (
              <section className="flex flex-col gap-2">
                <SectionHeading>Behavioral &amp; mindset</SectionHeading>
                <Prose>{structured.category_notes.behavioral}</Prose>
              </section>
            )}
            {structured.rubric_notes.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionHeading>By rubric item</SectionHeading>
                <dl className="flex flex-col gap-2">
                  {structured.rubric_notes.map((n) => (
                    <div
                      key={n.item}
                      className="flex flex-col gap-0.5 border-b border-default-100 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                    >
                      <dt className="text-small font-medium">{n.item}</dt>
                      <dd className="text-small text-default-600 sm:max-w-[70%] sm:text-right">
                        {n.note}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </Tab>
      ) : null}

      {hasMoments ? (
        <Tab key="moments" title="Moments">
          <section className="flex flex-col gap-3">
            <SectionHeading>Moments to review</SectionHeading>
            <p className="text-small text-default-500">
              One timeline mixing camera/environment and body-language
              moments, tagged so you can tell which is which. Times match the
              session clock.
            </p>
            <MomentsPanel visual={metrics?.visual ?? null} />
          </section>
        </Tab>
      ) : null}
    </Tabs>
  );
}
