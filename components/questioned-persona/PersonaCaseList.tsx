/**
 * Server-rendered case picker for a questioned-persona style. Reads the
 * seeded catalog on the server and passes only briefing-safe fields to the
 * page — hidden facts, cues and ICE never reach the browser from here.
 */

import Link from "next/link";
import { ArrowLeft, ArrowRight, HeartHandshake, Stethoscope } from "lucide-react";

import { listPersonaCases } from "@/lib/questioned-persona/cases";
import { disclaimerFor, PERSONA_STYLE_COPY } from "@/lib/questioned-persona/copy";
import type { PersonaStyle } from "@/lib/questioned-persona/types";
import { routes } from "@/lib/routes";

export default function PersonaCaseList({ style }: { style: PersonaStyle }) {
  const copy = PERSONA_STYLE_COPY[style];
  const Icon = style === "clinical-communication" ? Stethoscope : HeartHandshake;
  const cases = listPersonaCases(style).map((c) => ({
    id: c.id,
    title: c.title,
    tagline: c.personaCard.tagline,
    discipline: c.personaCard.discipline,
    setting: c.personaCard.setting,
    studentRole: c.studentRole,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Link className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:text-cwru-blue" href={routes.practice()}>
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Practice
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
          {copy.listTitle}
        </h1>
        <p className="max-w-2xl text-[15px] text-muted">{copy.listIntro}</p>
      </header>
      <p className="max-w-3xl rounded-xl border border-copper/40 bg-copper/[0.08] px-5 py-3 text-sm leading-6 text-ink" data-testid="persona-disclaimer" role="note">
        {disclaimerFor(style)}
      </p>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="persona-case-list">
        {cases.map((c) => (
          <li key={c.id}>
            <Link
              className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-true-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
              data-testid={`persona-case-${c.id}`}
              href={routes.practiceType(style, c.id)}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                <Icon aria-hidden className="h-4 w-4 text-cwru-blue" />
                {c.discipline}
              </span>
              <span className="font-display text-xl font-medium text-cwru-blue">{c.title}</span>
              <span className="text-sm leading-6 text-ink">{c.tagline}</span>
              <span className="mt-auto text-xs text-muted">
                {c.setting} · You: {c.studentRole}
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-link group-hover:text-cwru-blue">
                Start <ArrowRight aria-hidden className="h-4 w-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
