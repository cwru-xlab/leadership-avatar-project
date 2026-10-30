"use client";

import { ChevronDown } from "lucide-react";
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
 * Disclosure in the report header ("Session setup"),
 * stating the preset, industry, role, difficulty and length that produced
 * this session (REQ-24 display half — 08-02 already recorded these columns).
 *
 * Two reports built from the same preset with different customization must
 * look visibly different, and a pre-Phase-8 report (all six columns null)
 * must still render cleanly, so every value has an explicit "not recorded"
 * fallback rather than an empty cell.
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
    { label: "Industry", value: industry },
    { label: "Role", value: roleTitle },
    { label: "Difficulty", value: difficulty },
    { label: "Length", value: lengthValue },
  ];

  // Level 2 detail: the setup that produced the session, behind one click.
  return (
    <details className="group w-fit max-w-full text-sm">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Session setup
        <ChevronDown aria-hidden className="text-muted transition-transform duration-200 group-open:rotate-180" size={14} />
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-lg border border-line bg-white px-4 py-3">
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
