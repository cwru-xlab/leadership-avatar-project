/**
 * Interaction type registry — the five leadership interaction types the
 * dashboard offers, described here and nowhere else. Adding a sixth type is a
 * new record in this file, not a new page.
 *
 * LOCKED DECISION: nothing in this module imports from `lib/interview` or from
 * any experience's internals. The "Interviews" tile's copy is hardcoded below,
 * not derived from `INTERVIEW_TYPES` — a module named "interview" must not end
 * up owning presentation practice.
 *
 * The meeting-facilitation interaction is deliberately NOT registered — the
 * user parked it as a possibly multi-party experience, out of scope for now.
 *
 * Lookup goes through `getInteractionType()` / `listInteractionTypes()` so
 * that moving this catalog into S3 or Postgres later touches exactly one
 * function.
 */

import type { InteractionType } from "./types";

export type { InteractionAvailability, InteractionType } from "./types";

export const INTERACTION_TYPES: InteractionType[] = [
  {
    slug: "interviews",
    name: "Practice Interviews",
    description:
      "A structured behavioral interview with an AI interviewer, grounded in your resume.",
    icon: "Briefcase",
    estimatedMinutes: 20,
    route: "/interview/general",
    availability: "live",
  },
  {
    slug: "case-studies",
    name: "Case Studies",
    description:
      "Work through a real leadership scenario and make the calls a manager would have to make.",
    icon: "GraduationCap",
    estimatedMinutes: 30,
    route: "/case-play",
    availability: "live",
  },
  {
    slug: "pitches",
    name: "Practice Pitches",
    description:
      "Deliver a pitch to an AI audience and get feedback on clarity, structure, and persuasion.",
    icon: "Presentation",
    estimatedMinutes: 15,
    route: null,
    availability: "coming-soon",
  },
  {
    slug: "difficult-conversations",
    name: "Difficult Conversations",
    description:
      "Practice navigating a tense, high-stakes conversation before you have to have it for real.",
    icon: "MessageCircleWarning",
    estimatedMinutes: 20,
    route: null,
    availability: "coming-soon",
  },
  {
    slug: "networking",
    name: "Networking Practice",
    description:
      "Rehearse introducing yourself and building rapport with a stranger in a professional setting.",
    icon: "Users",
    estimatedMinutes: 15,
    route: null,
    availability: "coming-soon",
  },
];

/**
 * For the dashboard listing. Live types are always returned before
 * coming-soon types, regardless of declaration order above, so the dashboard
 * does not have to know the ordering rule.
 */
export function listInteractionTypes(): InteractionType[] {
  const availabilityOrder: Record<InteractionType["availability"], number> = {
    live: 0,
    "coming-soon": 1,
  };
  return [...INTERACTION_TYPES].sort(
    (a, b) => availabilityOrder[a.availability] - availabilityOrder[b.availability]
  );
}

/** Resolve a slug from a URL segment or request body. Returns null on unknown. */
export function getInteractionType(slug: string | undefined | null): InteractionType | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  return INTERACTION_TYPES.find((type) => type.slug === normalized) ?? null;
}
