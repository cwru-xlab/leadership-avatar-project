# CaseBridge Interview Practice — Leadership Avatar

## What This Is

A self-directed conversation-practice tool inside the CaseBridge leadership
platform. A student picks a counterpart, brings in their own context (a resume, a
slide deck, a described person, an authored scenario), holds a live avatar
conversation grounded in that context, and receives a rubric-aligned performance
report afterward. Four interaction types run on one engine: interview practice,
practice pitches, difficult conversations and networking practice.

## Core Value

A student gets a realistic, consequential conversation and an honest report on how
they handled it — where the avatar's reactions are earned by what the student
actually did, not scripted.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Live avatar interview grounded in an uploaded resume — Phases 1–5
- ✓ Durable transcripts, background evaluation, rubric-aligned student report — Phase 6
- ✓ Self-directed interaction dashboard — Phase 7
- ✓ Interview customization + interviewer personality — Phase 8
- ✓ Student-authored scenarios with private-until-published ownership — Phase 9
- ✓ Real video and audio metrics feeding the Visual and Vocal rubric rows — Phase 10
- ✓ Cohort/staff oversight wrapper removed — Phase 11
- ✓ Embodied visual signals (arms, posture, visible phone) reported honestly — Phase 12
- ✓ One-on-one conversation engine: a type is a config record, not a code branch — Phase 13
- ✓ Practice Pitches: elevator pitch + investor deck session with live slide gating — Phase 14
- ✓ Difficult Conversations: seeded catalog + authored publishable scenarios — Phase 15
- ✓ Networking Practice: brought-in persona or default character — Phase 16

### Active

<!-- Current scope: milestone v1.1. See REQUIREMENTS.md for REQ IDs. -->

- [ ] Phase 13 close-out: shared-DB migration + backfill run, REQ-63 verified, deferred keyboard UAT discharged
- [ ] Avatar disengagement and walk-out: a session the student is losing can actually end
- [ ] Deck-led pitch family: funding request, product pitch, deck-led talk and a general deck pitch

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Google Slides deck import — permanently cut in Phase 14; students export to PDF. No Drive OAuth scope, no stored Drive tokens, no Drive API read.
- Fidgeting as a measured signal — retired in Phase 12 as unmeasurable with the available sensors.
- Cohort assignment, staff monitoring and report visibility overrides — torn out in Phase 11; this is an individual tool, not a managed course.
- Publishing a networking persona — enforced by absence in Phase 16 (no `published` field, no publish route), because a persona describes a real third party.
- A live engagement meter in the session shell — rejected for v1.1; it turns practice into a game against a gauge instead of a conversation.

## Context

- **Stack:** Next.js (App Router) on Vercel, Prisma + Postgres, S3 for private
  artifacts, HeyGen/LiveAvatar for the avatar stream, OpenAI for turns and
  evaluation.
- **The engine is the load-bearing abstraction.** Phase 13 collapsed the per-type
  route trees into exactly one session-start, checkpoint, finish, report-GET and
  evaluation runner. Adding an interaction type must touch no engine module, no
  route, no evaluator and no report page (REQ-60). v1.1's deck modes are the first
  real test of that claim since the engine shipped.
- **Two databases, easily confused.** `DATABASE_URL` in `.env` points at the shared
  AWS Lightsail Postgres; local development runs against `leadership_avatar_dev`.
  `.env` is a symlink to `.env.local`, so the local DB must be passed inline. All
  shared-DB migrations are now applied, which removed the error that used to
  announce a wrong connection — see `HANDOFF.md §1.1`.
- **Phase 13 has never formally closed.** REQ-67 reserves the shared-DB
  `CREATE TABLE` + backfill for a human; the human acknowledged and deferred it.
  No agent may apply it.
- **Deferred items are tracked per phase** in `.planning/phases/*/deferred-items.md`.
  v1.1 is sourced from Phase 14's file.

## Constraints

- **Tech stack**: Deck intake accepts PDF and PPTX only — no Slides, no Drive integration.
- **Dependencies**: The assembled system prompt must stay session-constant so the OpenAI prefix cache hits (REQ-20/REQ-73). Per-turn state belongs in the tail block, never the system prompt.
- **Security**: No frame, landmark array or media blob leaves the browser or outlives the tick that produced it (REQ-38/REQ-58). Metrics reach the server as derived scalars.
- **Security**: Report ownership is enforced from the authenticated JWT user; a non-owner gets a 404 identical to a nonexistent report. No staff or admin override exists (REQ-09).
- **Dependencies**: No agent applies a migration to the shared Lightsail database. SQL is handed to a human (`HANDOFF.md §3` precedent).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One engine, types as config records (Phase 13) | A new interaction type was costing a full route tree, evaluator and report page | ✓ Good — Phases 14–16 each shipped as config + prompts |
| Google Slides cut permanently (Phase 14) | Drive OAuth scope, token storage and API read were the largest single piece of the phase, for one import path | ✓ Good |
| Never-publishable networking personas, enforced by absence (Phase 16) | A persona describes a real third party; a `published` field invites parity with `CaseStudy` | ✓ Good — guarded by a surface-count script |
| Temperature derived from signals, gated by avatar self-report (v1.1) | Signals alone can't see "they got bored of you"; self-report alone lets the role-playing model grade its own patience | — Pending |
| Temperature invisible during the session (v1.1) | A visible meter makes the student optimize the gauge instead of the conversation; the walk-out should land as a real consequence | — Pending |
| One TYPE record per deck mode (v1.1) | Honors REQ-60 and lets each mode carry its own rubric and outcome shape instead of branching inside one record | — Pending |

---
*Last updated: 2026-10-05 at the start of milestone v1.1*
