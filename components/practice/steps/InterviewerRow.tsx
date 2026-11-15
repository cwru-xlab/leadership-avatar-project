"use client";

/**
 * One interviewer as a compact row: thumbnail, name, voice, selected tick.
 *
 * WHY THIS EXISTS. The photo cards are 240px tall, so 54 of them run ~6.9
 * screens of scrolling and the "General business" group alone is 3,600px. The
 * design system already answers this shape of problem for the report's growth
 * areas — "a grid (3 columns at desktop, 2 at tablet, 1 at mobile) rather than
 * one column — at nineteen rows a single column towers down the stage". A row
 * is ~64px, and three per line, so the same roster lands in roughly a screen
 * and a half.
 *
 * WHY THE PHOTO STAYS. The student is picking a FACE to talk to, so a
 * text-only table would be the wrong trade: the thumbnail keeps the one
 * attribute that actually drives the choice. It is 44px, which is also the
 * minimum touch target, so the row cannot shrink below a tappable height.
 *
 * NOT A `<table>`. These are 54 single-select controls, not tabular data: one
 * column of names and one of voices has no row/column relationship to read
 * across. `role="radiogroup"` + buttons keeps the semantics the card grid
 * already had (see `references/components.md`, "Selectable cards"), so the
 * keyboard story and the screen-reader story do not change with the view.
 */

import { Check, Mic } from "lucide-react";

import type { InterviewerOption } from "@/components/practice/steps/InterviewerStep";

/**
 * The voice name is mostly the face's own name again — "Scott Cowen" for Scott
 * Cowen, "Dexter - Professional" for Dexter Lawyer — and a 64px row has no
 * space for a restatement (house rule 3, "show less"). Keep only the part the
 * name does not already say: the voice profile ("Professional", "Lifelike"),
 * or nothing at all for the faculty, whose custom voice carries just their
 * name. The photo grid still shows the full voice name.
 */
function voiceDetail(name: string, voiceName: string): string | null {
  const firstWord = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  // Vendor voice names are "<face> - <profile>", or bare "<face>".
  const [lead, ...rest] = voiceName.split(/\s+-\s+/);
  const restates =
    lead?.trim().toLowerCase() === firstWord ||
    voiceName.trim().toLowerCase() === name.trim().toLowerCase();
  const detail = restates ? rest.join(" - ").trim() : voiceName.trim();
  return detail || null;
}

export interface InterviewerRowProps {
  interviewer: InterviewerOption;
  selected: boolean;
  suggested: boolean;
  /** Heading level for the name: matches the card grid's rule. */
  nameTag: "h3" | "h4";
  onSelect: () => void;
}

export default function InterviewerRow({
  interviewer,
  selected,
  suggested,
  nameTag: NameTag,
  onSelect,
}: InterviewerRowProps) {
  const detail = voiceDetail(interviewer.name, interviewer.voice.name);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-16 w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue ${
        selected
          ? "border-true-blue bg-light-blue/22"
          : "border-line bg-white hover:border-true-blue/50 hover:bg-canvas"
      }`}
    >
      {/* The full voice name stays in the accessible name even when the visible
          row drops it as a restatement, so the row never says less than the
          photo card did. */}
      <span className="sr-only">{`Voice: ${interviewer.voice.name}.`}</span>
      {interviewer.previewUrl ? (
        <img
          alt=""
          className="size-11 shrink-0 rounded-md object-cover"
          src={interviewer.previewUrl}
        />
      ) : (
        <span aria-hidden className="size-11 shrink-0 rounded-md bg-cwru-blue" />
      )}

      <span className="flex min-w-0 flex-1 flex-col">
        {/* Sentence-case label type, not the card's Newsreader: the house rule
            keeps the serif off dense rows and tables. */}
        <NameTag className="truncate text-[14.5px] font-semibold leading-5 text-ink">
          {interviewer.name}
        </NameTag>
        {detail && (
          <span className="mt-0.5 flex items-center gap-1 text-[12.5px] leading-4 text-muted">
            <Mic aria-hidden className="shrink-0" size={11} />
            <span aria-hidden className="truncate">{detail}</span>
          </span>
        )}
      </span>

      {suggested && !selected && (
        <span className="shrink-0 rounded-full bg-light-blue/40 px-2 py-0.5 text-[11px] font-semibold text-cwru-blue">
          Suggested
        </span>
      )}
      {selected && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-true-blue text-white">
          <Check size={13} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
