"use client";

/**
 * `/paths` — the path hub (Phase 23). In the user's words: "the option to
 * enter the paths page and then just pick a study plan to generate a path
 * from, if it hasn't already been done for that study plan."
 *
 * Header: a plan switcher (every saved plan with its progress ring, or "no
 * path yet") and the goal rings. Below: the selected plan's path map
 * (`PathPanel`) with its single Continue button, or — for a plan without a
 * path — `GeneratePathCard`, which calls the existing POST route inline. Levels and daily/weekly goals come from
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
import { ChevronDown, ChevronRight, Plus, Route } from "lucide-react";

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

/** One plan in the switcher: its title and how far its path has come. */
function planProgressLabel(item: PlanWithPath): string {
  if (item.path === undefined) return "Loading path…";
  if (item.pathError) return item.pathError;
  if (item.path === null) return `Saved ${formatDate(item.plan.savedAt)} · no path yet`;
  const total = item.path.steps.length;
  const done = item.path.steps.filter(isStepDone).length;
  if (done >= total) return "Path complete";
  const target = continueTargetFor(item.path);
  return target ? `Next: ${KIND_LABEL[target.step.kind]} — ${target.step.competencyLabel}` : `${done} of ${total} steps done`;
}

function PlanSwitcher({
  items,
  selectedId,
  focusCompetency,
  onSelect,
}: {
  items: PlanWithPath[];
  selectedId: string | null;
  focusCompetency: string | null;
  onSelect: (planId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.plan.id === selectedId) ?? null;
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-full items-center gap-2 rounded-lg py-1 text-left text-[15px] text-muted hover:text-ink"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate font-semibold text-ink">{selected?.plan.title ?? "Choose a study plan"}</span>
        <ChevronDown aria-hidden className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} size={16} />
        <span className="shrink-0">· {items.length} {items.length === 1 ? "plan" : "plans"}</span>
      </button>
      {open && (
        <ul
          aria-label="Choose a study plan"
          className="absolute left-0 top-full z-30 mt-2 flex max-h-[60vh] w-[min(92vw,440px)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-raised"
          role="listbox"
        >
          {items.map((item) => {
            const total = item.path ? item.path.steps.length : 0;
            const done = item.path ? item.path.steps.filter(isStepDone).length : 0;
            const on = item.plan.id === selectedId;
            return (
              <li key={item.plan.id} aria-selected={on} role="option">
                <button
                  className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-canvas ${on ? "bg-light-blue/32" : ""}`}
                  type="button"
                  onClick={() => {
                    onSelect(item.plan.id);
                    setOpen(false);
                  }}
                >
                  {item.path ? (
                    <ProgressRing done={done} size={44} stroke={4} total={total} />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-light-blue text-cwru-blue">
                      <Plus aria-hidden size={16} />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-ink">{item.plan.title}</span>
                    <span className="truncate text-xs text-muted">{planProgressLabel(item)}</span>
                    {pathTargets(item, focusCompetency) ? (
                      <span className="mt-1 w-fit rounded-full bg-level-2/16 px-2 py-0.5 text-[11px] font-semibold text-ink">
                        Works on the skill you picked
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <Link className="flex items-center gap-1 rounded-lg p-2.5 text-sm font-semibold text-link hover:bg-canvas" href="/study-plans">
              Manage study plans <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </li>
        </ul>
      )}
    </div>
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-8 text-center">
        <p className="font-display text-2xl font-medium text-cwru-blue">Please sign in to view your paths.</p>
        <Button color="primary" onPress={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
            Paths
          </h1>
          {items.length > 0 ? (
            <PlanSwitcher
              focusCompetency={focusCompetency}
              items={items}
              selectedId={selectedId}
              onSelect={select}
            />
          ) : (
            <p className="text-[15px] text-muted">Pick a study plan to follow its path.</p>
          )}
        </div>
        {mastery ? <GoalsStrip goals={mastery.goals} timeZone={mastery.timeZone} /> : null}
      </header>

      {focusCompetency && focusLabel && pathsLoaded ? (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-level-2/50 bg-level-2/10 p-4 text-sm text-ink">
          {focusTargeted.length > 0 ? (
            <p>
              <span className="font-semibold">Focusing on {focusLabel}.</span>{" "}
              {focusTargeted.length === 1 ? "One path targets" : `${focusTargeted.length} paths target`} it —
              matching steps are outlined on the map.
            </p>
          ) : (
            <>
              <p>
                <span className="font-semibold">None of your paths target {focusLabel} yet.</span>{" "}
                A path aims at your weakest competencies at the moment it is generated, so a new path
                is the way to work on it.
              </p>
              <div>
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
        <div className="flex justify-center rounded-2xl border border-line bg-white p-12">
          <Spinner color="current" />
        </div>
      ) : state.status === "error" ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <p className="font-display text-2xl font-medium text-cwru-blue">{state.message}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="la-map-dots flex flex-col items-center gap-3 rounded-2xl border border-line bg-white px-6 py-12 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-cwru-blue text-white">
            <Route aria-hidden size={30} strokeWidth={1.75} />
          </span>
          <p className="font-display text-2xl font-medium text-cwru-blue">No study plans yet</p>
          <p className="max-w-md text-sm text-muted">
            A path is built from a study plan. Create one from your interview feedback, then come
            back here to generate its path.
          </p>
          <Button as={Link} href="/study-plans" color="primary">
            Create a study plan
          </Button>
        </div>
      ) : (
        <div ref={detailRef} className="min-w-0 scroll-mt-6">
          {selected ? (
            selected.path === undefined ? (
              <div className="h-96 animate-pulse rounded-2xl border border-line bg-white" />
            ) : selected.pathError ? (
              <p role="alert" className="rounded-lg border border-copper/40 bg-copper/[0.08] p-4 text-sm text-ink">
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
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function PathsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner color="current" />
        </div>
      }
    >
      <PathsHub />
    </Suspense>
  );
}
