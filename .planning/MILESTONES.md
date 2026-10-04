# Milestones

## v1.0 — Four Interaction Types on One Engine

**Shipped:** 2026-10-04
**Phases:** 1–16

Took the project from a single hardcoded resume interview to four interaction
types running on one parameterized engine, with real video/audio/body metrics and
an honest rubric-aligned report.

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Interview Registry & Prompts | — | 2026-09 (pre-roadmap) |
| 2 | Interviewer Catalog | — | 2026-09 (pre-roadmap) |
| 3 | Resume Ingestion | — | 2026-09 (pre-roadmap) |
| 4 | Interview Setup Flow | — | 2026-09 (pre-roadmap) |
| 5 | Live Session Shell | — | 2026-09 (pre-roadmap) |
| 6 | Evaluation & Student Report | 8/8 | 2026-09-21 |
| 7 | Interaction Dashboard | 7/7 | 2026-09-21 |
| 8 | Interview Customization | 8/8 | 2026-09-21 |
| 9 | Student-Authored Scenarios | 9/9 | 2026-09-21 |
| 10 | Video & Audio Metrics | 11/11 | 2026-09-22 |
| 11 | Cohort & Staff Teardown | 7/7 | 2026-09-23 |
| 12 | Embodied Visual Signals | 10/11 | 2026-10-04 |
| 13 | One-on-One Conversation Engine | 15/15 | 2026-10-04 * |
| 14 | Practice Pitches | 15/15 | 2026-10-04 |
| 15 | Difficult Conversations | 11/11 | 2026-10-04 * |
| 16 | Networking Practice | 11/11 | 2026-10-04 |

**Last phase number:** 16

**Carried into v1.1 (the `*` above):**
- Phase 13 never formally closed — REQ-67's shared Lightsail `CREATE TABLE` +
  backfill is human-run only and was acknowledged then deferred. REQ-66 stays
  unchecked until shared rows exist.
- REQ-63 (visible-context slice) is implemented in the engine but was never
  verified and checked off.
- Phases 15 and 16 completed under `skip_checkpoints`; their keyboard UAT is
  undischarged.
- Phase 12 closed at 10/11 plans — fidgeting was retired as unmeasurable, not deferred.

**Deferred items** are recorded per phase in
`.planning/phases/*/deferred-items.md`.

## v1.1 — Consequence & Deck Breadth (current)

**Started:** 2026-10-04
**Phases:** 17–19

Sourced from `.planning/phases/14-practice-pitches/deferred-items.md`. Closes out
the engine bookkeeping v1.0 left open, makes a session the student is losing
actually end, and widens the deck pitch from investor-negotiation-only into a
family of deck-led modes.

See `ROADMAP.md` and `REQUIREMENTS.md`.
