---
requirement: REQ-77
pass: 2
scope: "Phase 19 surfaces (picker expansion, five-mode wizard, interviewer avatar-picker step including on the investor deck, deck session chrome, report verdict panel) + Phase 18 surfaces (elevator's uninterruptible final statement, no disengagement meter anywhere in the shell), checked where each product behavior actually lives"
status: COMPLETE
authority: "agent-verified (Playwright, real HeyGen/OpenAI), not human — the user decided on 2026-10-25 that agent-driven Playwright evidence replaces the human UAT"
performed_by: "Claude (agent), headless Chromium 1243 driven by page.keyboard only (Tab / Shift+Tab / Enter / Space / Escape / arrows); fake camera + fake mic WAV"
performed_at: 2026-10-25
environment: "local `next dev` on http://localhost:3000, branch feat/study-plan-expansion (HEAD bea7c5a), signed in as alice.johnson@case.edu"
db: "Local dev DB only; read-only queries by the agent to confirm report rows. No shared DB, Preview, Production or deployed app."
defects:
  blocker: 1
  major: 0
  minor: 7
missing_evidence:
  - "No human keyboard/screen-reader pass: focus visibility was judged from screenshots and computed styles, announcements from the accessibility tree, not from a real screen reader."
  - "Item 13/14 were observed on the walk-out dead end (F18-1); the walk-out itself is being fixed separately and was deliberately not re-tested after the fix."
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

**Verdict basis: agent-verified (Playwright, real HeyGen/OpenAI), not human.**
Run 2026-10-25 on `http://localhost:3000`. Every item was driven with
`page.keyboard` only; focus was read after each key press (element, role,
accessible name, `aria-expanded` / `aria-pressed` / `aria-checked`, computed
focus ring). Input is now **tap-to-send** (dev #37): hold-Space push-to-talk was
removed on purpose, so wherever this sheet says "push-to-talk" the tap control
("Tap to record" → "Tap again to send") was tested by keyboard instead.

Harness and raw evidence (scratchpad, not committed):
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/uat-keys-decks/`
(scripts `p2-picker.js`, `p2-starts.js`, `deck-session.js`, `elevator.js`,
`report.js`; `run-*.log`). Screenshots, focus logs, tab-order dumps and
accessibility snapshots are under
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/shots/uat-keys-decks/`.

| Item | Verdict | Notes (observed) |
|---|---|---|
| 1 | PASS | Tab from the page heading: `Start` (elevator) → `Choose a deck setting` (`aria-expanded=false`, focus ring visible). Enter: label becomes `Hide deck settings`, `aria-expanded=true`, `aria-controls=deck-mode-panel`, focus moves to the first `Start` inside the "Deck pitch settings" group. Space toggles identically. Escape collapses the panel and returns focus to the disclosure with `aria-expanded=false`. Shift+Tab from the first inner card returns to the disclosure. (`p2-picker/log.txt`) |
| 2 | PASS (minor defect K-2) | With the panel open, Tab visits five `Start` buttons in card order; Enter on each navigates to `/practice/pitch-deck`, `/pitch-funding`, `/pitch-product`, `/pitch-talk`, `/pitch-general` (`p2-starts/log.txt`). All five buttons have the identical accessible name "Start", so a screen-reader user tabbing through hears "Start" five times with no mode named (K-2). |
| 3 | PASS | Collapsed: the next Tab after the disclosure leaves `main` (dev overlay portal, then the sidebar). None of the five inner cards or their Start buttons is ever focused. |
| 4 | FAIL (minor, K-3) | `FundingAskStep`: Tab reaches `Amount requested` then `Use of funds`; both fill by keyboard. The gate holds — Enter on Continue with empty fields stays on the step and announces two `role=alert` messages ("Enter a positive dollar amount — for example 50000.", "Required — say briefly what the money is for.") — but the Continue button is **never visibly disabled** (`disabled=false`, opacity 1 before filling). The run sheet asks for a visibly disabled affordance; this step validates on submit instead (same pattern as the investor's Phase 14 ask step). |
| 5 | PASS | `BuyerProfileStep`: Continue is disabled (opacity 0.5, skipped by Tab) until `Buyer profile` has text, then enabled; Enter advances. |
| 6 | FAIL (minor, K-3) | `TalkAudienceStep`: same as item 4 — `Audience` and `Takeaway — one sentence` fill by keyboard; empty Enter stays on the step with two alerts ("Required — describe who is listening.", "Required — one sentence, one point."); Continue is never visibly disabled. |
| 7 | PASS | Each of the five deck wizards shows exactly one Camera step (`Step 5 of 5`, `Step 4 of 4` for general). Tab reaches `Practice with my camera on` (`aria-pressed=true`, ring visible); Enter launches the session. |
| 8 | PASS | In funding, product, talk and general: 54 avatar cards, one preselected (`Scott Cowen`, `aria-pressed=true`). Tab moves card to card (arrow keys do nothing — Tab is the mechanism, which the item allows); Space selects; the chosen card gets `aria-pressed=true`, a check mark, and the status line "Selected <name>"; the previous card flips to `false`. Continue is enabled because a choice always exists (preselected). Reaching the sticky Continue takes 44–52 Tabs from the chosen card (long but not a trap). Copy note: the step is titled "Choose your interviewer." and every card says "Hiring manager · Live session" in pitch modes (K-6). |
| 9 | PASS | Investor deck: steps are `Upload your deck → Your ask → Session length → Avatar & voice → Camera`; the avatar step is step 4 of 5 and behaves exactly as item 8 (chose Richard Boyatsis with Space; `aria-pressed` and "Selected Richard Boyatsis" announced). |
| 10 | PASS (minor copy K-5) | In funding, product, talk and general sessions: Tab reaches `Next slide`; Enter advances slide 1→2, Space 2→3; `Previous slide` + Enter goes back 3→2. Thumbnails are buttons in the tab order. Copy: thumbnail names read "Slide 2, current, shown to the investor" in every non-investor mode (K-5). |
| 11 | FAIL (minor, K-4) | `Hide session timer` (`aria-expanded=true`) is reachable and Enter hides the timer, but focus drops to `<body>` because the Hide and Show controls are two different buttons rendered in separate branches of `DeckTimerPanel.tsx`; Space then has no target and the user must Tab again from the top of the page to find `Show session timer`. Toggling works; focus is lost on every toggle. |
| 12 | FAIL (minor, K-1) | The verdict panels (`funding-verdict-panel`, `product-verdict-panel`, `talk-verdict-panel`, and the investor's `negotiation-triple-panel`) are `<section>`s whose titles ("Funding verdict", "Buyer verdict", "Audience takeaway", "Ask · Settled · Fair range") are `<p>` text. There is no heading element inside them and no `aria-label` / `aria-labelledby`, so heading navigation cannot reach them (`report.js` heading dump for reports `0a70e829…`, `4f47f8ba…`, `09c2ebb3…`, `fd8505a6…`). Their content is readable in document order; they contain nothing focusable, which is correct. |
| 13 | FAIL (blocker F18-1, already recorded) | Elevator, "Completely blind", stalled with typed one-liners. The lock engaged after turn 9: textarea, Send, `Start recording answer`, `Leave interview` and `End interview` all disabled; Tab only reaches `Hide pitch timer` and the transcript region; typing "hello?" + Enter changed nothing. So the input lock is inert by keyboard. But the final statement never plays — the forced farewell request is never sent (F18-1). Report row `5a7b1394-f068-484f-a673-b033dfc4d821` stays IN_PROGRESS. |
| 14 | FAIL (blocker F18-1, already recorded) | No auto-finish within 180 s, and nothing more in a further 240 s. No report. Because `End interview` is also disabled, the keyboard user has no way out except leaving the page. This is the same dead end 18-05's agent run recorded as F18-1. It is being fixed on a separate worktree and was **not** re-tested here, per the coordinator. |
| 15 | PASS | No meter, gauge, `progressbar`/`meter` role or engagement/disengagement/warning text in the shell at session start, mid-stall (turn 3) or during the lock (elevator). The same scan was clean in all six deck sessions. Full tab orders are saved as `shell-tab-order.txt` per run. |

Supplementary keyboard checks made during the same runs:

- **Tap-to-send by keyboard** (supersedes hold-Space, dev #37): in pitch-funding
  run 1, Tab reaches `Start recording answer`; Enter starts recording (label
  "Tap again to send", name `Stop recording and send answer`); Space sends
  ("Answer submitted"); the spoken WAV appears as the student turn. Focus drops to
  `<body>` after send because the button is disabled while transcribing (noted,
  not counted as a separate defect).
- **Deck upload drop zone has no visible focus** (K-7): Tab lands on a 1×1
  `sr-only` file input inside the label; the label has no focus-within style
  (screenshot `deck-pitch-funding/02-upload-focused.png`). Enter does open the
  file chooser. Phase 14 surface, shared by all five deck modes.
- **Hold-Space push-to-talk**: SUPERSEDED by dev #37 tap-to-send (removed on
  purpose; not a failure).

## 5. Defects

| # | Item | Severity | Observed vs expected | Repro | Implicated |
|---|---|---|---|---|---|
| F18-1 | 13, 14 | blocker | Walk-out locks input but never plays the farewell or finishes; End is disabled, so the student is trapped. | `/practice/pitch-elevator` → any subject → "Completely blind" → camera on → answer "It's an app." style one-liners until the textarea disables; wait 3 min. | Already recorded in `18-VALIDATION.md` (18-05); fix in progress on a separate worktree. Not counted again in Phase 19's own list. |
| K-1 | 12 | minor | Verdict panel titles are `<p>`, not headings; no accessible name on the section. Expected a real heading. | Open any deck-mode report; list headings (none for the verdict panel). | `components/practice/report/DeckVerdictPanel.tsx` `VerdictCard`; `NegotiationTriplePanel.tsx` same chrome |
| K-2 | 2 | minor | Five deck-mode buttons all named "Start". Expected the mode in the name (e.g. "Start funding request"). | `/practice/pitches` → expand "With a deck" → Tab. | `app/practice/pitches/page.tsx` deck card buttons |
| K-3 | 4, 6 | minor | Funding and talk Continue never visibly disabled (validate-on-submit with alerts); product step does disable. Expected a visibly disabled affordance per the run sheet. | Start pitch-funding or pitch-talk, upload deck, press Enter on Continue with empty fields. | `components/practice/steps/FundingAskStep.tsx`, `TalkAudienceStep.tsx` |
| K-4 | 11 | minor | Hide/Show session timer drops focus to `<body>` on every toggle. Expected focus to stay on the toggle. | In a deck session, Tab to "Hide session timer", Enter, read `document.activeElement`. | `components/practice/panels/DeckTimerPanel.tsx` (two separate buttons in two branches) |
| K-5 | 10 | minor | Slide thumbnail names say "shown to the investor" in funding/product/talk/general. | Any non-investor deck session; read thumbnail names. | `components/practice/panels/DeckViewerPanel.tsx` line ~232 |
| K-6 | 8 | minor | Avatar step copy says "Choose your interviewer." / "Hiring manager · Live session" in all deck modes. | Any deck wizard, avatar step. | `components/practice/steps/InterviewerStep.tsx` |
| K-7 | (upload) | minor | No visible focus on the deck upload drop zone. | Any deck wizard step 1, Tab to the upload control, screenshot. | `components/practice/steps/DeckUploadStep.tsx` (sr-only input in label, no focus-within style) |

Related non-keyboard defect found in the same runs (recorded in `19-VALIDATION.md`, not here): **D19-1 (major)** — the session-length step offers the investor's 20–30 min range in every deck mode.

## 6. Evidence limitation and disposition

COMPLETE as an agent-verified pass: all 15 items have a verdict from observed
keyboard behaviour. 9 PASS (2 with minor notes), 4 FAIL minor, 2 FAIL on the
already-recorded blocker F18-1. The limitations are in the frontmatter: no real
screen reader, and the walk-out items were observed on the known dead end and are
not re-run after the separate fix.

## 7. Repair ledger

No product code was changed in this plan. Every defect above is open and handed
to the coordinator for a fix decision.


## Fixes applied after the agent-verified UAT (2026-10-25)

User-approved fixes are in `57b221f` (walk-out branch) and `7d54505`
(polish branch), merged in `a42eca1` and `58d8699`. Guards are in
`scripts/verify-uat-polish.ts` (32 checks with bite-proofs) and
`verify-disengagement-walkout-shell.ts` §10–12.
- Items 4, 6, 11 and 12 (K-1 to K-7): fixed. Items 13 and 14 (F18-1): fixed and re-tested live.
