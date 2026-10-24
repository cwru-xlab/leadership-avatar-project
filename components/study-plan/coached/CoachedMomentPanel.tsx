"use client";

import Link from "next/link";

/**
 * The student's own moment, verbatim, plus their attempts in this leg.
 * Text only; never voiced by the avatar (22-CONTEXT.md).
 */

export interface CoachedMomentAttempt {
  text: string;
  acceptable: boolean | null;
  parroted: boolean | null;
}

export interface CoachedMomentPanelProps {
  counterpartLine: string | null;
  studentLine: string;
  attempts?: CoachedMomentAttempt[];
  sessionLink?: string;
}

function attemptMarker(attempt: CoachedMomentAttempt): string {
  if (attempt.parroted) return "Repeated the coach";
  if (attempt.acceptable) return "Accepted";
  return "Not yet";
}

export default function CoachedMomentPanel({
  counterpartLine,
  studentLine,
  attempts = [],
  sessionLink,
}: CoachedMomentPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-[#b9dbe5] bg-[#eaf7fa] p-4">
      {counterpartLine ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">They said:</p>
          {/*
            VERBATIM, UNTOUCHED. No trim, no ellipsizing, no re-casing, no
            whitespace collapsing between the server response and the screen.
            `pre-wrap` renders the stored line breaks and spacing exactly.
          */}
          <blockquote className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#173847]">
            {counterpartLine}
          </blockquote>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">You said:</p>
        <blockquote className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#173847]">
          {studentLine}
        </blockquote>
      </div>

      {sessionLink ? (
        <Link
          href={sessionLink}
          className="inline-block text-xs font-semibold text-[#006b87] underline underline-offset-2"
        >
          View the session this came from
        </Link>
      ) : null}

      {attempts.length > 0 ? (
        <div className="border-t border-[#b9dbe5] pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#58727f]">Your tries</p>
          <ol className="mt-2 space-y-2">
            {attempts.map((attempt, index) => (
              <li key={index} className="rounded-lg bg-white p-3 text-sm text-[#385463]">
                <blockquote className="whitespace-pre-wrap">{attempt.text}</blockquote>
                <p className="mt-1 text-xs text-[#58727f]">{attemptMarker(attempt)}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
