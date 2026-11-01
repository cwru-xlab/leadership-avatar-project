"use client";

/**
 * The header band for a practice type's setup pages (interviews, pitches,
 * networking): back link, the type's icon on a white tile, its title, one line
 * of what happens, and its facts as chips. CWRU Blue with the dot texture, the
 * same band study plans and mastery use, so practice reads as one product.
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
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  facts: HeroFact[];
  backHref?: string;
  backLabel?: string;
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
        <span className="relative hidden size-[76px] shrink-0 place-items-center sm:grid rounded-[20px] bg-white text-cwru-blue shadow-[0_6px_0_rgb(166_210_230/0.8)]">
          <Icon aria-hidden size={38} strokeWidth={1.6} />
        </span>
        <div className="relative flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-[28px] font-medium leading-[1.1] md:text-[32px]">{title}</h1>
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
      </header>
    </div>
  );
}
