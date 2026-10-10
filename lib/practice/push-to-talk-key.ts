/**
 * Push-to-talk key eligibility.
 *
 * This module decides only two things: whether a given key event, on a given
 * target, is eligible to drive push-to-talk at all (`isPushToTalkKey` +
 * `isPushToTalkBlockingTarget`, resolved from `describeKeyTarget`); and the
 * abort arithmetic for a start that is already in flight when the key is
 * released (`shouldAbortPendingStart`). It owns no state and reads no
 * globals. Whether recording may actually begin remains `startRecording`'s
 * business — the walk-out lock, paused, sending and in-flight conditions all
 * live in `components/practice/PracticeSessionShell.tsx` and must not be
 * duplicated here.
 *
 * No imports on purpose: this must stay importable and runnable from a bare
 * `tsx` script with no React and no DOM runtime.
 */

/**
 * Uppercase tag names where a focused element should keep its native Space
 * behaviour (typing a space, or activating the control) instead of starting
 * push-to-talk. `A` is included unconditionally — a focused link should not
 * have its own keyboard semantics swallowed. `SUMMARY` is included
 * defensively for a future native `<details>` disclosure; there is none in
 * use in `app/` or `components/` outside `app/test-pages/` today. The live
 * deck-picker disclosure (`app/practice/pitches/page.tsx`) is a native
 * `<button type="button">` with `aria-expanded`/`aria-controls`, and is
 * already covered by `BUTTON`.
 */
export const BLOCKING_TAG_NAMES = [
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
  "A",
  "SUMMARY",
  "OPTION",
  "AUDIO",
  "VIDEO",
] as const;

/**
 * ARIA roles that Space either activates or that imply text entry. The deck
 * picker's Start buttons and avatar cards are Space-activatable, and Phase
 * 19's keyboard UAT just verified that — any role in this list must keep its
 * native Space behaviour rather than being hijacked for push-to-talk.
 */
export const SPACE_ACTIVATED_ROLES = [
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "combobox",
  "listbox",
  "textbox",
  "searchbox",
  "spinbutton",
  "slider",
] as const;

export type KeyTargetDescriptor = {
  tagName: string | null;
  role: string | null;
  isContentEditable: boolean;
};

/**
 * Duck-typed on purpose so tests can pass plain-object stubs instead of real
 * DOM nodes. Treats `target` as possibly exposing `tagName`,
 * `isContentEditable`, `getAttribute(name)` and `closest(selector)`.
 */
export function describeKeyTarget(target: unknown): KeyTargetDescriptor {
  if (target === null || typeof target !== "object") {
    return { tagName: null, role: null, isContentEditable: false };
  }

  type MaybeElement = {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => unknown;
    closest?: (selector: string) => unknown;
  };

  const candidate = target as MaybeElement;

  let resolved: MaybeElement = candidate;

  if (typeof candidate.closest === "function") {
    try {
      const ancestor = candidate.closest(
        "input, textarea, select, button, a, summary, option, audio, video, [role], [contenteditable]",
      );

      if (ancestor && typeof ancestor === "object") {
        resolved = ancestor as MaybeElement;
      }
    } catch {
      // An unsupported selector (e.g. a minimal stub) must not throw into
      // the keydown handler — fall back to the original target.
      resolved = candidate;
    }
  }

  const tagName =
    typeof resolved.tagName === "string"
      ? resolved.tagName.toUpperCase()
      : null;

  let role: string | null = null;

  if (typeof resolved.getAttribute === "function") {
    const raw = resolved.getAttribute("role");

    if (typeof raw === "string") {
      const trimmed = raw.trim().toLowerCase();

      role = trimmed.length > 0 ? trimmed : null;
    }
  }

  const isContentEditable = resolved.isContentEditable === true;

  return { tagName, role, isContentEditable };
}

/**
 * Pure function of a plain descriptor — no DOM access. True when the
 * resolved element is content-editable, is one of `BLOCKING_TAG_NAMES`, or
 * carries one of `SPACE_ACTIVATED_ROLES`.
 */
export function isPushToTalkBlockingTarget(
  descriptor: KeyTargetDescriptor,
): boolean {
  if (descriptor.isContentEditable) return true;
  if (
    descriptor.tagName !== null &&
    (BLOCKING_TAG_NAMES as readonly string[]).includes(descriptor.tagName)
  ) {
    return true;
  }
  if (
    descriptor.role !== null &&
    (SPACE_ACTIVATED_ROLES as readonly string[]).includes(descriptor.role)
  ) {
    return true;
  }

  return false;
}

/**
 * True for every key value a browser may report for the spacebar: `" "`
 * (modern), `"Space"` (some synthetic/testing paths) and `"Spacebar"`
 * (older Firefox/Edge). Nothing else.
 */
export function isPushToTalkKey(key: string): boolean {
  return key === " " || key === "Space" || key === "Spacebar";
}

/**
 * Flags considered by `startRecording` after its `await getMicrophone()`
 * resolves, lifted out so the tap-and-release ordering (a release landing
 * before the microphone permission promise settles) can actually be tested.
 * `walkOutLocked` and `startCancelled` are supplied by the shell and are
 * never read inside this module — this encodes no policy beyond "any reason
 * to abort aborts".
 */
export type PendingStartFlags = {
  sending: boolean;
  isTranscribing: boolean;
  isPaused: boolean;
  walkOutLocked: boolean;
  startCancelled: boolean;
};

export function shouldAbortPendingStart(flags: PendingStartFlags): boolean {
  return (
    flags.sending ||
    flags.isTranscribing ||
    flags.isPaused ||
    flags.walkOutLocked ||
    flags.startCancelled
  );
}
