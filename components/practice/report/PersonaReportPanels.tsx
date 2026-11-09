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

import clsx from "clsx";
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
/**
 * Column classes chosen so `count` items divide the row EXACTLY, leaving no
 * empty cell.
 *
 * Both grids here are fed variable-length data, while their column counts were
 * hard-coded, so the last row broke open whenever the two disagreed. Measured
 * on the clinical report: the checklist strip renders 3 tiles into
 * `lg:grid-cols-4` and left a 263px hole, and the 7 metric cards in
 * `xl:grid-cols-3` left the 7th alone beside 700px of nothing.
 *
 * The intermediate 2-column step is skipped for odd counts, since that is the
 * same bug one breakpoint down (3 items in 2 columns is another hole).
 */
const FILL_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

/** Falls back to 3 wide, which only ever leaves a hole for counts above 4. */
const fillCols = (count: number) => FILL_COLS[count] ?? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

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
      className={clsx("mt-4 grid gap-2.5", fillCols(shown.length))}
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
 * The complete code tally, inside a closed disclosure.
 *
 * KEPT despite overlapping the metric cards above. For the clinical style 8
 * of its 12 labels also appear on a card, which argues for deleting it — but
 * for MI only 2 of 11 do: the MI cards are aggregates (`mi_adherent` is
 * affirm + seeking collaboration + emphasizing autonomy), so this is the only
 * place the individual codes are visible. It is the audit trail behind every
 * number on the page, which is why the panel promises "counted from those
 * codes, not estimated".
 *
 * Its job is completeness, so no row is dropped or reordered: a zero here is
 * a real finding ("Empathy statements 0" is why that card reads Below fair),
 * and the declared order groups the codes sensibly already (the four question
 * kinds together, then reflections, and so on).
 *
 * What changes is weight. A flat list gave "Closed questions 6" and "Leading
 * questions 0" identical presence, so the eye had to read twelve numbers to
 * find the large ones. A bar carries magnitude pre-attentively and the unused
 * codes recede, while still being listed and still counted in the header.
 *
 * The bar is scaled to the LARGEST count in this list, not to the number of
 * turns: an utterance can carry several codes (16 turns produced 25 codes
 * here), so a share-of-turns reading would be false. It is a relative
 * magnitude cue, which is all it claims to be — the number is right there.
 */
function CountTally({
  codeKeys,
  counts,
  turns,
}: {
  codeKeys: string[];
  counts: Record<string, number>;
  turns: number;
}) {
  const total = codeKeys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  const max = Math.max(1, ...codeKeys.map((k) => counts[k] ?? 0));
  const unused = codeKeys.filter((k) => (counts[k] ?? 0) === 0).length;

  return (
    <div className="mt-3">
      <p className="text-xs text-muted">
        {total} coded behavior{total === 1 ? "" : "s"} across {turns} turn{turns === 1 ? "" : "s"}
        {unused > 0 ? ` · ${unused} of ${codeKeys.length} never used` : null}
      </p>
      <dl
        className="mt-2.5 grid gap-x-8 gap-y-0 sm:grid-cols-2"
        data-testid="persona-count-table"
      >
        {codeKeys.map((k, i) => {
          const n = counts[k] ?? 0;
          // The rule belongs under every row EXCEPT the last of each column.
          // `last:border-0` only knows the last child, which in a two-column
          // flow left the left column's final row with a dangling rule.
          //
          // The grid fills row-wise, so the left column holds the even indices
          // and the right the odd. The final row of each is therefore always
          // within the last two indices — true for both an even count (12,
          // clinical: 10 and 11) and an odd one (11, MI: 9 and 10).
          const lastInColumn = i >= codeKeys.length - 2;
          return (
            <div
              key={k}
              className={clsx(
                "flex items-center gap-3 py-1.5",
                !lastInColumn && "border-b border-line",
                // Stacked into one column, only the true last row ends the
                // list, so the other "last in column" row needs its rule back.
                lastInColumn && i !== codeKeys.length - 1 && "border-b border-line sm:border-0",
              )}
            >
              <dt className={`min-w-0 flex-1 truncate text-[13.5px] ${n === 0 ? "text-muted" : "text-ink"}`}>
                {CODE_LABELS[k]}
              </dt>
              {/* Fixed-width track so every bar starts at the same x and the
                  lengths are comparable down the column. */}
              <div aria-hidden className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-light-blue"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <dd
                className={`w-6 shrink-0 text-right font-mono text-[13px] tabular-nums ${
                  n === 0 ? "text-muted" : "font-semibold text-ink"
                }`}
              >
                {n}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
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

      {/* TWO grids, not one, because the row has to divide evenly and 7 is
          prime: `xl:grid-cols-3` stranded the 7th card beside 700px of empty
          canvas. The split is the one the data already makes — 3 metrics
          carry a target to be judged against, the rest are plain "aim for
          zero" tallies — and it divides 3 + 4 (clinical) and 3 + 2 (MI), each
          of which fills its row exactly.
          Both `deriveMetrics` branches author the targeted ones first, so
          partitioning preserves the authored reading order.
          Partitioned on `threshold`, which is a static property of the metric,
          NOT on `band`: band is derived from the value and goes undefined when
          a denominator is zero, so a student who asked no questions at all
          would see "Open questions" demoted into the second group. */}
      <div data-testid="persona-metrics">
        {[
          analysis.metrics.filter((m) => m.threshold),
          analysis.metrics.filter((m) => !m.threshold),
        ]
          .filter((group) => group.length > 0)
          .map((group, gi) => (
            <ul
              key={gi}
              className={clsx("mt-4 grid gap-2.5", fillCols(group.length))}
            >
              {group.map((m) => (
                <li
                  key={m.key}
                  className="flex flex-col gap-1.5 rounded-lg border border-line px-4 py-3.5"
                  data-testid={`persona-metric-${m.key}`}
                >
                  {/* Figure and band on ONE line: the value and its verdict are the
                scannable part, and stacking them cost a row each per card. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-[26px] font-medium leading-none text-ink [font-variant-numeric:lining-nums]">
                      {formatValue(m)}
                    </p>
                    {m.band ? (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[m.band].className}`}
                      >
                        {BAND_STYLE[m.band].label}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[13.5px] font-semibold text-ink">{m.label}</p>
                  {formatThreshold(m) ? (
                    <p className="text-xs text-muted">{formatThreshold(m)}</p>
                  ) : null}
                  {/* The explanation is the least-scanned line on the card, so it
                closes it rather than leading in ink weight. */}
                  <p className="text-[13px] leading-[1.5] text-muted">{m.note}</p>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {/* CLOSED by default. Expanded it rendered 453px of code/count pairs
          directly under the metric cards that already name the counts that
          matter, pushing the checklist a screen further down. */}
      <details className="mt-4 rounded-lg border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-cwru-blue">
          Every behavior count ({codeKeys.length})
        </summary>
        <CountTally
          codeKeys={codeKeys}
          counts={analysis.counts}
          turns={analysis.counts.student_utterances ?? analysis.utterances.length}
        />
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
