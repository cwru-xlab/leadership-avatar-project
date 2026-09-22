# Phase 11: Cohort & Staff Teardown - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the assignment and monitoring wrapper from the student path: cohorts,
access codes, gradebooks, per-student staff oversight views, and the
join-by-code flow. This is NOT a removal of case functionality — `/case-play`
is the Case Study Scenarios interaction type and stays, as do the Phase 9
student-authored scenarios and the Phase 6/10 report pipelines.

Operator tooling that is admin-gated but is NOT assignment/monitoring
(avatar-management, system-settings, kiosk, cta-management) is out of scope
except for a cohort-dependency audit.

</domain>

<decisions>
## Implementation Decisions

### Removal depth

- **Delete the UI, keep the APIs.** The staff/assignment PAGES are deleted from
  the repo: `/cohort-management/**`, `/codes/**`, `/teacher/**`,
  `/student-history`, `/join/[accessCode]`, and `components/cohort-card.tsx`
  (and any other component that exists only to serve them).
- **API routes survive, admin-gated exactly as they are today** —
  `/api/cohort/*`, `/api/codes/*`, `/api/student/cases`. The reason is caution,
  not a product requirement: the user is not certain what still calls them.
  Middleware's existing ADMIN gate is the protection; do not loosen it and do
  not add a new gate.
- **CHECKPOINT REQUIRED — caller map before any API deletion.** Research must
  produce a per-route caller map for every `/api/cohort/*`, `/api/codes/*` and
  `/api/student/cases` endpoint (who calls it, from where, on which path).
  Present that map to the user and let them decide per-route which proven-dead
  routes get deleted. Do NOT delete an API route on Claude's own judgment.
- **Removed paths return a plain 404.** No redirect map, no "this feature was
  removed" page, no special handling. Deleting the route file is the whole
  implementation.
- `/join/[accessCode]` and the public `/api/cohort/join` + `/api/cohort/get`
  entries in `PUBLIC_ROUTES`: remove the page; Claude decides on the two public
  API entries, removing them from `PUBLIC_ROUTES` unless something on the auth
  path depends on them. No access-code signup replacement — that is deferred.
- **Live student code gets NEUTRALIZED, not restructured.** In
  `app/api/scenario/add|edit|list`, `app/api/interaction/start`, and
  `app/case-play/[caseId]/page.tsx`, cohort fields stay present but are always
  null/ignored. Do not change request/response shapes or refactor these files —
  they carry working Phase 9 and Phase 10 behavior and churn there is the main
  regression risk in this phase.
- **The old `Attempt` / `CaseAssignment` tracking path:** Claude's call. Trace
  whether anything on the live student path still reads `Attempt` or
  `/api/student/cases`; `ScenarioReport` and `InterviewReport` are the real
  record types now. Remove the old path only where nothing live reads it —
  and note that schema-level removal is out of scope regardless (see below).
- **Final plan is a static sweep plus a human end-to-end walkthrough**, matching
  the Phase 7–10 pattern: interview, case-play, student scenarios, and both
  report types must all still work after the removals.

### Database fate

- **The Prisma schema is NOT touched this phase.** `Cohort`, `CohortMember`,
  `CaseAssignment`, `Attempt`, `CohortMemberStatus` and the `User` relations
  (`cohortMemberships`, `assignments`, `attempts`, `createdCohorts`) all stay in
  `schema.prisma` as written.
  - This resolves a direct conflict: the surviving admin-gated cohort APIs query
    those models and would not type-check without them. Keeping the APIs won.
  - Schema cleanup is sequenced AFTER the caller-map checkpoint proves the APIs
    are dead. It is explicitly deferred out of Phase 11.
- **No migration files are produced by this phase.** If a later decision does
  require one, the standing project rule holds: authored for review, applied to
  the local dev DB only (`leadership_avatar_dev`), never to the shared Lightsail
  Postgres from a plan, with a handoff note — the Phase 6/8 pattern.
- **Existing cohort / assignment / attempt rows are orphaned in place.** No
  export, no cleanup script, no team coordination, no data deletion.
- S3-backed cohort data (`lib/cohort-storage.ts`,
  `lib/student-history-service.ts`): delete no S3 bytes. Claude keeps the helper
  libs only where a surviving route still needs them; anything a deleted page
  was the sole caller of can go with the page.

### Role model

- **Target model is ADMIN / USER — collapsed at the APPLICATION LAYER ONLY.**
  The Postgres `Role` enum keeps all four values; no enum change, no backfill,
  no migration. A single mapping helper in app code is the source of truth:
  - `PROFESSOR` → treated as **ADMIN**. Existing professor accounts keep access
    to the surviving operator tooling.
  - `STUDENT` → treated as **USER**.
  - `KIOSK` → **out of scope, unchanged.** Kiosk routes, auto-login, and the
    KIOSK role keep their current behavior exactly. Do not fold kiosk into USER.
  - All role checks in `middleware.ts` and route handlers go through the helper
    rather than comparing enum values directly.
- **The student path must be COHORT-free, not ROLE-free.** A role check gating
  `/interview` or `/case-play` is acceptable and satisfies success criterion 1.
  What must not survive is any dependence on cohort membership or on an
  assignment existing.
- **Surviving staff surfaces, audited for cohort dependencies and stripped:**
  `/avatar-management`, `/system-settings`, `/kiosk/*`, `/cta-management`,
  `/case-management`.
- **`/users-and-usages` is REMOVED.** Watching what individual users do is the
  monitoring model being torn down. Two carve-outs:
  - Basic user administration is not the target — per-user USAGE ANALYTICS are.
  - An anonymous/aggregate usage view for operators is wanted, but is a future
    phase, not this one (see Deferred Ideas).

### Case authoring

- **Publishing becomes self-service: any user can publish their own scenario**
  to the shared `/case-play` library. This removes staff from the content path
  entirely. The Phase 7 `published` flag stays; the Phase 7 staff-only toggle
  becomes an owner-controlled toggle on the user's own scenarios.
- **Existing admin-authored S3 cases stay as a published, unowned library**
  visible to everyone. They are not deleted, not reassigned to a user, and not
  hidden.
- **`/case-management` survives** as admin tooling, with every cohort and
  assignment reference inside it removed.

### Claude's Discretion

- Whether the old `Attempt` / `/api/student/cases` path is dead enough to remove
  at the code level (schema stays regardless).
- Whether `/api/cohort/join` and `/api/cohort/get` leave `PUBLIC_ROUTES`.
- Which S3 helper libs survive alongside the kept API routes.
- How the ADMIN/USER mapping helper is structured and where it lives.
- Exactly which components/types files (`types/cohort.ts`, `types/index.ts`
  entries, `config/site.ts` nav entries) go with the deleted pages.

</decisions>

<specifics>
## Specific Ideas

- The blast radius found on disk at discussion time: `/cohort-management`,
  `/codes/**` (gradebook, per-student score / conversations / time-usage /
  learning-curve), `/teacher/class`, `/student-history`, `/join/[accessCode]`,
  `app/api/cohort/*`, `app/api/codes/*`, `app/api/student/cases`,
  `lib/cohort-storage.ts`, `lib/student-history-service.ts`,
  `components/cohort-card.tsx`, `types/cohort.ts`, `prisma/seed.ts`,
  `scripts/sync-s3-to-db.ts`, plus cohort references inside the live files
  `app/api/scenario/add|edit|list`, `app/api/interaction/start`, and
  `app/case-play/[caseId]/page.tsx`.
- "Delete UI, keep APIs" is a caution decision, not an architectural one. The
  caller-map checkpoint is what converts it into a real decision — plan for that
  checkpoint as a first-class deliverable, not an afterthought.
- Minimal churn in Phase 9/10 code is an explicit priority. Phase 10 is still in
  progress (10-10 and 10-11 outstanding as of 2026-09-22); Phase 11 planning
  must assume those files are actively changing.

</specifics>

<deferred>
## Deferred Ideas

- **Prisma schema cleanup** — dropping `Cohort`, `CohortMember`,
  `CaseAssignment`, `Attempt`, `CohortMemberStatus` and the dead `User`
  relations. Blocked on the caller-map checkpoint proving the kept APIs are
  dead. Its own phase, with the local-only migration pattern.
- **Real `Role` enum collapse in Postgres** — the ADMIN/USER model exists only
  in app code after Phase 11. A genuine enum change plus data backfill is a
  later, deliberate migration.
- **Aggregate/anonymous usage view for operators** — replaces the per-user
  analytics being removed with `/users-and-usages`. Future phase.
- **Access-code or invite-based signup** — `/join/[accessCode]` is being removed
  outright; repurposing it as a general signup entry point was considered and
  set aside.
- **Data export tooling for orphaned cohort/gradebook rows** — not needed now;
  the rows stay readable in the DB by a human if it ever matters.

</deferred>

---

*Phase: 11-cohort-staff-teardown*
*Context gathered: 2026-09-22*
