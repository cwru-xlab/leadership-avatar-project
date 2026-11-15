"use client";

/**
 * The header band for a practice type's setup pages (interviews, pitches,
 * networking): back link, the type's icon on a white tile, its title, one line
 * of what happens, and its facts as chips. CWRU Blue with the dot texture, the
 * same band study plans and mastery use, so practice reads as one product.
 * The Orange title rule sits under the title, as on plain headers
 * (`components/shell/PageTitle`).
 *
 * Optional `action`: a page whose setup runs long (the interview customization
 * page) can hand its forward action to the band instead of to a bar that
 * floats over the form. The prop is additive — with no `action` the markup is
 * exactly what it has always been and no observer runs, so every other caller
 * renders identically. With one, the band also condenses into a 56px strip
 * pinned to the top of the scrolling content column once the band itself has
 * scrolled away, so the action stays one click away without anything ever
 * covering content mid-page. The action is secondary weight here (bordered
 * white on the blue band); the page keeps its one CWRU Blue primary button at
 * the end of its form.
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface HeroFact {
  icon: LucideIcon;
  label: string;
}

export default function PracticeHero({
  icon: Icon,
  title,
  description,
  facts,
  backHref = "/",
  backLabel = "Practice",
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  facts: HeroFact[];
  backHref?: string;
  backLabel?: string;
  /** This page's forward action, shown in the band and in the condensed strip. */
  action?: React.ReactNode;
}) {
  const bandRef = useRef<HTMLElement>(null);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const band = bandRef.current;
    if (!action || !band || typeof IntersectionObserver === "undefined") return;
    // Condense only once the whole band has left the top of the scrollport, so
    // the strip can never stack underneath the band it stands in for.
    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(band);
    return () => observer.disconnect();
  }, [action]);

  return (
    <>
      {action && (
        /* The condensed strip, emitted as a sibling of the band (a fragment,
           not a wrapper) on purpose: a sticky element only stays pinned inside
           its containing block, and the band's own wrapper is just as tall as
           the band. The anchor is zero-height so the strip costs no layout
           space and the page cannot jump as it appears; `-mb-6` cancels the
           page column's `gap-6`, and `-mx-4/-mx-8` cancels the content
           column's padding so the strip spans it edge to edge (the same
           cancellation the old bottom bar used — it adds no page width).

           `-top-6 md:-top-8` cancels the column's `pt-6 md:pt-8`: sticky
           resolves `top` against the scrollport's CONTENT box, so a plain
           `top-0` parks the strip 24/32px down and leaves a band of canvas
           above it with the page's own content scrolling through the gap. */
        <div className="sticky -top-6 z-30 -mx-4 -mb-6 h-0 md:-top-8 md:-mx-8">
          <div
            className={`flex h-14 items-center gap-3 bg-cwru-blue px-4 transition duration-200 ease-out motion-reduce:transition-none md:px-8 ${
              condensed ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
            }`}
            inert={!condensed}
          >
            <Link
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-[13px] font-semibold text-light-blue hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-blue"
              href={backHref}
            >
              <ArrowLeft aria-hidden size={16} />
              <span className="hidden sm:inline">{backLabel}</span>
              <span className="sr-only sm:hidden">{backLabel}</span>
            </Link>
            <p className="min-w-0 flex-1 truncate font-display text-[17px] font-medium text-white">{title}</p>
            <div className="shrink-0">{action}</div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:text-cwru-blue"
          href={backHref}
        >
          <ArrowLeft aria-hidden size={16} />
          {backLabel}
        </Link>
        <header
          ref={bandRef}
          className="relative flex flex-col gap-5 overflow-hidden rounded-2xl bg-cwru-blue px-6 py-6 text-white sm:flex-row sm:items-center md:px-7"
        >
          <span aria-hidden className="la-dots absolute inset-0 opacity-70" />
          <span className="relative hidden size-[76px] shrink-0 place-items-center la-hero-tile sm:grid rounded-[20px] bg-white text-cwru-blue">
            <Icon aria-hidden size={38} strokeWidth={1.6} />
          </span>
          <div className="relative flex min-w-0 flex-col gap-2">
            <h1 className="la-title-rule font-display text-[28px] font-medium leading-[1.1] md:text-[32px]">{title}</h1>
            <p className="max-w-[62ch] text-[15px] leading-6 text-light-blue">{description}</p>
            {facts.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-2">
                {facts.map(({ icon: FactIcon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-[12.5px] font-semibold text-white"
                  >
                    <FactIcon aria-hidden size={14} strokeWidth={2} />
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {action && <div className="relative shrink-0 sm:ml-auto">{action}</div>}
        </header>
      </div>
    </>
  );
}
