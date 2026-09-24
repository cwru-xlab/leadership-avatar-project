# Phase 7: Interaction Dashboard - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the cases/cohorts landing experience with a self-directed dashboard where a
student chooses a leadership interaction and is routed into it. The dashboard sits
one level ABOVE interview: interview is one kind of interaction, and the dashboard
is the branch point for future kinds.

**In scope:**
- A new `lib/interactions` registry listing interaction TYPES with availability state.
- The dashboard itself, at `/` for students, replacing the `/student-cases` redirect.
- Routing into the two live experiences: interviews and case studies.
- A `published` field on the S3 `CaseStudy` type (NOT a Postgres migration — see the
  corrected decision below) plus a new `/case-play` index page, so students browse
  ready cases without cohort membership.
- Deleting `/student-cases`, moving settings to `/settings`, reworking student nav.
- A minimal `/reports` list (pulled forward from Phase 9 — see below).
- Repointing every `/student-cases` link in the interview and report flows.

**Out of scope (each has its own phase — see Deferred):** interview customization
beyond routing, student-authored scenarios, building the Pitches / Courageous
Conversations / Networking experiences, multi-party simulations, cohort/staff teardown.

### Product frame — the XLAB / Leadership Institute partnership

The user supplied the partnership document (Fall 2026, undergraduate focus). Its
vision: immersive AI-enabled leadership simulations letting students practice
high-stakes professional situations in a low-risk environment, combining leadership
theory, EI, communication skills and real-time feedback.

Six proposed simulation areas:

| # | Area | Status for this phase |
|---|------|----------------------|
| 1 | Customizable Practice Interviews | **LIVE** — built in Phases 1-6 |
| 2 | Customizable Practice Pitches | registered, coming-soon |
| 3 | Courageous Conversations | registered, coming-soon |
| 4 | Case Study Scenarios | **LIVE** — existing `/case-play` infrastructure |
| 5 | Networking Practice | registered, coming-soon |
| 6 | Leading a Meeting | **NOT registered** — explicitly parked by the user |

**User priority:** areas 1, 2 and 3 are the most critical, specifically because they
are one-on-one interactions — the shape `InterviewSessionShell` already serves.

**Area 6 is deliberately excluded.** Leading a Meeting is potentially multi-party
rather than 1:1 and "would require more thinking on how we want to do that." Do not
register it as a coming-soon tile; it is not yet a decided product direction.

**The product may expand beyond these six.** The registry must not assume this list
is final.

### Important correction to an earlier assumption

Area 4 means the cases **code is not obsolete**. `/case-play`, the Case model, avatar
roles and evaluation prompts are the Case Study Scenarios experience, already built.
What is obsolete is the **admin-assignment-and-monitoring wrapper** — cohorts,
assignments, staff dashboards. Phase 10 should be scoped as removing that wrapper,
NOT as removing case functionality. STATE.md's "cohorts are being removed" note
should be read with this distinction.

</domain>

<decisions>
## Implementation Decisions

### Interaction type model

- **"Interview" is ONE interaction type; variants live underneath it.** The dashboard
  shows a single Practice Interview tile, not one tile per interview variant. This
  keeps the dashboard readable as variants grow and matches the existing
  `INTERVIEW_TYPES` registry — a future coding interview stays a record there, not a
  new dashboard concept.
- **New registry at `lib/interactions`**, parallel to `lib/interview` — NOT an
  extension of it. The dashboard must never import interview internals, and a future
  Pitches experience registers without touching interview code. A module named
  "interview" must not end up owning presentation practice.
- **Registry carries presentation + route + availability only:** name, description,
  icon, estimated duration, entry route, and whether the type is live or coming-soon.
  It does NOT carry session history, scores, or anything about how an experience
  works internally — those belong to the experience.
- **Five types registered:** Interviews, Pitches, Courageous Conversations, Case
  Studies, Networking. Two live (Interviews, Case Studies), three coming-soon.
  Leading a Meeting is NOT registered.
- **Availability state is load-bearing**, not decoration — the dashboard tells the
  true story of the product, and making an experience live later flips a flag rather
  than introducing a concept.

### Tile behaviour and presentation

- **Coming-soon tiles are NOT clickable.** Visibly inert — greyed, `cursor: default`,
  small "Coming soon" badge. No dead ends, no modal, no false promises. This mirrors
  the "Not yet measured" treatment on the Phase 6 report cards, which the user
  validated and liked.
- **Card grid**, responsive, 2-3 across on desktop. Live tiles first; coming-soon
  tiles follow, visually de-emphasised. Follow the existing CaseBridge card language
  (see the interviewer picker in `app/interview/[type]/page.tsx`).
- **Tile content:** icon, name, one-line description, estimated duration. Duration is
  required — knowing an interview runs ~20 minutes is the difference between starting
  now and deferring.
- **Student-facing names use plainer language than the partnership doc:** e.g.
  "Difficult Conversations" rather than "Courageous Conversations", "Practice
  Pitches" rather than "Customizable Practice Pitches". Legible to an undergraduate
  who has never seen the program doc. Treat exact copy as adjustable, not locked.
- **No first-run onboarding.** Five clearly labeled cards with descriptions are their
  own explanation. No welcome banner, no dismissible explainer, no per-user
  dismissal state.

### Routing and the old surface

- **Dashboard lives at `/` for students.** `app/page.tsx` currently redirects
  `role === "student"` to `/student-cases`; point that at the dashboard instead. Staff
  keep the existing management cards at `/`.
- **`/student-cases` is DELETED outright** — no redirect. Its cohort-scoped listing is
  the surface that is structurally empty for a self-directed student (confirmed in
  logs: Alice belongs to no cohort, so the page finds nothing). Old links may 404;
  acceptable at this stage.
- **`/student-cases/settings` moves to a top-level `/settings`.** Settings has nothing
  to do with cases and must not outlive the concept it was nested under.
- **Student sidebar becomes:** Practice · My Reports · Settings
  (`studentNavItems` in `config/site.ts`, rendered by `components/auth-navbar.tsx`).
- **`middleware.ts` route lists must be updated.** `/reports` and `/settings` are not
  in its `STUDENT_ROUTES` list; without adding them they fall through to a looser
  "any authenticated role" gate. Removing `/student-cases` requires the same care.
- **Every `/student-cases` link must be repointed to the dashboard.** Research found
  **13 call sites across 7 files**, NOT the 3 originally listed here. Two are
  critical and were missed in discussion:
  - `app/login/page.tsx:30` — the post-login redirect. Miss this and a student's very
    first navigation after signing in breaks.
  - `app/join/[accessCode]/page.tsx:226` — post-cohort-join redirect.
  Plus the known three: the report page's "Back to practice", the interview wizard's
  back link, and the unknown-interview-type error card. The planner must grep for all
  of them rather than working from any list.

### Case study routing

- **Case Studies is a live interaction type** routing into the existing `/case-play`
  infrastructure. A student picks a case and enters it with no admin assignment.
- **Browse ALL published cases, with no cohort filter.** This is the decision that
  drops the cohort dependency from the student path.
- **CORRECTED 2026-09-21 after research — the original decision here was wrong.**
  There are TWO unrelated "Case" concepts in this codebase:
  - The Prisma `Case` table ALREADY has `isPublished`, but holds only 3 seed fixtures
    and is consumed solely by the staff gradebook (`lib/student-history-service.ts`).
    It is NOT what `/case-play` plays.
  - The real cases are S3 JSON typed as `CaseStudy` in `types/index.ts`, read by
    `/api/case/get` via `s3Storage.getCase()`. That type has NO published field.

  **Therefore: NO Postgres migration. Add a `published` field to the S3 `CaseStudy`
  type and its storage handling.** Do not touch the Prisma `Case` table and do not
  join the two concepts — they are currently unrelated and must stay that way.
- **Absent `published` means UNPUBLISHED (hidden).** Existing S3 cases have no such
  field; they must not become student-visible by default. Expect the Case Studies
  tile to be empty until staff publish something — publish one case manually to
  validate the flow during execution.
- **`published` gates DISCOVERY ONLY, not access.** The listing hides unpublished
  cases; `/case-play/{caseId}` still plays them for anyone with the URL, which lets
  staff preview drafts. State plainly in the plan that this is a visibility filter,
  NOT an access control. Enforcing it at `/api/case/get` is deferred — that route is
  also used by kiosk and join-by-code flows.
- **Case list UI is a NEW `/case-play` index page.** No bare `/case-play` route
  exists today — only the `[caseId]` dynamic route. The dashboard tile routes to
  `/case-play`, which lists published cases; picking one goes to `/case-play/{caseId}`.
  The dashboard stays a pure launcher and does not itself know about case data.
- **Case authoring stays admin-only.** Staff still write cases in `/case-management`;
  only discovery changes. (Student-authored scenarios is deferred — see below.)

### Reports list (pulled forward from Phase 9)

- **A minimal `/reports` page ships in Phase 7**, because the sidebar carries a
  "My Reports" entry and a student who finishes an interview otherwise has no way
  back to it — the report URL is the only handle and nothing lists it.
- **Its own page, not on the dashboard.** The dashboard stays a clean launcher; no
  recent-reports strip, so it does not couple to report data or get heavier on load.
- **Rows show:** type, interviewer, date, status, scores — all already exposed by the
  Phase 6 `InterviewReportDTO`, so no new queries or fields are needed.
- **Every row is clickable through to its full report page.** The list is a real
  index, not a log.
- **FAILED reports stay visible and clickable**, so their retry remains reachable —
  that is the entire reason a failed evaluation is not discarded.
- **IN_PROGRESS (abandoned) rows are hidden entirely.** This matches the Phase 6
  decision that an abandoned session is invisible to the student. Showing them would
  invite "can I resume this?" and the answer is no — the avatar session is gone.
  (Two such rows already exist in the local dev database from Phase 6 testing.)
- Phase 9 consequently becomes polish — filtering, per-type grouping — or is absorbed
  entirely. Update the roadmap accordingly at planning time.

### Claude's Discretion

- Exact `lib/interactions` type shape and file layout.
- Icon choices per interaction type (lucide-react is already in use).
- Exact tile copy and duration estimates — adjustable, not locked.
- Grid breakpoints, spacing, and the visual treatment that de-emphasises coming-soon
  tiles.
- Where the `published` flag sits on the Case model and how staff set it.
- Whether `/reports` reuses report page components or gets its own row component.
- How the student-vs-staff branch at `/` is structured.

</decisions>

<specifics>
## Specific Ideas

- **"Students fully in control, without need for admin to assign them or even
  monitor them."** — the user's framing of the product shift. Every decision in this
  phase should be checked against it.
- The coming-soon treatment should feel like the Phase 6 report cards' "Not yet
  measured": honest about absence, clearly deliberate, never looking like a bug.
- The dashboard is a **branch point**, not an interview launcher with extra steps. Do
  not hard-code the landing experience to interviews — that is precisely the
  assumption this phase exists to remove.
- Duration on tiles matters to the user's stated audience (undergraduates deciding
  whether to start something now).

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion and are explicitly OUT of Phase 7. Add the first two
to ROADMAP.md as new phases so they are not lost.

- **Interview Customization (NEW PHASE).** The user wants "pick a preset, then
  optionally tweak it" — presets from `INTERVIEW_TYPES` plus an advanced reveal for
  industry, role, difficulty and interviewer personality, per the partnership doc's
  "adapt by industry, role, difficulty level, or interviewer personality". This makes
  `buildInterviewSystemPrompt` take runtime parameters and stops `INTERVIEW_TYPES`
  being a fixed catalog — real work in `lib/interview/prompts.ts` and
  `lib/interview/types.ts`, not dashboard work. Phase 7 routes to `/interview/general`
  only.
- **Student-Authored Scenarios (NEW PHASE).** The user wants students to create their
  own scenarios rather than only consuming admin-authored cases. A creation UI,
  storage, validation, and probably generated prompts and evaluation criteria — a
  distinct product capability, possibly two phases.
- **Building the coming-soon experiences** — Pitches, Courageous Conversations,
  Networking. Each is its own phase. Phase 7 only registers and advertises them.
- **Leading a Meeting** — multi-party simulation. Explicitly parked by the user as
  needing more thought; not registered even as coming-soon.
- **Phase 9 Report History** — largely absorbed by the minimal `/reports` list above.
  What remains is filtering and per-type grouping.
- **Phase 10 Cohort & Staff Teardown** — must be re-scoped in light of the case-study
  correction above: remove the assignment/monitoring wrapper, NOT case functionality.
- **Product rename** — "CaseBridge" strings remain throughout the UI. The user noted
  the product is now "Leadership Avatar". Its own phase; do not rename copy here.

</deferred>

---

*Phase: 07-interaction-dashboard*
*Context gathered: 2026-09-21*
