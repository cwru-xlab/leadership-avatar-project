---
phase: 19-deck-led-pitch-family
status: partial
verdict_basis: "agent-verified (Playwright, real HeyGen/OpenAI), not human — user decision 2026-10-25"
open_rows: [P19-SC3 (elevator walk-out half, F18-1), P19-SC4 / locked decision 8 (D19-1 session-length envelope), P19-SC6 (Pass 2 has 4 minor keyboard FAILs + F18-1)]
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

## Automated script battery — re-run 2026-10-25 (19-11 Task 1, agent)

Run locally on HEAD `bea7c5a` (branch `feat/study-plan-expansion`) against the
local dev DB only. Logs: `/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/uat-keys-decks/battery/`.

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
| `npx tsx scripts/verify-pitch-types.ts` | 0 | PASS — the inherited Phase 18 failure recorded on 2026-10-08 is gone (18-05 settled the §6 assertion) |
| `npx tsx scripts/verify-pitch-session-state.ts` | 0 | PASS |
| `npx tsx scripts/verify-pitch-report-panels.ts` | 0 | PASS |
| `npx tsx scripts/verify-report-chrome-coverage.ts` | 0 | PASS |
| `npx tsx scripts/verify-deck-visible-context.ts` | 0 | PASS |
| `npx tsx scripts/verify-slide-gating.ts` | 0 | PASS |
| `npx tsx scripts/verify-turn-control.ts` | 0 | PASS — the four 2026-10-08 fixture failures (`19-TURN-CONTROL-RED-SCRIPT.md`) no longer reproduce |
| `npx tsx scripts/verify-report-structure.ts` | 0 | PASS — the pre-existing `difficult-conversation: requires an instance` debt no longer reproduces |
| `npx tsc --noEmit --pretty false` | 0 | PASS |
| `npm run build` | 0 | PASS — only the known Prisma `package.json#prisma` deprecation warning |

**Battery summary (2026-10-25):** 19 of 19 clean.

## Agent-verified UAT run (2026-10-25) — replaces the human UAT by user decision

**Verdict basis: agent-verified (Playwright, real HeyGen/OpenAI), not human.**
Headless Chromium with a fake camera and a WAV as the microphone, driven by
keyboard on `http://localhost:3000`, signed in as `alice.johnson@case.edu`.
Deck: a six-slide PDF pitch ("ShelfSense", food waste in campus dining) built in
the scratchpad. Turns were typed except one tap-to-send voice turn (funding run 1).
Because the fake camera shows no face, every Visual score is 1 — a harness
artifact, not a product finding. Evidence:
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/shots/uat-keys-decks/`
(`deck-pitch-*`, `report-*`, `elevator-walkout`, `p2-*`).

### Sessions and report IDs

| Mode | Report id | Notes |
|---|---|---|
| `pitch-funding` (run 1) | `7dd6defb-8f7f-4823-a06e-b0107de53596` | 3 of 6 slides; tap-to-send voice turn; reviewer declined ($0); deck dimensions left null by the evaluator |
| `pitch-funding` (run 2) | `0a70e829-271a-4845-88d1-e490286eb39e` | 6 of 6 slides; reviewer would fund $20k of $60k ("partial") |
| `pitch-product` | `4f47f8ba-2d29-4a43-8829-94cb2056c8c4` | buyer "Needs more"; blocking objection recorded |
| `pitch-talk` | `09c2ebb3-3319-4241-ac3d-4b03e15c4b4a` | takeaway judged as matching the declared one |
| `pitch-general` | `123388f9-faa3-4255-b0a3-f4dceb075b5f` | deliberately tedious (8 one-line turns); student picked 25 min |
| `pitch-deck` (investor) | `fd8505a6-80c2-4d55-988b-d961c3688446` | avatar picked: Richard Boyatsis; "No deal reached" |
| `pitch-elevator` | `5a7b1394-f068-484f-a673-b033dfc4d821` (stays IN_PROGRESS) | stalled into the walk-out dead end (F18-1) |

### Block verdicts

| Block | Verdict | Observed |
|---|---|---|
| A — Picker | PASS | Exactly two top cards ("Elevator pitch", "With a deck"). Expanded, each of the five cards shows listener ("An investor", "A budget or grant reviewer", "A prospective customer", "A conference audience", "An attentive listener"), a "Scored:" line, a time envelope (20–30 / 15–25 / 10–20 / 10–20 / 10–20 min) and a negotiation line; only the investor card says "Ends in terms", the others say "No terms negotiated". Judged: the right mode can be picked from the cards alone. |
| B — Four real sessions | **FAIL (major D19-1)** on the envelope sub-check; every other sub-check PASS | Each wizard asks only its own steps (funding: Your request; product: Your buyer; talk: Your audience; general: none). No ask or equity field anywhere in the four modes (the funding card copy says "no equity, no terms"; there is no field). The mode step blocks advance (product disables Continue; funding and talk refuse with alerts). One camera step per wizard. Listeners stayed in role: the reviewer pressed six times for a hardware line-item breakdown; the buyer raised failed-rollout, support and fit objections; the talk audience asked questions; the general listener stayed neutral and supportive. Nobody offered to negotiate terms. **But the session-length step shows the investor's 20–30 min range in every mode** (D19-1): proposed 20 min sits inside each envelope, yet a student can pick 21–30 min. In `pitch-general` the agent picked 25 min with ArrowRight; the server silently stored `timeBudgetSeconds = 1200` (20 min). |
| C — Four reports | PASS (calibration notes) | Scores match the cards: funding run 2 `use_of_funds_credibility 2`, `ask_feasibility 2` + the four deck dimensions; product `objection_handling 4` + four deck dimensions; talk `audience_takeaway_clarity 5`, `holding_the_room 5` + four deck dimensions; general the four deck dimensions only. Verdict panels: funding "You requested $60k / The reviewer would fund $20k (partial)" with rationale; product position "Needs more" + blocking objection; talk "You declared / The audience left with" + match sentence; general has no outcome panel. Each panel says "This isn't part of your score". The low funding scores in run 1 track a real gap (the student never itemised hardware after six requests), not reviewer toughness. Calibration notes: the talk "matches" call is lenient (the declared "about 20% within one semester" claim is missing from what the audience heard); in funding run 1 the evaluator left all four deck dimensions null after 3 of 6 slides. |
| D — Walk-out is off | **PASS for decks / FAIL for the elevator half (F18-1)** | `pitch-general` with 8 tedious turns ("Yeah.", "It's good. Like I said."): the listener stayed and kept asking, and the session ended only when the agent pressed End. No deck session ended on the student. Elevator: the lock engages, but no farewell plays and the session never finishes — F18-1, already recorded in `18-VALIDATION.md` and being fixed separately. Not re-tested here, per the coordinator. |
| E — Investor regression | PASS | Ask step unchanged ("Investment amount", "Equity offered", same alerts when empty). `negotiation` scored (2). Ask · Settled · Fair range panel present ("No deal reached", fair range shown afterwards). Slide reveal timeline present (6 of 6). The investor did not walk out. Only deliberate change: the avatar step. |
| E2 — Investor avatar selection | PASS (catalog-error path NOT RUN) | Steps: Upload your deck → Your ask → Session length → **Avatar & voice** → Camera; the first three are unchanged in order and labels. The same 54-card catalog the other modes and `/practice/general` show; Scott Cowen preselected. The agent chose Richard Boyatsis; the session's `/api/avatar/get-access-token` carried `avatar_id c0fdc362-…` and `voice_id a2677eec-…`, which are his catalog entry (not the first entry). The picture-in-picture face matches his preview image. Chrome labels him "Investor" ("Interview with Investor"); his catalog name never appears in the session or report. The same check passed for funding, product, talk and general. Elevator: steps are "What you're pitching → Listener knowledge → Camera" with no picker; the avatar is auto-assigned. The empty or failed catalog error card could not be forced without changing the environment; it exists in code (`InterviewerStep.tsx`, error card with "Try again"). |
| F — Pass 2 keyboard UAT | **FAIL (minor ×4 + F18-1)** | See `19-KEYBOARD-PASS-2.md`: 9 PASS, 4 minor FAILs (items 4, 6, 11, 12), and items 13–14 FAIL on F18-1. |
| G — Record-keeping | PASS | This file lists SC1–SC6, REQ-87..94 and 13 locked decisions. `18-VALIDATION.md`'s SC verdicts were not touched by 19-11. They are no longer PENDING because the concurrent agent-verified 18-05 run recorded its own verdicts there. |

## Success criteria

| # | Criterion | Automated coverage | Verdict — agent-verified (Playwright, real HeyGen/OpenAI), not human |
|---|---|---|---|
| P19-SC1 | The picker presents all five deck modes with each mode's purpose (listener, scored line, time, negotiates-or-not) distinguishable before commitment. | `verify-pitch-picker-cards.ts` ALL PASS | **PASS** — block A. |
| P19-SC2 | Negotiation inputs (ask price, equity, fair-value band) are ABSENT — not disabled, not zeroed — from the four non-negotiating modes. | `verify-deck-family-plumbing.ts` ALL PASS | **PASS** — no field in any of the four wizards; report snapshots carry `askPriceUsd`, `askEquityPct` and `fairValueBand` as null (read-only DB check on four reports). |
| P19-SC3 | No deck mode walks out — including the investor deck — while the elevator's walk-out is untouched; each mode's outcome is a descriptive, unscored verdict through the extras slot (general has none). | `verify-disengagement-termination.ts`, `verify-deck-verdict-panels.ts` ALL PASS | **PARTIAL** — the deck half PASSES (blocks C and D). The elevator walk-out does not complete (F18-1, Phase 18 blocker, fix in progress elsewhere). The elevator config is untouched by Phase 19, so this is not a Phase 19 regression, but the criterion's "elevator walk-out still works" cannot be signed off. |
| P19-SC4 | A student reaches every deck mode through the ONE generic pre-session wizard, with mode-appropriate required steps and the one existing camera-consent gate reached exactly once. | `verify-deck-wizard-generic.ts` ALL PASS | **PASS with major defect D19-1** — one wizard, mode-appropriate steps, one camera step in all five. Its shared session-length step shows the investor envelope for every mode (see the locked-decision 8 row). |
| P19-SC5 | Adding the four modes touched no engine module, route, evaluator, or report page — the guard actually bites. | `verify-deck-family-surface-count.ts` ALL PASS (re-run 2026-10-25) | **PASS** — script-level. The four modes render on the one `/practice/[type]` wizard and the one `/practice/[type]/report/[reportId]` page, with verdicts through the extras slot. |
| P19-SC6 | Pass 2 keyboard UAT covers the surfaces Phase 18 AND Phase 19 add, recorded in both validation files. | None possible | **COMPLETED, result FAIL (minor)** — Pass 2 was run on every item and recorded in `19-KEYBOARD-PASS-2.md` and `18-VALIDATION.md`. 4 minor keyboard defects (K-1, K-3, K-4) plus F18-1 on the elevator items. |

## Requirement checklist

| Requirement | Verdict — agent-verified, not human |
|---|---|
| REQ-87 — Four new deck-led TYPE records playable alongside `pitch-deck` | **PASS** — six READY reports across the four modes plus the investor deck (IDs above) |
| REQ-88 — All five deck types share one deck capability | **PASS** — the same upload step, deck viewer, slide reveal timeline and deck dimensions in all five; investor regression block E PASS |
| REQ-89 — Negotiation inputs ABSENT from non-negotiating modes | **PASS** — SC2 |
| REQ-90 — Each mode declares its own rubric dimensions and outcome shape | **PASS** — block C (scores read from the report rows) |
| REQ-91 — One generic pre-session wizard, mode-appropriate steps, one camera gate | **PASS with D19-1 (major)** — the shared length step ignores per-mode envelopes |
| REQ-92 — One report page, extras slot, no per-mode report page | **PASS** — all reports at `/practice/<slug>/report/<id>`; verdicts in the extras slot; general renders none |
| REQ-93 — Adding four modes touches no engine module, route, evaluator, report page | **PASS** — script-level, SC5 |
| REQ-94 — Picker presents deck modes with purpose distinguishable before commitment | **PASS** — SC1; keyboard items 1–3 PASS |

## Locked-decision checklist (every decision in `19-CONTEXT.md`)

| # | Locked decision | Automated coverage | Verdict — agent-verified, not human |
|---|---|---|---|
| 1 | Two top-level picker cards; five deck modes are a sub-choice. | `verify-pitch-picker-cards.ts` | **PASS** |
| 2 | "With a deck" expands IN PLACE; no new route; Back as today. | `verify-pitch-picker-cards.ts` | **PASS** — URL stays `/practice/pitches`; `aria-expanded` disclosure |
| 3 | Each card carries all four facts. | `verify-pitch-picker-cards.ts` | **PASS** |
| 4 | General is a neutral practice run with no audience input. | `verify-deck-family-types.ts` | **PASS** — general wizard: Upload → Session length → Avatar → Camera; listener neutral |
| 5 | Required mode inputs per mode (funding amount + use of funds; product buyer profile; talk audience + takeaway; general none; investor unchanged). | plumbing + wizard-generic | **PASS** — all observed; snapshot `deckModeInputs` carries exactly these fields |
| 6 | Equity ABSENT as a concept for funding. | plumbing + grep | **PASS** |
| 7 | Fixed role and pushback; no difficulty control on any deck mode. | `verify-deck-family-types.ts` | **PASS** — no difficulty step or control in any deck wizard or session |
| 8 | Per-mode session-length envelopes (talk/product shorter; investor 20–30). | `verify-deck-mode-table.ts` (the table only) | **FAIL — D19-1 (major).** The table and the server clamp are per-mode, but `components/practice/steps/SessionLengthStep.tsx` imports `DECK_ENVELOPE_SECONDS` (the investor's 20–30 min) for its slider in every mode. The slider reads "20–30 min" under a card that says "10–20 min"; product, talk and general can never pick less than 20 min; a pick above the mode ceiling is silently clamped by the server (general: picked 25, stored 1200 s). |
| 9 | Four shared deck dimensions on all five modes; `negotiation` investor-only. | types + mode-table | **PASS** — scored on funding run 2, product, talk, general, investor; `negotiation` only on the investor report |
| 10 | Descriptive, unscored verdicts through the extras slot; general has none. | verdict-panels + chrome-coverage | **PASS** (keyboard note K-1: panel titles are not headings) |
| 11 | Walk-out OFF for all five deck modes; elevator untouched and its walk-out intact. | disengagement-termination + surface-count §7 | **PARTIAL** — OFF for decks PASS (block D); "elevator walk-out intact" fails on the Phase 18 blocker F18-1 (not caused by Phase 19) |
| 12 | 2026-10-08 amendment — investor gains the shared avatar picker; all five select an avatar the same way; ask/equity and rubric otherwise unchanged. | `verify-deck-wizard-generic.ts` | **PASS** — block E2 |
| 13 | Deferred ideas ABSENT: deck difficulty control, free-text audience field on general, difficult-conversation walk-outs. | grep | **2 of 3 PASS; 1 superseded.** No deck difficulty control; no general audience field. Difficult-conversation walk-outs are no longer absent: Phase 20 (commit `1326b2a`, 20-05) landed them on this branch. That is a later phase's decision, not a Phase 19 leak, but see defect D15-1 in `17-KEYBOARD-PASS-1.md`: the Phase 20 code now relabels student-ended conversations as avatar walk-outs. |

## Defects found in 19-11

| # | Severity | Defect | Repro | Implicated |
|---|---|---|---|---|
| D19-1 | major | The session-length step uses the investor's 20–30 min envelope in every deck mode; out-of-envelope picks are silently clamped. | `/practice/pitch-general` → upload → length step reads "20–30 min" under a "10–20 min" card; ArrowRight ×5 → 25 min → start → report row `timeBudgetSeconds 1200`, "Scheduled 20:00". | `components/practice/steps/SessionLengthStep.tsx` (`DECK_ENVELOPE_SECONDS` import; needs the mode's `envelopeSeconds`) |
| K-1…K-7 | minor | Keyboard and a11y defects | see `19-KEYBOARD-PASS-2.md` §5 | as listed there |
| U3 (known) | minor | Interview chrome in deck sessions: "LIVE INTERVIEW", "Interview with Reviewer", "PRACTICE FLOW … behavioral stories", "0 of ~9 questions", "Your resume is used only to personalize this practice interview", "Leave/End interview". | Any deck session. | Already logged in `18-VALIDATION.md` as U3; shared shell copy |

## Run posture

The agent ran locally against `http://localhost:3000` and the local dev DB, with
read-only DB queries to confirm report rows. No shared database, Lightsail,
Preview, Production or deployed app. No product code changed.

## Calibration

No tuning was applied: per the user's instruction, the agent records and does not
change product code. Observations for the human to accept or change:

- Per-mode envelopes: the values in the table look right; the UI does not use them (D19-1).
- Pushback: the funding reviewer repeated the same hardware-breakdown question six times running. That is in character but repetitive. The product buyer's objection set felt realistic.
- Talk takeaway matching is lenient (block C).
- Card wording: clear. All five deck Start buttons are named "Start" (K-2).
- Rubric anchors: no change suggested.

## Final verdict — agent-verified (Playwright, real HeyGen/OpenAI), not human

**PARTIAL (2026-10-25).** SC1, SC2 and SC5 PASS. SC4 PASSES with major defect
D19-1. SC3 is PARTIAL: the deck half passes, but the elevator half is blocked by
the Phase 18 blocker F18-1. SC6 is complete, with a FAIL result: 4 minor keyboard
defects plus F18-1. REQ-87..94 all pass at the requirement level; REQ-91 carries
D19-1. Locked decision 8 FAILS (D19-1) and decision 11 is PARTIAL (F18-1). Do not
mark Phase 19 complete until D19-1 is fixed or accepted and F18-1's fix is
verified on the elevator.


## Fixes applied after the agent-verified UAT (2026-10-25)

User-approved fixes are in `57b221f` (walk-out branch) and `7d54505`
(polish branch), merged in `a42eca1` and `58d8699`. Guards are in
`scripts/verify-uat-polish.ts` (32 checks with bite-proofs) and
`verify-disengagement-walkout-shell.ts` §10–12.
- D19-1 (major): each deck mode's length step uses its own envelope, the same range the server clamps to. This closes locked decision #8.
- F18-1 (elevator walk-out): fixed and re-tested live (see 18-VALIDATION, re-test section). This closes SC3's elevator half and locked decision #11.
- K-1 to K-7: headings, mode-named Start buttons, disabled-until-valid Continue, timer focus retained, mode listener wording, and drop-zone focus ring.

**Updated verdict: PASS — agent-verified (Playwright, real HeyGen/OpenAI), not human.**
