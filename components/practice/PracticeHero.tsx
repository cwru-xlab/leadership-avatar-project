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
           page column's `gap-6`.

           `-top-6 md:-top-8` cancels the column's `pt-6 md:pt-8`: sticky
           resolves `top` against the scrollport's CONTENT box, so a plain
           `top-0` parks the strip 24/32px down and leaves a band of canvas
           above it with the page's own content scrolling through the gap.

           NO HORIZONTAL BLEED. This used to carry `-mx-4 md:-mx-8` to cancel
           the content column's padding and span it edge to edge, which
           measured 57px WIDER than the cards on each side at every width: a
           dark slab overhanging everything it floated above, aligned to
           nothing on the page. Dropping the negative margins lets it inherit
           the column's own width, so its left and right edges land exactly on
           the card edges below it — the thing that makes it read as part of
           the page rather than a bar on top of it. */
        <div className="sticky -top-6 z-30 -mb-6 h-0 md:-top-8">
          <div
            className={`flex h-14 items-center gap-3 rounded-b-xl bg-cwru-blue px-4 shadow-[0_10px_24px_rgb(9_20_58/0.18)] transition duration-200 ease-out motion-reduce:transition-none md:px-5 ${
              condensed ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
            }`}
            inert={!condensed}
          >
            {/* `rounded-b-xl` only at the BOTTOM: the strip is anchored to the
                top of the scrollport, so square top corners read as "attached
                to the edge" while the bottom corners match the cards' own
                radius. The shadow does the rest of the joining work — it lifts
                the strip over the content it covers, which is what tells a
                student the page is scrolling UNDER a fixed element rather than
                a stray panel hovering mid-column. */}
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
