# Requirements

**Scope note:** Phases 1-5 shipped before this project used GSD and carry no REQ
IDs. Requirement tracking starts at Phase 6. IDs below are derived from the
decisions in `.planning/phases/06-interview-evaluation-and-report/06-CONTEXT.md`
— they restate what was decided, they do not add scope.

## Requirements

### Phase 6 — Evaluation & Student Report

- **REQ-01** — [x] `InterviewReport` exists as a Prisma model with a `User` relation,
  nullable `visualScore` / `vocalScore`, non-null-capable `contentScore` /
  `behavioralScore`, a markdown report body, and a status of
  `IN_PROGRESS | PENDING | READY | FAILED`. No `cohortId`, no assignment
  linkage, no staff-visibility field. *(Complete — 06-01)*

- **REQ-02** — [x] Migration SQL is generated for team review and applied only to a
  local/dev database. The shared database is not migrated by this phase.
  *(Complete — 06-01)*

- **REQ-03** — [x] An `InterviewReport` row is created on the first real interview
  turn (not on entering the session step), and the transcript is checkpointed
  server-side after every assistant turn without blocking the avatar stream.
  *(Endpoint complete — 06-03; client wiring complete — 06-06:
  `InterviewSessionShell.tsx`'s `ensureReport()`/`checkpoint()` call these
  endpoints from the first real assistant turn onward, fire-and-forget,
  never from an exit path)*

- **REQ-04** — [x] The canonical transcript is a purpose-built `InterviewTranscript`
  stored in S3 under a server-derived key; `InteractionLog` is not reused.
  *(Complete — 06-01)*

- **REQ-05** — [x] An authenticated finish endpoint accepts the completed transcript
  and resume context, flips the row to `PENDING`, returns a report ID
  immediately, and runs the evaluator in the background.
  *(Complete — 06-04)*

- **REQ-06** — [x] The evaluator invokes `INTERVIEW_EVALUATOR_PROMPT` in JSON mode
  against a model from `INTERVIEW_EVAL_MODEL` (default `gpt-4.1`), and stores
  four validated score fields plus the markdown report. Out-of-range or
  non-integer scores are coerced to null. Visual and Vocal remain null until a
  real metrics pipeline exists.
  *(Complete — 06-02 evaluator module; wired into the persistence lifecycle by 06-04)*

- **REQ-07** — [x] Evaluation failure retries once, then persists `FAILED` with a
  reason. The transcript survives regardless. A `FAILED` report can be re-run
  against the stored transcript under the same report ID; a `READY` report
  cannot be regenerated.
  *(Complete — 06-04)*

- **REQ-08** — [x] `/interview/[type]/report/[reportId]` renders the report, polls
  every 2s while `PENDING`, gives up at 2 minutes with a retry affordance, and
  shows a skeleton of the real layout while waiting.
  *(Complete — 06-05 delivered the owner-scoped GET endpoint the page polls,
  with `no-store` and a stable `InterviewReportDTO` shape; 06-07 delivered
  the page itself, its 2s poll loop with a 2-minute give-up, the real-layout
  pending skeleton, and the FAILED retry affordance, verified end-to-end
  against the local dev DB with a real evaluation run.)*

- **REQ-09** — [x] Report ownership is enforced from the authenticated JWT user.
  A report belonging to another user returns 404, identical to a nonexistent
  report. No staff or admin override exists.
  *(Pattern established — 06-03 session endpoints; confirmed on finish/retry — 06-04;
  confirmed on the report read endpoint — 06-05, verified end-to-end with two
  real users: owner 200, non-owner/nonexistent/malformed id all byte-identical
  404; carried into 06-07)*

- **REQ-10** — [x] The End-interview control is wired to the finish endpoint behind a
  confirm modal that names what happens next and warns on a very short
  transcript; the Leave control uses a distinct "leave without a report" confirm.
  *(06-06: `InterviewSessionShell.tsx` — shared confirm modal keyed by
  `exitIntent`, `handleEnd` calls `/api/interview/session/finish` and never
  `ensureReport()`, `handleLeave` calls `onExit()` directly; verified via
  `tsc --noEmit` and grep checks that no exit path can create a row)*

### Phase 7 — Interaction Dashboard

- **REQ-11** — [x] A `lib/interactions` registry, parallel to `lib/interview` and never
  importing its internals, lists interaction TYPES with name, description, icon,
  estimated duration, entry route, and availability state. Five types: Interviews and
  Case Studies live; Pitches, Difficult Conversations and Networking coming-soon.
  Leading a Meeting is NOT registered.
  *(07-01: `lib/interactions/types.ts` + `lib/interactions/index.ts` — five records,
  zero imports from `lib/interview`, `listInteractionTypes()` live-first,
  `getInteractionType(slug)`; `npx tsc --noEmit` clean)*

- **REQ-12** — [x] A signed-in student lands on the interaction dashboard at `/`, not on
  assigned cases. Tiles render as a responsive card grid with live types first,
  each showing icon, name, one-line description and estimated duration.
  *(07-04: `components/interactions/InteractionDashboard.tsx` renders
  `listInteractionTypes()` (live-first) in a `sm:grid-cols-2 xl:grid-cols-3` grid;
  `app/page.tsx` returns it directly for `user?.role === "student"`; `npx tsc --noEmit` clean)*

- **REQ-13** — [x] Coming-soon tiles are visibly inert: not clickable, greyed, badged.
  No modal, no dead end, no navigation.
  *(07-04: `components/interactions/InteractionTile.tsx`'s coming-soon branch is a
  non-interactive `<div>` with no `onClick`/`href`/`role="button"`, greyed palette,
  and a "Coming soon" badge)*

- **REQ-14** — [x] `/student-cases` is deleted, settings moves to a top-level `/settings`,
  student nav becomes Practice · My Reports · Settings, and every existing
  `/student-cases` link is repointed to the dashboard (report page "Back to practice",
  interview wizard back link, unknown-type error card).
  *(07-06: `app/student-cases/` deleted outright; `app/settings/page.tsx` (renamed via
  `git mv`) and `app/settings/layout.tsx` reproduce the moved page; `config/site.ts`
  `studentNavItems` is Practice (`/`) / My Reports (`/reports`) / Settings (`/settings`);
  `middleware.ts` `STUDENT_ROUTES` gates `/reports` and `/settings`; a fresh grep found and
  repointed 10 real `/student-cases` call sites across 5 files; final grep for
  `student-cases` in `app/`, `components/`, `lib/`, `config/`, `middleware.ts` returns
  nothing; `npx tsc --noEmit` clean)*

- **REQ-15** — [x] Case Studies is a live interaction type routing into existing
  `/case-play`. Students browse all published cases with no cohort filter, gated by a
  new `published` flag on the S3 `CaseStudy` type (`types/index.ts`), surfaced by a new
  `/case-play` index page.
  *(CORRECTED 2026-09-21 after research: this requirement originally called for a Postgres
  migration. There are two unrelated "Case" concepts — the Prisma `Case` table already has
  `isPublished` but holds 3 seed fixtures consumed only by the staff gradebook, and is NOT
  what `/case-play` plays. The real cases are S3 JSON. **No database migration is required
  or permitted in Phase 7.** Absent `published` means unpublished. The flag gates DISCOVERY
  only, not access — `/case-play/{id}` still plays an unpublished case by direct URL.)*
  *(07-02: `types/index.ts` adds optional `published?: boolean`; `GET /api/case/list`
  accepts `?publishedOnly=true` filtering strictly on `published === true`; the case
  editor exposes a Published `Switch` wired into both `caseStorage.add`/`update` save
  branches. No Prisma changes. The `/case-play` index consuming this ships in 07-05.)*
  *(07-05: new `app/case-play/page.tsx` fetches `?publishedOnly=true` and routes into
  `/case-play/{caseId}` with no `cohortId`. Verified end-to-end on the local dev DB:
  unpublished → empty index; published → visible; unpublished direct URL still plays.)*

- **REQ-16** — [x] `/reports` lists the signed-in student's reports newest-first showing
  type, interviewer, date, status and scores, each row clickable through to its full
  report. FAILED reports remain visible so retry stays reachable; IN_PROGRESS
  (abandoned) rows are hidden entirely.
  *(07-03: `GET /api/interview/reports` filters `status: { not: "IN_PROGRESS" }` in the
  Prisma `where` clause and maps rows through `toInterviewReportDTO` verbatim;
  `app/reports/page.tsx` renders type/interviewer/date/status/scores per row, every row
  including FAILED clickable through to `/interview/{typeSlug}/report/{id}`; verified
  against the local dev DB with a real user's 2 READY + 2 IN_PROGRESS fixture rows —
  only the 2 READY rows returned, newest-first)*

### Phase 8 — Interview Customization

*IDs derived from the decisions in
`.planning/phases/08-interview-customization/08-CONTEXT.md` — they restate what
was decided, they do not add scope.*

- **REQ-17** — [x] The interview registry holds 3-4 focused preset records, with today's
  `general` record preserved unchanged as the default and listed first. Adding a preset
  remains a data record, not a page.

- **REQ-18** — [x] A preset picker page sits between the Practice Interviews dashboard
  tile and the existing setup wizard. Each preset card shows name, one-line description,
  and what it covers (difficulty, rough length, question areas). The wizard itself stays
  two steps (Interviewer -> Resume) and does not gain a third.

- **REQ-19** — [x] Customization lives on the preset picker page, pre-filled from the
  chosen preset's defaults and hidden behind a "Customize" affordance; defaults render as
  read-only summary text until the student opens the controls. Settings lock once the
  session begins.

- **REQ-20** — [x] Industry and role are curated dropdowns, not free text, so no
  unsanitized student input reaches the system prompt. Difficulty keeps its existing
  meaning (follow-up depth and interviewer pressure, NOT question count). A blank or
  cleared field falls back to the preset default so no prompt placeholder is ever empty.

- **REQ-21** — [x] Session length (target minutes / question count) is a student-facing
  knob, and the live session's progress tracking (`buildProgressBlock`) stays coherent
  with whatever length the student selects.

- **REQ-22** — [x] Interviewer personality is a dial independent of the avatar (which
  supplies face and voice only), plus an optional free-text "who is interviewing you"
  input distilled into a persona that plays the named person directly. No LinkedIn or
  other URL is fetched server-side. The UI frames the session as a rehearsal simulation;
  the pasted text persists only as long as the session needs it and is exposed on no
  surface beyond the student's own session.

- **REQ-23** — [x] The assembled system prompt stays session-constant: every customized
  value is resolved once, before the session starts, into an `InterviewType`-shaped
  object. Nothing tuned in this phase is injected per-turn.

- **REQ-24** — [x] The report records and displays the customization that produced it
  (preset, industry, role, difficulty, length), so two reports are comparable.
