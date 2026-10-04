---
phase: 14-practice-pitches
plan: 13
subsystem: session-ui
tags: [typescript, pitch-deck, deck-viewer, soft-timer, high-water-mark, sessionPanel, extraChatBody]

requires:
  - phase: 14-11
    provides: "revealedSlideIndex chat/checkpoint ratchet + slide-reveal tail fragment"
  - phase: 14-12
    provides: "deck wizard state (deckUpload/ask/length) + server-clamped timeBudgetSeconds"
  - phase: 13-10
    provides: "PracticeSessionShell sessionPanel slot + client-driven checkpoint cadence"
provides:
  - "DeckViewerPanel — next/back, keyboard, thumbnail strip, furthest-only reporting"
  - "DeckTimerPanel — soft hideable remaining-time display (no cutoff callbacks)"
  - "Shell extraChatBody + mediaLayout deck-primary (slides stage, avatar PiP)"
  - "Pitch-deck page wiring: revealedSlideIndex on every chat turn and checkpoint"
affects: [14-14-report-panels, 14-15-tuning]

tech-stack:
  added: []
  patterns:
    - "Client tracks furthest only to report; server ratchet remains authoritative"
    - "extraChatBody merges into every /api/interaction/chat body; revealedSlideIndex also rides checkpoint"
    - "mediaLayout: deck-primary fills left pane with slides; avatar corner PiP"
    - "Soft timer structurally cannot expire the session (no onExpire/onTimeUp)"

key-files:
  created:
    - components/practice/panels/DeckViewerPanel.tsx
    - components/practice/panels/DeckTimerPanel.tsx
  modified:
    - components/practice/PracticeSessionShell.tsx
    - app/practice/[type]/page.tsx
    - components/practice/SetupWizard.tsx
    - app/api/practice/session/start/route.ts
    - lib/engine/session.ts

key-decisions:
  - "13-10 extension: optional extraChatBody + sessionPanelClassName + mediaLayout on PracticeSessionShell"
  - "Start returns server-clamped timeBudgetSeconds so DeckTimerPanel shows the truth, not the wizard request"
  - "Did not extract useSoftTimer — PitchTimerPanel and DeckTimerPanel contracts differ enough; duplication noted"
  - "Mid-checkpoint: deck-primary layout (slides stage + avatar PiP) after tiny overlay proved unreadable"
  - "Broader non-investor deck modes deferred — see deferred-items.md"

patterns-established:
  - "Reveal claims ride every turn via extraChatBody so dropped writes self-heal"
  - "Pitch-deck left pane is deck-primary; other types stay avatar-primary"

requirements-completed: [P14-SC3, P14-SC5]

duration: 23min
completed: 2026-10-04
---

# Phase 14 Plan 13: Live Deck Viewer + Soft Timer Summary

**Student clicks through rendered slides live while furthest-only `revealedSlideIndex` rides every chat/checkpoint; soft hideable timer never ends the meeting; mid-verify layout fix made slides the primary stage with avatar PiP.**

## Performance

- **Duration:** ~23 min (implementation) + human leak-test UAT
- **Started:** 2026-10-04T15:24:35Z
- **Completed:** 2026-10-04T15:47:13Z
- **Tasks:** 3/3
- **Files modified:** 7 (2 created, 5 modified; layout fix touched 3 of those again)

## Accomplishments

- `DeckViewerPanel`: single `goTo` path for next/back, arrows/PageUp/PageDown, and thumbnail jumps; reports furthest only on forward advances; no slide text on the client; subtle “shown to the investor” thumb treatment.
- `DeckTimerPanel`: remaining `mm:ss`, amber under 5:00, overrun counts up with soft-envelope copy; collapsible; structurally no expire callbacks.
- Shell + page: `extraChatBody` carries `revealedSlideIndex` + `reportId` on every chat turn and checkpoint; start returns clamped `timeBudgetSeconds`.
- Human leak-test **approved**; mid-checkpoint UX fix shipped slides as primary stage with avatar PiP.

## Human verify (Task 3) — verdict verbatim

> overall, id say it's approved

**Also recorded from human / orchestrator notes:**
- Mid-checkpoint UX fix shipped: slides as primary stage with avatar PiP (commit `8eb738f`) after user reported tiny overlay slides were hard to see.
- Product note (deferred, NOT a defect): broaden slide-deck pitch modes beyond investor ask/equity — logged in `deferred-items.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: The live deck viewer panel** — `6bf426a` (feat)
2. **Task 2: The session timer panel and the mount into the generic shell** — `06ca16f` (feat)
3. **Task 3: Human leak-test verify** — approved (no code commit); layout remediation during UAT — `8eb738f` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `components/practice/panels/DeckViewerPanel.tsx` — live stage + strip; furthest reporting only
- `components/practice/panels/DeckTimerPanel.tsx` — soft hideable session timer
- `components/practice/PracticeSessionShell.tsx` — `extraChatBody`, `sessionPanelClassName`, `mediaLayout` (deck-primary PiP)
- `app/practice/[type]/page.tsx` — pitch-deck mount + reveal wiring
- `components/practice/SetupWizard.tsx` — pass through `timeBudgetSeconds` from start
- `app/api/practice/session/start/route.ts` — include clamped budget in launch payload
- `lib/engine/session.ts` — wizard-authored start returns `timeBudgetSeconds`

## Decisions Made

- **Shell extensions (13-10):** `extraChatBody` for reveal/reportId; `mediaLayout: "deck-primary"` so slides own the left pane and the investor avatar sits as corner PiP (after overlay proved too small in UAT).
- **Timer budget source:** server-clamped `timeBudgetSeconds` from `/api/practice/session/start`, not the wizard’s requested value.
- **No shared soft-timer hook:** left `PitchTimerPanel` / `DeckTimerPanel` separate (elapsed band vs remaining countdown); duplication noted, not extracted.
- **Deferred product scope:** non-investor deck-led modes stay out of Phase 14 lock (`deferred-items.md`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Start API did not return clamped budget**
- **Found during:** Task 2
- **Issue:** Plan required `DeckTimerPanel` to show server-clamped `timeBudgetSeconds`; start only returned `reportId` / `cameraMode`.
- **Fix:** Wizard-authored `startSession` returns `timeBudgetSeconds`; start route + `SetupWizard` / page plumb it through.
- **Files modified:** `lib/engine/session.ts`, `app/api/practice/session/start/route.ts`, `components/practice/SetupWizard.tsx`, `app/practice/[type]/page.tsx`
- **Commit:** `06ca16f`

**2. [Rule 1 - Bug] Tiny overlay slides unreadable in live session**
- **Found during:** Task 3 human verify
- **Issue:** Mounting the viewer in the compact top-right `sessionPanel` overlay made slides too small to pitch from.
- **Fix:** Added `mediaLayout: "deck-primary"` — slides fill the left stage; avatar becomes corner PiP beside self-view.
- **Files modified:** `PracticeSessionShell.tsx`, `app/practice/[type]/page.tsx`, `DeckViewerPanel.tsx`
- **Commit:** `8eb738f`

---

**Total deviations:** 2 auto-fixed (1× Rule 3, 1× Rule 1)
**Impact on plan:** Necessary for correctness and usable live UX; no scope creep into new pitch modes.

## Issues Encountered

None beyond the deviations above. Pre-existing `tsc` noise in unrelated verify scripts left untouched.

## Deferred Items

- Broader slide-deck pitch modes beyond investor ask/equity (human product note during UAT) — see `deferred-items.md`. Not a defect.

## Measured notes (plan output requests)

- **Shared soft-timer hook:** not extracted.
- **Shell 13-10 extensions:** `extraChatBody`, `sessionPanelClassName`, `mediaLayout`.
- **Slide-advance latency:** not instrumented numerically in this agent; human UAT accepted after deck-primary layout (preload of prev/next slide images remains in the viewer).

## Next Phase Readiness

- 14-14 can assume live sessions write `slideHighWaterMark` / `slideReveals` and `timeBudgetSeconds` on the report row.
- Leak gating path is human-confirmed in the live chat turn, not only in `verify-slide-gating.ts`.

## Self-Check: PASSED

- FOUND: `components/practice/panels/DeckViewerPanel.tsx`
- FOUND: `components/practice/panels/DeckTimerPanel.tsx`
- FOUND: commit `6bf426a`
- FOUND: commit `06ca16f`
- FOUND: commit `8eb738f`
- FOUND: human verdict recorded verbatim
- FOUND: deferred broader deck modes noted
