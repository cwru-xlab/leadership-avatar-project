---
quick: 006
subsystem: ui
tags: [nextjs, react, heroui, modal, routing, study-plan]

requires:
  - quick: 005
    provides: per-plan interview selection picker (report ids, cap, recent-N default) on /reports
provides:
  - interview picker relocated into a HeroUI Modal opened by "Generate study plan"
  - app/study-plans/[planId]/page.tsx — a saved study plan's own URL route
  - components/study-plan/PlanContent.tsx — PlanContent extracted to a shared component
affects: [reports-page, study-plan-path-surface]

tech-stack:
  added: []
  patterns:
    - "Picker-as-modal: a generation picker now opens as an intermediate-step
       modal (@heroui/modal, already a project dependency) rather than
       living permanently in the page body; the modal closes only on
       generation success."
    - "Saved-entity-gets-its-own-route: a saved study plan now has a
       dedicated URL (/study-plans/[planId]) following the same
       auth/loading/404 client-fetch conventions as its checks/coached
       children, instead of folding open inline via local state on a list
       page."

key-files:
  created:
    - app/study-plans/[planId]/page.tsx
    - components/study-plan/PlanContent.tsx
  modified:
    - app/reports/page.tsx
    - scripts/verify-path-surface.ts

key-decisions:
  - "Used the project's existing @heroui/modal (Modal/ModalContent/ModalHeader/ModalBody/ModalFooter/useDisclosure) rather than introducing a new dependency — already used in 10+ other pages/components."
  - "generatePlan() now returns a boolean so the modal-only wrapper (generateFromPicker) can close the modal on success only, keeping a failure's error message visible inside the open modal."
  - "PlanContent extracted to components/study-plan/PlanContent.tsx (previously a local, unexported function on app/reports/page.tsx) so both the /reports draft-preview card and the new /study-plans/[planId] page can render it without duplication."
  - "verify-path-surface.ts's 'PathPanel is wired into the reports page' assertion was repointed (not weakened) to assert PathPanel wiring on app/study-plans/[planId]/page.tsx instead, per the task's explicit instruction that this one legitimately moves; its bite-proof pattern was preserved and a new existence check for the destination file was added."

requirements-completed: []

duration: ~45min
completed: 2026-10-21
---

# Quick Task 006: Study Plan Modal + Own Page Summary

**Moved the "Choose which interviews to use" picker into a HeroUI modal gated behind "Generate study plan", and gave a saved study plan its own route at `/study-plans/[planId]` instead of folding open inline on `/reports`.**

## What moved

1. **The interview picker is now a modal.** Pressing "Generate study plan" on `/reports` opens a `Modal` titled "Choose which interviews to use" (HeroUI's existing `@heroui/modal` — no new dependency). All quick-005 behavior is unchanged and lives inside the modal: the list shows type/date/content-score/behavioral-score per eligible interview, preselects the most recent `MAX_REPORTS_PER_PLAN` (10), disables further selection at the cap with the visible reason "Cap reached — deselect one first" (never silently ignoring clicks), and sends `{ reportIds }` on generation. The modal closes automatically on a *successful* generation (so the preview card renders immediately below, still on `/reports`); a failure keeps the modal open with `actionError` visible inside it rather than closing and hiding the problem.

2. **A saved study plan has its own URL.** `app/study-plans/[planId]/page.tsx` is new. It fetches via the existing `GET /api/study-plans/[planId]` and owns everything the old inline `viewedPlan` block on `/reports` used to: title, saved date, source-report count, summary, `PlanContent`, and the `PathPanel` + generate-a-path action, with the exact same isolated path-loading/error state the inline block had (a path fetch failure never blocks the plan content above it). It follows the same auth/404/loading conventions as its `checks/[checkId]` and `coached/[stepId]` children: a client fetch, 401 → sign-in prompt, 404 → "not available" message with a way back, no automatic redirect.

   `PlanContent` (previously a local, unexported function inside `app/reports/page.tsx`) was extracted to `components/study-plan/PlanContent.tsx` so both the `/reports` draft-preview card and the new saved-plan page share one implementation with no duplicated markup.

## What stayed on `/reports`, and why

- **Generation** (now triggered via the modal) — still owned by `/reports` because that's where the "Build a self-paced study plan" entry point and the preview-and-save flow live.
- **The preview-and-save flow** (the "Preview — not saved yet" card, Discard/Save buttons) — unaffected; still renders on `/reports` right after a successful generation.
- **The saved-plans list** ("Your study plans" section with each plan's title/date/themes) — unaffected; only its "View plan" button's behavior changed, from `viewPlan(planId)` fetching into local state to `router.push(\`/study-plans/${planId}\`)`.

Only *viewing one already-saved plan* moved off this page. `viewedPlan` state, the path-panel state (`path`, `pathLoading`, `pathError`, `generatingPath`, `degradedStepCount`), `fetchPath`, `generatePathForViewedPlan`, the `viewedPlan`-keyed `useEffect`, and the "Close" button were all deleted from `app/reports/page.tsx` along with the inline section that rendered them — per the task's explicit allowance to delete lines from this file.

## Verifier repointing — justification

`scripts/verify-path-surface.ts` Section 1 asserted two different things against `app/reports/page.tsx`:

1. **`PRE_EXISTING_SURFACE_MARKERS`** (`fetch("/api/study-plans"`, `"/api/study-plans/generate"`, `draftToken: preview.draftToken`, `priorityThemes`) — all four flows **stay** on `/reports` (loadPlans fetch, generate POST, the save flow's draft-token field, and priorityThemes rendering in the saved-plans list chips). Confirmed still present; this check still passes unmodified.
2. **"PathPanel is wired into the reports page (additive)"** — this is the one that legitimately moves, since `PathPanel` itself moved to the new saved-plan page. Added a new `runSection1Moved()` function that:
   - asserts `app/study-plans/[planId]/page.tsx` exists on disk (so a rename elsewhere can't pass by matching a stale substring against a missing file),
   - asserts `PathPanel` is wired into that file,
   - re-proves the bite-proof pattern (strip the marker from an in-memory copy, confirm detection fires).

   A comment was left at the original assertion's former location explaining why it was removed from Section 1 and where its replacement lives, so a future reader doesn't mistake this for a weakened guard.

Section 6 ("panel shape and live destinations") asserts the `checks/[checkId]` and `coached/[stepId]` destination pages exist on disk — those are `PathPanel`'s own link targets (`hrefForStep`'s KNOWLEDGE_CHECK/COACHED_SESSION cases), unrelated to where `PathPanel` itself is rendered from. Neither link target changed in this task, so Section 6 needed no edits; confirmed by re-running the full battery below.

## Gate results

- `npx tsc --noEmit` — clean, exit 0.
- `npx next build` — exit 0. Route table includes `ƒ /study-plans/[planId]` alongside its existing `ƒ /study-plans/[planId]/checks/[checkId]` and `ƒ /study-plans/[planId]/coached/[stepId]` children, with no slug collision (the Phase 21 hazard this task's instructions warned about).
- `npx tsx scripts/verify-path-surface.ts` (run with `DATABASE_URL` set) — **36/36 checks pass**, up from 33 passed / 1 failed before the repoint (the 1 failure was the un-repointed "PathPanel wired into reports page" check, confirming the move needed exactly this fix). All four REQ-120 markers still present on `app/reports/page.tsx`.
- `npx tsx scripts/verify-study-plan-selection.ts` — unmodified, 27/27 checks pass (ownership scoping, cap refusal, recent-N default, 413-reachable-only-on-no-selection all intact).
- `npx tsx scripts/verify-moment-boundary.ts` — unmodified, 22/22 checks pass (frozen `lib/study-plan/generate.ts` boundary untouched; `lib/study-plan/generate.ts` was not edited by this task).
- `npx tsx scripts/verify-check-taking-surface.ts` — unmodified, all sections pass ("ALL PASS").
- `npx tsx scripts/verify-coached-runtime-surface.ts` — unmodified, all sections pass ("ALL SECTIONS PASSED").

## `/reports` diff

```
git diff --numstat -- app/reports/page.tsx
112	327	app/reports/page.tsx
```

112 insertions, 327 deletions. The deletions are: the local `PlanContent` function body (now imported from the shared component), the inline picker `Card` (its JSX moved into the new `Modal`), `viewedPlan` state and its setter calls, the path-panel state block (`path`/`pathLoading`/`pathError`/`generatingPath`/`degradedStepCount`), `fetchPath`, `generatePathForViewedPlan`, the `viewedPlan`-keyed `useEffect`, the entire inline `viewedPlan` JSX section (title/date/summary/`PlanContent`/`PathPanel`/"Close" button), and the `PathPanel`/`DegradedStepsNote` imports. The insertions are: the `Modal`/`useDisclosure` import, the `useDisclosure()` hook call, the `Modal`/`ModalContent`/`ModalHeader`/`ModalBody`/`ModalFooter` JSX wrapping the (otherwise unchanged) picker markup, the `generateFromPicker` wrapper, and the one-line `viewPlan` replacement (`router.push`).

## Decisions made

- `generatePlan()` changed from `Promise<void>` to `Promise<boolean>` purely so the modal wrapper can decide whether to close — no change to its request/response handling, error messages, or the `GeneratedPreview` shape it sets.
- Kept `viewPlan` as a function name (rather than inlining `router.push` at the call site) to minimize the diff at that call site and preserve the existing naming the saved-plans list already used.

## Issues encountered

None — `npx tsc --noEmit` and `npx next build` were both clean on the first attempt after the restructuring; no auto-fixes were needed under Rules 1-3.

## Deviations from Plan

None — plan executed as specified in the task brief. The one verifier repointing (`scripts/verify-path-surface.ts`) was explicitly called for and authorized by the task brief itself (section C), not a deviation.

---
*Quick task: 006-study-plan-page-and-modal*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: app/study-plans/[planId]/page.tsx
- FOUND: components/study-plan/PlanContent.tsx
- FOUND: .planning/quick/006-study-plan-page-and-modal/006-SUMMARY.md
- FOUND commit: 1eeb762 (feat(quick-006): move interview picker into a modal, give saved plans their own URL)
- FOUND commit: 86ae306 (test(quick-006): repoint PathPanel wiring assertion to the saved-plan page)
