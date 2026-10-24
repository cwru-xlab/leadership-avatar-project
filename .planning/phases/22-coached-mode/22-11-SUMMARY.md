---
phase: 22-coached-mode
plan: 11
subsystem: study-plan/coached
tags: [coach, settings, guard]
requires: [22-02, 22-08]
provides:
  - app/api/settings/coach (GET, PUT, DELETE)
  - "Your coach" card on /settings
  - scripts/verify-coach-settings.ts
key-files:
  created:
    - app/api/settings/coach/route.ts
    - scripts/verify-coach-settings.ts
  modified:
    - app/settings/page.tsx
key-decisions:
  - "PUT validates the avatar+voice pair against the live interviewers roster (called in-process) or the exact DEFAULT_COACH pair; the stored name is the roster's first word, never the client's"
requirements-completed: [REQ-113]
completed: 2026-10-23
---

# Phase 22 Plan 11: Coach Settings Summary

Students choose a coach once in Settings (roster picker with still previews, reset to default); the coached flow stays picker-free and resolves the coach server-side.

## Tasks

1. Settings API route and card - commit dacc790
2. Guard battery - commit 7efac08

## Verification

- `npx tsc --noEmit`: no errors in the touched files (scoped, since 22-10 was mid-edit).
- `DATABASE_URL=...leadership_avatar_dev npx tsx scripts/verify-coach-settings.ts`: exit 0, DB section RUN, bite-proof passes.
- `verify-coached-entry.ts` Section 1: still exactly one matching route.
- Live curl of `/api/settings/coach`: NOT completed. The dev server answered 307 (auth redirect) to an unauthenticated request and no student credentials were available to log in; route behavior is covered by source assertions and the DB section, not an HTTP run. PUT validation against the live vendor roster was likewise not exercised over HTTP.

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Issues

Files added later by 22-14/22-15 under the coached flow are re-checked in 22-16.

## Self-Check: PASSED

- FOUND: app/api/settings/coach/route.ts, app/settings/page.tsx, scripts/verify-coach-settings.ts
- FOUND commits: dacc790, 7efac08
