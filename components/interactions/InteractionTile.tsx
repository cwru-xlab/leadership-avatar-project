"use client";

import NextLink from "next/link";
import {
  Briefcase,
  ChevronRight,
  GraduationCap,
  Presentation,
  MessageCircleWarning,
  Users,
} from "lucide-react";

import type { InteractionType } from "@/lib/interactions";

/**
 * Every icon name referenced by the five `lib/interactions` registry
 * records, resolved the same way `components/auth-navbar.tsx` resolves its
 * own `iconMap` — an unmapped name degrades to no icon rather than crashing.
 */
const iconMap = {
  Briefcase,
  GraduationCap,
  Presentation,
  MessageCircleWarning,
  Users,
} as const;

interface InteractionTileProps {
  type: InteractionType;
}

/**
 * One row of the dashboard's practice list. Live and coming-soon are two
 * mutually exclusive branches — a coming-soon row is a non-interactive
 * `<div>`, never a disabled button, modal, or tooltip promising a date. This
 * mirrors the "Not yet measured" idiom in `components/interview/ReportScoreCards.tsx`.
 */
export default function InteractionTile({ type }: InteractionTileProps) {
  const Icon = iconMap[type.icon as keyof typeof iconMap];
  const duration = `About ${type.estimatedMinutes} min`;

  const body = (
    <>
      <span className="grid size-6 shrink-0 place-items-center pt-0.5 text-cwru-blue">
        {Icon ? <Icon aria-hidden size={20} strokeWidth={1.5} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold leading-snug">{type.name}</span>
        <span className="max-w-[65ch] text-sm leading-[1.5] text-muted">{type.description}</span>
      </span>
      <span className="hidden shrink-0 text-[13px] tabular-nums text-muted sm:block">
        {duration}
      </span>
    </>
  );

  if (type.availability === "live" && type.route) {
    // `type.route` is guaranteed non-null for a live type by the registry's
    // own contract.
    return (
      <NextLink
        className="group flex items-start gap-4 px-4 py-4 text-ink transition-colors duration-150 ease-out hover:bg-canvas sm:items-center md:px-6"
        href={type.route}
      >
        {body}
        <ChevronRight
          aria-hidden
          className="mt-0.5 shrink-0 text-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-true-blue sm:mt-0"
          size={18}
          strokeWidth={1.5}
        />
      </NextLink>
    );
  }

  return (
    <div
      aria-disabled="true"
      className="flex cursor-default items-start gap-4 px-4 py-4 text-muted sm:items-center md:px-6"
    >
      {body}
      <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted">
        Coming soon
      </span>
    </div>
  );
}
