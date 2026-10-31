"use client";

import Link from "next/link";
import { Button } from "@heroui/button";
import { RotateCcw } from "lucide-react";

import DeliveryBandsCard from "@/components/study-plan/DeliveryBandsCard";
import type { DrillDelivery } from "@/components/study-plan/drill/contract";
import { useNextStepHref } from "@/components/study-plan/useNextStepHref";
import { RUBRIC_ANCHORS } from "@/lib/mastery/rubric-anchors";
import type { CompetencyKey } from "@/lib/mastery/competencies";
import type { VoiceDrillAttemptDTO } from "@/lib/study-plan/drill/types";

/**
 * The graded VOICE_DRILL result — the ONLY place a drill score renders.
 * Score 1-5, what the student did vs what I would focus on next, the
 * delivery bands, and three ways on: try again, the next path step, mastery.
 */
export default function DrillResult({
  planId,
  competencyKey,
  competencyLabel,
  attempt,
  previousScore,
  delivery,
  worthPct,
  onTryAgain,
}: {
  planId: string;
  competencyKey: CompetencyKey;
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
  const also = attempt.pointers?.also ?? null;
  const worked = attempt.pointers?.worked ?? null;
  const rubric = RUBRIC_ANCHORS[competencyKey];
  const focuses =
    attempt.retryFocuses && attempt.retryFocuses.length > 0
      ? attempt.retryFocuses
      : [miss, also].filter((f): f is NonNullable<typeof miss> => Boolean(f));
  const reasons = uniqueTexts(focuses.map((f) => f.reason).filter(Boolean));
  const joinedReminders = focuses.map((f) => f.reminder).join(" ");
  const extraNote =
    attempt.feedback &&
    attempt.feedback !== joinedReminders &&
    !focuses.some((f) => f.reminder === attempt.feedback || overlapsReminder(attempt.feedback!, f.reminder))
      ? attempt.feedback
      : null;
  const placement = score !== null ? scorePlacement(score) : null;

  return (
    <section aria-labelledby="drill-result-heading" className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-xs font-bold text-true-blue">Voice drill · {competencyLabel}</p>
        <h1 id="drill-result-heading" className="font-display font-medium text-2xl text-ink">
          Drill complete.
        </h1>
        <p
          className="mx-auto inline-flex items-baseline gap-1 rounded-full border border-light-blue bg-white px-4 py-1 text-true-blue"
          data-testid="drill-score"
        >
          <span className="text-3xl font-semibold">{score ?? "–"}</span>
          <span className="text-sm font-semibold">/ 5</span>
        </p>
        <p className="text-sm leading-6 text-ink">
          {change === null
            ? `This counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`
            : change > 0
              ? `Up ${change} from your last try. This counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`
              : change === 0
                ? `Level with your last try. This counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`
                : `Below your last try (${previousScore}/5). It still counted toward ${competencyLabel} at the coached weight (${worthPct}% of an unaided session).`}
        </p>
      </div>

      {miss?.quote || reasons.length > 0 ? (
        <article className="space-y-3 rounded-xl border border-line bg-white p-5" aria-label="What you did">
          <h2 className="text-xs font-bold text-muted">What you did</h2>
          {miss?.quote ? (
            // The quote is an exact excerpt of this attempt's transcript
            // (validated server-side).
            <p className="text-base leading-7 text-ink" data-testid="drill-miss-pointer">
              You said: <q className="italic">{miss.quote}</q>
            </p>
          ) : null}
          {reasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
              {reasons.map((reason) => (
                <li key={reason} data-testid="drill-focus-reason">
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}

      {score !== null && rubric && placement ? (
        <article className="space-y-3 rounded-xl border border-line bg-white p-5" aria-label="Why this score">
          <h2 className="text-xs font-bold text-muted">
            Why {score}/5 on {competencyLabel}
          </h2>
          <p className="text-sm leading-6 text-ink">{placement.blurb}</p>
          <p className="text-sm leading-6 text-muted">
            This {score} is only {competencyLabel} — how you showed that skill, not every other part of the answer.
          </p>
          {attempt.rationale ? (
            <p className="text-sm leading-6 text-ink" data-testid="drill-rationale">
              {attempt.rationale}
            </p>
          ) : null}
          <ul className="space-y-2 text-sm leading-6">
            {([1, 3, 5] as const).map((n) => {
              const active = placement.nearer === n;
              return (
                <li
                  key={n}
                  className={
                    active
                      ? "rounded-lg border border-light-blue bg-canvas px-3 py-2 text-ink"
                      : "px-3 py-1 text-muted"
                  }
                >
                  <span className="font-semibold">{n}</span> — {rubric[n]}
                  {active ? (
                    <span className="mt-1 block text-xs font-semibold text-true-blue">
                      This {score} sits nearer here
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </article>
      ) : attempt.rationale ? (
        <p className="text-sm leading-6 text-ink" data-testid="drill-rationale">
          <span className="font-semibold text-ink">Why this score. </span>
          {attempt.rationale}
        </p>
      ) : null}

      {focuses.length > 0 || extraNote ? (
        <article className="space-y-3 rounded-xl border border-light-blue/32 bg-canvas p-5" aria-label="What I would focus on">
          <h2 className="text-xs font-bold text-true-blue">
            {focuses.length > 1 ? "What I would focus on (this session)" : "What I would focus on"}
          </h2>
          {miss ? (
            <p className="text-sm leading-6 text-ink">
              I would focus on <span className="font-semibold">{miss.techniqueName}</span>
              {also ? (
                <>
                  {" "}
                  and <span className="font-semibold">{also.techniqueName}</span>
                </>
              ) : null}
              .
            </p>
          ) : null}
          {focuses.map((focus) => (
            <div key={focus.techniqueId} className="space-y-1">
              <p className="text-sm font-semibold leading-6 text-ink">{focus.techniqueName}</p>
              <p className="text-sm leading-6 text-ink">{focus.reminder}</p>
            </div>
          ))}
          {extraNote ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{attempt.feedback}</p>
          ) : null}
        </article>
      ) : attempt.feedback ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{attempt.feedback}</p>
      ) : null}

      {worked ? (
        <article className="space-y-2 rounded-xl border border-level-4/30 bg-level-4/8 p-5" aria-label="What worked">
          <h2 className="text-xs font-bold text-level-4">What landed</h2>
          <p className="text-base leading-7 text-ink" data-testid="drill-worked-pointer">
            You also said: <q className="italic">{worked.quote}</q>
          </p>
          <p className="text-sm leading-6 text-ink">{worked.note}</p>
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
          {nextStepHref ? "Go to the next step" : "Continue the learning path"}
        </Button>
        <Button as={Link} href="/mastery" variant="light">
          View mastery
        </Button>
      </div>
    </section>
  );
}

function overlapsReminder(note: string, reminder: string): boolean {
  const words = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length > 3),
    );
  const inNote = words(note);
  let hits = 0;
  for (const w of words(reminder)) if (inNote.has(w)) hits += 1;
  return hits >= 4;
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function scorePlacement(score: number): { nearer: 1 | 3 | 5; blurb: string } {
  if (score <= 1) {
    return {
      nearer: 1,
      blurb: "A 1 means the competency barely showed. This attempt sits on that floor.",
    };
  }
  if (score === 2) {
    return {
      nearer: 1,
      blurb: "A 2 is between 1 and 3: you attempted it, but more than one gap kept it closer to the 1 than to a steady 3.",
    };
  }
  if (score === 3) {
    return {
      nearer: 3,
      blurb: "A 3 is the middle of the scale: the competency showed, with one noticeable gap.",
    };
  }
  if (score === 4) {
    return {
      nearer: 5,
      blurb: "A 4 sits between 3 and 5: strong, just short of the 5 anchor.",
    };
  }
  return {
    nearer: 5,
    blurb: "A 5 means the competency fully showed against the top anchor.",
  };
}
