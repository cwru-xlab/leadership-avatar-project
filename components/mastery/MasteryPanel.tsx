import { CircleCheck, Circle } from "lucide-react";
import { Card, CardBody } from "@heroui/card";

import type { CompetencyMasteryDTO, MasteryDTO } from "@/lib/mastery/mastery-dto";
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

function LevelLine({ level }: { level: LevelResult }) {
  return (
    <p className="mt-1 text-xs font-medium text-[#0a7391]">
      {level.name}
      {level.provisional ? " · provisional" : ""}
      {level.nextLevelAtPercent !== null ? ` · Next level at ${level.nextLevelAtPercent}%` : ""}
    </p>
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
                Complete a coached practice session or a knowledge check and this page will start
                showing where you stand.
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

      <section aria-label="Mastery by competency">
        <h2 className="font-serif text-2xl text-[#102331]">By competency</h2>
        <ul className="mt-4 space-y-3">
          {mastery.competencies.map((competency) => {
            const level = levels[competency.competencyKey];
            return (
              <li key={competency.competencyKey}>
                <Card className="border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
                  <CardBody className="p-5">
                    <p className="font-semibold text-[#102331]">{competency.label}</p>
                    <p className="mt-1 text-sm leading-6 text-[#58727f]">{competency.description}</p>

                    <dl className="mt-3 flex flex-wrap gap-8">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-[#58727f]">
                          All time
                        </dt>
                        <dd className="mt-0.5 text-lg font-semibold text-[#385463]">
                          {formatPercent(competency.lifetime.percent)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-[#0a7391]">
                          Recent
                        </dt>
                        <dd className="mt-0.5 text-lg font-semibold text-[#102331]">
                          {formatPercent(competency.current.percent)}
                        </dd>
                      </div>
                    </dl>

                    {level ? <LevelLine level={level.current} /> : null}

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
