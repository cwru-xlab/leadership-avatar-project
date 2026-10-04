---
phase: 16-networking-practice
plan: 01
subsystem: api
tags: [networking, openai, persona-generation, ephemeral, phase-8-distill]

requires:
  - phase: 08-interview-persona
    provides: "/api/interview/persona/distill — existing Phase 8 distiller reused unchanged"
provides:
  - "lib/networking/person-generation.ts — hint→editable fictional person description"
  - "POST /api/networking/persona/generate — authenticated, no-store, ephemeral"
  - "scripts/spike-networking-person-generation.ts — generate→distill proof against live Phase 8"
affects:
  - 16-02 (paste attestation / bring-your-own path)
  - 16-08 (wizard shows generated text editable by default)
  - 16-05 (sole distill-route touch later; this plan left it byte-identical)

tech-stack:
  added: []
  patterns:
    - "Separate generation model call from Phase 8 distill; output is description prose not persona sentence"
    - "Ephemeral retention: hint/description used for one non-streaming call; log lengths only"
    - "Dynamic await import('openai') with 20s timeout / maxRetries 0 (distill sibling idiom)"

key-files:
  created:
    - lib/networking/person-generation.ts
    - app/api/networking/persona/generate/route.ts
    - scripts/spike-networking-person-generation.ts
  modified: []

key-decisions:
  - "Generation is a SEPARATE model call with PERSON_GENERATION_SYSTEM_PROMPT; never reuses PERSONA_DISTILL_SYSTEM_PROMPT"
  - "MAX_HINT_LENGTH=300, MAX_GENERATED_DESCRIPTION_LENGTH=700 (far inside distill MAX_PROFILE_TEXT_LENGTH=4000)"
  - "Route intentionally NOT attestation-gated (fictional person; decision 8 scopes gate to pasted third-party text)"
  - "Spike uses HTTP POST to live distill route because distillPersona is private today"
  - "This plan ran ungated by Phase 13 and touched no engine file"

patterns-established:
  - "lib/networking/* for networking-type helpers outside the engine"
  - "Spike scripts under scripts/spike-* make real model calls; not CI"

requirements-completed: [P16-SC1]

duration: 4min
completed: 2026-10-04
---

# Phase 16 Plan 01: Person Generation Path Summary

**Hint→editable fictional person description via a dedicated OpenAI call and route, proven generate→distill against the unchanged Phase 8 `/api/interview/persona/distill` endpoint before any Phase 13 engine work.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-04T04:13:37Z
- **Completed:** 2026-10-04T04:17:13Z
- **Tasks:** 3/3 (Task 3 checkpoint skipped per `parallelization.skip_checkpoints`)
- **Files modified:** 3 created

## Accomplishments

- Shipped `generatePersonDescription` with its own system prompt, length caps, cleanup helper, and explicit RETENTION contract.
- Exposed `POST /api/networking/persona/generate` as an authenticated, no-store, non-persisting shell over that lib.
- Proved generate → distill end-to-end against the live Phase 8 route with three seniority/field hints; Phase 8 distill route remains byte-identical.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the person-generation prompt and model call** — `8018172` (feat)
2. **Task 2: Expose authenticated route and script generate-to-distill proof** — `d1d604f` (feat)
3. **Task 3: Judge generated people and distilled personas** — checkpoint skipped (`parallelization.skip_checkpoints`); automated spike evidence below (no separate commit)

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `lib/networking/person-generation.ts` — prompt, caps, cleanup, `generatePersonDescription`
- `app/api/networking/persona/generate/route.ts` — auth + validation shell; returns `{ description }`
- `scripts/spike-networking-person-generation.ts` — live generate→distill spike (not CI)

## Final generation prompt (verbatim)

```
You invent ONE plausible, fictional professional person for a networking role-play practice session, consistent with the student's rough hint.

Give them:
- a full name
- an employer described generically (an invented company name is fine; a real, recognisable company name is not)
- a seniority / title
- a field or domain
- a few years-in detail
- a manner or conversational style

Write 2–4 sentences of third-person narrative prose in the register of a LinkedIn "About" blurb. Output PROSE ONLY: no markdown, no bullet lists, no headings, no preamble such as "Here is" or "Sure". Never claim to describe a real, identifiable individual. Never produce a second-person role-play instruction (that is a different system downstream). Never begin with "You are".

Return only the prose description.
```

No prompt wording revisions applied (checkpoint auto-skipped; automated judgement found all three triples usable — see below). Before/after: none.

## Spike evidence (Task 3 checkpoint skipped)

**checkpoint skipped (parallelization.skip_checkpoints); automated evidence below**

Invocation:

```bash
npx tsx --env-file=.env.local scripts/spike-networking-person-generation.ts
```

Exit code: **0**. Three complete hint / description / persona triples printed.

### Triple 1 — VP marketing (busy, short on time)

- **HINT:** a busy VP of marketing at a mid-size CPG company, friendly but short on time
- **DESCRIPTION (560):** Jordan Ellis is Vice President of Marketing at Horizon Goods, a mid-sized consumer packaged goods firm focused on innovative household essentials. With over twelve years in product marketing and brand strategy, Jordan is known for driving rapid growth while fostering a culture of collaboration. Colleagues value Jordan’s approachable demeanor and candid feedback, though face-to-face time is rare due to a demanding schedule. Jordan believes in efficient communication and actionable insights, always looking for fresh ideas that can make a measurable impact.
- **PERSONA (501):** Jordan Ellis, Vice President of Marketing at Horizon Goods, a mid-sized consumer packaged goods firm focused on innovative household essentials, with over twelve years in product marketing and brand strategy. You are known for driving rapid growth through collaboration, value efficient communication, and seek actionable insights and fresh ideas that make a real difference. You introduce yourself as Jordan Ellis at the start of the interview and maintain your approachable, candid style throughout.
- **DISPLAY NAME:** Jordan Ellis

### Triple 2 — Technical recruiter

- **HINT:** a technical recruiter who screens a hundred engineers a month
- **DESCRIPTION (650):** Priya Das is a Senior Technical Recruiter at NexaTalent Solutions, a boutique agency specializing in software engineering placements for high-growth startups. With over six years of hands-on recruiting experience, Priya has honed a keen eye for technical talent, routinely screening over a hundred engineering candidates each month to connect clients with top-tier professionals. Her approach is friendly and conversational, making candidates feel at ease while skillfully assessing both technical aptitude and cultural fit. Priya is passionate about building diverse teams and is known for her transparent, insightful feedback in the hiring process.
- **PERSONA (502):** Priya Das, a Senior Technical Recruiter at NexaTalent Solutions with over six years of hands-on recruiting experience specializing in software engineering placements for high-growth startups, known for her friendly and conversational interview style, keen technical evaluation, commitment to diversity, and transparent, insightful feedback. You introduce yourself as Priya Das when the interview opens, and you stay recognisably her — her expertise, her values, her manner — for the whole conversation.
- **DISPLAY NAME:** Priya Das

### Triple 3 — Peer data engineer

- **HINT:** a peer-level data engineer two years out of school
- **DESCRIPTION (581):** Jordan Elwood is a Data Engineer at Infinitas Insights, a mid-sized analytics consultancy specializing in retail data solutions. With just over two years of post-graduation experience, Jordan works across client-facing projects, building and optimizing robust ETL pipelines and supporting data-driven decision-making. Known for a collaborative, inquisitive approach, Jordan thrives in agile teams and enjoys digging into new technologies and data challenges alongside colleagues. Jordan is especially interested in scalable architecture and practical machine learning applications.
- **PERSONA (499):** Jordan Elwood, a Data Engineer at Infinitas Insights with just over two years of post-graduation experience, who builds and optimizes robust ETL pipelines for retail data solutions and enjoys collaborating on data challenges in agile teams. You introduce yourself as Jordan Elwood when the interview opens, and you stay recognisably them — their early-career focus, their hands-on curiosity with scalable architecture and machine learning, and their collaborative style — for the whole conversation.
- **DISPLAY NAME:** Jordan Elwood

### Automated human-verify checklist (auto-approved)

1. **Reads as practice partners, not job postings?** Mostly yes. Triple 2 is the softest (brochure-ish “passionate about building diverse teams”) but still has name, employer, seniority, field, manner — usable as wizard default text.
2. **No real company / recognisable individual?** Yes — Horizon Goods, NexaTalent Solutions, Infinitas Insights are invented.
3. **Distilled personas continue “You are playing the role of: ”?** Yes — each opens with a noun phrase / name and includes the in-character introduction directive.
4. **Least-liked (for future wording if a human revisits):** Triple 2 — slightly recruiter-brochure tone; optional later prompt nudge toward conversational manner over hiring-process marketing.
5. **Ungated-by-design confirmed:** route accepts a hint with no attestation body field; deliberate per decision 8 (fictional generation). Paste-path gate remains 16-02’s job.

## Decisions Made

- Followed plan as specified: separate generation call, ephemeral retention, no distill-route edits, no engine files.
- Spike defaults to HTTP distill + optional `SPIKE_AUTH_COOKIE`, with automatic `student@case.edu` login for local `next dev`.
- Optional model override via `NETWORKING_PERSON_GENERATION_MODEL` (defaults to `gpt-4.1`).

## Deviations from Plan

None - plan executed exactly as written.

### Notes (not deviations)

- Plan verify expected unauthenticated `curl` → **401**; middleware redirects missing/invalid cookies to `/login` with **307** for this path (same behavior as `/api/interview/persona/distill`). With a valid cookie and empty/`{}` body the route correctly returns **400** `{ error: "hint is required" }`. Authenticated happy-path generate returns **200** `{ description }`.
- Repo-wide `tsc --noEmit` still reports pre-existing errors in unrelated files (`lib/deck/pdf-extract.ts`, `scripts/verify-engine-primitives.ts`); plan-scoped files have no tsc errors. ESLint on `lib/networking` / `app/api/networking` exits 0 (route inherits the same `no-console` **warnings** as the Phase 8 distill route).

## Issues Encountered

None blocking. Parallel branch already had unrelated dirty files (`lib/engine/*`, etc.); left untouched.

## User Setup Required

None - uses existing `OPENAI_API_KEY` / `DATABASE_URL` from `.env.local`. Spike needs `npm run dev` on :3000.

## Next Phase Readiness

- Generation path ready for wizard wiring (16-08) and for the paste attestation path (16-02) which must remain separate.
- Phase 8 distill route untouched — 16-05 still owns any additive distill refactor.
- **This is the one Phase 16 plan that ran ungated by Phase 13**; remaining Phase 16 plans that need engine TYPE/INSTANCE seams stay gated.
- Deferred (out of this plan’s file list): adding `/api/networking` to `STUDENT_ROUTES` in `middleware.ts` for explicit student-route parity with `/api/interview` (authenticated fallthrough already works today).

## Self-Check: PASSED

- FOUND: `lib/networking/person-generation.ts`
- FOUND: `app/api/networking/persona/generate/route.ts`
- FOUND: `scripts/spike-networking-person-generation.ts`
- FOUND: commit `8018172`
- FOUND: commit `d1d604f`
- FOUND: spike exit 0 with three triples
- FOUND: no `PERSONA_DISTILL_SYSTEM_PROMPT` under `lib/networking` / `app/api/networking`
- FOUND: `git diff --stat app/api/interview/persona/distill/route.ts` empty

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
