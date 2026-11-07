/**
 * Report panels for questioned-persona sessions (clinical communication,
 * motivational interviewing):
 *
 * - `PersonaDisclaimerBanner` — practice-only notice (above the scores).
 * - `PersonaCountsPanel` — behavior counts and derived ratios against the
 *   published thresholds (MITI) or labelled practice targets (clinical),
 *   plus every coded utterance. Every number traces to the stored tags.
 * - `PersonaChecklistPanel` — the checklist step by step with verbatim
 *   evidence quotes, the hidden facts elicited, cue handling and ICE.
 *
 * Reports prefer more content: nothing is condensed. Long lists sit in
 * expandable sections so the page still opens on the headline numbers.
 */

import type { ReactNode } from "react";

import type { ReportDTO } from "@/lib/report/dto";
import { formatTimecode } from "@/lib/metrics/bands";
import { disclaimerFor } from "@/lib/questioned-persona/copy";
import {
  asPersonaAnalysis,
  CODE_LABELS,
  frameworkFor,
  mitiSummaryGlobals,
  stepTally,
} from "@/lib/questioned-persona/report";
import type { DerivedMetric, ThresholdBand } from "@/lib/questioned-persona/types";

const BAND_STYLE: Record<ThresholdBand, { label: string; className: string }> = {
  good: { label: "Meets good", className: "bg-light-blue/40 text-cwru-blue" },
  fair: { label: "Meets fair", className: "bg-canvas text-ink border border-line" },
  below: { label: "Below fair", className: "bg-copper/[0.12] text-copper-deep" },
};

function formatValue(m: { value: number | null; format: DerivedMetric["format"] }): string {
  if (m.value === null) return "—";
  if (m.format === "percent") return `${m.value}%`;
  if (m.format === "ratio") return `${m.value.toFixed(2)} : 1`;
  return String(m.value);
}

function formatThreshold(m: DerivedMetric): string | null {
  if (!m.threshold) return null;
  const f = (n: number) =>
    m.format === "percent" ? `${n}%` : m.format === "ratio" ? `${n}:1` : String(n);
  return `Fair ≥ ${f(m.threshold.fair)} · Good ≥ ${f(m.threshold.good)}`;
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <section className="rounded-xl border border-line bg-white px-5 py-5" data-testid={testId}>
      <h2 className="font-display text-xl font-medium text-cwru-blue">{title}</h2>
      {children}
    </section>
  );
}

export function PersonaDisclaimerBanner({ report }: { report: ReportDTO }) {
  const analysis = asPersonaAnalysis(report.outcome);
  const style =
    analysis?.style ??
    (report.input?.kind === "difficult-conversation" ? report.input.personaStyle : undefined);
  if (!style) return null;
  return (
    <p
      className="rounded-xl border border-copper/40 bg-copper/[0.08] px-5 py-3 text-sm leading-6 text-ink"
      data-testid="persona-report-disclaimer"
      role="note"
    >
      {disclaimerFor(style)}
    </p>
  );
}

export function PersonaCountsPanel({ report }: { report: ReportDTO }) {
  const analysis = asPersonaAnalysis(report.outcome);
  if (!analysis) return null;
  const mi = analysis.style === "motivational-interviewing";
  const codeKeys = Object.keys(CODE_LABELS).filter((k) => k in analysis.counts);
  const globals = mi ? mitiSummaryGlobals(report.scores) : [];
  const sources = [...new Set(analysis.metrics.map((m) => m.threshold?.source).filter(Boolean))] as string[];

  return (
    <Section title={mi ? "MITI behavior counts" : "Communication behavior counts"} testId="persona-counts-panel">
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        Every one of your {analysis.counts.student_utterances ?? analysis.utterances.length} turns was coded
        {mi ? " with MITI 4.2.1 behavior codes" : " for question type, reflections, empathy and jargon"}. The
        numbers below are counted from those codes, not estimated.
      </p>

      {mi ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="persona-miti-globals">
          {globals.map((g) => {
            const band: ThresholdBand | undefined =
              g.value === null ? undefined : g.value >= g.good ? "good" : g.value >= g.fair ? "fair" : "below";
            return (
              <div key={g.key} className="rounded-lg border border-line p-4">
                <p className="text-xs font-semibold text-muted">{g.label}</p>
                <p className="mt-1 font-display text-2xl font-medium text-ink">{g.value ?? "—"}</p>
                <p className="mt-1 text-xs text-muted">
                  {g.formula}. Fair ≥ {g.fair} · Good ≥ {g.good}
                </p>
                {band ? (
                  <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[band].className}`}>
                    {BAND_STYLE[band].label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="persona-metrics">
        {analysis.metrics.map((m) => (
          <li key={m.key} className="flex flex-col gap-1 rounded-lg border border-line p-4" data-testid={`persona-metric-${m.key}`}>
            <p className="text-xs font-semibold text-muted">{m.label}</p>
            <p className="font-display text-2xl font-medium text-ink">{formatValue(m)}</p>
            {formatThreshold(m) ? <p className="text-xs text-muted">{formatThreshold(m)}</p> : null}
            {m.band ? (
              <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[m.band].className}`}>
                {BAND_STYLE[m.band].label}
              </span>
            ) : null}
            <p className="text-sm leading-6 text-ink">{m.note}</p>
          </li>
        ))}
      </ul>

      <details className="mt-4 rounded-lg border border-line px-4 py-3" open>
        <summary className="cursor-pointer text-sm font-semibold text-cwru-blue">Every behavior count</summary>
        <table className="mt-3 w-full text-sm" data-testid="persona-count-table">
          <tbody>
            {codeKeys.map((k) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-1.5 text-ink">{CODE_LABELS[k]}</td>
                <td className="py-1.5 text-right font-mono tabular-nums text-ink">{analysis.counts[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="mt-3 rounded-lg border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-cwru-blue">
          How each of your turns was coded ({analysis.utterances.length})
        </summary>
        <ol className="mt-3 flex flex-col gap-2">
          {analysis.utterances.map((u) => (
            <li key={u.index} className="border-b border-line pb-2 text-sm last:border-0">
              <span className="text-ink">&ldquo;{u.text}&rdquo;</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {u.codes.length ? (
                  u.codes.map((c) => (
                    <span key={c} className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                      {CODE_LABELS[c] ?? c}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">No codable behavior</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>

      <details className="mt-3 rounded-lg border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-cwru-blue">Where the thresholds come from</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-ink">
          {sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
          {mi ? (
            <li>
              Relational and Technical globals: MITI 4.2.1 fair 3.5 / good 4.0 and fair 3.0 / good 4.0 (Moyers, Manuel &amp; Ernst, 2014).
            </li>
          ) : null}
          <li>Codes are assigned by an AI coder and checked against hand-coded transcripts; treat single-digit differences as noise.</li>
        </ul>
      </details>
    </Section>
  );
}

const STEP_STATUS: Record<string, { label: string; className: string }> = {
  hit: { label: "Done", className: "bg-light-blue/40 text-cwru-blue" },
  missed: { label: "Missed", className: "bg-copper/[0.12] text-copper-deep" },
  prompted: { label: "Prompted", className: "bg-canvas text-ink border border-line" },
  not_applicable: { label: "Not reached", className: "bg-canvas text-muted border border-line" },
};

const CUE_STATUS: Record<string, string> = {
  explored: "Explored",
  acknowledged: "Acknowledged",
  missed: "Missed",
  not_raised: "Not raised",
};

export function PersonaChecklistPanel({ report }: { report: ReportDTO }) {
  const analysis = asPersonaAnalysis(report.outcome);
  if (!analysis) return null;
  const framework = frameworkFor(analysis);
  const defs = new Map(framework.steps.map((s) => [s.key, s]));
  const tally = stepTally(analysis.steps);
  const factsFound = analysis.facts.filter((f) => f.elicited).length;
  const mi = analysis.style === "motivational-interviewing";

  return (
    <Section title={framework.label} testId="persona-checklist-panel">
      <p className="mt-2 text-sm text-muted">
        {tally.hit} of {tally.applicable} steps done · {factsFound} of {analysis.facts.length}{" "}
        {mi ? "things the client was holding back" : "hidden history items"} drawn out
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {analysis.steps.map((step) => {
          const def = defs.get(step.key);
          const status = STEP_STATUS[step.status] ?? STEP_STATUS.missed;
          return (
            <li key={step.key} className="rounded-lg border border-line p-4" data-testid={`persona-step-${step.key}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{def?.label ?? step.key}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
              </div>
              {def ? <p className="mt-1 text-sm text-muted">{def.description}</p> : null}
              {step.evidenceQuote ? (
                <p className="mt-2 text-sm text-ink">
                  {step.timecodeSeconds !== null ? (
                    <span className="mr-2 font-mono text-xs tabular-nums text-muted">{formatTimecode(step.timecodeSeconds)}</span>
                  ) : null}
                  &ldquo;{step.evidenceQuote}&rdquo;
                </p>
              ) : null}
              {step.note ? <p className="mt-2 text-sm leading-6 text-ink">{step.note}</p> : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line p-4" data-testid="persona-facts">
          <p className="text-xs font-semibold text-muted">
            {mi ? "What the client was holding back" : "Hidden history"}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {analysis.facts.map((f) => (
              <li key={f.id} className="text-sm">
                <span className={f.elicited ? "font-semibold text-cwru-blue" : "text-muted"}>
                  {f.elicited ? "Drawn out: " : "Not reached: "}
                  {f.label}
                </span>
                {f.evidenceQuote ? <span className="block text-ink">&ldquo;{f.evidenceQuote}&rdquo;</span> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-line p-4" data-testid="persona-cues">
          <p className="text-xs font-semibold text-muted">Emotional cues</p>
          <ul className="mt-2 flex flex-col gap-2">
            {analysis.cues.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-semibold text-ink">{c.label}</span>{" "}
                <span className="text-muted">— {CUE_STATUS[c.status] ?? c.status}</span>
                {c.evidenceQuote ? <span className="block text-ink">&ldquo;{c.evidenceQuote}&rdquo;</span> : null}
              </li>
            ))}
          </ul>
        </div>

        {analysis.ice ? (
          <div className="rounded-lg border border-line p-4 lg:col-span-2" data-testid="persona-ice">
            <p className="text-xs font-semibold text-muted">Ideas, concerns and expectations (ICE)</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {analysis.ice.map((i) => (
                <li key={i.key} className="text-sm">
                  <span className={i.elicited ? "font-semibold text-cwru-blue" : "text-muted"}>
                    {i.key[0]!.toUpperCase() + i.key.slice(1)}: {i.elicited ? "asked" : "not asked"}
                  </span>
                  {i.evidenceQuote ? <span className="block text-ink">&ldquo;{i.evidenceQuote}&rdquo;</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-5 text-muted">Why these steps: {framework.source}</p>
    </Section>
  );
}
