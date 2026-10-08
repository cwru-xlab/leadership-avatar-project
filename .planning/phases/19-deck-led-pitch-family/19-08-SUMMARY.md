---
phase: 19-deck-led-pitch-family
plan: 08
subsystem: ui
tags: [react, nextjs, accessibility, disclosure-pattern, picker]

# Dependency graph
requires:
  - phase: 19-deck-led-pitch-family
    provides: "lib/pitch/deck-modes.ts — DECK_MODES table and listDeckModes() (plan 19-01)"
provides:
  - "app/practice/pitches/page.tsx — two top-level cards (Elevator pitch, With a deck); 'With a deck' expands in place into five mode cards sourced entirely from listDeckModes()"
  - "scripts/verify-pitch-picker-cards.ts — fifteen-assertion mechanical proof that the four required facts are data-driven, the expansion is an accessible disclosure, and no second screen/route was added"
affects: [19-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Accessible in-place disclosure: native <button aria-expanded aria-controls> toggling a role=\"group\" panel, with focus moved into the panel's first interactive element via requestAnimationFrame on open — no new route, no animation library"
    - "Zero per-mode literals in the picker: every mode's slug/title/listener/envelope/marker is read from listDeckModes(); the page only knows how to render a DeckMode"

key-files:
  created:
    - scripts/verify-pitch-picker-cards.ts
  modified:
    - app/practice/pitches/page.tsx

key-decisions:
  - "The negotiating mode's marker is visually distinct (amber chip + Handshake icon) from the four non-negotiating modes' marker (neutral chip + MinusCircle icon), and the distinction is carried in both text and styling, not color alone."
  - "The deck family's top-card clock chip computes its min/max from listDeckModes() envelopes rather than hardcoding a span, so it tracks the mode table automatically if envelopes change."

requirements-completed: [REQ-94, REQ-89, P19-SC1, P19-SC2]

# Metrics
duration: 20min
completed: 2026-10-08
---

# Phase 19 Plan 08: Deck Picker Expansion Summary

**Practice Pitches picker restructured to two top-level cards (Elevator pitch, With a deck) where "With a deck" expands in place into five data-driven mode cards, each showing listener, scored dimension, time envelope, and a visually-distinct negotiation marker — proven by a 15-assertion verify script.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `app/practice/pitches/page.tsx` now renders exactly two top-level cards. The elevator card is unchanged (copy, `Mic` icon, `1–5 min`, routes to `/practice/pitch-elevator`). The "With a deck" card replaced the old "Investor pitch deck" card: its blurb describes the five-mode family, its clock chip shows the computed min/max envelope span across all five modes, and its primary control is a real `<button>` with `aria-expanded`/`aria-controls` that toggles a `role="group"` panel in place — no navigation, no new route.
- The expansion panel renders `listDeckModes().map(...)` as a grid of five cards. Each card shows all four required facts read directly from the mode record: `listenerLine` (most prominent, right under the title), `scoredLine`, `envelopeSeconds` rendered as a minutes range on the `Clock3` chip, and `negotiationMarker` rendered as a chip that is visually distinct for the negotiating mode (amber + `Handshake` icon) versus the four non-negotiating modes (neutral + `MinusCircle` icon) — the distinction is carried in text as well as color.
- Keyboard behavior: the disclosure button is a native `<button>` (Enter/Space activate it for free); opening it moves focus to the first deck card's Start button via `requestAnimationFrame` so keyboard users land inside the newly-revealed panel immediately. Collapsed state renders the panel not at all (conditional render), so the five cards are never in the tab order while hidden.
- `scripts/verify-pitch-picker-cards.ts` mechanically proves: the four required field names appear in source; no deck-mode slug literal exists in the page (comments stripped) while `pitch-elevator` still does (it is not a deck mode); `aria-expanded`/`aria-controls` are present; exactly one `page.tsx` exists with no subdirectory and no `app/practice/decks` directory; navigation is only `router.push(`/practice/${...}`)` with no `/api/` or `/report/` path on the page; and the mode table's `negotiationMarker` is non-empty everywhere with `pitch-deck`'s marker distinct from the shared marker text of the four non-negotiating modes. All 15 assertions PASS.

## Task Commits

Each task was committed atomically:

1. **Task 1: Two top cards, with "With a deck" expanding in place** - `980f769` (feat)
2. **Task 2: Prove every card carries its four facts** - `7f81c49` (test) — see Deviations below; this file was committed as part of a concurrent parallel executor's commit (19-06), not a standalone commit by this plan.

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/practice/pitches/page.tsx` - Two top-level cards; "With a deck" expands in place into five `listDeckModes()`-sourced cards, each carrying listener/scored/envelope/negotiation facts
- `scripts/verify-pitch-picker-cards.ts` - Fifteen-assertion mechanical proof of the above

## Decisions Made
- Negotiation marker distinction uses both an icon (Handshake vs MinusCircle) and a background-color difference (amber vs neutral) so the signal is never color-only.
- The "With a deck" top card's time span is computed (`Math.min`/`Math.max` across all five `envelopeSeconds`) rather than hardcoded, so a future mode-table edit to any envelope automatically updates the top card without touching this file.

## Deviations from Plan

### Auto-fixed / Process Note

**1. Task 2's commit landed inside a concurrent parallel executor's commit, not its own.**
- **Found during:** Task 2 commit step
- **Issue:** This plan ran in parallel with plans 19-02, 19-03, and 19-06 per the orchestrator's instructions. After staging only `scripts/verify-pitch-picker-cards.ts` and running `git commit`, the commit command reported "nothing to commit" — a concurrent executor (19-06) had already committed the working tree state that included this plan's staged file (commit `7f81c49`, "feat(19-06): add FundingAskStep with amount and use-of-funds, no equity"). The file's content is exactly what this plan wrote and is fully present and verified in git history; `git diff --stat HEAD -- scripts/verify-pitch-picker-cards.ts` shows no outstanding diff.
- **Fix:** No code fix needed — the file is correctly committed. Re-running `git commit` for this file alone was not possible without reverting and recreating history, which would be a destructive, unnecessary git operation on a concurrently-running repo. Verified via `npx tsx scripts/verify-pitch-picker-cards.ts` → ALL PASS and `npx eslint app/practice/pitches/page.tsx` → clean, confirming the committed state matches intent.
- **Files affected:** `scripts/verify-pitch-picker-cards.ts` (committed, correct content)
- **Verification:** `npx tsx scripts/verify-pitch-picker-cards.ts` → ALL PASS; file content matches what was written by this plan.
- **Committed in:** `7f81c49` (by a concurrent executor's commit, content attributable to this plan's Task 2)

---

**Total deviations:** 1 (process/git-concurrency note, not a code deviation)
**Impact on plan:** None on correctness — all task output is present, verified, and committed. This is purely an attribution artifact of running four executors in parallel against the same working tree.

## Issues Encountered
- `npx tsc --noEmit` at verification time showed errors in `lib/pitch/deck-type.ts`, `scripts/verify-disengagement-termination.ts`, `app/api/interaction/chat/route.ts`, and `lib/engine/evaluation-runner.ts`. All are in files this plan's `files_modified` list excludes, and `git status` confirmed those files were mid-edit by other concurrently-running executors (19-02/19-03/19-06) at the time of the check — not caused by this plan's changes. `npx tsc --noEmit` on this plan's own files and `npx eslint app/practice/pitches/page.tsx` showed zero errors/warnings. No action taken, per the scope boundary (only fix issues directly caused by this plan's changes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The picker now matches 19-CONTEXT.md's "Picker presentation" decisions exactly: two top-level cards, in-place expansion, four facts per deck card, negotiation legible before commitment.
- Ready for plan 19-11's Pass 2 keyboard UAT — the disclosure button and focus-on-open behavior were built keyboard-first per the plan's explicit instruction.
- No blockers.

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-08*

## Self-Check: PASSED

`app/practice/pitches/page.tsx` and `scripts/verify-pitch-picker-cards.ts` both verified present on disk and in git history (commits `980f769` and `7f81c49` respectively, confirmed via `git log --oneline -- <path>`). `npx tsx scripts/verify-pitch-picker-cards.ts` confirmed ALL PASS at summary time.
