"use client";

import NextLink from "next/link";
import { Briefcase, Video, ArrowRight } from "lucide-react";

import PageTitle from "@/components/shell/PageTitle";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();

  const navigationCards = [
    {
      title: "Cases",
      description: "Create and manage case studies with multiple avatar roles and evaluation criteria",
      icon: Briefcase,
      href: "/case-management",
    },
    {
      title: "Avatars",
      description: "Configure AI avatar profiles with video, voice, and personality settings",
      icon: Video,
      href: "/avatar-profiles",
    },
  ];

  if (loading) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
        <div>Loading...</div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <PageTitle>Leadership Avatar</PageTitle>
        <p className="text-[15px] leading-[1.55] text-muted">Welcome back, {user?.name || "User"}</p>
      </header>

      {/* One card treatment for every staff card, the same as the student
          practice tiles: Orange icon beside a Newsreader title, then "Manage". */}
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
        {navigationCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <NextLink
              key={card.title}
              className="group flex min-h-[168px] flex-col gap-3 rounded-lg border border-line bg-white p-6 text-cwru-blue transition-colors duration-150 ease-out hover:border-true-blue/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
              href={card.href}
            >
              <span className="flex items-center gap-3.5">
                <IconComponent aria-hidden className="la-card-icon shrink-0" size={28} strokeWidth={1.5} />
                <span className="font-display text-[22px] font-medium leading-[1.2]">{card.title}</span>
              </span>
              <span className="line-clamp-2 text-sm leading-[1.5] text-muted">{card.description}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 self-end pt-1 text-[13px] font-semibold text-link">
                Manage
                <ArrowRight
                  aria-hidden
                  className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                  size={16}
                  strokeWidth={1.5}
                />
              </span>
            </NextLink>
          );
        })}
      </div>
    </section>
  );
}
