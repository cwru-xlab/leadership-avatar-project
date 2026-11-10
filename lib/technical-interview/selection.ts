/**
 * Choosing which problem a candidate gets.
 *
 * Selection never fails on a filter that matches nothing: a request for a
 * topic with only hard problems, or a narrow topic+difficulty pair, must still
 * produce an interview. So the filters are tried from most specific to least
 * and the first non-empty pool wins, with the reason recorded so a report can
 * say the request was widened rather than silently ignored.
 *
 * Pure and server-agnostic: the caller supplies the catalog and the random
 * index, which is what makes this testable without a database.
 */

import {
  isTechnicalDifficulty,
  isTechnicalTopic,
  type TechnicalDifficulty,
  type TechnicalTopic,
} from "./types";

export interface TechnicalSelectionRequest {
  /** Explicitly asked for by the candidate; always beats an inferred bias. */
  topics?: readonly TechnicalTopic[];
  difficulty?: TechnicalDifficulty | null;
  /** Inferred from a resume or job posting. Used only as a tiebreak. */
  biasTopics?: readonly TechnicalTopic[];
}

export type TechnicalSelectionBasis =
  | "topic-and-difficulty"
  | "topic-only"
  | "difficulty-only"
  | "bias-topic"
  | "any";

export interface TechnicalSelectionOutcome<T> {
  assignment: T;
  basis: TechnicalSelectionBasis;
  /** True when no pool matched the full request and a wider one was used. */
  widened: boolean;
  poolSize: number;
}

type Taggable = { topics: readonly TechnicalTopic[]; difficulty: TechnicalDifficulty };

/**
 * Keep only known values. A request arrives from the browser, so an unknown
 * topic is dropped rather than trusted — an unrecognized filter would
 * otherwise empty the pool and look like a catalog problem.
 */
export function normalizeTechnicalSelectionRequest(
  raw: unknown,
): TechnicalSelectionRequest {
  const source = (raw ?? {}) as Record<string, unknown>;
  const topics = Array.isArray(source.topics)
    ? Array.from(new Set(source.topics.filter(isTechnicalTopic)))
    : [];
  const biasTopics = Array.isArray(source.biasTopics)
    ? Array.from(new Set(source.biasTopics.filter(isTechnicalTopic)))
    : [];
  return {
    topics,
    biasTopics,
    difficulty: isTechnicalDifficulty(source.difficulty) ? source.difficulty : null,
  };
}

/**
 * @param randomIndex Receives the pool size and returns an index into it. The
 *   caller injects `randomInt` so selection stays deterministic under test.
 */
export function selectTechnicalAssignment<T extends Taggable>(
  catalog: readonly T[],
  request: TechnicalSelectionRequest,
  randomIndex: (exclusiveMax: number) => number,
): TechnicalSelectionOutcome<T> | null {
  if (catalog.length === 0) return null;

  const wanted = new Set(request.topics ?? []);
  const bias = new Set(request.biasTopics ?? []);
  const difficulty = request.difficulty ?? null;
  const matchesTopic = (item: T, set: Set<TechnicalTopic>) =>
    item.topics.some((topic) => set.has(topic));

  // Most specific first. The candidate's own words outrank an inferred bias,
  // and topic outranks difficulty: being handed the wrong KIND of problem is a
  // worse outcome than being handed one a notch off the requested level.
  const tiers: Array<{ basis: TechnicalSelectionBasis; pool: readonly T[] }> = [
    {
      basis: "topic-and-difficulty",
      pool:
        wanted.size && difficulty
          ? catalog.filter((item) => matchesTopic(item, wanted) && item.difficulty === difficulty)
          : [],
    },
    {
      basis: "topic-only",
      pool: wanted.size ? catalog.filter((item) => matchesTopic(item, wanted)) : [],
    },
    {
      basis: "difficulty-only",
      pool: difficulty ? catalog.filter((item) => item.difficulty === difficulty) : [],
    },
    {
      basis: "bias-topic",
      pool: bias.size ? catalog.filter((item) => matchesTopic(item, bias)) : [],
    },
    { basis: "any", pool: catalog },
  ];

  // What the candidate actually asked for; anything looser counts as widened.
  const requestedBasis: TechnicalSelectionBasis =
    wanted.size && difficulty
      ? "topic-and-difficulty"
      : wanted.size
        ? "topic-only"
        : difficulty
          ? "difficulty-only"
          : bias.size
            ? "bias-topic"
            : "any";

  for (const tier of tiers) {
    if (tier.pool.length === 0) continue;
    const assignment = tier.pool[randomIndex(tier.pool.length)];
    if (!assignment) continue;
    return {
      assignment,
      basis: tier.basis,
      widened: tier.basis !== requestedBasis,
      poolSize: tier.pool.length,
    };
  }

  return null;
}
