"use client";

import LevelChip from "@/components/report/LevelChip";
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

export interface ReportScoreCardsProps {
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
 *
 * This is NOT in tension with the written report body, which DOES quote raw
 * figures ("eye contact 65%") — that is deliberate, because concrete numbers
 * are what make the feedback credible to a student who wants to argue with
 * it. The split is: CARDS are the at-a-glance summary and stay qualitative;
 * the NARRATIVE carries the specifics. Do not "fix" the apparent
 * inconsistency by threading raw values into this component.
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
    <section
      aria-label="Scores"
      className="grid grid-cols-1 overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-2 lg:grid-cols-4"
    >
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
    </section>
  );
}

/**
 * The seven possible causes for a Visual/Vocal card's content. "scored" is
 * the only state that renders a number; every other state renders
 * cause-specific copy, never a score.
 *
 * `speech_too_short` (12-08 Task 1 checkpoint, Defect F) is deliberately
 * distinct from `typed_only` — see `VocalUnscoredReason`'s own doc comment
 * in lib/metrics/types.ts for the bug this split fixes.
 */
type DeliveryCardState =
  | "scored"
  | "not_yet_measured"
  | "camera_off"
  | "typed_only"
  | "speech_too_short"
  | "insufficient_data"
  | "not_scored";

/**
 * Pure resolver, deliberately inspectable/testable in isolation. Resolution
 * order matters — see `10-08-PLAN.md` for the reasoning behind each step;
 * do not reorder without re-checking every state it would then misclassify.
 */
export function resolveCardState(
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
  // 3b. The student DID speak, just not enough to score reliably (12-08
  //     Task 1 checkpoint, Defect F). Must NOT collapse into `typed_only` —
  //     that copy asserts the student typed, which would be false here.
  if (unscoredReason === "SPEECH_TOO_SHORT") {
    return "speech_too_short";
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
  // 12-08 Task 1 checkpoint, Defect F: a session where the student spoke,
  // just not long enough to score reliably — must NOT reuse typed_only's
  // copy, which would assert something false about what the student did.
  speech_too_short: {
    headline: "Not enough speech to score",
    subLine:
      "You spoke, but not enough in this session to score reliably — see the measurements below for what we could capture.",
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

/**
 * The one card chrome. Every state renders through this — scored, unscored and
 * pending alike — because three hand-rolled copies of the same markup is how
 * they drifted out of alignment in the first place.
 *
 * Two details carry the row's visual consistency:
 *
 * - NO `justify-between`. The grid stretches all four cards to the tallest,
 *   and `justify-between` then pushed the body of every SHORT card to the
 *   bottom — so a card with four band rows showed its score just under the
 *   title while its neighbours showed theirs an inch lower. Content starts at
 *   the top and the extra space falls below, where it is invisible.
 * - The title reserves two lines. "Vocal Delivery" fits on one and
 *   "Behavioral & Mindset" needs two; without a floor, the bodies beneath them
 *   start at different heights and the scores still fail to line up.
 */
function CardShell({
  title,
  muted = false,
  children,
}: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  // One cell of the divided score panel. Shadows outside each cell draw the
  // dividers and the panel clips the outer ones, so cells can wrap to
  // two rows on narrow screens without doubled lines.
  return (
    <div
      className={`flex h-full min-h-[148px] flex-col gap-2.5 px-5 py-[18px] shadow-[-1px_0_0_var(--la-line),0_-1px_0_var(--la-line)] ${
        muted ? "la-hatch" : ""
      }`}
    >
      <p className="flex min-h-[34px] items-start text-[13px] font-semibold leading-[1.3] text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function PlaceholderBar() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <div className="h-10 w-16 animate-pulse rounded-md bg-canvas" />
      <div className="h-5 w-24 animate-pulse rounded-full bg-canvas" />
    </div>
  );
}

function ScoreFigure({ score }: { score: number }) {
  const level = Math.min(5, Math.max(1, Math.round(score))) as 1 | 2 | 3 | 4 | 5;
  return (
    <>
      <p className="flex items-baseline gap-1.5">
        <span className="font-display text-[40px] font-medium leading-none text-cwru-blue [font-variant-numeric:lining-nums]">
          {score}
        </span>
        <span className="text-[15px] text-muted">/ 5</span>
      </p>
      <LevelChip label={SCORE_LABELS[score] ?? ""} level={level} />
    </>
  );
}

function UnscoredCopy({ headline, subLine }: { headline: string; subLine: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-[22px] font-medium leading-tight text-muted">{headline}</p>
      <p className="text-[13px] leading-[1.45] text-muted">{subLine}</p>
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
      <CardShell title={title} muted>
        <UnscoredCopy headline={copy.headline} subLine={copy.subLine} />
      </CardShell>
    );
  }

  // The band words (eye contact, pace, ...) moved to the Delivery tab, which
  // lists the same rows; the panel cell stays a figure and a level word.
  void bands;

  return (
    <CardShell title={title}>
      <ScoreFigure score={score ?? 0} />
      {/* Disclosure and scoring are deliberately two separate concerns — a
          coverage figure must never become a hidden second score. This
          note only ever explains an already-rendered score; it never
          changes it. */}
      {coverageNote && <p className="text-[13px] leading-[1.45] text-muted">{coverageNote}</p>}
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
      <CardShell title={title} muted>
        <UnscoredCopy headline="Not scored" subLine="The transcript didn't support a score." />
      </CardShell>
    );
  }

  return (
    <CardShell title={title}>
      <ScoreFigure score={score} />
    </CardShell>
  );
}
