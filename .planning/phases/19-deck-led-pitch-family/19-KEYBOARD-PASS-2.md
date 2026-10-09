---
requirement: REQ-77
pass: 2
scope: "Phase 19 surfaces (picker expansion, five-mode wizard, interviewer avatar-picker step including on the investor deck, deck session chrome, report verdict panel) + Phase 18 surfaces (elevator's uninterruptible final statement, no disengagement meter anywhere in the shell), checked where each product behavior actually lives"
status: PENDING
authority: human-performed, agent-recorded
performed_by: TBD (human, at Task 2)
environment: "local `next dev`, started by the agent before the checkpoint"
db: "No database connection made by the agent. Local dev DB only if the human's own session play requires one."
defects:
  blocker: 0
  major: 0
  minor: 0
missing_evidence: []
---

# Phase 19 Keyboard UAT — Pass 2

## 1. Scope fence

This record covers the keyboard-operability surfaces Phase 18 and Phase 19 add,
as Pass 2 of the project's two-pass keyboard UAT. Its predecessor is
[[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1.md]], which fenced
Phases 15 and 16 plus one Phase 15 hostile-drift probe, and explicitly scoped
Pass 2 — "including Phases 18 and 19 surfaces" — to this phase's closing plan
(19-11).

Phase 18's walk-out items in this run sheet are checked on `pitch-elevator`, NOT
on any deck mode, because Phase 19 turned every deck mode's walk-out off
(`19-CONTEXT.md`'s "Walk-out: OFF for every deck mode" decision; recorded as a
deliberate amendment to Phase 18 in `19-03-SUMMARY.md`). The elevator is the one
type still opted into Phase 18's disengagement mechanism after this phase, so it
is the only type where Phase 18's keyboard behavior can still be exercised.

## 2. Automated ground

The automated battery backing this run sheet is recorded in full in
`19-VALIDATION.md`'s "Automated script battery" table (run 2026-10-08). In
summary: 16 of 18 commands PASS clean; `verify-pitch-types.ts` has one inherited,
documented Phase 18 failure (`18-PITCH-TYPES-REGRESSION.md`) unrelated to
keyboard behavior; `verify-turn-control.ts` has four newly-disclosed Phase 19
tooling-debt failures (`19-TURN-CONTROL-RED-SCRIPT.md`) in a test script's
fixture loop, also unrelated to keyboard behavior. `npx tsc --noEmit` and
`npm run build` are both clean.

No automated script can assert keyboard-only operability, `aria-expanded` state
transitions, screen-reader-visible headings, or focus order — this is why Pass 2
is a human-performed record, not a verifier.

No database, Preview, Production, or deployed-app command was run by the agent in
producing this record.

## 3. Run sheet

Work through every item below, keyboard only (no mouse/trackpad click — Tab,
Shift+Tab, Enter, Space, and arrow keys only unless an item says otherwise).
Report a per-item PASS/FAIL/BLOCKED verdict plus any defect, one line per item.

### Phase 19 surfaces

1. **Picker disclosure reached and toggled by keyboard alone.** On
   `/practice/pitches`, Tab until focus reaches the "With a deck" card. Press
   Enter (then, separately, re-test with Space). Confirm `aria-expanded` flips to
   `true`, the five deck-mode cards become visible, and focus lands somewhere
   inside the expanded panel (not lost to `<body>`). Press Escape, or
   alternatively Shift+Tab back past the disclosure — confirm the panel
   collapses (or that focus correctly exits it) and `aria-expanded` returns to
   `false`.
2. **The five deck cards are reachable and their Start buttons activatable by
   keyboard.** With the panel expanded, Tab through all five deck-mode cards in
   order. For each, confirm a Start (or equivalent) affordance receives focus
   and Enter activates it, navigating to that mode's wizard.
3. **The five mode cards are NOT in the tab order while collapsed.** Collapse
   the "With a deck" panel again. Tab from the "Elevator pitch" card toward
   "With a deck" and confirm focus never lands on any of the five inner mode
   cards or their Start buttons while the panel is collapsed.
4. **`FundingAskStep` completable by keyboard, advance blocked until valid.**
   Start a `pitch-funding` session. Tab to the amount field, type a value; Tab
   to the use-of-funds field, type a value. Confirm the advance/Next affordance
   is visibly disabled (not just silently inert) before both fields are valid,
   and becomes enabled and keyboard-activatable once they are.
5. **`BuyerProfileStep` completable by keyboard, advance blocked until valid.**
   Start a `pitch-product` session. Tab through the buyer-profile fields, fill
   them by keyboard only. Confirm the same disabled-until-valid / activatable
   pattern as item 4.
6. **`TalkAudienceStep` completable by keyboard, advance blocked until valid.**
   Start a `pitch-talk` session. Tab through the audience + takeaway fields,
   fill them by keyboard only. Confirm the same disabled-until-valid /
   activatable pattern as item 4.
7. **The camera-consent gate is reached once per session, never twice.** In any
   one of the above sessions, confirm the camera-consent step appears exactly
   once in the step sequence (not once per mode-specific step), and that it is
   itself operable by keyboard (Tab to the consent control, Enter/Space to
   grant).
8. **The `interviewer` avatar-picker step is completable by keyboard in a deck
   mode.** In any new deck mode's wizard (funding, product, or talk), reach the
   avatar-picker step. Use arrow keys or Tab to move across the avatar cards,
   and Enter or Space to choose one. Confirm the chosen card's selected state is
   visually AND programmatically indicated (e.g. `aria-selected`/`aria-checked`
   or an accessible "selected" announcement, not color alone), and that the
   advance affordance is disabled until a choice exists.
9. **The `interviewer` avatar-picker step is completable by keyboard on the
   INVESTOR deck specifically — newly added by this phase.** Start a
   `pitch-deck` session. Confirm the `Avatar & voice` step now appears in the
   wizard (it did not before this phase) and repeat item 8's keyboard mechanics
   — arrow keys/Tab across cards, Enter/Space to choose, selected-state
   announced, advance blocked until chosen.
10. **The live deck viewer is operable by keyboard in a non-investor mode.** In
    a `pitch-funding`/`pitch-product`/`pitch-talk`/`pitch-general` session,
    confirm the deck/slide viewer's controls (e.g. next/previous slide, or
    whatever controls exist) are reachable by Tab and activatable by
    Enter/Space, not mouse-only.
11. **The hideable soft timer is operable by keyboard in a non-investor mode.**
    In the same session, Tab to the timer's hide/show control and confirm
    Enter/Space toggles it.
12. **The report's verdict panel is reachable and readable with a
    screen-reader-visible heading.** On any completed deck-mode report, Tab to
    (or otherwise confirm keyboard-reachability of) the verdict panel section
    and confirm it has a real heading element (not a styled `<div>`) that a
    screen reader would announce.

### Phase 18 surfaces (checked on `pitch-elevator`)

13. **The elevator's final uninterruptible statement blocks both input
    affordances for its duration.** Play a `pitch-elevator` session and stall
    deliberately (short, repetitive, non-tailored answers) until the walk-out's
    final statement begins. During that statement, confirm BOTH the
    push-to-talk control and the text-input Send path are unreachable or inert
    by keyboard — Tab should not focus them, or if focus lands on them, Enter/
    activation should have no effect.
14. **The session auto-finishes and the report arrives without pressing
    End-session.** Continuing from item 13, confirm the session transitions to
    its report automatically once the final statement ends — no End-session
    keypress required, and (per Phase 18's fix) no dead wait beyond the
    statement's real speech duration.
15. **No disengagement meter, indicator, or warning anywhere in the session
    shell, checked by full keyboard traversal.** Tab through the ENTIRE session
    shell (not just the elevator's) at any point before, during, and after the
    stall — confirm no live engagement meter, gauge, or warning element exists
    anywhere in the DOM/tab order (REQ-85).

## 4. Results

(To be filled by Task 3 from the human's Task 2 response — one row per item
above, verbatim where the verdict is a judgement, never paraphrased into a pass.)

| Item | Verdict | Notes |
|---|---|---|
| 1 | PENDING | |
| 2 | PENDING | |
| 3 | PENDING | |
| 4 | PENDING | |
| 5 | PENDING | |
| 6 | PENDING | |
| 7 | PENDING | |
| 8 | PENDING | |
| 9 | PENDING | |
| 10 | PENDING | |
| 11 | PENDING | |
| 12 | PENDING | |
| 13 | PENDING | |
| 14 | PENDING | |
| 15 | PENDING | |

## 5. Defects

(To be filled by Task 3.)

## 6. Evidence limitation and disposition

PENDING — this record is drafted with every item awaiting a verdict. No item has
been pre-filled, and no item will be upgraded to PASS without the human's own
observation.

## 7. Repair ledger

(To be filled by Task 3, if any defect is raised and fixed.)
