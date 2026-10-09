---
phase: 19-deck-led-pitch-family
status: awaiting-human-uat
requirements:
  - REQ-87
  - REQ-88
  - REQ-89
  - REQ-90
  - REQ-91
  - REQ-92
  - REQ-93
  - REQ-94
---

# Phase 19 Validation — Deck-Led Pitch Family

## Automated script battery

Run locally on 2026-10-08. All commands used source fixtures / local TypeScript
compilation / local Next.js build only. No agent connected to a shared database,
Lightsail, Preview, Production, Vercel, or a deployed application — following
`18-VALIDATION.md`'s stated posture verbatim.

| Command | Exit | Result |
|---|---:|---|
| `npx tsx scripts/verify-deck-mode-table.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-family-plumbing.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-family-types.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-wizard-generic.ts` | 0 | PASS |
| `npx tsx scripts/verify-pitch-picker-cards.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-verdict-panels.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-family-surface-count.ts` | 0 | PASS |
| `npx tsx scripts/verify-disengagement-termination.ts` | 0 | PASS |
| `npx tsx scripts/verify-pitch-surface-count.ts` | 0 | PASS |
| `npx tsx scripts/verify-pitch-types.ts` | 1 | **1 FAILURE — INHERITED, not a Phase 19 defect.** `assistantTurnCount:2 + lost_interest ACCEPTED` on `pitch-elevator` (section 6, "Avatar-end floor"). Documented in `18-PITCH-TYPES-REGRESSION.md` as Phase 18's own stale assertion against the elevator's now-correct fail-closed threshold gate. `lib/pitch/elevator-type.ts` is read-only for all of Phase 19. This suite cannot go fully green until Phase 18's `18-05` runs and either inverts or explains this assertion. The two deck-owned assertions this script also tracked are confirmed GREEN (dropped from 3 failures to 1, as `18-PITCH-TYPES-REGRESSION.md` predicted). |
| `npx tsx scripts/verify-pitch-session-state.ts` | 0 | PASS |
| `npx tsx scripts/verify-pitch-report-panels.ts` | 0 | PASS |
| `npx tsx scripts/verify-report-chrome-coverage.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-visible-context.ts` | 0 | PASS |
| `npx tsx scripts/verify-slide-gating.ts` | 0 | PASS |
| `npx tsx scripts/verify-turn-control.ts` | 1 | **4 FAILURES — Phase 19 tooling debt, OPEN, newly discovered by this plan.** `resolve pitch-funding` / `resolve pitch-product` / `resolve pitch-talk` / `resolve pitch-general` all fail: the script's `syntheticInit()` resolve-loop fixture switch (section 10) was never extended for the four new slugs, the same generic-resolve-loop-missing-a-fixture shape as `19-UNOWNED-RED-SCRIPT.md`'s `verify-report-structure.ts` finding — in a third script. Found at 19-11 with no later Phase-19 plan available to absorb the fix; not fixed in this plan per its "do not change product behavior" constraint and the deviation-rule scope boundary (not caused by this plan's own task changes). See `19-TURN-CONTROL-RED-SCRIPT.md` for full detail, root-cause confirmation (script last touched at Phase 13 commit `734ef1f`, before these slugs existed), and the fix shape for whoever picks it up. |
| `npx tsc --noEmit --pretty false` | 0 | PASS — clean, zero errors |
| `npm run build` | 0 | PASS — all routes compile/prerender; only a pre-existing, unrelated Prisma config deprecation warning printed |

**Battery summary:** 16 of 18 commands are clean PASS. The two non-clean rows are
both disclosed, neither is silently omitted, and neither is a Phase 19 product
defect: one is Phase 18's own inherited debt against a read-only file, the other
is Phase 19's own newly-discovered tooling debt in a test script (not product
code) with no later plan left in this phase to own the fix.

## Success criteria — human evidence required

| # | Criterion | Automated coverage | Human verdict / verbatim notes |
|---|---|---|---|
| P19-SC1 | The picker presents all five deck modes with each mode's purpose (listener, scored line, time, negotiates-or-not) distinguishable before commitment. | `verify-pitch-picker-cards.ts` ALL PASS — all four facts sourced from `listDeckModes()`, accessible disclosure pattern confirmed. | **PENDING** |
| P19-SC2 | Negotiation inputs (ask price, equity, fair-value band) are ABSENT — not disabled, not zeroed — from the four non-negotiating modes. | `verify-deck-family-plumbing.ts` ALL PASS — absence-not-zero proven at both instance and snapshot level; zero grep matches for ask/equity fields in the four new type files. | **PENDING** |
| P19-SC3 | No deck mode walks out — including the investor deck — while the elevator's walk-out is untouched; each mode's outcome is a descriptive, unscored verdict through the extras slot (general has none). | `verify-disengagement-termination.ts` + `verify-deck-family-surface-count.ts` §7 ALL PASS — all five deck modes `disengagementThreshold == null` / `avatarMayEnd === false`; `verify-deck-verdict-panels.ts` ALL PASS for the four-mode outcome shapes. | **PENDING** |
| P19-SC4 | A student reaches every deck mode through the ONE generic pre-session wizard, with mode-appropriate required steps and the one existing camera-consent gate reached exactly once. | `verify-deck-wizard-generic.ts` ALL PASS — one `SetupWizard`, one `CameraConsentStep`, a render case for every declared step id. | **PENDING** |
| P19-SC5 | Adding the four modes touched no engine module, route, evaluator, or report page — the mechanical surface-count guard actually bites. | `verify-deck-family-surface-count.ts` ALL PASS (7 sections); the documented negative test (planted `typeSlug === "pitch-funding"` in `session.ts`) was independently re-run during `19-VERIFICATION.md`'s check and confirmed to fail correctly, then pass clean after revert. | **PENDING** (independently re-verified at the script level; human judgment of "touches no X" as a product claim still required) |
| P19-SC6 | Pass 2 keyboard UAT covers the surfaces Phase 18 AND Phase 19 add, recorded in both validation files. | No automated coverage possible — keyboard operability is inherently a human-only signal, carried forward from Phase 17 (`17-KEYBOARD-PASS-1.md`) as P19-SC6's explicit obligation. | **PENDING** — see `19-KEYBOARD-PASS-2.md` |

## Requirement checklist — human evidence required

| Requirement | Human verdict / notes |
|---|---|
| REQ-87 — Four new deck-led TYPE records playable alongside `pitch-deck` | **PENDING** |
| REQ-88 — All five deck types share one deck capability | **PENDING** |
| REQ-89 — Negotiation inputs ABSENT from non-negotiating modes | **PENDING** |
| REQ-90 — Each mode declares its own rubric dimensions and outcome shape | **PENDING** |
| REQ-91 — One generic pre-session wizard, mode-appropriate steps, one camera gate | **PENDING** |
| REQ-92 — One report page, extras slot, no per-mode report page | **PENDING** |
| REQ-93 — Adding four modes touches no engine module, route, evaluator, report page | **PENDING** |
| REQ-94 — Picker presents deck modes with purpose distinguishable before commitment | **PENDING** |

## Locked-decision checklist (every decision in `19-CONTEXT.md`)

| # | Locked decision | Automated coverage | Human verdict |
|---|---|---|---|
| 1 | Two top-level picker cards (Elevator pitch / With a deck); the five deck modes are a sub-choice, not six flat siblings. | `verify-pitch-picker-cards.ts` confirms exactly two top cards and the sub-choice shape. | **PENDING** |
| 2 | "With a deck" expands IN PLACE on `app/practice/pitches/page.tsx` — no new route, no second screen; Back behaves as today. | `verify-pitch-picker-cards.ts` confirms no new route added for the expansion. | **PENDING** |
| 3 | Each deck-mode card carries all four facts: who you're pitching to, what gets scored, time envelope, whether it negotiates. | `verify-pitch-picker-cards.ts` confirms all four facts sourced from `listDeckModes()` for every card. | **PENDING** |
| 4 | The general deck pitch is framed as a neutral practice run — no audience input at all, not a "bring your own context" flexible mode. | `verify-deck-family-types.ts` confirms `pitch-general` has no distinctive dimension and no mode-specific input field. | **PENDING** |
| 5 | Required mode-specific inputs per mode: funding = amount + use of funds (equity ABSENT as a concept); product = buyer profile; talk = audience + takeaway; general = none; investor = unchanged ask/equity step. | `verify-deck-family-plumbing.ts` + `verify-deck-wizard-generic.ts` confirm field presence/absence and the `canAdvance` gate per step. | **PENDING** |
| 6 | Equity is ABSENT as a concept for the funding mode (a grant/budget request gives up no ownership) — not zeroed. | `verify-deck-family-plumbing.ts` + direct grep of `lib/pitch/funding-type.ts` for `equity` (zero matches). | **PENDING** |
| 7 | Fixed role and fixed, mode-appropriate pushback per mode — no student-adjustable difficulty control on any deck mode. | `verify-deck-family-types.ts` confirms no `difficulty` field on any of the four new type records. | **PENDING** |
| 8 | Per-mode session-length envelopes (talk/product shorter than an investor meeting; investor keeps 20–30 min). | `verify-deck-mode-table.ts` confirms each mode's `envelopeSeconds` range; `deck-type.ts` throws at module scope if the lookup is null. | **PENDING** |
| 9 | Four shared deck dimensions (`deck_structure`, `deck_text_density`, `deck_visual_quality`, `slide_speech_correlation`) on all five modes; `negotiation` stays investor-only. | `verify-deck-family-types.ts` + `verify-deck-mode-table.ts` confirm shared-dimension spread and investor-only negotiation dimension. | **PENDING** |
| 10 | Every new mode's outcome is a DESCRIPTIVE, UNSCORED verdict rendered through the existing `ReportChrome` extras slot; general has no outcome panel. | `verify-deck-verdict-panels.ts` + `verify-report-chrome-coverage.ts` confirm extras-slot rendering and `pitch-general`'s absent panel. | **PENDING** |
| 11 | Walk-out OFF for all five deck modes — including the investor deck — with `lib/pitch/elevator-type.ts` untouched and the elevator's own walk-out intact. | `verify-disengagement-termination.ts` + `verify-deck-family-surface-count.ts` §7 confirm all five deck modes `avatarMayEnd === false`; elevator's `0.5` threshold confirmed unchanged (file last touched at commit `524544e`, before any 19-0x commit). | **PENDING** |
| 12 | **The 2026-10-08 amendment** — the investor deck gains the shared `interviewer` avatar-picker step; all five deck modes select an avatar the same way; "investor deck unchanged" still governs only its ask/equity inputs and its rubric, NOT its avatar selection. | `verify-deck-wizard-generic.ts` confirms the investor deck's `setupSteps` now include the shared `interviewer` step (19-03's addition); automated coverage stops at wiring — whether the picked avatar actually appears as the session's face/voice, and whether "Your investor" naming still holds, is a judgment call reserved for **block E2** of Task 2's human sign-off. | **PENDING — see block E2 in `19-KEYBOARD-PASS-2.md`'s companion run sheet / Task 2's how-to-verify** |
| 13 | Three deferred ideas confirmed ABSENT from the codebase: deck difficulty control, a free-text audience field on the general mode, difficult-conversation walk-outs. | Direct grep: no `difficulty` field on any of the four new deck type records or `pitch-deck`; `pitch-general` has no audience/free-text field (confirmed by `verify-deck-family-types.ts`); `grep -rn "avatarMayEnd\|disengagementThreshold" lib/difficult-conversation/` shows no opt-in (Phase 20 is the home for that work, not yet landed as a walk-out). | **PENDING** |

## Run posture

All automated commands above ran locally against source fixtures, local TypeScript
compilation, and a local `next build`. No agent command connected to a shared
database, Lightsail, Preview, Production, or any deployed application, following
`18-VALIDATION.md`'s posture verbatim.

## Calibration

(To be filled by Task 3, from the human's Task 2 response. Per-mode envelopes,
pushback intensity, card wording, and rubric anchors are explicitly tunable; the
locked decisions in the table above are not.)

## Final human verdict

**PENDING — do not mark Phase 19 complete, flip any requirement checkbox beyond
what `19-VERIFICATION.md` already independently confirmed, or touch
`18-VALIDATION.md`'s five PENDING SC verdicts until human UAT evidence is
supplied.**
