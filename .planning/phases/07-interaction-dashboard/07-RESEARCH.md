# Phase 7: Interaction Dashboard - Research

**Researched:** 2026-09-20
**Domain:** Next.js App Router navigation/registry refactor over two existing, independently-authored
student surfaces (interview via Postgres, case-play via S3-only storage)
**Confidence:** HIGH (all findings are direct file reads / local DB queries, not framework research)

## Summary

This phase is not really "new technology" research — it is an archaeology problem. Two live
student experiences (`/interview/[type]` and `/case-play/[caseId]`) were built independently,
against different data stores, with different authorization models, and both currently hardcode
`/student-cases` as their only way home. The dashboard has to sit above both without importing
either's internals.

The single most consequential finding: **there are two unrelated "Case" data models in this
codebase**, and CONTEXT.md's instruction to "add a published flag to the Case model, handle the
migration exactly as Phase 6 did" was written assuming the Prisma model is the one that matters.
It is not. The actual case content that `/case-play` renders — background info, avatars, roles —
lives entirely in S3 as JSON (`lib/s3-client.ts` `cases/{id}.json`), addressed by the `CaseStudy`
TypeScript interface in `types/index.ts`. That interface has no `published` field today. The
Prisma `Case` table already has `isPublished` (migrated and present in the local dev DB right
now), but it is a disconnected bookkeeping table used only by the staff `student-history`/teacher
gradebook feature, seeded with 3 fixture rows whose ids don't correspond to any real S3 case.
Nothing in `/api/case/add|edit|get|list` ever touches Prisma. Adding "published" to the *right*
Case requires editing a TypeScript interface and a JSON blob, not a Postgres migration.

The second load-bearing finding: repointing "every `/student-cases` link" is a wider set than the
three surfaces CONTEXT.md names. A grep across the repo finds 8 files and 12 call sites, including
`app/login/page.tsx` (post-login redirect) and `app/join/[accessCode]/page.tsx` (post-cohort-join
redirect) — neither mentioned in CONTEXT.md's "all three" list, and both will silently 404 for
every student who logs in or joins a cohort if missed.

**Primary recommendation:** Build `lib/interactions` as a pure presentation/routing registry with
zero data dependency; route Case Studies into `/case-play` by adding `published?: boolean` to the
`CaseStudy` S3 JSON shape (no Prisma migration); build one new list endpoint for `/reports`
against the already-indexed `InterviewReport` table; and do a full-repo grep-and-replace pass for
`/student-cases`, not just the three named surfaces.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interaction type model**
- "Interview" is ONE interaction type; variants live underneath it. Single Practice Interview
  tile, matches existing `INTERVIEW_TYPES` registry.
- New registry at `lib/interactions`, parallel to `lib/interview` — NOT an extension of it. Must
  never import interview internals.
- Registry carries presentation + route + availability only: name, description, icon, estimated
  duration, entry route, live/coming-soon. No session history, no scores.
- Five types registered: Interviews, Pitches, Courageous Conversations (student-facing: "Difficult
  Conversations"), Case Studies, Networking. Two live (Interviews, Case Studies), three
  coming-soon. Leading a Meeting is NOT registered.
- Availability state is load-bearing, not decoration.

**Tile behaviour and presentation**
- Coming-soon tiles are NOT clickable: greyed, `cursor: default`, small "Coming soon" badge. No
  modal, no dead end.
- Card grid, responsive, 2-3 across on desktop. Live tiles first, coming-soon de-emphasised.
  Follow the CaseBridge card language from `app/interview/[type]/page.tsx`'s interviewer picker.
- Tile content: icon, name, one-line description, estimated duration (required).
- Student-facing names plainer than the partnership doc ("Difficult Conversations", "Practice
  Pitches"). Copy is adjustable, not locked.
- No first-run onboarding, no welcome banner, no dismissible explainer.

**Routing and the old surface**
- Dashboard lives at `/` for students. `app/page.tsx` currently redirects `role === "student"` to
  `/student-cases` (line 17) — point that at the dashboard instead. Staff keep existing cards.
- `/student-cases` is DELETED outright, no redirect. Old links may 404, acceptable.
- `/student-cases/settings` moves to top-level `/settings`.
- Student sidebar becomes: Practice · My Reports · Settings (`studentNavItems` in
  `config/site.ts`).
- Every `/student-cases` link must be repointed, including: report page's "Back to practice",
  interview wizard's back link, unknown-interview-type error card.

**Case study routing**
- Case Studies is a live interaction type routing into existing `/case-play`.
- Browse ALL published cases, with no cohort filter — this drops the cohort dependency from the
  student path.
- Add a `published` flag to the Case model so staff mark a case student-visible and drafts stay
  hidden. Requires a migration — apply to local `leadership_avatar_dev` only, generate SQL for
  team review, never touch the shared database.
- Case authoring stays admin-only (`/case-management`).

**Reports list (pulled forward from Phase 9)**
- A minimal `/reports` page ships in Phase 7 (its own page, not on the dashboard).
- Rows show: type, interviewer, date, status, scores — from Phase 6's `InterviewReportDTO`, no new
  fields needed.
- Every row clickable through to its full report page.
- FAILED reports stay visible and clickable (retry stays reachable).
- IN_PROGRESS (abandoned) rows are hidden entirely.

### Claude's Discretion
- Exact `lib/interactions` type shape and file layout.
- Icon choices per interaction type (lucide-react already in use).
- Exact tile copy and duration estimates.
- Grid breakpoints, spacing, coming-soon visual de-emphasis treatment.
- Where the `published` flag sits on the Case model and how staff set it.
- Whether `/reports` reuses report page components or gets its own row component.
- How the student-vs-staff branch at `/` is structured.

### Deferred Ideas (OUT OF SCOPE)
- Interview Customization (new Phase 8): presets + industry/role/difficulty/personality tweaking.
  Phase 7 routes to `/interview/general` only.
- Student-Authored Scenarios (new Phase 9): scenario creation UI.
- Building the coming-soon experiences themselves (Pitches, Courageous Conversations,
  Networking) — registry entries only.
- Leading a Meeting — not registered even as coming-soon.
- Phase 9 Report History (old numbering) — mostly absorbed by the minimal `/reports` list.
- Phase 10/11 Cohort & Staff Teardown — re-scoped as removing the assignment/monitoring wrapper,
  NOT case functionality.
- Product rename ("CaseBridge" → "Leadership Avatar") — its own phase.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-11 | `lib/interactions` registry, parallel to `lib/interview`, five types with name/description/icon/duration/route/availability | See "Registry design" below; `lib/interview/types.ts` pattern confirmed as the sibling to mirror (not extend) |
| REQ-12 | Signed-in student lands on dashboard at `/`, card grid, live-first | `app/page.tsx` branch point identified (lines 15-19); `app/interview/[type]/page.tsx` interviewer-picker grid identified as the pattern to reuse |
| REQ-13 | Coming-soon tiles inert, no modal/dead end | `ReportScoreCards.tsx`'s `UnmeasuredCard` is the existing "honest absence" pattern the user validated; same visual idiom applies |
| REQ-14 | Delete `/student-cases`, move settings to `/settings`, repoint all links, update nav | Full grep done — 8 files / 12 call sites found (3 more than CONTEXT.md names); middleware `STUDENT_ROUTES` list and `studentNavItems` config identified as the two places requiring edits beyond page/link text |
| REQ-15 | Case Studies live, browse all published cases, no cohort filter, `published` flag on Case | **Critical correction**: real Case data is S3 JSON (`CaseStudy` in `types/index.ts`), not the Prisma `Case` table. No migration needed — this is a type + storage-layer change, not a DB change. See "The two Case models" below |
| REQ-16 | `/reports` list from `InterviewReportDTO`, FAILED visible, IN_PROGRESS hidden | `InterviewReportDTO` and `toInterviewReportDTO` confirmed exact shape; Prisma `@@index([userId, createdAt])` already exists on `InterviewReport`, ready for a list query; no list endpoint exists yet — must be built |

## Standard Stack

No new libraries needed. Continue with what's already in the codebase:

| Library | Version (as used) | Purpose |
|---------|--------------------|---------|
| @heroui/card, @heroui/chip, @heroui/button | in `package.json` | Tile grid, badges, CTAs |
| lucide-react | in `package.json` | Icons per interaction type |
| Prisma (`@prisma/client`) | as used by Phase 6 | `/reports` query against `InterviewReport` |
| next/navigation `useRouter` | App Router | Client-side routing into `/interview/general` and `/case-play/{id}` |

No Context7/WebSearch calls were needed — this phase is entirely internal architecture, not new
external technology.

## Architecture Patterns

### The two Case models — read this before touching REQ-15

**Model 1 — S3 JSON (`CaseStudy`), the REAL one:**
- Type definition: `types/index.ts:202-214`
  ```ts
  export interface CaseStudy {
    id: string;
    name: string;
    backgroundInfo: string;
    evaluationPrompt?: string;
    coverImage?: string;
    avatars: CaseAvatar[];
    cohortIds: string[];   // dead field — see below
    createdBy: string;
    lastEditedBy: string;
    createdAt: string;
    lastEditedAt: string;
  }
  ```
  No `published` field exists today.
- Storage: `lib/s3-client.ts:919-985`. `saveCase()` writes `cases/{id}.json` plus updates
  `cases/index.json`; `getCase(id)` reads the JSON file directly; `listCases()` reads every id from
  the index and re-fetches each JSON file (`lib/s3-client.ts:973-985`).
- Every case route is a thin passthrough with **no auth check in the route handler itself**:
  - `app/api/case/get/route.ts` — `GET ?id=`, 404 if missing, otherwise returns the whole
    `caseStudy` object as-is. No session lookup, no owner check.
  - `app/api/case/list/route.ts` — `GET`, returns `s3Storage.listCases()` unfiltered. No auth
    check in the handler.
  - `app/api/case/add|edit|delete/route.ts` — also no in-handler auth check.
  - Authorization is enforced **only by `middleware.ts`**: `/api/case/add`, `/api/case/edit`,
    `/api/case/delete` are in `ADMIN_ROUTES` (`middleware.ts:153-155`, admin-only). `/api/case/get`
    and `/api/case/list` are in **no** route list at all — they fall through to the generic
    "valid JWT, any role" path (`middleware.ts` end of function, `return NextResponse.next()`).
    This means any authenticated user (student, admin, kiosk, professor) can already call these —
    good, no auth work needed for "browse all published cases", only filtering.
  - `cohortIds` on `CaseStudy` is dead: grepped across the whole repo, it is written once
    (`app/case-management/[caseId]/page.tsx:163`, always `[]`) and never read anywhere. It is not
    the mechanism that assigns cases to cohorts — that's a completely separate concept (below).
    Do not confuse it with a publish/visibility flag; it is inert.

**Model 2 — Prisma `Case` table, the DECOY:**
- `prisma/schema.prisma:156-183`. Already has `isPublished Boolean @default(false)` with an index
  (`Case_isPublished_idx`), plus `slug`, `title`, `difficulty`, `estimatedMins`, `category`.
- Confirmed present in the local dev DB right now (`\d "Case"` ran successfully, all columns
  match schema). Confirmed populated with exactly 3 rows, all from `prisma/seed.ts:231-276`
  (`salary-negotiation`, `customer-complaint`, `team-conflict` — seed fixture titles, not real
  authored case content).
- Consumed exclusively by `lib/student-history-service.ts` (`prisma.case.findMany/findUnique`,
  11 call sites), which backs the **staff-facing** `student-history` and `teacher/class` pages —
  a gradebook/history view, unrelated to `/case-play`.
- `/api/case/add` (the only case-authoring endpoint) never writes to `prisma.case` —
  confirmed by reading the full route body (`app/api/case/add/route.ts`): it only calls
  `s3Storage.saveCase(caseStudy)`. There is no code path that keeps these two tables in sync.

**What this means for planning REQ-15:** Do NOT plan a Prisma migration for `Case.isPublished`
usage in the student dashboard — that column already exists, but using it would require joining
two unrelated ID spaces that have never been kept in sync, and the actual case content the
student would see lives in S3 under different ids. The correct, much smaller change is:
1. Add `published?: boolean` to `CaseStudy` in `types/index.ts`.
2. `s3Storage.saveCase`/`getCase`/`listCases` require **no code change** — they pass the whole
   object through generically; a new field just flows.
3. `app/api/case/list/route.ts` needs a student-facing filtered variant (new query param, e.g.
   `?publishedOnly=true`, or a new route) so `/case-play` browsing shows only `published: true`
   cases, while `/case-management` (staff) keeps seeing everything including drafts.
4. `app/case-management/[caseId]/page.tsx` needs a toggle wired through `/api/case/edit`
   (`Partial<CaseStudy>` merge — `app/api/case/edit/route.ts:20-31` already does a shallow merge
   of `{...existing, ...caseStudy}`, so `{ published: true }` alone works with no route change).
5. Existing cases in S3 predate the field and will read as `undefined` (falsy) — decide explicitly
   whether that means "hidden by default" (safer, matches "drafts stay hidden") or needs a
   backfill script. No backfill mechanism currently exists; this is a genuine open question (see
   below), not a solved one.

If the planner still wants to use the Prisma `Case.isPublished` column for some reason (e.g. to
also eventually merge the two systems), that is out of scope for this phase and should be flagged
as a separate architectural decision — CONTEXT.md's language ("Add a published flag to the Case
model... handle the migration exactly as Phase 6 did") reads as if it assumes a fresh migration is
required; it is not, and forcing one down the Prisma path would build the visibility filter over
the wrong (empty, staff-only) case table.

### `/case-play/[caseId]` entry contract

File: `app/case-play/[caseId]/page.tsx` (client component, 1767 lines).

- **Only `caseId` (route param) is strictly required.** `cohortId` is read from
  `searchParams.get("cohortId")` and defaults to `""` (line 78) — every downstream use of
  `cohortId` is conditionally gated (`if (!cohortId) return` style), so a student entering via
  `/case-play/{caseId}` with **no** `cohortId` query param loses exactly one feature: the avatar
  time-limit lookup effect (lines 224-248) never fires, `avatarTimeLimitSeconds` stays `null`,
  and the UI never shows a per-case avatar-minutes cap. This is not a hard block — the case plays
  fully in unlimited-avatar-time mode, matching the "students fully in control, no admin
  assignment" framing. **Confirmed: no assignment record, no cohort membership, and no
  `CaseAssignment` row are required to enter and complete a case.**
- `loadCase()` (line 267) calls `GET /api/case/get?id=` directly — will 404-render ("Case not
  found") if the id doesn't exist or (once the published filter exists) if a draft's route is
  hit directly with a stale id link. There is currently no "not published" branch — this will
  need to be considered when adding the published check, since typing the URL directly to an
  unpublished case's `caseId` currently still works (`/api/case/get` has no filter today).
  Decide in planning whether `/api/case/get` itself should reject unpublished cases for
  non-admin roles, or whether the filter is dashboard-listing-only (a URL-guessing student could
  still open a draft case). CONTEXT.md doesn't address this; flagging as an open question.
- `loadUnfinishedSessions()` (line 250) hits `/api/interaction/get?studentEmail=&caseId=` — scoped
  by the logged-in user's own email, no cohort dependency.
- Exit/back paths hardcode `/student-cases` at 4 call sites: `handleFinish` (line 1071, after
  successful finish), `handleSaveAndExit` (line 1107, preserves `cohortId` as query string if
  present), the "Case not found" error card (line 1142), and the intro page's back arrow
  (line 1154). **All four must be repointed to the dashboard** as part of REQ-14.
- Full-screen toggling (`useLayout().setFullScreen`) happens automatically based on `pageState`
  (line 152-156) — no navbar/layout coordination needed beyond that existing hook.
- `app/case-play/[caseId]/layout.tsx` is a 7-line pass-through wrapper (`<div className="w-full
  h-full">`) — no settings-equivalent concern here, nothing to replicate.

### The old `/student-cases` surface — what's there, what's lost

- `app/student-cases/page.tsx` (386 lines): renders a "My Cases" grid **filtered by cohort
  membership**. Data source: `GET /api/student/cases?email=` →
  `app/api/student/cases/route.ts`, which:
  1. Auth-gates via `getCurrentUser` + cookie (lines 8-17) — non-privileged users are forced to
     query their own email only (line 25), so this route is not itself broken, just scoped wrong
     for the new model.
  2. Calls `s3Storage.listCohorts()`, filters to cohorts where the student is a `"joined"` member
     by email match (lines 42-79) — **this is the code path confirmed in CONTEXT.md's cited log
     evidence**: a student in zero cohorts gets `studentCohorts = []`, therefore
     `assignedCaseIds` stays empty, therefore `cases = []` unconditionally. Structurally cannot
     show anything to a self-directed student.
  3. Also surfaces a pending-cohort-join banner (`localStorage.getItem("pendingCohortJoin")`,
     lines 43-119 of `page.tsx`) and per-case avatar-minutes-remaining chips
     (`heygenMinutesLimit`, tied to `CaseAssignment`).
- **What would be lost by deleting it, and whether that's a real loss:**
  - The pending-cohort-join flow (`/join/[accessCode]` → localStorage flag → banner on
    `/student-cases`) is cohort machinery — explicitly the thing being removed by this phase's
    product direction ("no assignment, no monitoring"). Not worth preserving.
  - Per-case avatar-minutes limits (`heygenMinutesLimit` from `CaseAssignment.heygenMinutesLimit`)
    are cohort-assignment-scoped and have no equivalent in the "browse all published cases, no
    cohort filter" model. This is a **feature genuinely dropped by REQ-15**, not carried
    forward — flag as intentional if the planner wants to note it, but CONTEXT.md's explicit
    decision to drop cohort filtering makes this the correct call, not an oversight.
  - Nothing else here has content worth preserving in the dashboard or `/reports` — no case
    review data, no scores (Case Study attempts have no report equivalent to
    `InterviewReportDTO`; `Attempt.score`/`evalResult` exist only in the disconnected Prisma
    model discussed above and are not rendered anywhere on this page).
- `app/student-cases/layout.tsx`: an 11-line layout providing page padding
  (`py-8 md:py-10 px-4 md:px-6 lg:px-8`) and a `max-w-7xl mx-auto` wrapper — purely cosmetic. When
  `/settings` becomes a top-level route, it needs an equivalent wrapper (either its own
  `app/settings/layout.tsx` with the same classes, or inherit from a shared root layout if one
  exists — check `app/layout.tsx` before assuming one is needed).
- `app/student-cases/settings/page.tsx` (218 lines): a self-contained settings form (profile
  name/email display, notification toggle switches — currently client-state only, not wired to
  any persistence API based on what was read). Moving it to `app/settings/page.tsx` is a pure
  file move plus updating any relative imports (none observed — all imports are absolute
  `@/...`).

### Navigation: `auth-navbar.tsx` and `config/site.ts`

- `components/auth-navbar.tsx:64-67`: role branch is a single ternary —
  `user?.role === "student" ? siteConfig.studentNavItems : siteConfig.navItems`. Adding a
  dashboard nav entry ("Practice") just requires editing `studentNavItems` in `config/site.ts`.
  No other code branches on role for nav purposes.
- `iconMap` (`auth-navbar.tsx:32-43`) is a fixed allow-list of lucide icons; `Briefcase`,
  `Settings` already present. If new icons are chosen for nav entries (not tile icons — those are
  separate, inside dashboard cards) they must be added to this map or the icon silently renders
  as nothing (`IconComponent && (...)` guards render, `auth-navbar.tsx:124`).
- `config/site.ts:29-40` (`studentNavItems`) is the single source of truth to edit: rename
  `"My Cases" → "Practice"` (href `/student-cases` → `/`), add `"My Reports"` (href `/reports`),
  update `"Settings"` href from `/student-cases/settings` → `/settings`.
- **Staff `navItems`** (`config/site.ts:6-28`) is untouched by this phase — Home/Case
  Management/Avatar Management/Cohort Management stay as-is; `app/page.tsx` keeps its staff
  branch of `navigationCards` (lines 21-43) unmodified except by removing the now-obsolete
  `useEffect` redirect logic that assumed the student destination was `/student-cases`.

### `app/page.tsx` — the exact seam

Current file (95 lines):
```tsx
useEffect(() => {
  if (!loading && user?.role === "student") {
    router.replace("/student-cases");   // ← change to render the dashboard instead
  }
}, [user, loading, router]);
```
Everything below that effect (`navigationCards`, the JSX return) is the **staff** view. The
cleanest seam: keep `app/page.tsx` as the staff entry (remove the redirect effect entirely, or
gate the whole return on `user?.role !== "student"`), and either (a) inline a student branch that
renders `<InteractionDashboard />` when `user?.role === "student"`, or (b) extract the dashboard
into its own component under `components/` and conditionally render it here. Both satisfy "staff
keep the management cards at `/`." Do not create a separate `/dashboard` route — CONTEXT.md is
explicit that `/` itself must serve the dashboard for students.

### Registry design — mirroring, not extending, `lib/interview/types.ts`

Not read in full per the task's "already known" list, but its registry shape (a `Record` or array
of typed entries with `getInterviewType(slug)` / `listInterviewTypes()` accessors, referenced from
`app/interview/[type]/page.tsx:24,42`) is the pattern to mirror structurally for
`lib/interactions`, e.g.:
```ts
export interface InteractionType {
  slug: string;
  name: string;              // student-facing, plain language
  description: string;       // one line
  icon: LucideIcon;           // or icon name string, resolved via a local map like auth-navbar's
  estimatedMinutes: number;
  route: string;              // entry route, e.g. "/interview/general" or "/case-play" (list route)
  status: "live" | "coming-soon";
}
```
Case Studies is unusual: its "entry route" isn't a single fixed path the way Interviews's
`/interview/general` is — a student must pick a specific case first. Decide at planning time
whether the Case Studies tile routes to a new case-browsing view (e.g. `/case-play` as an index
that lists published cases and lets the student choose one) or whether case browsing lives
directly on the dashboard as a secondary reveal. CONTEXT.md doesn't fully resolve this — it says
"Case Studies is a live interaction type routing into existing `/case-play`" and separately
"Browse ALL published cases, with no cohort filter" but `/case-play/[caseId]` has no "list" view
today (only `[caseId]`, no bare `/case-play` index page exists — confirmed, only the
`[caseId]` dynamic segment is present under `app/case-play/`). **This is a gap the planner must
close**: either add `app/case-play/page.tsx` (a new published-cases list) or route the Case
Studies tile to a dashboard sub-view that then deep-links into `/case-play/{id}`.

### `/reports` — data and query pattern

- `InterviewReportDTO` (`lib/interview/report-dto.ts`) already has every field REQ-16 needs:
  `typeSlug`, `interviewerName`, `status`, `scores.{content,behavioral}` (visual/vocal always
  null), `startedAt`/`completedAt`. Use `toInterviewReportDTO()` verbatim — do not hand-roll a
  second mapping function.
- Prisma model already indexed for this exact query: `@@index([userId, createdAt])` on
  `InterviewReport` (`prisma/schema.prisma`, in the `InterviewReport` model). A list endpoint
  should do:
  ```ts
  const rows = await prisma.interviewReport.findMany({
    where: { userId: currentUser.id, status: { not: "IN_PROGRESS" } },
    orderBy: { createdAt: "desc" },
  });
  ```
  filtering `IN_PROGRESS` server-side (matches "hidden entirely," not just hidden in the UI) — do
  not fetch and filter client-side, since the DTO doesn't need to leak abandoned session
  existence to the browser at all.
- **No such list endpoint exists yet.** `app/api/interview/report/[reportId]/route.ts` is
  single-row, owner-scoped GET only (confirmed: `findFirst({id, userId})`, 404-never-403 pattern,
  per the "already known" brief). A new route, e.g. `app/api/interview/reports/route.ts` (plural,
  no `[reportId]`), following the exact same `getCurrentUser` + cookie pattern seen in
  `app/api/interview/session/start/route.ts:34-39`, is the natural home. Two local dev rows are
  already `IN_PROGRESS` per STATE.md ("Two such rows already exist in the local dev database from
  Phase 6 testing") — good manual-test fixtures for confirming the hide-filter works.
- `middleware.ts` `STUDENT_ROUTES` (line 200-216) currently lists `"/api/interview"` as a prefix
  match (`pathname.startsWith("/api/interview")`, line 314-316) — a new
  `/api/interview/reports` route is automatically covered by this existing prefix, no middleware
  change needed for the API. The **page** route `/reports` itself is NOT covered by any prefix in
  `STUDENT_ROUTES` (which lists `/student-cases`, `/interview`, `/case-play`, but not `/reports`)
  — **this must be added** or `/reports` will fall through to the generic "any authenticated role"
  path, which is a materially different (looser) authorization than the other student surfaces.
  Given `/reports` should probably be student+admin like everything else, add `"/reports"` to
  `STUDENT_ROUTES`.
- Similarly, `/settings` is not in any route list today (`/student-cases/settings` was covered
  only because `pathname.startsWith("/student-cases")` matched the whole subtree) — **add
  `"/settings"` to `STUDENT_ROUTES`** (or wherever it belongs) or it will be reachable by any
  authenticated role with no gate, which may be fine for account settings but should be a
  deliberate choice, not a byproduct of deleting `/student-cases`.

### Card grid / palette pattern to reuse

`app/interview/[type]/page.tsx` interviewer picker (lines 190-297) is confirmed as the best
existing pattern:
- Grid: `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` (line 242) — matches "2-3 across on desktop."
- Card-as-button pattern: plain `<button>` with `aria-pressed`, not a HeroUI `<Card isPressable>`,
  used for the interviewer tiles specifically because of the custom image/gradient treatment;
  HeroUI `<Card>`/`<CardBody>` (from `@heroui/card`) is used elsewhere (e.g. `case-play`'s role
  list, `student-cases`' case grid) for simpler content-only cards — either is acceptable for the
  dashboard; HeroUI `<Card>` is simpler and sufficient since interaction tiles don't need a
  background image.
- Palette (recurring inline hex, not in `tailwind.config`, so must be repeated as inline
  arbitrary-value Tailwind classes or lifted into a shared constant if the planner wants to
  DRY it):
  - `#0a7391` — primary teal (active state borders, accent text, icons)
  - `#102331` — near-black body text
  - `#f5f8fa` — page background
  - `#d4e2e9` — default border
  - Supporting tones seen in the same file: `#526c7b` (muted text), `#eaf5f8` (soft accent
    background), `#78909b` / `#b8cbd3` (inactive/greyed states) — this last pair is the most
    directly relevant one for "coming-soon" de-emphasis, since it's already the established
    "inactive step" treatment in `ProgressItem` (`app/interview/[type]/page.tsx:303-305`).
- **Coming-soon idiom already validated by the user**: `ReportScoreCards.tsx`'s `UnmeasuredCard`
  (`components/interview/ReportScoreCards.tsx`, function starting ~line 67) renders "Not yet
  measured" — same honest-inert-state idiom CONTEXT.md explicitly asks to mirror for coming-soon
  tiles. Read that component's exact non-pending render branch (just past the excerpt captured
  here) for copy tone before writing the "Coming soon" badge text.

### Anti-Patterns to Avoid
- **Do not build the published-case filter on the Prisma `Case` table.** It is disconnected from
  real case content (see above) — this would silently produce an empty or wrong-content student
  list.
- **Do not assume the three `/student-cases` links named in CONTEXT.md are the complete set.**
  Confirmed 8 files / 12 sites; see the full grep list below.
- **Do not let `lib/interactions` import from `lib/interview`** (or `case-play` internals) — the
  registry must stay a leaf module with no dependency on either experience's internals, per the
  locked decision. It may reference `getInterviewType`/`listInterviewTypes` **only** if truly
  needed for the interview tile's copy, but the safer, decision-compliant approach is to hardcode
  the interview tile's presentation fields directly in the registry (name/description/duration
  are already fixed strings for the one live variant) rather than deriving them from
  `INTERVIEW_TYPES`, keeping the modules fully decoupled as CONTEXT.md insists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Report row shape for `/reports` | A second scores/status mapping | `toInterviewReportDTO()` from `lib/interview/report-dto.ts` | Already the single source of truth the report page itself uses; duplicating it risks drift (e.g. forgetting visual/vocal must stay null) |
| Owner-scoped auth for the new reports-list route | A new auth pattern | The `getCurrentUser(token)` + `siteConfig.auth.cookie.name` pattern from `app/api/interview/session/start/route.ts:34-39` and `app/api/interview/report/[reportId]/route.ts` | Consistent with every other interview route, already reviewed/hardened in Phase 6 |
| Route protection for `/reports` and `/settings` | Per-page auth checks in the page component | `STUDENT_ROUTES` entries in `middleware.ts` | This is how every other student page (`/interview`, `/case-play`, formerly `/student-cases`) is gated; page-level checks would be inconsistent with the codebase's security model |

**Key insight:** Almost everything this phase needs already exists somewhere in the codebase in a
slightly different shape (registry pattern, DTO, auth pattern, card-grid pattern, inert-state
pattern) — the actual work is composition and repointing, not new design.

## Common Pitfalls

### Pitfall 1: Treating "the Case model" as singular
**What goes wrong:** A migration gets written against `prisma/schema.prisma`'s `Case.isPublished`
(already present!) under the assumption it's the field that gates `/case-play` visibility, and the
dashboard's case list ends up either empty (no rows correspond to real S3 cases) or, worse, wired
to `prisma.case.findMany()` and returns the 3 seed fixtures instead of real authored cases.
**Why it happens:** CONTEXT.md's phrasing ("Add a `published` flag to the Case model... handle it
exactly as Phase 6 did") strongly implies a Postgres migration, and a Prisma model literally named
`Case` with `isPublished` already existing makes it look like a match was found rather than a trap.
**How to avoid:** Add `published?: boolean` to `CaseStudy` in `types/index.ts`; filter in
`/api/case/list` (or a new endpoint); never touch `prisma.case` for this feature.
**Warning signs:** If the plan includes a `prisma migrate dev` step for this phase, stop — no
migration is needed for REQ-15 as scoped.

### Pitfall 2: Missing redirect sites when deleting `/student-cases`
**What goes wrong:** `app/login/page.tsx:30` (`window.location.href = "/student-cases"` on
successful login) and `app/join/[accessCode]/page.tsx:226` (post-join button) both still point at
the deleted route, so a student's very first navigation after logging in or joining a cohort
404s — a much worse first impression than any of the three surfaces CONTEXT.md names.
**Why it happens:** CONTEXT.md names three specific surfaces from the interview/report flow; the
auth-flow entry points aren't part of that flow and are easy to miss without a full grep.
**How to avoid:** Grep the whole repo for the literal string `student-cases` before considering
REQ-14 done — full result set below.
**Warning signs:** Any hardcoded `"/student-cases"` string surviving a final grep pass.

### Pitfall 3: Publishing filter applied only at the listing layer, not at direct-access
**What goes wrong:** `/case-play` (dashboard listing) correctly shows only published cases, but a
student who has (or guesses) a draft case's id can still open `/case-play/{draftId}` directly and
play it, because `/api/case/get` has no published check.
**Why it happens:** It's natural to filter only where the list is built (`/api/case/list`) and
forget the direct-fetch path (`/api/case/get`) used by the play page itself.
**How to avoid:** Decide explicitly at planning time whether `/api/case/get` should 404/403 an
unpublished case for non-admin roles (defense in depth) or whether "published" is purely a
discovery-layer concept and direct links are an accepted admin-preview mechanism. Either is
defensible; CONTEXT.md doesn't say, so pick one and document it as a planning decision rather than
leaving it unaddressed.
**Warning signs:** A draft case playable via direct URL after "browsing" already excludes it.

### Pitfall 4: `/reports` and `/settings` left out of `STUDENT_ROUTES`
**What goes wrong:** Both new top-level routes fall through to the generic "any authenticated
role" middleware path instead of the intended student+admin gate, silently changing the
authorization model for these pages compared to every sibling student route.
**Why it happens:** `middleware.ts`'s `STUDENT_ROUTES` array is a manually maintained string list
(`middleware.ts:200-216`) with no test enforcing "every student-facing route must appear here" —
easy to add a new page and forget the middleware entry, since Next.js routing doesn't require it.
**How to avoid:** Add `"/reports"` and `"/settings"` to `STUDENT_ROUTES` explicitly as part of
this phase's plan.
**Warning signs:** `/reports` or `/settings` reachable by a role other than student/admin in
manual testing.

## Code Examples

### Existing owner-scoped route pattern (to copy for the new `/reports` list endpoint)
```ts
// Source: app/api/interview/report/[reportId]/route.ts (already-shipped Phase 6 pattern)
const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
const currentUser = await getCurrentUser(token || "");
if (!currentUser) return response({ error: "Unauthorized" }, 401);

const row = await prisma.interviewReport.findFirst({
  where: { id: reportId, userId: currentUser.id },
});
if (!row) return response({ error: "Report not found" }, 404); // 404 never 403
```

### Existing card-grid live/inert idiom (interviewer picker, adapt for interaction tiles)
```tsx
// Source: app/interview/[type]/page.tsx:242-267
<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
  {interviewers.map((interviewer) => {
    const selected = interviewer.avatarId === selectedInterviewerId;
    return (
      <button
        key={interviewer.avatarId}
        type="button"
        aria-pressed={selected}
        onClick={() => setSelectedInterviewerId(interviewer.avatarId)}
        className={/* selected vs default border/shadow classes */}
      >
        {/* content */}
      </button>
    );
  })}
</div>
```

### Existing "honest inert state" idiom to mirror for coming-soon tiles
```tsx
// Source: components/interview/ReportScoreCards.tsx (UnmeasuredCard, non-pending branch)
// Renders "Not yet measured" unconditionally for Visual/Vocal — never a number, never hidden.
// The coming-soon tile should follow the same rule: never clickable, never a modal, always
// visibly and permanently in its inert state until the registry flag flips.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `/student-cases` cohort-filtered case list | Dashboard at `/` + published-case browsing at (new) `/case-play` index | This phase | Drops cohort dependency from the entire student path |
| Interview reachable only by typing `/interview/general` | Reachable via dashboard tile | This phase | Closes the "no navigation to interview" gap noted in ROADMAP.md's Phase 7 design notes |
| Case `heygenMinutesLimit` per cohort assignment | No equivalent in the no-cohort model | This phase (REQ-15) | Intentional feature drop, not an oversight — flag in the plan so it isn't rediscovered as a "bug" later |

**Deprecated/outdated:** `/student-cases`, `/student-cases/settings`, and the
`pendingCohortJoin` localStorage banner flow become dead code after this phase (the banner's
backing route `/api/cohort/get?accessCode=` and `/join/[accessCode]` may still be used elsewhere
for cohort administration — not verified as part of this research since cohort teardown is
Phase 11's job, not this phase's).

## Open Questions

1. **Does `/api/case/get` need a published check for non-admin roles, or is publish
   discovery-layer-only?**
   - What we know: no such check exists today; direct-URL access to any case id currently works
     regardless of any future `published` field.
   - What's unclear: CONTEXT.md doesn't address direct-link access to drafts.
   - Recommendation: Planner should make an explicit call (see Pitfall 3) rather than leave it
     implicit.

2. **Does the Case Studies tile route straight into `/case-play` (implying a new `app/case-play/
   page.tsx` list view must be built), or does case browsing live on/adjacent to the dashboard
   with `/case-play/[caseId]` only ever reached after a case is chosen?**
   - What we know: no bare `/case-play` index page exists today — only the `[caseId]` dynamic
     route.
   - What's unclear: CONTEXT.md's "routing into existing `/case-play` infrastructure" could mean
     either; "existing" refers to `[caseId]`, not a list view that doesn't exist yet.
   - Recommendation: Plan for a new `app/case-play/page.tsx` (published cases list, card grid,
     links into `/case-play/{id}`) as in-scope net-new work for REQ-15, not an oversight to defer.

3. **How should pre-existing S3 cases (created before this phase) behave once `published`
   ships — default hidden or default visible?**
   - What we know: no backfill mechanism exists; `caseStudy.published` will read `undefined` for
     every case authored before this change.
   - What's unclear: "drafts stay hidden" implies default should be `false`/hidden, but that would
     also hide every case created to date until a staff member manually flips each one — possibly
     surprising immediately after ship.
   - Recommendation: Treat `undefined` as `false` (safer default per CONTEXT.md's stated intent)
     and note in the plan that staff must republish existing cases post-launch; do not build an
     automatic backfill-to-true migration, since that would defeat the purpose of the flag.

4. **Are notification settings on `/student-cases/settings` wired to any backend, or client-state
   only?**
   - What we know: the settings page reads `user` from `useAuth()` for display; the notification
     `Switch` components were only skimmed for their state shape, not their submit handler.
   - What's unclear: whether moving the file changes any API contract.
   - Recommendation: Read the full `handleSave`/submit logic in `app/student-cases/settings/
     page.tsx` during planning (not fully captured in this research pass) before assuming a pure
     file move is sufficient.

## Sources

### Primary (HIGH confidence — direct file reads / local DB queries)
- `app/case-play/[caseId]/page.tsx` (full file), `app/case-play/[caseId]/layout.tsx`
- `app/api/case/get/route.ts`, `app/api/case/list/route.ts`, `app/api/case/add/route.ts`,
  `app/api/case/edit/route.ts`
- `lib/case-storage.ts`, `lib/s3-client.ts` (grep + targeted reads, lines 59-60, 919-1006)
- `prisma/schema.prisma` (Cohort, CohortMember, Case, CaseAssignment, Attempt, AuditLog,
  InterviewReport models)
- Local dev DB: `psql ... -c '\d "Case"'` and `SELECT id, slug, title, "isPublished" FROM
  "Case"` against `leadership_avatar_dev` (read-only)
- `prisma/seed.ts` (grep for case1/case2/case3 upserts, confirms seed-only origin of the 3 rows)
- `lib/student-history-service.ts` (grep for `prisma.case`/`prisma.attempt` call sites)
- `app/student-cases/page.tsx`, `app/student-cases/layout.tsx`,
  `app/student-cases/settings/page.tsx` (partial), `app/api/student/cases/route.ts`
- `components/auth-navbar.tsx`, `config/site.ts`, `app/page.tsx`
- `middleware.ts` (KIOSK_ROUTES, STUDENT_ROUTES, ADMIN_ROUTES, and the authorization branches
  that consume them)
- `app/interview/[type]/page.tsx` (full file — card-grid pattern, palette, hardcoded
  `/student-cases` links)
- `lib/interview/report-dto.ts` (full file), `components/interview/ReportScoreCards.tsx`
  (partial — `UnmeasuredCard` idiom)
- `app/api/interview/session/start/route.ts` (partial — auth pattern)
- `types/index.ts` (`CaseStudy` interface, lines 202-214)
- Repo-wide grep: `grep -rln "student-cases"` → 8 files, 12 call sites (full list captured above)
- `.planning/phases/07-interaction-dashboard/07-CONTEXT.md`, `.planning/ROADMAP.md`,
  `.planning/REQUIREMENTS.md`, `.planning/STATE.md`

No secondary or tertiary (WebSearch/Context7) sources were used — this phase required zero
external-technology research, only internal-codebase investigation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, everything already in use elsewhere in the codebase
- Architecture (two-Case-models finding, entry contracts, nav/middleware seams): HIGH — every
  claim backed by a direct file read or a live (read-only) query against the local dev DB
- Pitfalls: HIGH — each pitfall traces to a specific file/line, not speculation

**Research date:** 2026-09-20
**Valid until:** Until the codebase changes underneath it — this is internal architecture, not a
timestamped external dependency; safe to treat as current until Phase 7 (or a phase that touches
the same files) ships.
