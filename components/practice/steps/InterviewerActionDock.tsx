"use client";

/**
 * The interviewer picker's action dock: the selection summary and Continue.
 *
 * WHY IT FLOATS AT ALL. The roster is ~54 cards deep. A Continue button parked
 * under the last row costs the student a long scroll back after they pick a
 * face four rows down, which is the common case. So the dock pins to the
 * bottom of the viewport while there is still grid below it.
 *
 * WHY IT LANDS, AND WHAT CHANGED. The previous version was `sticky
 * -bottom-16` and never stopped: at the very end of the page it still hovered
 * over the content with its shadow on, which is a floating bar pretending to
 * be a footer. This version watches a sentinel placed after the grid, and once
 * the end of the list is in view the dock drops to `static` — shadow off,
 * overlapping nothing, reading as the end of the step.
 *
 * THE -4rem OFFSET IS KEPT FOR THE FLOATING STATE, and the old comment's
 * reason still holds: the scroll container is the content column's `<main>`,
 * which carries `pb-16` (see `components/main-content.tsx`). A plain
 * `sticky bottom-0` would park the dock 64px short of the viewport edge with a
 * strip of canvas under it — the floating-card look. `-bottom-16` with a
 * matching `pb-20` puts its hairline at the real bottom edge instead.
 *
 * THE LAST ROW CAN NEVER BE HIDDEN. Sticky stays in flow, so the dock always
 * occupies its own height after the grid; there is no height to measure and no
 * padding to reserve, and no configuration in which it overlaps a card at
 * rest. Landing drops `pb-20` for `pb-4`, which makes the page 64px shorter —
 * and that only pushes the sentinel further into view, so the state is
 * self-reinforcing rather than oscillating at the boundary.
 *
 * ONE CONSTRAINT INHERITED FROM THE OLD BAR, still load-bearing: no ancestor
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
  continueDisabled: boolean;
  onContinue: () => void;
}

export default function InterviewerActionDock({
  summary,
  continueDisabled,
  onContinue,
}: InterviewerActionDockProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Starts landed, not floating: with a filter down to three cards the end of
  // the grid is already on screen, and showing the floating state for one
  // frame before the observer corrects it is a visible flash.
  const [floating, setFloating] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // The sentinel sits between the grid and the dock, so "intersecting" means
    // the end of the list has been reached. The bottom margin discounts the
    // dock's own floating height: without it the dock would be sitting on top
    // of the sentinel and would land a beat early, while the last row is still
    // behind it.
    const observer = new IntersectionObserver(
      ([entry]) => setFloating(!entry?.isIntersecting),
      { rootMargin: "0px 0px -72px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden className="h-px" ref={sentinelRef} />
      <div
        // One hairline, square corners, the column's full width: a footer, not
        // a card. Only the shadow animates — position cannot tween, and the
        // 200ms fade is what makes the landing read as deliberate.
        className={`mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas pt-4 transition-shadow duration-200 ease-out motion-reduce:transition-none ${
          floating
            ? "sticky -bottom-16 z-30 pb-20 shadow-[0_-12px_20px_-16px_rgb(9_20_58/0.35)]"
            : "static pb-4 shadow-none"
        }`}
        data-dock-state={floating ? "floating" : "landed"}
      >
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
