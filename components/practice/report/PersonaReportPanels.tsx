"use client";

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
 * NOTHING IS DELETED, BUT THE PAGE OPENS ON THE HEADLINES. Measured at
 * 1440x907 this tab rendered 3391px — 3.7 screens — of evenly weighted rows:
 * eleven step cards at a uniform 114-142px each (1486px in total), a 453px
 * count table expanded on load, and seven metric cards at up to 232px. A
 * student looking for "which steps did I miss" had to read all of it.
 *
 * So each list leads with a count and collapses its detail, rather than
 * being trimmed: every step, quote, note and coded utterance is still
 * reachable in one click. This is a deliberate revision of the older "reports
 * prefer more content: nothing is condensed" rule — more content stays
 * available, it just no longer all arrives at once.
 *
 * `"use client"` is explicit because the step rows hold open/closed state.
 * It already only renders under client components (`PracticeReportPage` ->
 * `ReportBody`), but relying on an ancestor's directive would make this file
 * break the moment a server component imported it.
 */

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

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

/**
 * The counts a reader wants before any list: how many steps landed, how many
 * were missed, how much of the hidden history came out.
 *
 * Only non-zero tiles render. A strip reading "Prompted 0 · Not reached 0"
 * spends the most valuable row on the page saying nothing happened.
 */
function SummaryStrip({
  tiles,
  testId,
}: {
  tiles: { label: string; value: string; total?: string; tone: "good" | "bad" | "neutral" }[];
  testId: string;
}) {
  const shown = tiles.filter((t) => t.value !== "0");
  if (!shown.length) return null;
  return (
    <dl
      className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
      data-testid={testId}
    >
      {shown.map((t) => (
        <div
          key={t.label}
          className="flex flex-col gap-1 rounded-lg border border-line bg-canvas/60 px-3.5 py-3"
        >
          <dt className="text-xs font-semibold text-muted">{t.label}</dt>
          <dd className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-[26px] font-medium leading-none [font-variant-numeric:lining-nums] ${
                t.tone === "bad" ? "text-copper-deep" : "text-cwru-blue"
              }`}
            >
              {t.value}
            </span>
            {t.total ? <span className="text-[13px] text-muted">of {t.total}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One checklist step: status and label always visible, the rest on click.
 *
 * COLLAPSED BY DEFAULT because the detail is mostly absent on the rows that
 * matter. Across the stored persona reports every one of the 15 missed steps
 * has a note but NO evidence quote — there is no quote to show for something
 * that did not happen — so an always-open card spent 114px rendering a label,
 * a status, a description and one sentence. Eleven of those is 1486px the
 * reader scrolls past to count four "Done" chips.
 */
function StepRow({
  label,
  description,
  status,
  note,
  quote,
  timecode,
  testId,
}: {
  label: string;
  description: string | null;
  status: { label: string; className: string };
  note: string | null;
  quote: string | null;
  timecode: string | null;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(description || note || quote);
  return (
    <li className="overflow-hidden rounded-lg border border-line" data-testid={testId}>
      <button
        aria-expanded={hasDetail ? open : undefined}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-true-blue disabled:cursor-default"
        disabled={!hasDetail}
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{label}</span>
        {timecode ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{timecode}</span>
        ) : null}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
        {hasDetail ? (
          <ChevronDown
            aria-hidden
            className={`shrink-0 text-link transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            size={15}
          />
        ) : null}
      </button>
      {open && hasDetail ? (
        <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
          {description ? <p className="text-sm text-muted">{description}</p> : null}
          {quote ? <p className="text-sm italic text-ink">&ldquo;{quote}&rdquo;</p> : null}
          {note ? <p className="text-sm leading-6 text-ink">{note}</p> : null}
        </div>
      ) : null}
    </li>
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
              <div key={g.key} className="rounded-lg border border-line px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-[26px] font-medium leading-none text-ink [font-variant-numeric:lining-nums]">
                    {g.value ?? "—"}
                  </p>
                  {band ? (
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[band].className}`}>
                      {BAND_STYLE[band].label}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[13.5px] font-semibold text-ink">{g.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {g.formula}. Fair ≥ {g.fair} · Good ≥ {g.good}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" data-testid="persona-metrics">
        {analysis.metrics.map((m) => (
          <li key={m.key} className="flex flex-col gap-1.5 rounded-lg border border-line px-4 py-3.5" data-testid={`persona-metric-${m.key}`}>
            {/* Figure and band on ONE line: the value and its verdict are the
                scannable part, and stacking them cost a row each per card. */}
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-[26px] font-medium leading-none text-ink [font-variant-numeric:lining-nums]">
                {formatValue(m)}
              </p>
              {m.band ? (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[m.band].className}`}>
                  {BAND_STYLE[m.band].label}
                </span>
              ) : null}
            </div>
            <p className="text-[13.5px] font-semibold text-ink">{m.label}</p>
            {formatThreshold(m) ? <p className="text-xs text-muted">{formatThreshold(m)}</p> : null}
            {/* The explanation is the least-scanned line on the card, so it
                closes it rather than leading in ink weight. */}
            <p className="text-[13px] leading-[1.5] text-muted">{m.note}</p>
          </li>
        ))}
      </ul>

      {/* CLOSED by default. Expanded it rendered 453px of code/count pairs
          directly under the metric cards that already name the counts that
          matter, pushing the checklist a screen further down. */}
      <details className="mt-4 rounded-lg border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-cwru-blue">
          Every behavior count ({codeKeys.length})
        </summary>
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
  const missedSteps = analysis.steps.filter((s) => s.status === "missed").length;
  const cuesHandled = analysis.cues.filter(
    (c) => c.status === "explored" || c.status === "acknowledged",
  ).length;
  const cuesRaised = analysis.cues.filter((c) => c.status !== "not_raised").length;

  return (
    <Section title={framework.label} testId="persona-checklist-panel">
      <SummaryStrip
        testId="persona-checklist-summary"
        tiles={[
          { label: "Steps done", value: String(tally.hit), total: String(tally.applicable), tone: "good" },
          { label: "Steps missed", value: String(missedSteps), tone: "bad" },
          {
            label: mi ? "Held back, drawn out" : "Hidden history found",
            value: String(factsFound),
            total: String(analysis.facts.length),
            tone: "neutral",
          },
          {
            label: "Cues handled",
            value: String(cuesHandled),
            total: String(cuesRaised),
            tone: cuesHandled < cuesRaised ? "bad" : "neutral",
          },
        ]}
      />

      {/* The list stays complete and in encounter order — a student retraces
          the conversation, so re-sorting it worst-first would break the one
          thing the order is for. The strip above already says where to look. */}
      <ol className="mt-4 flex flex-col gap-1.5">
        {analysis.steps.map((step) => {
          const def = defs.get(step.key);
          const status = STEP_STATUS[step.status] ?? STEP_STATUS.missed;
          return (
            <StepRow
              key={step.key}
              description={def?.description ?? null}
              label={def?.label ?? step.key}
              note={step.note?.trim() ? step.note : null}
              quote={step.evidenceQuote?.trim() ? step.evidenceQuote : null}
              status={status}
              testId={`persona-step-${step.key}`}
              timecode={step.timecodeSeconds !== null ? formatTimecode(step.timecodeSeconds) : null}
            />
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
