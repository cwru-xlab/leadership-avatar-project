---
phase: 21-adaptive-mastery-path
plan: 23
subsystem: study-plan
tags: [coached-practice, engine-reuse, mastery-ledger, s3-transcript, prisma]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "createCoachedSession/readCoachedSession/finishCoachedSession and the engine-relationship decision (21-12); techniquesForCompetency/assertTipSafe and recordCoachedContribution (21-16); the path container and markStepComplete (21-08); contributionInputsFromScoreMap/recordLiveSessionContributions, the single report-to-competency mapper with its coached-session skip guard (21-21)"
provides:
  - "lib/study-plan/coached/runtime.ts: enterCoachedStep(), advanceToFresh(), completeCoachedSession(), tipsForLeg(), nextLeg() — the REPLAY-to-FRESH orchestration and its pure leg-transition rule"
  - "app/api/study-plans/path-steps/[stepId]/coached/route.ts: the single HTTP entry point into coached mode (POST/GET/PATCH, keyed by stepId only)"
  - "scripts/verify-coached-entry.ts: entry-surface, leg-ordering, tip-gate/finish-sequence, and end-to-end database battery"
affects: [21-24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A pure nextLeg(current, action) table factored out of the two transition functions, so the full REPLAY/FRESH/COMPLETE ordering is provable with no database and provably catches a deliberately-permissive variant"
    - "CoachedSession.reportId is overwritten twice across a session's life: once by advanceToFresh (the REPLAY leg's own report, purely to flip the derived phase to FRESH) and again by finishCoachedSession (the FRESH leg's report, the one 21-16's contribution writer actually maps)"
    - "Discard-and-retry (never repair) applied to a second generation surface: the fresh-scenario model call is gated through the same validateTip/assertTipSafe rejector 21-16 built for tips, with a bounded retry loop rather than a hard failure on first rejection"

key-files:
  created:
    - lib/study-plan/coached/runtime.ts
    - app/api/study-plans/path-steps/[stepId]/coached/route.ts
    - scripts/verify-coached-entry.ts
  modified: []

key-decisions:
  - "The S3 transcript read lives in runtime.ts, not instance.ts — both to select the replay target (reading scores to find the weakest-scoring source report) and to render/verify the replay moment on every call, matching the accessor lib/study-plan/checks/sources.ts (21-25) already uses (s3Storage.getInterviewTranscript)"
  - "advanceToFresh's replayReportId argument is written into CoachedSession.reportId as the FRESH-phase marker (reportId set => FRESH per 21-12's derivation), then completeCoachedSession's finishCoachedSession call overwrites the same column with the FRESH leg's own report id — documented explicitly in both functions' headers so a future reader does not mistake it for two independent fields"
  - "tipsForLeg always resolves the replay transcript turn, on EVERY leg, and passes it as assertTipSafe's studentLine context even on FRESH — the tip gate's anti-echo rule must still guard against a tip echoing the original REPLAY line scaffolding the FRESH scenario"
  - "generateFreshScenarioPrompt uses the non-throwing validateTip (not assertTipSafe) internally, in a bounded 4-attempt discard-and-retry loop, before persisting via createCoachedSession — a real model call against the real rejector showed a hard first-rejection failure would make entry permanently fail for a step whenever the model phrased a scenario with a quoted term or ran long; see Deviations"

patterns-established:
  - "Pattern: a leg/phase-ordering rule factored into one pure exported function (nextLeg) that both the real code and the verifier's inverted assertion call, so a later permissive edit is caught by the same mechanism the real functions use to reject it"

requirements-completed: []

# Metrics
duration: ~70min
completed: 2026-10-21
---

# Phase 21 Plan 23: Coached Session Runtime and Entry Route Summary

**`lib/study-plan/coached/runtime.ts` and its single route make a `COACHED_SESSION` path step actually enterable — deterministic replay-moment selection with the S3 transcript read here (not in 21-12's `instance.ts`), every returned tip re-gated through `assertTipSafe` including library entries, a pure `nextLeg()` table locking REPLAY-then-FRESH, and completion that calls `finishCoachedSession` before `recordCoachedContribution`, confirmed end-to-end not to double-count against `LIVE_SESSION`.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-10-21
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- **`lib/study-plan/coached/runtime.ts`** (621 lines) ships:
  - `enterCoachedStep({ userId, stepId }, { createIfMissing })` — loads the user-owned `COACHED_SESSION` step; on first entry, selects the replay target deterministically (lowest normalized per-competency score among the owning study plan's `sourceReportIds`, computed via 21-21's own `contributionInputsFromScoreMap` with zero reimplementation, tied-broken by most-recent-report, then the first non-empty student turn in that report's transcript), generates and tip-gates the fresh scenario, and calls 21-12's `createCoachedSession`; on resume, re-reads the existing session. `createIfMissing: false` (used by the route's GET) throws `CoachedSessionNotStartedError` instead of creating — a browser prefetch can never start a session.
  - The S3 transcript read — deliberately kept out of `instance.ts` by 21-12 — lives here, via the same `s3Storage.getInterviewTranscript` accessor `lib/study-plan/checks/sources.ts` (21-25) uses. The replay moment's text is returned `===`-byte-identical to the stored turn; a missing transcript/turn throws `ReplayMomentUnavailableError`, never a paraphrase.
  - `tipsForLeg()` draws from 21-16's `techniquesForCompetency`, then runs `assertTipSafe` over **every** returned tip — including library ones — dropping and logging (never repairing) any that fail. Selection is the library's own stable order, sliced, so re-entering the same leg shows the same reminders.
  - `nextLeg(current, action)` — a pure, exported leg-transition table (REPLAY+advance→FRESH; FRESH+complete→COMPLETE; every other pair→REJECTED) that both `advanceToFresh` and `completeCoachedSession` consult before doing anything else, so the REPLAY-then-FRESH ordering can never silently drift from what the table says.
  - `completeCoachedSession` calls `finishCoachedSession` (21-12) **then** `recordCoachedContribution` (21-16), exactly once each — `runtime.ts:615-616`, with the mandatory-order rationale (the contribution writer requires `completedAt`/`reportId` and throws otherwise) documented in the comment block immediately above (lines ~586-594).
- **`app/api/study-plans/path-steps/[stepId]/coached/route.ts`** (241 lines) is the **only** HTTP entry into coached mode, keyed by `stepId` alone. POST enters/resumes (201, 404 on missing/wrong-kind/not-owned, 409 on an unreadable transcript); GET reads with `createIfMissing: false` (404 if never entered, never creates); PATCH advances (`action: "advance"`) or completes (`action: "complete"`) with 409 + current leg on an out-of-order call and 400 on an unknown action. No verb accepts a `coachedSessionId` from the request body on any path — it is always resolved from the owned step.
- **`scripts/verify-coached-entry.ts`** (676 lines) is a 4-section battery:
  1. **Entry surface** — walks 103 `route.ts` files under `app/api/` (non-vacuous, `>10` asserted) and proves exactly one mentions `enterCoachedStep`/`completeCoachedSession`, and that it is this plan's route; re-runs 21-12's practice-tree negative guard (81 files under `components/practice/`+`app/practice/`, none import `@/lib/study-plan/coached` or mention `CoachedSession`/`coachTip`/`techniqueReminder`/`COACHED_PHASES`).
  2. **Leg ordering** — asserts the full 6-row transition table against the real `nextLeg`, then an **inverted assertion**: a deliberately-permissive variant that lets REPLAY+complete reach COMPLETE is proven to be *caught* by the same table comparison.
  3. **Tip gate and finish sequence** — proves `assertTipSafe` and `techniquesForCompetency` both occur inside `tipsForLeg`'s body; proves `finishCoachedSession(` and `recordCoachedContribution(` each occur exactly once as a *call* (matched with a trailing paren so the named-import line never counts) and that the former's index precedes the latter's; proves no `prisma.interactionReport.create` anywhere in the file.
  4. **End to end (database, ran — not SKIP)** — against a scratch user with a weak- and a strong-scored source report, proves the weak one is selected deterministically, the replay text is `===` to the stored transcript, a second entry is idempotent (same session, same moment, same tips), wrong-kind/foreign-user/premature-`markStepComplete` all throw, `completeCoachedSession` from REPLAY throws and writes nothing, `advanceToFresh`→`completeCoachedSession` writes exactly one `COACHED_SESSION` row at weight `0.40` (strictly below `LIVE_SESSION`'s `1.00`), a retried complete adds no further row, and — the load-bearing check — calling 21-21's real `recordLiveSessionContributions` against the coached session's own report confirms `skipped: "coached-session"`, `written: 0`, with zero `LIVE_SESSION` rows for that report.

## Task Commits

Each task was committed atomically, with an explicit pathspec per the concurrency constraint:

1. **Task 1: Build the REPLAY-to-FRESH orchestration** — `97d102d` (feat)
2. **Task 2: Add the path-step-only entry route** — `05195b8` (feat)
3. **Task 3: Verifier — entry, ordering, tip gating, finish sequence** — `25cc220` (test; includes the Rule-1 fix below)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `lib/study-plan/coached/runtime.ts` — `enterCoachedStep`, `advanceToFresh`, `completeCoachedSession`, `tipsForLeg`, `nextLeg`, `CoachedLegView`, and the error classes (`ReplayMomentUnavailableError`, `NoEligibleReplayTargetError`, `CoachedSessionNotStartedError`, `CoachedLegOrderError`).
- `app/api/study-plans/path-steps/[stepId]/coached/route.ts` — `POST`/`GET`/`PATCH`.
- `scripts/verify-coached-entry.ts` — the four-section verifier described above.

## Decisions Made

See `key-decisions` in the frontmatter above. The most consequential one operationally: `CoachedSession.reportId` is overwritten twice in a session's life (once by `advanceToFresh` purely to flip the derived phase to FRESH, once by `finishCoachedSession` with the leg that actually gets scored) — both call sites carry a comment pointing at the other so the reuse reads as deliberate, not a bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The fresh-scenario model call could produce output `assertTipSafe` correctly rejects, with no retry, permanently blocking entry**
- **Found during:** Task 3, running Section 4 against the real database and the real OpenAI call (no stub — this plan's `generateFreshScenarioPrompt` always calls the live model)
- **Issue:** The model's scenario text occasionally contained a 4+ word quoted span (`CONTAINS_QUOTED_SPEECH`) or ran past `MAX_TIP_LENGTH` (240 chars, calibrated for short technique reminders, not a 2-4 sentence scenario). As originally written, `generateFreshScenarioPrompt` called `assertTipSafe` once and threw on the first rejection — meaning `enterCoachedStep` (and therefore the only way into coached mode for that step) could fail outright on ordinary, non-scripting model phrasing, with REQ-113's "a student has a way in" at risk.
- **Fix:** Switched to the non-throwing `validateTip` in a bounded 4-attempt discard-and-retry loop (mirroring 21-16's own documented tradeoff: a rejected-but-fine generation costs one regeneration), and tightened the system/user prompts to request exactly one plain sentence under 220 characters with no quotation marks. Confirmed working against the real model and the real rejector in the same test run.
- **Files modified:** `lib/study-plan/coached/runtime.ts`
- **Verification:** `npx tsx scripts/verify-coached-entry.ts` Section 4 — `enterCoachedStep` succeeds on the first attempt in the common case and recovers via retry when a generation is rejected; full run exits 0.
- **Committed in:** `25cc220` (bundled with Task 3, caught by and fixed for that task's own end-to-end run)

---

**Total deviations:** 1 auto-fixed (Rule 1 — a real, reproducible blocking bug against the live model, not a hypothetical)
**Impact on plan:** None on scope. `tips.ts`'s `validateTip`/`assertTipSafe`/`MAX_TIP_LENGTH` (21-16, not in this plan's `files_modified`) were used exactly as shipped, unmodified — the fix is confined to how `runtime.ts` calls them (retry) and what it asks the model for (shorter output), not to the rejector itself.

## Issues Encountered

None beyond the self-caught fix above. `npx tsc --noEmit` is clean for this plan's three files (the only non-empty `tsc` output anywhere in the tree is pre-existing, uncommitted, unrelated-sibling noise in `scripts/verify-next-step.ts` / `lib/mastery/mastery-dto.ts`, confirmed via `git status --short` as untracked work belonging to other in-flight plans, not touched).

## Verification Evidence

- `npx tsx scripts/verify-coached-entry.ts` — **exit 0**. Section 1: 103 routes walked (`>10` non-vacuous), exactly one match (`app/api/study-plans/path-steps/[stepId]/coached/route.ts`); 81 practice-tree files walked, zero leaks. Section 2: full 6-row `nextLeg` table holds; the deliberately-permissive variant is caught (table does NOT hold against it). Section 3: `assertTipSafe`/`techniquesForCompetency` confirmed inside `tipsForLeg`'s body; `finishCoachedSession(`/`recordCoachedContribution(` each appear exactly once, with the former's index less than the latter's; zero `prisma.interactionReport.create`. Section 4 (DB, ran — not SKIP): all entry/idempotence/ordering/double-count checks passed, including the headline one — **`recordLiveSessionContributions` returned `skipped: "coached-session"`, `written: 0` for the coached session's own report, with zero `LIVE_SESSION` rows for it** (21-21's guard confirmed to hold, end-to-end, through the real coached flow — not fixed, nothing to escalate: the guard held on first try).
- `npx tsc --noEmit` — clean for `lib/study-plan/coached/runtime.ts`, `app/api/study-plans/path-steps/[stepId]/coached/route.ts`, and `scripts/verify-coached-entry.ts` (zero matching output).
- `npm run build` — succeeds; `/api/study-plans/path-steps/[stepId]/coached` appears in the route manifest.
- `npx tsx scripts/verify-coached-mode-isolation.ts`, `scripts/verify-coach-tips.ts`, `scripts/verify-path-model.ts`, `scripts/verify-engine-surface-count.ts`, `scripts/verify-knowledge-check-surface.ts` — all exit 0 (the last one's `ENGINE_IMPORT_CARVE_OUTS` guard, the only thing authorizing this plan's `lib/engine/registry.ts` import, confirmed still correct and still biting on a planted offender).
- `git diff --name-only -- lib/engine/` over this plan's commits — empty. Nothing under `lib/engine/` was modified by this plan (a separate, concurrent sibling plan's commit to `lib/engine/evaluation-runner.ts` is visible in the phase-wide range but is not this plan's change).

## Requirements Status

**REQ-113 and REQ-114 are intentionally left Pending.** Both require the student-facing shell: REQ-113's "a student can actually **START**" and REQ-114's "experiences REPLAY FIRST, THEN FRESH" are both conditions on what a **student observes**, not on what the server can do. This plan makes both true at the API layer (a POST against an owned step creates a session and returns REPLAY; PATCH cannot reach FRESH before REPLAY, cannot complete before FRESH) — but with no UI calling this route yet, neither is student-observable. That shell is **21-24** (wave 6). This is the same split 21-16 and 21-13 already recorded for REQ-115/REQ-105 respectively, and the same reasoning 21-12 used when it worded REQ-113/REQ-114 this way in the first place.

**REQ-122 is also left Pending** for the same reason, specific to the `COACHED_SESSION` third of its text ("a `COACHED_SESSION` step leads to a startable coached session") — 21-22 already left REQ-122 Pending for its own (`KNOWLEDGE_CHECK`-only) reason, and this plan does not change that: REQ-122 needs a rendered action a student can click, and no `PathPanel`/path UI exists yet to click from.

Per this execution's requirement-marking rule (commit `4b3fa16`), this plan does not run `requirements mark-complete` for any of its three claimed IDs. The Earned-Completes set as of this plan remains REQ-104, 108, 109, 110, 111, 112, 117, 118, 123 — unchanged by this plan.

## Noted, Not Mine

`deferred-items.md` (commit `5b0e202`) records an unrelated hazard: 21-14's `PLACEHOLDER_KNOWLEDGE_CHECK_ID` being un-guarded. Noted here only so it is not mistaken for this plan's finding — it is not in this plan's `files_modified` and was not touched.

## User Setup Required

None. The local dev database is migrated and `DATABASE_URL`-backed; Section 4 of `scripts/verify-coached-entry.ts` ran against it (not SKIP). A real `OPENAI_API_KEY` was used for the fresh-scenario generation call exercised in that same run.

## Next Phase Readiness

- `lib/study-plan/coached/runtime.ts`'s `enterCoachedStep`/`advanceToFresh`/`completeCoachedSession`/`tipsForLeg` and `app/api/study-plans/path-steps/[stepId]/coached/route.ts`'s `GET`/`POST`/`PATCH` are ready for **21-24** (the coached session shell and page) to call: enter on mount, poll `GET` for resume, render `replayMoment`/`tips`/`freshScenarioPrompt` per leg, `PATCH` to advance/complete.
- No blockers. `npx tsc --noEmit` is clean for every file this plan touches; `npx tsx scripts/verify-coached-entry.ts` and every sibling coached/engine-surface verifier exit 0 with DB-gated sections run, not skipped.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: `lib/study-plan/coached/runtime.ts`
- FOUND: `app/api/study-plans/path-steps/[stepId]/coached/route.ts`
- FOUND: `scripts/verify-coached-entry.ts`
- FOUND: commit `97d102d` (Task 1)
- FOUND: commit `05195b8` (Task 2)
- FOUND: commit `25cc220` (Task 3)
