import Link from "next/link";
import { CircleCheck, Circle, TrendingUp, TrendingDown, Sparkle } from "lucide-react";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";

import type {
  CompetencyMasteryDTO,
  MasteryDTO,
  OriginFigureDTO,
  RecentGrowthDTO,
  WindowDriverDTO,
} from "@/lib/mastery/mastery-dto";
import Sparkline from "@/components/mastery/Sparkline";
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
 */

export interface MasteryPanelProps {
  mastery: MasteryDTO;
  levels: Record<string, { current: LevelResult; lifetime: LevelResult }>;
  goals: GoalProgress;
  timeZone: string;
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
      <div className="mt-2 space-y-1 text-xs leading-5 text-[#58727f]">
        <p>
          <span className="font-semibold text-[#385463]">All time —</span> {lifetimeDisclosure}
        </p>
        <p>
          <span className="font-semibold text-[#385463]">Recent —</span> {currentDisclosure}
        </p>
      </div>
    );
  }

  const single = lifetimeDisclosure ?? currentDisclosure;
  if (!single) return null;

  return <p className="mt-2 text-xs leading-5 text-[#58727f]">{single}</p>;
}

/**
 * The level badge. Levels are computed by the route (`levelFor`) from the
 * RECENT figure; when there is no recent evidence, the all-time level is
 * shown instead and labelled as such, so a student whose practice is older
 * than the window still sees where they stand.
 */
function LevelBadge({ level }: { level: { current: LevelResult; lifetime: LevelResult } }) {
  const useCurrent = level.current.level !== null;
  const shown = useCurrent ? level.current : level.lifetime;
  if (shown.level === null) {
    return (
      <Chip size="sm" variant="bordered" className="border-[#d4e2e9] text-[#8298a3]">
        Not yet measured
      </Chip>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Chip
        size="sm"
        variant="flat"
        className="bg-[#e3f3f7] font-semibold text-[#0a5b72]"
        aria-label={`${useCurrent ? "Recent" : "All-time"} level ${shown.level}, ${shown.name}${
          shown.provisional ? ", provisional" : ""
        }`}
      >
        {`Level ${shown.level} · ${shown.name}`}
      </Chip>
      <span className="text-[11px] text-[#8298a3]">
        {useCurrent ? "Recent level" : "All-time level"}
        {shown.provisional ? " · provisional" : ""}
        {shown.nextLevelAtPercent !== null ? ` · next at ${shown.nextLevelAtPercent}%` : ""}
      </span>
    </div>
  );
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

function DeltaText({ delta }: { delta: number }) {
  const Icon = delta >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${
        delta >= 0 ? "text-[#0a7a4f]" : "text-[#b4532a]"
      }`}
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
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#58727f]">Evidence from</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {sources.map((source) => (
          <li
            key={source.origin}
            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
              source.lifetime.evidenceCount === 0
                ? "border-dashed border-[#d4e2e9] text-[#8298a3]"
                : source.group === "live"
                  ? "border-[#badbe5] bg-[#f1fafc] text-[#385463]"
                  : "border-[#d9d2ef] bg-[#f7f5fd] text-[#4a4068]"
            }`}
          >
            <span className="font-semibold">{source.label}</span>
            <span className="ml-1.5">
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
    <ul className="mt-2 space-y-1.5">
      {drivers.map((driver) => {
        const body = (
          <>
            <span className="font-medium">{driver.activityLabel}</span>
            <span className="text-[#8298a3]">
              {` · ${driver.originLabel} · ${formatDay(driver.occurredAt, timeZone)} · scored ${driver.percent}%`}
            </span>
          </>
        );
        return (
          <li
            key={`${driver.activityLabel}-${driver.occurredAt}-${driver.href ?? ""}`}
            className="text-xs text-[#385463]"
          >
            {driver.href ? (
              <Link href={driver.href} className="underline decoration-[#badbe5] underline-offset-2 hover:text-[#0a7391]">
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
  windowDays,
  windowStartsAt,
  timeZone,
}: {
  entries: RecentGrowthDTO[];
  windowDays: number;
  windowStartsAt: string;
  timeZone: string;
}) {
  return (
    <section aria-label="Recent movement">
      <h2 className="font-serif text-2xl text-[#102331]">Recent movement</h2>
      <p className="mt-1 text-sm text-[#58727f]">
        {`Competencies whose all-time figure moved most in the last ${windowDays} days (since ${formatDay(
          windowStartsAt,
          timeZone
        )}), up or down, and the activities that moved them.`}
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[#d4e2e9] bg-white p-4 text-sm text-[#58727f]">
          Nothing has moved in this period yet. A live practice session, a knowledge check or a
          coached session will show up here.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.competencyKey}>
              <Card className="h-full border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
                <CardBody className="p-4">
                  <p className="font-semibold text-[#102331]">{entry.label}</p>
                  <p className="mt-1 text-sm text-[#385463]">
                    {entry.kind === "new" || entry.delta === null ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0a7391]">
                        <Sparkle size={14} aria-hidden="true" />
                        First measured this period
                      </span>
                    ) : (
                      <>
                        <DeltaText delta={entry.delta} />
                        <span className="text-[#58727f]">
                          {` all time: ${formatPercent(entry.windowStartPercent)} → ${formatPercent(
                            entry.lifetimePercent
                          )}`}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[#58727f]">
                    Moved by
                  </p>
                  <DriverList drivers={entry.drivers} timeZone={timeZone} />
                  {entry.delta !== null && entry.delta < 0 ? (
                    <Link
                      href={`/paths?competency=${encodeURIComponent(entry.competencyKey)}`}
                      className="mt-3 inline-flex w-fit items-center gap-1 rounded-lg bg-[#0a7391] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#085f78]"
                      aria-label={`Practice ${entry.label}`}
                    >
                      Practice this
                    </Link>
                  ) : null}
                </CardBody>
              </Card>
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
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Sparkline
        points={competency.trend}
        label={`All-time ${competency.label} figure over the last ${weeks} weeks`}
      />
      <div className="text-xs leading-5 text-[#58727f]">
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

function GoalRow({
  label,
  completed,
  target,
  met,
}: {
  label: string;
  completed: number;
  target: number;
  met: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#385463]">
      {met ? (
        <CircleCheck size={16} className="shrink-0 text-[#0a7391]" aria-hidden="true" />
      ) : (
        <Circle size={16} className="shrink-0 text-[#b7c7cd]" aria-hidden="true" />
      )}
      <span>
        {label}: {completed} of {target}
      </span>
    </div>
  );
}

export default function MasteryPanel({ mastery, levels, goals, timeZone }: MasteryPanelProps) {
  const { overall, window: masteryWindow, unmappedRowCount } = mastery;
  const bothOverallNull = overall.currentPercent === null && overall.lifetimePercent === null;

  const overallAriaLabel = bothOverallNull
    ? "No mastery measured yet. Complete a session or a knowledge check to begin."
    : `Recent form over the last ${masteryWindow.days} days: ${formatPercent(
        overall.currentPercent
      )}. All time: ${formatPercent(overall.lifetimePercent)}.`;

  return (
    <div className="space-y-6">
      <Card
        className="border border-[#badbe5] bg-[linear-gradient(135deg,#ecf9fc,#ffffff)] shadow-[0_8px_24px_rgba(20,58,75,0.06)]"
        aria-label={overallAriaLabel}
      >
        <CardBody className="p-5 sm:p-6">
          {bothOverallNull ? (
            <div>
              <p className="font-serif text-2xl text-[#102331]">No mastery measured yet</p>
              <p className="mt-2 text-sm leading-6 text-[#58727f]">
                Complete a live practice session, a knowledge check or a coached session and this
                page will start showing where you stand.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">
                  {`Recent form (last ${masteryWindow.days} days)`}
                </p>
                <p className="mt-1 font-serif text-4xl text-[#102331]">
                  {formatPercent(overall.currentPercent)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#58727f]">All time</p>
                <p className="mt-1 font-serif text-2xl text-[#385463]">
                  {formatPercent(overall.lifetimePercent)}
                </p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
        <CardBody className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <GoalRow label="Today" completed={goals.daily.completed} target={goals.daily.target} met={goals.daily.met} />
          <GoalRow
            label="This week"
            completed={goals.weekly.completed}
            target={goals.weekly.target}
            met={goals.weekly.met}
          />
          <span className="text-xs text-[#8298a3]">Times shown for {timeZone}</span>
        </CardBody>
      </Card>

      <RecentMovement
        entries={mastery.recentGrowth}
        windowDays={masteryWindow.days}
        windowStartsAt={masteryWindow.startsAt}
        timeZone={timeZone}
      />

      <section aria-label="Mastery by competency">
        <h2 className="font-serif text-2xl text-[#102331]">By competency</h2>
        <ul className="mt-4 space-y-3">
          {mastery.competencies.map((competency) => {
            const level = levels[competency.competencyKey];
            return (
              <li key={competency.competencyKey}>
                <Card className="border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
                  <CardBody className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#102331]">{competency.label}</p>
                        <p className="mt-1 text-sm leading-6 text-[#58727f]">{competency.description}</p>
                      </div>
                      {level ? <LevelBadge level={level} /> : null}
                    </div>

                    <dl className="mt-3 flex flex-wrap gap-8">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-[#58727f]">
                          All time
                        </dt>
                        <dd className="mt-0.5 text-lg font-semibold text-[#385463]">
                          {formatPercent(competency.lifetime.percent)}
                        </dd>
                        <dd className="text-[11px] text-[#8298a3]">
                          {`${competency.lifetime.tierLabel} · ${competency.lifetime.evidenceCount} scored`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-[#0a7391]">
                          {`Recent (last ${masteryWindow.days} days)`}
                        </dt>
                        <dd className="mt-0.5 text-lg font-semibold text-[#102331]">
                          {formatPercent(competency.current.percent)}
                        </dd>
                        <dd className="text-[11px] text-[#8298a3]">
                          {`${competency.current.tierLabel} · ${competency.current.evidenceCount} scored`}
                        </dd>
                      </div>
                    </dl>

                    <TrendRow competency={competency} windowDays={masteryWindow.days} />

                    <EvidenceSources sources={competency.sources} />

                    <CompetencyDisclosures competency={competency} />
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {unmappedRowCount > 0 ? (
        <p role="note" className="text-xs leading-5 text-[#8298a3]">
          {unmappedRowCount} recorded {unmappedRowCount === 1 ? "result" : "results"} did not map to
          a current competency and are not reflected above. This means the competency catalog and
          the evidence ledger disagree — it is a data note, not a score.
        </p>
      ) : null}
    </div>
  );
}
