/**
 * Process steps — how the candidate handled each step of the problem
 * interview's framework: Hit / Prompted / Missed / N/A, with the evidence
 * quote, its timecode, and one coaching note. The framework comes from the
 * report snapshot (pinned at session start); the results come from the
 * outcome's `processSteps`, narrowed defensively — a malformed value renders
 * every step as "Not graded", never throws. Notes arrive display-ready from
 * `buildProcessStepViews`, which strips the evaluator's internal
 * `Meets all criteria: yes.|no.` grading prefix; do not re-derive them here.
 *
 * Self-nulls without a problem snapshot, so non-problem interview reports
 * (and old `consulting` reports) are unchanged.
 *
 * Status is never color alone: every chip carries its word.
 */

import { ChevronDown } from "lucide-react";

import type { ReportDTO } from "@/lib/report/dto";
import type { ProcessStepStatus } from "@/lib/problem-interview/types";
import { asProblemSessionSnapshot } from "@/lib/problem-interview/session-state";
import { buildProcessStepViews } from "@/lib/problem-interview/outcome";

const STATUS: Record<ProcessStepStatus, { label: string; dot: string; tint: string; meaning: string }> = {
  hit: {
    label: "Hit",
    dot: "bg-level-4",
    tint: "bg-level-4/15",
    meaning: "You did this without being asked.",
  },
  prompted: {
    label: "Prompted",
    dot: "bg-level-2",
    tint: "bg-level-2/15",
    meaning: "You did this after the interviewer's nudge.",
  },
  missed: {
    label: "Missed",
    dot: "bg-copper",
    tint: "bg-copper/10",
    meaning: "This step didn't happen.",
  },
  not_applicable: {
    label: "N/A",
    dot: "border border-muted bg-transparent",
    tint: "bg-canvas",
    meaning: "The session ended before this step could come up.",
  },
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function StatusChip({ status }: { status: ProcessStepStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[12.5px] font-semibold text-ink ${s.tint}`}
      data-status={status}
    >
      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export default function ProcessStepsPanel({ report }: { report: ReportDTO }) {
  const problem =
    report.input?.kind === "interview" ? asProblemSessionSnapshot(report.input.problem) : null;
  if (!problem || problem.framework.steps.length === 0) return null;

  const steps = buildProcessStepViews(problem.framework, report.outcome?.processSteps);
  const graded = steps.filter((step) => step.result);
  const counts = (["hit", "prompted", "missed", "not_applicable"] as const)
    .map((status) => ({
      status,
      count: graded.filter((step) => step.result?.status === status).length,
    }))
    .filter(({ count, status }) => count > 0 || status !== "not_applicable");

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-line bg-white p-6 sm:p-8"
      aria-labelledby="process-steps-heading"
      data-testid="process-steps-panel"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="process-steps-heading"
          className="font-display text-[24px] font-medium leading-[1.15] text-cwru-blue"
        >
          Process steps
        </h2>
        <p className="text-[15px] leading-6 text-ink">
          Graded against the {problem.framework.label || "interview's method"}.
        </p>
        {graded.length ? (
          <p className="text-[13px] text-muted" data-testid="process-steps-summary">
            {counts.map(({ status, count }) => `${count} ${STATUS[status].label.toLowerCase()}`).join(" · ")}
          </p>
        ) : (
          <p className="text-[13px] text-muted">
            The review didn&apos;t grade the individual steps for this session.
          </p>
        )}
      </div>

      {problem.framework.source ? (
        <details className="group text-[13px] text-muted">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue">
            Why these steps
            <ChevronDown size={16} aria-hidden className="shrink-0 group-open:rotate-180 motion-safe:transition-transform" />
          </summary>
          <p className="max-w-[65ch] leading-6">{problem.framework.source}</p>
        </details>
      ) : null}

      <ol className="m-0 flex list-none flex-col p-0">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0 first:pt-0"
            data-testid={`process-step-${step.key}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-ink">
                <span className="text-muted">{index + 1}.</span> {step.label}
              </h3>
              <div className="flex items-center gap-2">
                {step.result?.timecodeSeconds != null ? (
                  <span className="font-mono text-[12.5px] text-muted">
                    {clock(step.result.timecodeSeconds)}
                  </span>
                ) : null}
                {step.result ? (
                  <StatusChip status={step.result.status} />
                ) : (
                  <span className="text-[12.5px] text-muted">Not graded</span>
                )}
              </div>
            </div>

            {step.result ? (
              <p className="sr-only">{STATUS[step.result.status].meaning}</p>
            ) : null}

            {step.result?.evidenceQuote ? (
              <blockquote className="m-0 max-w-[65ch] border-l-2 border-light-blue pl-3 font-display text-[16px] italic leading-[1.4] text-ink">
                &ldquo;{step.result.evidenceQuote}&rdquo;
              </blockquote>
            ) : null}

            {step.result?.note ? (
              <p className="max-w-[65ch] text-[15px] leading-6 text-ink">{step.result.note}</p>
            ) : null}

            {step.description ? (
              <details className="group text-[13px] text-muted">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue">
                  What this step is
                  <ChevronDown size={16} aria-hidden className="shrink-0 group-open:rotate-180 motion-safe:transition-transform" />
                </summary>
                <p className="max-w-[65ch] leading-6">{step.description}</p>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
