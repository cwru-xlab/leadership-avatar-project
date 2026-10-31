import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ChevronDown, Sparkle, TrendingDown, TrendingUp } from "lucide-react";

import type {
  CompetencyMasteryDTO,
  MasteryDTO,
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
 * colourblind reader, or a narrow viewport where position and colour both
 * fail as cues.
 *
 * Layout: a CWRU Blue summary band (recent form ring, all time, goal rings),
 * the recent-movement strip, then one badge card per competency with its
 * level shield, progress to the next level and both figures up front, and
 * the trend, evidence and disclosures one click away.
 */

export interface MasteryPanelProps {
  mastery: MasteryDTO;
  levels: Record<string, { current: LevelResult; lifetime: LevelResult }>;
  goals: GoalProgress;
  timeZone: string;
  /** One line under the title saying what the figures are built from. */
  intro?: string;
}

function formatPercent(percent: number | null): string {
  // A null percent is "not yet measured", never "0%" — a null-to-string
  // coercion bug (e.g. `${percent}%` on a null) would print "null%", and an
  // arithmetic bug upstream would print "NaN%"; neither is acceptable, so
  // this is the ONLY place a percent is turned into display text.
  return percent === null ? "Not yet measured" : `${percent}%`;
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
 * all-time level is shown instead and labelled as such, so a student whose
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
      className="text-[13px] font-semibold text-cwru-blue"
      aria-label={`${useCurrent ? "Recent" : "All-time"} level ${shown.level}, ${shown.name}${
        shown.provisional ? ", provisional" : ""
      }`}
    >
      {`Level ${shown.level} · ${shown.name}`}
      <span className="font-normal text-muted">
        {useCurrent ? "" : " · all-time level"}
        {shown.provisional ? " · provisional" : ""}
      </span>
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-bold",
        delta >= 0 ? "bg-level-4/16 text-level-4" : "bg-copper/12 text-copper-deep",
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {`${formatDelta(delta)} pts`}
    </span>
  );
}

/**
 * Where a competency's evidence came from, split into live practice and
 * path learning (checks, coached sessions). Counts are scored results in
 * the ledger — one session can evidence several competencies.
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

function DriverList({ drivers, timeZone }: { drivers: WindowDriverDTO[]; timeZone: string }) {
  if (drivers.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {drivers.map((driver) => {
        const body = (
          <>
            <span className="font-semibold">{driver.activityLabel}</span>
            <span className="text-muted">
              {` · ${driver.originLabel} · ${formatDay(driver.occurredAt, timeZone)} · scored ${driver.percent}%`}
            </span>
          </>
        );
        return (
          <li
            key={`${driver.activityLabel}-${driver.occurredAt}-${driver.href ?? ""}`}
            className="text-xs text-ink"
          >
            {driver.href ? (
              <Link href={driver.href} className="underline decoration-light-blue underline-offset-2 hover:text-link">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RecentMovement({
  entries,
  levels,
  windowDays,
  windowStartsAt,
  timeZone,
}: {
  entries: RecentGrowthDTO[];
  levels: MasteryPanelProps["levels"];
  windowDays: number;
  windowStartsAt: string;
  timeZone: string;
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
        <ul className="grid gap-3 md:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.competencyKey} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
              <div className="flex items-center gap-3">
                <SkillShield competencyKey={entry.competencyKey} level={shownLevel(levels[entry.competencyKey])} size={40} />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-[15px] font-bold leading-snug text-ink">{entry.label}</p>
                  {entry.kind === "new" || entry.delta === null ? (
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-light-blue/32 px-2 py-0.5 text-[12.5px] font-bold text-cwru-blue">
                      <Sparkle size={13} aria-hidden="true" />
                      First measured
                    </span>
                  ) : (
                    <DeltaText delta={entry.delta} />
                  )}
                </div>
              </div>
              {entry.kind !== "new" && entry.delta !== null && (
                <p className="text-xs text-muted">
                  {`All time ${formatPercent(entry.windowStartPercent)} → ${formatPercent(entry.lifetimePercent)}`}
                </p>
              )}
              {entry.drivers.length > 0 && (
                <details className="group text-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-link [&::-webkit-details-marker]:hidden">
                    Moved by {entry.drivers.length} {entry.drivers.length === 1 ? "activity" : "activities"}
                    <ChevronDown aria-hidden className="transition-transform duration-200 group-open:rotate-180" size={14} />
                  </summary>
                  <div className="mt-2">
                    <DriverList drivers={entry.drivers} timeZone={timeZone} />
                  </div>
                </details>
              )}
              {entry.delta !== null && entry.delta < 0 ? (
                <Link
                  href={`/paths?competency=${encodeURIComponent(entry.competencyKey)}`}
                  className="mt-auto inline-flex h-9 w-fit items-center gap-1.5 rounded-lg bg-cwru-blue px-3 text-[13px] font-semibold text-white hover:bg-ink"
                  aria-label={`Practice ${entry.label}`}
                >
                  Practice this <ArrowRight size={14} aria-hidden="true" />
                </Link>
              ) : null}
            </li>
          ))}
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

function CompetencyCard({
  competency,
  level,
  windowDays,
}: {
  competency: CompetencyMasteryDTO;
  level: { current: LevelResult; lifetime: LevelResult } | undefined;
  windowDays: number;
}) {
  const shown = shownLevel(level);
  const { delta } = competency.windowChange;
  return (
    <li className="relative flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
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
            {formatPercent(competency.lifetime.percent)}
          </dd>
          <dd className="text-[13px] leading-snug text-muted">
            {`${competency.lifetime.tierLabel} · ${competency.lifetime.evidenceCount} scored`}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-link">{`Recent (last ${windowDays} days)`}</dt>
          <dd className="font-display text-2xl font-medium text-cwru-blue tabular-nums">
            {formatPercent(competency.current.percent)}
          </dd>
          <dd className="text-[13px] leading-snug text-muted">
            {`${competency.current.tierLabel} · ${competency.current.evidenceCount} scored`}
          </dd>
        </div>
      </dl>

      <details className="group mt-auto border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-link [&::-webkit-details-marker]:hidden">
          Trend and evidence
          <ChevronDown aria-hidden className="transition-transform duration-200 group-open:rotate-180" size={16} />
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[13px] text-muted">{competency.description}</p>
          <TrendRow competency={competency} windowDays={windowDays} />
          <EvidenceSources sources={competency.sources} />
          <CompetencyDisclosures competency={competency} />
        </div>
      </details>
    </li>
  );
}

export default function MasteryPanel({ mastery, levels, goals, timeZone, intro }: MasteryPanelProps) {
  const { overall, window: masteryWindow, unmappedRowCount } = mastery;
  const bothOverallNull = overall.currentPercent === null && overall.lifetimePercent === null;

  const overallAriaLabel = bothOverallNull
    ? "No mastery measured yet. Complete a session or a knowledge check to begin."
    : `Recent form over the last ${masteryWindow.days} days: ${formatPercent(
        overall.currentPercent
      )}. All time: ${formatPercent(overall.lifetimePercent)}.`;

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
                label={`Recent form ${formatPercent(overall.currentPercent)}`}
                size={120}
                stroke={11}
                tone="dark"
                total={100}
              >
                <span className="flex flex-col items-center leading-none">
                  <span className="font-display text-[30px] font-medium">
                    {overall.currentPercent === null ? "—" : `${overall.currentPercent}%`}
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
                  <dd className="font-bold text-white">{formatPercent(overall.currentPercent)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>All time</dt>
                  <dd className="font-bold text-white">{formatPercent(overall.lifetimePercent)}</dd>
                </div>
              </dl>
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
      />

      <section aria-label="Mastery by competency" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-[22px] font-medium text-cwru-blue">Your skill badges</h2>
          <LevelLadder levels={levels} />
        </div>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mastery.competencies.map((competency) => (
            <CompetencyCard
              key={competency.competencyKey}
              competency={competency}
              level={levels[competency.competencyKey]}
              windowDays={masteryWindow.days}
            />
          ))}
        </ul>
      </section>

      {unmappedRowCount > 0 ? (
        <p role="note" className="text-xs leading-5 text-muted">
          {unmappedRowCount} recorded {unmappedRowCount === 1 ? "result" : "results"} did not map to
          a current competency and are not reflected above. This means the competency catalog and
          the evidence ledger disagree — it is a data note, not a score.
        </p>
      ) : null}
    </div>
  );
}
