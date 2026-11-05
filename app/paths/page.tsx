"use client";

/**
 * `/paths` — the path hub (Phase 23). In the user's words: "the option to
 * enter the paths page and then just pick a study plan to generate a path
 * from, if it hasn't already been done for that study plan."
 *
 * Header: a labelled plan selector ("Plan 1 of 3", every saved plan with its
 * progress ring or "no path yet"; a single plan is shown as a plain label
 * because there is nothing to switch to) and the goal rings. Below: the selected plan's path map
 * (`PathPanel`) with its single Continue button, or — for a plan without a
 * path — `GeneratePathCard`, which calls the existing POST route inline. Levels and daily/weekly goals come from
 * the existing `/api/mastery` route. `?plan={id}` preselects a plan.
 *
 * Progression mechanics are limited to levels and daily/weekly goals
 * (21-CONTEXT.md, re-confirmed 2026-10-24). Every step stays reachable.
 */
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Check, ChevronDown, ChevronRight, Plus, Route } from "lucide-react";

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

/**
 * The plan selector. Titles are long sentences, so a segmented control would
 * truncate them: this is a select-style button and a listbox whose rows wrap.
 * DOM focus stays on the list and `aria-activedescendant` names the row, so
 * the arrows move one highlight shared with hover; Tab reaches "Manage study
 * plans", which is a link and not an option. Focus moves in script here, and
 * browsers disagree on `:focus-visible` for that, so the ring follows the last
 * input explicitly: a press hides it, a key or leaving the control restores it.
 */
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [showRing, setShowRing] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const baseId = useId();
  const selectedIndex = items.findIndex((i) => i.plan.id === selectedId);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  function openMenu() {
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function choose(index: number) {
    onSelect(items[index].plan.id);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    // Pointer-down, not click: it also closes for presses on things that
    // swallow the click, and a press outside keeps whatever it focused.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShowRing(true);
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on the stable baseId.
  }, [open, activeIndex]);

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const last = items.length - 1;
    if (event.key === "ArrowDown") setActiveIndex((i) => (i >= last ? 0 : i + 1));
    else if (event.key === "ArrowUp") setActiveIndex((i) => (i <= 0 ? last : i - 1));
    else if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(last);
    else if (event.key === "Enter" || event.key === " ") choose(activeIndex);
    else return;
    event.preventDefault();
  }

  // One plan: nothing to switch to, so no control pretending otherwise.
  if (items.length === 1) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-[13px] font-semibold leading-[1.3] text-muted">Your study plan</p>
        <p className="text-[15px] font-semibold leading-snug text-ink">{items[0].plan.title}</p>
        <Link className="flex min-h-6 w-fit items-center gap-1 text-[13px] font-semibold text-link hover:underline" href="/study-plans">
          Manage study plans <ChevronRight aria-hidden size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative w-full max-w-[560px]"
      onBlur={(event) => {
        // Tabbing past the last control closes it; a null target is a press
        // on nothing focusable, which the pointer-down handler already judged.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
          setShowRing(true);
        }
      }}
      onKeyDown={() => setShowRing(true)}
      onPointerDown={() => setShowRing(false)}
    >
      <button
        ref={triggerRef}
        aria-controls={open ? `${baseId}-list` : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left transition-colors duration-150 hover:border-true-blue motion-reduce:transition-none ${
          open ? "border-true-blue" : "border-line"
        } ${showRing ? "" : "outline-none"}`}
        type="button"
        onClick={() => {
          if (!open) return openMenu();
          setOpen(false);
          triggerRef.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-semibold leading-[1.3] text-muted">
            {selectedIndex >= 0 ? `Plan ${selectedIndex + 1} of ${items.length}` : `${items.length} study plans`}
          </span>
          <span className="text-[15px] font-semibold leading-snug text-ink">
            {selectedIndex >= 0 ? items[selectedIndex].plan.title : "Choose a study plan"}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`shrink-0 text-true-blue transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          size={20}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 flex max-h-[60vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-raised">
          <ul
            ref={listRef}
            aria-activedescendant={optionId(activeIndex)}
            aria-label="Choose a study plan"
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5 outline-none"
            id={`${baseId}-list`}
            role="listbox"
            tabIndex={0}
            onKeyDown={onListKeyDown}
          >
            {items.map((item, index) => {
              const total = item.path ? item.path.steps.length : 0;
              const done = item.path ? item.path.steps.filter(isStepDone).length : 0;
              const on = index === selectedIndex;
              const active = index === activeIndex;
              return (
                <li
                  key={item.plan.id}
                  aria-selected={on}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 text-left ${
                    on ? "bg-light-blue/32" : active ? "bg-canvas" : ""
                  } ${active && showRing ? "ring-2 ring-inset ring-true-blue" : ""}`}
                  id={optionId(index)}
                  role="option"
                  onClick={() => choose(index)}
                  onMouseMove={() => setActiveIndex(index)}
                >
                  {item.path ? (
                    <ProgressRing done={done} size={44} stroke={4} total={total} />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-dashed border-light-blue text-cwru-blue">
                      <Plus aria-hidden size={16} />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold leading-snug text-ink">{item.plan.title}</span>
                    <span className="text-xs text-muted">{planProgressLabel(item)}</span>
                    {pathTargets(item, focusCompetency) ? (
                      <span className="mt-1 w-fit rounded-full bg-level-2/16 px-2 py-0.5 text-[11px] font-semibold text-ink">
                        Works on the skill you picked
                      </span>
                    ) : null}
                  </span>
                  {on ? <Check aria-hidden className="shrink-0 text-true-blue" size={18} strokeWidth={2.5} /> : null}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line p-1.5">
            <Link className="flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-link hover:bg-canvas" href="/study-plans">
              Manage study plans <ChevronRight aria-hidden size={14} />
            </Link>
          </div>
        </div>
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
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
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
