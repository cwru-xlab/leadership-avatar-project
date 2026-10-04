---
phase: 15-difficult-conversations
verified: 2026-10-04T04:54:02Z
status: human_needed
score: 4/4 success criteria PASS-automated (0 FAIL); human keyboard UAT UNVERIFIED
re_verification: false
executive_verdict: met_with_residual_gaps
human_verification:
  - test: "Catalog three sections (15-07 / 15-11 block C half)"
    expected: "Featured → Your conversations → From other students; seeded not editable; provenance obvious"
    why_human: "skip_checkpoints left catalog UI walk UNVERIFIED; list route + page structure verified in code/scripts only"
  - test: "Fresh seeded session + session surface (15-08 A/C/D + 15-11 block B)"
    expected: "Playable seeded conversation; full briefing without hiddenPosition; End-session + support note always visible; no difficulty meter; walk-out is outcome not error"
    why_human: "SessionSafetyPanel + briefing type-block verified in code; live keyboard session not run"
  - test: "Author → practise private → publish (15-07 B/C + 15-11 block C)"
    expected: "Student authors six fields, practises immediately while private; publish gated; rejection names reason+fix and stays privately playable"
    why_human: "Routes/store/prepublish scripts PASS; UI authoring walk not run"
  - test: "Second account plays published; author remains owner (15-07 D + SC3)"
    expected: "Published appears under From other students for another user; non-owner edit/delete/get not-found; author retains ownership"
    why_human: "Cross-owner 404-not-403 automated; second-account keyboard session not run"
  - test: "Live report walk + SC4 narrative (15-09 Task 3)"
    expected: "Eight dimension cards; unscored outcome panel; avatar-end banner when applicable; in-role reaction with causal turns — judges handling not merely reaching the end"
    why_human: "Report structure + approach-vs-result harness automated; finished live report judgment needs a human"
  - test: "Drift reconfirm after full session (15-10 / 15-11 block D)"
    expected: "One sentence: avatar never drifted into coaching/narrator voice; hostile probe 5 (mentions grades/scores while deflecting) human sign-off"
    why_human: "Automated classifier 32/33 PASS + 1 DEFERRED; human sentence pending per 15-DRIFT.md"
  - test: "Calibration keep/change (15-11 block F)"
    expected: "Keep avatarEndFloor=4, three difficulty bands, seven seeded ids, support note — or record changes"
    why_human: "No tuning applied under skip_checkpoints"
  - test: "Phase 13 / pitch / networking regression keyboard (15-11 block E)"
    expected: "Interview / case-study / pitch / networking still run and report at keyboard"
    why_human: "Automated resolve/surface-count greps pass; fresh keyboard regression not run"
residual_risk:
  - "Human real-session UAT (catalog, author/publish, seeded play, report, drift sentence) UNVERIFIED under skip_checkpoints"
  - "Hostile drift probe 5 DEFERRED human sign-off (reply names grades/scores while deflecting) — 15-DRIFT.md"
  - "Pre-existing verify-report-structure.ts FAIL on difficult-conversation (requires instance) — tooling debt, not a Phase 15 product FAIL"
  - "Shared Lightsail DB / REQ-67 Part 1 still open for Phase 13 close — orthogonal to Phase 15 SC"
---

# Phase 15: Difficult Conversations Verification Report

**Phase Goal:** Ship role-specific difficult conversations in which the avatar fully assumes a stated role — confronting a low performer, firing someone, asking a manager for a raise, challenging a professor over a grade — with a seeded catalog plus student-authored scenarios that can be published to all users.

**Verified:** 2026-10-04T04:54:02Z  
**Status:** `human_needed` — automated must-haves pass; keyboard UAT still open (`skip_checkpoints`)  
**Executive verdict:** **Phase goal met on automated evidence, with residual human/operational gaps** (not product FAIL gaps)  
**Re-verification:** No — initial verification

## Executive Summary

Independent goal-backward check (code + nine `verify-dc-*` scripts + prior `15-DRIFT.md` / approach-vs-result evidence) confirms the four ROADMAP success criteria are implemented and mechanically guarded. Tile is live at `/conversations`. Seven seeded code records, owner-scoped S3 authoring with two-thing pre-publish gate, three-section discovery, anti-drift prompts + per-turn tail reminder, eight rubric dimensions with approach-not-result Objective achieved, and an unscored outcome + in-role reaction on the one report chrome are all present and wired.

`15-VALIDATION.md` honestly left human blocks B–G **UNVERIFIED** / **DEFERRED → /gsd/verify-work 15** under `skip_checkpoints`. This report does **not** upgrade those to PASS. No Success Criterion is FAIL. `/gsd/plan-fix` is **not** indicated from automated evidence; next step is `/gsd/verify-work 15` for keyboard sign-off.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Verdict | Evidence |
|---|-------|---------|----------|
| P15-SC1 | Seeded catalog playable; avatar holds role (no coaching/narrator drift) | **PASS-automated** / human **UNVERIFIED** | Seven seeded ids in `lib/difficult-conversation/seeded.ts`; `DIFFICULT_CONVERSATION_TYPE` registered; absolute anti-drift rules + `buildInCharacterReminder` tail fragment; `15-DRIFT.md` receptive/guarded 11/11 + hostile 10/11 PASS (1 DEFERRED probe 5); `verify-dc-seeded` + `verify-dc-type` + `verify-dc-prompt-safety` EXIT 0. Live human seeded session + final drift sentence **DEFERRED**. |
| P15-SC2 | Student can author scenario, practice immediately, private until deliberate publish | **PASS-automated** / human **UNVERIFIED** | Five authoring routes (`add`/`edit`/`delete`/`publish`/`list`) + `play`; `runPrePublishCheck` on publish-visible saves; store unpublished by default; `verify-dc-routes` + `verify-dc-store` + `verify-dc-prepublish` EXIT 0. Builder/catalog UI walk **DEFERRED**. |
| P15-SC3 | Published scenario playable by any user; author remains owner | **PASS-automated** / UI half **UNVERIFIED** | Published is discovery-only (`forPlay` works while unpublished for owner practice; published list for others); non-owner edit/delete/get → null/404-not-403; `ownerId` stamped server-side; three-section `/conversations` page (Featured → Mine → From other students). Second-account keyboard **DEFERRED**. |
| P15-SC4 | Report judges how conversation was handled (clarity, empathy, holding the line) — not merely reaching the end; approach vs result decoupling | **PASS-automated** (assembly/rubric/matrix) / narrative **UNVERIFIED** | Four extras → eight dims; `objective_achieved` scores approach not result; outcome fields outside scores; no `postProcessScores`; `DIFFICULT_CONVERSATION_CHROME` mounts end banner / outcome / in-role reaction; `15-DRIFT.md` §3 Case1 5/`not_met`, Case2 ≤3/`met`; `verify-dc-report` + `verify-dc-type` EXIT 0; prior `dc-approach-vs-result` EXIT 0. Live report walk **DEFERRED**. |

**Score:** 4/4 success criteria **PASS-automated**; 0 FAIL. Human keyboard coverage remains open.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/engine/types.ts` + `lib/report/snapshot.ts` | DC `InstanceConfig` / `InputSnapshot` members; snapshot omits `hiddenPosition` | ✓ VERIFIED | `verify-dc-engine-extensions` EXIT 0; Gap 1 — marker has no `source` attribute |
| `lib/difficult-conversation/conversation-type.ts` | Eight dims, floor 4, outcome unscored, briefing+difficulty steps | ✓ VERIFIED | Extras clarity/empathy/holding_the_line/objective_achieved; `avatarEndFloor: { minAssistantTurns: 4 }`; no `postProcessScores` |
| `lib/difficult-conversation/conversation-prompts.ts` | Anti-drift absolute rules + per-turn reminder + approach-not-result evaluator | ✓ VERIFIED | ≥6 numbered rules / ≥7 WRONG examples; tail "you do not coach"; evaluator immovable calibration |
| `lib/difficult-conversation/seeded.ts` | 6–8 seeded code records (seven shipped) | ✓ VERIFIED | Exact seven ids match 15-04-SUMMARY; `verify-dc-seeded` EXIT 0 |
| `lib/difficult-conversation/store.ts` + five authoring routes + play | Owner-scoped S3; publish gate; discovery list | ✓ VERIFIED | add/edit/delete/publish/list + play; `verify-dc-store` + `verify-dc-routes` EXIT 0 |
| `lib/difficult-conversation/prepublish-check.ts` + authored-text defense | Two-thing fail-closed screen; delimited injection defense | ✓ VERIFIED | Abuse + injection only; `verify-dc-prepublish` + `verify-dc-prompt-safety` EXIT 0 |
| `app/conversations/page.tsx` (+ new/[id]) | Three-section catalog + six-field builder | ✓ VERIFIED | Featured → Mine → From other students; `ConversationBuilder` |
| `ConversationBriefingStep` + `ConversationDifficultyStep` | Full briefing; hiddenPosition withheld; difficulty-only dial | ✓ VERIFIED | Props omit `hiddenPosition`; three bands; surface-count §8 clean |
| `SessionSafetyPanel` + `InCharacterClosePrompt` | Out-of-band End + support note; recognize→offer→confirm close | ✓ VERIFIED | Mounted on `app/practice/[type]/[instanceId]/page.tsx` with `hideDefaultEndControl` |
| Report panels via `ReportChrome` extras | End banner, outcome, in-role reaction | ✓ VERIFIED | `DIFFICULT_CONVERSATION_CHROME`; `verify-dc-report` EXIT 0 |
| `scripts/verify-dc-*.ts` (nine) | Mechanical guards | ✓ VERIFIED | All EXIT 0 this run (see below) |
| `15-VALIDATION.md` + `15-DRIFT.md` | Recorded SC + locked-decision + probe evidence | ✓ VERIFIED | Present; human rows honestly DEFERRED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Tile | Catalog | `route: /conversations`, `availability: "live"` | ✓ WIRED | `lib/interactions/index.ts` |
| Catalog / practice | Engine start | `startSession` DC branch → `resolveDifficultConversationInstance` | ✓ WIRED | Seeded-first resolve before case-study fallthrough |
| Authored text | Avatar + evaluator | `buildAuthoredTextBlock` / `ForStudent` delimiters | ✓ WIRED | Student briefing omits `hiddenPosition` (prompt-safety §5) |
| Publish / edit | Pre-publish check | `runPrePublishCheck` on publish-visible saves | ✓ WIRED | Routes corpus + fail-closed stubs |
| Live chat | Anti-drift | System absolute rules + `buildTailFragment` | ✓ WIRED | Real chat route used by `dc-drift-probe` (15-DRIFT) |
| Student end paths | Finish reasons | `student_left_session` vs `student_closed_in_character` | ✓ WIRED | Panel + close prompt → finish; engine accepts both |
| Evaluator | Eight dims + unscored outcome | Type extras + outcome fields + prompts | ✓ WIRED | Approach-vs-result matrix prior EXIT 0 |
| Report page | DC chrome | `getReportChrome("difficult-conversation")` extras | ✓ WIRED | No slug branch in report page; extras.above/below |

### Locked-decision / anti-goal spot checks

| Decision | Spot check | Result |
|----------|------------|--------|
| Seven seeded (6–8 band) | Surface-count §10 exact id list | ✓ |
| `hiddenPosition` never in briefing | Briefing props + `buildAuthoredTextBlockForStudent`; prompt-safety §5 | ✓ |
| Three discovery sections, seeded first | `/conversations` Featured → Mine → From other | ✓ |
| Publish gates (abuse + injection only) | Prepublish prompt + corpus; surface-count §8 | ✓ |
| `SessionSafetyPanel` + support note | Mounted with `hideDefaultEndControl` | ✓ |
| Eight rubric dims; outcome unscored | Type extras + schema; outcome keys not in `required[]` scores | ✓ |
| Approach vs result decoupling | Evaluator text + `15-DRIFT` matrix Case1/Case2 | ✓ |
| No deferred CONTEXT items | Surface-count §8: no both-sides, report/flag/hide, appeal queue, industry reframe, OOC debrief | ✓ |
| No second session/report/evaluator surface | Surface-count §§1–4; one registry/evaluator/shell/report | ✓ |
| Gap 1: no marker `source` attribute | Engine-extensions §7 | ✓ |
| Floor consumed from 14-02 shape | `avatarEndFloor.minAssistantTurns: 4` on DC type | ✓ |

### Requirements Coverage

Phase 15 has no REQ-IDs. Plans map to `P15-SC1`..`P15-SC4` only. All four covered by plans 15-01..15-11; none orphaned.

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| P15-SC1 | 15-01, 04, 06, 08, 10, 11 | ✓ SATISFIED (automated) | Seeded + drift harness; human session open |
| P15-SC2 | 15-02, 03, 05, 07, 11 | ✓ SATISFIED (automated) | Author routes + private default + gate |
| P15-SC3 | 15-02, 05, 07, 11 | ✓ SATISFIED (automated) | Published discovery + owner retained |
| P15-SC4 | 15-06, 09, 10, 11 | ✓ SATISFIED (automated assembly) | Rubric + matrix + report chrome; human narrative open |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| Human blocks B–G | UNVERIFIED under `skip_checkpoints` | ⚠️ Warning | Does not falsify automated SCs; blocks keyboard phase sign-off |
| Hostile probe 5 (`15-DRIFT.md`) | DEFERRED classifier/human | ⚠️ Warning | Mentions grades/scores while deflecting — needs human PASS/FAIL |
| `scripts/verify-report-structure.ts` | FAIL on `difficult-conversation` | ℹ️ Info | Pre-existing tooling gap (also noted in 16-VALIDATION); not a product SC FAIL |
| Calibration (bands / floor / support note) | No human keep/change under skip | ⚠️ Warning | Operational; values remain Claude-Discretion defaults |

No stub handlers, second evaluator, second report page, or deferred-list artifacts found in product code.

### Scripts Run (this verification)

Local DB / env from `.env.local` as applicable. Command pattern: `npx tsx scripts/<name>.ts` (unsandboxed).

| Script | Exit code | Result |
|--------|----------:|--------|
| `verify-dc-engine-extensions.ts` | 0 | all sections passed |
| `verify-dc-store.ts` | 0 | All sections passed |
| `verify-dc-prepublish.ts` | 0 | ALL SECTIONS PASSED (live OpenAI corpus) |
| `verify-dc-seeded.ts` | 0 | all eight sections passed |
| `verify-dc-routes.ts` | 0 | ALL SECTIONS PASSED |
| `verify-dc-type.ts` | 0 | ALL PASS |
| `verify-dc-prompt-safety.ts` | 0 | ALL PASS |
| `verify-dc-report.ts` | 0 | All eight sections passed |
| `verify-dc-surface-count.ts` | 0 | ALL TEN SECTIONS PASSED |

Prior (cited, not re-run as live HeyGen): `dc-approach-vs-result` EXIT 0 and drift probe final run in `15-DRIFT.md` (2026-10-04T04:42:56Z) — 32/33 automated PASS, 1 DEFERRED.

### Human Verification Required

See frontmatter `human_verification`. Resume path documented in `15-VALIDATION.md`: type `approved` after walking blocks B–G (and prior 15-07/08/09/10 deferred checklists), or list FAIL rows + calibration changes. Do **not** invent session ids.

### Gaps Summary

**No product FAIL gaps** for `/gsd:plan-phase 15 --gaps` / `/gsd/plan-fix` from this automated pass.

Residual (not SC FAIL):

1. Human keyboard UAT blocks B–G still **UNVERIFIED**.
2. Hostile drift probe 5 still **DEFERRED** human sign-off.
3. Pre-existing `verify-report-structure` tooling FAIL on DC instance requirement.
4. Calibration values unconfirmed by a human (kept as shipped defaults).

### Recommended next steps

1. **`/gsd/verify-work 15`** — keyboard sign-off for blocks B–G + hostile probe 5 sentence.
2. **`/gsd/plan-fix`** — only if a human marks any Success Criterion **FAIL**.

---

_Verified: 2026-10-04T04:54:02Z_  
_Verifier: Claude (gsd-verifier)_
