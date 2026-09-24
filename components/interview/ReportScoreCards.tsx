"use client";

import { visualBands, vocalBands, type MetricBandRow } from "@/lib/metrics/bands";
import { isPoorVisualCoverage } from "@/lib/metrics/coverage";
import type {
    CameraMode,
    VisualMetrics,
    VisualUnscoredReason,
    VocalMetrics,
    VocalUnscoredReason,
} from "@/lib/metrics/types";

interface ReportScores {
  visual: number | null;
  vocal: number | null;
  content: number | null;
  behavioral: number | null;
}

interface ReportScoreCardsProps {
  scores: ReportScores;
  pending?: boolean;
  metrics?: {
    cameraMode: CameraMode | null;
    visual: VisualMetrics | null;
    vocal: VocalMetrics | null;
    visualUnscored: VisualUnscoredReason | null;
    vocalUnscored: VocalUnscoredReason | null;
  } | null;
}

const SCORE_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Strong",
  3: "Solid",
  2: "Developing",
  1: "Needs work",
};

/**
 * Four rubric score cards, in fixed order, with titles copied verbatim from
 * the evaluator prompt's own rubric headings (`lib/interview/prompts.ts`) so
 * this component can never contradict the Category Breakdown table rendered
 * in the markdown body directly beneath it.
 *
 * There is deliberately no single combined score anywhere in this file —
 * blending two measured categories with two permanently-null ones would
 * misrepresent the rubric.
 *
 * Visual and Vocal are DATA-DRIVEN cards (see `resolveCardState`/
 * `DeliveryCardState`): a legacy pre-Phase-10 row (`metrics == null` or
 * `metrics.cameraMode == null`) still renders byte-identical legacy copy; a
 * modern row distinguishes a deliberate camera-off opt-out, a typed-only
 * session, a genuine technical failure, a failed evaluation ("not scored"),
 * and a real score.
 *
 * This file must never format a raw metric number for display: no percent
 * character and no rounding-function call may appear anywhere below.
 * `lib/metrics/bands.ts` owns every numeric-to-word translation; this
 * component only renders the words it returns.
 */
export default function ReportScoreCards({
  scores,
  pending = false,
  metrics = null,
}: ReportScoreCardsProps) {
  const visualState = resolveCardState(
    metrics?.cameraMode ?? null,
    metrics?.visualUnscored ?? null,
    scores.visual,
  );
  const vocalState = resolveCardState(
    metrics?.cameraMode ?? null,
    metrics?.vocalUnscored ?? null,
    scores.vocal,
  );

  const visualCoverageNote =
    visualState === "scored" && metrics?.visual && isPoorVisualCoverage(metrics.visual)
      ? "Your face wasn't visible for much of the session, which is reflected in this score."
      : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DeliveryCard
        title="Visual & Environment"
        score={scores.visual}
        pending={pending}
        state={visualState}
        bands={metrics?.visual ? visualBands(metrics.visual) : []}
        coverageNote={visualCoverageNote}
      />
      <DeliveryCard
        title="Vocal Delivery"
        score={scores.vocal}
        pending={pending}
        state={vocalState}
        bands={metrics?.vocal ? vocalBands(metrics.vocal) : []}
      />
      <ScoredCard title="Content & Structure" score={scores.content} pending={pending} />
      <ScoredCard title="Behavioral & Mindset" score={scores.behavioral} pending={pending} />
    </div>
  );
}

/**
 * The six possible causes for a Visual/Vocal card's content. "scored" is the
 * only state that renders a number; every other state renders cause-specific
 * copy, never a score.
 */
type DeliveryCardState =
  | "scored"
  | "not_yet_measured"
  | "camera_off"
  | "typed_only"
  | "insufficient_data"
  | "not_scored";

/**
 * Pure resolver, deliberately inspectable/testable in isolation. Resolution
 * order matters — see `10-08-PLAN.md` for the reasoning behind each step;
 * do not reorder without re-checking every state it would then misclassify.
 */
function resolveCardState(
  cameraMode: CameraMode | null,
  unscoredReason: VisualUnscoredReason | VocalUnscoredReason | null,
  score: number | null,
): DeliveryCardState {
  // 1. No pipeline existed for this row at all — the ONLY path to today's
  //    legacy copy, keyed on the STORED cameraMode being null rather than on
  //    the score being null (that's what separates a legacy row from a
  //    modern camera-off row).
  if (cameraMode == null) {
    return "not_yet_measured";
  }
  // 2. A deliberate camera-off opt-out.
  if (unscoredReason === "CAMERA_OFF_OPTOUT") {
    return "camera_off";
  }
  // 3. A typed-only session. Must NOT collapse into camera_off: typing is a
  //    modality choice, not a camera opt-out.
  if (unscoredReason === "TYPED_ONLY") {
    return "typed_only";
  }
  // 4. A genuine technical failure — measurement was attempted but could not
  //    be performed.
  if (unscoredReason === "INSUFFICIENT_DATA") {
    return "insufficient_data";
  }
  // 5. Evaluation ran and produced nothing — the existing 06-08 state, now
  //    reachable for Visual/Vocal too.
  if (score === null) {
    return "not_scored";
  }
  // 6. Everything checked out — render the real score.
  return "scored";
}

const UNSCORED_COPY: Record<
  Exclude<DeliveryCardState, "scored">,
  { headline: string; subLine: string }
> = {
  not_yet_measured: {
    headline: "Not yet measured",
    subLine: "Requires video and audio analysis",
  },
  camera_off: {
    headline: "Not measured",
    subLine: "You practiced with your camera off, so this category wasn't scored.",
  },
  typed_only: {
    headline: "Not measured",
    subLine: "You typed your answers, so there was no speech to measure.",
  },
  insufficient_data: {
    headline: "Insufficient data",
    subLine:
      "We couldn't measure this reliably — your camera or microphone stopped part-way through.",
  },
  not_scored: {
    headline: "Not scored",
    subLine: "The transcript didn't support a score.",
  },
};

function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[132px] flex-col justify-between rounded-2xl border border-[#d4e2e9] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#526c7b]">{title}</p>
      {children}
    </div>
  );
}

function PlaceholderBar() {
  return (
    <div className="mt-4 space-y-2">
      <div className="h-7 w-16 animate-pulse rounded-md bg-[#e6edf1]" />
      <div className="h-3 w-32 animate-pulse rounded-md bg-[#e6edf1]" />
    </div>
  );
}

/**
 * Visual and Vocal delivery card. Renders one of six states — five muted
 * "unscored" states sharing one visual family, or the real score plus its
 * qualitative band rows. Never formats a raw number itself: `score` is
 * rendered as-is (an integer 1 to 5 from the rubric) and every band `value`
 * comes from `lib/metrics/bands.ts`.
 */
function DeliveryCard({
  title,
  score,
  pending,
  state,
  bands,
  coverageNote,
}: {
  title: string;
  score: number | null;
  pending: boolean;
  state: DeliveryCardState;
  bands: MetricBandRow[];
  coverageNote?: string | null;
}) {
  if (pending) {
    return (
      <CardShell title={title}>
        <PlaceholderBar />
      </CardShell>
    );
  }

  if (state !== "scored") {
    const copy = UNSCORED_COPY[state];
    return (
      <div className="flex h-full min-h-[132px] flex-col justify-between rounded-2xl border border-[#e3ebee] bg-[#f5f8fa] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8298a3]">{title}</p>
        <div className="mt-4">
          <p className="text-lg font-semibold text-[#8298a3]">{copy.headline}</p>
          <p className="mt-1 text-xs text-[#8298a3]">{copy.subLine}</p>
        </div>
      </div>
    );
  }

  const label = SCORE_LABELS[score ?? 0] ?? "";

  return (
    <CardShell title={title}>
      <div className="mt-4">
        <p className="text-3xl font-semibold text-[#102331]">
          {score} <span className="text-base font-normal text-[#8298a3]">/ 5</span>
        </p>
        <p className="mt-1 text-xs font-medium text-[#526c7b]">{label}</p>
        {bands.length > 0 && (
          <ul className="mt-3 space-y-1">
            {bands.map((row) => (
              <li key={row.label} className="text-xs text-[#526c7b]">
                {row.label}: {row.value}
              </li>
            ))}
          </ul>
        )}
        {/* Disclosure and scoring are deliberately two separate concerns — a
            coverage figure must never become a hidden second score. This
            note only ever explains an already-rendered score; it never
            changes it. */}
        {coverageNote && <p className="mt-2 text-xs text-[#8298a3]">{coverageNote}</p>}
      </div>
    </CardShell>
  );
}

function ScoredCard({
  title,
  score,
  pending,
}: {
  title: string;
  score: number | null;
  pending: boolean;
}) {
  if (pending) {
    return (
      <CardShell title={title}>
        <PlaceholderBar />
      </CardShell>
    );
  }

  if (score === null) {
    return (
      <div className="flex h-full min-h-[132px] flex-col justify-between rounded-2xl border border-[#e3ebee] bg-[#f5f8fa] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8298a3]">{title}</p>
        <div className="mt-4">
          <p className="text-lg font-semibold text-[#8298a3]">Not scored</p>
          <p className="mt-1 text-xs text-[#8298a3]">The transcript didn&apos;t support a score.</p>
        </div>
      </div>
    );
  }

  const label = SCORE_LABELS[score] ?? "";

  return (
    <CardShell title={title}>
      <div className="mt-4">
        <p className="text-3xl font-semibold text-[#102331]">
          {score} <span className="text-base font-normal text-[#8298a3]">/ 5</span>
        </p>
        <p className="mt-1 text-xs font-medium text-[#526c7b]">{label}</p>
      </div>
    </CardShell>
  );
}
