---
phase: 14-practice-pitches
plan: 12
subsystem: wizard-ui
tags: [deck-upload, wizard, negotiation-ask, session-length, xhr-progress, fair-value-band]

requires:
  - phase: 14-07
    provides: "POST /api/practice/deck/upload + manifest + slide ?v=thumb; {error,fix, code} rejection shape"
  - phase: 14-09
    provides: "pitch-deck setupSteps + proposeDeckSeconds + InstanceConfig ask/fair shape"
provides:
  - "DeckUploadStep — XHR progress, processing state, reason+fix retry, thumbnails"
  - "NegotiationAskStep — plain askPriceUsd / askEquityPct form fields"
  - "SessionLengthStep — proposeDeckSeconds pre-fill, 20–30 min slider"
  - "pitch-deck registration + launch assembly on /practice/[type]"
  - "resolveDeckFairValueBand — server-only ask-independent constant"
affects: [14-13-deck-shell, 14-14-report-panels, 14-15-tuning]

tech-stack:
  added: []
  patterns:
    - "Slow upload step uses XHR onprogress + indeterminate processing — not ResumeStep"
    - "fairValueBand never leaves the server; startSession overwrites any client value"
    - "slideTexts fetched from owner manifest at launch only — not held in wizard state"
    - "SetupWizard.buildStartPayload may return a Promise for launch-time fetches"

key-files:
  created:
    - components/practice/steps/DeckUploadStep.tsx
    - components/practice/steps/NegotiationAskStep.tsx
    - components/practice/steps/SessionLengthStep.tsx
    - lib/pitch/fair-value-band.ts
  modified:
    - app/practice/[type]/page.tsx
    - components/practice/SetupWizard.tsx
    - lib/engine/session.ts

key-decisions:
  - "DEFAULT_DECK_FAIR_VALUE_BAND = $800k–$1.2M for 8–12% equity — per-type constant, ask-independent; 14-15 may retune numbers only"
  - "Wizard state keys: deckUpload {deckId,slideCount,slides[]}, negotiationAsk {askPriceUsd,askEquityPct}, sessionLength {budgetSeconds}"
  - "startSession authoredInWizard branch always injects resolveDeckFairValueBand for pitch-deck (13-07 extension)"
  - "buildStartPayload async-capable so slideTexts load from GET /api/practice/deck/{deckId} at launch"

patterns-established:
  - "Custom slow steps own their state machine; never parameterize ResumeStep"
  - "Hidden instance config (fair band) is injected in startSession, never posted from the page"

requirements-completed: [P14-SC2, P14-SC4, P14-SC5]

duration: 5min
completed: 2026-10-04
---

# Phase 14 Plan 12: Deck Wizard UI Summary

**Investor pitch-deck setup on Phase 13's wizard: XHR upload with honest progress and reason+fix errors, plain ask fields, and a slide-count-derived 20–30 minute proposal — with the hidden fair-value band injected only in startSession.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-04T15:18:17Z
- **Completed:** 2026-10-04T15:23:13Z
- **Tasks:** 3/3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `DeckUploadStep`: `idle | uploading | processing | ready | rejected | failed` with determinate XHR upload progress, indeterminate processing copy, two-part error UI, in-place retry, reversible ready state, portrait-aware thumbnails via `?v=thumb`.
- `NegotiationAskStep` / `SessionLengthStep`: structural ask (no realism check, no fair-band leakage) and `proposeDeckSeconds` proposal clamped to the envelope with soft-overrun copy.
- `/practice/pitch-deck` registers all three steps; launch fetches slideTexts from the owner manifest and posts `timeBudgetOverrideSeconds`; `startSession` injects `DEFAULT_DECK_FAIR_VALUE_BAND`.

## Fair-value band (for 14-13 / 14-14)

| Field | Value |
| --- | --- |
| Rule | Per-type constant — **never** derived from `askPriceUsd` / `askEquityPct` |
| Location | `lib/pitch/fair-value-band.ts` → `resolveDeckFairValueBand` |
| Injection | `lib/engine/session.ts` authoredInWizard branch (always overwrites) |
| Numbers | priceUsd `$800_000`–`$1_200_000`; equityPct `8`–`12` |
| Client | Identifier absent from `components/` and `app/practice/` |

## Wizard-state keys

| Step id | Page state | Shape |
| --- | --- | --- |
| `deck-upload` | `deckUpload` | `{ deckId, slideCount, slides: [{index,widthPx,heightPx}] }` |
| `negotiation-ask` | `negotiationAsk` | `{ askPriceUsd, askEquityPct }` |
| `session-length` | `sessionLength` | `{ budgetSeconds }` |

Launch posts `instance` (without the hidden band) + `timeBudgetOverrideSeconds: budgetSeconds`. `proposedSeconds` is the formula proposal for the snapshot; the clamped override is the persisted budget.

## Task Commits

1. **Task 1: The deck upload step** — `34cc1c3` (feat)
2. **Task 2: The ask step and the session-length step** — `ea5734a` (feat)
3. **Task 3: Register the three steps and assemble the pitch-deck instance at launch** — `ba2bcfd` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `components/practice/steps/DeckUploadStep.tsx` — custom upload step (Pitfall 4; not optional; not ResumeStep)
- `components/practice/steps/NegotiationAskStep.tsx` — plain USD + equity fields
- `components/practice/steps/SessionLengthStep.tsx` — proposal + 1-minute slider in envelope
- `lib/pitch/fair-value-band.ts` — ask-independent server band
- `lib/engine/session.ts` — inject band on pitch-deck start (13-07 extension)
- `components/practice/SetupWizard.tsx` — async `buildStartPayload`
- `app/practice/[type]/page.tsx` — step registration + pitch-deck launch assembly

## Decisions Made

See `key-decisions` in frontmatter. Band numbers are a 14-15 tuning knob; ask-independence is not.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Async buildStartPayload**
- **Found during:** Task 3
- **Issue:** Manifest slideTexts must load at launch without living in wizard state; `buildStartPayload` was synchronous.
- **Fix:** `SetupWizard` awaits `Promise.resolve(buildStartPayload(...))`.
- **Files modified:** `components/practice/SetupWizard.tsx`
- **Committed in:** `ba2bcfd`

**2. [Rule 2 - Missing critical functionality] startSession fair-band injection**
- **Found during:** Task 3 (plan-required)
- **Issue:** Client must not supply the hidden band.
- **Fix:** `resolveDeckFairValueBand` + always overwrite in the authoredInWizard path.
- **Files modified:** `lib/pitch/fair-value-band.ts`, `lib/engine/session.ts`
- **Committed in:** `ba2bcfd`

**Total deviations:** 2 (Rule 3 ×1, Rule 2 ×1)
**Impact on plan:** Required for correctness; no scope creep.

## Issues Encountered

- Full `npx tsc --noEmit` still reports pre-existing errors in unrelated verify scripts / stale `.next` spike types — none in 14-12 files.
- Live browser walkthrough of `/practice/pitch-deck` (upload → ask → length → camera → start) was not run in this parallel agent; code verification + greps passed. 14-13 will exercise the live session these steps start.

## User Setup Required

None beyond existing deck upload env (Gotenberg still needed for PPTX; PDF path works).

## Next Phase Readiness

- 14-13 can assume wizard state + started session with clamped `timeBudgetSeconds` and ask in `inputSnapshot`
- 14-14 reads ask vs settled vs fair from snapshot + outcome; fair band lives in snapshot from server injection

## Self-Check: PASSED

- FOUND: `components/practice/steps/DeckUploadStep.tsx` (422 lines)
- FOUND: `components/practice/steps/NegotiationAskStep.tsx` (213 lines)
- FOUND: `components/practice/steps/SessionLengthStep.tsx` (155 lines)
- FOUND: `lib/pitch/fair-value-band.ts`
- FOUND: commits `34cc1c3`, `ea5734a`, `ba2bcfd`
- FOUND: `grep fairValueBand components/ app/practice/` → none
- FOUND: `grep onprogress DeckUploadStep` → match
- FOUND: `grep proposeDeckSeconds SessionLengthStep` → match
