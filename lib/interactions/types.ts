/**
 * Interaction type shape — the leadership interaction TYPES the product
 * offers, described in exactly one place.
 *
 * LOCKED DECISION: this module (and everything else in `lib/interactions`)
 * must never import from `lib/interview` or from any experience's internals
 * (e.g. `app/case-play`). The dashboard is a branch point ABOVE interview and
 * case-play, not an interview launcher — a module named "interview" must not
 * end up owning presentation practice. This file stays a pure data leaf.
 */

export type InteractionAvailability = "live" | "coming-soon";

export interface InteractionType {
  /** Stable identifier. Used as a React key and for future persistence. */
  slug: string;
  /** Student-facing name, plain language. */
  name: string;
  /** One line, legible to an undergraduate who has never seen the program doc. */
  description: string;
  /** Name of a lucide-react icon, resolved through a local map in the dashboard. */
  icon: string;
  /** Shown on the tile — an undergraduate deciding whether to start now needs this. */
  estimatedMinutes: number;
  /** Entry route for a live type. Null for coming-soon — there is nowhere to go. */
  route: string | null;
  availability: InteractionAvailability;
}
