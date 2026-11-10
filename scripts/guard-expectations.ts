/**
 * Shared expectations for guard scripts.
 *
 * WHY THIS EXISTS
 *
 * Three guards independently hardcoded `ENGINE_TYPES.length`, kept "in
 * lockstep" by comments asking the next author to bump each copy by hand:
 *
 *   scripts/verify-knowledge-check-surface.ts   -> 20
 *   scripts/verify-coached-mode-isolation.ts    -> 20
 *   scripts/verify-coach-containment.ts         -> 13   (missed)
 *
 * Manual lockstep is not a mechanism. The third copy was never bumped and sat
 * at 13 through seven engine-type additions, so a check whose whole job was to
 * notice registry growth was itself blind to it — while still printing a
 * confident `ENGINE_TYPES.length === 13` in its output.
 *
 * One constant, imported everywhere, makes the next addition a single edit
 * that cannot be partially applied.
 */

/**
 * Expected number of entries in `lib/engine/registry.ts`'s `ENGINE_TYPES`.
 *
 * Bump this deliberately when a real new interaction type ships. It is a drift
 * tripwire, not a business rule: a surprise change here means a type was added
 * without the surrounding guards being considered.
 */
export const EXPECTED_ENGINE_TYPES_COUNT = 20;
