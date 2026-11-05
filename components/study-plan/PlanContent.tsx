"use client";

/**
 * Renders a study plan's generated content: prioritized practice themes
 * (exercises + readiness checks), strengths, resources, and the
 * next-practice focus.
 *
 * Extracted in quick-006 from `app/reports/page.tsx` (where it was a local,
 * unexported function) so both the draft-preview card on `/reports` and the
 * saved-plan's own route at `/study-plans/[planId]` can render the same
 * content without duplicating markup.
 *
 * Each priority is a tile: an icon, its title, why it matters, and the
 * exercise names up front; instructions, "ready when" criteria and
 * readiness checks open from the tile. They open as a full-width sibling of
 * the tile, not inside it: `grid-flow-row-dense` lets the following tiles
 * backfill the row, so tiles never move and the panel sits under its row.
 */
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, BookOpen, ChevronDown, CircleCheckBig, ExternalLink, Target } from "lucide-react";

import { themeIcon } from "@/components/study-plan/competency-icons";
import { readyWhenText } from "@/lib/study-plan/ready-when";
import type { StudyPlanContent, StudyPlanPriorityTheme } from "@/lib/study-plan/types";

/** Columns that leave no hole in the last row for this many tiles. */
function tileGridClass(count: number): string {
  if (count === 1) return "";
  if (count === 3) return "md:grid-cols-2 xl:grid-cols-3";
  if (count === 5) return "md:grid-cols-2 xl:grid-cols-6";
  return "md:grid-cols-2";
}

function tileSpanClass(count: number, index: number): string {
  if (count === 3 && index === 2) return "md:col-span-2 xl:col-span-1";
  if (count === 5) {
    if (index < 3) return "xl:col-span-2";
    return index === 4 ? "md:col-span-2 xl:col-span-3" : "xl:col-span-3";
  }
  return "";
}

/** Three lines up front; "Read more" appears only when text is really cut off. */
function ClampedText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="flex flex-col items-start gap-1">
      <p ref={ref} className={`max-w-[65ch] leading-6 text-muted ${expanded ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {overflows || expanded ? (
        <button
          className="min-h-6 text-[13.5px] font-semibold text-link hover:underline"
          type="button"
          // A press does not take focus, so the ring stays keyboard-only in every browser.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

function PriorityTile({
  theme,
  count,
  index,
  open,
  panelId,
  onToggle,
}: {
  theme: StudyPlanPriorityTheme;
  count: number;
  index: number;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const Icon = themeIcon(theme.theme);
  const solo = count === 1;
  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl border bg-white p-5 ${open ? "border-true-blue" : "border-line"} ${
        solo ? "md:grid md:grid-cols-2 md:gap-x-8" : ""
      } ${tileSpanClass(count, index)}`}
    >
      <div className="flex flex-col gap-3">
        <div className={`flex items-start ${solo ? "gap-3" : "justify-between"}`}>
          <span className="grid size-[52px] place-items-center rounded-[14px] bg-light-blue/32 text-cwru-blue">
            <Icon aria-hidden size={26} strokeWidth={1.75} />
          </span>
          <span aria-label={`Priority ${theme.priority}`} className="font-display text-[28px] font-medium text-true-blue">
            {String(theme.priority).padStart(2, "0")}
          </span>
        </div>
        <h3 className="text-base font-bold leading-snug text-ink">{theme.theme}</h3>
        <ClampedText text={theme.whyItMatters} />
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <ul className="flex flex-col gap-1.5">
          {theme.practiceExercises.map((exercise) => (
            <li key={exercise.title} className="flex items-start gap-2">
              <CircleCheckBig aria-hidden className="mt-0.5 shrink-0 text-link" size={15} strokeWidth={2} />
              <span>
                {exercise.title} <span className="text-muted">· {exercise.estimatedMinutes} min</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t border-line pt-2">
          <button
            aria-controls={open ? panelId : undefined}
            aria-expanded={open}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-[13.5px] font-semibold text-link"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggle}
          >
            How to practice and readiness checks
            <ChevronDown
              aria-hidden
              className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              size={14}
            />
          </button>
        </div>
      </div>
    </article>
  );
}

function PriorityPanel({ theme, id }: { theme: StudyPlanPriorityTheme; id: string }) {
  const headingId = `${id}-heading`;
  const hasChecks = theme.readinessChecks.length > 0;
  // One exercise leaves room for the checks beside it; more sit in a row with
  // the checks beneath, so no column gets squeezed.
  const sideBySide = theme.practiceExercises.length <= 1;
  return (
    <section
      aria-labelledby={headingId}
      className="col-span-full flex flex-col gap-4 rounded-2xl border border-true-blue bg-white p-5"
      id={id}
    >
      <h4 className="text-base font-bold leading-snug text-ink" id={headingId}>
        <span className="font-display text-lg font-medium text-true-blue">{String(theme.priority).padStart(2, "0")}</span>{" "}
        {theme.theme}
      </h4>
      <div className={`grid gap-x-8 gap-y-6 ${sideBySide && hasChecks ? "lg:grid-cols-2" : ""}`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-x-8 gap-y-6">
          {theme.practiceExercises.map((exercise) => {
            const readyWhen = readyWhenText(exercise.successCriteria);
            return (
              <div key={exercise.title} className="flex flex-col gap-2">
                <p className="font-semibold leading-snug">
                  {exercise.title} <span className="font-normal text-muted">· {exercise.estimatedMinutes} min</span>
                </p>
                <p className="max-w-[65ch] leading-6">{exercise.instructions}</p>
                {readyWhen ? (
                  <div className="flex max-w-[65ch] flex-col gap-0.5">
                    <p className="text-[13px] font-semibold text-ink">Ready when</p>
                    <p className="text-[13px] leading-5 text-muted">{readyWhen}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {hasChecks ? (
          <div className={`flex flex-col gap-2 ${sideBySide ? "" : "border-t border-line pt-4"}`}>
            <p className="text-[13px] font-semibold text-ink">Readiness checks</p>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-x-8 gap-y-2">
              {theme.readinessChecks.map((check) => (
                <li key={check} className="flex max-w-[65ch] items-start gap-2 leading-6">
                  <CircleCheckBig aria-hidden className="mt-1 shrink-0 text-link" size={15} strokeWidth={2} />
                  <span>{check}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function PlanContent({ content }: { content: StudyPlanContent }) {
  const baseId = useId();
  const [openPriorities, setOpenPriorities] = useState<Set<number>>(() => new Set());
  const count = content.priorityThemes.length;
  const hasStrengths = content.strengthsToLeverage.length > 0;
  const hasResources = content.resources.length > 0;

  function toggle(priority: number) {
    setOpenPriorities((current) => {
      const next = new Set(current);
      if (!next.delete(priority)) next.add(priority);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8 text-sm text-ink">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[22px] font-medium text-cwru-blue">
          Practice priorities{" "}
          <span className="font-sans text-sm font-normal text-muted">{count}</span>
        </h2>
        <div className={`grid grid-flow-row-dense gap-4 ${tileGridClass(count)}`}>
          {content.priorityThemes.map((theme, index) => {
            const open = openPriorities.has(theme.priority);
            const panelId = `${baseId}-priority-${theme.priority}`;
            return (
              <Fragment key={theme.priority}>
                <PriorityTile
                  count={count}
                  index={index}
                  open={open}
                  panelId={panelId}
                  theme={theme}
                  onToggle={() => toggle(theme.priority)}
                />
                {open ? <PriorityPanel id={panelId} theme={theme} /> : null}
              </Fragment>
            );
          })}
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-2xl bg-light-blue/32 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-cwru-blue">
          <Target aria-hidden size={20} strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-cwru-blue">Next practice focus</p>
          <p className="max-w-[65ch] font-display text-lg italic leading-[1.4] text-ink">{content.nextPracticeFocus}</p>
        </div>
      </section>

      {/* One surface per column, stretched to the taller one, so both columns
          end level however many strengths and resources a plan has. */}
      {hasStrengths || hasResources ? (
        <div className={`grid gap-x-4 gap-y-8 ${hasStrengths && hasResources ? "lg:grid-cols-2" : ""}`}>
          {hasStrengths ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-[22px] font-medium text-cwru-blue">Strengths to leverage</h2>
              <ul className="flex flex-1 flex-col divide-y divide-line rounded-2xl border border-line bg-white px-5">
                {content.strengthsToLeverage.map((strength) => (
                  <li key={strength.theme} className="flex gap-3 py-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-level-4/16 text-level-4">
                      <BadgeCheck aria-hidden size={20} strokeWidth={2} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="font-bold">{strength.theme}</p>
                      <p className="max-w-[65ch] leading-6 text-muted">{strength.explanation}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasResources ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-[22px] font-medium text-cwru-blue">Useful resources</h2>
              <ul className="flex flex-1 flex-col divide-y divide-line rounded-2xl border border-line bg-white px-5">
                {content.resources.map((resource) => (
                  <li key={resource.title} className="flex gap-3 py-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-light-blue/32 text-cwru-blue">
                      <BookOpen aria-hidden size={20} strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {resource.url ? (
                        <a
                          className="inline-flex items-center gap-1 font-bold text-link hover:underline"
                          href={resource.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {resource.title}
                          <ExternalLink aria-hidden className="shrink-0" size={13} />
                        </a>
                      ) : (
                        <p className="font-bold">{resource.title}</p>
                      )}
                      <p className="max-w-[65ch] leading-6 text-muted">{resource.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
