"use client";

/**
 * Renders a study plan's path: header (step count + generation date), a
 * distinct next-step block showing the FULL stored reason, the complete
 * step list in position order with an action link for every pending step,
 * and a degraded-steps note when one is present.
 *
 * NO SELECTION AND NO REASON GENERATION HAPPEN HERE. Every `selectionReason`
 * rendered below is the STORED string the server sent — this component only
 * displays it, never recomputes or rephrases it (REQ-118's explainability
 * guarantee only holds if the shown reason is the one that actually drove
 * selection, not a client-side gloss on it).
 *
 * NO SEQUENTIAL GATING. 21-CONTEXT.md rules out gating-by-prior-step
 * mechanics for this phase — every pending step below gets an action link
 * regardless of position, with no inactive styling and no padlock-style icon
 * on a later step. A "come back once you finish step 1" affordance IS that
 * same gating under a different name, so it is deliberately absent here,
 * not an oversight. (21-17's forbidden-identifier scan of this directory
 * checks for this literally; this file is why it must stay clean.)
 *
 * LINK CONTRACTS (fixed, owned by 21-22/21-24 — do not improvise a shape
 * here):
 *   KNOWLEDGE_CHECK  -> /study-plans/{planId}/checks/{knowledgeCheckId}
 *   COACHED_SESSION  -> /study-plans/{planId}/coached/{stepId}  (step id,
 *     not session id — the session may not exist yet; 21-23's route
 *     creates it on entry)
 *   UNAIDED_SESSION  -> /practice/{practiceSlug}  (the existing practice
 *     entry for the competency's derived underlying interaction type, sent
 *     by the server as `practiceSlug`)
 *
 * SECOND LINE OF DEFENCE against the PLACEHOLDER_KNOWLEDGE_CHECK_ID hazard
 * (lib/study-plan/next-step.ts): a KNOWLEDGE_CHECK step whose
 * `knowledgeCheckId` is missing or still the placeholder renders NO action
 * link at all, rather than a dead `/checks/__PENDING_GENERATION__` link. The
 * server-side generation route (app/api/study-plans/[planId]/path/route.ts)
 * is the first line — this is only a backstop.
 */
import Link from "next/link";

const PLACEHOLDER_KNOWLEDGE_CHECK_ID = "__PENDING_GENERATION__";

export type PathStepKind = "KNOWLEDGE_CHECK" | "COACHED_SESSION" | "UNAIDED_SESSION";

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
}

export interface PathViewDTO {
  id: string;
  generatedAt: string;
  steps: PathStepViewDTO[];
  nextStep: { stepId: string; reason: string } | null;
}

const KIND_LABEL: Record<PathStepKind, string> = {
  KNOWLEDGE_CHECK: "Knowledge check",
  COACHED_SESSION: "Coached practice",
  UNAIDED_SESSION: "Practice session",
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
  // UNAIDED_SESSION
  if (!step.practiceSlug) return null;
  return `/practice/${step.practiceSlug}`;
}

function actionLabelForStep(step: PathStepViewDTO): string {
  if (step.kind === "KNOWLEDGE_CHECK") {
    return step.check?.hasAttempt ? "Review this check" : "Take this check";
  }
  if (step.kind === "COACHED_SESSION") {
    if (step.coachedPhase === "NOT_STARTED") return "Start coached practice";
    if (step.coachedPhase === "COMPLETE") return "Review coached practice";
    return "Continue coached practice";
  }
  return "Go practice";
}

function StepStatusText({ step }: { step: PathStepViewDTO }) {
  const label = STATUS_LABEL[step.status] ?? step.status;
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-[#58727f]">
      {label}
      {step.completedAt ? ` · ${formatGeneratedAt(step.completedAt)}` : ""}
    </span>
  );
}

export default function PathPanel({ planId, path }: { planId: string; path: PathViewDTO }) {
  const total = path.steps.length;
  const complete = path.steps.filter((s) => s.status === "COMPLETE").length;
  const nextStepRow = path.nextStep
    ? path.steps.find((s) => s.id === path.nextStep!.stepId) ?? null
    : null;

  const orderedSteps = path.steps.slice().sort((a, b) => a.position - b.position);

  // `degradedSteps` conversion (a failed check generation becoming
  // UNAIDED_SESSION) already happened server-side at generation time,
  // before the path was ever persisted — this panel has no record of which
  // steps were originally meant to be checks, so it cannot recompute that
  // list from a saved path. The POST response's own `degradedSteps` array
  // is the only moment that information exists; a caller that wants the
  // note shown renders the separately exported `DegradedStepsNote` with
  // that count, right after this panel.

  return (
    <div className="rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(20,58,75,0.06)] sm:p-7">
      <header className="flex flex-col gap-1">
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
      </header>

      <section
        aria-current={nextStepRow ? "step" : undefined}
        className="mt-5 rounded-xl border-2 border-[#0a7391] bg-[#eaf7fa] p-4 sm:p-5"
      >
        {nextStepRow && path.nextStep ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">
              Next: {KIND_LABEL[nextStepRow.kind]} — {nextStepRow.competencyLabel}
            </p>
            {/* The full stored reason, untruncated, not behind a disclosure
                toggle — this IS the explainability deliverable. */}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#173847]">
              {path.nextStep.reason}
            </p>
            {(() => {
              const href = hrefForStep(planId, nextStepRow);
              return href ? (
                <Link
                  href={href}
                  className="mt-3 inline-block rounded-lg bg-[#0a7391] px-4 py-2 text-sm font-semibold text-white"
                >
                  {actionLabelForStep(nextStepRow)}
                </Link>
              ) : (
                <p className="mt-3 text-sm text-[#8298a3]">
                  This step&apos;s exercise is still being prepared.
                </p>
              );
            })()}
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[#102331]">
              You&apos;ve completed every step in this path.
            </p>
            <p className="mt-1 text-sm text-[#58727f]">
              Generating a new study plan creates a new path — this one does not refresh in
              place.
            </p>
          </>
        )}
      </section>

      <ol className="mt-6 space-y-3">
        {orderedSteps.map((step) => {
          const href = hrefForStep(planId, step);
          const isActionable = step.status === "PENDING" || step.status === "IN_PROGRESS";
          return (
            <li
              key={step.id}
              className="flex flex-col gap-2 rounded-xl border border-[#dce8ed] p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#102331]">
                  {step.position}. {KIND_LABEL[step.kind]} — {step.competencyLabel}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#385463]">
                  {step.selectionReason}
                </p>
                <div className="mt-2">
                  <StepStatusText step={step} />
                </div>
              </div>
              <div className="shrink-0">
                {isActionable ? (
                  href ? (
                    <Link
                      href={href}
                      className="inline-block rounded-lg border border-[#0a7391] px-3 py-1.5 text-sm font-semibold text-[#0a7391]"
                    >
                      {actionLabelForStep(step)}
                    </Link>
                  ) : (
                    <span className="text-xs text-[#8298a3]">Preparing…</span>
                  )
                ) : null}
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
