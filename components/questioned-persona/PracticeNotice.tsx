import clsx from "clsx";
import { Info } from "lucide-react";

/**
 * The practice-only notice on persona case lists, briefings and reports.
 *
 * `banner` is the original copper panel, kept for clinical and MI, where the
 * notice is a safety line (no clinical guidance; 988). `quiet` is a small
 * grey info line for sales, where it only says the people are fictional and
 * a warning-colored panel read like an error.
 */
export default function PracticeNotice({
  text,
  tone,
  testId,
  className,
}: {
  text: string;
  tone: "banner" | "quiet";
  testId: string;
  className?: string;
}) {
  if (tone === "quiet") {
    return (
      <p
        className={clsx("flex max-w-3xl items-start gap-1.5 text-[13px] leading-5 text-muted", className)}
        data-testid={testId}
        data-tone="quiet"
        role="note"
      >
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {text}
      </p>
    );
  }
  return (
    <p
      className={clsx("rounded-xl border border-copper/40 bg-copper/[0.08] px-5 py-3 text-sm leading-6 text-ink", className)}
      data-testid={testId}
      role="note"
    >
      {text}
    </p>
  );
}
