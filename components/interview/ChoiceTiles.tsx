"use client";

/**
 * A single-select group of tiles: `role="radiogroup"` with roving tabindex and
 * arrow-key movement, the selectable-card treatment from the design system
 * (2px True Blue border on a Light Blue tint when selected). Used by the
 * interview customization page for every closed option set.
 */
import { Check } from "lucide-react";
import { type KeyboardEvent, useId, useRef } from "react";

export interface ChoiceTile {
  value: string;
  title: string;
  hint?: string;
}

export default function ChoiceTiles({
  label,
  description,
  options,
  value,
  onChange,
  disabled = false,
  columns = "grid-cols-1 sm:grid-cols-3",
  name,
}: {
  label: string;
  description?: string;
  options: ChoiceTile[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  columns?: string;
  /** Stable hook for tests: `data-choice-group`. */
  name: string;
}) {
  const labelId = useId();
  const descriptionId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-ink" id={labelId}>
          {label}
        </p>
        {description && (
          <p className="text-[13px] leading-5 text-muted" id={descriptionId}>
            {description}
          </p>
        )}
      </div>
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-disabled={disabled || undefined}
        aria-labelledby={labelId}
        className={`grid gap-2 ${columns}`}
        data-choice-group={name}
        role="radiogroup"
      >
        {options.map((option, index) => {
          const selected = index === selectedIndex && option.value === value;
          return (
            <button
              key={option.value || "default"}
              ref={(node) => {
                refs.current[index] = node;
              }}
              aria-checked={selected}
              className={`flex min-h-11 items-start justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
                selected
                  ? "border-2 border-true-blue bg-light-blue/32 px-[13px] py-[9px]"
                  : "border border-line bg-white hover:border-true-blue/50"
              }`}
              disabled={disabled}
              role="radio"
              tabIndex={index === selectedIndex ? 0 : -1}
              type="button"
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] font-semibold leading-5 text-ink">{option.title}</span>
                {option.hint && (
                  <span className="text-[13px] leading-5 text-muted">{option.hint}</span>
                )}
              </span>
              {selected && (
                <Check aria-hidden className="mt-0.5 shrink-0 text-true-blue" size={16} strokeWidth={2.75} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
