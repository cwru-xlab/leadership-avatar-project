/**
 * Which interview slugs are problem interviews, as a dependency-free set.
 *
 * `lib/interview/customization.ts` must know (to clamp session length) but
 * cannot import the engine registry: registry → networking → customization
 * is an import cycle that breaks `next build`. The factory marks its slug
 * here when the registry builds it, which happens before any request path
 * resolves a customization (every such path imports the registry).
 */

const PROBLEM_SLUGS = new Set<string>();

export function markProblemInterviewSlug(slug: string): void {
  PROBLEM_SLUGS.add(slug.trim().toLowerCase());
}

export function isProblemInterviewSlug(slug: string | null | undefined): boolean {
  return Boolean(slug) && PROBLEM_SLUGS.has(slug!.trim().toLowerCase());
}
