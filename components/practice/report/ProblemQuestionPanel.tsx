/**
 * "The problem" — the question this problem interview posed and the exhibits
 * the interviewer actually put on screen, read from the report's snapshot.
 *
 * Self-nulls unless the report carries a problem snapshot, so every interview
 * report written before problem interviews existed (including old
 * `consulting` reports) renders exactly as before. Only REVEALED exhibits
 * appear: an exhibit the candidate never asked for stays unseen here too.
 */

import ExhibitView from "@/components/problem-interview/ExhibitView";
import { ChevronDown } from "lucide-react";

import type { ReportDTO } from "@/lib/report/dto";
import { asProblemSessionSnapshot } from "@/lib/problem-interview/session-state";

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ProblemQuestionPanel({ report }: { report: ReportDTO }) {
  const problem =
    report.input?.kind === "interview" ? asProblemSessionSnapshot(report.input.problem) : null;
  if (!problem) return null;

  const reveals = problem.events.flatMap((event) =>
    event.kind === "exhibit" ? [{ exhibit: event.exhibit, atSeconds: event.atSeconds }] : [],
  );
  const facts = [problem.question.family.replace(/-/g, " "), problem.question.difficulty].filter(
    Boolean,
  );

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-line bg-white p-6 sm:p-8"
      aria-labelledby="problem-question-heading"
      data-testid="problem-question-panel"
    >
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-muted">The problem</p>
        <h2
          id="problem-question-heading"
          className="font-display text-[24px] font-medium leading-[1.15] text-cwru-blue"
        >
          {problem.question.title}
        </h2>
        {facts.length ? (
          <p className="text-[13px] capitalize text-muted">{facts.join(" · ")}</p>
        ) : null}
      </div>

      <p className="max-w-[65ch] text-[15px] leading-7 text-ink">{problem.question.prompt}</p>

      {reveals.length ? (
        <details className="group rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-semibold text-cwru-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue">
            <span>
              Exhibits you saw{" "}
              <span className="font-normal text-muted">({reveals.length})</span>
            </span>
            <ChevronDown size={16} aria-hidden className="text-muted shrink-0 group-open:rotate-180 motion-safe:transition-transform" />
          </summary>
          <ol className="m-0 flex list-none flex-col gap-6 border-t border-line p-4">
            {reveals.map(({ exhibit, atSeconds }) => (
              <li key={exhibit.id} className="flex flex-col gap-2">
                <span className="font-mono text-[12.5px] text-muted">Shown at {clock(atSeconds)}</span>
                <ExhibitView exhibit={exhibit} tone="page" />
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p className="text-[13px] text-muted">No data exhibits were shown in this session.</p>
      )}

      {problem.question.source ? (
        /* Level-3 reference material. Open, this ran five lines of
           publisher citations — the tallest thing in the card — directly
           below a COLLAPSED "Exhibits you saw", so the page gave its most
           space to its least-read content. Same disclosure treatment as the
           exhibits above it, rather than a different one. */
        <details className="group rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[13px] font-semibold text-cwru-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue">
            <span>Modeled on</span>
            <ChevronDown
              size={16}
              aria-hidden
              className="text-muted shrink-0 group-open:rotate-180 motion-safe:transition-transform"
            />
          </summary>
          <p className="border-t border-line p-4 text-[12.5px] leading-5 text-muted">
            {problem.question.source}
          </p>
        </details>
      ) : null}
    </section>
  );
}
