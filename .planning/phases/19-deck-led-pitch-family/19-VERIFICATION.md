---
phase: 19-deck-led-pitch-family
verified: 2026-10-08T00:00:00Z
status: human_needed
score: 8/8 automatable must-haves verified; 1 non-autonomous closing plan (19-11) outstanding
human_verification:
  - test: "Play a real session in each of the four new deck modes (funding, product, talk, general) and judge the resulting report for honesty/legibility"
    expected: "Each report reads correctly for its mode (funding shows ask/fund/why; product shows buyer position + objection; talk shows takeaway comparison; general shows no outcome panel), and the session itself plays through start to finish"
    why_human: "This is exactly 19-11's scope (P19-SC1-SC6 sign-off) and it has not run — autonomous scripts can prove structure and wiring but not that a verdict 'reads honestly'"
  - test: "Pass 2 keyboard UAT across the surfaces Phase 18 and Phase 19 add (picker expansion, five-mode wizard, interviewer step, deck session chrome)"
    expected: "Every new surface is operable by keyboard alone, recorded in both 18-VALIDATION.md and 19-VALIDATION.md"
    why_human: "Keyboard operability is carried forward from Phase 17 as a human-only closing obligation (P19-SC6); 19-11 (autonomous: false) has not executed"
  - test: "Re-test the investor pitch-deck's newly added avatar-picker (interviewer) step as a Phase 14 surface"
    expected: "A recorded human verdict that the investor deck's avatar/voice selection behaves correctly now that it goes through InterviewerStep instead of auto-pick"
    why_human: "Explicitly called out in 19-11's must_haves as requiring its own recorded human verdict; not mechanically checkable"
---

# Phase 19: Deck-Led Pitch Family Verification Report

**Phase Goal:** Widen the deck pitch from investor-negotiation-only into a family of
deck-led modes — a funding request, a product pitch, a deck-led talk, and a general
deck pitch — each playable alongside the existing investor `pitch-deck`, sharing one
deck capability rather than duplicating it per mode.

**Verified:** 2026-10-08
**Status:** human_needed (all ten autonomous plans verified against the real codebase;
plan 19-11 — the human sign-off plus Pass 2 keyboard UAT — has not run and is outside
automatable scope)
**Re-verification:** No — initial verification

## Scope note

Plans 19-01 through 19-10 have SUMMARY.md on disk and were verified. Plan 19-11
(`autonomous: false`) has not executed. Nothing in this report fails the phase for
19-11's absence; the three items it would have produced are listed under Human
Verification Required rather than scored as gaps.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | All five deck modes (`pitch-deck`, `pitch-funding`, `pitch-product`, `pitch-talk`, `pitch-general`) exist, resolve, and are registered in `ENGINE_TYPES` | ✓ VERIFIED | Runtime import of `lib/engine/registry.ts` lists all five slugs; `verify-deck-family-types.ts` and `verify-pitch-types.ts` resolve all five |
| 2 | Negotiation inputs (ask price, offered equity, fair-value band) are ABSENT — not disabled, not zeroed — from the four non-negotiating modes | ✓ VERIFIED | `grep` for `askPriceUsd`/`askEquityPct`/`fairValueBand`/`equity` across the four new type files returns zero matches; `verify-deck-family-plumbing.ts` proves `resolveDeckFairValueBand` returns null and reconstruction has no own `askPriceUsd`/`fairValueBand` for non-negotiating modes |
| 3 | Each mode declares its own rubric dimensions and outcome shape; `pitch-general` has neither a distinctive dimension nor an outcome panel | ✓ VERIFIED | `verify-deck-family-types.ts`: "extraRubricDimensions equals exactly SHARED_DECK_DIMENSIONS (no distinctive dimension)" and "outcome.fields is empty" both pass for `pitch-general`; all four new modes pass the rubric/outcome parity assertions |
| 4 | A student reaches every deck mode through the ONE generic pre-session wizard, with mode-appropriate steps and the one existing camera-consent gate | ✓ VERIFIED | `verify-deck-wizard-generic.ts`: exactly one `SetupWizard`/`CameraConsentStep`, no second wizard route, `page.tsx` does not reference `CameraConsentStep` a second time, every declared step id has a render case |
| 5 | The investor deck no longer walks out; no deck mode opts into disengagement; Phase 18's mechanism and the elevator's 0.5 threshold are untouched | ✓ VERIFIED | `verify-disengagement-termination.ts` and `verify-deck-family-surface-count.ts` §7: all five deck modes have `disengagementThreshold == null` / `avatarMayEnd === false`; `lib/pitch/elevator-type.ts` last touched at commit `524544e` (Phase 18, before any 19-0x commit) |
| 6 | Every mode's verdict renders through the existing `ReportChrome` extras slot; no per-mode report page; the shared report page was not edited with per-mode branches | ✓ VERIFIED | `ReportChrome.tsx` resolves deck chrome via `isDeckModeSlug()` + mode-table lookup, not per-slug branches; `verify-deck-verdict-panels.ts` §10 confirms the shared report page carries no deck-mode slug literal and no `typeSlug ===` comparison |
| 7 | Adding the four modes touched no engine module, route, evaluator, or report page — REQ-93's mechanical guard actually bites | ✓ VERIFIED | `verify-deck-family-surface-count.ts` ALL PASS (7 sections); independently re-ran the documented negative test (planted `typeSlug === "pitch-funding"` in `lib/engine/session.ts`) — the guard correctly failed (exit 1, §4) and passed again clean after revert |
| 8 | The Practice Pitches picker presents all five modes with each mode's purpose (listener, scored line, time, negotiates-or-not) distinguishable before commitment | ✓ VERIFIED | `verify-pitch-picker-cards.ts` ALL PASS; `app/practice/pitches/page.tsx` sources all four facts from `listDeckModes()`, no per-mode literal, accessible `aria-expanded`/`aria-controls` disclosure |

**Score:** 8/8 automatable truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/pitch/deck-modes.ts` | DECK_MODES table, lookups | ✓ VERIFIED | 234 lines, exports confirmed, `verify-deck-mode-table.ts` ALL PASS |
| `lib/pitch/deck-rubric.ts` | SHARED_DECK_DIMENSIONS | ✓ VERIFIED | 46 lines, contains `slide_speech_correlation` |
| `lib/engine/types.ts` | widened `pitch-deck` instance w/ optional negotiation fields + `modeInputs` | ✓ VERIFIED | `modeInputs?: DeckModeInputs` present; single `kind: "pitch-deck"` discriminant confirmed |
| `lib/report/snapshot.ts` | back-compatible `deckModeInputs` narrowing | ✓ VERIFIED | `verify-deck-family-plumbing.ts` §4/§5 — pre-Phase-19 rows still narrow, malformed shapes degrade to null without throwing |
| `lib/pitch/fair-value-band.ts` | `resolveDeckFairValueBand` | ✓ VERIFIED | Returns null for non-negotiating modes, confirmed |
| `lib/pitch/deck-type.ts` | investor deck, walk-out off, shared rubric | ✓ VERIFIED | `avatarMayEnd: false`, spreads `SHARED_DECK_DIMENSIONS` |
| `lib/pitch/funding-type.ts` / `funding-prompts.ts` | pitch-funding | ✓ VERIFIED | `PITCH_FUNDING_TYPE` exported, registered, no equity/ask fields |
| `lib/pitch/product-type.ts` / `product-prompts.ts` | pitch-product | ✓ VERIFIED | `PITCH_PRODUCT_TYPE` exported, registered |
| `lib/pitch/talk-type.ts` / `talk-prompts.ts` | pitch-talk | ✓ VERIFIED | `PITCH_TALK_TYPE` exported, registered |
| `lib/pitch/general-deck-type.ts` / `general-deck-prompts.ts` | pitch-general | ✓ VERIFIED | `PITCH_GENERAL_TYPE` (not `PITCH_GENERAL_DECK_TYPE`) exported, registered; confirmed at runtime via import, not just grep |
| `components/practice/steps/FundingAskStep.tsx` | amount + use-of-funds, required to advance | ✓ VERIFIED | 227 lines; `canAdvance` gate blocks `nav.goNext()` until both fields valid; no equity/valuation field present |
| `components/practice/steps/BuyerProfileStep.tsx` | buyer profile, required | ✓ VERIFIED | 108 lines |
| `components/practice/steps/TalkAudienceStep.tsx` | audience + takeaway, required | ✓ VERIFIED | 203 lines |
| `app/practice/[type]/page.tsx` | mode-table-driven wizard | ✓ VERIFIED | Uses `getDeckMode`, no per-mode slug literal outside the `kind` discriminator |
| `app/practice/pitches/page.tsx` | two top cards + in-place five-mode expansion | ✓ VERIFIED | Uses `listDeckModes()`, accessible disclosure pattern |
| `components/practice/report/DeckVerdictPanel.tsx` | one verdict panel, four outcome shapes | ✓ VERIFIED | 388 lines (min_lines 120), handles malformed outcomes without throwing for all five modes |
| `components/practice/ReportChrome.tsx` | deck chrome via extras slot | ✓ VERIFIED | `isDeckModeSlug` dispatch, `DeckVerdictPanel` rendered in `below` slot |
| `scripts/verify-deck-family-surface-count.ts` | surface-count guard, min 200 lines | ✓ VERIFIED | 724 lines, 7 sections, ALL PASS, negative test independently re-confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `deck-modes.ts` | `deck-rubric.ts` | `SHARED_DECK_DIMENSIONS` import | ✓ WIRED | `verify-deck-mode-table.ts` passes |
| `session-length.ts` | `deck-modes.ts` | per-mode envelope | ✓ WIRED | `proposeDeckSeconds` lands inside each mode's envelope, all slide counts |
| `session.ts` | `fair-value-band.ts` | band injected only when negotiating | ✓ WIRED | `verify-deck-family-plumbing.ts` §1-3 |
| `evaluation-runner.ts` | `snapshot.ts` | `deckModeInputs` read | ✓ WIRED | confirmed in plumbing script |
| `registry.ts` | all four new type files | `ENGINE_TYPES` entries | ✓ WIRED | runtime import confirms all five slugs present |
| `deck-type.ts` | `deck-rubric.ts` | spread of shared dimensions | ✓ WIRED | confirmed via `verify-disengagement-termination.ts` and types check |
| `app/practice/[type]/page.tsx` | mode-input step components | render case keyed by step id | ✓ WIRED | `verify-deck-wizard-generic.ts` confirms a render case for every declared step id |
| `app/practice/pitches/page.tsx` | `app/practice/[type]/page.tsx` | `router.push` navigation | ✓ WIRED | `verify-pitch-picker-cards.ts` confirms ≥2 `router.push` calls |
| `ReportChrome.tsx` | `DeckVerdictPanel.tsx` | extras `below` renderer | ✓ WIRED | confirmed by direct read and `verify-deck-verdict-panels.ts` |
| `scripts/verify-deck-family-surface-count.ts` | `registry.ts` | registry iteration | ✓ WIRED | §1 passes for all 13 registered types |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| REQ-87 | 19-04, 19-05 | Four new deck-led TYPE records playable alongside `pitch-deck` | ✓ SATISFIED | Runtime `ENGINE_TYPES` import confirms all four slugs + investor deck present; export names confirmed (`PITCH_GENERAL_TYPE`, not the misleading `PITCH_GENERAL_DECK_TYPE` guessed by a naive grep) |
| REQ-88 | 19-01, 19-02 | All five deck types share one deck capability (upload, slide cursor, high-water mark, visible-context slice, soft timer) | ✓ SATISFIED | `verify-deck-family-surface-count.ts` §1-2: shared `DECK_VISIBLE_CONTEXT` object identity, one ratchet, one visible-context gate, exactly 3 deck API routes unchanged, `buildEvaluationImages` reused by function identity (not cloned) across all four new modes |
| REQ-89 | 19-02, 19-06 | Negotiation inputs ABSENT (not disabled/hidden) from non-negotiating modes | ✓ SATISFIED | Direct grep of the four new type files for `askPriceUsd`/`askEquityPct`/`fairValueBand`/`equity` returns zero matches; plumbing script proves absence, not falsy presence |
| REQ-90 | 19-01, 19-04, 19-05 | Each mode declares its own rubric dimensions and outcome shape | ✓ SATISFIED | `verify-deck-family-types.ts`: per-mode rubric/outcome parity confirmed for all five; `pitch-general` confirmed to have no distinctive dimension and no outcome panel |
| REQ-91 | 19-06, 19-07 | One generic pre-session wizard, mode-appropriate steps, no new consent gate | ✓ SATISFIED | `verify-deck-wizard-generic.ts`: exactly one `SetupWizard`, one `CameraConsentStep`, page.tsx does not reference it a second time |
| REQ-92 | 19-09 | One report page, extras slot, no per-mode report page | ✓ SATISFIED | Direct read of `ReportChrome.tsx` confirms `isDeckModeSlug`-driven dispatch, not per-slug branching; shared report page unedited (confirmed by `verify-deck-verdict-panels.ts` §10) |
| REQ-93 | 19-02, 19-10 | Adding four modes touches no engine module, route, evaluator, report page | ✓ SATISFIED (as disclosed) | The plans and plan-checker correctly disclose that `kind: "pitch-deck"` must be shared literally (REQ-93 cannot be met in its most literal form without breaking REQ-60's call sites). The guard instead proves the STRONGER checkable claim — no new mode's literal name or per-mode branch anywhere in engine/routes/report page, `registry.ts` as the one sanctioned, narrowly-checked exception. Independently re-ran the documented negative test (planted a `typeSlug === "pitch-funding"` branch in `session.ts`) — the guard correctly failed, then passed clean after revert. This is a meaningful proof, not a shaped-to-pass one. |
| REQ-94 | 19-01 (table), 19-08 (actual UI) | Picker presents deck modes with purpose distinguishable before commitment | ✓ SATISFIED, with a claim-hygiene note | `verify-pitch-picker-cards.ts` ALL PASS confirms the real implementation (19-08). However, REQUIREMENTS.md's table marked REQ-94 "Complete" at 19-01's commit (`feat/19-01`) — **before the picker UI existed at all** — while the REQ-94 prose checkbox at line 710 is still `[ ]` unchecked. The requirement is now genuinely satisfied by 19-08's work, but the table's "Complete" flip predates the actual implementation by seven plans. This is the same premature-green pattern flagged in `18-PITCH-TYPES-REGRESSION.md`'s "claim hygiene" note — worth fixing the bookkeeping (check the REQ-94 prose box; the table entry turned out to be accidentally correct, not earned at the time it was set) but it is not a functional gap today. |

**Note on REQ-93/REQ-94 scrutiny requested by the task:** both were specifically flagged as worth independent testing. REQ-93's guard was verified to be substantive via an independently-reproduced negative test (not merely trusted from the SUMMARY). REQ-94's underlying implementation is real and verified, but its requirements-table bookkeeping was set prematurely by 19-01 and never corrected, producing a lingering inconsistency between the table ("Complete") and the prose checkbox ("[ ]" unchecked) that should be cleaned up.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | None found | — | Scanned all phase-created/modified files (type records, prompts, wizard steps, wizard/picker pages, verdict panel, report chrome) for TODO/FIXME/placeholder/empty-handler patterns — zero matches. `tsc --noEmit` is clean. |

### Inherited / Cross-Phase Items (not Phase 19 defects)

- `scripts/verify-pitch-types.ts` has exactly 1 failure (`assistantTurnCount:2 + lost_interest ACCEPTED` on `pitch-elevator`). Confirmed to have dropped from the documented 3 failures to 1 — the two deck-owned assertions (owned by 19-03) are now green. The remaining failure is Phase 18's own, documented in `18-PITCH-TYPES-REGRESSION.md`, and correctly out of Phase 19's scope.
- `scripts/verify-report-structure.ts` was red (4 failures: `pitch-funding`/`pitch-product`/`pitch-talk`/`pitch-general` all "requires an instance") per `19-UNOWNED-RED-SCRIPT.md`. Independently re-ran it: **0 failures, "All checks passed."** 19-10 absorbed this as a disclosed Rule 3 deviation and fixed it correctly (instance fixtures added to the resolve-loop, no assertion weakened).
- Phase 20 is mid-flight concurrently and touches `lib/difficult-conversation/conversation-type.ts`, `lib/engine/disengagement.ts`, and `scripts/verify-disengagement*.ts` — none of those files were inspected or attributed to Phase 19 in this report.

### Human Verification Required

See frontmatter `human_verification`. In short: plan 19-11 (`autonomous: false`) — real sessions in all four new modes judged by a person, Pass 2 keyboard UAT across Phase 18+19 surfaces, and a human verdict on the investor deck's newly-added avatar-picker step — has not executed. Nothing automatable was found missing; these three items are inherently non-mechanical and were always scoped to 19-11.

### Gaps Summary

No functional gaps found in the ten autonomous plans. All eight requirements (REQ-87 through REQ-94) have genuine, independently-verified implementation evidence — not just passing self-authored scripts, but direct source inspection, a runtime registry import, a re-run negative test, and targeted greps for the specific absences the task asked to scrutinize. The one bookkeeping inconsistency (REQ-94's table "Complete" predating its actual implementation by seven plans, and still disagreeing with its own unchecked prose box) is noted for cleanup but does not block phase closure since the requirement is now genuinely met. The phase cannot be marked `passed` until plan 19-11 executes and its three human-only verdicts are recorded.

---

*Verified: 2026-10-08*
*Verifier: Claude (gsd-verifier)*
