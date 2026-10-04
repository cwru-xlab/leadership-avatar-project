/**
 * The per-turn slice of session state a type's avatar is allowed to see.
 *
 * Modeled generally over session state, never over any particular kind of
 * stepped material. Session state is an opaque keyed record of context
 * channels — a type names channels in `VisibleContextConfig.visibleChannels`
 * to admit them, and `"*"` (the permissive default every built-in type uses
 * today) admits every channel the session happens to carry.
 *
 * A channel's value may itself be an ordered array of entries. A turn can
 * carry a cursor for that channel, naming how far into the array the
 * current turn may see; entries beyond the cursor are withheld. This is the
 * one primitive a future type's "the avatar must not see ahead of where the
 * student currently is" is built from — the cursor is read off the session,
 * not fabricated here, and this module has no opinion on what an entry in
 * the array represents.
 */

import type { VisibleContextConfig } from "./types";

/** An opaque keyed record of session context channels. Values are whatever
 * shape the owning type chooses; this module only knows whether a value is
 * an array to apply a cursor to it. */
export type SessionContextState = Record<string, unknown>;

export interface VisibleContextTurn {
  /** Optional per-channel cursor. When a channel is admitted AND its value
   * is an array AND a cursor is given for that channel's name, only entries
   * at index `<= cursor` are admitted. A channel with no cursor entry here
   * passes through in full (subject to channel admission above). */
  cursors?: Record<string, number>;
}

/**
 * Returns only the portion of `sessionState` the type permits the avatar to
 * see on this turn. Never mutates `sessionState`.
 */
export function applyVisibleContext(
  config: VisibleContextConfig,
  sessionState: SessionContextState,
  turn: VisibleContextTurn = {},
): SessionContextState {
  const admittedChannels =
    config.visibleChannels === "*"
      ? Object.keys(sessionState)
      : config.visibleChannels;

  const result: SessionContextState = {};

  for (const channel of admittedChannels) {
    if (!(channel in sessionState)) continue;

    const value = sessionState[channel];
    const cursor = turn.cursors?.[channel];

    result[channel] =
      Array.isArray(value) && cursor !== undefined
        ? value.slice(0, cursor + 1)
        : value;
  }

  return result;
}
