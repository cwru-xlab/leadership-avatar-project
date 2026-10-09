/**
 * The per-mode descriptive, UNSCORED verdict for the deck-led pitch family.
 *
 * ONE component with an internal mode switch (19-CONTEXT.md leaves the
 * factoring to discretion) — adding a sixth verdict shape is one branch
 * here, not a new component plus a new chrome entry.
 *
 * `pitch-deck` already renders its ask/settled/fair verdict through
 * `NegotiationTriplePanel` — this panel returns null for it, never
 * duplicating that panel. `pitch-general` has no outcome panel at all
 * (`mode.hasOutcomePanel === false`) — that absence is DATA on the mode
 * table, not a branch guessed here.
 *
 * Every branch reads `report.outcome` (and, for funding/talk, the
 * student's own wizard entry on `report.input.deckModeInputs`) and RENDERS
 * it. Nothing here computes or writes a score — CONTEXT.md forbids letting
 * an outcome cap or lift a dimension.
 */

import type { ReportDTO } from "@/lib/report/dto";
import type { DeckModeInputs } from "@/lib/pitch/deck-modes";

import { getDeckMode } from "@/lib/pitch/deck-modes";
import { OUTCOME_NOT_A_SCORE_CAPTION } from "@/components/practice/report/ConversationOutcomePanel";

export interface DeckVerdictPanelProps {
  report: ReportDTO;
}

// Copied locally from `NegotiationTriplePanel` rather than exporting new
// API from that file (plan 19-09's own instruction) — same USD formatting.
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

function rawDeckModeInputs(report: ReportDTO): DeckModeInputs | null {
  const input = report.input;

  if (!input || input.kind !== "pitch") return null;

  return input.deckModeInputs ?? null;
}

function fundingModeInputs(
  report: ReportDTO,
): Extract<DeckModeInputs, { mode: "pitch-funding" }> | null {
  const dmi = rawDeckModeInputs(report);

  return dmi && dmi.mode === "pitch-funding" ? dmi : null;
}

function talkModeInputs(
  report: ReportDTO,
): Extract<DeckModeInputs, { mode: "pitch-talk" }> | null {
  const dmi = rawDeckModeInputs(report);

  return dmi && dmi.mode === "pitch-talk" ? dmi : null;
}

// ---------------------------------------------------------------------------
// Funding — requested vs what the reviewer would fund, and why.
// ---------------------------------------------------------------------------

type FundingPosition = "full" | "partial" | "declined";

const FUNDING_POSITION_LABELS: Record<FundingPosition, string> = {
  full: "Fully funded",
  partial: "Partially funded",
  declined: "Declined",
};

function isFundingPosition(value: unknown): value is FundingPosition {
  return value === "full" || value === "partial" || value === "declined";
}

interface FundingOutcomeView {
  fundedAmountUsd: number | null;
  fundingPosition: FundingPosition | null;
  fundingRationale: string | null;
}

function asFundingOutcome(value: unknown): FundingOutcomeView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const view: FundingOutcomeView = {
    fundedAmountUsd:
      typeof v.fundedAmountUsd === "number" &&
      Number.isFinite(v.fundedAmountUsd)
        ? v.fundedAmountUsd
        : null,
    fundingPosition: isFundingPosition(v.fundingPosition)
      ? v.fundingPosition
      : null,
    fundingRationale:
      typeof v.fundingRationale === "string" && v.fundingRationale.trim()
        ? v.fundingRationale.trim()
        : null,
  };

  if (
    view.fundedAmountUsd === null &&
    view.fundingPosition === null &&
    view.fundingRationale === null
  ) {
    return null;
  }

  return view;
}

function FundingVerdict({ report }: { report: ReportDTO }) {
  const outcome = asFundingOutcome(report.outcome);

  if (!outcome) return null;

  const dmi = fundingModeInputs(report);
  const requestedAmountUsd =
    dmi &&
    typeof dmi.requestedAmountUsd === "number" &&
    Number.isFinite(dmi.requestedAmountUsd)
      ? dmi.requestedAmountUsd
      : null;

  return (
    <VerdictCard heading="Funding verdict" testId="funding-verdict-panel">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            You requested
          </p>
          <p className="mt-2 text-sm text-[#102331]">
            <span
              className="font-mono tabular-nums"
              data-testid="funding-requested-amount"
            >
              {requestedAmountUsd != null ? formatUsd(requestedAmountUsd) : "—"}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            The reviewer would fund
          </p>
          <p
            className="mt-2 text-sm font-medium text-[#102331]"
            data-testid="funding-position"
          >
            {outcome.fundingPosition
              ? FUNDING_POSITION_LABELS[outcome.fundingPosition]
              : "Not recorded"}
          </p>
          {outcome.fundedAmountUsd != null ? (
            <p className="mt-1 text-sm text-[#102331]">
              <span
                className="font-mono tabular-nums"
                data-testid="funding-funded-amount"
              >
                {formatUsd(outcome.fundedAmountUsd)}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {outcome.fundingRationale ? (
        <p
          className="mt-4 text-sm leading-relaxed text-[#3a5563]"
          data-testid="funding-rationale"
        >
          {outcome.fundingRationale}
        </p>
      ) : null}
    </VerdictCard>
  );
}

// ---------------------------------------------------------------------------
// Product — the buyer's position at the close, plus the blocking objection.
// ---------------------------------------------------------------------------

type BuyerPosition = "interested" | "needs-more" | "declined";

const BUYER_POSITION_LABELS: Record<BuyerPosition, string> = {
  interested: "Interested",
  "needs-more": "Needs more",
  declined: "Declined",
};

function isBuyerPosition(value: unknown): value is BuyerPosition {
  return (
    value === "interested" || value === "needs-more" || value === "declined"
  );
}

interface ProductOutcomeView {
  buyerPosition: BuyerPosition | null;
  blockingObjection: string | null;
}

function asProductOutcome(value: unknown): ProductOutcomeView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const view: ProductOutcomeView = {
    buyerPosition: isBuyerPosition(v.buyerPosition) ? v.buyerPosition : null,
    blockingObjection:
      typeof v.blockingObjection === "string" && v.blockingObjection.trim()
        ? v.blockingObjection.trim()
        : null,
  };

  if (view.buyerPosition === null && view.blockingObjection === null)
    return null;

  return view;
}

function ProductVerdict({ report }: { report: ReportDTO }) {
  const outcome = asProductOutcome(report.outcome);

  if (!outcome) return null;

  return (
    <VerdictCard heading="Buyer verdict" testId="product-verdict-panel">
      <p
        className="font-serif text-xl text-[#102331]"
        data-testid="buyer-position"
      >
        {outcome.buyerPosition
          ? BUYER_POSITION_LABELS[outcome.buyerPosition]
          : "Not recorded"}
      </p>
      <p
        className="mt-3 text-sm leading-relaxed text-[#3a5563]"
        data-testid="blocking-objection"
      >
        {outcome.blockingObjection
          ? outcome.blockingObjection
          : "No blocking objection was recorded."}
      </p>
    </VerdictCard>
  );
}

// ---------------------------------------------------------------------------
// Talk — the takeaway the audience actually left with vs. the declared one.
// ---------------------------------------------------------------------------

interface TalkOutcomeView {
  takeawayHeard: string | null;
  matchedDeclaredTakeaway: boolean | null;
}

function asTalkOutcome(value: unknown): TalkOutcomeView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const view: TalkOutcomeView = {
    takeawayHeard:
      typeof v.takeawayHeard === "string" && v.takeawayHeard.trim()
        ? v.takeawayHeard.trim()
        : null,
    matchedDeclaredTakeaway:
      typeof v.matchedDeclaredTakeaway === "boolean"
        ? v.matchedDeclaredTakeaway
        : null,
  };

  if (view.takeawayHeard === null && view.matchedDeclaredTakeaway === null)
    return null;

  return view;
}

function TalkVerdict({ report }: { report: ReportDTO }) {
  const outcome = asTalkOutcome(report.outcome);

  if (!outcome) return null;

  const dmi = talkModeInputs(report);
  const declaredTakeaway =
    dmi && typeof dmi.talkTakeaway === "string" && dmi.talkTakeaway.trim()
      ? dmi.talkTakeaway.trim()
      : null;

  const matchSentence =
    outcome.matchedDeclaredTakeaway === null
      ? "Whether this matched your declared takeaway wasn't recorded."
      : outcome.matchedDeclaredTakeaway
        ? "This matches the takeaway you declared going in."
        : "This does not match the takeaway you declared going in.";

  return (
    <VerdictCard heading="Audience takeaway" testId="talk-verdict-panel">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            You declared
          </p>
          <p
            className="mt-2 text-sm text-[#102331]"
            data-testid="talk-declared-takeaway"
          >
            {declaredTakeaway ?? "Not recorded"}
          </p>
        </div>
        <div className="rounded-xl border border-[#e3ecef] bg-[#f7fafb] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#6a8391]">
            The audience left with
          </p>
          <p
            className="mt-2 text-sm text-[#102331]"
            data-testid="talk-heard-takeaway"
          >
            {outcome.takeawayHeard ?? "Not recorded"}
          </p>
        </div>
      </div>
      <p
        className="mt-4 text-sm leading-relaxed text-[#3a5563]"
        data-testid="talk-match-sentence"
      >
        {matchSentence}
      </p>
    </VerdictCard>
  );
}

// ---------------------------------------------------------------------------
// Shared card chrome — matches `NegotiationTriplePanel` / `ConversationOutcomePanel`.
// ---------------------------------------------------------------------------

function VerdictCard({
  heading,
  testId,
  children,
}: {
  heading: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-6 rounded-2xl border border-[#d4e2e9] bg-white px-5 py-5"
      data-testid={testId}
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6a8391]">
        Verdict
      </p>
      <p className="mt-1 font-serif text-xl text-[#102331]">{heading}</p>
      <div className="mt-4">{children}</div>
      <p
        className="mt-4 text-sm leading-relaxed text-[#526c7b]"
        data-not-a-score="true"
        data-testid="verdict-not-a-score-note"
      >
        {OUTCOME_NOT_A_SCORE_CAPTION}
      </p>
    </section>
  );
}

export default function DeckVerdictPanel({ report }: DeckVerdictPanelProps) {
  const mode = getDeckMode(report.typeSlug);

  // Unknown slug, the investor deck (its own NegotiationTriplePanel already
  // owns this), or a mode declaring no outcome panel at all (pitch-general).
  if (!mode || mode.slug === "pitch-deck" || mode.hasOutcomePanel === false) {
    return null;
  }

  if (!report.outcome) return null;

  if (mode.slug === "pitch-funding") return <FundingVerdict report={report} />;
  if (mode.slug === "pitch-product") return <ProductVerdict report={report} />;
  if (mode.slug === "pitch-talk") return <TalkVerdict report={report} />;

  return null;
}
