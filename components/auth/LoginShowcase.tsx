"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import clsx from "clsx";

interface Slide {
  label: string;
  /** Under /public. Missing while a page awaits its redesign; the slot says so. */
  src?: string;
}

// Real screens from the app, captured at 1440x900 with seeded data. Add each
// page here once its redesign ships (and the live session once the avatar
// shell is redone).
const SLIDES: Slide[] = [
  { label: "Pick what to practice", src: "/login-showcase/practice.png" },
  { label: "Read your scored report", src: "/login-showcase/report.png" },
  { label: "Follow your study plan", src: "/login-showcase/plan.png" },
  { label: "Watch your mastery move", src: "/login-showcase/mastery-first-measured.png" },
];

const ADVANCE_MS = 6000;

/**
 * The login brand panel's product showcase: one screen at a time, framed as a
 * browser window that always fits inside the panel (by width and by height). It advances slowly on its own, pauses while
 * hovered or focused, and never moves for reduced-motion users; the dots are
 * always available.
 */
export function LoginShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || SLIDES.length < 2) return;
    const timer = window.setTimeout(
      () => setActive((index) => (index + 1) % SLIDES.length),
      ADVANCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, paused, reducedMotion]);

  return (
    <div
      aria-label="Screens from Leadership Avatar"
      aria-roledescription="carousel"
      className="flex min-h-0 w-full flex-col gap-4"
      role="region"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5" role="group" aria-label="Choose a screen">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.label}
              aria-current={index === active}
              aria-label={slide.label}
              className="grid size-6 place-items-center rounded-full focus-visible:outline-light-blue"
              type="button"
              onClick={() => setActive(index)}
            >
              <span
                className={clsx(
                  "block h-1.5 rounded-full transition-all duration-200 ease-out",
                  index === active ? "w-5 bg-white" : "w-1.5 bg-white/40",
                )}
              />
            </button>
          ))}
        </div>
        <p aria-live="polite" className="text-sm font-semibold text-white">
          {SLIDES[active].label}
        </p>
      </div>

      {/* A browser-window frame: the screens carry their own CWRU Blue
          sidebar, which would otherwise melt into this blue panel. The stage
          is a size container so the frame takes the largest 1440x900 box
          (plus its 2rem toolbar) that fits both the panel's width and the
          height left under the copy. */}
      <div
        className="min-h-0 [container-type:size]"
        // The frame's full height at the column's width (16:10 plus the 2rem
        // toolbar); it shrinks from there when the panel is short.
        style={{ height: "calc(min(100cqw, 880px) / 1.6 + 2rem)" }}
      >
        <div
          className="max-w-[880px] overflow-hidden rounded-xl bg-white shadow-[0_24px_64px_rgb(0_0_0/0.35)] ring-1 ring-white/40"
          style={{ width: "min(100cqw, calc((100cqh - 2rem) * 1.6))" }}
        >
          <div
            aria-hidden
            className="flex h-8 items-center gap-1.5 border-b border-line bg-canvas px-3"
          >
            <span className="size-2.5 rounded-full bg-light-blue" />
            <span className="size-2.5 rounded-full bg-light-blue" />
            <span className="size-2.5 rounded-full bg-light-blue" />
            <span className="ml-3 h-4 w-56 rounded-sm bg-white" />
          </div>
          <div className="relative aspect-[1440/900] w-full bg-ink">
            {SLIDES.map((slide, index) => (
              <div
                key={slide.label}
                aria-hidden={index !== active}
                className={clsx(
                  "absolute inset-0 transition-opacity duration-500 ease-out",
                  index === active ? "opacity-100" : "opacity-0",
                )}
              >
                {slide.src ? (
                  <Image
                    fill
                    alt={slide.label}
                    className="object-cover object-left-top"
                    priority={index === 0}
                    sizes="880px"
                    src={slide.src}
                  />
                ) : (
                  <div className="grid h-full place-items-center border border-dashed border-light-blue/60 text-sm text-light-blue">
                    Screenshot added once this page is redesigned
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
