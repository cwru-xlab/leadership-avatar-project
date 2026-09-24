"use client";

import { Chip } from "@heroui/chip";
import { getInterviewType } from "@/lib/interview/types";
import type { InterviewReportDTO } from "@/lib/interview/report-dto";

/**
 * Compact strip shown between the report header and the score cards,
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
  typeSlug: InterviewReportDTO["typeSlug"];
  customization: InterviewReportDTO["customization"];
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
      <div className="rounded-2xl border border-[#d4e2e9] bg-white px-5 py-4 text-sm text-[#8298a3] shadow-[0_24px_60px_rgba(20,58,75,0.06)]">
        Customization wasn&apos;t recorded for this session.
      </div>
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

  return (
    <div className="rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_24px_60px_rgba(20,58,75,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#526c7b]">
        Session customization
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {fields.map(({ label, value }) => (
          <Chip
            key={label}
            size="sm"
            variant="flat"
            className="bg-[#e0f3f9] text-[#08718d]"
          >
            {`${label}: ${value ?? "Not recorded"}`}
          </Chip>
        ))}
        {interviewerPersona !== null && (
          <Chip size="sm" variant="flat" className="bg-[#f0e8fb] text-[#5b3a91]">
            Custom interviewer persona
          </Chip>
        )}
      </div>
    </div>
  );
}
