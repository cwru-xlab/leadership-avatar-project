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
import { routes } from "@/lib/routes";

export type { InteractionAvailability, InteractionType } from "./types";

export const INTERACTION_TYPES: InteractionType[] = [
  {
    slug: "interviews",
    name: "Practice interviews",
    description: "A behavioral interview built from your resume.",
    icon: "Briefcase",
    estimatedMinutes: 20,
    route: routes.interviews(),
    availability: "live",
  },
  {
    slug: "case-studies",
    name: "Case studies",
    description: "Talk to the people involved and make the call.",
    icon: "GraduationCap",
    estimatedMinutes: 30,
    route: routes.caseStudies(),
    availability: "live",
  },
  {
    slug: "pitches",
    name: "Practice pitches",
    description: "Pitch a live listener, with or without slides.",
    icon: "Presentation",
    estimatedMinutes: 15,
    // Picker for elevator vs investor deck (both live as of 14-12/14-13).
    route: routes.pitches(),
    availability: "live",
  },
  {
    slug: "difficult-conversations",
    name: "Courageous conversations",
    description: "Rehearse a hard talk before it happens.",
    icon: "MessageCircleWarning",
    estimatedMinutes: 20,
    route: routes.courageousConversations(),
    availability: "live",
  },
  {
    slug: "networking",
    name: "Networking practice",
    description: "Introduce yourself and build rapport with a stranger.",
    icon: "Users",
    estimatedMinutes: 15,
    route: routes.networking(),
    availability: "live",
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
