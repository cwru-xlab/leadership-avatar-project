# Phase 11 Plan 03: API Caller Map (re-verified post-11-01)

Re-verified 2026-09-23 against the current tree (after 11-01's six page-tree deletions),
by re-running a grep per route against `app`, `lib`, `components`, `middleware.ts`. Starting
point was `11-RESEARCH.md` Section B; every row below was independently re-checked, not
copied blind. No API route file has been touched — all 15 route files below are still
present on disk.

## `/api/cohort/*`

| Route | Call sites BEFORE 11-01 | Call sites NOW | Verdict |
|-------|--------------------------|-----------------|---------|
| `POST /api/cohort/add` | `lib/cohort-storage.ts:55`, called only from `app/codes/page.tsx` | `lib/cohort-storage.ts:55` still contains the fetch call, but `app/codes/page.tsx` no longer exists and nothing else calls `cohortStorage.add` | **Zero live callers.** |
| `PUT /api/cohort/edit` | `lib/cohort-storage.ts:75`, called only from `app/codes/[codeId]/edit/page.tsx` | Same fetch call still in `lib/cohort-storage.ts:75`; the only page that ever called `cohortStorage.edit` is deleted | **Zero live callers.** |
| `POST/DELETE /api/cohort/delete` | `lib/cohort-storage.ts:146`, called only from deleted `/codes` pages | Fetch call still present in `lib/cohort-storage.ts:146`; no caller remains | **Zero live callers.** |
| `GET /api/cohort/get` | (1) `app/join/[accessCode]/page.tsx:48` (2) `app/case-play/[caseId]/page.tsx:308`, gated on `cohortId` truthy (3) `lib/cohort-storage.ts:122,164` | (1) gone with `app/join/`. (2) `app/case-play/[caseId]/page.tsx:308` still calls it, inside a `useEffect` at lines 303-328 gated by `if (!user?.email || !cohortId || !caseId) return;`. `cohortId` (line 108) comes from `searchParams.get("cohortId") \|\| ""`; a repo-wide grep found no remaining code that ever sets a `cohortId` query param on a link to `/case-play/[caseId]`, so this branch cannot fire at runtime. (3) `lib/cohort-storage.ts:122,164` unchanged, no caller | **1 textual reference, 0 reachable callers.** (Not rounded to zero — the code path exists, it just cannot execute given no caller ever supplies `?cohortId=`.) |
| `POST /api/cohort/join` | `app/join/[accessCode]/page.tsx:126` | Page deleted, grep for `api/cohort/join` returns zero matches in `app`/`lib`/`components` | **Zero live callers.** |
| `GET /api/cohort/list` | `lib/cohort-storage.ts:97-98`, caller `app/codes/page.tsx` | Fetch call still present in `lib/cohort-storage.ts`; caller page gone | **Zero live callers.** |
| `POST /api/cohort/send-invitations` | `app/codes/[codeId]/edit/page.tsx:334` | Grep for `api/cohort/send-invitations` returns zero matches anywhere in `app`/`lib`/`components` | **Zero live callers.** |

## `/api/codes/*`

| Route | Call sites BEFORE 11-01 | Call sites NOW | Verdict |
|-------|--------------------------|-----------------|---------|
| `GET /api/codes/[codeId]/gradebook` | `app/codes/[codeId]/page.tsx:143`, `app/codes/[codeId]/gradebook/page.tsx:63` | Both pages deleted; repo-wide grep for `api/codes/` returns zero matches in `app`/`lib`/`components` | **Zero live callers.** |
| `GET /api/codes/[codeId]/learner-performance` | Zero callers found anywhere pre-Phase-11 | Still zero callers | **Zero live callers — already dead before Phase 11 started.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/detail` | `app/codes/[codeId]/student/[studentEmail]/page.tsx:594` | Page deleted | **Zero live callers.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/time-usage/[caseId]` | `.../time-usage/[caseId]/page.tsx:139` | Page deleted | **Zero live callers.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/score/[caseId]` | `.../score/[caseId]/page.tsx:154` | Page deleted | **Zero live callers.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/conversations/[caseId]` | `.../conversations/[caseId]/page.tsx:317` | Page deleted | **Zero live callers.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/learning-curve/[caseId]` | `.../learning-curve/[caseId]/page.tsx:229` | Page deleted | **Zero live callers.** |

A single repo-wide grep for `api/codes/` across `app`, `lib`, `components` confirms zero
matches — every route in this group, individually and collectively, is unreferenced. The
route files themselves are still present on disk (verified via `ls app/api/codes`).

## `/api/student/cases`

| Route | Call sites BEFORE 11-01 | Call sites NOW | Verdict |
|-------|--------------------------|-----------------|---------|
| `GET /api/student/cases` | Zero callers found anywhere in `app`, `lib`, `components` — not even from a now-deleted page | Still zero callers; the only reference anywhere is the route's own entry in `middleware.ts:193`'s `STUDENT_ROUTES` array (an auth-gate registration, not a caller) | **Zero live callers today, before or after Phase 11.** Reads S3 cohort data via `s3Storage.listCohorts()`, gates privileged callers with the `isPrivileged` (`admin`/`professor`) pattern. |

## Adjacent items whose fate tracks these routes

- **`lib/cohort-storage.ts`** — client-side fetch wrapper around `/api/cohort/*`
  (`add`/`edit`/`delete`/`get`/`list`). A repo-wide grep for `cohortStorage\.` across `app`,
  `lib`, `components` returns **zero matches** — every one of its importers (`app/codes/**`)
  was deleted in 11-01. It is dead code today, kept only because the API routes it wraps are
  still pending this checkpoint's decision. Its fate should track `/api/cohort/*`'s: if the
  user deletes all of `/api/cohort/*`, this file has no reason to exist either.

- **`types/cohort.ts`** — grep for `types/cohort` across `app`, `lib`, `components` returns
  exactly two hits: `app/api/cohort/add/route.ts:3` (`import type { Cohort } from
  "@/types/cohort"`) and `lib/s3-client.ts:31` (`import type { Cohort } from
  "@/types/cohort"`). `lib/s3-client.ts` is explicitly out of scope for this plan (shared
  storage class serving avatars/chat/profiles/cases/interaction-logs, not being touched) and
  its import survives regardless of what happens to `/api/cohort/*`. **Conclusion:
  `types/cohort.ts` cannot be deleted in this plan under any per-route decision, because
  `lib/s3-client.ts` keeps needing it.** It stays no matter what the user decides on the
  routes above.

- **`PUBLIC_ROUTES` entries `/api/cohort/join` and `/api/cohort/get`** — currently at
  `middleware.ts:70-71`. CONTEXT.md grants Claude discretion here, but the finding is
  security-relevant enough that research recommended asking anyway: after the 11-01 page
  deletions, nothing on any auth path needs either entry to be public.
  `/api/cohort/join`'s only caller was the now-deleted `/join/[accessCode]` page.
  `/api/cohort/get`'s one surviving textual reference (`case-play`, see above) is already
  behind an authenticated route (`/case-play` requires login via `STUDENT_ROUTES`), so
  public access was never required for that caller either. Recommend removing both entries
  from `PUBLIC_ROUTES` regardless of the per-route keep/delete decision on the underlying
  routes themselves — an admin-gated-but-still-reachable-unauthenticated route is a
  materially different security posture than admin-gated, and the caution CONTEXT.md
  expressed was about deletion risk, not about tightening an unnecessarily public gate.
