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
 * page) can hand its forward action to the band instead of to a bar that floats
 * over the form. The prop is additive — with no `action` the markup is exactly
 * what it has always been, so every other caller renders identically. The
 * action is secondary weight here (bordered white on the blue band); the page
 * keeps its one CWRU Blue primary button at the end of its form.
 *
 * WHAT THIS NO LONGER DOES. The band used to also emit a condensed 56px CWRU
 * Blue strip, sticky to the top of the scrolling content column, carrying the
 * back link, the title and the action once the band had scrolled away. It is
 * gone, for two reasons that could not be fixed in place:
 *
 *  - IT COULD NOT REACH THE EDGES. The scrollport is `<main>`, which is centred
 *    and capped (`mx-auto max-w-[1144px]` plus `px-4 md:px-8`, see
 *    `components/main-content.tsx`). Past 1144px of content area there is a
 *    gutter on each side that nothing rendered inside main can cross — negative
 *    margins cancel main's padding, not its centring — so the strip stopped
 *    short of the sidebar on the left and of the viewport on the right and read
 *    as clipped. (Its first version carried `-mx-4 md:-mx-8` and was instead
 *    57px WIDER than the cards on each side. Neither aligned to anything.)
 *  - IT DOUBLED THE PRIMARY ACTION. It stayed pinned at the bottom of the page,
 *    where the form's own "Continue to setup" is on screen, so two competing
 *    CWRU Blue Continues were up at once.
 *
 * The replacement is `components/shell/FloatingAction`, rendered by the page
 * rather than by the band: a compact pill that needs no edge to align to, and
 * that hides whenever the real in-flow action is visible. The back link and the
 * title are NOT in it — they stay here, in the in-flow band, which is where a
 * student looks for them and the only place they sit in keyboard order.
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";

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
  /** This page's forward action, shown in the band. */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:text-cwru-blue"
        href={backHref}
      >
        <ArrowLeft aria-hidden size={16} />
        {backLabel}
      </Link>
      <header className="relative flex flex-col gap-5 overflow-hidden rounded-2xl bg-cwru-blue px-6 py-6 text-white sm:flex-row sm:items-center md:px-7">
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
  );
}
