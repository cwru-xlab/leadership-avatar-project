---
phase: 21-adaptive-mastery-path
plan: 24
subsystem: study-plan
tags: [coached-practice, ui, react, next-app-router, engine-reuse, sse]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "lib/study-plan/coached/runtime.ts's enterCoachedStep/advanceToFresh/completeCoachedSession/tipsForLeg and the single HTTP route app/api/study-plans/path-steps/[stepId]/coached/route.ts (21-23); the engine-relationship decision (21-12); the practice-tree isolation guard (21-12/21-17/21-23)"
provides:
  - "components/study-plan/CoachedSessionShell.tsx: the two-leg coached session shell — REPLAY presentation, tip rail, transition, FRESH leg, finish"
  - "app/study-plans/[planId]/coached/[stepId]/page.tsx: the authenticated, chrome-suppressed page a COACHED_SESSION path step links to"
  - "scripts/verify-coached-runtime-surface.ts: leg-gating, no-script-in-view, and separate-from-practice guards over the new files"
affects: [21-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A client surface that never locally sets a server-owned state machine's terminal values — the shell always re-reads the whole server object (legView) rather than assigning a local literal \"FRESH\"/\"COMPLETE\", which a source-level verifier can then prove by finding zero such literal calls rather than having to trust a convention"
    - "A coached session's live conversation is driven by the SAME generic engine session endpoints (/api/practice/session/start, /api/interaction/chat, /api/practice/session/finish) PracticeSessionShell.tsx calls, reimplemented as a minimal text-turn transport in a NEW file rather than imported from or lifted out of that component — see key-decisions below for the explicit scope line this draws"
    - "Poll the report GET endpoint for status READY after session/finish (which returns 202 and schedules evaluation via waitUntil) before handing a reportId to the coached PATCH route — session/finish completing is not the same event as the report having scores, and completeCoachedSession's contribution writer requires scores to exist"

key-files:
  created:
    - components/study-plan/CoachedSessionShell.tsx
    - app/study-plans/[planId]/coached/[stepId]/page.tsx
    - scripts/verify-coached-runtime-surface.ts
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "The live session area is a fresh, minimal TEXT conversation (not HeyGen avatar video) built directly against the engine's generic session-start/turn/finish endpoints, rather than importing, extending, or lifting shared transport out of components/practice/PracticeSessionShell.tsx. The plan's own task text permitted lifting reusable transport into a new shared module if genuinely needed; this plan judged the needed surface (three JSON/SSE calls against endpoints already generic across every interaction type) small enough to write fresh rather than factor out of a 1,866-line component whose own scope (HeyGen video/audio wiring, visual/vocal capture, disengagement UI, checkpointing) a coached session does not need. components/practice/ is provably untouched and un-imported (scripts/verify-coached-runtime-surface.ts section 3; git diff --name-only -- components/practice/ is empty)."
  - "Auth gating is NOT a separate fetch in the page (the plan requires the page do no fetching/DB access). CoachedSessionShell's own GET/POST against 21-23's route already surfaces 401, and the shell renders the sign-in prompt itself, matching KnowledgeCheckPage/KnowledgeCheckCard's existing precedent (a client fetch doubling as the auth check, not an automatic redirect) rather than inventing a second auth mechanism."
  - "Links to /mastery (finish screen) and /practice/{underlyingTypeSlug}/report/{reportId} (replay moment) are written per the plan's explicit instruction even though /mastery does not exist yet (21-18 is still incomplete) — this is expected to resolve once 21-18 ships, not a defect of this plan."

patterns-established:
  - "formatCompetencyLabel(key) — a tiny local string formatter used instead of importing lib/mastery/competencies.ts for a display label, because that module pulls in lib/engine/registry.ts, which must never reach a client bundle"

requirements-completed: [REQ-113, REQ-114, REQ-115]

# Metrics
duration: ~100min
completed: 2026-10-21
---

# Phase 21 Plan 24: Coached Session Shell and Page Summary

**`CoachedSessionShell.tsx` turns 21-23's coached runtime into a screen a student actually uses: REPLAY leg with the verbatim replayed moment and a separate technique-reminder rail, a server-only transition to FRESH, a FRESH leg that does not repeat the moment, and a finish screen naming how many competencies moved and that coached counts for less — with REPLAY→FRESH driven entirely by re-reading the server's leg, never a local literal.**

## Performance

- **Duration:** ~100 min
- **Completed:** 2026-10-21
- **Tasks:** 3
- **Files modified:** 3 created, 1 (`REQUIREMENTS.md`) modified

## Accomplishments

- **`components/study-plan/CoachedSessionShell.tsx`** (790 lines): mounts by GETting 21-23's route (POSTing to enter on a 404), renders REPLAY with the student's verbatim moment in a `whitespace-pre-wrap` `<blockquote>` (no trim/re-case/collapse) linked to `/practice/{underlyingTypeSlug}/report/{sourceReportId}`, a text-turn live session area, and a single "Done with the replay" control; renders a `<aside>` tip rail next to it showing only server-sent `tip.name`/`tip.reminder` pairs with exactly one standing explanatory line ("These name a technique to apply — they are not words to say"); renders FRESH without repeating the replay moment; renders COMPLETE naming `contributionsWritten` and the coached-counts-for-less disclaimer, linking to `/mastery` and `/reports`. The leg is **only ever** set from the server's own `CoachedLegView` object — there is no code path that assigns a local literal `"FRESH"` or `"COMPLETE"` anywhere in the file.
- **Live session transport** (new, not lifted from `PracticeSessionShell.tsx`): `POST /api/practice/session/start` (per leg, own `reportId`) → turn exchange against `POST /api/interaction/chat` (parses the shared SSE `data: {"type":"content","content":"<cumulative>"}` frames) → `POST /api/practice/session/finish`, then polls `GET /api/practice/report/[reportId]` for `status === "READY"` before PATCHing the coached route — because `session/finish` returns 202 and schedules evaluation asynchronously, and `completeCoachedSession`'s contribution writer needs scores to exist.
- **`app/study-plans/[planId]/coached/[stepId]/page.tsx`** (72 lines): the fixed URL 21-19 will link to. Sets `useLayout().setFullScreen(true)` (same mechanism `app/practice/[type]/[instanceId]/page.tsx` uses, set from this page only), renders the shell with no fetching/DB access of its own, and a "Leave coached session" link with copy confirming the session resumes.
- **`scripts/verify-coached-runtime-surface.ts`** (22 checks, 4 sections, no DB needed): proves zero local literal `FRESH`/`COMPLETE` leg-setter calls exist (so the "every occurrence has server context" rule holds vacuously and provably); exactly one `action: "advance"` and one `action: "complete"` PATCH value; `reminder` is only ever a type declaration or a `.reminder` read, with exactly one >40-char explanatory literal inside `TipRail` and it mentions "technique"; the practice tree is unmodified (`git diff` empty) and un-leaked in both directions; the fixed page path exists; `PathPanel.tsx`'s `/coached/` link is checked when it exists (SKIPped with an explicit note — 21-19 has not run yet); and `aria-live`/`<section>`/`<aside>` are present.

## Task Commits

1. **Task 1: Build the two-leg coached session shell** — `315c63b` (feat)
2. **Task 2: Add the coached session page** — `590802b` (feat)
3. **Task 3: Verifier — leg gating, no scripted tips in the view, separation from practice** — `1c17c04` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `components/study-plan/CoachedSessionShell.tsx` — the shell.
- `app/study-plans/[planId]/coached/[stepId]/page.tsx` — the page.
- `scripts/verify-coached-runtime-surface.ts` — the verifier.
- `.planning/REQUIREMENTS.md` — REQ-113/114/115 definition checkboxes and traceability rows flipped to Complete (see Requirements Status).

## Decisions Made

See `key-decisions` in the frontmatter. The most consequential one operationally: the live conversation area is a fresh, minimal text-turn implementation against the engine's already-generic session endpoints, not a reuse of `PracticeSessionShell.tsx`'s HeyGen video/audio pipeline — a deliberate, narrower scope decision, recorded here rather than left to be inferred from the diff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `grep -c 'whitespace-pre-wrap'` would have failed against an inline `style` object**
- **Found during:** Task 1, running the plan's own verify command
- **Issue:** The verbatim blockquote initially used `style={{ whiteSpace: "pre-wrap" }}` (matching `KnowledgeCheckCard.tsx`'s own pattern), but the plan's verify step greps for the literal substring `whitespace-pre-wrap`, which an inline style object never produces.
- **Fix:** Switched to the Tailwind utility class `whitespace-pre-wrap` on the `<blockquote>`, which is both greppable and behaviorally identical (same CSS property).
- **Files modified:** `components/study-plan/CoachedSessionShell.tsx`
- **Verification:** `grep -c 'whitespace-pre-wrap'` returns 1; `npx tsc --noEmit` clean.
- **Committed in:** `315c63b` (Task 1)

**2. [Rule 3 - Blocking] A doc comment's own prose would have tripped the page's `prisma|markStepComplete` verify grep**
- **Found during:** Task 2, running the plan's own verify command
- **Issue:** The page's module comment said "never calls `markStepComplete`" to explain the no-mutation contract — but the plan's verify step greps the whole file for that literal string, so the explanation itself was a false positive.
- **Fix:** Reworded the comment to describe the same guarantee without the literal identifier ("calls no step-completion function").
- **Files modified:** `app/study-plans/[planId]/coached/[stepId]/page.tsx`
- **Verification:** `grep -c 'prisma\|markStepComplete'` returns 0.
- **Committed in:** `590802b` (Task 2)

---

**Total deviations:** 2 auto-fixed (both Rule 1/3, caught by re-running the plan's own verify commands before committing — no scope creep, no architectural change).

## Issues Encountered

**Known limitation, not fixed (out of this plan's scope):** if a competency's `underlyingTypeSlug` resolves to an interaction type that requires an `instance` (case-study, difficult-conversation — per the engine's `instance.required` config), the generic `/api/practice/session/start` call this shell makes with only `{ typeSlug }` may be rejected for lacking that instance. The coached-engine decision document (`21-COACHED-ENGINE-DECISION.md`) marks `instance` as "N/A" for coached mode without resolving how an instance-requiring underlying type would supply one outside the setup wizard. This plan's shell handles the resulting error gracefully (surfaces the server's message via `liveError` rather than crashing) but does not solve the underlying architectural gap — doing so would be a Rule 4 (architectural) decision belonging to whichever plan first hits it in practice, not an inline fix here.

## User Setup Required

None. `DATABASE_URL` is set for local dev; the sibling verifiers this plan's `<verification>` section re-runs (`verify-coached-entry.ts`, `verify-coached-mode-isolation.ts`, `verify-coach-tips.ts`, `verify-levels-goals.ts`) all ran their DB-gated sections (not SKIP) when invoked with `DATABASE_URL` exported, and all pass.

## Verification Evidence

- `npx tsx scripts/verify-coached-runtime-surface.ts` — **exit 0**, 22 checks, all `ok`.
- `DATABASE_URL=... npx tsx scripts/verify-coached-entry.ts` — exit 0, all 4 sections (DB section ran, not SKIP).
- `DATABASE_URL=... npx tsx scripts/verify-coached-mode-isolation.ts` — exit 0 (DB section ran).
- `DATABASE_URL=... npx tsx scripts/verify-coach-tips.ts` — exit 0 (DB section ran).
- `DATABASE_URL=... npx tsx scripts/verify-levels-goals.ts` — exit 0, 43 checks (DB section ran).
- `git diff --name-only -- components/practice/ app/practice/ lib/engine/` — empty.
- `npm run build` — succeeds; `/study-plans/[planId]/coached/[stepId]` appears in the route manifest.
- `npx tsc --noEmit` — clean across the whole repo.

## Requirements Status

**REQ-113, REQ-114, REQ-115 marked Complete** (definition checkboxes and traceability rows both flipped — commit `4b3fa16`'s rule followed):
- **REQ-113** — a path-step entry point exists and works (the page + shell call 21-23's route), and the negative guard (no normal practice entry point can reach coached mode) is re-proven by this plan's own verifier section 3, on top of 21-12/21-23's prior proofs.
- **REQ-114** — a student can now observably complete a coached session: REPLAY is shown first (verbatim moment, live rework), the only forward control PATCHes `advance` and is gated behind this leg's own session finishing and scoring, FRESH is then shown and cannot be reached any other way, and completion PATCHes `complete` and re-reads the server's leg rather than assuming it.
- **REQ-115** — every tip rendered is read directly off the server's already-`assertTipSafe`-gated response; the verifier proves `reminder` is never composed, templated, or defaulted in the view.

**REQ-116 intentionally left Pending**, per the orchestrator's explicit instruction and consistent with its own wording: "the student can complete a coached session and then see the figure change **on the mastery surface**." This plan's finish screen states the figure moved (the student-visible half), but the mastery surface itself (`/mastery`) is 21-18's deliverable and has not shipped yet (21-18 is still in `incomplete_plans`) — REQ-116 cannot be genuinely true end-to-end until that surface exists.

**REQ-122 left Pending**, as instructed — it is 21-19's (wave 7) to close, and this plan's verifier explicitly SKIPs the `PathPanel.tsx` check with a note rather than asserting anything about a file that does not exist yet.

Earned-Completes set after this plan: REQ-104, 108, 109, 110, 111, 112, 113, 114, 115, 117, 118, 123.

## Next Phase Readiness

- `app/study-plans/[planId]/coached/[stepId]/page.tsx` is the exact URL 21-19's `PathPanel` must link to for every `COACHED_SESSION` step — no segment renaming needed on 21-19's side.
- `components/study-plan/CoachedSessionShell.tsx` is self-contained (no props beyond `planId`/`stepId`) and ready to be linked to from anywhere.
- No blockers for 21-19. The one open item (instance-requiring underlying types, see Issues Encountered) is a pre-existing architectural gap in the coached-engine decision, not something 21-19 needs to resolve to ship its own panel.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: `components/study-plan/CoachedSessionShell.tsx`
- FOUND: `app/study-plans/[planId]/coached/[stepId]/page.tsx`
- FOUND: `scripts/verify-coached-runtime-surface.ts`
- FOUND: commit `315c63b` (Task 1)
- FOUND: commit `590802b` (Task 2)
- FOUND: commit `1c17c04` (Task 3)
