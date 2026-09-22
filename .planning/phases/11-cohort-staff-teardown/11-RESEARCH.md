# Phase 11: Cohort & Staff Teardown - Research

**Researched:** 2026-09-22
**Domain:** Next.js App Router codebase archaeology — dead-code identification, route
deletion, and a role-model refactor, in a repo with no working `eslint`.
**Confidence:** HIGH (this research is a direct filesystem/grep audit of the actual repo,
not library research — every claim below is traceable to a `grep`/`cat` command run against
`/Users/ajabreu79/projects/leadership-avatar-project` on 2026-09-22)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Removal depth**
- Delete the UI, keep the APIs. The staff/assignment PAGES are deleted from the repo:
  `/cohort-management/**`, `/codes/**`, `/teacher/**`, `/student-history`,
  `/join/[accessCode]`, and `components/cohort-card.tsx` (and any other component that
  exists only to serve them).
- API routes survive, admin-gated exactly as they are today — `/api/cohort/*`,
  `/api/codes/*`, `/api/student/cases`. The reason is caution, not a product requirement:
  the user is not certain what still calls them. Middleware's existing ADMIN gate is the
  protection; do not loosen it and do not add a new gate.
- CHECKPOINT REQUIRED — caller map before any API deletion. Research must produce a
  per-route caller map for every `/api/cohort/*`, `/api/codes/*` and `/api/student/cases`
  endpoint (who calls it, from where, on which path). Present that map to the user and let
  them decide per-route which proven-dead routes get deleted. Do NOT delete an API route on
  Claude's own judgment.
- Removed paths return a plain 404. No redirect map, no "this feature was removed" page, no
  special handling. Deleting the route file is the whole implementation.
- `/join/[accessCode]` and the public `/api/cohort/join` + `/api/cohort/get` entries in
  `PUBLIC_ROUTES`: remove the page; Claude decides on the two public API entries, removing
  them from `PUBLIC_ROUTES` unless something on the auth path depends on them. No
  access-code signup replacement — that is deferred.
- Live student code gets NEUTRALIZED, not restructured. In
  `app/api/scenario/add|edit|list`, `app/api/interaction/start`, and
  `app/case-play/[caseId]/page.tsx`, cohort fields stay present but are always
  null/ignored. Do not change request/response shapes or refactor these files — they
  carry working Phase 9 and Phase 10 behavior and churn there is the main regression
  risk in this phase.
- The old `Attempt` / `CaseAssignment` tracking path: Claude's call. Trace whether
  anything on the live student path still reads `Attempt` or `/api/student/cases`;
  `ScenarioReport` and `InterviewReport` are the real record types now. Remove the old
  path only where nothing live reads it — and note that schema-level removal is out of
  scope regardless (see below).
- Final plan is a static sweep plus a human end-to-end walkthrough, matching the
  Phase 7–10 pattern: interview, case-play, student scenarios, and both report types
  must all still work after the removals.

**Database fate**
- The Prisma schema is NOT touched this phase. `Cohort`, `CohortMember`,
  `CaseAssignment`, `Attempt`, `CohortMemberStatus` and the `User` relations
  (`cohortMemberships`, `assignments`, `attempts`, `createdCohorts`) all stay in
  `schema.prisma` as written.
- No migration files are produced by this phase.
- Existing cohort / assignment / attempt rows are orphaned in place. No export, no
  cleanup script, no team coordination, no data deletion.
- S3-backed cohort data (`lib/cohort-storage.ts`, `lib/student-history-service.ts`):
  delete no S3 bytes. Claude keeps the helper libs only where a surviving route still
  needs them; anything a deleted page was the sole caller of can go with the page.

**Role model**
- Target model is ADMIN / USER — collapsed at the APPLICATION LAYER ONLY. The Postgres
  `Role` enum keeps all four values; no enum change, no backfill, no migration. A single
  mapping helper in app code is the source of truth: `PROFESSOR` → treated as ADMIN;
  `STUDENT` → treated as USER; `KIOSK` → out of scope, unchanged. All role checks in
  `middleware.ts` and route handlers go through the helper rather than comparing enum
  values directly.
- The student path must be COHORT-free, not ROLE-free. A role check gating `/interview`
  or `/case-play` is acceptable and satisfies success criterion 1. What must not survive
  is any dependence on cohort membership or on an assignment existing.
- Surviving staff surfaces, audited for cohort dependencies and stripped:
  `/avatar-management`, `/system-settings`, `/kiosk/*`, `/cta-management`,
  `/case-management`.
- `/users-and-usages` is REMOVED.

**Case authoring**
- Publishing becomes self-service: any user can publish their own scenario to the shared
  `/case-play` library. The Phase 7 `published` flag stays; the Phase 7 staff-only toggle
  becomes an owner-controlled toggle on the user's own scenarios.
- Existing admin-authored S3 cases stay as a published, unowned library visible to
  everyone. They are not deleted, not reassigned to a user, and not hidden.
- `/case-management` survives as admin tooling, with every cohort and assignment
  reference inside it removed.

### Claude's Discretion
- Whether the old `Attempt` / `/api/student/cases` path is dead enough to remove at the
  code level (schema stays regardless).
- Whether `/api/cohort/join` and `/api/cohort/get` leave `PUBLIC_ROUTES`.
- Which S3 helper libs survive alongside the kept API routes.
- How the ADMIN/USER mapping helper is structured and where it lives.
- Exactly which components/types files (`types/cohort.ts`, `types/index.ts` entries,
  `config/site.ts` nav entries) go with the deleted pages.

### Deferred Ideas (OUT OF SCOPE)
- Prisma schema cleanup — dropping `Cohort`, `CohortMember`, `CaseAssignment`, `Attempt`,
  `CohortMemberStatus` and the dead `User` relations. Blocked on the caller-map checkpoint
  proving the kept APIs are dead. Its own phase, with the local-only migration pattern.
- Real `Role` enum collapse in Postgres — the ADMIN/USER model exists only in app code
  after Phase 11. A genuine enum change plus data backfill is a later, deliberate
  migration.
- Aggregate/anonymous usage view for operators — replaces the per-user analytics being
  removed with `/users-and-usages`. Future phase.
- Access-code or invite-based signup — `/join/[accessCode]` is being removed outright;
  repurposing it as a general signup entry point was considered and set aside.
- Data export tooling for orphaned cohort/gradebook rows — not needed now; the rows stay
  readable in the DB by a human if it ever matters.
</user_constraints>

<phase_requirements>
## Phase Requirements

No REQ IDs exist for Phase 11 in `.planning/REQUIREMENTS.md` (IDs stop at REQ-49, which
belongs to Phase 10). This phase is anchored only by ROADMAP's two success criteria:

| Criterion | Research Support |
|-----------|-------------------|
| No user-facing surface depends on cohort membership or staff roles | Section A (full inventory), Section E (neutralization targets with exact line numbers), Section C (role-check inventory + middleware gap found) |
| Individual users create and own all of their own practice work | Section D confirms self-service publishing (`/api/scenario/publish`, `/api/scenario/list`) is **already fully built** in Phase 9 — no new work needed here beyond leaving it alone |
</phase_requirements>

## Summary

This phase is almost entirely a **deletion and disconnection** exercise, not new
construction, and the codebase is more forgiving than the CONTEXT.md blast-radius list
assumed. Three findings change the shape of the plan:

1. **A second, entirely separate legacy API tree was missed in the CONTEXT.md blast
   radius**: `app/api/student-history/*` (11 route files, backed by
   `lib/student-history-service.ts`, which is the ONLY thing in the live app that reads
   Prisma's `Attempt`/`CaseAssignment` models). Its only callers, anywhere in the app, are
   `/teacher/**` and `/student-history/**` pages — both already slated for deletion. This
   API tree was **not** named in CONTEXT's "APIs to keep, pending checkpoint" list (only
   `/api/cohort/*`, `/api/codes/*`, `/api/student/cases` were), so it is not covered by the
   checkpoint caution rule and is safe to delete alongside its pages under Claude's own
   judgment ("Claude's discretion: whether the old Attempt path is dead enough to remove").

2. **Decision 10 (self-service publishing) is already fully implemented.** `/api/scenario/
   publish` (owner-scoped toggle) and `/api/scenario/list` (mine + shared-by-others
   projection, admin cases excluded by `!c.ownerId`) already exist and already do exactly
   what the CONTEXT.md decision asks for, built in Phase 9. `/case-management`'s own
   `published` switch is untouched admin-case tooling and does not conflict. **No
   implementation work is needed for Section D — only verification that it still works.**

3. **A real, pre-existing bug will surface the moment the cohort UI is deleted, and the
   plan must fix it, not just "neutralize" around it**: `app/api/interaction/start/
   route.ts` line 11 hard-requires `cohortId` (`if (!studentEmail || !caseId || !cohortId
   || !mode)`) and returns 400 without it. `app/case-play/[caseId]/page.tsx` sources
   `cohortId` from `searchParams.get("cohortId") || ""` (line 108) — a query param only ever
   populated today by links from the pages being deleted (`/codes`, `/cohort-management`).
   Once those links are gone, `cohortId` is always `""`, and the admin "Case Study"
   interaction-start flow (the `!isScenario` path, i.e. the non-scenario admin case
   feature) will 400 on every attempt. This is the one place "neutralize, don't restructure"
   requires an actual behavior change: drop the `!cohortId` requirement (keep the field in
   the request/response shape, per the decision — just stop requiring a truthy value).

**Primary recommendation:** Sequence the plan as (1) page deletions + orphan cleanup
first, since they're mechanical and low-risk, (2) the mandatory caller-map checkpoint
before touching any `/api/cohort/*`, `/api/codes/*`, or `/api/student/cases` route file,
(3) the two-line `/api/interaction/start` fix + the case-play/scenario-route
neutralization together as one small, carefully-diffed pass, and (4) the role-mapping
helper + middleware wiring last, since it's the most likely place a mistake silently
locks out a real user.

## Timing Risk (explicitly requested)

Phase 10 is **effectively done** as of this research, contrary to what `.planning/
STATE.md`'s prose implies. `git log` shows `10-10-SUMMARY.md` exists and its commits
(`d736f29`, `3942da8`, `75a8c99`, `edfb7b2`) are already on `feature/interview-baseline`.
Only `10-11` (the human walkthrough / sign-off checkpoint) remains, and its plan declares
`files_modified: []` — it makes no code changes, only verifies and updates
`.planning/STATE.md`/`REQUIREMENTS.md`.

- **`app/case-play/[caseId]/page.tsx` collision risk: LOW, not zero.** Phase 10's 10-10
  work is entirely inside the `isScenario === true` branches (camera-mode gate, capture
  lifecycle, live affordances for student scenarios). Phase 11's touches to this same file
  are entirely inside the `isScenario === false` (admin case) branches: the cohort-gated
  `avatar-time-limit` effect (lines ~303–328) and the `cohortId` passed into
  `/api/interaction/start` (line ~731, inside `handleStart`'s non-scenario branch). These
  are different code regions of the same ~2000-line file — no line-level conflict expected,
  but this is still the single file both phases touch most, so diff carefully and re-read
  the file fresh before editing (do not trust a stale mental model of its line numbers).
- **Everything else Phase 11 touches (`/cohort-management`, `/codes`, `/teacher`,
  `/student-history`, `/join`, `app/api/scenario/*`, `app/api/interaction/start`,
  `middleware.ts`, `config/site.ts`, role-check files) has zero overlap with Phase 10's
  outstanding or recent work.** Safe to start Phase 11 now.
- Uncommitted local changes at research time (`app/interview/[type]/page.tsx`,
  `components/interview/ReportScoreCards.tsx`, `components/metrics/MetricsConsentDialog.tsx`,
  ~40 lines each) are unrelated Phase 10 interview-surface polish, not case-play, and not a
  file Phase 11 touches.
- Recommendation: it is safe to plan and execute Phase 11 concurrently with 10-11
  finishing, since 10-11 makes no code changes. Just re-diff `case-play/[caseId]/page.tsx`
  immediately before editing it, in case another sibling agent lands something first.

## A. Exhaustive Inventory of Cohort/Staff Surfaces

Full `grep -rIl -i "cohort"` and `CaseAssignment|Attempt|accessCode` sweep across the repo
(excluding `node_modules`, `.next`, `.git`, `.planning`), classified:

### Pages to delete (exact match to CONTEXT.md list, confirmed on disk)
| Path | Files |
|------|-------|
| `app/cohort-management/**` | `layout.tsx`, `page.tsx`, `edit/layout.tsx`, `edit/[cohort-id]/page.tsx`, `learners/[cohort-id]/page.tsx` |
| `app/codes/**` | `layout.tsx`, `page.tsx`, `[codeId]/page.tsx`, `[codeId]/edit/page.tsx`, `[codeId]/gradebook/page.tsx`, `[codeId]/student/[studentEmail]/page.tsx`, `.../time-usage/[caseId]/page.tsx`, `.../score/[caseId]/page.tsx`, `.../conversations/[caseId]/page.tsx`, `.../learning-curve/[caseId]/page.tsx` |
| `app/teacher/**` | `layout.tsx`, `class/[classId]/page.tsx`, `class/[classId]/case/[caseId]/page.tsx`, `class/[classId]/case/[caseId]/student/[studentId]/page.tsx` |
| `app/student-history/**` | `layout.tsx`, `page.tsx`, `[sectionId]/[studentId]/[caseId]/layout.tsx`, `[sectionId]/[studentId]/[caseId]/page.tsx` |
| `app/join/[accessCode]/**` | `layout.tsx`, `page.tsx` |
| `app/users-and-usages/**` | `layout.tsx`, `page.tsx` |
| `components/cohort-card.tsx` | single file, sole importer is `app/codes/page.tsx` (also deleted) |

### API routes to keep, pending the caller-map checkpoint (see Section B)
`app/api/cohort/{add,delete,edit,get,join,list,send-invitations}/route.ts`,
`app/api/codes/[codeId]/{gradebook,learner-performance}/route.ts` and
`app/api/codes/[codeId]/student/[studentEmail]/{detail,time-usage,score,conversations,
learning-curve}/[caseId]/route.ts`, `app/api/student/cases/route.ts`.

### NEW FINDING — a second dead API tree not named in CONTEXT.md, eligible for deletion now
`app/api/student-history/**` — 11 route files: `search-students`, `search-cases`,
`search-sections`, `section/[sectionId]`, `section/[sectionId]/cases`,
`section/[sectionId]/students`, `overview/[sectionId]/[studentId]`,
`gradebook/[classId]/[caseId]`, `detail/[sectionId]/[studentId]/[caseId]`,
`interaction-log/[sectionId]/[studentId]/[caseId]`. Backed exclusively by
`lib/student-history-service.ts`. **This is not `/api/cohort/*`, `/api/codes/*`, or
`/api/student/cases`** — it is a separate legacy tree that the CONTEXT.md checkpoint rule
does not cover. Its only callers anywhere in the app are `app/student-history/[sectionId]/
[studentId]/[caseId]/page.tsx` and the three `app/teacher/class/**` pages — all four are
being deleted in this same phase. Recommend deleting this whole tree + `lib/
student-history-service.ts` alongside the pages, without needing the checkpoint (Claude's
discretion, explicitly granted: "whether the old Attempt / CaseAssignment tracking path is
dead enough to remove").

### Live student code to neutralize (per decision 5)
`app/api/scenario/{add,edit,list}/route.ts`, `app/api/interaction/start/route.ts`,
`app/case-play/[caseId]/page.tsx` — see Section E for exact quotes and minimum edits.

### Shared libs (keep, used by kept API routes)
- `lib/s3-client.ts` — the single `S3AvatarStorage` class serves avatars, chat, profiles,
  cases, cohorts, and interaction logs all at once. Its `saveCohort/getCohort/
  getCohortByAccessCode/deleteCohort/listCohorts` methods (lines 1328–1414) back the kept
  `/api/cohort/*` routes and MUST stay. Do not attempt to split or prune this file.
- `lib/cohort-storage.ts` — a thin client-side fetch wrapper (`cohortStorage.add/edit/
  list/get/delete`) around `/api/cohort/*`. Every importer (`app/codes/page.tsx`,
  `app/codes/[codeId]/page.tsx`, `app/codes/[codeId]/student/[studentEmail]/page.tsx`,
  `app/codes/[codeId]/edit/page.tsx`) is itself being deleted. **Zero live callers remain
  after the page deletions** — but per decision, do not delete client libs the caller-map
  checkpoint hasn't cleared, since this file exists solely to call the kept `/api/cohort/*`
  routes and its fate should track theirs. Recommend surfacing it in the checkpoint
  presentation as "dead after page deletion, kept only because its target API is kept."
- `lib/student-history-service.ts` — see "NEW FINDING" above; recommend deleting with its
  pages (not gated on the checkpoint).

### Types
- `types/cohort.ts` — **cannot be deleted while `/api/cohort/*` survives.** Imported by
  `app/api/cohort/add/route.ts` (`import type { Cohort }`) and `lib/s3-client.ts`
  (`import type { Cohort }`), both kept. Also imported by 6 now-deleted page files. Keep it.
- `types/index.ts` — `CaseStudy.cohortIds: string[]` (line 224) and
  `InteractionLog.cohortId: string` (line 405) both stay untouched per decision 5 ("don't
  change request/response shapes"); a code comment on `CaseStudy.cohortIds` already says
  "cohortIds is untouched dead weight owned by Phase 11" — confirming the shape is meant to
  survive Phase 11 unchanged.

### Config / nav
- `config/site.ts` — `navItems` array has a `{ label: "Cohort Management", href: "/codes",
  icon: "GraduationCap" }` entry (line 23-27) that will 404 once `/codes` is deleted; must
  be removed. `studentNavItems` has no cohort references.
- `components/auth-navbar.tsx` — no cohort references itself, but renders `siteConfig.
  navItems`/`studentNavItems`, so it inherits the nav-entry fix above automatically once
  `config/site.ts` is edited. No direct edit needed to this file for cohort removal — but
  see Section C for its role-branching logic.
- `app/page.tsx` (home dashboard) — a `navigationCards` array (not `siteConfig.navItems`)
  has a `{ title: "Cohorts", ..., href: "/codes" }` card (lines 23–28) rendered for every
  non-student user. This is a second, independent place with a hardcoded `/codes` link and
  must also be edited or the admin home page will offer a dead link.
- `middleware.ts` — `ADMIN_ROUTES` contains `/cohort-management`, `/api/cohort/add`,
  `/api/cohort/edit`, `/api/cohort/delete`, `/api/cohort/list`,
  `/api/cohort/send-invitations`, `/codes`, `/api/codes`, `/teacher`, `/student-history`,
  `/users-and-usages` — all become dead entries in this array once their targets are
  deleted (harmless to leave, since `.some(route => pathname.startsWith(route))` on a
  route with no matching page/handler just never fires — but stale, so prune as part of
  the deletion pass, once the checkpoint clears which `/api/cohort/*` entries actually
  survive as routes).
- `PUBLIC_ROUTES` — `/join`, `/api/cohort/join`, `/api/cohort/get` (lines 69-72). `/join`
  page removal makes the `/join` entry dead. `/api/cohort/join` and `/api/cohort/get`
  themselves are Claude's discretion to remove from this list (see Section B — after page
  deletion, `/api/cohort/join` has literally zero callers, and `/api/cohort/get` has one
  remaining caller, the neutralization target in `case-play`, which does NOT need it to be
  public since the user is already authenticated to reach `/case-play` at all — recommend
  removing both from `PUBLIC_ROUTES`, since nothing on the actual auth path needs them
  public anymore).

### Scripts (operator tooling, schema-dependent, out of scope for deletion)
- `prisma/seed.ts` — creates `Cohort`/`CohortMember`/`CaseAssignment`/`Attempt` rows for
  local dev seeding. Schema stays, so this keeps type-checking and running fine. Not named
  in any decision for deletion; leave alone.
- `scripts/sync-s3-to-db.ts` — manual operator script syncing S3 cohort/case/interaction
  data into Postgres, including `Attempt`/`CaseAssignment`. Schema stays, so this also
  keeps working. Not named for deletion; leave alone. (It is listed in CONTEXT's "blast
  radius found on disk" but no decision actually calls for touching it — flag to the
  planner as "leave as-is" rather than silently dropping it from scope.)

### Out-of-scope operator tooling audited and confirmed clean (decision 9's audit)
`grep -rln -i cohort` returned **zero matches** in `app/avatar-management`, `app/
system-settings`, `app/cta-management`, `app/kiosk`. `/case-management` has exactly one
residual reference: a hardcoded `cohortIds: []` literal in the case-creation payload
(`app/case-management/[caseId]/page.tsx:170`), matching the untouched `CaseStudy` shape —
harmless, no action required beyond leaving it (it is not a UI element, just satisfies the
type).

## B. The Caller Map (key checkpoint deliverable)

Present this table to the user verbatim; do not delete any of these API route files
without the user's per-route decision.

### `/api/cohort/*`

| Route | Call sites today | Still alive after page deletions? |
|-------|-------------------|-------------------------------------|
| `POST /api/cohort/add` | `lib/cohort-storage.ts:55` (called only from `app/codes/page.tsx`, deleted) | **No live caller.** |
| `PUT /api/cohort/edit` | `lib/cohort-storage.ts:75` (called only from `app/codes/[codeId]/edit/page.tsx`, deleted) | **No live caller.** |
| `GET /api/cohort/delete` (POST/DELETE, check verb in file) | `lib/cohort-storage.ts:146` (called only from deleted `/codes` pages) | **No live caller.** |
| `GET /api/cohort/get` | (1) `app/join/[accessCode]/page.tsx:48` — deleted page. (2) `app/case-play/[caseId]/page.tsx:308` — **survives**, but only inside an effect gated on `cohortId` being truthy, and `cohortId` will always be `""` after neutralization (Section E) — effectively unreachable at runtime, though the code path technically still exists. (3) `lib/cohort-storage.ts:122,164` — callers are deleted `/codes` pages. (4) `app/codes/[codeId]/edit/page.tsx` does not call `get` directly (uses `cohortStorage.get`, same as #3). | **Zero *reachable* callers** after neutralization — one dead code path remains in `case-play` unless that effect is also removed (decision says neutralize, not restructure — leaving the unreachable branch in place is compliant, but flag to user as a candidate for outright deletion once code review confirms it never fires). |
| `POST /api/cohort/join` | `app/join/[accessCode]/page.tsx:126` — deleted page. | **No live caller.** |
| `GET /api/cohort/list` | `lib/cohort-storage.ts:97-98` — caller is `app/codes/page.tsx`, deleted. | **No live caller.** |
| `POST /api/cohort/send-invitations` | `app/codes/[codeId]/edit/page.tsx:334` — deleted page. | **No live caller.** |

### `/api/codes/*`

| Route | Call sites today | Still alive after page deletions? |
|-------|-------------------|-------------------------------------|
| `GET /api/codes/[codeId]/gradebook` | `app/codes/[codeId]/page.tsx:143`, `app/codes/[codeId]/gradebook/page.tsx:63` — both deleted. | **No live caller.** |
| `GET /api/codes/[codeId]/learner-performance` | **Zero callers found anywhere in the current codebase** (verified with a dedicated grep — this route is already dead code today, independent of Phase 11). | **No live caller — already dead pre-Phase-11.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/detail` | `app/codes/[codeId]/student/[studentEmail]/page.tsx:594` — deleted. | **No live caller.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/time-usage/[caseId]` | `app/codes/[codeId]/student/[studentEmail]/time-usage/[caseId]/page.tsx:139` — deleted. | **No live caller.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/score/[caseId]` | `.../score/[caseId]/page.tsx:154` — deleted. | **No live caller.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/conversations/[caseId]` | `.../conversations/[caseId]/page.tsx:317` — deleted. | **No live caller.** |
| `GET /api/codes/[codeId]/student/[studentEmail]/learning-curve/[caseId]` | `.../learning-curve/[caseId]/page.tsx:229` — deleted. | **No live caller.** |

### `/api/student/cases`

| Route | Call sites today | Still alive after page deletions? |
|-------|-------------------|-------------------------------------|
| `GET /api/student/cases` | **Zero callers found anywhere in `app/`, `lib/`, or `components/`** — not even from a page being deleted. It is in `middleware.ts`'s `STUDENT_ROUTES` list (implying it was meant for direct student consumption) but nothing in the current frontend fetches it. | **No live caller today, before or after Phase 11.** Reads S3 cohort data via `s3Storage.listCohorts()`; guards privileged callers with the `isPrivileged` pattern (`role === "admin" \|\| role === "professor"`). |

**Bottom line for the checkpoint conversation:** every single kept-pending-review route
across all three groups drops to zero live callers once the named pages are deleted (two —
`learner-performance` and `/api/student/cases` — are already at zero callers *today*,
before any Phase 11 work). The "delete UI, keep APIs" caution was well-founded as a safety
net, but the caller map itself gives the user a clean, low-risk basis to approve deleting
most or all of them if they choose to.

## C. Role-Check Inventory

Every comparison against `Role`/`"admin"`/`"student"`/`"professor"`/`"kiosk"` found via
repo-wide grep:

| Location | What it checks | Notes |
|----------|----------------|-------|
| `middleware.ts:200-222` `STUDENT_ROUTES` array | `/interview`, `/api/student/cases`, `/case-play`, `/api/interaction`, `/reports`, `/settings`, `/api/interview`, `/api/scenario`, `/api/metrics`, `/api/avatar/get-access-token`, `/api/profile/get`, `/api/audio/transcribe` | |
| `middleware.ts:328-333` | `userRole === "student" \|\| userRole === "admin" \|\| (isKioskRoute && userRole === "kiosk")` | **Gap found: `"professor"` is not in this allow-list.** A PROFESSOR-role user is currently denied `/interview`, `/case-play`, etc. entirely — neither student nor admin path admits them. |
| `middleware.ts:364` | `userRole !== "kiosk" && userRole !== "admin"` (kiosk-route gate) | PROFESSOR also excluded here. |
| `middleware.ts:411` | `userRole !== "admin"` (admin-route gate) | PROFESSOR also excluded here — a PROFESSOR user cannot reach `/case-management`, `/avatar-management`, etc. today either, despite `lib/auth.ts`'s comments implying PROFESSOR is a real, intentionally-preserved role. **This is the concrete bug decision 7's mapping helper is meant to fix**: `PROFESSOR → ADMIN` at the app layer closes this gap. |
| `middleware.ts:111-170` `ADMIN_ROUTES` array | Full route list, see Section A for the cohort-specific entries needing pruning. | |
| `lib/auth.ts:122-124` `roleToString(role: Role)` | `return role.toLowerCase()` — turns Prisma's `ADMIN/PROFESSOR/STUDENT/KIOSK` into the lowercase strings the JWT payload and middleware compare against (`"admin"/"professor"/"student"/"kiosk"`). | **This is the natural home for the mapping helper** — a second function here (e.g. `toAppRole(role: Role): "admin" \| "user" \| "kiosk"`) that middleware and route handlers call instead of comparing raw strings would centralize the collapse cleanly, following this file's existing single-responsibility pattern for role/provider string conversion. |
| `lib/auth.ts:45-59` `createToken` | Signs `role: user.role \|\| "user"` into the JWT — already defaults to `"user"`, not `"student"`, when no role is given, suggesting the JWT layer was already halfway toward the ADMIN/USER model. | |
| `lib/auth.ts:270-296` `createOrUpdateCWRUUser` | Comment explicitly says "without clobbering PROFESSOR/KIOSK roles that are managed out-of-band" — confirms PROFESSOR is a real, currently-assigned role on some accounts, not vestigial. | |
| 5 API route handlers: `app/api/cohort/get/route.ts:12`, `app/api/interaction/finish/route.ts:140`, `app/api/interaction/get/route.ts:32`, `app/api/interaction/save/route.ts:33`, `app/api/student/cases/route.ts:23` | Identical repeated pattern: `const isPrivileged = currentUser.role === "admin" \|\| currentUser.role === "professor";` | This is an existing, informal precedent for "PROFESSOR-as-privileged" already present at the route-handler layer (though absent from `middleware.ts`). The mapping helper should replace all 5 of these local re-implementations, not just the middleware. |
| `app/api/auth/cwru-sso-callback/route.ts:45` | `const role = isAdmin ? "admin" : "user";` | Sets the string `"user"` directly (not `"student"`) for non-admin SSO logins — another signal the codebase already leans USER, not STUDENT, in places. |
| `app/api/auth/kiosk-auto-login/route.ts:125` | `role: "kiosk"` | Untouched, out of scope per decision. |
| `app/api/cohort/join/route.ts:115` | `role: Role.STUDENT` (Prisma enum, user creation on cohort join) | This route is a caller-map candidate for deletion (Section B); if kept, this line is fine as-is since it writes the Prisma enum directly, not the app-layer string. |
| `app/page.tsx:47` | `if (user?.role === "student")` — routes to `InteractionDashboard` vs. the admin dashboard cards | Should go through the mapping helper (`toAppRole(user.role) === "user"`) once it exists, so PROFESSOR accounts get consistent behavior. |
| `app/login/page.tsx:29` | `if (meData.user?.role === "student")` — post-login redirect | Same as above. |
| `components/auth-navbar.tsx:65` | `user?.role === "student" ? studentNavItems : navItems` | Same as above; currently a PROFESSOR falls into the `navItems` (admin) branch by default since it isn't `"student"` — so nav *display* already treats PROFESSOR as admin-like, inconsistent with middleware blocking them from the actual admin routes those nav items link to. |

**What the mapping helper must cover:** every one of the 5 duplicated `isPrivileged`
blocks, the 3 middleware comparison points, and the 3 page/component `role === "student"`
checks — roughly 11 call sites total, all collapsible to two helper calls:
`isAdmin(role)` (true for ADMIN and PROFESSOR) and `isStaffOrUser` type discrimination as
needed. KIOSK must remain a distinct third branch wherever it currently is (middleware's
`isKioskRoute` logic, `kiosk-auto-login`) — do not fold it into either helper.

## D. The Publishing Path

**Already fully implemented (Phase 9), not a Phase 11 build task.**

- `types/index.ts` `CaseStudy.ownerId?: string` — the real discriminator. Set
  server-side only, from the authenticated session, immutable after creation. Presence =
  student-authored scenario; absence = legacy admin case.
- `app/api/scenario/publish/route.ts` — `POST`, owner-scoped (`loadOwnedScenario(body.id,
  currentUser.id)` — 404s if the caller doesn't own the scenario), toggles `published:
  boolean` on the caller's own row via `s3Storage.saveCase`. This already IS "an
  owner-controlled toggle on the user's own scenarios," matching decision 10 verbatim.
- `app/api/scenario/list/route.ts` — `GET`, returns `{ mine, shared }`: `mine` = every
  scenario owned by the caller (any publish state — authors see their own drafts); `shared`
  = every OTHER user's scenario where `published === true`, through a field-by-field
  `toSharedProjection` that deliberately omits `ownerId` and `cohortIds` to avoid leaking
  another student's identity or the dead cohort-scoping field.
- `app/case-play/page.tsx` (the index) — admin-authored cases come from `/api/case/list?
  publishedOnly=true` filtered to `!c.ownerId`; student scenarios come from `/api/scenario/
  list`'s `mine`/`shared`. Two independent, already-correct code paths — confirms admin
  cases are unowned and the index already distinguishes them.
- `app/case-management/[caseId]/page.tsx` — retains its own `published` `Switch` (line
  456) for admin-authored cases. This is untouched, in-scope admin tooling per decision
  ("`/case-management` survives... with cohort/assignment references removed") and does
  not conflict with the self-service scenario toggle — they operate on disjoint object sets
  (admin cases have no `ownerId`; scenarios always do).

**Nothing to build here.** The plan's only D-related task is a verification step:
confirm (by reading the three files above and/or a live walkthrough) that this already
matches decision 10, and note it as "pre-existing, no change" rather than generating new
tasks.

## E. Neutralization Targets

### `app/api/interaction/start/route.ts`
```ts
// line 9
const { studentEmail, studentName, caseId, caseName, cohortId, mode, language } = body;

// line 11-16 — THE BUG: hard-requires cohortId
if (!studentEmail || !caseId || !cohortId || !mode) {
  return NextResponse.json(
    { error: "Missing required fields: studentEmail, caseId, cohortId, mode" },
    { status: 400 }
  );
}
// ... cohortId flows unchanged into the InteractionLog object at line 38: `cohortId,`
```
**Minimum edit:** drop `!cohortId` from the guard on line 11 (and optionally the word
`cohortId` from the error string on line 13, though leaving the string stale is harmless).
Do NOT remove `cohortId` from the destructure or from the `InteractionLog` object — that
keeps the request/response shape identical, satisfying "fields stay present but are always
null/ignored." This is the one place in Phase 11 where "neutralize" requires a genuine
behavior change (validation relaxation), not a no-op — call this out explicitly in the
plan so it isn't accidentally skipped as "just leave it."

### `app/case-play/[caseId]/page.tsx`
```ts
// line 108
const cohortId = searchParams.get("cohortId") || "";
```
Sourced from a URL query param. Every current link that ever set `?cohortId=...` lives in
`/codes` or `/cohort-management` pages being deleted in this same phase. Once those pages
are gone, no code path anywhere in the app will ever populate this query param — `cohortId`
becomes permanently `""` at runtime, with **zero code edit required** for this line itself.

```ts
// lines 303-328 — effect gated on cohortId
useEffect(() => {
  if (!user?.email || !cohortId || !caseId) return;   // <- short-circuits when cohortId === ""
  (async () => {
    const res = await fetch(`/api/cohort/get?id=${encodeURIComponent(cohortId)}`);
    ...
  })();
}, [user?.email, cohortId, caseId]);
```
**Minimum edit: none required.** The `!cohortId` guard already makes this a permanent
no-op once nothing sets the query param. This satisfies "cohort fields stay present but
always null/ignored" literally — the code is present, unreachable, harmless. Optional
follow-up (only if the user wants tighter cleanup after the caller-map checkpoint):
delete this effect block outright, since it's the one remaining reference to `/api/cohort/
get` from live code — but that is a restructuring choice outside "neutralize, don't
restructure," so treat it as optional/discretionary, not required.

```ts
// line 731, inside handleStart's non-scenario (!isScenario) branch
body: JSON.stringify({
  studentEmail: user.email,
  studentName: user.name,
  caseId: caseData.id,
  caseName: caseData.name,
  cohortId,        // <- always "" now
  mode: selectedMode,
  language: attemptLanguage.code,
}),
```
**No edit needed here** — this is exactly what makes the `/api/interaction/start` fix
above mandatory: `cohortId` will be `""` (falsy) on every call once the source pages are
gone, so without that fix this call always 400s.

### `app/api/scenario/add/route.ts`, `app/api/scenario/edit/route.ts`, `app/api/scenario/list/route.ts`
```ts
// scenario/add/route.ts:88
cohortIds: [],

// scenario/edit/route.ts:65
cohortIds: existing.cohortIds,

// scenario/list/route.ts:20 (comment only)
// information about a different user) and `cohortIds` (obsolete scoping
// dead weight) to a caller who has no business seeing either.
```
**No edit needed.** These already treat `cohortIds` as inert pass-through/dead weight —
`add` always writes `[]`, `edit` just carries the existing value forward unchanged, `list`
already excludes it from the shared projection. This is the "cohort fields stay present but
always null/ignored" state already achieved. Confirms decision 5's premise was accurate for
these three files specifically — Phase 9 already neutralized them incidentally.

## F. Breakage Risk From the Page Deletions

| Item | Risk | Action |
|------|------|--------|
| `types/cohort.ts` | Imported by kept `/api/cohort/add` and shared `lib/s3-client.ts` | **Keep** — deleting it breaks the surviving API |
| `lib/cohort-storage.ts` | Only importers are deleted `/codes` pages | Dead after page deletion, but its sole purpose is calling the kept `/api/cohort/*` routes — present it in the caller-map checkpoint rather than deleting unilaterally |
| `lib/student-history-service.ts` | Only importers are deleted `/student-history` and `/teacher` pages, plus the also-dead `app/api/student-history/*` tree | Safe to delete outright (not gated by the checkpoint — see Section A "New Finding") |
| `lib/s3-client.ts` | Single shared class; cohort/interaction methods used by many surviving features (avatars, chat, profiles, cases, kept cohort APIs) | **Do not touch.** No pruning possible without breaking surviving routes |
| `config/site.ts` `navItems` | Contains a `/codes` entry that 404s post-deletion | Edit: remove the "Cohort Management" nav item |
| `app/page.tsx` `navigationCards` | Separate hardcoded `/codes` link, independent of `config/site.ts` | Edit: remove or repoint the "Cohorts" card |
| `middleware.ts` `ADMIN_ROUTES` / `PUBLIC_ROUTES` | Multiple entries point at deleted pages (`/cohort-management`, `/codes`, `/teacher`, `/student-history`, `/users-and-usages`, `/join`) | Harmless if left (prefix-match against a nonexistent page just never matches), but stale — prune for cleanliness once checkpoint clears which `/api/cohort/*` entries survive |
| `types/index.ts` `CaseStudy.cohortIds`, `InteractionLog.cohortId` | Explicitly meant to survive unchanged per decision 5 and existing code comments | **No action** |
| `app/case-management` | Shares `lib/s3-client.ts`'s `saveCase`/`getCase`/`listCases` with the surviving scenario system, and has one harmless `cohortIds: []` literal | **No action** — already clean, confirmed by audit |
| `app/avatar-management`, `app/system-settings`, `app/cta-management`, `app/kiosk` | Confirmed zero cohort references via repo-wide grep | **No action needed** |
| `prisma/seed.ts`, `scripts/sync-s3-to-db.ts` | Reference `Cohort`/`Attempt`/`CaseAssignment` Prisma models directly; schema stays, so these keep compiling and running | **No action** — out of scope, not named in any decision for deletion |

## G. Verification Commands That Actually Work in This Repo

Confirmed by direct execution during this research:

- **`npx tsc --noEmit`** — clean baseline today (zero errors). This is the authoritative
  typecheck; re-run after every deletion/neutralization pass.
- **`npm run lint` / `npx eslint ...`** — **broken repo-wide today**, independent of Phase
  11 (confirmed: `ESLint configuration in » plugin:@next/next/recommended is invalid:
  Unexpected top-level property "name"` — an ESLint 9 / `@next/next` flat-config
  incompatibility). This is a NEW finding beyond what `.planning/STATE.md` documents (which
  only flags `next build`'s `/about` prerender as broken). Phase 9's own research/sweep
  already independently confirmed this ("re-confirm eslint is still pre-existing-broken
  repo-wide against an untouched file") — treat it as a known, pre-existing, out-of-scope
  environment issue, not a Phase 11 regression to fix.
- **`next build`** — known-broken on `/about`'s `EDGE_CONFIG` prerender, per STATE.md;
  unrelated to this phase. Do not rely on it.
- **`next dev`** — the correct tool for the human end-to-end walkthrough (decision 11);
  confirm the dev server boots and the four flows (interview, case-play, student
  scenarios, both report types) work live.
- **Targeted dead-reference greps** (the pattern Phase 9's own sweep used, e.g.
  `grep -rn "cohort" app/api/scenario/`) — recommended per-deletion verification, e.g.:
  - `grep -rn "codes\|cohort-management\|teacher\|student-history\|join/\[accessCode\]" config/site.ts app/page.tsx` → should return nothing after nav cleanup
  - `grep -rln "cohort-storage\|student-history-service" app lib components` → should
    show zero remaining importers after the corresponding deletions, or only the
    still-kept-pending-checkpoint API routes
  - `grep -n "!cohortId" app/api/interaction/start/route.ts` → should return nothing after
    the fix
  - `grep -rn "\"professor\"" middleware.ts` → should show the mapping helper's usage, not
    a raw string comparison, once Section C's refactor lands

## Open Questions

1. **Should `/api/cohort/get`'s now-unreachable-but-still-present effect in `case-play`
   be deleted outright, or left as inert code per "neutralize, don't restructure"?**
   - What we know: the effect (lines 303-328) can never fire once `cohortId` is
     permanently `""`.
   - What's unclear: whether leaving genuinely dead code in a file that decision 5
     explicitly wants minimally touched is itself a code-quality regression worth a small
     exception, or whether "don't restructure" should be read literally.
   - Recommendation: leave it in place for this phase (literal reading of the decision);
     let the user flag it during the caller-map checkpoint if they want it gone too.

2. **Does the user want `/api/cohort/get` and `/api/cohort/join` to stay in
   `PUBLIC_ROUTES` even though `/join` is being deleted?**
   - What we know: after page deletion, nothing on any auth path needs either public.
   - What's unclear: whether the user has an unlisted future use in mind (e.g., some kind
     of external integration hitting `/api/cohort/get` unauthenticated) that the caller
     map wouldn't surface, since caller-map only covers this codebase's own call sites.
   - Recommendation: present both routes in the checkpoint table with the "already
     effectively 0 in-app callers" finding, but explicitly ask the user rather than
     defaulting to removal — they granted Claude discretion here, but it's a security-
     relevant default worth a one-line confirmation.

## Sources

### Primary (HIGH confidence — direct filesystem inspection of this repo)
- `.planning/phases/11-cohort-staff-teardown/11-CONTEXT.md` — full read
- `.planning/STATE.md` — full read, cross-checked against `git log`
- `middleware.ts`, `config/site.ts`, `lib/auth.ts`, `components/auth-navbar.tsx`,
  `app/page.tsx`, `app/login/page.tsx` — full or targeted reads
- `prisma/schema.prisma` — `Role`, `CohortMemberStatus`, `Cohort`, `CohortMember`,
  `CaseAssignment`, `Attempt` model/enum definitions
- `app/case-play/[caseId]/page.tsx`, `app/api/interaction/start/route.ts`,
  `app/api/scenario/{add,edit,list}/route.ts`, `app/api/scenario/publish/route.ts` —
  targeted reads of every cohort/ownerId-adjacent line
- `lib/s3-client.ts`, `lib/cohort-storage.ts`, `lib/student-history-service.ts`,
  `types/cohort.ts`, `types/index.ts` — full or targeted reads
- Repo-wide `grep -rIl -i "cohort"` and `grep -rIl -E "CaseAssignment|\bAttempt\b|
  accessCode"` sweeps (excluding `node_modules`, `.next`, `.git`, `.planning`)
- Live command execution: `npx tsc --noEmit`, `npm run lint`, `npx eslint ...`, `git log`,
  `git status`, `git diff --stat`

### Secondary / Tertiary
None used — this phase required no external library or framework research; the entire
research surface is this specific codebase's own state.

## Metadata

**Confidence breakdown:**
- Inventory (Section A) and caller map (Section B): HIGH — exhaustive grep sweep,
  cross-checked call sites by reading each consumer file directly.
- Role-check inventory (Section C): HIGH — same method; the middleware gap (PROFESSOR
  excluded from both STUDENT_ROUTES and ADMIN_ROUTES allow-lists) was independently
  verified by reading the literal boolean conditions.
- Publishing path (Section D): HIGH — read the actual route implementations; this is not
  an inference, `/api/scenario/publish` and `/api/scenario/list` demonstrably already do
  what decision 10 asks.
- Neutralization targets (Section E) and the `/api/interaction/start` bug: HIGH — traced
  the exact data flow from the deleted pages' query params through to the 400 response.
- Timing risk assessment: HIGH for the git-log-derived facts (10-10 is committed, 10-11
  makes no file changes); MEDIUM for the "safe to run concurrently" recommendation, since
  it depends on no other sibling agent landing conflicting work between this research and
  Phase 11 execution — re-verify with a fresh `git log`/`git status` immediately before
  executing.

**Research date:** 2026-09-22
**Valid until:** Effectively no expiry for the structural findings (they're direct code
facts, not ecosystem trends) — but the "Timing Risk" section's git-state snapshot goes
stale immediately; re-run `git log --oneline -5` and `git status` at the start of Phase 11
execution regardless of how much time has passed since this research.
