"use client";

import NextLink from "next/link";
import clsx from "clsx";
import {
  ArrowRight,
  Briefcase,
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
  className?: string;
}

/**
 * One dashboard card: icon and name lead, a two-line description, then
 * duration and "Start". Live and coming-soon are two mutually exclusive
 * branches — a coming-soon card is a non-interactive `<div>`, never a
 * disabled button, modal, or tooltip promising a date. This mirrors the
 * "Not yet measured" idiom in `components/interview/ReportScoreCards.tsx`.
 */
export default function InteractionTile({ type, className }: InteractionTileProps) {
  const Icon = iconMap[type.icon as keyof typeof iconMap];
  const live = type.availability === "live" && type.route;

  const body = (
    <>
      <span className="flex items-center gap-3.5">
        {Icon ? (
          <Icon aria-hidden className="shrink-0" size={28} strokeWidth={1.5} />
        ) : null}
        <span className="font-display text-[22px] font-medium leading-[1.2]">{type.name}</span>
      </span>
      <span className="line-clamp-2 text-sm leading-[1.5] text-muted">{type.description}</span>
      <span className="mt-auto flex items-center justify-between gap-3 pt-1 text-[13px]">
        <span className="text-muted tabular-nums">About {type.estimatedMinutes} min</span>
        {live ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-true-blue">
            Start
            <ArrowRight
              aria-hidden
              className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              size={16}
              strokeWidth={1.5}
            />
          </span>
        ) : (
          <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted">
            Coming soon
          </span>
        )}
      </span>
    </>
  );

  const cardClass =
    "flex min-h-[168px] flex-col gap-3 rounded-lg border border-line bg-white p-6";

  if (live) {
    // `type.route` is guaranteed non-null for a live type by the registry's
    // own contract.
    return (
      <NextLink
        className={clsx(
          cardClass,
          "group text-cwru-blue transition-colors duration-150 ease-out hover:border-true-blue/50",
          className,
        )}
        href={type.route!}
      >
        {body}
      </NextLink>
    );
  }

  return (
    <div aria-disabled="true" className={clsx(cardClass, "cursor-default text-muted", className)}>
      {body}
    </div>
  );
}
