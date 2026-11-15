"use client";

/**
 * The interviewer picker's closing action: the house step footer, plus the
 * shared floating pill that stands in for it while it is off screen.
 *
 * WHAT THIS REPLACED, AND WHY. The first version was a dock that hovered over
 * the grid (`sticky -bottom-16`) because the roster is ~54 cards deep and a
 * Continue parked under the last row costs a long scroll back. But a bordered
 * card floating across the photographs made this step the only one in the
 * wizard that does not end in the plain `border-t` footer every other step uses
 * (`ResumeStep`, `JobDescriptionStep`, and the rest).
 *
 * So the footer is now that same house footer, in flow, overlapping nothing —
 * and reachability moves to `components/shell/FloatingAction`, which the
 * customize page now uses too. The pill lives there rather than here because
 * the two pages had drifted into two different pinned affordances (a corner
 * pill on this page, a full-column bar on the other); one component is what
 * keeps them identical. Its header comment carries the geometry reasoning —
 * why a pill and not a bar, and why it is sticky rather than fixed.
 *
 * The pill's own show/hide rule covers the case that used to need a bespoke
 * sentinel here: with the roster filtered to one card the column still scrolls
 * (hero, toolbar and headings outrun the viewport), so a naive "footer off
 * screen" test would pin a Continue over a one-card result. `FloatingAction`
 * also requires its in-flow marker to have scrolled away, which that case never
 * satisfies.
 */

import { Button } from "@heroui/button";
import { ArrowRight } from "lucide-react";
import { useRef, type ReactNode } from "react";

import FloatingAction from "@/components/shell/FloatingAction";

export interface InterviewerActionDockProps {
  /** The summary line — "Selected X", or the choose-one prompt. */
  summary: ReactNode;
  /** Same line, condensed for the pill, where there is one line and no wrap. */
  pillSummary?: ReactNode;
  continueDisabled: boolean;
  onContinue: () => void;
  /** The card grid. Rendered between the pill's anchor and the footer. */
  children: ReactNode;
}

export default function InterviewerActionDock({
  summary,
  pillSummary,
  continueDisabled,
  onContinue,
  children,
}: InterviewerActionDockProps) {
  // The footer's own button is what the pill stands in for, so the pill retires
  // the moment this is reachable rather than at some proxy position near it.
  const footerActionRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <FloatingAction inFlowRef={footerActionRef} label={pillSummary ?? summary}>
        <Button
          className="h-9 shrink-0 rounded-full bg-white px-4 font-semibold text-cwru-blue data-[hover=true]:bg-light-blue"
          endContent={<ArrowRight aria-hidden size={15} strokeWidth={2.5} />}
          isDisabled={continueDisabled}
          onPress={onContinue}
        >
          Continue
        </Button>
      </FloatingAction>

      {children}

      {/* The house step footer, identical in shape to every other wizard step. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-sm text-muted">{summary}</p>
        <div ref={footerActionRef}>
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
      </div>
    </>
  );
}
