"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/modal";
import { ArrowRight, ChevronDown, PanelRight, Sparkle, TrendingDown, TrendingUp, X } from "lucide-react";

import type {
  CompetencyMasteryDTO,
  MasteryDTO,
  MasteryFigureDTO,
  OriginFigureDTO,
  RecentGrowthDTO,
  WindowDriverDTO,
} from "@/lib/mastery/mastery-dto";
import Sparkline from "@/components/mastery/Sparkline";
import { levelDotClass } from "@/components/report/LevelChip";
import {
  GoalsStrip,
  LevelProgressBar,
  ProgressRing,
  SkillShield,
} from "@/components/study-plan/PathVisuals";
import type { LevelResult } from "@/lib/mastery/levels";
import type { GoalProgress } from "@/lib/study-plan/goals";

/**
 * Renders mastery and performs NO computation of its own — no threshold
 * comparison, no percentage arithmetic, no tier derivation. Every number,
 * tier, label, disclosure, level and goal figure arrives already computed
 * from `/api/mastery`'s `toMasteryDTO()` call (21-13's single-exit rule). A
 * component that re-derived a tier or a level here would be a second source
 * of truth, and a second source of truth is exactly what 21-13's single
 * exit exists to prevent — this file only arranges and labels values it is
 * handed.
 *
 * 21-CONTEXT.md names the risk this component's layout exists to defuse:
 * "Two figures for the same competency — labelling must make the
 * distinction obvious or it will confuse." The fix lives in WORDS, not
 * layout: every figure is paired with a literal text label ("All time" /
 * "Recent") inside a `<dt>`, so the pairing survives a screenshot, a
 * colourblind reader, or a narrow viewport where position and color both
 * fail as cues.
 *
 * The figure and how sure it is are read separately: `display` ("about 65%")
 * is the estimate, the pips and tier label beside it are the confidence, and
 * the range and the plain average of what was scored sit behind "Trend and
 * evidence". One session never reads as a settled number.
 *
 * Layout: a CWRU Blue summary band (recent form ring, all time, goal rings),
 * the recent-movement strip, then one badge card per competency with its
 * level shield, progress to the next level and both figures up front, and
 * the trend, evidence and disclosures one click away.
 *
 * Where that click opens is `ExpandMode` (`?expand=` on /mastery, for
 * comparing): "tidy" opens it inside the card, "row" opens a full-width panel
 * under the card's row, "drawer" opens a side sheet (a bottom sheet on phones).
 * In every mode the grid aligns cards to the top, so opening one never
 * stretches its neighbours, and the toggle sits on the same divider open or
 * closed.
 */

export type ExpandMode = "tidy" | "row" | "drawer";
export const DEFAULT_EXPAND_MODE: ExpandMode = "tidy";

export function parseExpandMode(value: string | null | undefined): ExpandMode {
  return value === "tidy" || value === "row" || value === "drawer" ? value : DEFAULT_EXPAND_MODE;
}

/**
 * One look for every "show more" toggle on this page: link-blue label, the
 * focus ring only for keyboard focus, hugging the text rather than the card.
 */
const TOGGLE_CLASS =
  "-mx-1 inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold text-link outline-none transition-colors duration-150 hover:text-cwru-blue focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-true-blue [&::-webkit-details-marker]:hidden";

export interface MasteryPanelProps {
  mastery: MasteryDTO;
  levels: Record<string, { current: LevelResult; lifetime: LevelResult }>;
  goals: GoalProgress;
  timeZone: string;
  /** One line under the title saying what the figures are built from. */
  intro?: string;
  /** Where "Trend and evidence" and "Moved by" open. */
  expand?: ExpandMode;
}

function formatPercent(percent: number | null): string {
  // A null percent is "not yet measured", never "0%" — a null-to-string
  // coercion bug (e.g. `${percent}%` on a null) would print "null%", and an
  // arithmetic bug upstream would print "NaN%"; neither is acceptable. Only
  // for plain averages of what was scored; an estimate prints its `display`.
  return percent === null ? "Not yet measured" : `${Math.round(percent)}%`;
}

function activityCount(count: number): string {
  return `${count} ${count === 1 ? "activity" : "activities"}`;
}

/** How sure a figure is, as filled pips with its word: never color alone. */
function Confidence({ figure, tone = "light" }: { figure: MasteryFigureDTO; tone?: "light" | "dark" }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5", tone === "dark" ? "text-light-blue" : "text-muted")}>
      <span aria-hidden className="inline-flex gap-0.5">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={clsx(
              "size-1.5 rounded-full",
              step <= figure.confidence
                ? tone === "dark"
                  ? "bg-white"
                  : "bg-true-blue"
                : tone === "dark"
                  ? "bg-white/30"
                  : "bg-light-blue/50",
            )}
          />
        ))}
      </span>
      {figure.tierLabel}
    </span>
  );
}

/** The estimate as a stat figure: "about" stays small so the number leads. */
function FigureValue({ figure }: { figure: MasteryFigureDTO }) {
  if (figure.rounded === null) {
    return <span className="text-[15px] font-normal text-muted">{figure.display}</span>;
  }
  return (
    <>
      {figure.approximate ? <span className="mr-1 text-sm text-muted">about</span> : null}
      {figure.rounded}%
    </>
  );
}

/** What the estimate is built from, for one figure: the range and the real average. */
function FigureDetail({ name, figure }: { name: string; figure: MasteryFigureDTO }) {
  if (figure.rounded === null || figure.range === null) return null;
  return (
    <p className="text-xs leading-5 text-ink">
      <span className="font-semibold">{name}:</span>{" "}
      {`likely ${figure.range.low}–${figure.range.high}%. You averaged ${formatPercent(
        figure.observedPercent
      )} across ${activityCount(figure.evidenceCount)}.`}
    </p>
  );
}

/**
 * Picks which disclosure string(s) to render next to a competency's two
 * figures. Both are shown, each inline with the figure it describes, when
 * they are both present and differ (an ESTABLISHED lifetime figure sitting
 * next to a THIN current one is exactly the case 21-13's mastery-dto.ts
 * comment calls out — collapsing the two would mask the current figure's
 * thinness behind the lifetime figure's strength). When they match (or only
 * one exists), it is shown once.
 */
function CompetencyDisclosures({ competency }: { competency: CompetencyMasteryDTO }) {
  const lifetimeDisclosure = competency.lifetime.disclosure;
  const currentDisclosure = competency.current.disclosure;

  if (lifetimeDisclosure && currentDisclosure && lifetimeDisclosure !== currentDisclosure) {
    return (
      <div className="flex flex-col gap-1 text-xs leading-5 text-muted">
        <p>
          <span className="font-semibold text-ink">All time —</span> {lifetimeDisclosure}
        </p>
        <p>
          <span className="font-semibold text-ink">Recent —</span> {currentDisclosure}
        </p>
      </div>
    );
  }

  const single = lifetimeDisclosure ?? currentDisclosure;
  if (!single) return null;

  return <p className="text-xs leading-5 text-muted">{single}</p>;
}

/**
 * The level line under a competency's name. Levels are computed by the route
 * (`levelFor`) from the RECENT figure; when there is no recent evidence, the
 * all-time level is shown instead and labeled as such, so a student whose
 * practice is older than the window still sees where they stand.
 */
function LevelBadge({ level }: { level: { current: LevelResult; lifetime: LevelResult } }) {
  const useCurrent = level.current.level !== null;
  const shown = useCurrent ? level.current : level.lifetime;
  if (shown.level === null) {
    return <span className="text-[13px] font-semibold text-muted">Not yet measured</span>;
  }
  return (
    <span
      className="flex flex-col text-[13px] leading-snug"
      aria-label={`${useCurrent ? "Recent" : "All-time"} level ${shown.level}, ${shown.name}${
        shown.provisional ? ", early read" : ""
      }`}
    >
      {/* The level never breaks mid-phrase; any qualifier gets its own line. */}
      <span className="whitespace-nowrap font-semibold text-cwru-blue">{`Level ${shown.level} · ${shown.name}`}</span>
      {useCurrent && !shown.provisional ? null : (
        <span className="text-xs text-muted">
          {[useCurrent ? null : "All-time level", shown.provisional ? (useCurrent ? "Early read" : "early read") : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </span>
  );
}

function shownLevel(level: { current: LevelResult; lifetime: LevelResult } | undefined): LevelResult | undefined {
  if (!level) return undefined;
  return level.current.level !== null ? level.current : level.lifetime;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function formatDay(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
      new Date(iso)
    );
  } catch {
    return iso.slice(0, 10);
  }
}

/** An up or down move as a tinted pill with its arrow, so direction never rests on color alone. */
function DeltaText({ delta }: { delta: number }) {
  const Icon = delta >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-bold",
        delta >= 0 ? "bg-level-4/16 text-level-4" : "bg-copper/12 text-copper-deep",
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {`${formatDelta(delta)} ${Math.abs(delta) === 1 ? "pt" : "pts"}`}
    </span>
  );
}

/**
 * Where a competency's evidence came from, split into live practice and
 * path learning (checks, coached sessions). Counts are activities, and each
 * "avg" is what was actually scored, not the estimate — one session can
 * evidence several competencies.
 */
function EvidenceSources({ sources }: { sources: OriginFigureDTO[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted">Evidence from</p>
      <ul className="flex flex-col gap-1">
        {sources.map((source) => (
          <li
            key={source.origin}
            className={clsx(
              "flex items-baseline justify-between gap-3 rounded-md px-2.5 py-1.5 text-xs",
              source.lifetime.evidenceCount === 0
                ? "border border-dashed border-line text-muted"
                : source.group === "live"
                  ? "bg-light-blue/32 text-ink"
                  : "bg-ai/10 text-ink",
            )}
          >
            <span className="font-semibold">{source.label}</span>
            <span className="text-right">
              {source.lifetime.evidenceCount === 0
                ? "none yet"
                : `${source.lifetime.evidenceCount} all time · ${source.current.evidenceCount} recent · avg ${formatPercent(
                    source.lifetime.percent
                  )}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDayTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

/**
 * The activities behind a move, one two-line row each: the session's own
 * title as the link with the score on the right, then when it was and what
 * kind of activity it was. Rows that would still read the same (same title, same
 * day) add the time of day, so three "Sales meeting" rows are three sessions.
 */
function DriverList({
  drivers,
  timeZone,
  columns = 1,
}: {
  drivers: WindowDriverDTO[];
  timeZone: string;
  columns?: 1 | 2;
}) {
  if (drivers.length === 0) return null;
  const sameDayKey = (driver: WindowDriverDTO) =>
    `${driver.detail ?? driver.activityLabel}|${formatDay(driver.occurredAt, timeZone)}`;
  const repeats = new Map<string, number>();
  for (const driver of drivers) repeats.set(sameDayKey(driver), (repeats.get(sameDayKey(driver)) ?? 0) + 1);

  return (
    <ul
      className={clsx(
        "grid divide-y divide-line",
        columns === 2 && "md:grid-cols-2 md:gap-x-8 md:gap-y-1 md:divide-y-0",
      )}
    >
      {drivers.map((driver) => {
        const title = driver.detail ?? driver.activityLabel;
        const when =
          (repeats.get(sameDayKey(driver)) ?? 0) > 1
            ? formatDayTime(driver.occurredAt, timeZone)
            : formatDay(driver.occurredAt, timeZone);
        // A live session with its own title already says what it was
        // ("Sales meeting session"), so the "Live practice" group would only
        // repeat it; checks and coached work keep their group.
        const kind = driver.detail ? driver.activityLabel : driver.originLabel;
        const meta = [when, kind === title ? null : kind].filter(Boolean).join(" · ");
        return (
          <li
            key={`${driver.activityLabel}-${driver.occurredAt}-${driver.href ?? ""}`}
            data-testid="driver-row"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2"
          >
            {driver.href ? (
              <Link
                href={driver.href}
                className="-mx-0.5 w-fit rounded-sm px-0.5 text-[13px] font-semibold leading-snug text-link underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue"
              >
                {title}
              </Link>
            ) : (
              <span className="text-[13px] font-semibold leading-snug text-ink">{title}</span>
            )}
            <span className="text-[13px] font-semibold tabular-nums leading-snug text-ink">
              <span className="sr-only">scored </span>
              {formatPercent(driver.percent)}
            </span>
            <span className="col-span-2 text-xs leading-snug text-muted">{meta}</span>
          </li>
        );
      })}
    </ul>
  );
}

type Opened = { kind: "movement" | "competency"; key: string } | null;

function detailId(kind: "movement" | "competency", key: string): string {
  return `mastery-detail-${kind}-${key}`;
}

/**
 * The divider and the toggle under a card's always-visible content. Same
 * divider, same spacing, same place whether the detail is open or shut; only
 * what the toggle opens differs by mode.
 */
function ExpandToggle({
  mode,
  label,
  open,
  controls,
  onToggle,
  children,
}: {
  mode: ExpandMode;
  label: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
  /** The detail itself; only rendered here in "tidy" mode. */
  children: ReactNode;
}) {
  if (mode === "tidy") {
    return (
      <details className="group border-t border-line pt-3">
        <summary className={TOGGLE_CLASS} data-testid="expand-toggle">
          {label}
          <ChevronDown aria-hidden className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" size={16} />
        </summary>
        <div className="mt-3" data-testid="expand-detail">
          {children}
        </div>
      </details>
    );
  }
  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        className={TOGGLE_CLASS}
        data-testid="expand-toggle"
        aria-expanded={open}
        aria-controls={mode === "row" ? controls : undefined}
        aria-haspopup={mode === "drawer" ? "dialog" : undefined}
        onClick={onToggle}
      >
        {label}
        {mode === "drawer" ? (
          <PanelRight aria-hidden size={16} />
        ) : (
          <ChevronDown aria-hidden className={clsx("transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} size={16} />
        )}
      </button>
    </div>
  );
}

/** "Expand to full row": the open card's detail as a full-width row under it. */
function RowPanel({
  id,
  title,
  subtitle,
  onClose,
  children,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <li id={id} className="col-span-full rounded-2xl border border-true-blue bg-white p-5" data-testid="expand-detail">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base font-bold leading-snug text-ink">{title}</p>
          {subtitle}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-true-blue"
          aria-label={`Close ${title} details`}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {children}
    </li>
  );
}

function movedByLabel(count: number): string {
  return `Moved by ${count} ${count === 1 ? "activity" : "activities"}`;
}

function MovementBadge({ entry }: { entry: RecentGrowthDTO }) {
  return entry.kind === "new" || entry.delta === null ? (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-light-blue/32 px-2 py-0.5 text-[12.5px] font-bold text-cwru-blue">
      <Sparkle size={13} aria-hidden="true" />
      First measured
    </span>
  ) : (
    <DeltaText delta={entry.delta} />
  );
}

function RecentMovement({
  entries,
  levels,
  windowDays,
  windowStartsAt,
  timeZone,
  expand,
  opened,
  onOpen,
}: {
  entries: RecentGrowthDTO[];
  levels: MasteryPanelProps["levels"];
  windowDays: number;
  windowStartsAt: string;
  timeZone: string;
  expand: ExpandMode;
  opened: Opened;
  onOpen: (next: Opened) => void;
}) {
  return (
    <section aria-label="Recent movement" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px] font-medium text-cwru-blue">Recent movement</h2>
        <p className="text-[13px] text-muted">
          {`Biggest moves in the last ${windowDays} days, since ${formatDay(windowStartsAt, timeZone)}`}
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="la-hatch rounded-xl border border-line p-4 text-sm text-muted">
          Nothing has moved in this period yet. A live practice session, a knowledge check or a
          coached session will show up here.
        </p>
      ) : (
        <ul className={clsx("grid items-start gap-3 md:grid-cols-3", expand === "row" && "grid-flow-row-dense")}>
          {entries.map((entry) => {
            const isOpen = opened?.kind === "movement" && opened.key === entry.competencyKey;
            const id = detailId("movement", entry.competencyKey);
            return (
              <Fragment key={entry.competencyKey}>
                <li
                  data-testid="movement-card"
                  className={clsx(
                    "flex flex-col gap-3 rounded-2xl border bg-white p-4",
                    isOpen && expand !== "tidy" ? "border-true-blue" : "border-line",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <SkillShield competencyKey={entry.competencyKey} level={shownLevel(levels[entry.competencyKey])} size={40} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-[15px] font-bold leading-snug text-ink">{entry.label}</p>
                      <MovementBadge entry={entry} />
                    </div>
                  </div>
                  {entry.kind !== "new" && entry.delta !== null && (
                    <p className="text-xs text-muted">
                      {`All time ${entry.windowStartDisplay ?? "—"} → ${entry.lifetimeDisplay}`}
                    </p>
                  )}
                  {entry.delta !== null && entry.delta < 0 ? (
                    <Link
                      href={`/paths?competency=${encodeURIComponent(entry.competencyKey)}`}
                      className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg bg-cwru-blue px-3 text-[13px] font-semibold text-white hover:bg-ink"
                      aria-label={`Practice ${entry.label}`}
                    >
                      Practice this <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  ) : null}
                  {entry.drivers.length > 0 && (
                    <ExpandToggle
                      mode={expand}
                      label={movedByLabel(entry.drivers.length)}
                      open={isOpen}
                      controls={id}
                      onToggle={() => onOpen(isOpen ? null : { kind: "movement", key: entry.competencyKey })}
                    >
                      <DriverList drivers={entry.drivers} timeZone={timeZone} />
                    </ExpandToggle>
                  )}
                </li>
                {expand === "row" && isOpen ? (
                  <RowPanel
                    id={id}
                    title={`${entry.label}: ${movedByLabel(entry.drivers.length).toLowerCase()}`}
                    subtitle={
                      entry.kind !== "new" && entry.delta !== null ? (
                        <p className="text-xs text-muted">{`All time ${entry.windowStartDisplay ?? "—"} → ${entry.lifetimeDisplay}`}</p>
                      ) : null
                    }
                    onClose={() => onOpen(null)}
                  >
                    <DriverList drivers={entry.drivers} timeZone={timeZone} columns={2} />
                  </RowPanel>
                ) : null}
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TrendRow({
  competency,
  windowDays,
}: {
  competency: CompetencyMasteryDTO;
  windowDays: number;
}) {
  const hasAnyPoint = competency.trend.some((point) => point.percent !== null);
  if (!hasAnyPoint) return null;
  const { delta } = competency.windowChange;
  const weeks = competency.trend.length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Sparkline
        points={competency.trend}
        label={`All-time ${competency.label} figure over the last ${weeks} weeks`}
      />
      <div className="flex flex-col gap-1 text-xs leading-5 text-muted">
        <p>{`All-time trend, last ${weeks} weeks`}</p>
        <p>
          {delta === null ? (
            competency.windowChange.startPercent === null && competency.current.evidenceCount > 0 ? (
              "First measured in the last " + windowDays + " days"
            ) : (
              `No new evidence in the last ${windowDays} days`
            )
          ) : (
            <>
              <DeltaText delta={delta} />
              {` in the last ${windowDays} days`}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** The 1-5 ladder, so a level number always has its word nearby. */
function LevelLadder({ levels }: { levels: MasteryPanelProps["levels"] }) {
  const names = new Map<number, string>();
  for (const entry of Object.values(levels)) {
    for (const result of [entry.current, entry.lifetime]) {
      if (result.level !== null) names.set(result.level, result.name);
    }
  }
  const steps = ([1, 2, 3, 4, 5] as const).filter((n) => names.has(n));
  if (steps.length < 2) return null;
  return (
    <ol aria-label="Levels" className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((n, i) => (
        <li key={n} className="flex items-center gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className={clsx(
                "grid size-[22px] place-items-center rounded-full text-[11px] font-bold",
                levelDotClass(n),
                n === 2 || n === 3 ? "text-ink" : "text-white",
              )}
            >
              {n}
            </span>
            {names.get(n)}
          </span>
          {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-3 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

/**
 * What sits behind "Trend and evidence". Stacked inside a card or a drawer;
 * side by side (trend left, figures and evidence right) in a full-width row.
 */
function CompetencyDetail({
  competency,
  windowDays,
  wide = false,
}: {
  competency: CompetencyMasteryDTO;
  windowDays: number;
  wide?: boolean;
}) {
  const trend = (
    <>
      <p className="max-w-[65ch] text-[13px] leading-5 text-muted">{competency.description}</p>
      <TrendRow competency={competency} windowDays={windowDays} />
    </>
  );
  const evidence = (
    <>
      <div className="flex flex-col gap-0.5">
        <FigureDetail name="All time" figure={competency.lifetime} />
        {competency.current.evidenceCount !== competency.lifetime.evidenceCount ? (
          <FigureDetail name="Recent" figure={competency.current} />
        ) : null}
      </div>
      <EvidenceSources sources={competency.sources} />
      <CompetencyDisclosures competency={competency} />
    </>
  );
  if (!wide) {
    return (
      <div className="flex flex-col gap-3">
        {trend}
        {evidence}
      </div>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-3">{trend}</div>
      <div className="flex flex-col gap-3 md:border-l md:border-line md:pl-6">{evidence}</div>
    </div>
  );
}

function CompetencyCard({
  competency,
  level,
  windowDays,
  expand,
  open,
  onToggle,
}: {
  competency: CompetencyMasteryDTO;
  level: { current: LevelResult; lifetime: LevelResult } | undefined;
  windowDays: number;
  expand: ExpandMode;
  open: boolean;
  onToggle: () => void;
}) {
  const shown = shownLevel(level);
  const { delta } = competency.windowChange;
  return (
    <li
      data-testid="competency-card"
      className={clsx(
        "relative flex flex-col gap-4 rounded-2xl border bg-white p-5",
        open && expand !== "tidy" ? "border-true-blue" : "border-line",
      )}
    >
      <div className="absolute right-4 top-4">
        {delta !== null ? (
          <DeltaText delta={delta} />
        ) : competency.windowChange.startPercent === null && competency.current.evidenceCount > 0 ? (
          <span className="rounded-full bg-light-blue/32 px-2 py-0.5 text-xs font-bold text-cwru-blue">New</span>
        ) : null}
      </div>

      <div className="flex items-center gap-3.5 pr-20">
        <SkillShield competencyKey={competency.competencyKey} level={shown} size={56} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base font-bold leading-snug text-ink">{competency.label}</p>
          {level ? <LevelBadge level={level} /> : <span className="text-[13px] text-muted">Not yet measured</span>}
        </div>
      </div>

      {shown && shown.level !== null ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Progress to the next level</span>
          <LevelProgressBar level={shown} />
        </div>
      ) : (
        <p className="text-sm text-muted">{competency.description}</p>
      )}

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div>
          <dt className="text-xs font-semibold text-muted">All time</dt>
          <dd className="font-display text-2xl font-medium text-cwru-blue tabular-nums">
            <FigureValue figure={competency.lifetime} />
          </dd>
          <dd className="text-[13px] leading-snug">
            <Confidence figure={competency.lifetime} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-link">{`Recent (last ${windowDays} days)`}</dt>
          <dd className="font-display text-2xl font-medium text-cwru-blue tabular-nums">
            <FigureValue figure={competency.current} />
          </dd>
          <dd className="text-[13px] leading-snug">
            <Confidence figure={competency.current} />
          </dd>
        </div>
      </dl>

      <ExpandToggle
        mode={expand}
        label="Trend and evidence"
        open={open}
        controls={detailId("competency", competency.competencyKey)}
        onToggle={onToggle}
      >
        <CompetencyDetail competency={competency} windowDays={windowDays} />
      </ExpandToggle>
    </li>
  );
}

/**
 * "Details drawer": a side sheet from the right (a bottom sheet under md),
 * built on HeroUI's Modal for its focus trap, Esc and return focus.
 */
function DetailDrawer({
  opened,
  mastery,
  levels,
  timeZone,
  onClose,
}: {
  opened: Opened;
  mastery: MasteryDTO;
  levels: MasteryPanelProps["levels"];
  timeZone: string;
  onClose: () => void;
}) {
  const competency =
    opened?.kind === "competency" ? mastery.competencies.find((c) => c.competencyKey === opened.key) : undefined;
  const entry =
    opened?.kind === "movement" ? mastery.recentGrowth.find((g) => g.competencyKey === opened.key) : undefined;
  const key = competency?.competencyKey ?? entry?.competencyKey;
  const level = key ? levels[key] : undefined;

  return (
    <Modal
      isOpen={Boolean(competency || entry)}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      placement="bottom"
      scrollBehavior="inside"
      motionProps={{
        variants: {
          enter: { opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
          exit: { opacity: 0, transition: { duration: 0.15, ease: "easeIn" } },
        },
      }}
      classNames={{
        wrapper: "items-end md:items-stretch md:justify-end",
        base: "m-0 mx-0 my-0 sm:mx-0 sm:my-0 max-h-[88dvh] w-full max-w-full rounded-t-xl rounded-b-none border border-line bg-white shadow-[0_12px_32px_rgb(9_20_58/0.16)] md:h-dvh md:max-h-dvh md:w-[440px] md:max-w-[440px] md:rounded-none md:border-y-0 md:border-r-0",
        backdrop: "bg-ink/30",
        header: "flex items-center gap-3 border-b border-line px-5 py-4 pr-12",
        body: "gap-4 px-5 py-4",
        closeButton: "right-3 top-3 text-muted",
      }}
    >
      <ModalContent>
        {key ? (
          <>
            <ModalHeader>
              <SkillShield competencyKey={key} level={shownLevel(level)} size={44} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-bold leading-snug text-ink">
                  {competency ? competency.label : entry?.label}
                </span>
                {competency ? (
                  level ? <LevelBadge level={level} /> : null
                ) : entry ? (
                  <MovementBadge entry={entry} />
                ) : null}
              </div>
            </ModalHeader>
            <ModalBody data-testid="expand-detail">
              {competency ? (
                <>
                  <p className="text-[13px] font-semibold text-muted">Trend and evidence</p>
                  <CompetencyDetail competency={competency} windowDays={mastery.window.days} />
                </>
              ) : entry ? (
                <>
                  {entry.kind !== "new" && entry.delta !== null ? (
                    <p className="text-[13px] text-muted">{`All time ${entry.windowStartDisplay ?? "—"} → ${entry.lifetimeDisplay}`}</p>
                  ) : null}
                  <p className="text-[13px] font-semibold text-muted">{movedByLabel(entry.drivers.length)}</p>
                  <DriverList drivers={entry.drivers} timeZone={timeZone} />
                </>
              ) : null}
            </ModalBody>
          </>
        ) : null}
      </ModalContent>
    </Modal>
  );
}

export default function MasteryPanel({
  mastery,
  levels,
  goals,
  timeZone,
  intro,
  expand = DEFAULT_EXPAND_MODE,
}: MasteryPanelProps) {
  const { overall, window: masteryWindow, unmappedRowCount } = mastery;
  // Row and drawer modes open one detail at a time; tidy mode uses <details>.
  const [opened, setOpened] = useState<Opened>(null);
  const bothOverallNull = overall.currentPercent === null && overall.lifetimePercent === null;

  const overallAriaLabel = bothOverallNull
    ? "No mastery measured yet. Complete a session or a knowledge check to begin."
    : `Recent form over the last ${masteryWindow.days} days: ${overall.current.display}, ${overall.current.tierLabel}. All time: ${overall.lifetime.display}, ${overall.lifetime.tierLabel}.`;

  return (
    <div className="flex flex-col gap-7">
      <section
        aria-label={overallAriaLabel}
        className="relative flex flex-wrap items-center gap-x-7 gap-y-5 overflow-hidden rounded-2xl bg-cwru-blue px-6 py-6 text-white md:px-7"
      >
        <span aria-hidden className="la-dots absolute inset-0 opacity-60" />
        {bothOverallNull ? (
          <div className="relative flex max-w-xl flex-col gap-1">
            <h1 className="font-display text-[32px] font-medium leading-[1.1]">Mastery</h1>
            <p className="font-display text-xl">No mastery measured yet</p>
            <p className="text-sm leading-6 text-light-blue">
              Complete a live practice session, a knowledge check or a coached session and this
              page will start showing where you stand.
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <ProgressRing
                done={overall.currentPercent ?? 0}
                label={`Recent form ${overall.current.display}`}
                size={120}
                stroke={11}
                tone="dark"
                total={100}
              >
                <span className="flex flex-col items-center leading-none">
                  {overall.current.approximate ? (
                    <span className="mb-0.5 text-[11px] font-normal text-light-blue">about</span>
                  ) : null}
                  <span className="font-display text-[30px] font-medium">
                    {overall.current.rounded === null ? "—" : `${overall.current.rounded}%`}
                  </span>
                  <span className="mt-1 text-[11px] font-normal text-light-blue">Recent form</span>
                </span>
              </ProgressRing>
            </div>
            <div className="relative flex min-w-[220px] flex-1 flex-col gap-1">
              <h1 className="font-display text-[32px] font-medium leading-[1.1]">Mastery</h1>
              <dl className="flex flex-wrap gap-x-5 text-[15px] text-light-blue">
                <div className="flex gap-1.5">
                  <dt>{`Recent (last ${masteryWindow.days} days)`}</dt>
                  <dd className="font-bold text-white">{overall.current.display}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>All time</dt>
                  <dd className="font-bold text-white">{overall.lifetime.display}</dd>
                </div>
              </dl>
              <p className="text-[13px]">
                <Confidence figure={overall.current.rounded === null ? overall.lifetime : overall.current} tone="dark" />
              </p>
              {intro && <p className="max-w-[60ch] text-[13px] leading-5 text-light-blue/90">{intro}</p>}
            </div>
          </>
        )}
        <div className="relative">
          <GoalsStrip goals={goals} timeZone={timeZone} tone="dark" />
        </div>
      </section>

      <RecentMovement
        entries={mastery.recentGrowth}
        levels={levels}
        windowDays={masteryWindow.days}
        windowStartsAt={masteryWindow.startsAt}
        timeZone={timeZone}
        expand={expand}
        opened={opened}
        onOpen={setOpened}
      />

      <section aria-label="Mastery by competency" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-[22px] font-medium text-cwru-blue">Your skill badges</h2>
          <LevelLadder levels={levels} />
        </div>
        <details className="group text-[13px]">
          <summary className={TOGGLE_CLASS}>
            How these numbers work
            <ChevronDown aria-hidden className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" size={16} />
          </summary>
          <ul className="mt-2 flex max-w-[65ch] list-disc flex-col gap-1 pl-5 leading-5 text-muted">
            <li>Each figure is our best estimate, not your average. Every skill starts near the middle of the scale, then moves toward your real scores as you practice.</li>
            <li>Each session counts once, however many things it scored. Live practice counts most, then knowledge checks, then drills and coached work. Recent work counts a little more.</li>
            <li>The dots show how sure we are. Higher levels also need more sessions, so one great session can&apos;t make a skill Strong or Mastered.</li>
          </ul>
        </details>
        <ul
          className={clsx(
            "grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3",
            expand === "row" && "grid-flow-row-dense",
          )}
        >
          {mastery.competencies.map((competency) => {
            const key = competency.competencyKey;
            const isOpen = opened?.kind === "competency" && opened.key === key;
            const level = levels[key];
            return (
              <Fragment key={key}>
                <CompetencyCard
                  competency={competency}
                  level={level}
                  windowDays={masteryWindow.days}
                  expand={expand}
                  open={isOpen}
                  onToggle={() => setOpened(isOpen ? null : { kind: "competency", key })}
                />
                {expand === "row" && isOpen ? (
                  <RowPanel
                    id={detailId("competency", key)}
                    title={`${competency.label}: trend and evidence`}
                    subtitle={level ? <LevelBadge level={level} /> : null}
                    onClose={() => setOpened(null)}
                  >
                    <CompetencyDetail competency={competency} windowDays={masteryWindow.days} wide />
                  </RowPanel>
                ) : null}
              </Fragment>
            );
          })}
        </ul>
      </section>

      {unmappedRowCount > 0 ? (
        <p role="note" className="text-xs leading-5 text-muted">
          {unmappedRowCount} recorded {unmappedRowCount === 1 ? "result" : "results"} did not map to
          a current competency and are not reflected above. This means the competency catalog and
          the evidence ledger disagree — it is a data note, not a score.
        </p>
      ) : null}

      {expand === "drawer" ? (
        <DetailDrawer
          opened={opened}
          mastery={mastery}
          levels={levels}
          timeZone={timeZone}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </div>
  );
}
