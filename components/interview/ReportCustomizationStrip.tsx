"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  CURATED_INDUSTRIES,
  CURATED_ROLES,
  type CuratedOption,
} from "@/lib/interview/customization-options";
import { getInterviewType } from "@/lib/interview/types";

/** Customization fields the strip displays — matches InterviewInputSnapshot. */
export interface ReportCustomizationFields {
  industry: string | null;
  roleTitle: string | null;
  difficulty: string | null;
  targetMinutes: number | null;
  targetQuestionCount: number | null;
  interviewerPersona: string | null;
}

/**
 * Stored values are written to read inside the interviewer's prompt ("an
 * early-career professional role"), not as table cells. Curated values get their
 * picker label back; a preset default or a student's own text only loses a
 * leading article and gains a capital. Display only: the stored value is untouched.
 */
function displayValue(value: string | null, options: CuratedOption[] = []): string | null {
  const text = value?.trim();
  if (!text) return null;
  const curated = options.find((o) => o.promptValue.toLowerCase() === text.toLowerCase());
  if (curated) return curated.label;
  const bare = text.replace(/^(an?|the)\s+/i, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/**
 * Disclosure in the report header ("Session setup"),
 * stating the preset, industry, role, difficulty and length that produced
 * this session (REQ-24 display half — 08-02 already recorded these columns).
 *
 * Two reports built from the same preset with different customization must
 * look visibly different, and a pre-Phase-8 report (all six columns null)
 * must still render cleanly, so every value has an explicit "not recorded"
 * fallback rather than an empty cell.
 *
 * The panel floats over the page rather than opening in flow, because this sits
 * in the header's meta line: in flow, opening it pushed the line down and
 * dragged "Practice again" out of alignment.
 *
 * Deliberate omission: `customization.interviewerPersona` is NEVER rendered
 * here as text. Per 08-CONTEXT.md, a pasted-profile persona can be the
 * distilled description of a real named third party, and this report page
 * is a shareable-feeling, owner-viewable artifact — showing even the
 * distilled text risks it reading as that person's real words. Only a
 * neutral presence chip ("Custom interviewer persona") is shown when one
 * was used; the persona string itself is never interpolated into any DOM
 * node in this file.
 */
export default function ReportCustomizationStrip({
  typeSlug,
  customization,
}: {
  typeSlug: string;
  customization: ReportCustomizationFields;
}) {
  const { industry, roleTitle, difficulty, targetMinutes, targetQuestionCount, interviewerPersona } =
    customization;
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Native details gives keyboard and touch; a floating panel also needs the
  // usual ways out.
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      const details = detailsRef.current;
      if (!details) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.querySelector("summary")?.focus();
      } else if (details.contains(event.target as Node)) {
        return;
      }
      details.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const allNull =
    industry === null &&
    roleTitle === null &&
    difficulty === null &&
    targetMinutes === null &&
    targetQuestionCount === null &&
    interviewerPersona === null;

  if (allNull) {
    return (
      <p className="text-sm text-muted">Customization wasn&apos;t recorded for this session.</p>
    );
  }

  const preset = getInterviewType(typeSlug)?.label ?? typeSlug;

  const lengthParts: string[] = [];
  if (targetMinutes !== null) lengthParts.push(`~${targetMinutes} min`);
  if (targetQuestionCount !== null) lengthParts.push(`${targetQuestionCount} questions`);
  const lengthValue = lengthParts.length > 0 ? lengthParts.join(" · ") : null;

  const fields: { label: string; value: string | null }[] = [
    { label: "Preset", value: preset },
    { label: "Industry", value: displayValue(industry, CURATED_INDUSTRIES) },
    { label: "Role", value: displayValue(roleTitle, CURATED_ROLES) },
    { label: "Difficulty", value: displayValue(difficulty) },
    { label: "Length", value: lengthValue },
  ];

  // Level 2 detail: the setup that produced the session, behind one click.
  return (
    <details ref={detailsRef} className="group w-fit max-w-full text-sm sm:relative" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="-mx-1.5 -my-1.5 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 font-semibold text-ink transition-colors duration-150 ease-out hover:text-cwru-blue [&:focus:not(:focus-visible)]:outline-none [&::-webkit-details-marker]:hidden">
        Session setup
        <ChevronDown aria-hidden className="text-muted transition-transform duration-200 group-open:rotate-180" size={14} />
      </summary>
      <dl className="absolute left-0 top-full z-20 mt-2 grid w-full grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-lg border border-line bg-white px-4 py-3 shadow-[0_12px_32px_rgb(9_20_58/0.16)] sm:w-[360px]">
        {fields.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className={value ? "text-ink" : "text-muted"}>{value ?? "Not recorded"}</dd>
          </div>
        ))}
        {interviewerPersona !== null && (
          <div className="contents">
            <dt className="text-muted">Interviewer</dt>
            <dd className="text-ink">Custom interviewer persona</dd>
          </div>
        )}
      </dl>
    </details>
  );
}
