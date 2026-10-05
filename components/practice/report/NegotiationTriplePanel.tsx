/**
 * Ask vs settled vs fair — three distinct sources, never derived from each other.
 *
 * - Ask: pitch inputSnapshot (student wizard entry)
 * - Settled: validated outcome (evaluator structured output)
 * - Fair: inputSnapshot.fairValueBand (instance config; hidden during the meeting)
 */

import type { ReportDTO } from "@/lib/report/dto";
import type { PitchInputSnapshot } from "@/lib/report/snapshot";

export interface NegotiationTriplePanelProps {
  report: ReportDTO;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    const k = n / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatEquity(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}

function formatUsdRange(min: number, max: number): string {
  return `${formatUsd(min)}–${formatUsd(max)}`;
}

function formatEquityRange(min: number, max: number): string {
  return `${formatEquity(min)}–${formatEquity(max)}`;
}

type RangeRelation = "inside the range" | "below the range" | "above the range";

function relateToRange(
  value: number | null,
  min: number,
  max: number,
): RangeRelation | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < min) return "below the range";
  if (value > max) return "above the range";
  return "inside the range";
}

function isDeckPitchInput(
  input: ReportDTO["input"],
): input is PitchInputSnapshot & { pitchKind: "deck" } {
  return (
    input != null &&
    input.kind === "pitch" &&
    input.pitchKind === "deck"
  );
}

export default function NegotiationTriplePanel({
  report,
}: NegotiationTriplePanelProps) {
  if (!isDeckPitchInput(report.input)) return null;

  // Source 1 — ask: wizard entry on the pitch inputSnapshot. Never from outcome.
  const askPriceUsd = report.input.askPriceUsd;
  const askEquityPct = report.input.askEquityPct;

  // Source 2 — settled: validated evaluator outcome. Never from input.
  const outcome = report.outcome;
  const dealReached = outcome?.dealReached === true;
  const settledPriceUsd =
    typeof outcome?.settledPriceUsd === "number" &&
    Number.isFinite(outcome.settledPriceUsd)
      ? outcome.settledPriceUsd
      : null;
  const settledEquityPct =
    typeof outcome?.settledEquityPct === "number" &&
    Number.isFinite(outcome.settledEquityPct)
      ? outcome.settledEquityPct
      : null;
  const negotiationNotes =
    typeof outcome?.negotiationNotes === "string" &&
    outcome.negotiationNotes.trim()
      ? outcome.negotiationNotes.trim()
      : null;

  const showNoDeal =
    !dealReached || (settledPriceUsd == null && settledEquityPct == null);

  // Source 3 — fair: instance config on the snapshot. Never computed from ask.
  const band = report.input.fairValueBand;
  const priceRelation =
    band && settledPriceUsd != null
      ? relateToRange(settledPriceUsd, band.priceUsdMin, band.priceUsdMax)
      : null;
  const equityRelation =
    band && settledEquityPct != null
      ? relateToRange(settledEquityPct, band.equityPctMin, band.equityPctMax)
      : null;

  return (
    <section
      className="mb-6 rounded-2xl border border-[#d4e2e9] bg-white px-5 py-5"
      data-testid="negotiation-triple-panel"
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6a8391]">
        Negotiation
      </p>
      <p className="mt-1 font-serif text-xl text-[#102331]">
        Ask · Settled · Fair range
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            Your ask
          </p>
          <p className="mt-2 text-sm text-[#102331]">
            Price:{" "}
            <span className="font-mono tabular-nums">
              {askPriceUsd != null ? formatUsd(askPriceUsd) : "—"}
            </span>
          </p>
          <p className="mt-1 text-sm text-[#102331]">
            Equity:{" "}
            <span className="font-mono tabular-nums">
              {askEquityPct != null ? formatEquity(askEquityPct) : "—"}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            Settled
          </p>
          {showNoDeal ? (
            <p
              className="mt-2 text-sm font-medium text-[#102331]"
              data-testid="no-deal-reached"
            >
              No deal reached
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[#102331]">
                Price:{" "}
                <span className="font-mono tabular-nums">
                  {settledPriceUsd != null ? formatUsd(settledPriceUsd) : "—"}
                </span>
              </p>
              <p className="mt-1 text-sm text-[#102331]">
                Equity:{" "}
                <span className="font-mono tabular-nums">
                  {settledEquityPct != null
                    ? formatEquity(settledEquityPct)
                    : "—"}
                </span>
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            Investor&apos;s fair range
          </p>
          {band ? (
            <>
              <p className="mt-2 text-sm text-[#102331]">
                Price:{" "}
                <span className="font-mono tabular-nums">
                  {formatUsdRange(band.priceUsdMin, band.priceUsdMax)}
                </span>
              </p>
              <p className="mt-1 text-sm text-[#102331]">
                Equity:{" "}
                <span className="font-mono tabular-nums">
                  {formatEquityRange(band.equityPctMin, band.equityPctMax)}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[#526c7b]">Not recorded</p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-[#526c7b]">
            Hidden from you during the meeting — shown now so you can compare.
          </p>
        </div>
      </div>

      {!showNoDeal && (priceRelation || equityRelation) ? (
        <div className="mt-3 space-y-1 text-sm text-[#3a5563]">
          {priceRelation ? (
            <p>
              Settled price:{" "}
              <span className="font-medium text-[#102331]">{priceRelation}</span>
            </p>
          ) : null}
          {equityRelation ? (
            <p>
              Settled equity:{" "}
              <span className="font-medium text-[#102331]">
                {equityRelation}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {negotiationNotes ? (
        <p className="mt-4 text-sm leading-relaxed text-[#3a5563]">
          {negotiationNotes}
        </p>
      ) : null}
    </section>
  );
}
