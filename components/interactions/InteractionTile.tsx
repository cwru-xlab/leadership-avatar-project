"use client";

import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import {
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
}

/**
 * One dashboard tile. Live and coming-soon are two mutually exclusive
 * branches — a coming-soon tile is a non-interactive `<div>`, never a
 * disabled button, modal, or tooltip promising a date. This mirrors the
 * "Not yet measured" idiom in `components/interview/ReportScoreCards.tsx`.
 */
export default function InteractionTile({ type }: InteractionTileProps) {
  const router = useRouter();
  const Icon = iconMap[type.icon as keyof typeof iconMap];
  const duration = `~${type.estimatedMinutes} min`;

  if (type.availability === "live") {
    // `type.route` is guaranteed non-null for a live type by the registry's
    // own contract; this branch never renders a coming-soon type's tile.
    const route = type.route;
    return (
      <Card
        isPressable
        onPress={() => {
          if (route) router.push(route);
        }}
        className="border border-[#d4e2e9] bg-white transition-all hover:-translate-y-0.5 hover:border-[#0a7391] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
      >
        <CardBody className="flex flex-col gap-3 p-6">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf5f8] text-[#0a7391]">
            {Icon ? <Icon size={22} /> : null}
          </div>
          <div>
            <h3 className="font-semibold text-[#102331]">{type.name}</h3>
            <p className="mt-1 text-sm leading-6 text-[#526c7b]">
              {type.description}
            </p>
          </div>
          <p className="mt-auto text-xs font-medium text-[#0a7391]">
            {duration}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div
      className="cursor-default rounded-2xl border border-[#d4e2e9] bg-[#f5f8fa] p-6 opacity-80"
      aria-disabled="true"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e3e9ec] text-[#78909b]">
            {Icon ? <Icon size={22} /> : null}
          </div>
          <span className="rounded-full border border-[#b8cbd3] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#78909b]">
            Coming soon
          </span>
        </div>
        <div>
          <h3 className="font-semibold text-[#78909b]">{type.name}</h3>
          <p className="mt-1 text-sm leading-6 text-[#b8cbd3]">
            {type.description}
          </p>
        </div>
        <p className="mt-auto text-xs font-medium text-[#78909b]">
          {duration}
        </p>
      </div>
    </div>
  );
}
