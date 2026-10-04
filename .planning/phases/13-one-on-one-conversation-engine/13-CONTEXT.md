# Phase 13: One-on-One Conversation Engine - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the two existing one-on-one pipelines — interview and case-play scenario —
into ONE engine, so that Phases 14, 15 and 16 ship as config records plus
prompts rather than as new route trees, evaluators and report pages.

What exists twice today and must not exist five times:

| Surface | Interview | Scenario |
|---|---|---|
| Session routes | `app/api/interview/session/{start,checkpoint,finish}` | `app/api/scenario/session/{start,finish}` (no checkpoint) |
| Evaluator + runner | `lib/interview/evaluation{,-runner}.ts` (536 lines) | `lib/scenario/evaluation{,-runner}.ts` (680 lines) |
| Prompts | `lib/interview/prompts.ts` (623) | `lib/scenario/prompts.ts` (498) |
| Report DTO | `lib/interview/report-dto.ts` (178) | `lib/scenario/report-dto.ts` (210) |
| Report page | `app/interview/[type]/report/[reportId]` | `app/case-play/[caseId]/report/[reportId]` |
| Prisma table | `InterviewReport` (~40 cols) | `ScenarioReport` (~35 cols, ~28 identical) |

NOT in scope: shipping any of the three new interaction types. The engine must
be able to express them; Phases 14-16 express them. `/case-play`'s scenario
AUTHORING routes (`/api/scenario/{add,edit,delete,publish,list}`) are also not
part of the session pipeline and are not this phase's target.

</domain>

<decisions>
## Implementation Decisions

### Report storage

- **One unified table.** Create `InteractionReport` carrying `typeSlug` plus
  every shared column, backfill the existing `InterviewReport` and
  `ScenarioReport` rows into it, then drop the old tables. Rejected: a unified
  table for new rows only with the old tables kept read-only (rejected because it
  leaves a legacy read path in the report page and the `/reports` list forever),
  and per-type tables behind a repository layer (rejected: every new type would
  add a table and a mapper, which is not an engine).
- **Per-type input is one JSON `inputSnapshot` column**, typed in TypeScript and
  shaped per type — `{kind: "interview", resumeText, industry, roleTitle,
  difficulty, persona, targetMinutes}`, `{kind: "scenario", background, avatars,
  criteria}`, and later `{kind: "pitch", deck, ask}`. A new interaction type adds
  NO columns. Accepted costs: not SQL-queryable across types, and the shape is
  enforced in code only. This replaces the typed snapshot columns that exist on
  both tables today (`resumeText`/`industry`/`roleTitle`/`difficulty`/
  `targetMinutes`/`targetQuestionCount`/`interviewerPersona` on `InterviewReport`;
  `caseName`/`backgroundSnapshot`/`avatarsSnapshot`/`criteriaSnapshot` on
  `ScenarioReport`).
- **Scores are a JSON map keyed by dimension**, not fixed columns:
  `{visual: 3, vocal: 4, content: 3, behavioral: 4, deck_quality: 2}`. A new
  dimension in Phase 14 needs no migration. The four existing score columns
  (`visualScore`/`vocalScore`/`contentScore`/`behavioralScore`) fold into this.
- **Migration follows the existing human-run path.** Write it, apply to the LOCAL
  dev DB only, and hand the SQL over for a human to review and run
  `prisma migrate deploy` against the shared Lightsail DB — the Phase 6-10
  precedent recorded in `HANDOFF.md §3`. An agent must NOT apply it to the shared
  DB. Phase 13 is not closed until a human has run it.
- **Legacy reports must render identically at their existing URLs.** An
  interview or scenario report written before this phase keeps its scores,
  metrics, body-language section, Moments and snapshot strip intact, and its old
  deep link still resolves. This is the acceptance test that catches a broken
  backfill.

### Config surface

- **Phase 13 builds the primitives Phases 14-16 need, before anything uses
  them.** Specifically:
  - `terminationPolicy` — who may end a session and why, including an
    AVATAR-INITIATED end with a recorded reason. Phase 14's "a tedious pitch
    triggers an abrupt end — a failure" needs this; today nothing but the student
    can end a session.
  - a per-turn **visible-context slice** the type controls — what the avatar is
    allowed to see on this turn, as opposed to everything the session knows.
    Phase 14's "the avatar must not reference slide 10 while the student is on
    slide 4" is one instance of it.
  - a type-declared **outcome record** (JSON) for structured results like the
    negotiated price and equity.
  - an explicit **time budget** with the per-turn tail block that already exists
    for progress.
  Rationale: this is what makes criterion 1 true. The alternative — generalize
  only what exists today and let Phase 14 extend the engine — means the first new
  type edits engine code, which is the failure mode this phase exists to prevent.
- **Config lives as TypeScript records in code**, following
  `lib/interview/types.ts` and `lib/interactions/index.ts`. Type-checked and
  reviewable in git. Rejected: S3 JSON (nothing type-checks it) and Postgres rows
  (needs a migration and an editing surface that has no staff role to own it
  after Phase 11).
- **Two layers: built-in TYPE (code) + authored INSTANCE (data).** The type —
  "difficult conversation" — is a code record declaring rubric dimensions,
  prompts, primitives and limits. The instance — "confront a low performer, my
  version" — is student-authored data in S3, the `CaseStudy` precedent. A session
  resolves `type + instance` into one session config. This is how Phase 15's
  student-authored scenarios and Phase 16's distilled personas enter the engine
  without becoming code.

### Routes and student-visible change

- **One `/practice/[type]` tree.** Sessions at
  `/practice/[type]/[instanceId?]`, reports at
  `/practice/[type]/report/[reportId]`. `/interview/*` and `/case-play/*` become
  permanent redirects — which is what satisfies the "legacy reports keep their
  existing URLs" requirement above. Rejected: keeping `/interview` and
  `/case-play` as real routes and adding three more top-level paths (five route
  trees over one engine is exactly what criterion 1 forbids).
- **Phase 13 is an INVISIBLE REFACTOR.** The shared session shell and report page
  must reproduce today's interview and case-play appearance exactly; any visible
  difference is a bug, not an improvement. The diff lives under `app/api` and
  `lib`. This makes criterion 2's "no behavior regression" checkable by eye.
  - **Known exception:** the URL in the address bar changes. Redirects keep old
    links working, but the student will see `/practice/...`. That is the only
    sanctioned visible change.
  - Corollary: the two experiences DIVERGE today (scenario has no checkpoint
    endpoint; report chrome differs). "Pixel-identical" means each type keeps its
    current behavior — do NOT converge them in this phase. If a divergence cannot
    be preserved, raise it as a checkpoint rather than silently picking a winner.
- **Pre-session setup is one generic wizard with per-type step components.** The
  wizard owns step machinery, progress, back/forward, the camera-mode consent gate
  and launch. A type declares its steps; a step needing custom UI (deck upload,
  persona paste) supplies its own component. Rejected: a fully declarative
  field-rendering wizard (deck upload and persona paste are genuinely custom and
  would force escape hatches anyway) and per-type setup pages (the camera-mode
  consent gate would have to be repeated correctly five times).

### Rubric shape

- **Four shared dimensions plus type-declared extras.** Visual, Vocal, Content
  and Behavioral are the spine every type reports on; a type may declare more —
  `Deck Quality` and `Negotiation` for pitches, `Rapport` for networking. Reports
  stay comparable across types while each type is judged on what matters to it.
  Rejected: fixed four with per-type descriptions only (deck quality would be a
  sub-point of Content, not a score, which Phase 14's criterion 4 asks for), and
  fully per-type sets (reports become incomparable and the four-state metric cards
  lose their fixed home).
- **Visual and Vocal are never type-optional.** Every engine-backed type carries
  them with the full four-state handling from Phases 10 and 12 (scored /
  `CAMERA_OFF_OPTOUT` / `TYPED_ONLY` or `SPEECH_TOO_SHORT` / `INSUFFICIENT_DATA`).
  A type CANNOT opt out — which is how criterion 4 is satisfied structurally: a
  type never wires metrics, so it can never forget to.
- Consequence for the evaluator: `lib/report/structured.ts:109` currently
  hardcodes `required: ["visual", "vocal", "content", "behavioral"]` in the JSON
  schema. The schema must become type-derived, with those four always present and
  the type's extras appended.

### Claude's Discretion

- Where the engine's modules live and what they are called (`lib/engine/`,
  `lib/interaction/`, …) and how the two existing `lib/interview` /
  `lib/scenario` trees are decomposed into shared vs type-local.
- Prompt assembly mechanics, as long as the assembled system prompt stays
  session-constant so the OpenAI prefix cache still hits (criterion 2) and
  per-turn state stays in the tail block.
- Whether scenario gains a checkpoint endpoint as part of unification, or the
  engine's checkpoint is simply unused by it — subject to the
  no-visible-convergence rule above.
- The `/reports` list page's cross-type presentation, and the dashboard tile
  wiring in `lib/interactions/index.ts`.
- Status enum naming (`InterviewReportStatus` is shared by both tables today) and
  whether it is renamed under the unified table.
- Whether `transcriptKey` (S3, interview) and `interactionLogId` (S3, scenario)
  converge on one transcript pointer or stay two fields on the unified row.

</decisions>

<specifics>
## Specific Ideas

- The engine's test of success is Phase 14, not Phase 13: if adding the elevator
  pitch requires touching anything under the engine's own modules, the engine is
  not done. Build the primitives now so that 14-16 are config plus prompts.
- The avatar being able to END a session is a genuinely new idea in this codebase
  and the user chose to build it here rather than in Phase 14. Treat
  `terminationPolicy` as a first-class engine concept with a recorded reason on
  the report, not a special case bolted into the pitch type.
- "The avatar must not see slide 10 while the student is on slide 4" generalizes
  to a visible-context slice. Model it generally — a type decides what the avatar
  may see this turn — rather than as slide bookkeeping.
- Keep the Phase 11 posture: no staff role exists to administer anything, so
  config being code (a PR) rather than an admin screen is the right shape.

</specifics>

<deferred>
## Deferred Ideas

None raised during this discussion — it stayed inside the engine boundary.

Carried in from `.planning/one-on-one-interactions-brief.md` and still open, to
be settled when the owning phase is discussed, NOT here:
- What the elevator pitch is actually pitching (the student, a product, a
  startup) and whether that is declared or configured — Phase 14.
- How an avatar-ended session reads on the report as feedback rather than as a
  crash — Phase 14 presentation; Phase 13 only records the reason.
- Who sets the investor's target valuation — Phase 14.
- Whether published difficult-conversation scenarios need moderation now that
  Phase 11 removed staff roles — Phase 15.
- Whether storing a pasted LinkedIn profile of a real person raises a consent or
  retention constraint — Phase 16.

</deferred>

---

*Phase: 13-one-on-one-conversation-engine*
*Context gathered: 2026-10-02*
