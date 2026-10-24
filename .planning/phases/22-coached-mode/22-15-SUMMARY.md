---
phase: 22-coached-mode
plan: 15
subsystem: study-plan/coached
tags: [coached-shell, layout, push-to-talk, demonstration-disclosure, verification]
requires: [22-14]
provides:
  - two-column coached session layout (avatar, captions, PTT | moment, demonstration card, tips)
  - surface battery sections 5-10 with bite-proofs
affects: [22-16]
key-files:
  modified:
    - components/study-plan/CoachedSessionShell.tsx
    - scripts/verify-coached-runtime-surface.ts
requirements-completed: [REQ-114, REQ-115]
completed: 2026-10-23
---

# Phase 22 Plan 15: Coached Session Layout Summary

The live session is now a video coach beside the student's verbatim on-screen moment, answered by voice, with the demonstration shown in its own disclosed card and the presentation rules guarded by static assertions.

## Tasks

1. Session layout - commit in `git log` as `feat(22-15): coached session layout ...`
2. Surface battery sections 5-10 - commit `test(22-15): extend coached surface battery ...`

## Details

- Layout: header (competency, "Part N of M", thin-evidence notice), then `grid grid-cols-1 lg:grid-cols-[3fr,2fr]`. Left: avatar stage (or the unavailable notice), captions ("Coach {name}" / "You", auto-scrolled with `scrollIntoView({block:"nearest"})`), PTT button and "or hold Space". Right: `CoachedMomentPanel` with this leg's attempts, demonstration card, `TipRail`. All in normal flow; no `overflow-hidden` in the shell.
- PTT label is "Hold to talk", or "Hold to say your better version" when `awaiting === "ATTEMPT"`; disabled while a turn is in flight or transcribing; partial transcript shown while transcribing; mic-unavailable message, no typed fallback. `onBeforeRecord` calls `interrupt()`, `onTranscript` calls `submitUtterance` (both were already wired by 22-14).
- Demonstration card: heading "{coach}'s example", the text, and the disclosure (constant `DEMONSTRATION_DISCLOSURE`, outside TipRail; TipRail untouched).
- When video is unavailable the stage stays mounted but hidden (`hidden` class) so its error state and unmount cleanup still run, and the notice is shown.
- Battery: sections 1-4 unchanged and no assertions adjusted. Sections 5-10 added as pure functions over source text. Bite-proofs: inserted chat fetch (5); unconditioned effect call, removed ref guard, call from an unlisted function (6); `.trim()` on a moment line (7); `demonstration` in TipRail (8).
- Section 6 note: the plan's "setTimeout callback inside an effect" does not match 22-14's implementation, where the timer is started inside `handleConsent`. The check allows a setTimeout inside `handleConsent` or inside a consent-referencing effect; anything else fails.
- Section 9 asserts `overflow-y-auto` in the page file (22-14's `h-dvh overflow-y-auto`).

## Verification

- `npx tsc --noEmit`: clean.
- verify-coached-runtime-surface (all 10 sections), verify-coached-avatar-mount, verify-coach-settings: exit 0.
- `git diff --name-only 59f6166 -- components/practice lib/engine`: empty.
- `grep` for Textarea / textarea / input in the shell: nothing.

## Browser smoke: NOT DONE

A dev server is running on localhost:3000 (HTTP 307 on `/`), but no student login is available, so the authed coached page could not be opened. Not verified in a browser: brief/consent, video opening, a hold-Space round trip, and page scroll at 1440px and 390px (including 22-14's `h-dvh` scroll container). Scroll is only checked statically. `next build` was not run because it would overwrite `.next` under the running dev server. 22-16's human UAT is the gate for all of these.

## Deviations from Plan

None beyond the Section 6 and smoke notes above.

## Self-Check: PASSED

- FOUND: components/study-plan/CoachedSessionShell.tsx, scripts/verify-coached-runtime-surface.ts
- FOUND: both task commits via git log
