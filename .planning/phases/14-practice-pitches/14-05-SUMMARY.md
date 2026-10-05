---
phase: 14-practice-pitches
plan: 05
subsystem: session-state
tags: [prisma, migration, checkpoint, ratchet, time-budget, pitch-deck, REQ-67]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "InteractionReport model; startSession/checkpointSession/finishSession; REQ-67 local-only migrate discipline"
  - phase: 14-practice-pitches
    provides: "14-02 clampAdjustableBudget + PitchInputSnapshot; pitch InstanceConfig kinds"
provides:
  - "InteractionReport.slideHighWaterMark / slideReveals / timeBudgetSeconds / terminationAtSeconds (nullable)"
  - "prisma/migrations/20261004043007_add_pitch_session_columns — additive LOCAL-only"
  - "Server-authoritative reveal ratchet in checkpointSession"
  - "Clamped timeBudgetOverrideSeconds in startSession"
  - "authoredInWizard start path (interview-like write, not case-study S3)"
  - "14-MIGRATION-HANDOFF.md for shared-DB human deploy"
  - "scripts/verify-pitch-session-state.ts — ten assertion sections"
affects: [14-09-pitch-deck-registry, 14-11-visible-context-cursor, 14-12-deck-wizard, 14-13-deck-shell, 14-14-report-panels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client revealedSlideIndex is an input to Math.max(stored, Math.min(requested, slideCount-1)) — never written through"
    - "null slideHighWaterMark means nothing revealed yet (same for no-deck types and fresh deck sessions)"
    - "REQ-67: DATABASE_URL local override for every prisma command; shared deploy is human-only via handoff doc"

key-files:
  created:
    - prisma/migrations/20261004043007_add_pitch_session_columns/migration.sql
    - .planning/phases/14-practice-pitches/14-MIGRATION-HANDOFF.md
    - scripts/verify-pitch-session-state.ts
  modified:
    - prisma/schema.prisma
    - lib/engine/session.ts
    - lib/engine/registry.ts
    - app/api/practice/session/checkpoint/route.ts
    - app/api/practice/session/start/route.ts

key-decisions:
  - "pitch-deck → checkpointing: client-driven; pitch-elevator → none; case-study unchanged at none"
  - "Four narrow nullable columns on InteractionReport — not inside inputSnapshot (session-constant contract)"
  - "null means nothing revealed — never persist -1 as the empty mark"
  - "authoredInWizard types get interview-like startSession write so they do not fall into case-study S3 path"
  - "registerEngineTypeForTests stub for pitch-deck until 14-09 lands the real type record"

patterns-established:
  - "Ratchet + append-only slideReveals only when next > stored; non-finite/negative client values ignored"
  - "Budget: student proposes, server clamps via clampAdjustableBudget; null when type declares no budget"

requirements-completed: [P14-SC3, P14-SC5]

# Metrics
duration: 35min
completed: 2026-10-04
---

# Phase 14 Plan 05: Pitch Session State Summary

**Server-owned monotonic slide high-water mark, append-only reveal trail, and clamped session budget on InteractionReport — additive local migration only; shared DB human-handed.**

## Performance

- **Duration:** ~35 min active (+ overnight human-verify wait)
- **Started:** 2026-10-04T04:28:43Z
- **Completed:** 2026-10-04T14:58:50Z
- **Tasks:** 3
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- Four nullable columns on `InteractionReport` via one additive local migration (`20261004043007_add_pitch_session_columns`).
- `checkpointSession` ratchets `revealedSlideIndex` only for pitch-deck snapshots; interview clients cannot create a cursor; case-study still rejects checkpoints.
- `startSession` clamps `timeBudgetOverrideSeconds` into the type's adjustable range and persists `timeBudgetSeconds`.
- Human migration handoff written; shared database untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the four nullable columns and generate the additive migration against the LOCAL DB** - `a140c8c` (feat)
2. **Task 2: The server-authoritative reveal ratchet and the clamped session budget** - `cd9df96` (feat)
3. **Task 3: Prove the ratchet's negative cases and hand the migration to a human** - `92f2eda` (test) + human-verify

**Plan metadata:** (this commit)

## Human Verdict (Task 3 checkpoint:human-verify)

**Verdict:** `approved`

**Evidence the human provided (verbatim summary from orchestrator):**
- `npx tsx scripts/verify-pitch-session-state.ts` printed ALL PASS (all 10 sections, including load-bearing §3 backward nav and §5 clamp).
- Migration SQL confirmed additive-only (four ADD COLUMN).
- Interviews still work end-to-end.
- (They ran wrong CLI `npx migrate status` once — ignore; local prisma migration was already applied earlier.)

## Migration (real directory name)

`prisma/migrations/20261004043007_add_pitch_session_columns/`

(Plan suggested `20261010000000_…`; Prisma named `20261004043007_…` — recorded here for 14-11/14-13.)

SQL is four nullable `ADD COLUMN` only: `slideHighWaterMark`, `slideReveals`, `terminationAtSeconds`, `timeBudgetSeconds`. Zero DROP, zero NOT NULL, zero ALTER COLUMN.

## Session handler signatures (post-edit)

### `startSession`
Accepts optional `instance`, `timeBudgetOverrideSeconds` (and parallel-agent fields may also be present). After config resolve, persists `timeBudgetSeconds` from `clampAdjustableBudget`. `slideHighWaterMark` left **null** at start.

### `checkpointSession`
Accepts optional `revealedSlideIndex`. For pitch-deck `inputSnapshot` only:
`next = Math.max(stored ?? -1, Math.min(Math.trunc(requested), slideCount - 1))`.
Appends to `slideReveals` only when `next > (stored ?? -1)`. Non-finite / negative inputs ignored.

### `finishSession`
Accepts optional `terminationAtSeconds`; persists only when termination was ACCEPTED (rejected → both reason and timecode null).

## Null-means-nothing-revealed convention

`slideHighWaterMark === null` means the same thing for a type with no deck and a deck session that has not revealed a slide. Never persist `-1`. Plans 14-11 and 14-13 depend on this.

## Files Created/Modified

- `prisma/schema.prisma` — four nullable columns on `InteractionReport`
- `prisma/migrations/20261004043007_add_pitch_session_columns/migration.sql` — additive ALTER
- `.planning/phases/14-practice-pitches/14-MIGRATION-HANDOFF.md` — human shared-DB deploy
- `lib/engine/session.ts` — ratchet, budget clamp, authoredInWizard start path
- `lib/engine/registry.ts` — `registerEngineTypeForTests` (forward-ref until 14-09)
- `app/api/practice/session/{start,checkpoint}/route.ts` — pass-through only
- `scripts/verify-pitch-session-state.ts` — ten sections against local DB

## Decisions Made

- **pitch-deck** gets `checkpointing: "client-driven"`; **pitch-elevator** stays `"none"`; **case-study** untouched at `"none"`.
- Cursor lives in columns, not `inputSnapshot`.
- authoredInWizard start is interview-shaped (Rule 3) so pitch types do not hit case-study S3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] authoredInWizard start path**
- **Found during:** Task 2 / Task 3 verify
- **Issue:** Types with `instance.required + authoredInWizard` fell into the case-study S3 start path; pitch-deck verify (and pitch-elevator) could not start.
- **Fix:** Third start branch — one Prisma write, no S3; builds `PitchInputSnapshot` from instance when present.
- **Files modified:** `lib/engine/session.ts`
- **Commit:** `cd9df96`

**2. [Rule 3 - Blocking] registerEngineTypeForTests for pitch-deck stub**
- **Found during:** Task 3
- **Issue:** 14-09 (which registers real `pitch-deck`) depends on 14-05; verify needed a type with adjustableRangeSeconds + client-driven checkpointing.
- **Fix:** Test-only registry helper + stub inside `verify-pitch-session-state.ts`.
- **Files modified:** `lib/engine/registry.ts`, `scripts/verify-pitch-session-state.ts`
- **Commit:** `cd9df96` / `92f2eda`

## REQ-67 note

No agent command used the shared `DATABASE_URL`. Local only via
`DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev"`.
Shared apply is `npx prisma migrate deploy` by a human per `14-MIGRATION-HANDOFF.md`, after Phase 13 migrations.

## Next Steps

- 14-09 registers the real `pitch-deck` type (replace verify stub).
- 14-11 / 14-13 consume `slideHighWaterMark` + ratchet for live visible context and shell checkpoints.

## Self-Check: PASSED

- Files: schema, migration SQL, handoff, verify script, SUMMARY, session.ts — all FOUND
- Commits: a140c8c, cd9df96, 92f2eda — all FOUND
