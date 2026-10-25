"use client";

/**
 * Renders a study plan's path as a vertical skill trail (Phase 23): a
 * header with a progress ring, ONE prominent "Continue" call-to-action for
 * the next step showing the FULL stored reason, the complete step list in
 * position order (kind icon, done/next/pending state, competency level
 * badge, stored reason, an action link for every pending step), and a
 * completion state linking to Mastery once every step is done.
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
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Check,
  ListChecks,
  MessagesSquare,
  Mic,
  RotateCcw,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { LevelBadge, ProgressRing, type LevelsByCompetency } from "@/components/study-plan/PathVisuals";

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

function TrailNode({ state, kind }: { state: NodeState; kind: PathStepKind }) {
  const Icon = KIND_ICON[kind];
  if (state === "done") {
    return (
      <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1f8a5b] text-white shadow-[0_4px_0_#16683f]">
        <Check size={22} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === "next") {
    return (
      <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#0a7391]/25" aria-hidden="true" />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0a7391] text-white shadow-[0_4px_0_#075569] ring-4 ring-[#cdeaf2]">
          <Icon size={22} aria-hidden="true" />
        </span>
      </span>
    );
  }
  return (
    <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#c9dbe2] bg-white text-[#0a7391] shadow-[0_4px_0_#dce8ed]">
      <Icon size={20} aria-hidden="true" />
    </span>
  );
}

export function PathCompleteCard({ total }: { total: number }) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border-2 border-[#1f8a5b] bg-[linear-gradient(135deg,#eaf8f0,#ffffff)] p-5 text-center sm:p-7">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1f8a5b] text-white shadow-[0_6px_0_#16683f]">
        <Trophy size={30} aria-hidden="true" />
      </span>
      <p className="mt-4 font-serif text-2xl text-[#102331]">Path complete!</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#385463]">
        You finished all {total} steps. Every check and session you completed has been added to
        your mastery record.
      </p>
      <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Link
          href="/mastery"
          className="inline-flex items-center gap-2 rounded-xl bg-[#1f8a5b] px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#16683f] transition-transform active:translate-y-0.5"
        >
          <Sparkles size={16} aria-hidden="true" /> See your mastery
        </Link>
        <Link
          href="/study-plans"
          className="inline-flex items-center gap-2 rounded-xl border border-[#1f8a5b] px-5 py-2.5 text-sm font-semibold text-[#1f8a5b]"
        >
          Start a new study plan
        </Link>
      </div>
      <p className="mt-3 text-xs text-[#58727f]">
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
}: {
  planId: string;
  path: PathViewDTO;
  /** Optional per-competency levels from /api/mastery, shown as badges. */
  levels?: LevelsByCompetency | null;
  /**
   * GROWTH-SINCE-PLAN SLOT (reserved, Phase 23). A per-plan "growth since
   * this plan was generated" strip (GET /api/mastery/since-plan?planId=…,
   * owned by the mastery worktree) is rendered here, directly under the
   * header, once wired. Callers pass null/undefined until then.
   */
  growthSlot?: ReactNode;
  /** When set (e.g. /paths?competency=<key>), steps targeting this
   * competency are outlined and the first one is scrolled into view. */
  highlightCompetency?: string | null;
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

  useEffect(() => {
    if (!firstHighlightedId) return;
    document
      .getElementById(`path-step-${firstHighlightedId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [firstHighlightedId]);

  // `degradedSteps` conversion (a failed check generation becoming
  // UNAIDED_SESSION) already happened server-side at generation time,
  // before the path was ever persisted — this panel has no record of which
  // steps were originally meant to be checks, so it cannot recompute that
  // list from a saved path. The POST response's own `degradedSteps` array
  // is the only moment that information exists; a caller that wants the
  // note shown renders the separately exported `DegradedStepsNote` with
  // that count, right after this panel.

  return (
    <div className="rounded-2xl border border-[#d4e2e9] bg-white p-4 shadow-[0_8px_24px_rgba(20,58,75,0.06)] sm:p-7">
      <header className="flex items-center gap-4">
        <ProgressRing done={complete} total={total} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">
            Your improvement path
          </p>
          <h2 className="font-serif text-2xl text-[#102331]">
            {complete} of {total} complete
          </h2>
          <p className="text-sm text-[#58727f]">
            Generated {formatGeneratedAt(path.generatedAt)} — reflects your mastery at that moment,
            not necessarily right now.
          </p>
        </div>
      </header>

      {/* GROWTH-SINCE-PLAN SLOT — see the `growthSlot` prop. */}
      {growthSlot ? <div className="mt-5">{growthSlot}</div> : null}

      {allDone ? (
        <PathCompleteCard total={total} />
      ) : target ? (
        <section
          aria-current="step"
          className="mt-5 rounded-2xl border-2 border-[#0a7391] bg-[#eaf7fa] p-4 sm:p-5"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">
            Up next · {KIND_LABEL[target.step.kind]} — {target.step.competencyLabel}
          </p>
          {/* The full stored reason, untruncated, not behind a disclosure
              toggle — this IS the explainability deliverable. */}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#173847]">
            {target.reason}
          </p>
          {targetHref ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href={targetHref}
                data-testid="path-continue"
                className="inline-flex items-center gap-2 rounded-xl bg-[#0a7391] px-6 py-3 text-base font-bold text-white shadow-[0_4px_0_#075569] transition-transform active:translate-y-0.5"
              >
                Continue <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <span className="text-xs text-[#58727f]">{actionLabelForStep(target.step)}</span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#8298a3]">
              This step&apos;s exercise is still being prepared.
            </p>
          )}
        </section>
      ) : null}

      <ol className="relative mt-7">
        {orderedSteps.map((step, index) => {
          const href = hrefForStep(planId, step);
          const isActionable = step.status === "PENDING" || step.status === "IN_PROGRESS";
          const state: NodeState = isStepDone(step)
            ? "done"
            : target && target.step.id === step.id
              ? "next"
              : "pending";
          const isLast = index === orderedSteps.length - 1;
          const statusLabel = STATUS_LABEL[step.status] ?? step.status;
          const highlighted = Boolean(highlightCompetency) && step.competencyKey === highlightCompetency;
          return (
            <li key={step.id} id={`path-step-${step.id}`} className="relative flex gap-3 pb-6 last:pb-0 sm:gap-4">
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-6 top-12 -ml-[2px] h-[calc(100%-3rem)] w-1 rounded-full ${
                    state === "done" ? "bg-[#1f8a5b]" : "bg-[#dce8ed]"
                  }`}
                />
              ) : null}
              <TrailNode state={state} kind={step.kind} />
              <div
                className={`min-w-0 flex-1 rounded-xl border p-3 sm:p-4 ${
                  highlighted ? "ring-2 ring-[#e0b062] ring-offset-2 " : ""
                }${
                  state === "next"
                    ? "border-[#0a7391] bg-[#f3fafc]"
                    : state === "done"
                      ? "border-[#cfe9db] bg-[#f6fbf8]"
                      : "border-[#dce8ed] bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#58727f]">
                    Step {step.position} · {KIND_LABEL[step.kind]}
                  </span>
                  {state === "next" ? (
                    <span className="rounded-full bg-[#0a7391] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Up next
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#102331]">{step.competencyLabel}</p>
                  {levels ? <LevelBadge level={levels[step.competencyKey]?.current} /> : null}
                </div>
                {(() => {
                  const purpose = repeatedReasonPurpose(step, orderedSteps[index - 1]);
                  if (purpose === null) {
                    return (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#385463]">
                        {step.selectionReason}
                      </p>
                    );
                  }
                  return (
                    <>
                      <p className="mt-1.5 text-sm leading-6 text-[#385463]">{purpose}</p>
                      <details className="mt-1 text-xs text-[#58727f]">
                        <summary className="cursor-pointer select-none">Why this skill</summary>
                        <p className="mt-1 whitespace-pre-wrap leading-5">{step.selectionReason}</p>
                      </details>
                    </>
                  );
                })()}
                {step.proveIt ? (
                  <p className="mt-1.5 text-xs leading-5 text-[#58727f]">{step.proveIt.brief}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      state === "done" ? "text-[#1f8a5b]" : "text-[#58727f]"
                    }`}
                  >
                    {statusLabel}
                    {step.completedAt ? ` · ${formatGeneratedAt(step.completedAt)}` : ""}
                  </span>
                  {isActionable ? (
                    href ? (
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#0a7391] px-3 py-1.5 text-sm font-semibold text-[#0a7391] hover:bg-[#eaf7fa]"
                      >
                        {actionLabelForStep(step)}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="text-xs text-[#8298a3]">Preparing…</span>
                    )
                  ) : step.status === "COMPLETE" && href ? (
                    // Review, Duolingo-style: always open, never gates anything.
                    // Each destination keeps its own redo rules (a drill redo
                    // writes new evidence; a check shows its stored result).
                    <Link
                      href={href}
                      data-testid="practice-again"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#1f8a5b] hover:bg-[#eaf8f0]"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Practice again
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DegradedStepsNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="mt-3 text-xs text-[#8298a3]">
      {count} {count === 1 ? "step" : "steps"} became a plain practice session because no
      suitable moment was found for a knowledge check.
    </p>
  );
}
