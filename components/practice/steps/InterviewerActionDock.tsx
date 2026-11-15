"use client";

/**
 * The interviewer picker's closing action: the house step footer, plus a strip
 * that pins the same action to the top of the column while the footer is off
 * screen.
 *
 * WHAT THIS REPLACED, AND WHY. The previous version was a dock that hovered
 * over the grid (`sticky -bottom-16`) because the roster is ~54 cards deep and
 * a Continue parked under the last row costs a long scroll back. But a bordered
 * card floating across the photographs is the same thing we just removed from
 * the customize page, and it made this step the only one in the wizard that
 * does not end in the plain `border-t` footer every other step uses
 * (`ResumeStep`, `JobDescriptionStep`, and the rest).
 *
 * So the footer is now that same house footer, in flow, overlapping nothing —
 * and reachability moves to a compact CWRU Blue pill pinned to the top-right of
 * the column, a condensed cousin of the strip `PracticeHero` shows on the
 * customize page. Same placement and colour, so the two screens still read as
 * one system; pill rather than full-bleed bar because this column is wall-to-
 * wall photography and a 56px slab cut 2-4 faces in half at every scroll
 * position (measured). Nothing covers content that matters.
 *
 * WHY THE STRIP IS STICKY AND WHERE IT SITS. A sticky box pins only from its
 * own natural position downward, so the anchor is rendered BEFORE the grid
 * (hence `children`): from the top of the list to the end of the section. Its
 * containing block is the step's `<section>`, which spans the whole step, so it
 * tracks the entire scroll. The anchor is zero-height, so it costs no layout
 * space and the page cannot jump when the strip fades in; `-mx-4`/`-mx-8`
 * cancels the content column's padding so the pill can sit against the
 * column's true right edge.
 *
 * ONE CONSTRAINT INHERITED FROM THE OLD DOCK, still load-bearing: no ancestor
 * inside the content column may create a scroll container, or `position:
 * sticky` silently stops tracking. See the `overflow-x-clip` (not
 * `overflow-hidden`) note in `components/practice/routes/PracticeTypePage.tsx`.
 */

import { Button } from "@heroui/button";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface InterviewerActionDockProps {
  /** The summary line — "Selected X", or the choose-one prompt. */
  summary: ReactNode;
  /** Same line, condensed for the strip, where there is one line and no wrap. */
  stripSummary?: ReactNode;
  continueDisabled: boolean;
  onContinue: () => void;
  /** The card grid. Rendered between the strip's anchor and the footer. */
  children: ReactNode;
}

export default function InterviewerActionDock({
  summary,
  stripSummary,
  continueDisabled,
  onContinue,
  children,
}: InterviewerActionDockProps) {
  const headRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Starts hidden, not shown: with a filter down to three cards the footer is
  // already on screen, and showing the strip for one frame before the observer
  // corrects it is a visible flash.
  const [showStrip, setShowStrip] = useState(false);

  useEffect(() => {
    const head = headRef.current;
    const sentinel = sentinelRef.current;
    if (!head || !sentinel) return;
    const column = head.closest("main");
    if (!column) return;

    /**
     * TWO conditions, because each one alone shows the strip at a moment it
     * should not.
     *
     * 1. PINNED. The sticky anchor is zero-height, so before the page scrolls
     *    the strip sits at its natural position — directly on top of the
     *    toolbar, covering the search field. `head` is a plain, non-sticky
     *    marker at that same spot, so "head has left the top of the column"
     *    means the strip is genuinely pinned rather than resting on content.
     *    The comparison uses the column's PADDING box (`clientTop` worth of
     *    padding above the content), matching the `-top-6/-top-8` the strip
     *    uses to cancel that same padding.
     *
     * 2. CARDS LEFT. The tempting rule "show it when the footer is off screen"
     *    is wrong here and measurably so: even a roster filtered to ONE card
     *    leaves the column scrollable (hero, toolbar and section headings
     *    outrun the viewport) with the footer off screen, so that rule would
     *    pin a Continue over a one-card result. The sentinel sits between the
     *    grid and the footer, so "still below the column's bottom" means there
     *    are cards the student has not reached. Once it rises into view the
     *    footer is a flick away and the pill retires.
     */
    const update = () => {
      const columnBox = column.getBoundingClientRect();
      const pinned = head.getBoundingClientRect().top < columnBox.top;
      const cardsLeft = sentinel.getBoundingClientRect().top > columnBox.bottom;
      setShowStrip(pinned && cardsLeft);
    };

    update();
    column.addEventListener("scroll", update, { passive: true });
    // A filter changes the grid's height with no scroll, so a scroll listener
    // alone would hold a stale answer.
    const resize = new ResizeObserver(update);
    resize.observe(column);
    return () => {
      column.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, []);

  return (
    <>
      {/* Non-sticky marker at the strip's natural position: the "is it actually
          pinned?" probe. See the effect above. */}
      <div aria-hidden className="h-px" ref={headRef} />
      <div className="sticky -top-6 z-30 -mx-4 h-0 md:-top-8 md:-mx-8">
        {/* A right-aligned PILL, not a full-bleed bar.
            The customize page's strip spans the column because it is the hero
            band condensing, and it crosses form tiles with whitespace between
            them. Here the same shape crossed edge-to-edge photographs and cut
            2-4 faces in half at every scroll position — over imagery, a solid
            56px slab reads as damage rather than chrome. An auto-width pill in
            the corner keeps the placement and the colour (so the two screens
            still behave alike) while covering one card's corner instead of a
            whole row. `pt-3`/`pr-4` inset it from the column's edge. */}
        <div
          className={`flex justify-end px-4 pt-3 transition duration-200 ease-out motion-reduce:transition-none md:px-8 ${
            showStrip ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
          }`}
          inert={!showStrip}
        >
          <div className="flex max-w-full items-center gap-3 rounded-full bg-cwru-blue py-2 pl-5 pr-2 shadow-[0_12px_32px_rgb(9_20_58/0.16)]">
            <p className="hidden min-w-0 truncate text-[13px] text-light-blue sm:block">
              {stripSummary ?? summary}
            </p>
            <Button
              className="h-9 shrink-0 rounded-full bg-white px-4 font-semibold text-cwru-blue data-[hover=true]:bg-light-blue"
              endContent={<ArrowRight aria-hidden size={15} strokeWidth={2.5} />}
              isDisabled={continueDisabled}
              onPress={onContinue}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>

      {children}

      {/* Between the grid and the footer: the strip's "are there cards left?"
          probe. See the effect above. */}
      <div aria-hidden className="h-px" ref={sentinelRef} />

      {/* The house step footer, identical in shape to every other wizard step. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-sm text-muted">{summary}</p>
        <Button
          color="primary"
          endContent={<ArrowRight size={17} />}
          isDisabled={continueDisabled}
          size="lg"
          onPress={onContinue}
        >
          Continue
        </Button>
      </div>
    </>
  );
}
