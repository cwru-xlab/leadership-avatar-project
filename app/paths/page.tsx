"use client";

/**
 * `/paths` — the path hub (Phase 23). In the user's words: "the option to
 * enter the paths page and then just pick a study plan to generate a path
 * from, if it hasn't already been done for that study plan."
 *
 * Left: every saved plan with its progress ring (or "No path yet"). Right:
 * the selected plan's skill trail (`PathPanel`) with its single Continue
 * button, or — for a plan without a path — `GeneratePathCard`, which calls
 * the existing POST route inline. Levels and daily/weekly goals come from
 * the existing `/api/mastery` route. `?plan={id}` preselects a plan.
 *
 * Progression mechanics are limited to levels and daily/weekly goals
 * (21-CONTEXT.md, re-confirmed 2026-10-24). Every step stays reachable.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ChevronRight, Route, Sparkles } from "lucide-react";

import PathPanel, {
  DegradedStepsNote,
  continueTargetFor,
  isStepDone,
  KIND_LABEL,
} from "@/components/study-plan/PathPanel";
import GeneratePathCard from "@/components/study-plan/GeneratePathCard";
import SincePlanGrowth from "@/components/study-plan/SincePlanGrowth";
import { GoalsStrip, ProgressRing, usePathMastery } from "@/components/study-plan/PathVisuals";
import { usePlansWithPaths, type PlanWithPath } from "@/components/study-plan/usePlansWithPaths";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** True when this plan's path has at least one step targeting `key`. */
function pathTargets(item: PlanWithPath, key: string | null): boolean {
  return Boolean(key && item.path && item.path.steps.some((s) => s.competencyKey === key));
}

function PlanPickerRow({
  item,
  selected,
  onSelect,
  focusLabel,
}: {
  item: PlanWithPath;
  selected: boolean;
  onSelect: () => void;
  /** Set when this plan's path targets the ?competency= focus. */
  focusLabel?: string | null;
}) {
  const total = item.path ? item.path.steps.length : 0;
  const done = item.path ? item.path.steps.filter(isStepDone).length : 0;
  const target = item.path ? continueTargetFor(item.path) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
        selected
          ? "border-[#0a7391] bg-[#eaf7fa]"
          : "border-transparent bg-white hover:border-[#c9dbe2]"
      } shadow-[0_4px_14px_rgba(20,58,75,0.06)]`}
    >
      {item.path === undefined ? (
        <span className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[#eef3f5]" />
      ) : item.path ? (
        <ProgressRing done={done} total={total} size={48} stroke={5} />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#e0b062] text-lg font-bold text-[#b07a1a]">
          +
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#102331]">{item.plan.title}</span>
        <span className="block text-xs text-[#58727f]">
          {item.path === undefined
            ? "Loading path…"
            : item.pathError
              ? item.pathError
              : item.path === null
                ? `Saved ${formatDate(item.plan.savedAt)} · no path yet`
                : done >= total
                  ? "Path complete"
                  : target
                    ? `Next: ${KIND_LABEL[target.step.kind]} — ${target.step.competencyLabel}`
                    : `${done} of ${total} steps done`}
        </span>
        {focusLabel ? (
          <span className="mt-1 inline-block rounded-full bg-[#fff4e0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a5a00]">
            Targets {focusLabel}
          </span>
        ) : null}
      </span>
      <ChevronRight size={16} className="shrink-0 text-[#8298a3]" aria-hidden="true" />
    </button>
  );
}

function PathsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlanId = searchParams.get("plan");
  // /mastery links a dropped competency here as ?competency=<key>.
  const focusCompetency = searchParams.get("competency");
  const { state, setPathFor } = usePlansWithPaths();
  const mastery = usePathMastery();
  const [selectedId, setSelectedId] = useState<string | null>(requestedPlanId);
  const [degraded, setDegraded] = useState<Record<string, number>>({});
  const detailRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => (state.status === "loaded" ? state.items : []), [state]);

  const pathsLoaded = items.length > 0 && items.every((i) => i.path !== undefined);
  const focusLabel = focusCompetency
    ? mastery?.labels[focusCompetency] ??
      items
        .flatMap((i) => i.path?.steps ?? [])
        .find((s) => s.competencyKey === focusCompetency)?.competencyLabel ??
      focusCompetency.replace(/_/g, " ")
    : null;
  const focusTargeted = items.filter((i) => pathTargets(i, focusCompetency));
  const firstPlanWithoutPath = items.find((i) => i.path === null && !i.pathError) ?? null;

  // Default selection once plans load: the requested plan if it exists; with
  // ?competency=, the most recent plan whose path targets it (unfinished
  // first), else a plan without a path (to offer generating one); otherwise
  // the most recent plan with an unfinished path, else the most recent plan.
  useEffect(() => {
    if (items.length === 0) return;
    if (selectedId && items.some((i) => i.plan.id === selectedId)) return;
    if (!pathsLoaded) return; // wait for paths
    const unfinished = (i: PlanWithPath) => Boolean(i.path && i.path.steps.some((s) => !isStepDone(s)));
    if (focusCompetency) {
      const targeted = items.filter((i) => pathTargets(i, focusCompetency));
      const pick = targeted.find(unfinished) ?? targeted[0] ?? firstPlanWithoutPath;
      if (pick) {
        setSelectedId(pick.plan.id);
        return;
      }
    }
    setSelectedId((items.find(unfinished) ?? items[0]).plan.id);
  }, [items, selectedId, pathsLoaded, focusCompetency, firstPlanWithoutPath]);

  function select(planId: string) {
    setSelectedId(planId);
    const query = new URLSearchParams({ plan: planId });
    if (focusCompetency) query.set("competency", focusCompetency);
    router.replace(`/paths?${query.toString()}`, { scroll: false });
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const selected = items.find((i) => i.plan.id === selectedId) ?? null;

  if (state.status === "needs-login") {
    return (
      <div className="mt-8 rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
        <p className="font-serif text-2xl text-[#102331]">Please sign in to view your paths.</p>
        <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <>
      {mastery ? (
        <div className="mt-6">
          <GoalsStrip goals={mastery.goals} timeZone={mastery.timeZone} />
        </div>
      ) : null}

      {focusCompetency && focusLabel && pathsLoaded ? (
        <div
          role="status"
          className="mt-6 rounded-2xl border border-[#f0d3a0] bg-[#fffaf0] p-4 text-sm text-[#5c4410]"
        >
          {focusTargeted.length > 0 ? (
            <p>
              <span className="font-semibold">Focusing on {focusLabel}.</span>{" "}
              {focusTargeted.length === 1 ? "One path targets" : `${focusTargeted.length} paths target`} it —
              matching steps are outlined below.
            </p>
          ) : (
            <>
              <p>
                <span className="font-semibold">None of your paths target {focusLabel} yet.</span>{" "}
                A path aims at your weakest competencies at the moment it is generated, so a new path
                is the way to work on it.
              </p>
              <div className="mt-3">
                {firstPlanWithoutPath ? (
                  <Button size="sm" color="primary" onPress={() => select(firstPlanWithoutPath.plan.id)}>
                    Generate a path for “{firstPlanWithoutPath.plan.title}”
                  </Button>
                ) : (
                  <Button as={Link} href="/study-plans" size="sm" color="primary">
                    Create a new study plan
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="mt-8 flex justify-center rounded-2xl border border-[#d4e2e9] bg-white p-12">
          <Spinner color="current" />
        </div>
      ) : state.status === "error" ? (
        <div className="mt-8 rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center">
          <p className="font-serif text-2xl text-[#102331]">{state.message}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
          <Route className="mx-auto h-10 w-10 text-[#0a7391]" aria-hidden="true" />
          <p className="mt-3 font-serif text-2xl text-[#102331]">No study plans yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#58727f]">
            A path is built from a study plan. Create one from your interview feedback, then come
            back here to generate its path.
          </p>
          <Button as={Link} href="/study-plans" className="mt-5" color="primary">
            Create a study plan
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside aria-label="Choose a study plan" className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">
              Your study plans
            </p>
            <div className="mt-3 space-y-2">
              {items.map((item) => (
                <PlanPickerRow
                  key={item.plan.id}
                  item={item}
                  selected={item.plan.id === selectedId}
                  onSelect={() => select(item.plan.id)}
                  focusLabel={pathTargets(item, focusCompetency) ? focusLabel : null}
                />
              ))}
            </div>
            <Link
              href="/study-plans"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#0a7391]"
            >
              Manage study plans <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </aside>

          <div ref={detailRef} className="min-w-0 scroll-mt-6">
            {selected ? (
              <>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-2xl text-[#102331]">{selected.plan.title}</h2>
                  <Link
                    href={`/study-plans/${selected.plan.id}`}
                    className="text-sm font-semibold text-[#0a7391]"
                  >
                    View full plan
                  </Link>
                </div>
                {selected.path === undefined ? (
                  <div className="h-64 animate-pulse rounded-2xl border border-[#e3ebee] bg-white" />
                ) : selected.pathError ? (
                  <p className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
                    {selected.pathError}
                  </p>
                ) : selected.path ? (
                  <>
                    <PathPanel
                      planId={selected.plan.id}
                      path={selected.path}
                      levels={mastery?.levels}
                      highlightCompetency={focusCompetency}
                      onRebuilt={(path, degradedCount) => {
                        setPathFor(selected.plan.id, path);
                        setDegraded((d) => ({ ...d, [selected.plan.id]: degradedCount }));
                      }}
                      // GROWTH-SINCE-PLAN SLOT
                      growthSlot={<SincePlanGrowth key={selected.path.id} planId={selected.plan.id} />}
                    />
                    <DegradedStepsNote count={degraded[selected.plan.id] ?? 0} />
                  </>
                ) : (
                  <GeneratePathCard
                    key={selected.plan.id}
                    planId={selected.plan.id}
                    planTitle={selected.plan.title}
                    onGenerated={(path, degradedCount) => {
                      setPathFor(selected.plan.id, path);
                      setDegraded((d) => ({ ...d, [selected.plan.id]: degradedCount }));
                    }}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

export default function PathsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          Paths
        </h1>
        <p className="mt-2 text-sm text-[#58727f]">
          Pick a study plan to follow its path — or generate one if it doesn&apos;t have a path yet.
        </p>
        <Suspense
          fallback={
            <div className="mt-8 flex justify-center">
              <Spinner color="current" />
            </div>
          }
        >
          <PathsHub />
        </Suspense>
      </div>
    </main>
  );
}
