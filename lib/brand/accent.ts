/**
 * How far the Orange accent reaches. One switch, rendered as
 * `data-accent-level` on <html>; styles/brand.css does the rest, so trying a
 * level is a one-word change here and nothing else.
 *
 * - "a" Consistent: the title rule under every student page title (plain and
 *   hero headers), the accent icon on every practice picker card, the sidebar
 *   marker and up-next, the report's practice-next target.
 * - "b" A plus one interactive cue: the active tab's underline is Orange.
 *   The selected tab still reads by its weight and CWRU Blue text.
 * - "c" A plus one warm surface: a 3px Orange top edge on the page's featured
 *   panel and an Orange ledge under the hero header's icon tile.
 *
 * Mastery's page body never takes the accent at any level (it would read as
 * the level-2 orange); the sidebar is global chrome and looks the same there.
 */
export type AccentLevel = "a" | "b" | "c";

export const ACCENT_LEVEL: AccentLevel = "a";
