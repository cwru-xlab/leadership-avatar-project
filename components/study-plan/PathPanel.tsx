"use client";

/**
 * Renders a study plan's path as a winding map of steps (Phase 23): a
 * progress ring, the steps in position order as icon nodes (done / next /
 * pending), and selecting a node opens its card in place (competency level
 * badge, stored reason, an action link for every pending step). The side
 * rail holds ONE prominent "Continue" call-to-action for the next step
 * showing the FULL stored reason, the skills the path works on with their
 * levels, and a completion state linking to Mastery once every step is done.
 *
 * NO SELECTION AND NO REASON GENERATION HAPPEN HERE. Every `selectionReason`
 * rendered below is the STORED string the server sent — this component only
 * displays it, never recomputes or rephrases it (REQ-118's explainability
 * guarantee only holds if the shown reason is the one that actually drove
 * selection, not a client-side gloss on it). The "next" step is exactly the
 * one the server named in `path.nextStep` (nextStepFor resumes an
 * IN_PROGRESS step before a PENDING one) — the view adds no fallback.
 *
 * NO SEQUENTIAL GATING. 21-CONTEXT.md rules out gating-by-prior-step
 * mechanics — every pending step below gets an action link regardless of
 * position, with no inactive styling and no padlock-style icon on a later
 * step. A "come back once you finish step 1" affordance IS that same gating
 * under a different name, so it is deliberately absent here, not an
 * oversight. (21-17's forbidden-identifier scan of this directory checks for
 * this literally; this file is why it must stay clean.) Levels and
 * daily/weekly goals are the only progression mechanics shown; there is no
 * day-chain counter.
 *
 * LINK CONTRACTS (fixed, owned by 21-22/21-24 — do not improvise a shape
 * here):
 *   KNOWLEDGE_CHECK  -> /study-plans/{planId}/checks/{knowledgeCheckId}
 *   COACHED_SESSION  -> /study-plans/{planId}/coached/{stepId}  (step id,
 *     not session id — the session may not exist yet; 21-23's route
 *     creates it on entry)
 *   VOICE_DRILL      -> /study-plans/{planId}/drills/{stepId}  (Phase 23;
 *     step id, like coached — the drill brief is resolved from the step)
 *   UNAIDED_SESSION  -> the server's `proveIt.href` for the path's FINAL
 *     step (Phase 23: `/practice/{slug}[/{instanceId}]?fromPlan=&step=`, the
 *     plan's source practice type pre-filled); otherwise
 *     /practice/{practiceSlug}, the existing practice entry
 *
 * SECOND LINE OF DEFENCE against the PLACEHOLDER_KNOWLEDGE_CHECK_ID hazard
 * (lib/study-plan/next-step.ts): a KNOWLEDGE_CHECK step whose
 * `knowledgeCheckId` is missing or still the placeholder renders NO action
 * link at all, rather than a dead `/checks/__PENDING_GENERATION__` link. The
 * server-side generation route (app/api/study-plans/[planId]/path/route.ts)
 * is the first line — this is only a backstop.
 */
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Check,
  ListChecks,
  MessagesSquare,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import {
  LevelBadge,
  ProgressRing,
  SkillLevelRow,
  type LevelsByCompetency,
} from "@/components/study-plan/PathVisuals";
import RebuildPathNotice from "@/components/study-plan/RebuildPathNotice";

const PLACEHOLDER_KNOWLEDGE_CHECK_ID = "__PENDING_GENERATION__";

export type PathStepKind = "KNOWLEDGE_CHECK" | "COACHED_SESSION" | "UNAIDED_SESSION" | "VOICE_DRILL";

export interface PathStepViewDTO {
  id: string;
  position: number;
  kind: PathStepKind;
  competencyKey: string;
  competencyLabel: string;
  selectionReason: string;
  status: string;
  completedAt: string | null;
  knowledgeCheckId: string | null;
  coachedSessionId: string | null;
  practiceSlug: string | null;
  check: { format: string; prompt: string; hasAttempt: boolean } | null;
  coachedPhase: "NOT_STARTED" | "REPLAY" | "FRESH" | "COMPLETE" | null;
  /** VOICE_DRILL only (Phase 23): counts, never a score. */
  drill?: { hasBrief: boolean; attemptCount: number; completedAttemptCount: number } | null;
  /** Final UNAIDED_SESSION only (Phase 23): the pre-filled practice entry. */
  proveIt?: { href: string; brief: string; typeLabel: string; linked: boolean } | null;
}

export interface PathViewDTO {
  id: string;
  generatedAt: string;
  steps: PathStepViewDTO[];
  nextStep: { stepId: string; reason: string } | null;
  /** Legacy-shaped and never started: may be rebuilt (RebuildPathNotice). */
  rebuildable?: boolean;
}

export const KIND_LABEL: Record<PathStepKind, string> = {
  KNOWLEDGE_CHECK: "Knowledge check",
  COACHED_SESSION: "Coached practice",
  UNAIDED_SESSION: "Practice session",
  VOICE_DRILL: "Voice drill",
};

export const KIND_ICON: Record<PathStepKind, LucideIcon> = {
  KNOWLEDGE_CHECK: ListChecks,
  COACHED_SESSION: MessagesSquare,
  UNAIDED_SESSION: Mic,
  VOICE_DRILL: AudioLines,
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
  SKIPPED: "Skipped",
};

function formatGeneratedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function isStepDone(step: PathStepViewDTO): boolean {
  return step.status === "COMPLETE" || step.status === "SKIPPED";
}

/** Builds the fixed-contract href for a pending step, or null when no
 * destination can be resolved — the hazard backstop lives here. Exported so
 * the coached session's summary links to the next step through this same
 * contract instead of a copy of it. */
export function hrefForStep(planId: string, step: PathStepViewDTO): string | null {
  if (step.kind === "KNOWLEDGE_CHECK") {
    if (!step.knowledgeCheckId || step.knowledgeCheckId === PLACEHOLDER_KNOWLEDGE_CHECK_ID) {
      return null;
    }
    return `/study-plans/${planId}/checks/${step.knowledgeCheckId}`;
  }
  if (step.kind === "COACHED_SESSION") {
    return `/study-plans/${planId}/coached/${step.id}`;
  }
  if (step.kind === "VOICE_DRILL") {
    return `/study-plans/${planId}/drills/${step.id}`;
  }
  // UNAIDED_SESSION — the prove-it step's pre-filled entry when the server
  // resolved one; otherwise the plain practice entry (unchanged behaviour).
  if (step.proveIt?.href) return step.proveIt.href;
  if (!step.practiceSlug) return null;
  return `/practice/${step.practiceSlug}`;
}

export function actionLabelForStep(step: PathStepViewDTO): string {
  if (step.kind === "KNOWLEDGE_CHECK") {
    return step.check?.hasAttempt ? "Review this check" : "Take this check";
  }
  if (step.kind === "COACHED_SESSION") {
    if (step.coachedPhase === "NOT_STARTED") return "Start coached practice";
    if (step.coachedPhase === "COMPLETE") return "Review coached practice";
    return "Continue coached practice";
  }
  if (step.kind === "VOICE_DRILL") {
    return step.drill && step.drill.completedAttemptCount > 0 ? "Redo voice drill" : "Start voice drill";
  }
  if (step.proveIt) return step.proveIt.linked ? "Prove it again" : "Prove it";
  return "Go practice";
}

/** The step the single Continue button points at — the server's
 * `nextStep`, with its stored reason. No client-side fallback. */
export function continueTargetFor(
  path: PathViewDTO,
): { step: PathStepViewDTO; reason: string } | null {
  if (!path.nextStep) return null;
  const row = path.steps.find((s) => s.id === path.nextStep!.stepId);
  return row ? { step: row, reason: path.nextStep.reason } : null;
}

type NodeState = "done" | "next" | "pending";

/**
 * When a step follows another on the same competency, their stored reasons
 * share the same "why this skill" sentences and differ only in the closing
 * "what this step does" sentence. Returns that differing tail so the trail
 * does not repeat the paragraph; the full stored reason stays one click away.
 * Null means: render the stored reason as-is.
 */
export function repeatedReasonPurpose(
  step: PathStepViewDTO,
  previous: PathStepViewDTO | undefined,
): string | null {
  if (!previous || previous.competencyKey !== step.competencyKey) return null;
  const sentences = (text: string) => text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];
  const mine = sentences(step.selectionReason);
  const theirs = sentences(previous.selectionReason);
  let shared = 0;
  while (shared < mine.length && shared < theirs.length && mine[shared].trim() === theirs[shared].trim()) {
    shared += 1;
  }
  if (shared === 0 || shared === mine.length) return null;
  return mine.slice(shared).join("").trim();
}

/** Horizontal offsets for the winding map, in steps of the wave unit. */
const WAVE = [0, 1, 1.6, 1, 0, -1, -1.6, -1];

function nodeIcon(step: PathStepViewDTO): LucideIcon {
  return step.proveIt ? Trophy : KIND_ICON[step.kind];
}

function MapNode({
  step,
  state,
  selected,
  highlighted,
  onSelect,
}: {
  step: PathStepViewDTO;
  state: NodeState;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
}) {
  const Icon = nodeIcon(step);
  const big = state === "next" || Boolean(step.proveIt);
  return (
    <button
      aria-expanded={selected}
      aria-label={`Step ${step.position}: ${KIND_LABEL[step.kind]}, ${step.competencyLabel}${
        state === "done" ? ", complete" : state === "next" ? ", up next" : ""
      }`}
      className={clsx(
        "relative grid shrink-0 place-items-center rounded-full transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-true-blue",
        big ? "size-[84px]" : "size-[68px]",
        state === "done" && "bg-level-4 text-white shadow-[0_6px_0_var(--la-level-4-deep)]",
        state === "next" &&
          "bg-cwru-blue text-white shadow-[0_0_0_8px_rgb(166_210_230/0.55),0_6px_0_var(--la-dark-blue)]",
        state === "pending" &&
          "border-2 border-light-blue bg-white text-cwru-blue shadow-[0_6px_0_rgb(166_210_230/0.8)]",
        selected && state !== "next" && "ring-4 ring-true-blue/40 ring-offset-2",
        highlighted && "outline-dashed outline-2 outline-offset-4 outline-level-2",
      )}
      type="button"
      onClick={onSelect}
    >
      {state === "done" ? (
        <>
          <Check aria-hidden size={30} strokeWidth={3} />
          <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-white text-level-4 shadow-sm">
            <Icon aria-hidden size={13} strokeWidth={2} />
          </span>
        </>
      ) : (
        <Icon aria-hidden size={big ? 36 : 28} strokeWidth={1.75} />
      )}
    </button>
  );
}

export function PathCompleteCard({ total }: { total: number }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl bg-level-4 p-6 text-center text-white">
      <span className="grid size-16 place-items-center rounded-full bg-white text-level-4 shadow-[0_6px_0_rgb(0_0_0/0.15)]">
        <Trophy aria-hidden size={30} />
      </span>
      <p className="font-display text-2xl font-medium">Path complete</p>
      <p className="max-w-md text-sm leading-6 text-white/90">
        You finished all {total} steps. Every check and session you completed has been added to
        your mastery record.
      </p>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <Link
          href="/mastery"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-level-4"
        >
          <Sparkles size={16} aria-hidden="true" /> See your mastery
        </Link>
        <Link href="/study-plans" className="inline-flex h-11 items-center px-3 text-sm font-semibold text-white underline">
          Start a new study plan
        </Link>
      </div>
      <p className="text-xs text-white/80">
        A new study plan creates a new path — this one stays here as a record.
      </p>
    </section>
  );
}

export default function PathPanel({
  planId,
  path,
  levels,
  growthSlot,
  highlightCompetency,
  onRebuilt,
}: {
  planId: string;
  path: PathViewDTO;
  /** Optional per-competency levels from /api/mastery, shown as badges. */
  levels?: LevelsByCompetency | null;
  /**
   * GROWTH-SINCE-PLAN SLOT (Phase 23). The per-plan "growth since this plan
   * was generated" strip (GET /api/mastery/since-plan?planId=…) renders in
   * the side rail.
   */
  growthSlot?: ReactNode;
  /** When set (e.g. /paths?competency=<key>), steps targeting this
   * competency are outlined and the first one is selected and scrolled to. */
  highlightCompetency?: string | null;
  /** Receives the fresh path when the student rebuilds a legacy one. */
  onRebuilt?: (path: PathViewDTO, degradedStepCount: number) => void;
}) {
  const total = path.steps.length;
  const complete = path.steps.filter(isStepDone).length;
  const target = continueTargetFor(path);
  const allDone = total > 0 && complete >= total;
  const targetHref = target ? hrefForStep(planId, target.step) : null;

  const orderedSteps = path.steps.slice().sort((a, b) => a.position - b.position);
  const firstHighlighted = highlightCompetency
    ? orderedSteps.find((s) => s.competencyKey === highlightCompetency) ?? null
    : null;
  const firstHighlightedId = firstHighlighted?.id ?? null;

  // Nothing opens by default: the rail's Up next card already explains the
  // next step, so an open card on the same node would say it twice. A
  // competency handed in from mastery still opens its first step.
  const [selectedId, setSelectedId] = useState<string | null>(firstHighlightedId);

  useEffect(() => {
    if (!firstHighlightedId) return;
    setSelectedId(firstHighlightedId);
    document
      .getElementById(`path-step-${firstHighlightedId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [firstHighlightedId]);

  // Skills this path works on, in the order they first appear.
  const skills = orderedSteps.filter(
    (step, index) => orderedSteps.findIndex((s) => s.competencyKey === step.competencyKey) === index,
  );

  // `degradedSteps` conversion (a failed check generation becoming
  // UNAIDED_SESSION) already happened server-side at generation time,
  // before the path was ever persisted — this panel has no record of which
  // steps were originally meant to be checks, so it cannot recompute that
  // list from a saved path. The POST response's own `degradedSteps` array
  // is the only moment that information exists; a caller that wants the
  // note shown renders the separately exported `DegradedStepsNote` with
  // that count, right after this panel.

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section
        aria-label="Path map"
        className="la-map-dots relative overflow-hidden rounded-2xl border border-line bg-white px-4 pb-10 pt-5 sm:px-6"
      >
        <header className="flex items-center gap-3">
          <ProgressRing done={complete} size={48} stroke={5} total={total} />
          <div className="flex min-w-0 flex-col">
            <p className="text-[15px] font-bold text-ink">
              {complete} of {total} steps complete
            </p>
            <p className="text-xs text-muted">
              Generated {formatGeneratedAt(path.generatedAt)}, from your mastery at that moment.
            </p>
          </div>
        </header>

        <ol className="mt-8 flex flex-col items-center gap-6">
          {orderedSteps.map((step, index) => {
            const href = hrefForStep(planId, step);
            const isActionable = step.status === "PENDING" || step.status === "IN_PROGRESS";
            const state: NodeState = isStepDone(step)
              ? "done"
              : target && target.step.id === step.id
                ? "next"
                : "pending";
            const statusLabel = STATUS_LABEL[step.status] ?? step.status;
            const highlighted = Boolean(highlightCompetency) && step.competencyKey === highlightCompetency;
            const selected = selectedId === step.id;
            const wave = WAVE[index % WAVE.length];
            const purpose = repeatedReasonPurpose(step, orderedSteps[index - 1]);
            return (
              <li
                key={step.id}
                id={`path-step-${step.id}`}
                className="flex w-full scroll-mt-24 flex-col items-center gap-3"
              >
                <div
                  className={clsx(
                    "flex items-center gap-4 [transform:translateX(calc(var(--wave)*18px))] md:[transform:translateX(calc(var(--wave)*88px))]",
                    wave > 0 && "md:flex-row-reverse",
                  )}
                  style={{ "--wave": wave } as React.CSSProperties}
                >
                  <MapNode
                    highlighted={highlighted}
                    selected={selected}
                    state={state}
                    step={step}
                    onSelect={() => setSelectedId(selected ? null : step.id)}
                  />
                  <span className={clsx("flex w-36 flex-col md:w-40", wave > 0 && "md:items-end md:text-right")}>
                    <span className="text-xs text-muted">
                      Step {step.position} · {step.proveIt ? "Prove it" : KIND_LABEL[step.kind]}
                    </span>
                    <span className={clsx("text-sm font-bold leading-snug", state === "pending" ? "text-ink" : "text-cwru-blue")}>
                      {step.competencyLabel}
                    </span>
                    {state === "done" && (
                      <span className="text-xs font-semibold text-level-4">
                        Done{step.completedAt ? ` · ${formatGeneratedAt(step.completedAt)}` : ""}
                      </span>
                    )}
                    {state === "next" && <span className="text-xs font-semibold text-link">Up next</span>}
                  </span>
                </div>

                {selected && (
                  <div className="w-full max-w-md rounded-xl border border-line bg-white p-4 shadow-raised">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-bold text-ink">{step.competencyLabel}</p>
                      {levels ? <LevelBadge level={levels[step.competencyKey]?.current} /> : null}
                    </div>
                    {purpose === null ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{step.selectionReason}</p>
                    ) : (
                      <>
                        <p className="mt-2 text-sm leading-6 text-ink">{purpose}</p>
                        <details className="mt-1 text-xs text-muted">
                          <summary className="cursor-pointer select-none font-semibold text-link">Why this skill</summary>
                          <p className="mt-1 whitespace-pre-wrap leading-5">{step.selectionReason}</p>
                        </details>
                      </>
                    )}
                    {step.proveIt ? <p className="mt-2 text-xs leading-5 text-muted">{step.proveIt.brief}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className={clsx("text-xs font-semibold", state === "done" ? "text-level-4" : "text-muted")}>
                        {statusLabel}
                        {step.completedAt ? ` · ${formatGeneratedAt(step.completedAt)}` : ""}
                      </span>
                      {isActionable ? (
                        href ? (
                          <Link
                            href={href}
                            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cwru-blue px-3.5 text-sm font-semibold text-cwru-blue hover:bg-canvas"
                          >
                            {actionLabelForStep(step)}
                            <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted">Preparing…</span>
                        )
                      ) : step.status === "COMPLETE" && href ? (
                        // Review, Duolingo-style: always open, never gates anything.
                        // Each destination keeps its own redo rules (a drill redo
                        // writes new evidence; a check shows its stored result).
                        <Link
                          href={href}
                          data-testid="practice-again"
                          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-level-4 hover:bg-canvas"
                        >
                          <RotateCcw size={14} aria-hidden="true" />
                          Practice again
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-0">
        {path.rebuildable && onRebuilt ? <RebuildPathNotice planId={planId} onRebuilt={onRebuilt} /> : null}

        {allDone ? (
          <PathCompleteCard total={total} />
        ) : target ? (
          <section
            aria-current="step"
            className="relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-cwru-blue p-5 text-white"
          >
            {(() => {
              const Icon = nodeIcon(target.step);
              return <Icon aria-hidden className="absolute -right-6 -top-6 text-white/10" size={140} strokeWidth={1.5} />;
            })()}
            <p className="relative text-[13px] text-light-blue">
              Up next · Step {target.step.position} of {total}
            </p>
            <p className="relative font-display text-2xl font-medium leading-tight">
              {target.step.proveIt ? "Prove it" : KIND_LABEL[target.step.kind]}: {target.step.competencyLabel}
            </p>
            {/* The full stored reason, untruncated, not behind a disclosure
                toggle — this IS the explainability deliverable. */}
            <p className="relative whitespace-pre-wrap text-sm leading-6 text-white/85">{target.reason}</p>
            {targetHref ? (
              <Link
                href={targetHref}
                data-testid="path-continue"
                className="relative mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-cwru-blue shadow-[0_4px_0_rgb(166_210_230/0.8)] transition-transform active:translate-y-0.5"
              >
                Continue <Play size={16} strokeWidth={2.5} aria-hidden="true" />
              </Link>
            ) : (
              <p className="relative text-sm text-light-blue">This step&apos;s exercise is still being prepared.</p>
            )}
          </section>
        ) : null}

        {/* GROWTH-SINCE-PLAN SLOT — see the `growthSlot` prop. */}
        {growthSlot ? <div>{growthSlot}</div> : null}

        {skills.length > 0 && (
          <section className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-4">
            <h2 className="font-display text-xl font-medium text-cwru-blue">Skills on this path</h2>
            {skills.map((step) => (
              <SkillLevelRow
                key={step.competencyKey}
                competencyKey={step.competencyKey}
                label={step.competencyLabel}
                level={levels?.[step.competencyKey]?.current}
              />
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}

export function DegradedStepsNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="mt-3 text-xs text-muted">
      {count} {count === 1 ? "step" : "steps"} became a plain practice session because no
      suitable moment was found for a knowledge check.
    </p>
  );
}
