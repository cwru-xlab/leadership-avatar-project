# Handoff — Leadership Avatar / Interview Practice

**Written:** 2026-09-21
**Branch:** `feature/interview-baseline`
**State at handoff:** Phases 1–8 complete and verified. Phase 9 is next and not started.

Read this file first, then `STATE.md`, then `ROADMAP.md`. Everything else in
`.planning/` is per-phase detail you can read on demand.

---

## 1. Read this before you run anything

Three things will bite you in the first hour if you don't know them.

### 1.1 There are two databases and they are easy to confuse

- **Shared team DB** — an AWS Lightsail Postgres. This is what `DATABASE_URL`
  in `.env` points at.
- **Local dev DB** — `leadership_avatar_dev` on local Postgres 17. This is where
  all Phase 6 and Phase 8 development and validation happened.

**`.env` is a SYMLINK to `.env.local`.** They are one file. You cannot give them
different values. So you cannot "just set a different DATABASE_URL for local" by
editing one of them — pass it inline instead:

```bash
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npm run dev
```

If you start the dev server without that prefix, you are running the app against
the **shared** database.

### 1.2 NEVER run `npm run setup`

`scripts/setup.mjs` runs `npx prisma migrate deploy` (around line 211) against
whatever `DATABASE_URL` resolves to — i.e. the **shared** database. Two
migrations have deliberately NOT been applied there yet (see §3). Running setup
casually is how they get applied by accident.

### 1.3 Two build checks are broken repo-wide, and always were

- `next build` fails on the `/about` prerender (missing `EDGE_CONFIG`).
- `eslint` fails on **any** file: `ESLint configuration in » plugin:@next/next/recommended
  is invalid: Unexpected top-level property "name"`. Verify this yourself against an
  untouched file such as `lib/languages.ts` before blaming your change.

**`npx tsc --noEmit` is the authoritative check** in this project and is expected
to be clean. Every phase used it as the gate.

---

## 2. Getting running locally

```bash
# 1. deps
npm install

# 2. local Postgres (Homebrew)
brew services start postgresql@17
createdb leadership_avatar_dev

# 3. apply ALL migrations to your LOCAL db (never the shared one)
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npx prisma migrate deploy

# 4. generate the client
npx prisma generate

# 5. seed test users
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npx prisma db seed

# 6. run
DATABASE_URL="postgresql://<youruser>@localhost:5432/leadership_avatar_dev" npm run dev
```

**Seeded logins** (from `prisma/seed.ts`):

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin123` | admin |
| `professor.smith@case.edu`, `professor.chen@case.edu` | `prof123` | staff |
| `alice.johnson@case.edu`, `bob.williams@case.edu`, `carol.davis@case.edu`, `david.lee@case.edu`, `emma.wilson@case.edu`, `student@case.edu` | `student123` | student |

Multiple students exist on purpose — owner-only report isolation is tested by
logging in as one and requesting another's report (expect a 404, never a 403).
`alice.johnson` and `bob.williams` are the pair used in the Phase 7 and Phase 8
walkthroughs.

These are local seed credentials for a local throwaway database, already in
`prisma/seed.ts` in the repo. They are not secrets and must never be reused for
anything shared.

**A suggested convenience script** (repeatedly noted as wanted, never added):

```json
"dev:local": "DATABASE_URL=\"postgresql://<youruser>@localhost:5432/leadership_avatar_dev\" next dev --turbopack"
```

### Environment variables the code reads

Core (app will not work without these): `DATABASE_URL`, `JWT_SECRET`,
`OPENAI_API_KEY`, `HEYGEN_API_KEY`, `NEXT_PUBLIC_LIVEAVATAR_API_URL`,
`NEXT_PUBLIC_BASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `AWS_S3_BUCKET_NAME`.

Optional / feature-specific: `HEYGEN_AVATAR_CONTEXT_ID`, `INTERVIEW_EVAL_MODEL`,
`INTERVIEW_PERSONA_MODEL`, `ENABLE_CHAT_COMPRESSION`, `PINECONE_API_KEY`,
`PINECONE_INDEX_NAME`, `EMAIL_PROVIDER`, `SMTP_*`, `BENCH_*` (bench script only).

Get the real values from the existing `.env.local` — they are not in git.

---

## 3. Migrations — the actual handoff item

Five migrations exist in `prisma/migrations/`:

| Migration | Phase | Applied to shared DB? |
|---|---|---|
| `20260228044702_init` | pre-GSD | yes |
| `20260302180438_add_student_dashboard_fields` | pre-GSD | yes |
| `20260916165041_add_user_and_auth_models` | pre-GSD | yes |
| `20260920034855_add_interview_report` | 6 | **NO — needs team review** |
| `20260921141342_add_interview_customization` | 8 | **NO — needs team review** |

The last two were applied to the **local dev DB only**, by design, so the team
could review the SQL before it touched shared data. Both are additive:

- `add_interview_report` — creates the `InterviewReport` table (relation to `User`).
- `add_interview_customization` — adds **six nullable columns** to `InterviewReport`
  (industry, roleTitle, difficulty, targetMinutes, targetQuestionCount,
  interviewerPersona). Zero `NOT NULL`, so existing rows are unaffected.

**When the team is ready to apply them**, the intended path is a deliberate
`prisma migrate deploy` against the shared DB — decided by a human, not run from
a script or an agent. Pre-Phase-8 rows will simply have nulls and the code
already handles that everywhere it reads them.

---

## 4. What the product is now

A student signs in and lands on an **interaction dashboard** (`/`), not on
assigned cases. From there:

- **Practice Interviews** → `/interview` (preset picker) → two-step wizard
  (Interviewer → Resume) → live avatar interview → evaluated report.
- **Case Studies** → `/case-play` (published cases only).
- Three more interaction types are registered as coming-soon tiles.
- **My Reports** → `/reports`. **Settings** → `/settings`.

The cohort/assignment/staff-oversight model is being *removed* — students are
fully self-directed. That teardown is Phase 11 and is not done yet.

### Architecture worth knowing before you change anything

- **`lib/interview/types.ts`** — the interview preset registry. Four presets
  (`general`, `technical`, `consulting`, `early-career`). Adding a variant is a
  record here, never a new page.
- **`lib/interview/prompts.ts`** — assembles the system prompt. **Every field it
  reads is session-constant on purpose**, so the OpenAI prefix cache hits.
  Anything that varies per turn goes in `buildProgressBlock`'s tail block.
  Treat this file as load-bearing; several phases required it to stay diff-empty.
- **`lib/interview/customization.ts`** — `resolveInterviewType(slug, customization)`.
  Pure and deterministic. Client-supplied customization is **re-validated
  server-side** at both prompt-assembly call sites (`session/start`, chat route),
  falling back silently to preset defaults for anything not in the curated lists.
  This is what stops a hand-crafted request injecting prompt content.
- **`lib/interactions/`** — the dashboard's interaction-type registry. It must
  **not** import from `lib/interview` (a deliberate Phase 7 boundary, enforced by
  a static check).
- **Reports are owner-only.** Cross-user access returns **404, never 403**.
- **Visual and Vocal rubric scores are hardcoded null** in validation code, not
  just discouraged by prompt. They stay null until Phase 10 builds a real
  video/audio pipeline.

---

## 5. Where the bodies are buried

Known, accepted, and written down — not bugs you just found.

| Item | Detail | Owner |
|---|---|---|
| Logged-out join-by-code is broken | `app/join/[accessCode]/page.tsx` writes `pendingCohortJoin` to localStorage, but its only consumer (`/student-cases`) was deleted in 07-06, and `login/page.tsx` never reads `returnTo`. Logged-in join still works. | Phase 11 |
| Unauthenticated API calls 307 instead of 401 | Middleware redirects to `/login` rather than returning JSON 401, on interview report endpoints. Pre-existing since Phase 6. | deferred |
| `/api/case/list` is enumerable | The unfiltered default is reachable by any authenticated user; `publishedOnly` is opt-in. `published` gates **discovery, not access** — an unpublished case still plays by direct URL (deliberate, for staff preview). | deliberate |
| Per-case avatar-minute limits dropped | Consequence of removing cohorts from the student path. | accepted |
| eslint + `next build` broken | See §1.3. Pre-existing, repo-wide. | unowned |
| Stray sibling `package-lock.json` | Noted in 06-08. | trivial |
| Persona character strength | Phase 8's pasted-persona now names itself and introduces itself in character, but the directive lives inside the persona string. If it still feels thin over long sessions, the next lever is reinforcing it inside `lib/interview/prompts.ts` — which means deliberately relaxing that file's diff-empty constraint. **Undecided, deliberately left to a human.** | open |
| "CaseBridge" → "Leadership Avatar" rename | A partial rename sweep is sitting **uncommitted** in the working tree (6 files, one line each). It is Adam's in-progress work, untouched by every agent. Either finish it or stash it — don't let it drift. | open |

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
| `STATE.md` | Current position, environment notes, the running **Decisions** log, per-plan progress. The single most useful file. |
| `ROADMAP.md` | All 11 phases, goals, success criteria, plan lists, progress table. |
| `REQUIREMENTS.md` | REQ-01…REQ-24 with completion notes. Phases 1–5 predate requirement tracking and have no IDs. |
| `phases/NN-*/NN-CONTEXT.md` | User design decisions for that phase. **Locked** — agents must honor, not revisit. |
| `phases/NN-*/NN-RESEARCH.md` | Pre-planning architecture investigation. |
| `phases/NN-*/NN-0X-PLAN.md` | Executable plans with tasks, verification commands, `must_haves`. |
| `phases/NN-*/NN-0X-SUMMARY.md` | What actually happened, including deviations. Read these when something surprises you. |
| `phases/NN-*/NN-VERIFICATION.md` | Goal-backward verification report per phase. |

### Conventions that matter

- **Atomic commits per task**, prefixed `feat(NN-0X):` / `fix(NN-0X):`.
- **The phase baseline for a static sweep is the commit immediately before that
  phase's first commit — NOT `main`.** `main` predates Phases 1–7, so diffing
  against it misreports already-merged work as violations. Phase 7's baseline was
  `44793da`; Phase 8's was `e27bb8f`.
- **Validation plan last.** Each phase ends with a non-autonomous plan: a static
  constraint sweep plus a human walkthrough. This has caught a real bug in every
  phase it has run — don't skip it.

### One hard-won lesson about parallel agents

`execute-phase` runs plans in parallel waves. Plans in the same wave are checked
for non-overlapping `files_modified` — **but that does not isolate them**, because
the git index is shared. In Phase 8 wave 3, a `git add` on the bracketed path
`app/interview/[type]/page.tsx` glob-matched a sibling agent's file (the brackets
are a shell/pathspec character class) and briefly absorbed its uncommitted work.
It was caught and reset with nothing lost, but: **use literal pathspecs, and check
`git diff --cached --name-only` before committing.**

---

## 7. `.planning/` is now in git

It used to be gitignored (`/.planning/*`), which is why no planning doc was ever
committed during Phases 6–8 — every agent correctly treated "can't commit planning
docs" as expected rather than as a failure.

That line has now been removed from `.gitignore` so this handoff can be pushed.
**Consequence going forward:** planning docs are now versioned, so agents *can*
and *should* commit them. Some plan text still says "`.planning/` is gitignored" —
that is now stale. Worth a cleanup pass in STATE.md's Environment Notes.

Nothing in `.planning/` contains credentials — the only connection string that
appears is the local, password-less `postgresql://<user>@localhost:5432/leadership_avatar_dev`.
Real secrets live in `.env.local`, which is still ignored. Worth a skim before you
push anyway.

---

## 8. Suggested first moves

1. Get running locally (§2) and sign in as `alice.johnson@case.edu`.
2. Do one full interview end to end — dashboard → preset → customize → live
   session → report. It's ~10 minutes with the `early-career` preset and it
   teaches you more than reading will.
3. Read `STATE.md`'s **Decisions** log top to bottom. It's the accumulated "why"
   and it will stop you re-litigating settled choices.
4. Skim `08-08-SUMMARY.md` and `07-07-SUMMARY.md` — the two validation summaries
   are the most honest account of what actually works.
5. Then pick up Phase 9 with `/gsd:discuss-phase 9`.

**Phase 9 (Student-Authored Scenarios)** — students create their own practice
scenarios rather than only consuming admin-authored cases. Success criteria: a
student can author a scenario and immediately practice against it, and their
scenarios are private to them unless deliberately shared. No REQ IDs exist for it
yet; `discuss-phase` is where they get generated (REQ-25 onward).
