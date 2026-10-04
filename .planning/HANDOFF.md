# Handoff — Leadership Avatar / Interview Practice

**Written:** 2026-09-21 · **Last updated:** 2026-10-04 (rewritten for the v1.1 pickup)
**Branch:** `feature/visual-analysis-expansion` (pushed; **329 commits ahead of `main`, no open PR**)
**State at handoff:** Milestone **v1.0 shipped** — Phases 1–16 complete and verified,
Phase 13 formally **closed 2026-10-04** (`13-CLOSE-RECORD.md`).
Milestone **v1.1 (Consequence & Deck Breadth)** is planned but **not executed**:
Phase 17 (v1.0 Close-Out, 7 plans) and Phase 18 (Avatar Disengagement & Walk-Out,
5 plans) both have committed plans and no code written yet. Phase 19 is roadmapped
only.

Read this file first, then `STATE.md`, then `ROADMAP.md`. Everything else in
`.planning/` is per-phase detail you can read on demand.

**Everything in §1 marked "verified 2026-10-04" was actually run on this machine
that day, not reasoned about.** Several long-standing claims in older versions of
this file turned out to be stale — see §1.3 in particular.

---

## 1. Read this before you run anything

Five things will bite you in the first hour if you don't know them.

### 1.1 There are two databases and they are easy to confuse

- **Local dev DB** — `leadership_avatar_dev` on local Postgres 17. All Phase 6
  onward development and validation happened here.
- **Shared team DB** — an AWS Lightsail Postgres. The team's deployed/shared data.

**`.env` is a SYMLINK to `.env.local`.** They are one file; you cannot give them
different values.

**As of 2026-10-04 (verified), `DATABASE_URL` resolved from `.env` points at the
LOCAL dev DB:**

```
$ npx prisma migrate status
Datasource "db": PostgreSQL database "leadership_avatar_dev", schema "public" at "localhost:5432"
14 migrations found in prisma/migrations
Database schema is up to date!
```

So today a bare `npm run dev` runs against **local**, and reaching the shared
Lightsail DB is what needs an explicit inline prefix. **This has flipped once
already** (it used to point at shared, and older revisions of this file told you
to prefix every command to *avoid* shared). Do not trust either assumption:

```bash
npx prisma migrate status   # prints the database name and host. Run this first, always.
```

To deliberately target a specific database, pass it inline — you cannot edit
`.env` and `.env.local` independently:

```bash
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npm run dev
```

**There is no longer a "it 500s immediately" tell.** All 14 migrations are applied
to the shared DB (§3), so the app runs against shared data perfectly happily and
you will not notice until you have written test rows into the team's database.
Check the connection string; do not wait for a symptom.

**Turbopack will refuse a second `next dev`** in this working directory even on a
different port — all instances share one `.next/` cache and its lock. So you
generally cannot leave a shared-DB server running and start a local-DB one beside
it; stop the first. For the same reason, **never `rm -rf .next` while a colleague's
or your own dev server is running** — it yanks the cache out from under it.

### 1.2 Two ways migrations reach a database without you meaning them to

**Never run `npm run setup`.** `scripts/setup.mjs` runs
`npx prisma migrate deploy` (around line 211) against whatever `DATABASE_URL`
resolves to. Harmless-looking, and historically this is how held-back migrations
got applied by accident.

**`vercel.json`'s `buildCommand` also applies migrations on every deploy:**

```
"buildCommand": "touch .env && prisma generate && prisma migrate deploy && next build"
```

That is how migrations have actually been reaching the Preview and Production
databases — automatically, at build time, unreviewed. A preview build on
2026-10-04 applied `add_interaction_report_title` to a database that already held
this project's first `DROP TABLE`, with no human run and no `pg_dump` first.

The documented discipline ("no agent applies a migration to shared; a human runs
`prisma migrate deploy`") was guarding one door while the build pipeline walked
through another. **Closing that contradiction is Phase 17's REQ-74** — plan 17-01
removes `prisma migrate deploy` from `buildCommand` *and* documents the
replacement procedure in the same change, because removal alone means a schema
change must now be applied deliberately **before** the deploy that depends on it
or the app 500s on a missing column. The user was explicitly offered "amend the
docs to say CI-applied" instead and **rejected** it. Don't re-litigate.

**The no-agent-on-shared rule still binds agents** and was reaffirmed.

### 1.3 The build gates — ALL THREE CLAIMS HERE CHANGED ON 2026-10-04

Older revisions of this file said `next build` and `eslint` were broken repo-wide
and "always were". **That is no longer true. Re-verified by running them:**

| Check | Status (verified 2026-10-04) |
|---|---|
| `npx tsc --noEmit` | **Clean**, exit 0. The authoritative gate. |
| `npm run build` | **Passes**, exit 0. `/about` prerenders fine (`○ /about`) — the old `EDGE_CONFIG` prerender failure is gone. |
| `npx eslint .` | **Config bug is fixed** — it runs. Reports **6 errors and ~7,863 warnings** repo-wide. |

The 6 eslint errors are pre-existing and spread across files: two
`react/no-unescaped-entities`, two "setState synchronously within an effect", one
"Cannot access variable before it is declared", one "Cannot access refs during
render". The ~7.8k warnings are almost entirely `prettier/prettier` formatting.

**DANGER: `npm run lint` is `eslint --fix`.** Running it rewrites formatting
across **~7,200 fixable warnings** repo-wide and will produce an enormous,
unreviewable diff on top of a 329-commit unmerged branch. Use
`npx eslint <path>` to look, and never `npm run lint` casually.

**`npx tsc --noEmit` remains the authoritative gate.** It was **NOT clean from
roughly 2026-10-01 to 2026-10-04**, and nobody noticed: nine errors — one in
shipped code (`app/api/interaction/chat/route.ts`, a lost `pitch-deck` narrowing)
and eight in Phase 14–16 `scripts/verify-*.ts` harnesses that had drifted from
the types they assert against. Every Vercel build failed on it for days. All
fixed in `734ef1f`. The lesson is about the gate, not the errors: `tsc` being
"the gate" is worth nothing unless something fails loudly when it breaks.
Nothing did.

### 1.4 One "Console Error" in dev is not an error

During any camera-on session you will see this in the Next dev overlay:

```
INFO: Created TensorFlow Lite XNNPACK delegate for CPU.
lib/metrics/visual-capture.ts (…) @ runTick
```

It is **not** an exception. MediaPipe's WASM writes that banner to stderr,
Emscripten routes stderr to `console.error`, and Next's dev overlay escalates any
`console.error` into a red panel pointing at the nearest frame in your own code.
The `detectForVideo` call it fingers did not throw — our catch block is silent, so
a real throw would produce no panel at all. Dev-only; absent from production
builds. Don't spend an afternoon on it like we did.

What that line *does* tell you is which TFLite delegate is active. See §5's
GPU-vs-CPU item.

### 1.5 `README.md` and `AGENTS.md` contradict this file — this file wins

You will read `README.md` first because that is what repositories train you to do,
and it will walk you straight into two of the traps above. Neither file has been
updated for the Phase 6+ workflow.

- **`README.md` makes `npm run setup` the standard onboarding step** — it even
  shows the pretty check-list output. **§1.2 says never run it**, because it calls
  `prisma migrate deploy` against whatever `DATABASE_URL` resolves to. Follow §2's
  numbered steps instead; they do the same work with the target database explicit.
- **`README.md` says "the dev database and S3 bucket are shared"** and tells you to
  keep `DATABASE_URL` identical in `.env` and `.env.local`. The S3 bucket is still
  shared. The database half describes the old arrangement — and the two env files
  are **one file via symlink** (§1.1), so they are trivially identical and the
  advice is moot.
- **`AGENTS.md`'s "Known issues" still lists the eslint flat-config failure** as
  current. It is **fixed** (§1.3).
- **`AGENTS.md`'s schema table is pre-Phase-11/13** — it documents `Cohort`,
  `CohortMember`, `CaseAssignment` (the cohort model Phase 11 tore out of the
  student path) and no `InteractionReport`. Read `prisma/schema.prisma` for truth.

Worth a cleanup pass on both files; nobody has owned it. Until then, `.planning/`
is the current record and the two root-level files are historical.

---

## 2. Getting running locally

Verified working on: **Node v20.19.0, npm 10.8.2, Homebrew `postgresql@17`,
macOS (darwin 24.2.0)**. Next 16.3.5.

```bash
# 0. clone + branch — the work is NOT on main (see §8)
git clone <repo> && cd leadership-avatar-project
git checkout feature/visual-analysis-expansion

# 1. deps  (note: public/mediapipe is ~37MB of committed binaries — clone is slow)
npm install

# 2. local Postgres (Homebrew)
brew services start postgresql@17
createdb leadership_avatar_dev

# 3. secrets — get .env.local from Adam; it is NOT in git
#    then: ln -s .env.local .env     (the repo expects .env to be this symlink)

# 4. confirm which DB you are about to touch BEFORE migrating
npx prisma migrate status           # must say leadership_avatar_dev at localhost:5432

# 5. apply all 14 migrations to your LOCAL db
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npx prisma migrate deploy

# 6. generate the client
npx prisma generate

# 7. seed test users
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npx prisma db seed

# 8. run
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npm run dev
```

`db seed` runs `npx tsx prisma/seed.ts` (wired via `package.json#prisma`; Prisma
warns that this key is deprecated and moves to `prisma.config.ts` in Prisma 7 —
not yet done, ignore the warning).

**Seeded logins** (from `prisma/seed.ts`):

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin123` | admin |
| `professor.smith@case.edu`, `professor.chen@case.edu` | `prof123` | staff |
| `alice.johnson@case.edu`, `bob.williams@case.edu`, `carol.davis@case.edu`, `david.lee@case.edu`, `emma.wilson@case.edu`, `student@case.edu` | `student123` | student |

Multiple students exist on purpose — owner-only report isolation is tested by
logging in as one and requesting another's report (expect a **404, never a 403**).
`alice.johnson` and `bob.williams` are the pair used in the Phase 7 and Phase 8
walkthroughs.

These are local seed credentials for a local throwaway database, already in
`prisma/seed.ts` in the repo. They are not secrets and must never be reused for
anything shared.

**Seeded users have no video-analysis consent.** `User.videoAnalysisConsentAt` is
null on a fresh seed, and both session-start routes independently force
`cameraMode` to `"OFF"` when it is — deliberately, so a client that skipped the
dialog cannot start a measured session. Your first camera-on attempt will
therefore look like it silently ignored you, and the report will say you
practiced with the camera off. **That is the gate working, not a bug.** Accept
the in-app consent dialog once; it is remembered per account.

**A convenience script that is still wanted and still not added** (repeatedly
noted across phases — add it if you like, it is uncontroversial):

```json
"dev:local": "DATABASE_URL=\"postgresql://<youruser>@localhost:5432/leadership_avatar_dev\" next dev --turbopack"
```

### Environment variables the code reads

Get the real values from Adam's `.env.local` — they are not in git.

**Core (the app will not work without these):** `DATABASE_URL`, `JWT_SECRET`,
`OPENAI_API_KEY`, `HEYGEN_API_KEY`, `NEXT_PUBLIC_LIVEAVATAR_API_URL`,
`NEXT_PUBLIC_BASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `AWS_S3_BUCKET_NAME`.

**`EDGE_CONFIG`** is read implicitly by `@vercel/edge-config` in `lib/auth.ts`
(the `adminUsersCaseIds` admin list, and the CWRU SSO / kiosk login routes). The
build no longer fails without it (§1.3), but admin-role resolution depends on it.

**Model overrides (optional):** `INTERVIEW_EVAL_MODEL`, `INTERVIEW_PERSONA_MODEL`,
`SCENARIO_EVAL_MODEL`, `STUDY_PLAN_MODEL`, `NETWORKING_PERSON_GENERATION_MODEL`.

**Deck conversion (optional — needed only for PPTX pitch decks):**
`DECK_CONVERT_BACKEND` (`gotenberg`, the decided backend),
`DECK_CONVERT_URL`, `DECK_CONVERT_TOKEN`. **Unset today**, so a PPTX upload
returns a `backend-unconfigured` error and the route 502s. **PDF decks work
without any of this** — use a PDF to exercise the deck path. See
`14-DECK-RENDER-DECISION.md`.

**Other optional / feature-specific:** `HEYGEN_AVATAR_CONTEXT_ID`,
`ENABLE_CHAT_COMPRESSION`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`,
`EMAIL_PROVIDER`, `SMTP_*`, `STUDY_PLAN_DRAFT_SECRET`,
`NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP` (dev dump), `BENCH_*`, `SPIKE_*`,
`DECK_AUTH_COOKIE*`, `DECK_ROUTES_BASE_URL`, `DATABASE_URL_LOCAL` (read only by
the two `scripts/dc-*.ts` probes) — all script-only.

### Running the verify harnesses

There is no test runner; verification is ~35 standalone `scripts/verify-*.ts`
harnesses, run with `tsx`:

```bash
npx tsx scripts/verify-engine-primitives.ts
npx tsx scripts/verify-deck-intake.ts          # known to FAIL 1 assertion — see §5
```

As of 2026-10-04 the suite is green **except** `verify-deck-intake.ts`.

---

## 3. Migrations — settled, but read the correction

**ALL 14 MIGRATIONS ARE APPLIED EVERYWHERE AS OF 2026-10-04.** The shared
Lightsail DB reports `Database schema is up to date!` (14 of 14), run by a human.
The local dev DB likewise (verified, §1.1). **Nothing is pending or held.** The
table below is history.

| Migration | Phase | Applied to shared DB? |
|---|---|---|
| `20260228044702_init` | pre-GSD | yes |
| `20260302180438_add_student_dashboard_fields` | pre-GSD | yes |
| `20260916165041_add_user_and_auth_models` | pre-GSD | yes |
| `20260920034855_add_interview_report` | 6 | yes (2026-09-23) |
| `20260921141342_add_interview_customization` | 8 | yes (2026-09-23) |
| `20260921201213_add_scenario_report` | 9 | yes (2026-09-23) |
| `20260922134512_add_video_audio_metrics` | 10 | yes (2026-09-23) |
| `20260924000000_add_study_plans` | 11 | yes (2026-10-04) |
| `20260930230000_add_report_structured` | 11 | yes (2026-10-04) |
| `20261004012908_add_interaction_report` | 13 | yes (2026-10-04) |
| `20261004040000_drop_legacy_report_tables` | 13 | yes (2026-10-04) |
| `20261004043007_add_pitch_session_columns` | 14 | yes (2026-10-04) |
| `20261004143500_add_interaction_report_title` | 14 | yes (2026-10-04) |
| `20261101000000_add_networking_attestation` | 16 | yes (2026-10-04) |

### What the 2026-10-04 run found — this invalidated a lot of documentation

Three things turned out to be false, and had been for a while:

1. **The record was missing `20260924000000_add_study_plans` entirely**, and that
   migration had never been applied to shared. The shared DB sat one migration
   behind `main` from 2026-09-24 onward. `add_report_structured` was also
   unapplied, not merely "check with a human".

2. **The shared Lightsail DB was completely EMPTY** — 0 users, 0 attempts, 0 audit
   rows, 0 reports of either kind. Every risk framing built on "live student report
   rows" — including all of `13-MIGRATION-HANDOFF.md` — was **counterfactual**. The
   `InteractionReport` backfill was a no-op and was never run against shared, and
   **its verifier cannot pass there**: it hard-asserts that at least one legacy
   `cameraMode IS NULL` row exists to test, and there are none.

3. **`vercel.json` self-migrates on every deploy.** See §1.2 — this is the live
   item, now Phase 17's REQ-74.

**`13-MIGRATION-HANDOFF.md` reads correctly now** — it opens with a RESOLVED banner
recording that both parts are done and that the premise of everything below it was
false, and its status table rows are marked superseded in place. The body below is
deliberately kept unedited as the record of what was planned and why, so don't be
thrown when it describes a careful human-gated ceremony in the present tense.
Phase 17's `17-CONTEXT.md` carries the same `<correction>`; plans 17-01 and 17-02
were **replaced** (not revised) because the originals planned work already
completed.

**Still unverified and worth closing:** nobody has confirmed what the **Production
`DATABASE_URL`** secret actually points at. It is write-only (Vercel "Sensitive"),
the account has no marketplace integrations, and the `la_db_*` secrets are orphaned
leftovers pointing at a store that no longer exists. To settle it: deploy, sign in
through the SSO-gated production URL, and check whether a `User` row lands in the
Lightsail DB. This is also plan 17-02.

All 14 migrations are additive except `20261004040000_drop_legacy_report_tables`
(the project's first and only `DROP TABLE`, retiring `InterviewReport` /
`ScenarioReport` after the `InteractionReport` consolidation). Zero `NOT NULL`
was ever added to a pre-existing table, so pre-Phase-8/10 rows simply carry nulls
and the code handles that everywhere it reads them.

---

## 4. What the product is now

A student signs in and lands on an **interaction dashboard** (`/`). Milestone v1.0
opened every interaction type that used to be a `coming-soon` tile:

- **Practice Interviews** → `/interview` (preset picker) → wizard
  (Interviewer → Resume → **Camera**) → live avatar interview → evaluated report.
- **Case Studies** → `/case-play`, two labelled sections: the student's own
  authored scenarios, and admin-authored published cases. Students author their
  own case-style roleplays through a guided builder (`/case-play/new`), private by
  default and publishable.
- **Practice Pitches** → `/practice/pitches` — an **elevator pitch** (60s window,
  soft collapsible timer) and an **investor pitch-deck** session with live slide
  gating, a hideable timer, and negotiation (ask vs settled vs server-side fair
  band). Phase 14, signed off 15/15.
- **Difficult Conversations** — role-assuming avatars, a seeded catalog plus
  student-authored publishable scenarios. Phase 15.
- **Networking Practice** — practice against a described real person (with an
  attestation gate) or a default character. Phase 16.
- **My Reports** → `/reports`. **Settings** → `/settings`.

The cohort/assignment/staff-oversight model was **removed** in Phase 11 — students
are fully self-directed.

### Architecture worth knowing before you change anything

- **`lib/engine/`** — Phase 13's generalized one-on-one conversation engine, and
  the center of gravity for all new interaction work. `registry.ts` holds
  `ENGINE_TYPES`; **adding an interaction type is one more record there and
  nothing else in the repo changes** (REQ-60). Also here: `prompts.ts`,
  `evaluation.ts`/`evaluation-runner.ts`, `outcome.ts`, `termination.ts`,
  `turn-control.ts`, `time-budget.ts`, `visible-context.ts`, `rubric.ts`,
  `session.ts`, `resolve.ts`, `types.ts`. Phase 18 **extends** `terminationPolicy`
  / `avatarEndFloor` here rather than adding a parallel mechanism — that is a
  locked scope note.
- **`lib/pitch/`** — `elevator-type.ts`, `deck-type.ts`, deck/elevator prompts,
  `fair-value-band.ts` (server-only, ask-independent), `slide-reveal.ts`,
  `slides-channel.ts`, `session-length.ts`, `score-caps.ts`.
- **`lib/difficult-conversation/`, `lib/networking/`** — Phases 15 and 16's type
  records, prompts and stores.
- **`lib/deck/`** — PDF rasterization and `pptx-convert.ts` (Gotenberg backend).
- **`lib/interview/types.ts`** — the original interview preset registry (four
  presets: `general`, `technical`, `consulting`, `early-career`). Phase 13
  transcribed it into the engine field-for-field and **reads from it, never edits
  it**. Adding an interview variant is still a record here.
- **`lib/interview/prompts.ts`** — assembles the interview system prompt. **Every
  field it reads is session-constant on purpose**, so the OpenAI prefix cache
  hits. Anything that varies per turn goes in `buildProgressBlock`'s tail block.
  Treat as load-bearing; several phases required it to stay diff-empty.
- **`lib/interview/customization.ts`** — `resolveInterviewType(slug, customization)`.
  Pure and deterministic. Client-supplied customization is **re-validated
  server-side** at both prompt-assembly call sites, falling back silently to
  preset defaults for anything not in the curated lists. This is what stops a
  hand-crafted request injecting prompt content.
- **`lib/interactions/`** — the dashboard's interaction-type registry. It must
  **not** import from `lib/interview` (a deliberate Phase 7 boundary, enforced by
  a static check).
- **`lib/metrics/`** — Phase 10/12's capture and scoring layer, deliberately
  dependency-free (no imports from `lib/interview`, `lib/scenario`, React, Prisma
  or Next, so every pipeline can consume it):
  - `types.ts` / `bands.ts` — the metric contract and the raw-number→plain-word band map.
  - `coverage.ts` — **`resolveVisualOutcome` is the single most load-bearing
    function in the phase.** It decides whether Visual is scorable using LIVENESS
    signals only (processed-sample counts, track-live time, explicit analyzer
    error) and is *forbidden* from reading `face_detected_samples`. A camera-on
    session whose face was never detected must score LOW, not go unscored — "in a
    real interview, if your face cannot be picked up clearly, you would be docked
    for that." Do not add a coverage threshold here; two greps and a named
    regression assertion exist to stop you.
  - `visual-capture.ts` — MediaPipe Face Landmarker, in-browser, **nothing stored**.
  - `vocal-capture.ts` — WPM/fillers/pauses from real word timings; volume from RMS.
- **`lib/scenario/`** — Phase 9's student-authored-scenario pipeline.
- **`public/mediapipe/` is ~37MB of committed binaries** (WASM runtime + the
  `face_landmarker.task` model), pinned to `@mediapipe/tasks-vision@1.0.1` and
  deliberately self-hosted rather than CDN-loaded — a CDN fetch mid-interview is
  a live dependency on someone else's uptime. It will dominate your `git clone`
  time. If you bump the package version, re-copy the assets to match.
- **Two STT calls per spoken turn.** The existing streaming `gpt-4o-transcribe`
  route drives live UX and must stay byte-unchanged; a second non-streaming
  `whisper-1` call (`/api/audio/word-metrics`) supplies word timestamps, which
  `gpt-4o-transcribe` cannot. Measured at 1.9–4.8s per turn. That is real
  per-turn cost — worth knowing before scaling usage.
- **Reports are owner-only.** Cross-user access returns **404, never 403**.
- **Visual and Vocal rubric scores are REAL** since Phase 10, with arms, posture
  and visible-phone signals added in Phase 12. If no metrics arrive the
  never-estimate discipline applies and the category stays unscored. Legacy
  pre-Phase-10 rows keep null scores permanently and still read "Not yet measured".

---

## 5. Where the bodies are buried

Known, accepted, and written down — not bugs you just found.

| Item | Detail | Owner |
|---|---|---|
| `verify-deck-intake.ts` fails 1 assertion | `FAIL: slide 1 title text appears in slides[0].text` — fixture/assertion mismatch between `generate-deck-fixtures.ts` and `spike-deck-render.ts`. **Fix the fixture wiring, do not loosen the assertion** (that is the plan's explicit constraint). | **Phase 17 / 17-04** |
| REQ-63 implemented but never verified | `visibleContext` exists (`lib/engine/types.ts`, sliced in `lib/engine/prompts.ts`) and was never proven on a real multi-channel session. Needs a sentinel harness + evidence filed in Phase 13's directory, not new construction. Phase 13 closed with this box **delegated, not granted**. | **Phase 17 / 17-03** |
| Phases 15 & 16 keyboard UAT undischarged | Both completed under `skip_checkpoints`; 4/4 SC PASS-automated each, but no human keyboard pass. **Non-autonomous — a human runs it, an agent only records it.** `/gsd:verify-work 15`, `/gsd:verify-work 16`. | **Phase 17 / 17-05, 17-06** |
| `vercel.json` self-applies migrations | §1.2. Documented discipline and real pipeline contradict each other. | **Phase 17 / 17-01** |
| Production `DATABASE_URL` target unconfirmed | §3. Write-only secret; settle it by deploying and watching for a `User` row. | **Phase 17 / 17-02** |
| REQ-66/REQ-67 ticked on a caveat, not a test | **Phase 13 is closed** (`13-CLOSE-RECORD.md`). But REQ-66's backfill acceptance test is unsatisfiable on shared by construction and passed on local only, and REQ-67 closed on its human-run clause **not** on "no agent applies it". Read the record before citing either. | closed |
| PPTX deck upload 502s | `DECK_CONVERT_BACKEND`/`_URL` unset — Gotenberg was decided but never provisioned. **PDF decks work.** | open |
| 6 eslint errors, ~7.8k prettier warnings | §1.3. `npm run lint` is `eslint --fix` — do not run it. | unowned |
| Avatar can say it is leaving without leaving | Today the avatar can announce a walk-out in words while the session keeps running. This is the whole of Phase 18. | **Phase 18** |
| Unauthenticated API calls 307 instead of 401 | Middleware redirects to `/login` rather than returning JSON 401 on report endpoints. Pre-existing since Phase 6. | deferred |
| `/api/case/list` is enumerable | The unfiltered default is reachable by any authenticated user; `publishedOnly` is opt-in. `published` gates **discovery, not access** — an unpublished case still plays by direct URL (deliberate, for staff preview). | deliberate |
| MediaPipe may run on the CPU delegate | The engine tries GPU then falls back to CPU. CPU inference competes with the live WebRTC avatar stream for the main thread — the exact contention REQ-49 guards against. The user judged smoothness "still good enough" but explicitly wants performance revisited. `[visual-capture] engine started` logs which delegate is active. | open |
| Camera light fix unconfirmed on hardware | Fixed in `5c7a2bd`: the capture-start guard tested a ref only assigned *after* an awaited `getUserMedia`, so a second avatar `CONNECTED` event (HeyGen emits these on reconnect) could acquire a second stream and orphan the first, leaving the camera light on after every exit path. Reasoned from code, **not yet verified on real hardware.** Check the indicator after your next session. | open |
| Docked-vs-insufficient-data never tested live | The hardest distinction (score a poorly-framed session DOWN, but mark a *dead pipeline* unscored) is verified by unit assertions only. The walkthrough steps — deliberately sitting out of frame, and unplugging the camera mid-session — were never run. **Run them if you touch `lib/metrics/coverage.ts`.** | open |
| Report narrative cites raw figures | The rubric *cards* show plain-word bands only, as decided ("Eye contact: Solid"), grep-enforced against `%`/`toFixed`. But the evaluator's own prose cites "59%", "232 WPM", "22 fillers". Arguably better coaching; mild tension with "interpreted, not bare figures". **Undecided, left to a human.** | open |
| Persona character strength | Phase 8's pasted-persona names itself and introduces itself in character, but the directive lives inside the persona string. If it still feels thin over long sessions, the next lever is reinforcing it inside `lib/interview/prompts.ts` — which means deliberately relaxing that file's diff-empty constraint. **Undecided, deliberately left to a human.** | open |
| Scenario resume falls back to the legacy pipeline | Resuming an in-progress scenario via "Unfinished Sessions" uses the legacy finish path because `handleResume` never repopulates `scenarioReportId`. Known since 09-07. | open |
| Phase 12 fidgeting row retired | Retired as unmeasurable through a frontal webcam; posture drift was **repaired, not retired** (12-11). Don't try to resurrect fidgeting without reading `12-11-SUMMARY.md`. | closed |
| Stray sibling `package-lock.json` | Noted in 06-08. | trivial |

---

## 6. How this project is run (GSD workflow)

The `.planning/` directory is a [GSD](https://github.com/glittercowboy/get-shit-done)
workspace. The loop per phase is:

```
/gsd:discuss-phase N     # capture design decisions → N-CONTEXT.md
/gsd:plan-phase N        # research + plan + verify → N-0X-PLAN.md files
/gsd:execute-phase N     # wave-based parallel execution → summaries + commits
```

Run `/clear` between them — each command expects a fresh context window.

Other useful ones: `/gsd:progress` (status + what's next), `/gsd:verify-work N`
(conversational UAT), `/gsd:debug` (persistent debugging sessions).

### Files and what they're for

| File | Purpose |
|---|---|
| `STATE.md` | Current position, environment notes, the running **Decisions** log, per-plan progress. The single most useful file — and now ~230KB, so read the top and then grep. |
| `ROADMAP.md` | All phases through 19, goals, success criteria, plan lists, progress table. |
| `REQUIREMENTS.md` | REQ-01…REQ-86 with completion notes. Phases 1–5 predate requirement tracking and have no IDs. |
| `MILESTONES.md` | v1.0 / v1.1 scope. |
| `phases/NN-*/NN-CONTEXT.md` | User design decisions for that phase. **Locked** — agents must honor, not revisit. Note 17-CONTEXT carries a `<correction>` block that **overrides** its own earlier decisions. |
| `phases/NN-*/NN-RESEARCH.md` | Pre-planning architecture investigation. |
| `phases/NN-*/NN-0X-PLAN.md` | Executable plans with tasks, verification commands, `must_haves`. |
| `phases/NN-*/NN-0X-SUMMARY.md` | What actually happened, including deviations. Read these when something surprises you. |
| `phases/NN-*/NN-VALIDATION.md` / `NN-VERIFICATION.md` | Goal-backward verification per phase. |
| `phases/NN-*/deferred-items.md` | Explicitly punted work (phases 6, 9, 10, 12, 14, 16). |

### Conventions that matter

- **Atomic commits per task**, prefixed `feat(NN-0X):` / `fix(NN-0X):` / `docs(NN):`.
- **The phase baseline for a static sweep is the commit immediately before that
  phase's first commit — NOT `main`.** `main` is 329 commits behind this branch,
  so diffing against it misreports all merged work as violations. Past baselines:
  Phase 7 `44793da`, Phase 8 `e27bb8f`, Phase 9 `05344fc`, Phase 10 `c2d55b9`.
- **Validation plan last.** Each phase ends with a non-autonomous plan: a static
  constraint sweep plus a human walkthrough. This has caught a real bug in every
  phase it has run — don't skip it.
- **Non-autonomous plans mean a human acts.** Phase 17 has four of them (17-01,
  17-02, 17-05, 17-06). An agent prepares and records; it does not run the
  keyboard pass and it does not touch the shared DB.

### Hard-won lessons about parallel agents

`execute-phase` runs plans in parallel waves. Plans in the same wave are checked
for non-overlapping `files_modified` — **but that does not isolate them**, because
the git index is shared. In Phase 8 wave 3, a `git add` on the bracketed path
`app/interview/[type]/page.tsx` glob-matched a sibling agent's file (the brackets
are a shell/pathspec character class) and briefly absorbed its uncommitted work.

**This kept happening.** Phase 10 wave 3 hit it again — one agent's commit absorbed
five sibling files (recovered with `git reset HEAD~1`), and separately an agent
deleted a *sibling's untracked scratch file* during its own cleanup, which git
could not restore. Two rules that actually work:

1. Stage with literal, quoted paths and run `git show --name-only HEAD` after
   every commit. Never `-A`, never `.`, never a directory, never a glob.
2. **Never delete a file you did not create.** Untracked files are unrecoverable.

Also expect agent self-reports to be optimistic about *completion*. In Phase 10,
an executor's progress note implied it was at the verification stage when the two
features the plan existed to deliver had not been written at all — caught only by
grepping the actual diff. And in Phase 17's own planning, two plans were written
against a stale document and had to be thrown away. **Verify claims against the
tree and against a freshly-run command, not against the summary.**

---

## 7. Git state you are inheriting

- You are on **`feature/visual-analysis-expansion`**, which is **329 commits ahead
  of `main`** and fully pushed to `origin`. **There is no open PR for it.** All of
  Phases 6–16 live here and nothing is merged.
- Untracked and deliberately not committed: `.cursor/`, `.omc/`,
  `.planning/.omc/`, `.planning/config.json`, `scripts/_debug-pdf.ts` (a scratch
  file). Leave them or clean up your own only.
- Seven **dependabot PRs are open** (#11, #16, #17, #18, #19, #20, #23 — nodemailer,
  effect/prisma, babel, fast-xml-parser, brace-expansion, ws, browserslist). None
  have been triaged. A `prisma` bump in particular wants a deliberate look given
  the migration story in §3.
- Stale local branches you can ignore: `bug/latency`,
  `feature/interview-baseline`, `fix/interview-voice-guardrails`,
  `fix/prisma-migrate-on-build`, `fix/sso-edge-config-resilience`,
  `rework-first-draft`, `feat/review-plan`.

**`.planning/` is in git.** It used to be gitignored (`/.planning/*`), which is
why no planning doc was committed during Phases 6–8 — every agent correctly
treated "can't commit planning docs" as expected rather than as a failure. That
line is gone, so planning docs are now versioned and agents *should* commit them.
A little plan text still says "`.planning/` is gitignored" — stale, worth a
cleanup pass.

Nothing in `.planning/` contains credentials — the only connection string that
appears is the local, password-less
`postgresql://<user>@localhost:5432/leadership_avatar_dev`. Real secrets live in
`.env.local`, which is still ignored. Skim before you push anyway.

---

## 8. Suggested first moves

1. **Get running locally (§2)** and sign in as `alice.johnson@case.edu`. Confirm
   `npx prisma migrate status` says `leadership_avatar_dev` before anything else.
2. **Do one full interview end to end, camera ON** — dashboard → preset →
   customize → live session → report. ~10 minutes with the `early-career` preset,
   and it teaches you more than reading will. It exercises consent, the camera
   step, the live self-view and fold-away banner, and produces a report with real
   Visual and Vocal scores. **Watch the camera indicator go out when you press
   End** (§5).
3. **Then do one investor pitch-deck session with a PDF deck** — it is the newest
   and most intricate surface (slide gating, timer, negotiation panels). Use a PDF,
   not a PPTX (§5).
4. **Re-run the gates yourself** so you know they are green on your machine:
   `npx tsc --noEmit`, `npm run build`, and the `scripts/verify-*.ts` harnesses.
   Expect exactly one failure, `verify-deck-intake.ts` (§5).
5. **Read `STATE.md`'s top section and its Decisions log.** It is the accumulated
   "why" and it will stop you re-litigating settled choices.
6. **Skim `14-VALIDATION.md` and `14-15-SUMMARY.md`** — the most recent and most
   honest account of what actually works.

### Then pick up the work

Phases 17 and 18 are **independent and can run in parallel**. Both have committed
plans and no code.

- **`/gsd:execute-phase 17`** — v1.0 Close-Out (REQ-74–77, 7 plans). Bookkeeping,
  but four of its seven plans are **non-autonomous and need you personally**: the
  `vercel.json` migration-governance change, the document reconciliation and
  Production-secret confirmation, and the Phases 15/16 keyboard UAT. **This is the
  better first phase** — it is small, it closes the contradictions in §1.2 and §3,
  and you will learn the codebase's seams while doing it.
- **`/gsd:execute-phase 18`** — Avatar Disengagement & Walk-Out (REQ-78–86, 5
  plans). Real feature work, and it extends `lib/engine/termination.ts`. Three
  locked scope notes you must not re-litigate: disengagement is computed from
  observable signals and only **accelerated** (never replaced) by the avatar's
  self-report cue; it is **invisible** during the session (no meter, ever); and it
  **extends** Phase 13's `terminationPolicy`/`avatarEndFloor` rather than adding a
  parallel mechanism. `lib/pitch/deck-type.ts` currently sets
  `avatarEndFloor: null` and must gain a real floor.

Phase 19 (Deck-Led Pitch Family — four more deck-led modes sharing one deck
capability) **depends on Phase 18** and is roadmapped only; don't start it.

### Questions only Adam can answer

Flagging these so you know not to guess:

- The two **"undecided, left to a human"** items in §5 (report narrative citing
  raw figures; persona character strength).
- Whether **Gotenberg gets provisioned** for PPTX decks, or PDF-only is acceptable
  for now.
- Whether the **dependabot PRs** should be triaged before or after v1.1.
- Whether this branch should be **merged to `main`** — 329 unmerged commits is a
  lot of exposure, and §6's "baseline is not `main`" convention exists only because
  of it.
