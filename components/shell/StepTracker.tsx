import { Fragment } from "react";
import { Check } from "lucide-react";

/**
 * The one step indicator for multi-step setup: finished steps are a Blue Green
 * check, the current step is a CWRU Blue number, upcoming steps are outlined.
 * Labels show from the small breakpoint up; the current label always shows.
 */
export default function StepTracker({
  labels,
  current,
  ariaLabel,
}: {
  labels: string[];
  /** 0-based index of the current step. */
  current: number;
  ariaLabel: string;
}) {
  return (
    <ol aria-label={ariaLabel} className="flex w-full items-center gap-2 text-[13px]">
      {labels.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <Fragment key={`${label}-${index}`}>
            {index > 0 && (
              <li aria-hidden className={`h-0.5 min-w-3 flex-1 rounded-full ${done || active ? "bg-level-4" : "bg-line"}`} />
            )}
            <li aria-current={active ? "step" : undefined} className="flex shrink-0 items-center gap-2">
              <span
                className={`grid size-[26px] place-items-center rounded-full text-xs font-bold ${
                  done ? "bg-level-4 text-white" : active ? "bg-cwru-blue text-white" : "border-2 border-line text-muted"
                }`}
              >
                {done ? <Check aria-hidden size={14} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={`${active ? "inline font-semibold text-ink" : "hidden text-muted sm:inline"}`}
              >
                {label}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
