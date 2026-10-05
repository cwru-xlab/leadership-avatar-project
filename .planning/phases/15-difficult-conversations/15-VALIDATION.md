# Phase 15 — Difficult Conversations Validation Record

**Plan:** 15-11  
**Date:** 2026-10-04  
**Mode:** `skip_checkpoints: true` — Task 3 human-verify blocks B–G were **not** run at a keyboard. Automated evidence is recorded honestly; human-judged rows are **DEFERRED → /gsd/verify-work 15** or **UNVERIFIED**, never silent PASS with invented session ids.  
**Local DB only:** `postgresql://ajabreu79@localhost:5432/leadership_avatar_dev`

---

## Section 1 — The four Success Criteria

### Criterion 1 (P15-SC1)

> A seeded catalog of role-specific conversations is playable, and the avatar holds its role for the whole session instead of drifting into a coaching or narrator voice.

| | |
|---|---|
| **How verified** | Seven seeded code records + live avatar assignment (15-04); session surface (15-08); **load-bearing:** 15-10 adversarial drift harness through the real chat turn |
| **Plans / evidence** | 15-04 seeded verification; 15-08 blocks A/C/D (human deferred); **15-DRIFT.md** probe tables |
| **Session / report ids** | Drift harness uses live chat turns against seeded `confront-low-performer`-class prompts — **no human keyboard session id**. Live human seeded play (fire-team-member / decline-senior-request) **not run** under skip_checkpoints. |
| **Drift probe table (load-bearing)** | See `15-DRIFT.md` §1. Summary: **receptive 11/11 PASS**; **guarded 11/11 PASS**; **hostile 10/11 PASS + 1 DEFERRED** (probe 5 rubric — mentions grades/scores while deflecting). Overall **32/33 automated PASS**; 1 DEFERRED human sign-off. |
| **Verdict** | **PASS (automated drift harness + seeded catalog)** — 15-10 records P15-SC1 provisionally MET. **DEFERRED → /gsd/verify-work 15** for (a) hostile probe 5 human judgment, (b) full live seeded session confirming End-session + support note + no difficulty meter, (c) the one-sentence Criterion 1 verdict after a human has played a full session. |

### Criterion 2 (P15-SC2)

> A student can author their own difficult-conversation scenario and practice it immediately; it stays private until they deliberately publish it.

| | |
|---|---|
| **How verified** | Five authoring routes + pre-publish gate (15-05); `/conversations` catalog + builder (15-07 blocks B/C) |
| **Plans / evidence** | `verify-dc-routes` 14 sections exit 0; `verify-dc-prepublish` exit 0; `verify-dc-store` exit 0; 15-07 SUMMARY walkthrough deferred |
| **Session / report ids** | Route corpus exercises add/edit/publish/unpublish against local S3/dev — **no human authoring session id** under skip_checkpoints. |
| **Verdict** | **PASS (automated routes + store + prepublish)** — private create, gated publish, rejected save stays privately playable. **DEFERRED → /gsd/verify-work 15** for 15-07 blocks B–C (author → practise private → publish UI). |

### Criterion 3 (P15-SC3)

> A published scenario is playable by any user, and the authoring student remains its owner.

| | |
|---|---|
| **How verified** | Play-path assertions (15-02); routes sections 11–13 (15-05); 15-07 block D (second account) |
| **Plans / evidence** | `verify-dc-store` owner-scope + published discovery; `verify-dc-routes` cross-owner 404-not-403; list three sections |
| **Session / report ids** | Automated cross-student 404 proofs only — **no second-account keyboard session**. |
| **Verdict** | **PASS (automated ownership + discovery)** — published is discovery-only; non-owner edit/delete/get → not-found; author retains `ownerId`. **DEFERRED → /gsd/verify-work 15** for 15-07 block D (second account plays under "From other students"; author still owns). |

### Criterion 4 (P15-SC4)

> The report judges how the conversation was handled — clarity, empathy, holding the line — not merely that the student reached the end of it.

| | |
|---|---|
| **How verified** | Type/schema eight dimensions (15-06); report panels (15-09); **load-bearing:** 15-10 `dc-approach-vs-result` matrix |
| **Approach-vs-result matrix** | Case1 skilful/NOT met → **5 / not_met**; Case2 clumsy/MET → **1–2 / met**; Case3 skilful/MET → **5 / met**; Case4 poor/NOT → **1 / not_met\|partial**. Harness exit 0 (15-10-SUMMARY; reconfirmed 15-11 Task 3 block A). |
| **Plans / evidence** | `verify-dc-type`, `verify-dc-report`, `dc-approach-vs-result` all exit 0 |
| **Session / report ids** | Evaluator harness transcripts — **no live human report id** under skip_checkpoints. |
| **Verdict** | **PASS (automated schema + evaluator matrix + report structure scripts)** — Objective achieved scores approach not result; outcome unscored. **DEFERRED → /gsd/verify-work 15** for 15-09 Task 3 steps 1–8 live report walk (eight cards, outcome panel, avatar-end banner, in-role reaction). |

---

## Section 2 — Locked CONTEXT.md decisions

| # | Locked decision | Evidence | Verdict |
|---|---|---|---|
| 1 | 6–8 seeded records (brief's four + neighbours) | Seven shipped (`15-04-SUMMARY`; surface-count §10) | **PASS** |
| 2 | Each record: hidden position, shared backstory, student objective, stakes | `DifficultConversationRecord` + seeded.ts; `verify-dc-seeded` | **PASS** |
| 3 | Full briefing; hidden position withheld | `ConversationBriefingStep` type-blocks `hiddenPosition` (15-08); `buildAuthoredTextBlockForStudent` omits it (15-03/15-06) | **PASS (code)** / **DEFERRED (human briefing UX)** |
| 4 | No student-selected briefing level; no situation-only cold open | Briefing step always shows full fields (15-08); no briefing-level wizard control | **PASS (code)** |
| 5 | Difficulty is the only dial | `ConversationDifficultyStep` only; no industry/role reframe (surface-count §8) | **PASS** |
| 6 | No industry/role reframing | Surface-count §8; type/instance keys clean | **PASS** |
| 7 | Prompt-level anti-drift prohibition present | `conversation-prompts.ts` absolute rules (15-06/15-10) | **PASS** |
| 8 | Per-turn tail reminder present and in the tail only | `buildTailBlock` fragment (15-06); `verify-dc-prompt-safety` | **PASS** |
| 9 | No runtime coach-voice detection | Surface-count §7; 15-10 grep clean | **PASS** |
| 10 | Resistance responds both directions | Prompt instructions (15-06); 15-DRIFT §2 resistance probes | **PASS (prompt + automated)** / **DEFERRED (human session feel)** |
| 11 | No fixed stance; no scripted deny→deflect→concede arc | Prompt + type (15-06) | **PASS (code)** |
| 12 | Never breaks character, including distress | Drift probes 9 across bands PASS (15-DRIFT); SessionSafetyPanel out-of-band | **PASS (automated probes)** / **DEFERRED (human distress walk 15-08 C)** |
| 13 | Out-of-band End-session always visible | `SessionSafetyPanel` + `hideDefaultEndControl` (15-08) | **PASS (code)** / **DEFERRED (human)** |
| 14 | Static support note always visible | `SUPPORT_RESOURCE_NOTE` (15-08-SUMMARY) | **PASS (code)** / **DEFERRED (human)** |
| 15 | Avatar-initiated end floor-gated; recorded as outcome not error | `avatarEndFloor.minAssistantTurns: 4`; ConversationEndBanner (15-06/15-09) | **PASS (engine + report structure)** / **DEFERRED (live walk-out)** |
| 16 | Student in-character end is graded | `student_closed_in_character` + InCharacterClosePrompt (15-01/15-08) | **PASS (code)** / **DEFERRED (human confirm path)** |
| 17 | recognize→offer→confirm with explicit confirm | Gap 1 + InCharacterClosePrompt (15-01/15-08) | **PASS (code)** / **DEFERRED (human)** |
| 18 | Difficulty hidden in-session; no indicator/meter | Surface-count §7 (`difficultyBadge`/`resistanceMeter` absent); difficulty step only in wizard | **PASS** |
| 19 | Authored structurally identical to seeded | Same validator `validateDifficultConversationInput` (15-02/15-04) | **PASS** |
| 20 | New S3 object shape, not CaseStudy retrofit | `lib/difficult-conversation/store.ts` + s3 prefix (15-02) | **PASS** |
| 21 | Pre-publish automated; no human reviewer | `runPrePublishCheck` (15-03/15-05) | **PASS** |
| 22 | Check screens exactly two things (abuse + injection) | PREPUBLISH_SYSTEM_PROMPT; `verify-dc-prepublish` | **PASS** |
| 23 | NOT screened: real identifiable people; off-purpose | Surface-count §8; prepublish "do-not-reject" for off-topic | **PASS** |
| 24 | Every publish-visible save re-runs the check | edit+publish routes call `runPrePublishCheck` (15-05) | **PASS** |
| 25 | Rejection names reason + fix; stays privately playable | 15-07 publish panels; routes 422 corpus | **PASS (automated)** / **DEFERRED (human panel copy)** |
| 26 | No appeal queue | Surface-count §8; 15-07 walkthrough step 9 | **PASS** |
| 27 | Edits are live; reports keep inputSnapshot | Snapshot member omits hiddenPosition (15-01); edit/unpublish ungated | **PASS (code)** |
| 28 | Discovery three sections, seeded first | `/conversations` Featured → Mine → From other students (15-07) | **PASS (code)** / **DEFERRED (human catalog)** |
| 29 | No mixed list with per-card attribution | Section headings only (15-07) | **PASS (code)** |
| 30 | Four type extras → eight dimensions | clarity, empathy, holding_the_line, objective_achieved (15-06; surface-count §9) | **PASS** |
| 31 | Objective achieved scores approach not result | Matrix Case1 5/not_met, Case2 ≤3/met (15-10) | **PASS** |
| 32 | Outcome record kept and never scored | `outcome` fields outside scores required[] (surface-count §9; verify-dc-report) | **PASS** |
| 33 | No outcome cap or lift (Phase 14 pattern not reused) | No `postProcessScores` on DC type (surface-count §7) | **PASS** |
| 34 | Avatar-ended report uses Phase 14 pattern; every dim still scored | ConversationEndBanner + verify-dc-report (15-09) | **PASS (structure)** / **DEFERRED (live)** |
| 35 | In-role reaction report-side only | InRoleReactionPanel via extras; not in live prompt as debrief (15-09) | **PASS** |

---

## Section 3 — Phase 13 regression

| Check | Evidence | Verdict |
|---|---|---|
| Interview session runs and reports | `verify-engine-config` / primitives exit 0; ENGINE_TYPES still includes interview slugs | **PASS (automated / prior)** / **DEFERRED (fresh 15-11 keyboard E)** |
| Case-study session runs and reports | Prior Phase 13 validation; type still resolves | **PASS (prior)** / **DEFERRED (fresh)** |
| Pre-Phase-13 interview report at old URL | 13-VALIDATION item 1 | **PASS (prior Phase 13)** |
| Pre-Phase-13 scenario report at old URL | 13-VALIDATION item 3 | **PASS (prior Phase 13)** |
| Legacy admin case at `/case-play/{id}` | No redirect added by Phase 15 surfaces | **PASS (code path intact)** / **DEFERRED (keyboard)** |
| Pitch session still runs (Phase 14 landed) | `pitch-elevator` in ENGINE_TYPES; resolves in surface-count §1 | **PASS (resolve)** / **DEFERRED (live)** |
| Networking still resolves (Phase 16 landed) | `networking` in ENGINE_TYPES count=8 | **PASS (resolve)** |

---

## Section 4 — Phase 13 extensions made by Phase 15

Handoff for anyone revising Phase 13 (mirror of 14-15 / 16-11 Section 4). Fold these into 13-xx plans so the next type inherits them.

| Against | Extension | Landed in | By plan |
|---|---|---|---|
| **13-01** | `InstanceConfig` gains `kind: "difficult-conversation"` (`DifficultConversationInstance`) with compile-enforced `hiddenPosition` privacy boundary | `lib/engine/types.ts` | 15-01 |
| **13-02** | `InputSnapshot` gains `kind: "difficult-conversation"` member (**omits** `hiddenPosition`) | `lib/report/snapshot.ts` | 15-01 |
| **13-03** | **NO CHANGE.** Gap 1: termination marker is **not** extended with `source`; caller supplies source + reason codes | (untouched) | 15-01 |
| **13-01 (resolver)** | Seeded code array checked **before** S3 authored lookup (shared id-namespace) | `lib/difficult-conversation/resolve-instance.ts`, registry wiring | 15-06 |
| **13-06** | `buildTailBlock` gains per-turn in-character reminder fragment (same mechanism; no new delivery path) | `lib/engine/prompts.ts`, `conversation-prompts.ts` | 15-06 |
| **13-10** | Out-of-band end path: finish with `source:'student'` + `student_left_session` vs in-character `student_closed_in_character` | `PracticeSessionShell` + `SessionSafetyPanel` + `InCharacterClosePrompt` | 15-08 |
| **13-07 / session start** | `startSession` difficult-conversation branch (seeded-first resolve → Prisma snapshot) — recorded Rule 3 fix so `instance.required` types without wizard authoring do not fall through to case-study `getCase` | `lib/engine/session.ts`, `app/api/practice/session/start/route.ts` | 15-08 |
| **13-02 (DTO)** | `toReportDto` surfaces validated outcome fields + DC inputSnapshot | `lib/report/dto.ts` | 15-09 |
| **13-12 ReportChrome** | DC chrome registration: end banner / outcome / in-role reaction via extras slots | `components/practice/ReportChrome.tsx`, `components/practice/report/Conversation*.tsx` | 15-09 |

### Consumed, not re-declared (Phase 14 reconciliation)

| Item | Path that happened | Evidence |
|---|---|---|
| **`TerminationPolicyConfig.avatarEndFloor`** | **CONSUMED from 14-02** (type field already present `da26f83`). Floor **enforcement** in `resolveTermination` committed by 15-01 under 14-02's exact shape because parallel 14-02 Task 2 was uncommitted — **not a second floor field**. | 15-01-SUMMARY "Case A" |
| **`PracticeSessionShell.sessionPanel` slot** | **CONSUMED** — already present from Phase 14 parallel work when 15-08 ran. DC mounts `SessionSafetyPanel` + close prompt; did **not** add a parallel slot. | 15-08-SUMMARY |
| **`ReportChrome` extras slot** | **ADDED in 14-14's declared shape** by 15-09 because 14-14 had not executed: `extras?: Partial<Record<'above'\|'below', …>>` + `renderReportExtras`. Phase 14/16 must **consume** this slot — do not add a second one. | 15-09-SUMMARY |

### Gap 1 decision (for future readers of 13-03)

**DECISION: NO** — the termination marker does **not** gain a `source` attribute. Avatar-emitted markers are `source: "avatar"` by definition; student ends are explicit finish-route calls with reason codes (`student_closed_in_character` / `student_left_session`). See 15-01-SUMMARY verbatim Gap 1 section.

**Closing note:** Whoever revises Phase 13 should fold the table into 13-01/13-02/13-06/13-07/13-10/13-12 docs so the next interaction type inherits seeded-first resolve, tail-block fragments, sessionPanel, and ReportChrome extras without rediscovering them.

---

## Section 5 — Calibrations and open items

| Value | Current | Tuned in Task 3? | Notes |
|---|---|---|---|
| Seven seeded ids | `confront-low-performer`, `fire-team-member`, `ask-for-raise`, `challenge-grade`, `deliver-bad-news-client`, `peer-conflict`, `decline-senior-request` | No (skip) | Neighbours were Claude's Discretion (15-04) |
| Default difficulty | **guarded** for all seven | No | Student may pick another at setup |
| Difficulty bands | `receptive` / `guarded` / `hostile` | No (skip) | Labels in 15-08-SUMMARY |
| `avatarEndFloor.minAssistantTurns` | **4** | No (skip) | Same knob family as pitch; DC value 4 |
| Pre-publish model | `INTERVIEW_PERSONA_MODEL \|\| "gpt-4.1"`; synchronous on request | No | 15-03 |
| Moments reuse for reaction timecodes | **NO** — reused `formatTimecode` only | N/A | 15-09 |
| "From other students" ordering/paging | `updatedAt` descending; opaque `cursor` | No (skip) | list/route.ts |
| Seeded avatar assignment | Live HeyGen catalog + `SEEDED_AVATAR_GENDER_HINTS` | No | 15-04 |
| `DC_LIMITS` | See `lib/difficult-conversation/types.ts` | No | TITLE 4–80 … STAKES 10–600 |
| Support note | Quoted in 15-08-SUMMARY | No (skip) | |
| Outcome panel caption / reconciling line | As shipped in 15-09 panels | No (skip) | |

### Known open items

| Item | Status |
|---|---|
| Hostile drift probe 5 human sign-off | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 13; item-level observation not supplied. |
| Human UAT from 15-07 / 15-08 / 15-09 / 15-10 / 15-11 B–G | **PASS (human-reported; evidence PARTIAL)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] items 1–6; session/report IDs and detailed observations not supplied. |
| `verify-report-structure.ts` vs `difficult-conversation` requires instance | Pre-existing tooling gap (also noted in 16-VALIDATION) — **not** a Phase 15 product FAIL |

---

## Section 6 — Gaps

Empty for Success Criteria / locked-decision **FAIL** rows — none recorded as FAIL.

Human-unverified / deferred keyboard items are tracked as **DEFERRED → /gsd/verify-work 15** in Sections 1–3 and Section 5, not as plannable product gaps.

If a later human keyboard pass marks any Success Criterion **FAIL**, add an entry here in the shape `/gsd:plan-phase 15 --gaps` consumes:

```
### Gap: <truth that failed>
- Reason:
- Artifacts:
- Missing:
```

---

## Task 3 Block A — Scripts (agent-run 2026-10-04)

| Script | Result |
|---|---|
| `verify-dc-surface-count` | **PASS** (10 sections) |
| `verify-engine-config` | PASS |
| `verify-engine-primitives` | PASS |
| `verify-engine-surface-count` | PASS |
| `verify-dc-engine-extensions` | PASS |
| `verify-dc-store` | PASS |
| `verify-dc-prepublish` | PASS |
| `verify-dc-seeded` | PASS |
| `verify-dc-routes` | PASS |
| `verify-dc-type` | PASS |
| `verify-dc-prompt-safety` | PASS |
| `verify-dc-report` | PASS |
| `dc-approach-vs-result` | PASS |
| `verify-report-structure` | **FAIL** (pre-existing: `resolve difficult-conversation: requires an instance` — tooling debt, not a SC failure) |

### Human blocks B–G — completed 2026-10-05

The human reported all six planned blocks PASS. The individual session/report IDs, observations, calibration decision, and concrete environment details were not supplied; see [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]].

#### From 15-07 (catalog / author / publish / second account)

See `15-07-SUMMARY.md` → "Walkthrough steps for later verification" (blocks A–F): catalog sections; author+practise private; publish gate including harsh-but-legitimate firing; second account under "From other students"; seeded not editable; panel copy judgment.

#### From 15-08 (session surface)

See `15-08-SUMMARY.md` → "Deferred human walkthrough (Task 3)":

- **A** — Briefing completeness; no hidden position; hostile session with no difficulty meter
- **B** — In-character close requires explicit student confirm
- **C** — Distress: character stays in role; End-session + support note from first frame
- **D** — Walk-out is an outcome (neutral transition, report, floor of four)
- **E** — Calibration on bands, support note, end-control copy, floor value

#### From 15-09 (report)

See `15-09-SUMMARY.md` — Task 3 steps 1–8 live report walk **DEFERRED** (eight dimensions, unscored outcome, avatar-end banner, in-role reaction).

#### From 15-10 (drift reconfirm)

See `15-DRIFT.md` — reconfirm every probe row after a full human session; especially hostile probe 5; one explicit sentence on whether the avatar ever drifted into coaching/narrator voice.

#### 15-11 blocks B–G (phase sign-off)

| Block | Status |
|---|---|
| B — Fresh seeded conversation (fire-team-member or decline-senior-request) at guarded | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 1; session ID not supplied. |
| C — Author, publish, second account plays | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 2; session ID not supplied. |
| D — Drift record reconfirm after full session | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 3; item-level drift sentence not supplied. |
| E — Phase 13 regression keyboard | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 4; IDs/old URL not supplied. |
| F — Calibration keep/change | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 5; no change requested. |
| G — Row-by-row mark of Sections 1–2 | **PASS (human-reported)** — [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]] item 6; no disputed row supplied. |

**Phase 15 keyboard sign-off:** all six planned blocks were reported PASS by the human on 2026-10-05; see [[.planning/phases/17-v1-0-close-out/17-KEYBOARD-PASS-1]]. The record remains evidence-**PARTIAL** because no session/report IDs, item-level notes, calibration detail, or run-environment detail was supplied.

### Task 3 disposition (2026-10-04)

- Checkpoint `human-verify` **skipped** per `skip_checkpoints: true` (parallel group wave 6, plan 15-11).
- No calibration tuning applied (block F unanswered).
- No Success Criterion marked FAIL; no Section 6 product gap opened.
- Resume signal for a later human: type `approved` after walking blocks B–G (and prior deferred checklists), or list FAIL rows + calibration changes.
