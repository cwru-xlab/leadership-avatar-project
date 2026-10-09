---
phase: 19-deck-led-pitch-family
plan: 02
subsystem: engine
tags: [typescript, pitch, instance-config, report-snapshot, fair-value-band]

# Dependency graph
requires:
  - phase: 19-deck-led-pitch-family
    provides: "plan 19-01's DECK_MODES table, DeckModeInputs type, deckModeNegotiates/isDeckModeSlug lookups"
  - phase: 14-deck-pitch-capability
    provides: "the pitch-deck InstanceConfig member, PitchInputSnapshot, resolveDeckFairValueBand, instanceFromPitchSnapshot"
provides:
  - "lib/engine/types.ts — pitch-deck InstanceConfig member with askPriceUsd/askEquityPct/fairValueBand made optional (absent, not zeroed) plus one optional modeInputs: DeckModeInputs field, shared by all five deck modes"
  - "lib/report/snapshot.ts — PitchInputSnapshot.deckModeInputs (optional, deliberately excluded from PITCH_INPUT_KEYS), with defensive asDeckModeInputs narrowing in asInputSnapshot"
  - "lib/pitch/fair-value-band.ts — resolveDeckFairValueBand(typeSlug, meta?) returns null for any non-negotiating mode"
  - "lib/engine/session.ts — authoredInWizard band injection is mode-aware; strips client-supplied fairValueBand/askPriceUsd/askEquityPct for non-negotiating modes; pitchSnapshotFromInstance (exported) carries deckModeInputs through and no longer assumes negotiation fields exist"
  - "lib/engine/evaluation-runner.ts — instanceFromPitchSnapshot (exported, injectable manifestLoader) reconstructs a deck instance without an ask; resolves the band only for negotiating modes; carries modeInputs through"
  - "scripts/verify-deck-family-plumbing.ts — seven-section fixture-only proof of absence, mode-aware band resolution, reconstruction without an ask, pre-Phase-19 back-compatibility, malformed-input degradation, investor-path parity, and no new InstanceConfig kind"
affects: [19-03, 19-04, 19-05, 19-06, 19-07, 19-08, 19-09, 19-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency-injectable loader parameter (manifestLoader, defaulting to loadDeckManifest) so a function that does S3 I/O can still be exercised by a fixture-only verify script"
    - "Strip-the-key-entirely posture for server-decided fields: a non-negotiating mode's wizard instance has askPriceUsd/askEquityPct/fairValueBand deleted via object destructuring rest, never set to null — absence is the enforcement"
    - "Spread-additive narrowing in asInputSnapshot: a newly added optional field (deckModeInputs) is attached AFTER the existing hasAllKeys gate passes, so the required-key list for back-compat never changes"

key-files:
  created:
    - scripts/verify-deck-family-plumbing.ts
  modified:
    - lib/engine/types.ts
    - lib/report/snapshot.ts
    - lib/pitch/fair-value-band.ts
    - lib/engine/session.ts
    - lib/engine/evaluation-runner.ts
    - app/api/interaction/chat/route.ts

key-decisions:
  - "resolveDeckFairValueBand's new typeSlug-first signature broke one call site outside this plan's files_modified list (app/api/interaction/chat/route.ts, owned by no other 19-xx plan). Fixed it inline under deviation Rule 3 (blocking issue directly caused by this plan's signature change) rather than leaving the build broken."
  - "Exported pitchSnapshotFromInstance (session.ts) and instanceFromPitchSnapshot (evaluation-runner.ts), previously private, specifically so scripts/verify-deck-family-plumbing.ts could exercise them with fixtures. instanceFromPitchSnapshot also gained an injectable manifestLoader parameter (default loadDeckManifest) so the proof needs no S3 access."
  - "The non-negotiating wizardInstance strip in session.ts deletes the three fields via destructuring rest rather than setting them to null/undefined, matching the plan's explicit 'absence, not zero' requirement at the instance level (not just the snapshot level)."

patterns-established:
  - "Pattern: a shared InstanceConfig member whose fields differ by mode stays ONE union member with those fields made optional — never a second kind, never a boolean flag. Readers must check presence, not value."

requirements-completed: [REQ-88, REQ-89, REQ-93, P19-SC2, P19-SC5]

# Metrics
duration: 35min
completed: 2026-10-08
---

# Phase 19 Plan 02: Shared Deck Instance & Snapshot Widening Summary

**One additive, mode-agnostic widening of `InstanceConfig`'s `pitch-deck` member, `PitchInputSnapshot`, the fair-value-band resolver, `session.ts`'s snapshot/wizard paths, and the evaluation runner's reconstruction — letting all five deck modes ride the existing deck pipeline with negotiation data absent (not zeroed) for four of them.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-08T20:05:00Z
- **Completed:** 2026-10-08T20:40:00Z
- **Tasks:** 3 completed
- **Files modified:** 7 (6 modified, 1 created)

## Accomplishments
- `lib/engine/types.ts`'s `pitch-deck` `InstanceConfig` member now has `askPriceUsd?`, `askEquityPct?` and `fairValueBand?` as optional fields (absent, never zeroed, for a non-negotiating mode) plus one new optional `modeInputs?: DeckModeInputs` extension point — no new `InstanceConfig` kind, so the chat route's allow-list, slide-hydration branch, `session.ts`'s snapshot/ratchet path and the evaluation runner's reconstruction all keep working untouched for all five modes.
- `lib/report/snapshot.ts`'s `PitchInputSnapshot` gained an optional `deckModeInputs`, deliberately excluded from `PITCH_INPUT_KEYS` so every pre-Phase-19 stored report still narrows through `asInputSnapshot`'s `hasAllKeys` gate; a new `asDeckModeInputs` helper degrades anything malformed (string, array, unknown `mode`) to `null` rather than rejecting the whole snapshot.
- `lib/pitch/fair-value-band.ts`'s `resolveDeckFairValueBand` is now mode-aware: `(typeSlug, meta?)` returns `null` for any slug where `deckModeNegotiates` is false, keeping the ask-independence rule verbatim for the one mode that still gets a band.
- `lib/engine/session.ts`: the `authoredInWizard` band injection calls the new resolver and, for a non-negotiating mode, strips any client-supplied `fairValueBand`/`askPriceUsd`/`askEquityPct` from the wizard instance entirely (object-destructure rest, not null-assignment) — the server decides whether terms exist, not the client. `pitchSnapshotFromInstance` (now exported) no longer assumes the negotiation fields exist and carries `deckModeInputs` through.
- `lib/engine/evaluation-runner.ts`'s `instanceFromPitchSnapshot` (now exported, with an injectable `manifestLoader`) dropped the hard precondition that `askPriceUsd`/`askEquityPct` be finite numbers — today that precondition made every non-investor deck session unevaluable. It now requires only `deckId` + a usable `slideCount`, carries the negotiation fields only when finite, resolves the band only for negotiating modes, and passes `modeInputs` onto the reconstructed instance.
- `scripts/verify-deck-family-plumbing.ts`: a seven-section, fixture-only proof — ALL PASS — covering absence-not-zero, mode-aware band resolution for all five slugs, reconstruction without an ask (with `modeInputs` carried through), pre-Phase-19 back-compatibility, malformed `deckModeInputs` degrading to `null`, investor-path parity end-to-end, and a source-text check that no new `InstanceConfig` kind literal exists.

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen the shared deck instance and input snapshot** - `eb0d948` (feat)
2. **Task 2: Make the band mode-aware and the snapshot/reconstruction paths negotiation-free** - `82b91a9` (feat)
3. **Task 3: Prove absence, reconstruction and back-compatibility** - `049be26` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/types.ts` - `pitch-deck` member: negotiation fields optional, new `modeInputs?: DeckModeInputs` field, updated doc comment naming all five modes
- `lib/report/snapshot.ts` - `PitchInputSnapshot.deckModeInputs?`, `asDeckModeInputs` defensive narrowing, `PITCH_INPUT_KEYS` unchanged
- `lib/pitch/fair-value-band.ts` - `resolveDeckFairValueBand(typeSlug, meta?)` returns `null` for non-negotiating modes
- `lib/engine/session.ts` - mode-aware band injection + field stripping in `authoredInWizard`; `pitchSnapshotFromInstance` (exported) negotiation-free and carries `deckModeInputs`
- `lib/engine/evaluation-runner.ts` - `instanceFromPitchSnapshot` (exported, injectable `manifestLoader`) reconstructs without an ask, carries `modeInputs`
- `app/api/interaction/chat/route.ts` - one call site updated to the new `resolveDeckFairValueBand` signature (deviation, see below)
- `scripts/verify-deck-family-plumbing.ts` - new seven-section fixture-only verify script

## Decisions Made
- Exported two previously-private functions (`pitchSnapshotFromInstance`, `instanceFromPitchSnapshot`) purely so the verify script could exercise them with fixtures instead of a live Prisma/S3 round trip. `instanceFromPitchSnapshot` also gained an injectable `manifestLoader` parameter defaulting to the real `loadDeckManifest`, so the real evaluation path is byte-for-byte unchanged while the proof needs no network access.
- The non-negotiating strip in `session.ts` uses destructuring rest (`const { fairValueBand: _band, askPriceUsd: _ask, askEquityPct: _equity, ...rest } = wizardInstance`) to delete the keys rather than assigning `null`/`undefined` — matching the plan's "absence, not zero" instruction at the instance level, not just the snapshot level.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the one other call site of `resolveDeckFairValueBand`**
- **Found during:** Task 2
- **Issue:** Changing `resolveDeckFairValueBand`'s signature from `(meta?)` to `(typeSlug, meta?)` is explicitly required by the plan, but `app/api/interaction/chat/route.ts` (not in this plan's `files_modified`, and not owned by any other 19-xx plan per a cross-check of all phase-19 plan frontmatter) calls the old signature at its per-turn slide-hydration site. Left unfixed, `npx tsc --noEmit` would fail.
- **Fix:** Updated the one call site to pass `sessionConfig.typeSlug` (already in scope there) and to omit `fairValueBand` from the instance update entirely when the resolver returns `null`, mirroring the same "absence, not zero" posture used elsewhere in this plan.
- **Files modified:** `app/api/interaction/chat/route.ts`
- **Verification:** `npx tsc --noEmit` clean; `verify-deck-visible-context.ts`, `verify-slide-gating.ts` (which exercise this route's deck turn-assembly path) both still ALL PASS.
- **Committed in:** `82b91a9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary and minimal — a one-line signature follow-through with no behavior change for the investor mode. No scope creep.

## Issues Encountered
- `npx tsc --noEmit` shows one pre-existing failure in `scripts/verify-disengagement-termination.ts` (`DECK_DISENGAGEMENT_THRESHOLD` not yet exported from `lib/pitch/deck-type.ts`) throughout this plan's execution — this is plan 19-03's in-flight work on `deck-type.ts`, running concurrently, not caused by this plan. Confirmed by re-running `npx tsc --noEmit | grep -v verify-disengagement-termination.ts` after every edit: zero errors attributable to this plan's files. Not touched, per the parallel-executor file-ownership constraint.
- `npx tsx scripts/verify-pitch-types.ts` reports one pre-existing failure (`assistantTurnCount:2 + lost_interest ACCEPTED`), the same elevator/walk-out regression flagged in `18-PITCH-TYPES-REGRESSION.md` and confirmed in `19-01-SUMMARY.md` as plan 19-03's explicit scope, not this plan's.
- During commit of Task 3, a concurrent executor's own staged changes (`.planning/phases/19-deck-led-pitch-family/19-03-SUMMARY.md` and a small `.planning/STATE.md` update) were swept into this plan's Task 3 commit (`049be26`) because both executors share one working tree and git index. The content itself is correct and belongs to plan 19-03's own work — nothing was lost or corrupted, only the commit boundary is blended. No action taken beyond noting it here, per the instruction not to run destructive git operations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `lib/engine/types.ts`, `lib/report/snapshot.ts`, `lib/pitch/fair-value-band.ts`, `lib/engine/session.ts` and `lib/engine/evaluation-runner.ts` are ready for 19-04/19-05 (the four new TYPE records, which can now declare `modeInputs` members and rely on absent negotiation fields), 19-06/19-07 (wizard steps writing `modeInputs` onto the instance), and 19-09 (report panels reading `deckModeInputs` off the snapshot).
- No blockers introduced by this plan. The two pre-existing failures noted above remain tracked against plan 19-03, unchanged by this plan's work.

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-08*
