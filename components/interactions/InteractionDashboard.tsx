"use client";

import { listInteractionTypes } from "@/lib/interactions";

import InteractionTile from "./InteractionTile";

/**
 * The student landing experience: a responsive grid of leadership
 * interaction tiles, one level ABOVE interview and case-play. Adding a
 * sixth interaction type is a new record in `lib/interactions`, not a new
 * page — this component renders whatever `listInteractionTypes()` returns
 * and imports nothing about the experiences themselves.
 */
export default function InteractionDashboard() {
  const types = listInteractionTypes();

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl tracking-[-0.03em] text-[#102331]">
          Practice a leadership interaction
        </h1>
        <p className="mt-2 text-sm text-[#526c7b]">
          Pick an experience below to start practicing right now.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {types.map((type) => (
          <InteractionTile key={type.slug} type={type} />
        ))}
      </div>
    </section>
  );
}
