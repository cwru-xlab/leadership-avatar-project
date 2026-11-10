/**
 * The cross-type COMPETENCY catalog Phase 21's mastery model sits on.
 *
 * 21-CONTEXT.md locks a competency model that sits ABOVE the per-type rubrics
 * the engine already scores (`lib/engine/registry.ts`'s `ENGINE_TYPES`): each
 * session's scored dimensions map UP into one of seven competencies, giving a
 * student one coherent view across interview, pitch, networking and
 * difficult-conversation instead of per-interaction-type silos.
 *
 * The catalog is DERIVED, not authored. `allRubricDimensionKeys()` below reads
 * `SHARED_RUBRIC_DIMENSION_KEYS` plus every type's `extraRubricDimensions` at
 * MODULE LOAD, so adding a sixth deck mode or a new type in a later phase
 * mechanically grows this catalog's ground truth without anyone touching this
 * file's dimension-enumeration logic. What can and must be touched by hand is
 * the GROUPING below (`COMPETENCIES`), because grouping is a judgment call —
 * see the block comment above `COMPETENCIES` for the rationale.
 *
 * REPLACEABILITY SEAM (REQ-103): 21-CONTEXT.md defers a faculty-authored
 * competency framework to a later phase. For that swap to be a single file's
 * change and not a rewrite, every consumer of this module MUST import
 * `COMPETENCIES` / `competencyForDimension` and MUST NEVER switch on a rubric
 * dimension key directly. `COMPETENCY_CATALOG_SOURCE` names which regime is
 * active; a future faculty-authored catalog sets it to `"faculty-authored"`
 * and replaces the body of this file only — the exported surface
 * (`COMPETENCIES`, `DIMENSION_TO_COMPETENCY`, `competencyForDimension`,
 * `allRubricDimensionKeys`, `CompetencyKey`, `Competency`) must not change
 * shape, or every consumer built against it breaks.
 */

import { ENGINE_TYPES } from "@/lib/engine/registry";
import {
  SHARED_RUBRIC_DIMENSION_KEYS,
  type InteractionTypeConfig,
} from "@/lib/engine/types";

/**
 * Which regime produced `COMPETENCIES` below. Today it is always
 * `"derived-from-rubric-dimensions"` — the only regime this phase ships.
 * A later faculty-authored framework flips this to `"faculty-authored"` when
 * it replaces the catalog body; nothing downstream should branch on this
 * value today, it exists purely as a documented seam / audit marker.
 */
export const COMPETENCY_CATALOG_SOURCE = "derived-from-rubric-dimensions" as const;

/**
 * Enumerates every rubric dimension key reachable from the live engine
 * registry: the four shared dimensions (never type-optional, REQ-72) plus
 * every built-in type's `extraRubricDimensions`, deduped and sorted.
 *
 * This is computed fresh from `ENGINE_TYPES` on every call — not cached —
 * so a test that monkeypatches the registry (`registerEngineTypeForTests`)
 * sees an updated result. Re-running it is cheap: `ENGINE_TYPES` has well
 * under a hundred total dimension declarations.
 *
 * EXPECTED OUTPUT as of this phase (23 keys total; kept here as a comment
 * for a reviewer to eyeball against the live registry — this list is NOT
 * read by any code path below, only the live iteration over `ENGINE_TYPES`
 * is):
 *   shared (4): behavioral, content, vocal, visual
 *   deck family — SHARED_DECK_DIMENSIONS (4): deck_structure,
 *     deck_text_density, deck_visual_quality, slide_speech_correlation
 *   talk (2): audience_takeaway_clarity, holding_the_room
 *   elevator (2): concision, discovery_tailoring
 *   product (1): objection_handling
 *   investor deck (1): negotiation
 *   funding (2): ask_feasibility, use_of_funds_credibility
 *   networking (3): goal-progress, rapport, self-introduction
 *   difficult-conversation (4): clarity, empathy, holding_the_line,
 *     objective_achieved
 */
export function allRubricDimensionKeys(): string[] {
  const keys = new Set<string>(SHARED_RUBRIC_DIMENSION_KEYS);

  for (const type of ENGINE_TYPES as InteractionTypeConfig[]) {
    for (const dim of type.extraRubricDimensions) {
      keys.add(dim.key);
    }
  }

  return Array.from(keys).sort();
}

export type CompetencyKey =
  | "delivery_presence"
  | "structure_and_clarity"
  | "concision_and_focus"
  | "audience_attunement"
  | "holding_position_under_pressure"
  | "credibility_of_the_case"
  | "outcome_achievement";

export interface Competency {
  key: CompetencyKey;
  label: string;
  /** What a student is being told they are good or bad at. Shown in the UI. */
  description: string;
  /** Rubric dimension keys that evidence this competency. */
  dimensionKeys: readonly string[];
  /** Display order in the breakdown. */
  order: number;
}

/**
 * The seven-competency grouping of the 23 derived dimensions. Discretion was
 * exercised here (21-CONTEXT.md "Claude's Discretion" explicitly names this
 * as open); the rationale for each grouping:
 *
 * 1. delivery_presence — visual + vocal delivery plus command of a whole
 *    room (`holding_the_room`, talk-specific but the same skill at a larger
 *    scale): how the student SHOWS UP, independent of what they say.
 * 2. structure_and_clarity — whether the point lands in an order that
 *    builds: the shared `content` score, `clarity` (difficult-conversation),
 *    `deck_structure` and `audience_takeaway_clarity` (talk) all judge
 *    narrative/structural landing rather than delivery or pressure-handling.
 *    The problem interviews' `process_rigor` (working a problem in an order
 *    that builds) and `synthesis` (consulting: landing a top-down answer)
 *    are the same judgment applied to a case or product problem. The coding
 *    room's `coding_quality` (readable, well-organized code) and
 *    `technical_communication` (explaining the approach in order) judge the
 *    same landing for a solution.
 * 3. concision_and_focus — saying it tightly: `concision` (elevator) and
 *    `deck_text_density` (deck family) are both a density/economy judgment,
 *    one spoken and one written.
 * 4. audience_attunement — reading the person in front of them and shaping
 *    to them: the shared `behavioral` score, `empathy` (difficult
 *    conversation), `rapport` + `self-introduction` (networking) and
 *    `discovery_tailoring` (elevator) all judge responsiveness to the other
 *    party rather than the content of the student's own case. PM
 *    `product_sense` (user empathy, needs grounded in a real user) is the
 *    same attunement aimed at the product's user.
 * 5. holding_position_under_pressure — keeping the ask/position intact when
 *    pushed: `holding_the_line` (difficult conversation), `objection_handling`
 *    (product pitch), `negotiation` (investor deck) are all the same skill —
 *    not caving — applied in three different interaction types.
 * 6. credibility_of_the_case — whether the claim and its support hold up:
 *    `use_of_funds_credibility` + `ask_feasibility` (funding) judge the
 *    financial case's internal consistency; `deck_visual_quality` +
 *    `slide_speech_correlation` (deck family) judge whether the supporting
 *    artifact itself is credible and in sync with the spoken case.
 *    Consulting `quantitative` (sound math, sanity-checked numbers) and PM
 *    `analytical_judgment` (metrics, numbers, honest tradeoffs) judge whether
 *    the analysis behind a recommendation holds up, as do analytics
 *    `statistical_reasoning` / `business_judgment`, finance
 *    `technical_accuracy` / `commercial_judgment`, the coding room's
 *    `coding_correctness` (does the solution actually work), and system
 *    design's `technical_depth` (would the design actually work at scale) and
 *    `tradeoff_reasoning` (are the costs of each choice named and weighed).
 * 7. outcome_achievement — whether the student got what they came for:
 *    `objective_achieved` (difficult conversation) and `goal-progress`
 *    (networking) are both an explicit "did the approach move the stated
 *    goal forward" judgment, as opposed to how it was done (covered by the
 *    other six).
 */
export const COMPETENCIES: readonly Competency[] = [
  {
    key: "delivery_presence",
    label: "Delivery & presence",
    description: "How you show up — body, voice, and command of the room.",
    dimensionKeys: ["visual", "vocal", "holding_the_room"],
    order: 1,
  },
  {
    key: "structure_and_clarity",
    label: "Structure & clarity",
    description: "Whether the point lands in an order that builds.",
    dimensionKeys: [
      "content",
      "clarity",
      "deck_structure",
      "audience_takeaway_clarity",
      "process_rigor",
      "synthesis",
      "coding_quality",
      "technical_communication",
      // questioned persona (clinical communication)
      "opening_agenda",
      "explanation_planning",
    ],
    order: 2,
  },
  {
    key: "concision_and_focus",
    label: "Concision & focus",
    description: "Saying it tightly — in one slide or one breath.",
    dimensionKeys: ["concision", "deck_text_density"],
    order: 3,
  },
  {
    key: "audience_attunement",
    label: "Audience attunement",
    description: "Reading the person in front of you and shaping to them.",
    dimensionKeys: [
      "behavioral",
      // Three DISTINCT empathy constructs, deliberately not one key
      // (2026-11-07). They all evidence this competency, but they measure
      // different things and are scored against different rubrics:
      //   empathy          — difficult-conversation: acknowledged the other
      //                      person's position instead of steamrolling.
      //   empathy_clinical — Calgary-Cambridge: noticed an emotional cue and
      //                      responded before moving on, no premature
      //                      reassurance.
      //   empathy_mi       — MITI 4 global: depth of reflected understanding.
      // Pooling them under one key averaged a student's clinical cue-handling
      // with their workplace conversation style into a single number. Keeping
      // them separate preserves the per-rubric signal on the report while
      // still rolling up here. DIMENSION_TO_COMPETENCY forbids a key being
      // claimed twice, so these must stay distinct spellings.
      "empathy",
      "empathy_clinical",
      "empathy_mi",
      "rapport",
      "discovery_tailoring",
      "self-introduction",
      "product_sense",
      // questioned persona: clinical history-taking and the MITI globals
      "information_gathering",
      "cultivating_change_talk",
      "softening_sustain_talk",
      "partnership",
    ],
    order: 4,
  },
  {
    key: "holding_position_under_pressure",
    label: "Holding position under pressure",
    description: "Keeping the ask intact when pushed.",
    dimensionKeys: ["holding_the_line", "objection_handling", "negotiation"],
    order: 5,
  },
  {
    key: "credibility_of_the_case",
    label: "Credibility of the case",
    description: "Whether the claim and its support hold up.",
    dimensionKeys: [
      "use_of_funds_credibility",
      "ask_feasibility",
      "deck_visual_quality",
      "slide_speech_correlation",
      "quantitative",
      "analytical_judgment",
      "statistical_reasoning",
      "business_judgment",
      "technical_accuracy",
      "commercial_judgment",
      "coding_correctness",
      "technical_depth",
      "tradeoff_reasoning",
    ],
    order: 6,
  },
  {
    key: "outcome_achievement",
    label: "Outcome achievement",
    description: "Whether you got what you came for.",
    dimensionKeys: ["objective_achieved", "goal-progress"],
    order: 7,
  },
];

/**
 * Inverted FROM `COMPETENCIES` — never maintained as a hand-written second
 * list. Throws at module load if two competencies claim the same dimension
 * key, because a dimension contributing to two competencies would
 * double-count its evidence in mastery arithmetic (a single session's score
 * on that dimension would move two competency figures instead of one).
 */
export const DIMENSION_TO_COMPETENCY: ReadonlyMap<string, CompetencyKey> = (() => {
  const map = new Map<string, CompetencyKey>();

  for (const competency of COMPETENCIES) {
    for (const dimensionKey of competency.dimensionKeys) {
      const existing = map.get(dimensionKey);

      if (existing && existing !== competency.key) {
        throw new Error(
          `lib/mastery/competencies.ts: dimension "${dimensionKey}" is claimed by both "${existing}" and "${competency.key}" — a dimension must map to exactly one competency`,
        );
      }

      map.set(dimensionKey, competency.key);
    }
  }

  return map;
})();

/**
 * Resolve a rubric dimension key to the competency it evidences. Returns
 * `null` rather than throwing so a caller (notably the totality verifier)
 * can report every unmapped key in one pass instead of dying on the first.
 */
export function competencyForDimension(key: string): CompetencyKey | null {
  return DIMENSION_TO_COMPETENCY.get(key) ?? null;
}
