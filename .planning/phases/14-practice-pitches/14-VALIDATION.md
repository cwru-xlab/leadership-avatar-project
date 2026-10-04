# Phase 14 Validation Record

**Plan:** 14-15  
**Created:** 2026-10-04  
**Status:** SIGNED OFF — human verdict 2026-10-04: "overall, i think we're good with 14-15"  
**Local DB:** `postgresql://ajabreu79@localhost:5432/leadership_avatar_dev`  
**Surface guard:** `npx tsx scripts/verify-pitch-surface-count.ts` — ALL CHECKS PASSED (2026-10-04)

### Block A — automated suite (Task 3 prep, 2026-10-04)

| Script | Result |
| --- | --- |
| verify-engine-config | PASS |
| verify-engine-primitives | PASS |
| verify-engine-surface-count | PASS |
| verify-report-structure | PASS |
| verify-pitch-engine-extensions | PASS |
| verify-deck-intake | **1 FAIL** — known deferred fixture mismatch (`Spike Deck Title` vs `Spike Deck Slide 1`); see `deferred-items.md` |
| verify-deck-rasterize | PASS |
| verify-pitch-session-state | PASS |
| verify-pitch-types | PASS |
| verify-slide-gating | PASS |
| verify-pitch-surface-count | PASS |
| verify-deck-routes | PASS |
| verify-pitch-report-panels | PASS |

`npx tsc --noEmit`: pre-existing errors in unrelated `.next` spike types and Phase 15/16 verify stubs; **this plan's** `verify-pitch-surface-count.ts` networking stub corrected. `next build` known-broken on `/about` (EDGE_CONFIG). Dev server expected on `http://localhost:3000`.

Prior human checkpoints reuse recorded evidence rather than re-running those sessions. Task 3 requires one fresh elevator pitch, one fresh investor pitch, Phase 13 regression, and calibration judgements before any Section 1–3 row may move from PENDING to PASS/FAIL.

Known follow-ups (do **not** implement in 14-15): see `deferred-items.md` — walk-out temperature auto-end; broader non-investor deck modes; pre-existing `verify-deck-intake.ts` fixture mismatch.

---

## Section 1 — The five amended Success Criteria

### Criterion 1

> The elevator pitch enforces a 30-60 second window; avatar engagement follows from concision and from whether the student found common ground first, and a tedious pitch can end the conversation early as a recorded failure rather than a neutral finish.

| Field | Value |
| --- | --- |
| How verified | Live `/practice/pitch-elevator` sessions (14-10 Task 3 A/B/C path) + report chrome (14-14 Task 3 steps 1–5); soft timer + dialogue-only disengagement; early-end banner when applicable |
| Prior evidence | **14-10** human verdict `approved` — "Session A worked (after mid-checkpoint timer fix … 516f278)"; "Timer mid-session collapse + soft cutoff verified in live Session A/B path"; "No engagement meter/gauge; no hard cutoff". Local READY elevator reports: `ca5f5982-4bae-410c-9cb4-55a258873373`, `c8b4bad8-f4a3-4953-8add-71fae393366b`. **14-14** human verdict `approved` for report panels including early-end banner |
| Session / report ids | `ca5f5982-4bae-410c-9cb4-55a258873373`, `c8b4bad8-f4a3-4953-8add-71fae393366b` (READY elevator; 14-10/14-14 path) |
| Verdict | **PASS** — human Phase 14 sign-off; soft window + report chrome previously approved; READY elevator reports intact |

### Criterion 2

> A deck uploaded as PDF or PPTX becomes per-slide text plus server-rendered slide images stored privately, and a file that is not a readable deck is rejected with a reason and a fix instead of a broken session.

| Field | Value |
| --- | --- |
| How verified | Deck intake + rasterize + authenticated routes (14-01, 14-03, 14-06, 14-07 Task 3) |
| Prior evidence | **14-07** human `approved`: real PDF "CAA REQUEST 2026-7.pdf" (11 slides); deck id `cfed8ee7-564e-4bd6-a636-4fe0abd17ef7` after canvasFactory + disableFontFace fix `97b273e`; `verify-deck-routes.ts` exit 0; PPTX correctly 502s with reason+fix while `DECK_CONVERT_URL` unset (accepted interim). Validation-minimum + rejection reason/fix covered by `verify-deck-intake.ts` / route verify |
| Session / report ids | Deck asset: `cfed8ee7-564e-4bd6-a636-4fe0abd17ef7` (upload, not a session). Live pitch-deck session using a deck: see Criterion 3 |
| Verdict | **PASS** — human Phase 14 sign-off; CAA REQUEST PDF end-to-end on investor pitch (`0c7f54d8-…`, 11 slides) |

### Criterion 3

> The student advances slides live, and the avatar's context contains only slides the student has actually shown — never content from a slide not yet reached, and navigating backward does not un-show what the avatar already saw.

| Field | Value |
| --- | --- |
| How verified | `scripts/verify-slide-gating.ts` (14-11) + live leak test (14-13 Task 3 steps 3–6) |
| Prior evidence | **Script:** 14-11 SUMMARY — `npx tsx scripts/verify-slide-gating.ts` → ALL PASS (12 sections). Load-bearing leak proof: sentinel slides beyond high-water mark absent from system prompt and from admitted tail; after advancing to mark 7 then navigating back to 2, `SENTINEL-SLIDE-07` remains present ("SENTINEL-SLIDE-07 still present after backward nav"). Forward jump from 3→7 admits SENTINEL-SLIDE-03..07. Single ratchet in `lib/pitch/slide-reveal.ts` only. **Live:** 14-13 human leak-test verdict verbatim: `overall, id say it's approved`. Local deck session from that window: report `32619f7a-7d55-4c0d-a8c7-1cf1c673602e` (`slideHighWaterMark=2`, `timeBudgetSeconds=1320`, status IN_PROGRESS at capture) |
| Session / report ids | Leak-test / finish path: `32619f7a-7d55-4c0d-a8c7-1cf1c673602e`. Fresh finished deck: `0c7f54d8-d79d-4665-bd56-2f6455441849` (`slideHighWaterMark=10`, 11 slides). Mid-UAT confirm: investor sees shown slides after chat hydrate fix |
| Verdict | **PASS** — human: "investors can see slides now. works"; prior leak-test approved; high-water mark + tail hydrate verified live |

### Criterion 4

> The report scores deck structure, text density and the appearance of the rendered slides alongside vocal delivery, and the negotiation outcome is recorded as the student's ask versus the settled terms versus the scenario's fair-value band.

| Field | Value |
| --- | --- |
| How verified | Evaluator image input + outcome schema (14-04, 14-09) + report panels (14-14 Task 3 steps 6–12) |
| Prior evidence | **14-04** `verify-report-structure.ts` §7 ALL PASS (outcome composition, `MAX_EVALUATOR_IMAGES`, early-end cap). **14-09** pitch-deck type: nine dimensions + ask/fair band session-constant. **14-14** human `approved` — `PitchOutcomeBanner`, `NegotiationTriplePanel` (ask vs settled vs fair), `DeckTimelinePanel` via `ReportChrome` extras only (one report page unchanged) |
| Session / report ids | Fresh READY deck report `0c7f54d8-d79d-4665-bd56-2f6455441849` ("Investor pitch · 11 slides"); human: "otherwise, the report generator works" |
| Verdict | **PASS** — human confirmed report generator; 14-14 chrome previously approved |

### Criterion 5

> Session length is proposed from slide count within a 20-30 minute envelope and is student-adjustable before starting; the remaining time is visible during the session and can be hidden by the student.

| Field | Value |
| --- | --- |
| How verified | `proposeDeckSeconds` (14-05/14-09/14-12) + live `DeckTimerPanel` (14-13 Task 3 steps 7–8); elevator soft timer (14-10) |
| Prior evidence | **14-12** wizard `SessionLengthStep` uses `proposeDeckSeconds` (anchors 8→1200s, 25→1800s). **14-13** human approved soft hideable session timer; start returns clamped `timeBudgetSeconds` (session `32619f7a-…` recorded `1320`). Elevator: 14-10 approved collapsible `PitchTimerPanel` |
| Session / report ids | Deck sessions with `timeBudgetSeconds=1320` (22 min): `32619f7a-…`, `0c7f54d8-…`, `67394963-…` |
| Verdict | **PASS** — human Phase 14 sign-off; soft hideable timer previously approved; no calibration change requested |

---

## Section 2 — Locked CONTEXT.md decisions

| # | Locked decision | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | PDF + PPTX only; Google Slides cut permanently | Scope note in ROADMAP + 14-CONTEXT; no Drive code (`verify-pitch-surface-count` §7) | **PASS** (script + Phase 14 sign-off; no Drive UI) |
| 2 | No Drive OAuth / tokens / API | §7 no `googleapis` / `drive.v3` / Drive scope | **PASS** (automated) |
| 3 | Validation minimum only (genuine PDF/PPTX + extract) | 14-03 / 14-07 intake | **PASS** (intake + sign-off) |
| 4 | Portrait accepted; slide count not rejected | 14-03 CONTEXT + intake | **PASS** (intake + sign-off) |
| 5 | Rejection names reason and fix | 14-03 / 14-07 human + verify routes | **PASS** (prior 14-07 approved; PPTX 502 reason+fix) |
| 6 | No deckless escape hatch / no `skipDeck` | Surface-count §7; wizard requires upload | **PASS** (automated) |
| 7 | No soft per-slide warning tier | 14-03 intake design | **PASS** (design + sign-off) |
| 8 | Server-rendered private slide images | 14-06/14-07; owner-only byte route | **PASS** (prior 14-07 approved; deck `cfed8ee7-…`) |
| 9 | Images are an evaluator input | 14-04 `buildEvaluationImages` + `MAX_EVALUATOR_IMAGES` | **PASS** (automated prior) |
| 10 | High-water mark semantics | 14-11 script ALL PASS; 14-13 leak test approved; live `0c7f54d8-…` hwm=10 | **PASS** |
| 11 | Backward does not un-show | Script: SENTINEL-07 after back-nav; 14-13 approved | **PASS** |
| 12 | Forward jumps advance high-water mark | 14-11 forward-jump sentinels | **PASS** (script) |
| 13 | Controls: next/back + thumbnail strip | 14-13 `DeckViewerPanel`; live UAT | **PASS** |
| 14 | Soft 20–30 min envelope; overrun noted | 14-09/14-13 timer + 14-14 timeline; budget 1320s live | **PASS** |
| 15 | No hard finish / no in-character meeting close that ends session | Soft timer; no `onExpire`/`forceFinish` (surface-count §7) | **PASS** (automated + prior 14-13) |
| 16 | Length proposed from slide count; student-adjustable | 14-12 `SessionLengthStep` + `proposeDeckSeconds` | **PASS** |
| 17 | Free-text pitch subject | 14-10 `PitchSubjectStep` approved | **PASS** (prior 14-10) |
| 18 | Three student-selected knowledge levels (not from difficulty) | 14-10 `ListenerKnowledgeStep` approved | **PASS** (prior 14-10) |
| 19 | Visible timer with soft cutoff (elevator 60s) | 14-10 `PitchTimerPanel` + fix `516f278` | **PASS** (prior 14-10) |
| 20 | Timer hideable mid-session | 14-10 / 14-13 collapse storage keys | **PASS** (prior) |
| 21 | Disengagement in dialogue only | Elevator prompts; 14-10 approved; no meter | **PASS** |
| 22 | No engagement meter / gauge | Surface-count §7; 14-10 approved | **PASS** (automated + prior) |
| 23 | Early end is model judgment gated by floor | 14-08 `avatarEndFloor: { minAssistantTurns: 2 }` | **PASS** |
| 24 | Early-end banner with reasons + timecode AND all dimensions scored | 14-14 `PitchOutcomeBanner` + score-caps | **PASS** |
| 25 | Cap on discovery/tailoring only (`EARLY_END_CAP` 2/5) | `lib/pitch/score-caps.ts`; `verify-report-structure` §7 | **PASS** (automated) |
| 26 | Discovery & tailoring scored at all three knowledge levels | Elevator evaluator prompt; 14-10 + Phase 14 sign-off | **PASS** |
| 27 | Follow-ups open-ended (no fixed count/duration) | 14-08/14-10 prompts | **PASS** |
| 28 | Prefix cache still hits (slides in tail, not system prompt) | 14-11 verify-slide-gating prefix-cache sections ALL PASS | **PASS** (script) |
| 29 | Ask + hidden fair band; report ask vs settled vs fair | 14-09/14-12/14-14; report works | **PASS** |
| 30 | Deck scoring: structure + text density + rendered appearance | 14-09 dimensions + evaluator images; report works | **PASS** |

---

## Section 3 — Phase 13 regression

| Check | Evidence / ids | Verdict |
| --- | --- | --- |
| Interview session runs and reports | Local READY general reports e.g. `7b40bccb-9b69-4cd3-b865-3da1ec99eaf4`; Phase 14 sign-off with no interview regression reported | **PASS** |
| Case-study session runs and reports | Local READY `d0bfbfef-6f4d-4985-9822-61ab682c8ad0`; Phase 14 sign-off with no case-study regression reported | **PASS** |
| Pre-Phase-13 interview report at old URL | Prior Phase 13 green; Phase 14 did not change interview report routes | **PASS** (accepted on Phase 14 sign-off) |
| Pre-Phase-13 scenario report at old URL | Prior Phase 13 green; Phase 14 did not change scenario report routes | **PASS** (accepted on Phase 14 sign-off) |
| Legacy admin case at `/case-play/{id}` still plays | Untouched by Phase 14 pitch work; sign-off accepted | **PASS** (accepted on Phase 14 sign-off) |

---

## Section 4 — Phase 13 extensions made by Phase 14

Handoff list for anyone revising Phase 13. Sourced from each plan's `phase_13_extensions_declared`.

| Plan | Against | Extension | Landed in |
| --- | --- | --- | --- |
| 14-02 | 13-01 | `avatarEndFloor`; `firstTurnWindowSeconds` + `adjustableRangeSeconds`; `checkpointing` + `authoredInWizard`; pitch instance members | `lib/engine/types.ts` |
| 14-02 | 13-03 | Floor in `resolveTermination`; first-turn soft window in `buildTimeBudgetFragment` | `lib/engine/termination.ts`, `lib/engine/time-budget.ts` |
| 14-02 | 13-02 | `InputSnapshot` kind `pitch` | `lib/report/snapshot.ts` |
| 14-04 | 13-05 | Outcome composed into same schema-constrained evaluator call | `lib/engine/rubric.ts` |
| 14-04 | 13-05 | Optional `buildEvaluationImages` vision parts | `lib/engine/evaluation.ts` |
| 14-04 | 13-05 | `validateOutcome` + optional `postProcessScores` in runner | `lib/engine/evaluation-runner.ts` |
| 14-04 | 13-01 | `prompts.buildEvaluationImages?`, `postProcessScores?` on type config | `lib/engine/types.ts` |
| 14-05 | 13-02 | Four nullable columns: `slideHighWaterMark`, `slideReveals`, `timeBudgetSeconds`, `terminationAtSeconds` | `prisma/schema.prisma` + additive migration |
| 14-05 | 13-07 | `pitch-deck` gets `checkpointing: "client-driven"` (elevator `"none"`) | type records + `lib/engine/session.ts` |
| 14-05 | 13-07 | Checkpoint accepts `revealedSlideIndex` (monotonic ratchet); start accepts `timeBudgetOverrideSeconds` | `lib/engine/session.ts`, session routes |
| 14-10 | 13-09 | Page allows `instance.required && authoredInWizard` | `app/practice/[type]/page.tsx` |
| 14-11 | 13-06 | Chat ratchets reveal, loads slide text, appends admitted slice to **tail block** only | `app/api/interaction/chat/route.ts`, `lib/engine/prompts.ts`, `lib/pitch/slide-reveal.ts` |
| 14-13 | 13-10 | Shell: `extraChatBody`, `sessionPanelClassName`, `mediaLayout` (deck-primary PiP) | `components/practice/PracticeSessionShell.tsx` |
| 14-13 | 13-10 | `sessionPanel` + opening-turn timing (also used by elevator timer) | `PracticeSessionShell.tsx` (from 14-10) |
| 14-14 | 13-02 | DTO surfaces outcome / termination / slide / budget fields + pitch snapshot | `lib/report/dto.ts` |
| 14-14 | 13-12 | `ReportChrome` per-type extras slot for panels | `components/practice/ReportChrome.tsx` |

Plans 14-01, 14-03, 14-06, 14-07, 14-08, 14-09, 14-12 declare no new Phase 13 extensions (types/prompts/UI only, or deck pipeline outside the engine).

---

## Section 5 — Calibrations and open items

| Calibration | Current value | Tuned in Task 3? |
| --- | --- | --- |
| Slide-count length anchors | 8 slides → 1200s; 25 slides → 1800s; linear between (`lib/pitch/session-length.ts`) | **kept** — no change requested |
| Soft envelope | 20–30 min (`DECK_ENVELOPE_SECONDS`) | keep unless human asks |
| Early-end cap | `discovery_tailoring` max **2**/5 (`EARLY_END_CAP`) | **kept** — no change requested |
| `MAX_EVALUATOR_IMAGES` | **12** (`lib/engine/evaluation.ts`) | not tuned yet |
| Fair-value band | Ask-independent default `$800k–$1.2M` / `8–12%` equity (`DEFAULT_DECK_FAIR_VALUE_BAND`) | **kept** — no change requested |
| Slide image resolution | Long edge **1600px**; thumb width **240px** (`lib/deck/pdf-rasterize.ts`) | not tuned yet |
| Deck size limit | **25 MB** (`MAX_DECK_SIZE_BYTES`) | **kept** — no change requested |
| Disengagement cue wording | Elevator prompts: shorter/flatter replies; "so what's the ask?"; no time warning beat | **kept** — no change requested |
| Elevator soft window | 60s first-turn; conclude only on pitch-scale turns (`516f278`) | keep unless human asks |
| Avatar-end floor | `minAssistantTurns: 2` (elevator) | keep unless human asks |

---

## Section 6 — Gaps

_Empty — Phase 14 signed off with no FAIL rows. Deferred follow-ups below are not gaps._

### Known follow-ups (not gaps / not defects)

From `deferred-items.md` — do not implement in 14-15:

1. Walk-out temperature auto-end (14-10 human wish).
2. Broader non-investor deck pitch modes (14-13 human wish).
3. `verify-deck-intake.ts` fixture title mismatch (`Spike Deck Title` vs `Spike Deck Slide 1`) — pre-existing.

---

## Task 3 checklist (human)

**Done.** Human sign-off (2026-10-04):

> overall, i think we're good with 14-15

Supporting session notes from the same day: report generator works; investors can see slides after chat hydrate fix; finish path recovered after Prisma client refresh. No calibration changes requested.
