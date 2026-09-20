"use client";

interface ReportScores {
  visual: number | null;
  vocal: number | null;
  content: number | null;
  behavioral: number | null;
}

interface ReportScoreCardsProps {
  scores: ReportScores;
  pending?: boolean;
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
 */
export default function ReportScoreCards({ scores, pending = false }: ReportScoreCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UnmeasuredCard title="Visual & Environment" pending={pending} />
      <UnmeasuredCard title="Vocal Delivery" pending={pending} />
      <ScoredCard title="Content & Structure" score={scores.content} pending={pending} />
      <ScoredCard title="Behavioral & Mindset" score={scores.behavioral} pending={pending} />
    </div>
  );
}

function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-[#d4e2e9] bg-white p-5">
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
 * Visual and Vocal are unconditionally rendered as "Not yet measured" in
 * this phase, regardless of any value that might arrive from the API — the
 * video/audio metrics pipeline that would populate them does not exist yet
 * (deferred to Phase 8). Never hidden, never a number.
 */
function UnmeasuredCard({ title, pending }: { title: string; pending: boolean }) {
  if (pending) {
    return (
      <CardShell title={title}>
        <PlaceholderBar />
      </CardShell>
    );
  }
  return (
    <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-[#e3ebee] bg-[#f5f8fa] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8298a3]">{title}</p>
      <div className="mt-4">
        <p className="text-lg font-semibold text-[#8298a3]">Not yet measured</p>
        <p className="mt-1 text-xs text-[#8298a3]">Requires video and audio analysis</p>
      </div>
    </div>
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
      <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-[#e3ebee] bg-[#f5f8fa] p-5">
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
