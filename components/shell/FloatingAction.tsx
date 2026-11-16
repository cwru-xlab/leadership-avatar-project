"use client";

/**
 * THE SCROLLED-AWAY PRIMARY ACTION. A compact pill that floats in the top-right
 * of the content column while a page's real, in-flow action is off screen, and
 * retires the instant that action comes back into view.
 *
 * WHAT THIS REPLACED, AND WHY IT IS A PILL. Both of this app's long setup pages
 * — the interviewer picker (~54 cards) and the interview customization form —
 * grew a pinned CWRU Blue BAR across the top of the content column, and the bar
 * failed twice for two different reasons:
 *
 *  1. IT CANNOT REACH THE EDGES. The shell's `<main>` is the scrollport and it
 *     is centred and capped (`mx-auto max-w-[1144px]` plus `px-4 md:px-8`, see
 *     `components/main-content.tsx`). Past 1144px of content area there is a
 *     gutter on each side that nothing rendered INSIDE main can cross —
 *     negative margins cancel main's padding but not its centring. So a bar
 *     built in the page always stopped short of the sidebar on the left and of
 *     the viewport on the right, and read as clipped. Making it genuinely
 *     full-bleed means hoisting it out of main into the shell, which is a lot of
 *     plumbing (context or a portal) for a scroll affordance.
 *  2. IT COVERED CONTENT THAT MATTERED. On the picker, a 56px slab crossed
 *     wall-to-wall photography and cut 2-4 faces in half at every scroll
 *     position (measured).
 *
 * A pill sidesteps both: it never needs to touch an edge, so the centring is
 * irrelevant, and it covers one card's corner instead of a whole row.
 *
 * ONE PRIMARY ACTION AT A TIME. The bar it replaces had a real bug visible on
 * the customize page: it stayed pinned at the bottom of the page, where the
 * form's own "Continue to setup" is on screen, so two competing primary buttons
 * were up at once. Hence `inFlowRef` — the pill is the stand-in for exactly one
 * real control and hides whenever that control can be seen or clicked.
 *
 * WHY THE PILL IS STICKY, AND WHERE TO PUT IT. A sticky box pins only from its
 * own natural position downward and only inside its containing block, so render
 * this IN FLOW at the point after which it should start floating (after the hero
 * band, before a long grid) and inside a block that spans the rest of the page.
 * Both of its own elements are zero-height, so it costs no layout space and the
 * page cannot jump as the pill fades in. `-top-6 md:-top-8` cancels the
 * column's `pt-6 md:pt-8`: sticky resolves `top` against the scrollport's
 * CONTENT box, so a plain `top-0` parks the pill 24/32px down and leaves a band
 * of canvas above it with page content scrolling through the gap.
 *
 * ONE INHERITED CONSTRAINT, still load-bearing: no ancestor inside the content
 * column may create a scroll container, or `position: sticky` silently stops
 * tracking. See the `overflow-x-clip` (not `overflow-hidden`) note in
 * `components/practice/routes/PracticeTypePage.tsx`.
 */

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

export interface FloatingActionProps {
  /**
   * The page's REAL action — the in-flow button this pill stands in for. While
   * any part of it is inside the scrollport the pill stays down, so the page
   * never shows two primary actions at once.
   */
  inFlowRef: RefObject<HTMLElement | null>;
  /**
   * A short state line, shown left of the button from `sm` up and dropped
   * below it. State ("Selected Dana Reeves"), not navigation: the back link and
   * the page title stay in the in-flow hero band, which is where a student
   * looks for them and the only place they are keyboard-reachable in order.
   */
  label?: ReactNode;
  /** The button. Styled by the caller; see the callers for the house treatment. */
  children: ReactNode;
  /**
   * Applied to BOTH zero-height elements. A parent column with `gap-*` adds a
   * gap row for each child, so a caller in one (the customize page's `gap-6`
   * column) passes `-mb-6` here to cancel the two rows these would otherwise
   * open up. Callers in a plain block pass nothing.
   */
  className?: string;
}

export default function FloatingAction({
  inFlowRef,
  label,
  children,
  className,
}: FloatingActionProps) {
  const headRef = useRef<HTMLDivElement>(null);
  /**
   * Starts hidden, not shown. On a filtered-down picker the real action is
   * already on screen, and showing the pill for one frame before the first
   * measurement corrects it is a visible flash.
   */
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const column = head.closest("main");
    if (!column) return;

    /**
     * TWO conditions, because each one alone shows the pill at a moment it
     * should not.
     *
     * 1. SCROLLED PAST. The sticky anchor is zero-height, so before the page
     *    scrolls the pill sits at its natural position — on the picker that is
     *    directly on top of the filter toolbar, covering the search field.
     *    `head` is a plain, non-sticky marker at that same spot, so "head has
     *    left the top of the column" means the pill is genuinely pinned rather
     *    than resting on content. The comparison uses the column's PADDING box,
     *    matching the `-top-6/-top-8` the anchor uses to cancel that padding.
     *
     * 2. THE REAL ACTION IS OFF SCREEN. Measured against the scrollport rather
     *    than with an IntersectionObserver because `<main>` IS the scroll
     *    container here: a default-root observer compares against the viewport
     *    and reports the footer "intersecting" while it is actually clipped
     *    inside main, which is how the old bar ended up stacked over the
     *    customize page's own Continue.
     */
    const update = () => {
      const columnBox = column.getBoundingClientRect();
      const scrolledPast = head.getBoundingClientRect().top < columnBox.top;
      const target = inFlowRef.current;
      let realActionVisible = false;
      if (target) {
        const box = target.getBoundingClientRect();
        realActionVisible =
          box.height > 0 && box.bottom > columnBox.top && box.top < columnBox.bottom;
      }
      setShown(scrolledPast && !realActionVisible);
    };

    update();
    column.addEventListener("scroll", update, { passive: true });
    /**
     * A filter or a collapsed `<details>` changes the content height with no
     * scroll event, so a scroll listener alone would hold a stale answer. The
     * column's own box rarely changes, but its content wrapper's does — observe
     * both.
     */
    const resize = new ResizeObserver(update);
    resize.observe(column);
    if (column.firstElementChild) resize.observe(column.firstElementChild);
    return () => {
      column.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [inFlowRef]);

  return (
    <>
      {/* The non-sticky marker at the pill's natural position: the "is it
          actually pinned?" probe. See the effect above. */}
      <div aria-hidden className={clsx("h-px", className)} ref={headRef} />
      <div className={clsx("sticky -top-6 z-30 h-0 md:-top-8", className)}>
        <div
          className={clsx(
            "flex justify-end pt-3 transition duration-200 ease-out motion-reduce:transition-none",
            shown ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0",
          )}
          inert={!shown}
        >
          {/* `justify-end` puts the pill's right edge exactly on the content
              column's padding box — the card edge below it — so it lines up
              with the page instead of floating at an arbitrary offset, while
              main's own padding and centring keep it clear of the viewport
              edge. `max-w-full` plus `truncate` is what makes it degrade at
              375px rather than push the column wide; the shadow is the cue that
              says the page is scrolling UNDER a pinned element. */}
          <div
            className={clsx(
              "flex max-w-full items-center gap-3 rounded-full bg-cwru-blue py-2 pr-2 shadow-[0_12px_32px_rgb(9_20_58/0.16)]",
              label ? "pl-2 sm:pl-5" : "pl-2",
            )}
          >
            {label && (
              <p className="hidden min-w-0 truncate text-[13px] text-light-blue sm:block">{label}</p>
            )}
            <div className="shrink-0">{children}</div>
          </div>
        </div>
      </div>
    </>
  );
}
