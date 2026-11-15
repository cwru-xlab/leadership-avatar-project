/**
 * Server-rendered case picker for a questioned-persona style. Reads the
 * seeded catalog on the server and passes only briefing-safe fields to the
 * page — hidden facts, cues and ICE never reach the browser from here.
 */

import Link from "next/link";
import { ArrowLeft, ArrowRight, Handshake, HeartHandshake, Stethoscope } from "lucide-react";

import BalancedGrid from "@/components/layout/BalancedGrid";
import { listPersonaCases } from "@/lib/questioned-persona/cases";
import { disclaimerFor, disclaimerToneFor, PERSONA_STYLE_COPY } from "@/lib/questioned-persona/copy";
import type { PersonaStyle } from "@/lib/questioned-persona/types";
import { routes } from "@/lib/routes";

import PracticeNotice from "./PracticeNotice";
import PageTitle from "@/components/shell/PageTitle";

export default function PersonaCaseList({ style }: { style: PersonaStyle }) {
  const copy = PERSONA_STYLE_COPY[style];
  const Icon =
    style === "clinical-communication" ? Stethoscope : style === "sales-discovery" ? Handshake : HeartHandshake;
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
      {/* The sales meeting is listed under Practice pitches, so it goes back there. */}
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:text-cwru-blue"
        href={style === "sales-discovery" ? routes.pitches() : routes.practice()}
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {style === "sales-discovery" ? "Practice pitches" : "Practice"}
      </Link>
      <header className="flex flex-col gap-2">
        <PageTitle>
          {copy.listTitle}
        </PageTitle>
        <p className="max-w-2xl text-[15px] text-muted">{copy.listIntro}</p>
      </header>
      <PracticeNotice
        className="max-w-3xl"
        testId="persona-disclaimer"
        text={disclaimerFor(style)}
        tone={disclaimerToneFor(style)}
      />
      {/* Rows always fill the width (6 → 3 + 3, 5 → 3 + 2, 7 → 3 + 2 + 2). */}
      <BalancedGrid className="gap-4" data-testid="persona-case-list" perRow={{ md: 2, xl: 3 }}>
        {cases.map((c) => (
          <Link
            key={c.id}
            className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-true-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
            data-testid={`persona-case-${c.id}`}
            href={routes.practiceType(style, c.id)}
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-muted">
              <Icon aria-hidden className="la-card-icon h-4 w-4" />
              {c.discipline}
            </span>
            <span className="font-display text-xl font-medium text-cwru-blue">{c.title}</span>
            <span className="text-sm leading-6 text-ink">{c.tagline}</span>
            {/* Footer: setting and the action share one row, pinned to the bottom. */}
            <span className="mt-auto flex items-end justify-between gap-4">
              <span className="text-xs text-muted">
                {c.setting} · You: {c.studentRole}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-link group-hover:text-cwru-blue">
                Start <ArrowRight aria-hidden className="h-4 w-4" />
              </span>
            </span>
          </Link>
        ))}
      </BalancedGrid>
    </div>
  );
}
