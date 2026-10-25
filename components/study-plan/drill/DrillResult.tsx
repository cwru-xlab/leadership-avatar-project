"use client";

import Link from "next/link";
import { Button } from "@heroui/button";
import { RotateCcw } from "lucide-react";

import DeliveryBandsCard from "@/components/study-plan/DeliveryBandsCard";
import type { DrillDelivery } from "@/components/study-plan/drill/contract";
import { useNextStepHref } from "@/components/study-plan/useNextStepHref";
import type { VoiceDrillAttemptDTO } from "@/lib/study-plan/drill/types";

/**
 * The graded VOICE_DRILL result — the ONLY place a drill score renders.
 * Score 1-5, the one "what to try next time" note, the delivery bands (same
 * card as the coached summary), and three ways on: try again (a new attempt,
 * which writes its own evidence), the next path step (PathPanel's
 * `hrefForStep` via the path DTO's `nextStep`), and mastery.
 */
export default function DrillResult({
  planId,
  competencyLabel,
  attempt,
  previousScore,
  delivery,
  worthPct,
  onTryAgain,
}: {
  planId: string;
  competencyLabel: string;
  attempt: VoiceDrillAttemptDTO;
  /** The score of the attempt finished just before this one, if any. */
  previousScore: number | null;
  delivery: DrillDelivery | null;
  worthPct: number;
  onTryAgain: () => void;
}) {
  const nextStepHref = useNextStepHref(planId, attempt.id);
  const score = attempt.score;
  const change = score !== null && previousScore !== null ? score - previousScore : null;
  const miss = attempt.pointers?.miss ?? null;
  const worked = attempt.pointers?.worked ?? null;

  return (
    <section aria-labelledby="drill-result-heading" className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Voice drill · {competencyLabel}</p>
        <h1 id="drill-result-heading" className="font-serif text-2xl text-[#102331]">
          Drill complete.
        </h1>
        <p
          className="mx-auto inline-flex items-baseline gap-1 rounded-full border border-[#b9dbe5] bg-white px-4 py-1 text-[#0a7391]"
          data-testid="drill-score"
        >
          <span className="text-3xl font-semibold">{score ?? "–"}</span>
          <span className="text-sm font-semibold">/ 5</span>
        </p>
        <p className="text-sm leading-6 text-[#385463]">
          {change === null
            ? `This counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`
            : change > 0
              ? `Up ${change} from your last try. This counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`
              : change === 0
                ? `Level with your last try. This counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`
                : `Below your last try (${previousScore}/5). It still counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`}
        </p>
      </div>

      {attempt.feedback || miss ? (
        <article className="space-y-3 rounded-xl border border-[#cfe6ee] bg-[#eaf7fa] p-5" aria-label="What to try next time">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">What to try next time</h2>
          {miss ? (
            // The quote is an exact excerpt of this attempt's transcript
            // (validated server-side); the technique is a library entry.
            <p className="text-base leading-7 text-[#102331]" data-testid="drill-miss-pointer">
              In your answer: <q className="italic">{miss.quote}</q> → try{" "}
              <span className="font-semibold">{miss.techniqueName}</span>
            </p>
          ) : null}
          {miss ? <p className="text-sm leading-6 text-[#385463]">{miss.reminder}</p> : null}
          {attempt.feedback && attempt.feedback !== miss?.reminder ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-[#173847]">{attempt.feedback}</p>
          ) : null}
        </article>
      ) : null}

      {worked ? (
        <article className="space-y-2 rounded-xl border border-[#cfe9df] bg-[#f0faf5] p-5" aria-label="What worked">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#327b68]">What worked</h2>
          <p className="text-base leading-7 text-[#102331]" data-testid="drill-worked-pointer">
            <q className="italic">{worked.quote}</q>
          </p>
          <p className="text-sm leading-6 text-[#385463]">{worked.note}</p>
        </article>
      ) : null}

      <DeliveryBandsCard
        delivery={delivery}
        emptyNote="Delivery is described right after a drill ends."
      />

      <div className="flex flex-wrap justify-center gap-3">
        <Button color="primary" variant="bordered" startContent={<RotateCcw size={16} />} onPress={onTryAgain}>
          Try again
        </Button>
        <Button as={Link} href={nextStepHref ?? `/study-plans/${planId}`} color="primary">
          {nextStepHref ? "Go to your next step" : "Continue your learning path"}
        </Button>
        <Button as={Link} href="/mastery" variant="light">
          View your mastery
        </Button>
      </div>
    </section>
  );
}
