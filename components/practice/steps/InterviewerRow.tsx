"use client";

/**
 * One interviewer as a compact row: thumbnail, name, voice, selected tick.
 *
 * WHY THIS EXISTS. The photo cards are 240px tall, so 54 of them run ~6.9
 * screens of scrolling and the "General business" group alone is 3,600px. The
 * design system already answers this shape of problem for the report's growth
 * areas — "a grid (3 columns at desktop, 2 at tablet, 1 at mobile) rather than
 * one column — at nineteen rows a single column towers down the stage". A row
 * is ~74px, and three per line, so the same roster lands in ~3 screens rather
 * than ~6.9.
 *
 * WHY THE PHOTO STAYS, AND WHY IT IS CROPPED. The student is picking a FACE to
 * talk to, so a text-only table would be the wrong trade: the thumbnail keeps
 * the one attribute that actually drives the choice.
 *
 * It was 44px and uncropped, and the verdict on that was "the images are quite
 * a bit too small since it will be difficult for users to make out what the
 * avatar looks like". Measuring the roster showed the dominant cause was
 * FRAMING rather than pixels: all 54 `previewUrl` stills are 16:9, and the five
 * faculty were filmed STANDING, so a centred square crop spent the thumbnail on
 * a torso, a desk and a bookshelf while the head occupied only ~17% of frame
 * height — a ~7px face. Scaling the box alone could not rescue that: 64px
 * uncropped still only buys a ~10px face.
 *
 * So the fix is a head-and-shoulders crop (`rosterThumbnailFramingStyle`, which
 * also records the per-shoot-family measurements) plus a modest 44 -> 56px
 * bump. The crop does the work and the bump makes the cropped face comfortable
 * rather than merely possible.
 *
 * WHAT THE BUMP COSTS, MEASURED. The row is `min-h-16` (64px) with `p-2` and a
 * 1px border, so the largest thumbnail that leaves the 64px pitch untouched is
 * 46px — anything bigger sets the row's height itself. 56px therefore takes the
 * pitch to 74px, which measures as ~8% more scrolling at 1440 (2.84 -> 3.06
 * viewport-heights) and ~10% at 375 (8.40 -> 9.25). That is the price of this
 * row being legible, and it is small next to the ~55% the list still saves over
 * the photo grid (3.06 against 6.88 viewport-heights at 1440), so the density
 * win that motivated this view survives intact.
 *
 * Both neighbours were rejected on evidence. 46px is the largest free size and
 * buys almost nothing over today's 44px, so it would have answered "the faces
 * are too small" by optimising the scroll metric instead of the complaint.
 * 64px would push the pitch to 82px (~13% at 1440) for a face already
 * comfortable at 56px. `min-h-16` is kept as a FLOOR, not a target: it is inert
 * at this thumbnail size but still guarantees a tappable row if the thumbnail
 * ever shrinks again.
 *
 * NOT A `<table>`. These are 54 single-select controls, not tabular data: one
 * column of names and one of voices has no row/column relationship to read
 * across. `role="radiogroup"` + buttons keeps the semantics the card grid
 * already had (see `references/components.md`, "Selectable cards"), so the
 * keyboard story and the screen-reader story do not change with the view.
 */

import { Check } from "lucide-react";

import { rosterThumbnailFramingStyle } from "@/lib/avatar-framing";
import type { InterviewerOption } from "@/components/practice/steps/InterviewerStep";

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
      {interviewer.previewUrl ? (
        /* WRAPPER, not a bare <img>. The thumbnail is zoomed with a transform
           (see `rosterThumbnailFramingStyle`), and `overflow` does not apply
           to replaced elements — a transform on the <img> itself would spill
           past its own rounded corners. The clip has to live on a parent. */
        <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-canvas">
          <img
            alt=""
            className="size-full object-cover"
            src={interviewer.previewUrl}
            style={rosterThumbnailFramingStyle(interviewer.faculty)}
          />
        </span>
      ) : (
        <span aria-hidden className="size-14 shrink-0 rounded-md bg-cwru-blue" />
      )}

      <span className="flex min-w-0 flex-1 flex-col">
        {/* Sentence-case label type, not the card's Newsreader: the house rule
            keeps the serif off dense rows and tables.

            ONE name, no voice line. `InterviewerOption.name` is now derived
            from the voice name, so the mic line this row used to carry was
            either a restatement or vendor jargon ("IA", "Lifelike"). */}
        <NameTag className="truncate text-[14.5px] font-semibold leading-5 text-ink">
          {interviewer.name}
        </NameTag>
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
