"use client";

/**
 * The client tracks `furthest` only to report it. The authority is
 * `InteractionReport.slideHighWaterMark`, ratcheted server-side in
 * `lib/pitch/slide-reveal.ts`. This component never holds slide TEXT and
 * never decides what the avatar can see (14-RESEARCH.md Pitfall 2).
 *
 * No engagement indicator lives here or anywhere else.
 */

import { Button } from "@heroui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface DeckViewerSlideMeta {
  index: number;
  widthPx: number;
  heightPx: number;
}

export interface DeckViewerPanelProps {
  deckId: string;
  slides: DeckViewerSlideMeta[];
  onFurthestChange: (furthestIndex: number) => void;
}

function slideUrl(deckId: string, index: number, thumb = false): string {
  const base = `/api/practice/deck/${deckId}/slide/${index}`;
  return thumb ? `${base}?v=thumb` : base;
}

export default function DeckViewerPanel({
  deckId,
  slides,
  onFurthestChange,
}: DeckViewerPanelProps) {
  const [current, setCurrent] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const furthestRef = useRef(0);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onFurthestChangeRef = useRef(onFurthestChange);

  useEffect(() => {
    onFurthestChangeRef.current = onFurthestChange;
  }, [onFurthestChange]);

  // First slide is revealed from turn one — report mark 0 on mount.
  useEffect(() => {
    onFurthestChangeRef.current(0);
  }, []);

  const goTo = useCallback((rawIndex: number) => {
    if (slides.length === 0) return;
    const index = Math.max(0, Math.min(slides.length - 1, rawIndex));
    setCurrent(index);
    // CONTEXT.md: "navigating back to slide 3 after reaching slide 7 does
    // not un-show 4-7 — the investor already saw them."
    if (index > furthestRef.current) {
      furthestRef.current = index;
      setFurthest(index);
      onFurthestChange(index);
    }
  }, [onFurthestChange, slides.length]);

  // Keyboard: arrows + page keys. Skip when focus is in a text field so the
  // shell's typed answers still work.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goTo(current + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goTo(current - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, goTo]);

  // Keep the active thumbnail in view.
  useLayoutEffect(() => {
    const el = thumbRefs.current[current];
    if (!el) return;
    el.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [current]);

  if (slides.length === 0) {
    return (
      <div className="rounded-xl border border-white/15 bg-[#07131f]/85 px-4 py-3 text-sm text-[#d3e7f5]">
        No slides available for this deck.
      </div>
    );
  }

  const meta = slides[current] ?? slides[0];
  const stageSrc = slideUrl(deckId, current);
  const prevIndex = current > 0 ? current - 1 : null;
  const nextIndex = current < slides.length - 1 ? current + 1 : null;
  const counterLabel = `Slide ${current + 1} of ${slides.length}`;

  return (
    <div
      aria-label="Pitch deck viewer"
      className="pointer-events-auto relative flex w-full flex-col gap-2 rounded-xl border border-white/15 bg-[#07131f]/90 p-2 shadow-lg backdrop-blur-md"
      role="region"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9eb6c6]">
          Your deck
        </p>
        <p className="text-xs font-medium tabular-nums text-[#d3e7f5]">
          {current + 1} / {slides.length}
        </p>
      </div>

      <div className="flex items-stretch gap-1.5">
        <Button
          isIconOnly
          aria-label="Previous slide"
          className="h-auto min-h-10 shrink-0 self-center border border-white/15 bg-white/5 text-white"
          isDisabled={current <= 0}
          size="sm"
          variant="flat"
          onPress={() => goTo(current - 1)}
        >
          <ChevronLeft size={18} />
        </Button>

        <div className="relative flex min-h-[10rem] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#041018]">
          {/* object-fit: contain — portrait and landscape both upright, uncropped */}
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated byte route, not a static asset */}
          <img
            alt={counterLabel}
            className="max-h-[36vh] w-full object-contain"
            draggable={false}
            height={meta.heightPx}
            key={stageSrc}
            src={stageSrc}
            width={meta.widthPx}
          />
        </div>

        <Button
          isIconOnly
          aria-label="Next slide"
          className="h-auto min-h-10 shrink-0 self-center border border-white/15 bg-white/5 text-white"
          isDisabled={current >= slides.length - 1}
          size="sm"
          variant="flat"
          onPress={() => goTo(current + 1)}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {/* Preload neighbours so advancing is instant during a live pitch. */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 overflow-hidden"
      >
        {prevIndex != null ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated byte route preload
          <img alt="" src={slideUrl(deckId, prevIndex)} />
        ) : null}
        {nextIndex != null ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated byte route preload
          <img alt="" src={slideUrl(deckId, nextIndex)} />
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {counterLabel}
      </p>

      <div
        aria-label="Slide thumbnails"
        className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]"
      >
        {slides.map((slide) => {
          const isCurrent = slide.index === current;
          const isSeen = slide.index <= furthest;
          return (
            <button
              key={slide.index}
              ref={(el) => {
                thumbRefs.current[slide.index] = el;
              }}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Slide ${slide.index + 1}${isCurrent ? ", current" : ""}${isSeen ? ", shown to the investor" : ", not yet shown"}`}
              className={[
                "relative shrink-0 overflow-hidden rounded-md border-2 transition",
                isCurrent
                  ? "border-[#53a9de] ring-1 ring-[#53a9de]/50"
                  : isSeen
                    ? "border-white/35"
                    : "border-white/10 opacity-80",
              ].join(" ")}
              style={{ width: 64, height: 48 }}
              title={isSeen ? "Shown to the investor" : "Not yet shown"}
              type="button"
              onClick={() => goTo(slide.index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated thumb byte route */}
              <img
                alt={`Slide ${slide.index + 1}`}
                className="h-full w-full bg-[#041018] object-contain"
                draggable={false}
                loading="lazy"
                src={slideUrl(deckId, slide.index, true)}
              />
              {isSeen ? (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#72d6b0]"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
