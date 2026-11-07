"use client";

/**
 * The live problem interview's on-screen materials: the problem prompt once
 * the interviewer has posed it, and every exhibit revealed so far.
 *
 * Lives inside the existing session side pane (no new room). Progressive
 * disclosure: nothing renders until there is something to read; then one tab
 * per item, the newest exhibit selected automatically when it arrives, and
 * the whole card collapsible so it never crowds the transcript on a phone.
 * Every earlier exhibit stays one tap away.
 *
 * Data comes only from the chat route's turn metadata (server-owned state);
 * this component never sees the bank, the facts, or an unrevealed exhibit.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import ExhibitView from "@/components/problem-interview/ExhibitView";
import type { ProblemLiveView } from "@/lib/problem-interview/session-state";

export default function CaseMaterialsPanel({ view }: { view: ProblemLiveView | null }) {
  const headingId = useId();
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string>("prompt");
  const [announcement, setAnnouncement] = useState("");
  const exhibitCount = view?.exhibits.length ?? 0;
  const seenExhibits = useRef(0);

  // A newly revealed exhibit takes focus of the card (not of the keyboard).
  useEffect(() => {
    if (!view || exhibitCount <= seenExhibits.current) return;
    const newest = view.exhibits[exhibitCount - 1];
    seenExhibits.current = exhibitCount;
    if (!newest) return;
    setSelected(newest.id);
    setOpen(true);
    setAnnouncement(`New exhibit on screen: ${newest.title}`);
  }, [view, exhibitCount]);

  if (!view || (!view.question && exhibitCount === 0)) return null;

  const tabs = [
    ...(view.question ? [{ id: "prompt", label: "Problem" }] : []),
    ...view.exhibits.map((exhibit, index) => ({ id: exhibit.id, label: `Exhibit ${index + 1}` })),
  ];
  const active = tabs.some((tab) => tab.id === selected) ? selected : tabs[0]!.id;
  const activeExhibit = view.exhibits.find((exhibit) => exhibit.id === active) ?? null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 border-b border-white/10 py-3"
      data-testid="case-materials"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-[13px] font-semibold text-light-blue">
          Case materials
        </h2>
        <button
          type="button"
          aria-expanded={open}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-light-blue hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      </div>

      {open ? (
        <>
          <div role="tablist" aria-labelledby={headingId} className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`${headingId}-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={tab.id === active}
                aria-controls={`${headingId}-panel`}
                className={`min-h-11 rounded-lg border px-3 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue motion-reduce:transition-none ${
                  tab.id === active
                    ? "border-light-blue bg-light-blue/15 text-white"
                    : "border-white/15 text-light-blue hover:border-light-blue/60"
                }`}
                onClick={() => setSelected(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            id={`${headingId}-panel`}
            role="tabpanel"
            aria-labelledby={`${headingId}-tab-${active}`}
            tabIndex={0}
            className="max-h-[32dvh] overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-3 lg:max-h-[42vh]"
          >
            {activeExhibit ? (
              <ExhibitView exhibit={activeExhibit} tone="room" />
            ) : view.question ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-semibold leading-6 text-white">
                  {view.question.title}
                </h3>
                <p className="text-[15px] leading-7 text-canvas" data-testid="case-prompt">
                  {view.question.prompt}
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
