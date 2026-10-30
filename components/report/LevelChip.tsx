import clsx from "clsx";

/**
 * A level on the shared 1-5 ramp: tinted pill, colored dot, Dark Blue word.
 * The word always comes from the caller (the report's SCORE_LABELS, the
 * answer-level words in `lib/metrics/bands.ts`, or mastery's `levelName()`),
 * so this component never invents its own names. Color is a second signal,
 * never the only one.
 */
const RAMP: Record<1 | 2 | 3 | 4 | 5, { dot: string; tint: string }> = {
  5: { dot: "bg-level-5", tint: "bg-level-5/16" },
  4: { dot: "bg-level-4", tint: "bg-level-4/16" },
  3: { dot: "bg-light-blue", tint: "bg-light-blue/32" },
  2: { dot: "bg-level-2", tint: "bg-level-2/16" },
  1: { dot: "bg-copper", tint: "bg-copper/12" },
};

export function levelDotClass(level: 1 | 2 | 3 | 4 | 5): string {
  return RAMP[level].dot;
}

export default function LevelChip({
  level,
  label,
  className,
}: {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-2 pr-2.5 text-[12.5px] font-semibold leading-none text-ink",
        RAMP[level].tint,
        className,
      )}
    >
      <span aria-hidden className={clsx("size-2 rounded-full", RAMP[level].dot)} />
      {label}
    </span>
  );
}
