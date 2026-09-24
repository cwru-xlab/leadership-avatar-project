# Phase 9: Student-Authored Scenarios - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Students create their own **case-study-style roleplay scenarios** — a situation
plus one or more avatar characters — and practice against them in the existing
`/case-play` player. Their scenarios are private by default and can be
deliberately published to all students.

Delivers: a guided authoring flow, per-user scenario ownership (which does not
exist today), a publish toggle, and evaluation of a scenario run.

NOT in this phase: saving interview presets as reusable variants (that was Phase
8's deferred idea and is explicitly NOT what "scenario" means here — see
Deferred), the video/audio metrics pipeline (Phase 10), and the cohort/staff
teardown (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### What a "scenario" is

- A **case-study-style roleplay**: background/situation plus one or more avatar
  characters with roles — the same shape as today's admin-authored `CaseStudy`.
- It is explicitly **NOT** a saved interview preset/variant.
- **One to several avatar characters**, matching what `CaseAvatar[]` already
  supports. Not capped at one.
- Student scenarios **live alongside admin cases in `/case-play`**, using the
  same player and the same S3 storage. They are cases with a real owner.

### Avatar selection UI — specific instruction

- The character/avatar picker **must mirror the interviewer selection UI at
  `/interview/[type]` step 1** — the card grid with avatar preview images
  (`app/interview/[type]/page.tsx:285-296`, each card rendering
  `interviewer.previewUrl`).
- It must **NOT** use the admin case editor's `<Select>` dropdown of avatar
  profiles (`app/case-management/[caseId]/page.tsx:633`). This is a deliberate
  departure from the admin form.

### Authoring experience

- **A guided step-by-step builder**, not a single admin-style form and not
  model-drafted-then-edited. Situation → characters → criteria, one step at a
  time.
- **Required minimum to save:** a situation, at least one character, and
  criteria. The builder does not let a student save something underspecified.
- **Save is a distinct step, then launch from the list** — authoring does not
  terminate directly in a live session.
  **Reconcile with ROADMAP criterion 1** ("author a scenario and *immediately*
  practice against it"): saving must land the student somewhere the new scenario
  is immediately startable — i.e. the list, with the just-created scenario
  present and launchable without further setup. Do not drop "immediately";
  do not silently turn this back into authoring-ends-in-Start.
- **Scenarios are editable and re-runnable freely** — a scenario is a living
  draft, not frozen per run. See the snapshot rule below, which is what keeps
  this honest.

### Evaluation

- A scenario run **is evaluated and produces a report**.
- **The author writes criteria** as part of authoring (today's `CaseStudy`
  already carries an optional `evaluationPrompt` field).
- **Plus a standard behind-the-scenes prompt**, structurally similar to the
  interview prompt, covering EQ (visual and sound-oriented) and conversational
  adequacy. The author's criteria sit on top of this standard base; they do not
  replace it.
- **Visual/Vocal render as "Not yet measured"**, exactly as interview reports do
  today. See the Phase 10 dependency below.

### Privacy and sharing

- **Private by default, publishable to all students.** The author can publish a
  scenario so it appears for every student — reusing the Phase 7 `published`
  discovery-flag pattern rather than inventing link-sharing.
- **No staff surface is built in this phase**, but the data model must **not
  preclude** one later. The user's position: staff are effectively obsolete in
  the new self-directed model and need no involvement here. Do not add
  staff-visibility fields or a staff review path.
- **`/case-play` shows two separate sections on one page** — the student's own
  scenarios and the admin-authored case studies as distinct groups, so
  provenance is always obvious. Not one merged list.
- **A recipient of a published scenario can fork their own copy.** Not
  necessarily built in this phase, but the data model must allow it — do not
  design anything that makes forking impossible.

### Ownership and lifecycle

- **Per-user ownership becomes real.** `CaseStudy.createdBy` is a plain display
  string today and `cohortIds` is the only scoping — neither is an ownership
  model. This phase needs genuine owner scoping for student scenarios.
- **The report snapshots the scenario as it was at run time.** A report must
  stay truthful after its scenario is edited. This mirrors what Phase 8 already
  does by persisting resolved customization onto the `InterviewReport` row —
  follow that precedent.
- **Reports survive scenario deletion.** Deleting a scenario does not delete the
  practice history; the snapshot is what makes the surviving report still
  readable.
- **A published scenario must be unpublished before it can be deleted.** An
  explicit two-step, so content can't vanish from under other students mid-use.
- **No cap** on how many scenarios a student may create.

### Claude's Discretion

- The exact steps and copy of the guided builder, and what counts as
  sufficiently-specified for each required field.
- The shape of the standard behind-the-scenes evaluation prompt and how the
  author's criteria compose onto it.
- How owner scoping is actually modeled and stored (S3 key layout, a Postgres
  row, or a hybrid) — provided ownership is genuinely enforced server-side and
  not merely displayed.
- How the two `/case-play` sections are laid out, and the empty state for a
  student with no scenarios yet.
- Where the authoring entry point lives (a new dashboard tile via
  `lib/interactions`, an action on `/case-play`, or both).

</decisions>

<specifics>
## Specific Ideas

- **"For avatar selection of the cases, we should mirror the UI and layout that
  currently exists on the `/interview/general` URL, rather than the dropdown that
  exists in the admin form."** — verbatim user instruction. The card grid with
  preview images, not `<Select>`.
- **"As it eventually relates to EQ (visual, sound-oriented) and conversational
  adequacy, there should be some standard prompt behind the scenes that is
  structurally similar to the interview prompt."** — the author's criteria are
  additive to a standard base, not a replacement for it.
- **"Staff is effectively obsolete for this new system. They don't need
  involvement here at all."** — build nothing for staff; don't preclude later.

## Architectural grounding gathered during discussion (for the researcher)

- `types/index.ts:202-220` — the `CaseStudy` interface. Note `createdBy: string`
  (display only), `cohortIds: string[]` (the obsolete scoping model), and the
  `published?: boolean` flag added in Phase 7, documented there as a **discovery**
  filter and explicitly NOT access control.
- `types/index.ts:194-200` — `CaseAvatar` (`id`, `name`, `role`,
  `additionalInfo`, `profileId?`).
- **`app/api/case/add`, `/edit`, `/delete` contain NO auth code at all.** They
  are admin-gated purely by `middleware.ts:153-155`. `add/route.ts` reads the
  request body straight into a `CaseStudy` with no user check. Letting students
  author means this gate changes and real ownership enforcement has to exist in
  the routes, not just in middleware.
- `app/interview/[type]/page.tsx:285-296` — the interviewer card grid the avatar
  picker must mirror.
- `app/case-management/[caseId]/page.tsx:633` — the `<Select>` dropdown it must
  NOT mirror.
- `app/case-play/page.tsx` — the Phase 7 published-case index that gains a second
  section.
- `lib/interview/prompts.ts` — the structural model for the standard scenario
  evaluation prompt. Note the session-constant discipline enforced there.
- `prisma/schema.prisma` `InterviewReport` — the Phase 8 precedent for snapshotting
  run-time configuration onto a report row.

</specifics>

<deferred>
## Deferred Ideas

- **Saving an interview preset/customization as a reusable named variant.**
  Carried over from Phase 8's deferred list. This discussion explicitly decided
  a "scenario" is a case-style roleplay, NOT an interview variant — so this
  remains deferred and out of scope. Its own future phase if wanted.
- **Link-based sharing** (share to one person via a URL) — publishing to all
  students is the chosen mechanism; link sharing was considered and not selected.
- **Forking a published scenario into your own copy** — explicitly allowed by the
  data model, but building the fork action itself is not required in this phase.
- **Any staff-facing view of student-authored scenarios** — deliberately not
  built; see Phase 11's teardown direction.

</deferred>

<dependencies>
## Known Dependency — flag for the planner

**Visual and Vocal scores cannot be populated in this phase.** They are hardcoded
null in validation code (a Phase 6 decision, enforced in code and not merely by
prompt) and stay that way until **Phase 10** builds a real video/audio metrics
pipeline.

Consequence: the standard evaluation prompt may be *structured* for EQ now, and
the report must render Visual/Vocal as **"Not yet measured"** exactly as interview
reports do. No plan may promise real visual or sound-oriented scoring in this
phase. Conversational adequacy and the author's own criteria are what actually
score.

</dependencies>

<scope_note>
## Scope Note for the Planner and Roadmap

ROADMAP Phase 9 currently has **no requirement IDs** — REQUIREMENTS.md ends at
REQ-24 (Phase 8). Generate **REQ-25 onward** during planning, or the plan-checker
will have nothing to verify coverage against. This is the same gap that Phase 8
hit.

The two existing success criteria remain accurate and need no amendment:
1. A student can author a scenario and immediately practice against it.
2. A student's own scenarios are private to them unless deliberately shared.

Criterion 1's word "immediately" is preserved under the save-then-launch decision
as described above.

</scope_note>

---

*Phase: 09-student-authored-scenarios*
*Context gathered: 2026-09-21*
